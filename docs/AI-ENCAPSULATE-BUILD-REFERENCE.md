> **⚠️ AI Agent Instructions — Keep This Document Up To Date**
>
> This is a **living reference document** maintained by AI agents during development sessions.
> When you learn something new about the topics covered here — a gotcha, a pattern, a fix —
> **add it to the relevant section** (or create a new one). Keep entries concise and code-first.
> Do **not** delete existing content unless it is provably wrong or obsolete.

---

# Encapsulate — Build Reference

`@stream44.studio/encapsulate` is the capsule runtime library that powers the entire workspace. It provides the `encapsulate()` function, spine contracts, property types, and the capsule module format used across all projects.

This document is the authoritative reference for **capsule definition patterns, property types, spine contracts, and encapsulate internals**. For how capsules are composed, tested, and run via the t44 standalone runtime, see [AI-STANDALONE-RT-BUILD-REFERENCE.md](./AI-STANDALONE-RT-BUILD-REFERENCE.md).

> **Further reading**: [@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0/README.md](../../../encapsulate.dev/packages/encapsulate/src/spine-contracts/CapsuleSpineContract.v0/README.md)

---

## 1. Package Structure

```
@stream44.studio/encapsulate/
├── src/
│   ├── encapsulate.ts                      # Core: Spine, SpineRuntime, CapsulePropertyTypes, makeImportStack, merge
│   ├── static-analyzer.ts               # Static analysis for CST generation
│   ├── capsule-projectors/
│   │   └── CapsuleModuleProjector.ts    # Module projection for capsule loading
│   ├── spine-contracts/
│   │   └── CapsuleSpineContract.v0/
│   │       ├── Static.ts                # Direct property assignment (no interception)
│   │       ├── Membrane.ts              # Proxy-wrapped API with event emission
│   │       ├── README.md                   # Full contract reference
│   │       └── Overview.svg                # Visual diagram
│   └── spine-factories/
│       ├── CapsuleSpineFactory.ts       # Factory: sets up spine, contracts, module resolution
│       └── TimingObserver.ts               # Optional trace timing
├── structs/
│   └── Capsule.ts                          # Capsule metadata struct
├── package.json                            # Exports map defines all public entry points
└── README.md
```

### Package Exports

The package exposes these entry points (from `package.json` exports):

| Import Path | Maps To | Purpose |
|---|---|---|
| `@stream44.studio/encapsulate/encapsulate` | `src/encapsulate.ts` | Core: `Spine`, `SpineRuntime`, `CapsulePropertyTypes`, `makeImportStack`, `merge` |
| `@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0/Static` | `src/spine-contracts/CapsuleSpineContract.v0/Static.ts` | Static spine contract (no interception) |
| `@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0/Membrane` | `src/spine-contracts/CapsuleSpineContract.v0/Membrane.ts` | Membrane spine contract (proxy + events) |
| `@stream44.studio/encapsulate/spine-factories/CapsuleSpineFactory` | `src/spine-factories/CapsuleSpineFactory.ts` | High-level factory (used by standalone-rt) |
| `@stream44.studio/encapsulate/spine-factories/TimingObserver` | `src/spine-factories/TimingObserver.ts` | Trace timing helper |
| `@stream44.studio/encapsulate/structs/Capsule` | `structs/Capsule.ts` | Capsule metadata struct |

---

## 2. Core Concepts

### What is a Capsule?

A **capsule** is a TypeScript file that exports an `async function capsule()` which calls `encapsulate()` to declare its structure. The `encapsulate()` call returns a spine object that represents the capsule's identity, properties, and relationships.

Capsules are the universal building block. They compose into trees via `Mapping` properties, inherit via `extendsCapsule`, and expose APIs through property contracts.

### Spine Contracts

A **spine contract** governs how capsule properties are mapped to the encapsulated API and which features are available. The contract defines the fundamental logic of how components and their internal APIs are bound.

The only spine contract in use is **CapsuleSpineContract.v0**, available in two implementations:

| Implementation | Overhead | Use Case |
|---|---|---|
| **Static** | Minimal — direct property assignment | Production, when no event capture is needed |
| **Membrane** | Higher — wraps API in proxies | Development, when membrane events are captured |

The standalone-rt always uses **Membrane** (imported via `CapsuleSpineFactory`).

### Property Contracts

Within a spine contract, **property contracts** group properties. Keys starting with `#` within a spine contract block are property contract URIs:

- **`'#'`** — the default property contract. Properties here are exposed directly on the capsule API.
- **`'#./MyStruct.v0'`** — a non-default URI. Resolved as a capsule mapping and mounted as a sub-component (property contract delegate).
- **`'#@stream44.studio/encapsulate/structs/Capsule'`** — the Capsule metadata struct. Injects identity metadata.

---

## 3. Capsule Module Format

Every capsule source file **must** follow this exact format:

```typescript
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                // ... properties go here ...
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@scope/package/path/to/CapsuleName'
```

### Strict Rules

1. **`capsule['#']` is mandatory** — it provides a stable identifier for the capsule used in resolution and registry. It **must** match the module's path in the workspace using the `@scope/package/subpath` format that maps to the filesystem via `tsconfig.paths.json`.
2. **`importMeta: import.meta`** — required for deriving `moduleFilepath`.
3. **`importStack: makeImportStack()`** — required for deriving `importStackLine` (declaration line number).
4. **`'#@stream44.studio/encapsulate/structs/Capsule': {}`** — required on every capsule. Injects metadata.
5. The function **must** be named `capsule` and **must** be exported.
6. The function **must** return the result of `encapsulate()`.

### Capsule Name Convention

The `capsule['#']` value **must** reference the module using the `@scope/package/subpath` convention:

```
@stream44.studio/t44/caps/ProjectTest          → t44.sh/packages/t44/caps/ProjectTest.ts
@csrv.sh/cli/server.test              → csrv.sh/packages/cli/server.test.ts
@stream44.studio/encapsulate/structs/Capsule → encapsulate.dev/packages/encapsulate/structs/Capsule.ts
```

The pattern is: `@<domain>/<package>/<path-without-extension>`

For test files, append `.test` to the capsule name of the file being tested.

---

## 4. Encapsulate Options

The second argument to `encapsulate()` configures the capsule:

| Option | Type | Required | Description |
|---|---|---|---|
| `importMeta` | `{ url: string, dir: string }` | **Yes** | `import.meta` of the defining module. Derives `moduleFilepath`. |
| `importStack` | `string` | **Yes** | Stack trace from `makeImportStack()`. Derives `importStackLine`. |
| `capsuleName` | `string` | **Yes** | Stable identifier. Must match `capsule['#']`. Enables override targeting by name. |
| `importStackLine` | `number` | No | Explicit line number (alternative to `importStack`). |
| `moduleFilepath` | `string` | No | Explicit module path (alternative to `importMeta`). |
| `extendsCapsule` | `capsule \| string` | No | Parent capsule to inherit from. String URIs resolved relative to module. |
| `ambientReferences` | `Record<string, any>` | No | Named capsule references used in the definition. Required for static analysis. |
| `cst` / `crt` | `any` | No | Pre-computed CST/CRT. Bypasses static analysis. |

---

## 5. CapsulePropertyTypes — Complete Reference

### Value Types

| Type | API Access | `this` Access | Overridable | Description |
|---|---|---|---|---|
| `Literal` | read/write | read/write | yes | General-purpose value. Supports any JS type including `Map`, `Set`, etc. |
| `String` | read/write | read/write | yes | Alias for `Literal`. Semantic hint for string values. |
| `Constant` | read-only | read | no | Immutable value. Membrane contract throws on assignment. |

All value types accept a `value` in their definition. `undefined` means "no default — must be supplied via overrides/options".

```typescript
// Literal — general-purpose mutable value
name: {
    type: CapsulePropertyTypes.Literal,
    value: 'default-name'
},

// String — semantic alias for Literal (string values)
label: {
    type: CapsulePropertyTypes.String,
    value: undefined    // must be supplied via options/overrides
},

// Constant — immutable, throws on write
VERSION: {
    type: CapsulePropertyTypes.Constant,
    value: '1.0.0'
},
```

### Function Types

| Type | API Access | Signature | Description |
|---|---|---|---|
| `Function` | `api.name(...args)` | `function(this, ...args)` | Callable method. Bound to self proxy. |
| `GetterFunction` | `api.name` (no parens) | `function(this)` | Lazy getter. Evaluated on each access (unless memoized). |
| `SetterFunction` | `api.name = value` | `function(this, value)` | Triggered on assignment. Enables validation/transformation. |

All function types are bound to a **self proxy** where:
- `this.<prop>` resolves through: self → encapsulatedApi → extendedCapsuleApi
- `this.self.<prop>` resolves only the current capsule's own properties (`ownSelf`)

```typescript
// Function — callable method
greet: {
    type: CapsulePropertyTypes.Function,
    value: function (this: any, greeting: string): string {
        return `${greeting}, ${this.name}! (v${this.VERSION})`
    }
},

// GetterFunction — lazy getter (no parentheses on access)
fullLabel: {
    type: CapsulePropertyTypes.GetterFunction,
    value: function (this: any): string {
        return `${this.label} [${this.name}]`
    }
},

// SetterFunction — triggered on assignment
setName: {
    type: CapsulePropertyTypes.SetterFunction,
    value: function (this: any, newName: string) {
        if (!newName) throw new Error('Name cannot be empty')
        this.name = newName.trim()
    }
},
```

### Memoize Option

Applies to `Function` and `GetterFunction`. Added as a sibling to `type` and `value`:

```typescript
// Permanent cache — result cached for the lifetime of the run
expensiveComputation: {
    type: CapsulePropertyTypes.GetterFunction,
    value: function (this: any): object {
        return { computed: true, name: this.name }
    },
    memoize: true
},

// TTL cache — expires after N milliseconds
timedCache: {
    type: CapsulePropertyTypes.Function,
    value: function (this: any): object {
        return { ts: Date.now(), name: this.name }
    },
    memoize: 5000    // 5 seconds
},
```

Memoize caches are scoped per spine contract capsule instance and cleared automatically when `run()` completes.

### Mapping Type

`Mapping` composes another capsule as a sub-component:

```typescript
// Direct capsule reference
$auth: {
    type: CapsulePropertyTypes.Mapping,
    value: authCapsule,
    options: { '#': { realm: 'users' } }
},

// String URI — resolved relative to this capsule's module filepath
$db: {
    type: CapsulePropertyTypes.Mapping,
    value: './Database.v0',
},

// Absolute URI — resolved via spine filesystem root
test: {
    type: CapsulePropertyTypes.Mapping,
    value: '@stream44.studio/t44/caps/ProjectTest',
    options: { '#': { bunTest, env: {} } }
},
```

#### Mapping Options

Options are forwarded to the mapped capsule:

```typescript
// Static options object
options: { '#': { key: 'value' } }

// Dynamic options function — receives { self, constants }
options: async ({ self, constants }: { self: any, constants: any }) => {
    // 'constants' contains Literal/String values from the mapped capsule
    // 'self' contains the Capsule metadata struct and resolved siblings (when depends is set)
    return {
        '#': { connectionString: `db://${constants.dbName}` },
        // Nested capsule-name-targeted options (keys without '#' prefix)
        'connectionPool': {
            '#': { maxConnections: 10 }
        }
    }
}
```

- Keys starting with `'#'` target the mapped capsule's own property contracts.
- Keys without `'#'` are matched against capsule names deeper in the mapping tree (nested capsule-name-targeted options).

#### Mapping Depends

Declares sibling dependencies that must resolve first:

```typescript
$api: {
    type: CapsulePropertyTypes.Mapping,
    value: apiCapsule,
    depends: ['$auth'],    // $auth must resolve before $api's options function runs
    options: function ({ self }: { self: any }) {
        return {
            '#': {
                authRealm: self.$auth.realm,
                capsuleName: self['#@stream44.studio/encapsulate/structs/Capsule'].capsuleName
            }
        }
    }
},
```

- The static analyzer can auto-detect `self.<name>` references and inject `depends` automatically.
- Named capsules are registered in an instance registry. If a capsule with the same name is mapped multiple times without options, the existing instance is reused via a deferred proxy.

### Lifecycle Types

| Type | When | Order | On API | Description |
|---|---|---|---|---|
| `StructInit` | Before handler | Top-down (child → extended parent) | No | Initialization for struct capsules. Async supported. |
| `StructDispose` | After handler | Bottom-up (reverse of init) | No | Cleanup for struct capsules. Async supported. |
| `Init` | Before handler | Top-down | No | Initialization for non-struct capsules. |
| `Dispose` | After handler | Bottom-up | No | Cleanup for non-struct capsules. |

Multiple lifecycle functions per capsule are supported. They execute in definition order.

```typescript
// Init — runs once after instantiation, before the handler
EnsureDirectories: {
    type: CapsulePropertyTypes.Init,
    value: async function (this: any) {
        await mkdir(this.dataDir, { recursive: true })
    }
},

// Dispose — runs after the handler completes
Cleanup: {
    type: CapsulePropertyTypes.Dispose,
    value: async function (this: any) {
        await this.connection.close()
    }
},
```

---

## 6. Capsule Definition Structure

The full hierarchy:

```
{
    '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {

        // Capsule metadata struct (required on every capsule)
        '#@stream44.studio/encapsulate/structs/Capsule': {},

        // Property contract delegate (optional) — maps external struct
        '#./structs/Schema.v0': {
            as: '$schema',              // alias for API access
            options: { '#': { ... } }   // forwarded to struct capsule
        },

        // Default property contract — properties exposed directly on API
        '#': {
            propertyName: { type: CapsulePropertyTypes.Xxx, value: ... },
            ...
        }
    }
}
```

### Property Contract Delegates

Non-default property contract URIs are resolved as capsule mappings and mounted:

```typescript
'#./MyStruct.v0': {
    as: '$myStruct',                    // alias — accessible as api.$myStruct and this.$myStruct
    options: { '#': { key: value } }    // forwarded to the struct capsule
}
```

Without `as`, the property is accessible via `api['#./MyStruct.v0']`.

Overrides targeting a property contract delegate use the delegate URI as key:

```typescript
overrides: {
    'capsuleName': {
        '#./MyStruct.v0': { key: 'overridden' }
    }
}
```

---

## 7. Extends (Capsule Inheritance)

A capsule can inherit properties from a parent capsule:

```typescript
return encapsulate({
    '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
        '#@stream44.studio/encapsulate/structs/Capsule': {},
        '#': {
            // Child-specific properties
            childProp: { type: CapsulePropertyTypes.Literal, value: 'child' },
        }
    }
}, {
    importMeta: import.meta,
    importStack: makeImportStack(),
    capsuleName: capsule['#'],
    extendsCapsule: './BaseCapsule',    // string URI or direct capsule reference
})
```

### Rules

- Child and parent share the same `self` object. Parent functions see child's property values.
- Child properties take precedence over parent properties with the same name.
- The API uses a proxy: local properties checked first, then extended capsule's API.
- `this.self` in a parent function returns the parent's own values (`ownSelf`), not the merged context.
- Multiple capsules can extend the same parent — each gets a separate parent instance with its own `self`.

---

## 8. importCapsule (Dynamic Import)

`this.self.importCapsule()` dynamically loads and initializes a capsule by URI at runtime — without pre-declaring it as a `Mapping` property:

```typescript
run: {
    type: CapsulePropertyTypes.Function,
    value: async function (this: any) {
        const { capsule, api } = await this.self.importCapsule({
            uri: '@scope/package/caps/MyCapsule',   // or './relative/path'
            options: { '#': { key: 'value' } },
            overrides: { ... }
        })
        await api.doSomething()
    }
}
```

- The imported capsule receives the caller's runtime spine contracts and root capsule context.
- Init lifecycle functions are executed before returning.
- The imported capsule is **not** registered in the instance registry and **not** mounted on the parent's API.

Use `importCapsule` when you need to work with arbitrary capsules determined at runtime.

---

## 9. Capsule Metadata Struct

Every capsule with `'#@stream44.studio/encapsulate/structs/Capsule': {}` gets metadata injected:

```typescript
// Accessible via this or api:
this['#@stream44.studio/encapsulate/structs/Capsule'] === {
    capsuleName,                    // the capsule['#'] value
    capsuleSourceLineRef,           // absolute path:line
    moduleFilepath,                 // absolute path to the .ts file
    rootCapsule: {                  // the top-level capsule in the extends chain
        capsuleName,
        capsuleSourceLineRef,
        moduleFilepath
    }
}
```

`capsuleSourceNameRefHash` is also available when static analysis is enabled.

---

## 10. Membrane Events

When using **Membrane** (the default in standalone-rt), the API is wrapped in proxies that emit events for every property access:

| Event | Emitted When | Payload |
|---|---|---|
| `get` | Property read | `{ target, value, eventIndex, membrane }` |
| `set` | Property write | `{ target, value, eventIndex, membrane }` |
| `call` | Function invoked | `{ target, args, eventIndex, membrane, caller }` |
| `call-result` | Function returns | `{ target, result, callEventIndex, membrane }` |

### Membrane Property

Each event has a `membrane` field:

| Value | Meaning |
|---|---|
| `external` | Access from outside the capsule (e.g., `api.username`) |
| `internal` | Access from within a function body (e.g., `this.username` inside a method) |

### Caller Context

Events include `caller` context when `enableCallerStackInference` is enabled (always on in standalone-rt):
- `caller.fileUri` — source file npm URI
- `caller.line` — line number
- `caller.capsuleSourceLineRef` — caller capsule identity

---

## 11. SpineRuntime & run()

The low-level runtime API (used internally by `CapsuleSpineFactory` and `standalone-rt`):

```typescript
const { run } = await SpineRuntime({ spineContracts, capsules, snapshot? })

const result = await run({
    overrides: {
        'capsuleName': { '#': { prop: 'value' } },       // by name
        'path/to/file.ts:42': { '#': { prop: 'value' } } // by capsuleSourceLineRef
    },
    options: {
        'capsuleName': { '#': { prop: 'value' } }
    }
}, async ({ apis }) => {
    return apis['capsuleName'].greet('Hello')
})
```

- **`overrides`** — merged into `self` before instantiation. Applied by `capsuleSourceLineRef` first, then by `capsuleName`.
- **`options`** — passed to `makeInstance()`. Same structure as overrides.
- **`apis`** — proxy-wrapped capsule instances. Nested `.api` layers are automatically unwrapped.

Lifecycle: instantiate → StructInit/Init → handler → StructDispose/Dispose → clear memoize timeouts.

---

## 12. Module Resolution

The `CapsuleSpineFactory` resolves capsule URIs using pure filesystem resolution (no Bun module resolver):

1. **Scoped packages**: `@scope/package/path` → `<spineRoot>/scope/packages/package/path.ts`
   - Matches `tsconfig.paths.json` pattern used across the workspace
2. **Package root**: `@scope/package` → resolved via `package.json` exports
3. **Relative paths**: `./Database.v0` → resolved relative to the current module's directory

This is important for capsule `Mapping` values and `extendsCapsule` string URIs.

---

## 13. Common Patterns

### Simple Value Capsule

```typescript
export async function capsule({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                name: { type: CapsulePropertyTypes.Literal, value: 'default' },
                VERSION: { type: CapsulePropertyTypes.Constant, value: '1.0.0' },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@scope/package/caps/SimpleCapsule'
```

### Capsule with Methods and State

```typescript
export async function capsule({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                _counter: { type: CapsulePropertyTypes.Literal, value: 0 },
                increment: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): number {
                        this._counter++
                        return this._counter
                    }
                },
                count: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any): number {
                        return this._counter
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@scope/package/caps/Counter'
```

### Capsule with Mappings (Composition)

```typescript
export async function capsule({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                // Relative path mapping
                db: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './DatabaseConnection',
                    options: { '#': { connectionString: 'sqlite://data.db' } }
                },
                // Absolute URI mapping
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest, env: {} } }
                },
                // Method that uses mapped capsule
                query: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, sql: string): Promise<any> {
                        return await this.db.execute(sql)
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@scope/package/caps/DataService'
```

### Capsule with Lifecycle

```typescript
export async function capsule({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                _connection: { type: CapsulePropertyTypes.Literal, value: null as any },
                Setup: {
                    type: CapsulePropertyTypes.Init,
                    value: async function (this: any) {
                        this._connection = await createConnection(this.connectionString)
                    }
                },
                Teardown: {
                    type: CapsulePropertyTypes.Dispose,
                    value: async function (this: any) {
                        if (this._connection) await this._connection.close()
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@scope/package/caps/DatabaseConnection'
```

---

## 14. Naming Conventions

| Element | Convention | Example |
|---|---|---|
| `capsule['#']` | `@scope/package/subpath` (matches module filesystem path) | `@stream44.studio/t44/caps/ProjectTest` |
| Private properties | `_` prefix | `_counter`, `_connection` |
| Lifecycle properties | PascalCase | `Setup`, `Teardown`, `EnsureDirectories` |
| API methods | camelCase | `greet`, `loadEnvFiles`, `getRandomPort` |
| Getter properties | camelCase (accessed without parens) | `count`, `fullLabel`, `workbenchDir` |
| Constants | UPPER_CASE or PascalCase | `VERSION`, `MAX_RETRIES` |
| Mapped capsules | camelCase or `$`-prefixed | `db`, `test`, `$auth`, `$schema` |

---

## 15. Common Gotchas

| Problem | Cause | Fix |
|---|---|---|
| `this._foo` is undefined | Property not declared in the capsule definition | Add the property with `CapsulePropertyTypes.Literal` |
| `this.mappedCap.method` fails | Mapped capsule not yet resolved | Add `depends: ['mappedCap']` or restructure |
| Constant throws on write | `CapsulePropertyTypes.Constant` is read-only | Use `Literal` if the value needs to change |
| Getter invoked every time | Default behavior for `GetterFunction` | Add `memoize: true` for caching |
| `capsuleName` not found in overrides | Name mismatch between `capsule['#']` and override key | Ensure exact string match |
| `importStack` line wrong | `makeImportStack()` not called at the right scope | Call it directly in the `encapsulate()` call, not earlier |
| Property not on API | Property defined in wrong property contract | Move to `'#'` (default contract) for direct API access |
| `self.<sibling>` undefined in options | Missing `depends` declaration | Add `depends: ['sibling']` to the mapping |

---

## 16. Spine Contracts: Static vs Membrane

Both implement the same property mapping logic. The difference is observability.

**Static** — direct property assignment. No interception. Minimal overhead. Use when no event capture is needed.

**Membrane** — wraps the API in proxies that emit events for every property access. Enables:
- Runtime call tracing
- Membrane event capture (`.events.json`)
- Caller stack inference
- Memoized result tagging

The standalone-rt **always uses Membrane**. This is the correct default for development. Static is reserved for production builds where observability is not needed.

---

## 17. Capsule vs `.bin` Boot File Pattern

When converting a standalone script (e.g., a server that auto-starts) to the capsule architecture, split into two files:

### Capsule File (`server.ts`)
- Exports `capsule()` function — contains all logic as capsule properties
- Does **NOT** auto-start or have side effects on import
- Exposes a `start()` (or similar) Function property for explicit initialization

```typescript
export async function capsule({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                start: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): void {
                        // ... server startup logic
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@my-org/my-package/server/server'
```

### Boot File (`server.bin.ts`)
- Uses `CapsuleSpineFactory` directly (not `run()` from standalone-rt)
- Maps the capsule and calls its `start()` method
- Handles graceful shutdown (SIGINT/SIGTERM)

```typescript
#!/usr/bin/env bun
import { resolve } from 'path'
import { CapsuleSpineFactory } from "@stream44.studio/encapsulate/spine-factories/CapsuleSpineFactory"
import { CapsuleSpineContract } from "@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0/Membrane"

async function bootCapsule() {
    const { encapsulate, freeze, CapsulePropertyTypes, makeImportStack, hoistSnapshot } = await CapsuleSpineFactory({
        spineFilesystemRoot: resolve(import.meta.dir, '..'),
        capsuleModuleProjectionRoot: import.meta.dir,
        enableCallerStackInference: false,
        spineContracts: {
            ['#' + CapsuleSpineContract['#']]: CapsuleSpineContract
        },
    })
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                server: { type: CapsulePropertyTypes.Mapping, value: './server' },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@my-org/my-package/server/server.bin'
    })
    const snapshot = await freeze()
    const { run } = await hoistSnapshot({ snapshot })
    return { spine, run }
}

const { spine, run } = await bootCapsule()
await run({}, async ({ apis }: any) => {
    const server = apis[spine.capsuleSourceLineRef].server
    server.start()
})
```

### Key points:
- Tests that spawn the server as a child process must point to `server.bin.ts` (not the capsule file)
- Tests that need the capsule's API map it via `CapsulePropertyTypes.Mapping` in their `run()` call
- The `.bin.ts` file will have TypeScript `moduleResolution` lint warnings for `@encapsulate.dev` imports — these are safe to ignore (Bun resolves them at runtime)

---

## 18. Ambient References in Capsule Functions

The static analyzer validates all identifiers referenced inside capsule function bodies. Module-level identifiers are handled as follows:

### Auto-detected (no action needed):
- **Imports** — `import { foo } from 'bar'` → auto-detected from import statements
- **Module-local functions** — `function helper() { ... }` → auto-detected if "self-contained" (only depends on imports, other module-local functions, and module-local variables)
- **Module-local variables** — `const X = ...` → auto-detected if initializer is self-contained
- **Functions referencing module-local variables** — e.g. a function that uses a module-level `const PORTS = {...}` is correctly detected as self-contained, and its variable dependencies are transitively collected
- **Well-known globals** — `process`, `console`, `Date`, `Math`, `JSON`, `Buffer`, `setTimeout`, etc.

### Requires `ambientReferences` option:
- Module-level **string/number/boolean/null/undefined constants** that the analyzer can't prove are self-contained
- **Capsule instances** (objects with `toCapsuleReference` method)

### NOT allowed in `ambientReferences`:
- **Functions** — move them into the capsule as `CapsulePropertyTypes.Function` properties (only keep external to the capsule if it is a generic helper used in multiple places)
- **Classes** — move instantiation into capsule functions, or use imports (auto-detected). Only keep external if it is a generic helper used in multiple places.
- **Objects** — if not capsule instances and not self-contained

### Pattern for capsule self-reference:
Use `capsule['#']` directly inside function bodies. The static analyzer recognizes the `capsule` function as module-local:

```typescript
export async function capsule({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                doSomething: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {
                        const { api: child } = await this.self.importCapsule({
                            uri: capsule['#'],  // ← direct self-reference
                            options: { '#': { ... } }
                        });
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@my-org/my-package/my-capsule'
```

### Best practice: Move constants into capsule properties
Instead of module-level constants, prefer `CapsulePropertyTypes.Constant` properties inside the capsule. Access them via `this.` in function bodies:

```typescript
PORTS: {
    type: CapsulePropertyTypes.Constant,
    value: { mozilla: 33101, chrome: 33102 }
},
BROADCAST_ADDRESS: {
    type: CapsulePropertyTypes.Constant,
    value: '127.0.0.1'
},
```

---
