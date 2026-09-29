# Schema Modes

`schemaMode` sets how the binding negotiates cross-language interop. It is
required, validated at `initialize()`, and readable via `binding.getSchemaMode()`.

| Mode | Meaning |
|------|---------|
| `monoglot` | Single-language calls only — no polyglot marshalling |
| `polyglot` | Full cross-language interop |
| `hybrid` | Polyglot where available, single-language fast path otherwise |

## Resolved capabilities

`binding.schemaResolver.resolve()` derives a capability record from the mode:

| Capability | `monoglot` | `hybrid` | `polyglot` |
|-----------|:----------:|:--------:|:----------:|
| `supportsMultiLanguage` | no | yes | yes |
| `swigEnabled` / polyglot wrapping | no | yes | yes |
| `rttEnabled` / runtime type info | no | yes | yes |
| exception handling | yes | yes | yes |

(The exact field names vary per binding — `Java / Kotlin` exposes them on its
`*ResolvedSchema` type.)

## Validation

```ts
binding.schemaResolver.validate('polyglot'); // true
binding.schemaResolver.validate('nope');     // false
```

`initialize()` calls this and throws `Invalid schemaMode: <x>` for anything
outside the three values. The resolver is otherwise stateless.
