> **⚠️ AI Agent Instructions — Keep This Document Up To Date**
>
> This is a **living reference document** maintained by AI agents during development sessions.
> When you learn something new about the topics covered here — a gotcha, a pattern, a fix —
> **add it to the relevant section** (or create a new one). Keep entries concise and code-first.
> Do **not** delete existing content unless it is provably wrong or obsolete.

---

# t44 Standalone Runtime — Build Reference

The **standalone runtime** (`@stream44.studio/t44/standalone-rt`) is the entry point for building and running capsule-based applications and tests in the t44 workspace. It wraps the `@stream44.studio/encapsulate` library with a high-level `run()` function that handles spine initialization, snapshot serialization, membrane event capture, and capsule overrides.

This document covers **how to compose capsules, write test files, use built-in t44 capsules, and run capsule programs** via the standalone runtime. For capsule definition internals (property types, spine contracts, extends, lifecycle, etc.), see [AI-ENCAPSULATE-BUILD-REFERENCE.md](./AI-ENCAPSULATE-BUILD-REFERENCE.md).

> **Further reading**:
> - [AI-ENCAPSULATE-BUILD-REFERENCE.md](./AI-ENCAPSULATE-BUILD-REFERENCE.md) — capsule definition patterns, property types, spine contracts
> - [@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0/README.md](../../../encapsulate.dev/packages/encapsulate/src/spine-contracts/CapsuleSpineContract.v0/README.md) — full spine contract reference

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Your test / CLI / application file                     │
│    import { run } from '@stream44.studio/t44/standalone-rt'      │
│                                                         │
│    const result = await run(                            │
│      encapsulateHandler,   ← defines capsule tree       │
│      runHandler,           ← uses capsule APIs          │
│      options               ← runtime config             │
│    )                                                    │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  standalone-rt.ts                                        │
│    • CapsuleSpineFactory (Membrane.v0)                   │
│    • freeze() + hoistSnapshot() (default path)           │
│    • Membrane event capture + .events.json persistence   │
│    • ProjectTest overrides injection                     │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  @stream44.studio/encapsulate                            │
│    • encapsulate() — capsule definition                  │
│    • SpineRuntime — instantiation + lifecycle            │
│    • CapsuleSpineContract.v0/Membrane.v0 — proxy API    │
└─────────────────────────────────────────────────────────┘
```

### What standalone-rt does

1. **Initializes the spine** via `CapsuleSpineFactory` with `Membrane.v0` spine contract
2. **Calls your `encapsulateHandler`** — you define capsule(s) using `encapsulate()`
3. **Freezes + hoists the snapshot** (default) — serializes the capsule tree for deterministic execution
4. **Calls your `runHandler`** — you receive `apis` (proxy-wrapped capsule instances) and return a result
5. **Captures membrane events** (optional) — writes `.events.json` files for visualization
6. **Injects overrides** for `@stream44.studio/t44/caps/ProjectTest` (test root dir, verbose flag)

---

## 2. The `run()` Function

```typescript
import { run } from '@stream44.studio/t44/standalone-rt'

const result = await run(
    encapsulateHandler,
    runHandler,
    options?
)
```

### Parameters

#### `encapsulateHandler(context) → { spine, ...extras }`

Receives `{ encapsulate, CapsulePropertyTypes, makeImportStack }` and must return an object containing at least a `spine` (the result of `encapsulate()`). Any additional properties are passed through to the `runHandler`.

```typescript
async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                // ... capsule tree definition ...
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@scope/package/path.test',
    })
    return { spine }
}
```

#### `runHandler(context) → result`

Receives the merged context: everything from `encapsulateHandler`'s return value plus `{ apis, spineFilesystemRoot }`. The `apis` object contains proxy-wrapped capsule instances keyed by `capsuleSourceLineRef`.

```typescript
async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}
```

**Common patterns for `runHandler`**:

```typescript
// Return the full API object (for tests that destructure)
async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}

// Return a specific value
async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef].greeting
}

// Execute code and return results
async ({ spine, apis }: any) => {
    const api = apis[spine.capsuleSourceLineRef]
    const result = api.runModel()
    return { api, sitRoot: import.meta.dir, result }
}
```

#### `options` (optional)

| Option | Type | Default | Description |
|---|---|---|---|
| `importMeta` | `{ dir: string }` | — | **Required in practice**. `import.meta` of the calling file. Used to find package root and set `testRootDir`. |
| `runFromSnapshot` | `boolean` | `true` | Whether to freeze/hoist before running. **Default to `true`**. Only set to `false` as a last resort after investigating why snapshot mode fails. |
| `captureEvents` | `boolean` | `false` | Enable membrane event capture. Writes `.events.json` alongside `.sit.json` files. |

### `runFromSnapshot` Policy

**Always default to `runFromSnapshot: true`** (or omit the option entirely). The snapshot path (freeze → hoist → run) is the canonical execution mode that ensures deterministic behavior.

If a test fails with snapshot mode enabled:
1. **Investigate the root cause** — the issue is likely in the encapsulate library's serialization
2. **File a bug** or fix the serialization issue
3. **Only as a last resort** set `runFromSnapshot: false` with a comment explaining why

---

## 3. Test File Pattern

Every test file that uses standalone-rt follows this exact structure:

### Complete Test File Template

```typescript
#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'

const {
    test: { describe, it, expect, expectSnapshotMatch },
    // ... other capsule APIs destructured here ...
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest, env: {} } }
                },
                // ... other capsule mappings ...
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@scope/package/path/to/file.test',
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta,
})

describe('My Feature', () => {
    it('does something', async () => {
        // test body
        expect(true).toBe(true)
    })
})
```

### Key Points

1. **Shebang line**: `#!/usr/bin/env bun test` — enables direct execution
2. **`import * as bunTest`**: the entire bun:test module, passed as an option to `ProjectTest`
3. **Top-level `await run()`**: the capsule tree is built and resolved at module load time
4. **Destructure `test` property**: `ProjectTest` is mapped as `test`, providing `describe`, `it`, `expect`, `expectSnapshotMatch`
5. **`capsuleName` must be `@scope/package/path.test`**: matches the file path with `.test` suffix
6. **`importMeta: import.meta`** in both the encapsulate options AND the `run()` options
7. **Use `describe`/`it`/`expect` from `test`** (the ProjectTest capsule), NOT from `bun:test` directly — this enables snapshot tracking and credential-based test skipping

### Accessing Multiple Capsule APIs

When your test maps multiple capsules, destructure them from the top-level result:

```typescript
const {
    test: { describe, it, expect, expectSnapshotMatch },
    modelServer,
    ipfs,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest, env: {} } }
                },
                modelServer: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '../../../L3-model-server/ModelServer',
                    options: {
                        '#': {
                            models: { /* ... */ }
                        }
                    }
                },
                ipfs: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44-ipfs.tech/caps/IpfsWorkbench'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@scope/package/path.test',
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })
```

Each mapped capsule becomes a property on the returned API: `test`, `modelServer`, `ipfs`, etc.

---

## 4. Running Tests

```bash
t <path-to-test-file>          # run test
td <path-to-test-file>         # debug test
bun test --update-snapshots    # update snapshots after structural changes
```

### Snapshot Updates

When test data structures change:
```bash
bun test --update-snapshots <path-to-test-file>
```

Or set the environment variable:
```bash
UPDATE_SNAPSHOTS=1 bun test <path-to-test-file>
```

### Trace Mode

Add `--trace` to see timing information for each spine phase:
```bash
bun test <path-to-test-file> -- --trace
```

---

## 5. Built-in t44 Capsules

### `@stream44.studio/t44/caps/ProjectTest`

The primary test harness capsule. Provides test lifecycle, snapshot management, environment loading, and utility functions.

**Mapping pattern**:
```typescript
test: {
    type: CapsulePropertyTypes.Mapping,
    value: '@stream44.studio/t44/caps/ProjectTest',
    options: { '#': { bunTest, env: {} } }
},
```

**Required options**:
- `bunTest` — the `bun:test` module (imported as `import * as bunTest from 'bun:test'`)
- `env` — environment variables object (typically `{}`)

#### Test Lifecycle Wrappers

These **must** be used instead of importing directly from `bun:test`:

| Property | Type | Description |
|---|---|---|
| `describe` | `GetterFunction` | Wraps `bun:test.describe`. Tracks describe stack for snapshot key generation. Supports `.skip()`. |
| `it` | `GetterFunction` | Wraps `bun:test.it`. Captures describe stack at registration time. Auto-skips `MISSING_CREDENTIALS` errors. Supports `.skip()`. |
| `test` | `GetterFunction` | Wraps `bun:test.test`. Same credential-skipping behavior. Supports `.skip()`. |
| `expect` | `GetterFunction` | Returns `bun:test.expect`. |
| `beforeAll` | `Function` | Wraps `bun:test.beforeAll`. |
| `afterAll` | `Function` | Wraps `bun:test.afterAll`. |
| `beforeEach` | `Function` | Wraps `bun:test.beforeEach`. |
| `afterEach` | `Function` | Wraps `bun:test.afterEach`. |

#### Snapshot Management

| Property | Type | Description |
|---|---|---|
| `expectSnapshotMatch(actual, opts?)` | `Function` | Compares `actual` against stored snapshot. Creates snapshot if missing. Updates on `--update-snapshots`. |

**`expectSnapshotMatch` options**:
- `{ strict: true }` — exact deep equality (array/key order matters)
- Default: sort-order-ignorant comparison (normalizes hash-like keys/values)

Snapshots are stored in `__snapshots__/<testfile>.snap.json` next to the test file. They are flushed in `afterAll`.

**Snapshot key format**: `<describe stack joined by ' > '> > <it name> #<counter>` — supports multiple snapshots per test.

#### Environment Loading

| Property | Type | Description |
|---|---|---|
| `loadEnvFiles(cwd)` | `Function` | Loads `.env` and `.env.dev` files from `cwd`. Called automatically by `getEnvValue`. |
| `getEnvValue(envVarName)` | `Function` | Returns `process.env[envVarName]`. Auto-loads env files from `testRootDir`. |

#### Workbench Directory

| Property | Type | Description |
|---|---|---|
| `workbenchDir` | `GetterFunction` | Returns a per-test working directory at `<testRootDir>/.~o/workspace.foundation/workbenches/<testFileName>`. |
| `emptyWorkbenchDir()` | `Function` | Creates and empties the workbench directory. Called automatically via `EnsureEmptyWorkbenchDir` Init. |

The workbench directory is automatically emptied before each test run (via `EnsureEmptyWorkbenchDir` Init lifecycle).

#### Utility Functions

| Property | Type | Description |
|---|---|---|
| `getRandomPort()` | `Function` | Returns a random available port (10000–65535). Tries up to 10 times. |
| `verbose` | `Literal` | Whether verbose mode is enabled (set by standalone-rt based on `VERBOSE` env var). |
| `testRootDir` | `Literal` | The directory of the test file (set by standalone-rt from `importMeta.dir`). |

#### Credential-Based Test Skipping

If a test throws an error with message starting with `MISSING_CREDENTIALS:`, the test is automatically skipped with a console message instead of failing:

```typescript
it('connects to service', async () => {
    const apiKey = test.getEnvValue('MY_API_KEY')
    if (!apiKey) throw new Error('MISSING_CREDENTIALS:MyService:MY_API_KEY')
    // ... test with API key ...
})
```

---

### `@stream44.studio/t44/caps/ProjectTestLib`

Utility capsule mapped by `ProjectTest` as `lib`. Provides filesystem, process spawning, and HTTP utilities.

**Access pattern**: `test.lib.<method>` (accessed through the `test` capsule).

| Property | Type | Description |
|---|---|---|
| `path` | `Constant` | Node.js `path` module |
| `fs` | `Constant` | Node.js `fs/promises` + `fs.constants` |
| `spawnProcess(options)` | `Function` | Spawn a child process with stdout/stderr capture, ready signal detection, and exit waiting |
| `runPackageScript(options)` | `Function` | Run a package.json script via `bun run <script>` |
| `waitForFetch(options)` | `Function` | Poll a URL until it responds (or doesn't). Configurable retry, timeout, status matching. |

#### `spawnProcess` Options

```typescript
await test.lib.spawnProcess({
    cmd: ['bun', 'run', 'server.ts'],
    cwd: '/path/to/project',
    waitForReady: true,           // wait for readySignal in stdout/stderr
    readySignal: 'READY',         // string to look for (default: 'READY')
    waitForExit: false,           // wait for process to exit
    showOutput: false,            // pipe stdout/stderr to console
    env: { PORT: '3000' },        // additional env vars
    verbose: false,               // extra logging
    detached: false,              // detach process
})
```

Returns: `{ process, stdout, stderr, exitCode, getStdout(), getStderr() }`

#### `waitForFetch` Options

```typescript
await test.lib.waitForFetch({
    url: 'http://localhost:3000/health',
    method: 'GET',
    status: 200,                  // expected status (true = any, false = unreachable, number = specific)
    retryDelayMs: 1000,
    requestTimeoutMs: 2000,
    timeoutMs: 30000,
    verbose: false,
    returnResponse: false,        // true to return the Response object
})
```

Returns: `boolean` (or `Response` if `returnResponse: true`)

---

### `@stream44.studio/t44/caps/TaskWorkflow`

A task orchestration capsule for non-test CLI programs. Defines serial/parallel execution trees with named steps.

**Mapping pattern**:
```typescript
workflow: {
    type: CapsulePropertyTypes.Mapping,
    value: '@stream44.studio/t44/caps/TaskWorkflow',
},
```

| Property | Type | Description |
|---|---|---|
| `serial(name, fn)` | `Function` | Define a serial task group — children execute sequentially |
| `parallel(name, fn)` | `Function` | Define a parallel task group — children execute concurrently |
| `step(name, fn, timeout?)` | `Function` | Define a leaf step — the actual work unit |
| `run()` | `Function` | Execute all registered tasks. Calls `process.exit(0)` on completion (unless `exitOnComplete` is `false`). |
| `exitOnComplete` | `Literal` | Whether to call `process.exit(0)` after `run()`. Default: `true`. |

**Usage pattern**:

```typescript
const { workflow } = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                workflow: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/TaskWorkflow',
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@scope/package/build.cli',
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })

workflow.serial('Build Pipeline', () => {
    workflow.step('Compile', async () => {
        // ... compile step ...
    })
    workflow.parallel('Tests', () => {
        workflow.step('Unit Tests', async () => { /* ... */ })
        workflow.step('Integration Tests', async () => { /* ... */ })
    })
    workflow.step('Deploy', async () => {
        // ... deploy step ...
    })
})

await workflow.run()
```

Output shows a colored breadcrumb trail:
```
⚡ Build Pipeline
▸ Build Pipeline -> Compile
✓ Build Pipeline -> Compile
⚙ Build Pipeline -> Tests
▸ Build Pipeline -> Tests -> Unit Tests
▸ Build Pipeline -> Tests -> Integration Tests
✓ Build Pipeline -> Tests -> Unit Tests
✓ Build Pipeline -> Tests -> Integration Tests
✓ Build Pipeline -> Tests
▸ Build Pipeline -> Deploy
✓ Build Pipeline -> Deploy
✓ Build Pipeline
```

---

## 6. Capsule Composition Patterns

### Pattern: Test File with Single Capsule Under Test

The most common pattern — a test file that maps `ProjectTest` and one or more capsules to test:

```typescript
#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'

const {
    test: { describe, it, expect, expectSnapshotMatch },
    myService,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest, env: {} } }
                },
                myService: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './MyService',
                    options: { '#': { connectionString: 'test://localhost' } }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@scope/package/MyService.test',
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })

describe('MyService', () => {
    it('returns data', async () => {
        const result = await myService.getData()
        expect(result).toBeDefined()
        await expectSnapshotMatch(result)
    })
})
```

### Pattern: Test File with Model Registration

For Framespace-style models that register spine instance trees:

```typescript
#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { join } from 'path'
import { run } from '@stream44.studio/t44/standalone-rt'
import { MODEL_NAME, runModel } from './0A-MyModel'

const {
    test: { describe, it, expect, expectSnapshotMatch },
    spineInstanceTrees,
    modelEngines,
    modelQueryMethodTests,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest, env: {} } }
                },
                spineInstanceTrees: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '../../SpineInstanceTrees',
                },
                modelEngines: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '../../ModelEngines',
                },
                modelQueryMethodTests: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '../../ModelQueryMethodTests',
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: `${MODEL_NAME}.test`,
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })

describe('0A-MyModel', () => {
    it('run model', async () => {
        await spineInstanceTrees.registerInstance({ name: MODEL_NAME }, runModel)
    })

    it('imports instance to engine', async () => {
        await spineInstanceTrees.importInstanceToEngine({ engine: modelEngines.getEngine() })
    })

    modelQueryMethodTests.makeTests({
        describe, it, expect, expectSnapshotMatch,
        engine: modelEngines.getEngine(),
        spineInstanceTreeId: MODEL_NAME,
        packageRoot: join(import.meta.dir, '..', '..', '..', '..'),
        config: {
            getCapsuleWithSource: { capsuleName: MODEL_NAME },
            getCapsuleSpineTree_data: { capsuleName: MODEL_NAME },
            fetchCapsuleRelations: { capsuleNames: [MODEL_NAME] },
        }
    })
})
```

### Pattern: CLI Application with TaskWorkflow

```typescript
#!/usr/bin/env bun

import { run } from '@stream44.studio/t44/standalone-rt'

const { workflow } = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                workflow: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/TaskWorkflow',
                },
                // ... other capsules for the workflow ...
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@scope/package/build.cli',
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })

workflow.serial('Deploy', () => {
    workflow.step('Build', async () => { /* ... */ })
    workflow.step('Push', async () => { /* ... */ })
})

await workflow.run()
```

### Pattern: Multiple Capsules in One Spine

You can define multiple capsules in a single `encapsulateHandler`:

```typescript
const result = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spineA = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                name: { type: CapsulePropertyTypes.Literal, value: 'capsule-a' },
            }
        }
    }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@scope/package/test.multi-a' })

    const spineB = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                name: { type: CapsulePropertyTypes.Literal, value: 'capsule-b' },
            }
        }
    }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@scope/package/test.multi-b' })

    return { spineA, spineB }
}, async ({ spineA, spineB, apis }: any) => {
    return {
        a: apis[spineA.capsuleSourceLineRef].name,
        b: apis[spineB.capsuleSourceLineRef].name,
    }
}, { importMeta: import.meta, runFromSnapshot: false })
```

### Pattern: Executable Model with Event Capture

For models that execute code and capture membrane events:

```typescript
export async function runModel({ run }) {
    return await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
        const spine = await encapsulate({
            '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                '#@stream44.studio/encapsulate/structs/Capsule': {},
                '#': {
                    counter: { type: CapsulePropertyTypes.Literal, value: 0 },
                    increment: {
                        type: CapsulePropertyTypes.Function,
                        value: function (this: any) {
                            this.counter++
                            return this.counter
                        }
                    }
                }
            }
        }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: MODEL_NAME })
        return { spine }
    }, async ({ spine, apis }: any) => {
        const api = apis[spine.capsuleSourceLineRef]
        api.increment()
        api.increment()
        return { api, sitRoot: import.meta.dir }
    }, {
        importMeta: import.meta,
        captureEvents: true,    // ← Records all membrane events to .events.json
    })
}
```

---

## 7. Membrane Event Capture

### Enabling

Set `captureEvents: true` in the `run()` options:

```typescript
await run(encapsulateHandler, runHandler, {
    importMeta: import.meta,
    captureEvents: true,
})
```

Or pass `--capture-events` as a CLI argument.

### Output

Events are written to `.~o/encapsulate.dev/spine-instances/<treeId>/root-capsule.events.json` alongside the `.sit.json` file.

### Event Format

Each event in the JSON array:

```json
{
    "eventIndex": 0,
    "event": "call",
    "membrane": "external",
    "target": {
        "capsuleSourceLineRef": "/path/to/file.ts:42",
        "prop": "increment",
        "spineContractCapsuleInstanceId": "..."
    },
    "value": undefined,
    "result": 1,
    "caller": {
        "fileUri": "@scope/package/path/to/caller",
        "line": 15
    },
    "callEventIndex": null
}
```

### Event Types

| Type | Meaning |
|---|---|
| `call` | Function invoked on a capsule |
| `call-result` | Function returned a result (links to `call` via `callEventIndex`) |
| `get` | Property read from a capsule |
| `set` | Property written to a capsule |

---

## 8. Overrides

The standalone-rt automatically injects overrides for specific capsules:

```typescript
overrides: {
    ['@stream44.studio/t44/caps/ProjectTest']: {
        '#': {
            testRootDir: options?.importMeta?.dir,
            verbose: !!process.env.VERBOSE,
        }
    },
}
```

This means:
- `ProjectTest.testRootDir` is automatically set to the directory of the calling file
- `ProjectTest.verbose` is set based on the `VERBOSE` environment variable

You can also pass overrides in mapping options to configure capsules:

```typescript
test: {
    type: CapsulePropertyTypes.Mapping,
    value: '@stream44.studio/t44/caps/ProjectTest',
    options: { '#': { bunTest, env: { MY_VAR: 'test' } } }
},
```

---

## 9. Snapshot Mode (freeze/hoist)

The default execution path:

1. **`encapsulateHandler`** — builds the capsule tree in memory
2. **`freeze()`** — serializes the entire capsule tree to a snapshot
3. **`hoistSnapshot()`** — deserializes the snapshot into a fresh runtime
4. **`runHandler`** — executes against the hoisted runtime

This ensures:
- Deterministic execution (no references to closure state)
- Validation that the capsule tree is fully serializable
- Consistent behavior between development and production

### When `runFromSnapshot: false`

Skips freeze/hoist and runs directly in memory. The `runHandler` operates on the same runtime that created the capsules. **Only use as a last resort** when:
- A specific capsule property cannot be serialized (fix the serialization instead)
- Debugging a freeze/hoist issue in the encapsulate library

---

## 10. File Organization

### Capsule files

```
packages/<package>/caps/
├── MyCapsule.ts              # Reusable capsule
├── AnotherCapsule.ts
└── patterns/                 # Domain-specific patterns
    └── my-domain/
        └── PatternCapsule.ts
```

### Test files

```
packages/<package>/
├── feature.ts                # Source file
├── feature.test.ts           # Test file (same directory)
└── __snapshots__/
    └── feature.test.ts.snap.json  # Auto-generated snapshots
```

### CLI / workflow files

```
packages/<package>/
├── build.cli.ts              # CLI entry point
└── deploy.cli.ts
```

---

## 11. Quick Reference: Writing a New Test

```
1. Create <feature>.test.ts next to the source file
2. Add shebang:           #!/usr/bin/env bun test
3. Import:                import * as bunTest from 'bun:test'
                          import { run } from '@stream44.studio/t44/standalone-rt'
4. Top-level run():       Map ProjectTest + capsules under test
5. Set capsuleName:       @scope/package/path.test (must match module path)
6. Destructure:           test: { describe, it, expect, expectSnapshotMatch }
7. Write tests:           Use describe/it/expect from the test capsule
8. Run:                   t <path-to-test-file>
9. Update snapshots:      bun test --update-snapshots <path>
```

### Decision Checklist

- **Testing a capsule?** → Map it alongside `ProjectTest`, use `describe`/`it`/`expect` from `test`
- **Need snapshot assertions?** → Use `expectSnapshotMatch(actual)` from `test`
- **Need a working directory?** → Use `test.workbenchDir` (auto-emptied)
- **Need a random port?** → Use `await test.getRandomPort()`
- **Need env vars?** → Use `test.getEnvValue('VAR_NAME')` (auto-loads `.env` files)
- **Need to spawn processes?** → Use `test.lib.spawnProcess(options)`
- **Need HTTP polling?** → Use `test.lib.waitForFetch(options)`
- **Building a CLI workflow?** → Map `TaskWorkflow`, use `serial`/`parallel`/`step`/`run`
- **Capturing runtime events?** → Set `captureEvents: true` in `run()` options
- **Snapshot mode failing?** → Investigate root cause first; `runFromSnapshot: false` is a last resort

---

## 12. Common Gotchas

| Problem | Cause | Fix |
|---|---|---|
| `run` implicit any lint | Known TS lint for `standalone-rt` | Non-blocking, ignore |
| Snapshot failures after structural changes | Snapshots are stale | `bun test --update-snapshots` |
| `test.describe` is undefined | `bunTest` not passed in options | Ensure `options: { '#': { bunTest, env: {} } }` |
| `workbenchDir` not available | `importMeta` not passed in `run()` options | Add `importMeta: import.meta` to `run()` options |
| `MISSING_CREDENTIALS` error | Test requires env var not set | Set in `.env` or `.env.dev`, or test auto-skips |
| Multiple snapshots with same key | Same `describe`/`it` path called twice | Each call auto-increments `#N` counter |
| Capsule not found | `capsule['#']` doesn't match filesystem path | Verify `@scope/package/subpath` matches `tsconfig.paths.json` |
| `runFromSnapshot` fails | Capsule tree contains non-serializable values | Fix the capsule property (use `Literal` instead of raw JS objects), or fix serialization in encapsulate library |
| Event capture produces empty file | No membrane events occurred | Ensure `captureEvents: true` AND that code actually accesses capsule properties |
| `apis[spine.capsuleSourceLineRef]` is undefined | Spine not properly returned from `encapsulateHandler` | Ensure `return { spine }` in the handler |

---

## 13. Mapping Capsules in Tests (Instead of Direct Imports)

After refactoring a module to export a capsule (instead of classes/functions), tests must **map the capsule** via `CapsulePropertyTypes.Mapping` instead of importing directly.

### Before (direct import):
```typescript
import { ServerClient, broadcast } from './server-client';
// Use directly: new ServerClient(), broadcast(...)
```

### After (capsule mapping):
```typescript
const {
    test,
    test: { describe, it, expect, beforeAll, afterAll, verbose },
    serverClient,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest, env: {} } }
                },
                serverClient: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './server-client',
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@my-org/my-package/server/my-test',
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

// Use capsule API: serverClient.init(), serverClient.broadcast(), etc.
```

### Key migration steps:
1. Remove direct `import { ... } from './module'` statements
2. Add `CapsulePropertyTypes.Mapping` entry for the capsule in the `run()` call
3. Destructure the mapped capsule from the `run()` result
4. Replace `new ClassName(...)` with the capsule instance (already instantiated)
5. Replace standalone function calls (e.g., `broadcast(...)`) with capsule method calls (e.g., `serverClient.broadcastOnce(...)`)
6. If tests spawn the module as a child process, point to the `.bin.ts` boot file instead

### Test utilities via `test.lib.*`:
Instead of importing Node/Bun modules directly, use `test.lib` (mapped from `@stream44.studio/t44/caps/ProjectTestLib`):

| Direct import | Use instead |
|---|---|
| `import { join } from 'path'` | `test.lib.path.join(...)` |
| `import { readFile } from 'fs/promises'` | `test.lib.fs.readFile(...)` |
| `import { spawn } from 'child_process'` | `test.lib.childProcess.spawn(...)` |
| `import dgram from 'node:dgram'` | `test.lib.dgram.createSocket(...)` |

### Port allocation:
```typescript
// Single port
const port = await test.getRandomPort();

// Pool of unique ports (pre-allocated) — returns { ports, nextPort() }
const portPool = await test.getRandomPortPool({ size: 30 });
const port1 = portPool.nextPort(); // get next available port
const port2 = portPool.nextPort(); // get another
// portPool.ports — full array of pre-allocated ports
```

---

## 14. Standalone-rt Internals

For reference, here is what `standalone-rt.ts` does under the hood:

1. **Finds package root** — walks up from `importMeta.dir` looking for `package.json`
2. **Creates `CapsuleSpineFactory`** with:
   - `spineFilesystemRoot` — the package root
   - `capsuleModuleProjectionRoot` — `importMeta.dir`
   - `enableCallerStackInference: true`
   - `spineContracts` — `CapsuleSpineContract.v0` (Membrane.v0)
   - `onMembraneEvent` — event handler for tracing and capture
3. **Calls `encapsulateHandler`** with `{ encapsulate, CapsulePropertyTypes, makeImportStack }`
4. **Freeze + hoist** (unless `runFromSnapshot: false`):
   - `freeze()` — serializes the capsule tree
   - `hoistSnapshot({ snapshot })` — deserializes into fresh runtime
5. **Calls `run()`** with:
   - `overrides` for `ProjectTest` and `IpfsWorkbench`
   - `saveMembraneEvents` flag
6. **Inside `run()` callback**: calls `runHandler` with merged context
7. **Writes `.events.json`** if capture was enabled and events were collected
8. **Returns** the result from `runHandler`

---
