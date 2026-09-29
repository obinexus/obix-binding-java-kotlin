# JNI Bridge and JVM Helpers

This binding is a single module — there are no sub-module accessors.

## Optional native bridge

When `config.jniEnabled` **and** `config.jniLibPath` are set, `initialize()`
dynamically imports the optional peers `ffi-napi` / `ref-napi` and loads the
Kotlin/Native shared library, binding these C symbols:

```
obix_jk_invoke(envelopeJson) -> string
obix_jk_memory_usage()       -> string   (JSON)
obix_jk_gc()                 -> void
obix_jk_load_class(name)     -> string   (JSON)
obix_jk_create_thread_pool(n)-> string
obix_jk_free(ptr)            -> void
```

It then installs `globalThis.__obixAbiInvoker` backed by `obix_jk_invoke`.
If the optional peers are missing, `initialize()` throws with a clear message.

## Without the native bridge

`loadClass`, `forceGarbageCollection`, and `createThreadPool` fall back to
logging stubs, and `getMemoryUsage()` returns a zero-filled
`{ heapUsedBytes, heapMaxBytes, nonHeapBytes, objectCount }`.
