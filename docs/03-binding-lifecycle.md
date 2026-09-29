# Binding Lifecycle and Configuration

## Factory

```ts
const binding = createJavaKotlinBinding(config);
```

## `JavaKotlinBindingConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ffiPath` | `string` | **required** | Path to the native bridge shared library |
| `schemaMode` | `'monoglot' \| 'polyglot' \| 'hybrid'` | **required** | Polyglot interop mode |
| `memoryModel` | `'gc' \| 'manual' \| 'hybrid'` | **required** | Memory-management strategy hint |
| `javaVersion` | `string` | — | JVM version |
| `jniEnabled` | `boolean` | — | Load a Kotlin/Native shared library via JNI-style FFI |
| `jniLibPath` | `string` | — | Path to that shared library (required when `jniEnabled`) |
| `kotlinEnabled` | `boolean` | — | Kotlin language features |
| `androidTarget` | `boolean` | — | Android build target |
| `androidSdkLevel` | `number` | — | Android API level |
| `classpath` | `string[]` | — | Extra classpath entries |
| `jvmOptions` | `string[]` | — | Extra JVM flags |
| `heapSizeMaxMb` | `number` | — | Max heap hint (MB) |
| `ffiDescriptor` | `JavaKotlinFFIDescriptor` | — | Optional structured FFI descriptor |

## Lifecycle methods

| Method | Description |
|--------|-------------|
| `initialize(): Promise<void>` | Validates `ffiPath` (non-empty string) and `schemaMode` (valid enum). **Throws** on invalid input. Marks the binding ready. |
| `invoke(fn, args): Promise<unknown>` | Build an envelope for `fn` and dispatch it. Returns the native result, or a `BindingInvokeError` object — **never throws**. |
| `destroy(): Promise<void>` | Tear down every sub-module and mark the binding uninitialised. Not reusable afterwards. |
| `isInitialized(): boolean` | Ready state. |
| `getSchemaMode(): SchemaMode` | The resolved schema mode. |
| `getMemoryUsage()` | Java / Kotlin memory snapshot (`{ heapUsedBytes, heapMaxBytes, nonHeapBytes, objectCount }`). |

`fn` may be a string, or an object with `functionId` / `id` / `name` — see
[04-ffi-transport-and-abi.md](04-ffi-transport-and-abi.md).

## Java / Kotlin-specific bridge methods

| Method | Description |
|--------|-------------|
| `loadClass(className): Promise<object>` | Load a Java class; via native lib when `jniEnabled`, else a logging stub |
| `forceGarbageCollection(): Promise<void>` | Trigger a JVM GC (native when available) |
| `createThreadPool(poolSize): Promise<string>` | Create a thread pool, returns its id |

## Sub-module accessors

```ts
// (none — single-module binding)
```

## Example

```ts
const binding = createJavaKotlinBinding({
  ffiPath: '/opt/lib/libnativebridge.so',
  schemaMode: 'polyglot',
  memoryModel: 'hybrid',
});

await binding.initialize();
const result = await binding.invoke('renderFrame', [1920, 1080]);
console.log(binding.getMemoryUsage());
await binding.destroy();
```
