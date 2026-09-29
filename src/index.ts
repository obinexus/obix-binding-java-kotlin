/**
 * OBIX Java/Kotlin Binding
 * Android native, enterprise backend
 * Connects native FFI/polyglot bridge to JVM runtime
 */

export type SchemaMode = 'monoglot' | 'polyglot' | 'hybrid';

export interface InvocationEnvelope {
  functionId: string;
  args: unknown[];
  metadata: {
    schemaMode: SchemaMode;
    binding: string;
    timestampMs: number;
    ffiPath: string;
  };
}

export interface BindingInvokeError {
  code: 'NOT_INITIALIZED' | 'MISSING_SYMBOL' | 'INVOCATION_FAILED';
  message: string;
  envelope: InvocationEnvelope;
  cause?: unknown;
}

export interface BindingAbiInvoker {
  invoke(envelopeJson: string): unknown | Promise<unknown>;
}

function normalizeFunctionIdentifier(fn: string | object): string | undefined {
  if (typeof fn === 'string' && fn.trim()) return fn;
  if (fn && typeof fn === 'object') {
    const descriptor = fn as { functionId?: string; id?: string; name?: string };
    return descriptor.functionId ?? descriptor.id ?? descriptor.name;
  }
  return undefined;
}

/**
 * FFI descriptor for Java/Kotlin runtime
 * Defines how Java/Kotlin interops with the native bridge
 */
export interface JavaKotlinFFIDescriptor {
  ffiPath: string;
  javaVersion: string;
  jniEnabled: boolean;
  jniLibPath?: string;
  kotlinEnabled: boolean;
  androidSdkLevel?: number;
}

/**
 * Configuration for Java/Kotlin binding
 * Specifies how libnativebridge connects to JVM runtime
 */
export interface JavaKotlinBindingConfig {
  ffiPath: string;
  javaVersion?: string;
  schemaMode: SchemaMode;
  memoryModel: 'gc' | 'manual' | 'hybrid';
  jniEnabled?: boolean;
  jniLibPath?: string;
  kotlinEnabled?: boolean;
  androidTarget?: boolean;
  androidSdkLevel?: number;
  classpath?: string[];
  jvmOptions?: string[];
  heapSizeMaxMb?: number;
  ffiDescriptor?: JavaKotlinFFIDescriptor;
}

/**
 * Bridge interface for Java/Kotlin runtime
 * Methods to invoke polyglot functions and manage runtime state
 */
export interface JavaKotlinBindingBridge {
  /**
   * Initialize the binding and connect to the native bridge
   */
  initialize(): Promise<void>;

  /**
   * Invoke a polyglot function through the native bridge
   * @param fn Function name or descriptor
   * @param args Arguments to pass to function
   * @returns Result from polyglot function
   */
  invoke(fn: string | object, args: unknown[]): Promise<unknown>;

  /**
   * Clean up resources and disconnect from the native bridge
   */
  destroy(): Promise<void>;

  /**
   * Get current memory usage of the binding
   * @returns Memory usage statistics
   */
  getMemoryUsage(): {
    heapUsedBytes: number;
    heapMaxBytes: number;
    nonHeapBytes: number;
    objectCount: number;
  };

  /**
   * Get schema mode of current binding
   */
  getSchemaMode(): SchemaMode;

  /**
   * Check if binding is initialized and ready
   */
  isInitialized(): boolean;

  /**
   * Load a Java class and get a proxy for it
   */
  loadClass(className: string): Promise<object>;

  /**
   * Trigger JVM garbage collection
   */
  forceGarbageCollection(): Promise<void>;

  /**
   * Create a thread pool for executing tasks
   */
  createThreadPool(poolSize: number): Promise<string>;
}

/**
 * C ABI contract exported by the Kotlin/Native shared library.
 * Symbols match what Kotlin/Native exposes via @CName annotations.
 */
interface NativeFfiLib {
  obix_jk_invoke(envelopeJson: string): string;
  obix_jk_memory_usage(): string;
  obix_jk_gc(): void;
  obix_jk_load_class(className: string): string;
  obix_jk_create_thread_pool(poolSize: number): string;
  obix_jk_free(ptr: unknown): void;
}

/**
 * Create a Java/Kotlin binding to the native bridge
 * @param config Configuration for the binding
 * @returns Initialized bridge for invoking polyglot functions
 */
export function createJavaKotlinBinding(
  config: JavaKotlinBindingConfig
): JavaKotlinBindingBridge {
  let initialized = false;
  let ffiLib: NativeFfiLib | null = null;
  let installedAbiInvoker = false;
  const abiBindingName = 'java-kotlin';

  return {
    async initialize(): Promise<void> {
      if (typeof config.ffiPath !== 'string' || config.ffiPath.trim().length === 0) {
        throw new Error(`Invalid ffiPath: ${config.ffiPath}`);
      }

      if (config.jniEnabled && config.jniLibPath) {
        let ffi: any;
        try {
          // @ts-ignore — optional peer dependency; not installed in stub/test environments
          ({ default: ffi } = await import('ffi-napi'));
          // @ts-ignore — optional peer dependency
          await import('ref-napi');
        } catch {
          throw new Error(
            'ffi-napi/ref-napi not available — install optional dependencies to use the Kotlin/Native bridge'
          );
        }

        ffiLib = ffi.Library(config.jniLibPath, {
          obix_jk_invoke:             ['string', ['string']],
          obix_jk_memory_usage:       ['string', []],
          obix_jk_gc:                 ['void',   []],
          obix_jk_load_class:         ['string', ['string']],
          obix_jk_create_thread_pool: ['string', ['int']],
          obix_jk_free:               ['void',   ['pointer']],
        }) as NativeFfiLib;

        (globalThis as typeof globalThis & { __obixAbiInvoker?: BindingAbiInvoker }).__obixAbiInvoker = {
          invoke: (envelopeJson: string) => ffiLib!.obix_jk_invoke(envelopeJson),
        };
        installedAbiInvoker = true;
      }

      initialized = true;
    },

    async invoke(fn: string | object, args: unknown[]): Promise<unknown> {
      const functionId = normalizeFunctionIdentifier(fn);
      const envelope: InvocationEnvelope = {
        functionId: functionId ?? '<unknown>',
        args,
        metadata: {
          schemaMode: config.schemaMode,
          binding: abiBindingName,
          timestampMs: Date.now(),
          ffiPath: config.ffiPath,
        },
      };

      if (!initialized) {
        return { code: 'NOT_INITIALIZED', message: 'Binding is not initialized', envelope } satisfies BindingInvokeError;
      }

      if (!functionId) {
        return { code: 'MISSING_SYMBOL', message: 'Function identifier was not provided', envelope } satisfies BindingInvokeError;
      }

      const abiInvoker = (globalThis as typeof globalThis & { __obixAbiInvoker?: BindingAbiInvoker }).__obixAbiInvoker;
      if (!abiInvoker?.invoke) {
        return {
          code: 'MISSING_SYMBOL',
          message: 'Required ABI symbol __obixAbiInvoker.invoke is unavailable',
          envelope,
        } satisfies BindingInvokeError;
      }

      try {
        return await abiInvoker.invoke(JSON.stringify(envelope));
      } catch (cause) {
        return {
          code: 'INVOCATION_FAILED',
          message: 'Invocation failed at ABI boundary',
          envelope,
          cause,
        } satisfies BindingInvokeError;
      }
    },

    async destroy(): Promise<void> {
      if (installedAbiInvoker) {
        delete (globalThis as typeof globalThis & { __obixAbiInvoker?: BindingAbiInvoker }).__obixAbiInvoker;
        installedAbiInvoker = false;
      }
      ffiLib = null;
      initialized = false;
    },

    getMemoryUsage() {
      if (ffiLib) {
        try {
          return JSON.parse(ffiLib.obix_jk_memory_usage()) as {
            heapUsedBytes: number;
            heapMaxBytes: number;
            nonHeapBytes: number;
            objectCount: number;
          };
        } catch {
          // fall through to zeros on parse failure
        }
      }
      return {
        heapUsedBytes: 0,
        heapMaxBytes: 0,
        nonHeapBytes: 0,
        objectCount: 0,
      };
    },

    getSchemaMode(): SchemaMode {
      return config.schemaMode;
    },

    isInitialized(): boolean {
      return initialized;
    },

    async loadClass(className: string): Promise<object> {
      if (ffiLib) {
        return JSON.parse(ffiLib.obix_jk_load_class(className)) as object;
      }
      console.log('Loading Java class:', className);
      return {};
    },

    async forceGarbageCollection(): Promise<void> {
      if (ffiLib) {
        ffiLib.obix_jk_gc();
        return;
      }
      console.log('Forcing JVM garbage collection');
    },

    async createThreadPool(poolSize: number): Promise<string> {
      if (ffiLib) {
        return ffiLib.obix_jk_create_thread_pool(poolSize);
      }
      console.log('Creating thread pool with size:', poolSize);
      return 'pool-id';
    },
  };
}

