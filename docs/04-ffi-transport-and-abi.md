# FFI Transport and the ABI Boundary

## Invocation envelope

Every call is marshalled into an `InvocationEnvelope` before it crosses the FFI
boundary:

```ts
interface InvocationEnvelope {
  functionId: string;
  args: unknown[];
  metadata: {
    schemaMode: SchemaMode;   // from config
    binding: 'java-kotlin';
    timestampMs: number;      // Date.now() at build time
    ffiPath: string;          // from config
  };
}
```

`binding.ffiTransport.buildEnvelope(functionId, args)` produces one;
`invoke()` calls it for you.

## Function identifiers

`invoke(fn, args)` accepts `fn` as:

- a non-empty **string** — used directly, or
- an **object** — the first of `fn.functionId`, `fn.id`, `fn.name` wins.

Anything else resolves to no id and `invoke` returns a `MISSING_SYMBOL` error.
`normalizeFunctionIdentifier(fn)` is exported if you need it standalone.

## Dispatch

`ffiTransport.dispatch(envelope)`:

1. Reads `globalThis.__obixAbiInvoker`.
2. If it or `.invoke` is missing → returns `MISSING_SYMBOL`.
3. Otherwise calls `__obixAbiInvoker.invoke(JSON.stringify(envelope))` and
   awaits it.
4. If that throws → returns `INVOCATION_FAILED` with the original error as
   `cause`.

The envelope is JSON — args must be JSON-serialisable.

## Error model

`invoke` / `dispatch` **return** errors, never throw:

```ts
interface BindingInvokeError {
  code: 'NOT_INITIALIZED' | 'MISSING_SYMBOL' | 'INVOCATION_FAILED';
  message: string;
  envelope: InvocationEnvelope;   // the full envelope, for debugging
  cause?: unknown;                // present for INVOCATION_FAILED
}
```

| Code | When |
|------|------|
| `NOT_INITIALIZED` | `invoke` called before `initialize()` |
| `MISSING_SYMBOL` | no function id, or no `__obixAbiInvoker.invoke` |
| `INVOCATION_FAILED` | the native invoker threw |

Narrow the result before using it:

```ts
const r = await binding.invoke('doThing', [1, 2]);
if (r && typeof r === 'object' && 'code' in r) {
  // BindingInvokeError — inspect r.code / r.envelope
} else {
  // native result
}
```
