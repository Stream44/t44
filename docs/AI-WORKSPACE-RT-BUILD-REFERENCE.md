> **⚠️ AI Agent Instructions — Keep This Document Up To Date**
>
> This is a **living reference document** maintained by AI agents during development sessions.
> When you learn something new about the topics covered here — a gotcha, a pattern, a fix —
> **add it to the relevant section** (or create a new one). Keep entries concise and code-first.
> Do **not** delete existing content unless it is provably wrong or obsolete.

---

# t44 Workspace Runtime — Build Reference

The **workspace runtime** (`@stream44.studio/t44/workspace-rt`) is the entry point for building and running **workspace-level** capsule programs — CLI tools, shell integrations, workspace tests, and multi-project orchestration within a t44 workspace. It wraps the `@stream44.studio/encapsulate` library with a `run()` function that handles workspace root discovery, spine initialization, snapshot serialization, override injection, and membrane event tracing.

This document covers **how the workspace runtime works, how to write CLI programs, shell integrations, workspace-level tests, and how to compose workspace capsules**. For standalone (non-workspace) test files and capsule definition internals, see the companion references.

> **Further reading**:
> - [AI-STANDALONE-RT-BUILD-REFERENCE.md](./AI-STANDALONE-RT-BUILD-REFERENCE.md) — standalone-rt `run()`, test file patterns, ProjectTest, TaskWorkflow
> - [AI-ENCAPSULATE-BUILD-REFERENCE.md](./AI-ENCAPSULATE-BUILD-REFERENCE.md) — capsule definition patterns, property types, spine contracts

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Your CLI / test / shell file                                │
│    import { run } from '@stream44.studio/t44/workspace-rt'            │
│    OR                                                        │
│    import { run } from '../workspace-rt'                     │
│                                                              │
│    const result = await run(                                 │
│      encapsulateHandler,   ← defines capsule tree            │
│      runHandler,           ← uses capsule APIs               │
│      options               ← runtime config                  │
│    )                                                         │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  workspace-rt.ts                                             │
│    • findWorkspaceRoot() — walks up to .workspace/           │
│    • CapsuleSpineFactory (Membrane)                       │
│    • spineFilesystemRoot = workspaceRootDir                  │
│    • freeze() + hoistSnapshot() (always)                     │
│    • Overrides: WorkspaceConfig, ProjectTest, IpfsWorkbench  │
│    • Optional: TimingObserver + membrane event tracing       │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  @stream44.studio/encapsulate                                │
│    • encapsulate() — capsule definition                      │
│    • SpineRuntime — instantiation + lifecycle                │
│    • CapsuleSpineContract.v0/Membrane — proxy API        │
└─────────────────────────────────────────────────────────────┘
```

### workspace-rt vs standalone-rt

| Aspect | `workspace-rt` | `standalone-rt` |
|---|---|---|
| **Import** | `@stream44.studio/t44/workspace-rt` | `@stream44.studio/t44/standalone-rt` |
| **Workspace root** | Auto-discovered via `.workspace/workspace.yaml` walk-up | Uses `importMeta.dir` to find package root |
| **`spineFilesystemRoot`** | `workspaceRootDir` (the workspace root) | Package root (nearest `package.json`) |
| **`init` command** | Creates `.workspace/workspace.yaml` if `process.argv` includes `init` | N/A |
| **Snapshot mode** | Always `freeze() + hoistSnapshot()` (no opt-out) | Configurable via `runFromSnapshot` option |
| **Overrides injected** | `WorkspaceConfig`, `ProjectTest`, `IpfsWorkbench` | `ProjectTest`, `IpfsWorkbench` |
| **Event capture** | Via `--trace` CLI flag (logged to stderr) | Via `captureEvents` option (persisted to `.events.json`) |
| **Primary use** | CLI tools (`bin/t44`), shell integration, workspace tests | Test files, model runners, CLI workflows |

### When to use which

- **Writing a test file** for a capsule or feature → use `standalone-rt`
- **Writing workspace-level integration tests** that exercise the `t44` CLI → use `workspace-rt`
- **Building the `t44` CLI or shell integration** → use `workspace-rt`
- **Building a standalone CLI workflow** (TaskWorkflow) → use `standalone-rt`

---

## 2. The `run()` Function

```typescript
import { run } from '@stream44.studio/t44/workspace-rt'

const result = await run(
    encapsulateHandler,
    runHandler,
    options?
)
```

### Parameters

#### `encapsulateHandler(context) → { spine, ...extras }`

Receives `{ encapsulate, CapsulePropertyTypes, makeImportStack }` and must return an object containing at least a `spine`. Any additional properties are passed through to the `runHandler`.

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
        capsuleName: '@scope/package/path',
    })
    return { spine }
}
```

#### `runHandler(context) → result`

Receives merged context: everything from `encapsulateHandler`'s return value plus `{ apis, spineFilesystemRoot }`. The `apis` object contains proxy-wrapped capsule instances keyed by `capsuleSourceLineRef`.

```typescript
async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}
```

#### `options` (optional)

| Option | Type | Default | Description |
|---|---|---|---|
| `importMeta` | `{ dir: string }` | — | `import.meta` of the calling file. Used to set `ProjectTest.testRootDir` override. |

**Note**: Unlike `standalone-rt`, `workspace-rt` does **not** have `runFromSnapshot` or `captureEvents` options. Snapshot mode is always on, and event tracing is controlled by `--trace` CLI flag.

---

## 3. Workspace Root Discovery

`workspace-rt` discovers the workspace root by walking up the directory tree from `process.cwd()` looking for `.workspace/workspace.yaml`:

```
process.cwd()
  └── .workspace/workspace.yaml  ← found? → this is workspaceRootDir
      OR walk to parent...
```

**Special case: `init` command**

If `process.argv` includes `init`, instead of searching, the runtime:
1. Creates `.workspace/` directory in `process.cwd()`
2. Writes a minimal `workspace.yaml` that extends `@stream44.studio/t44/workspace.yaml`
3. Returns `process.cwd()` as the workspace root

This bootstrap mechanism allows `t44 init` to work in a fresh directory.

### The workspace.yaml file

```yaml
extends:
  - '@stream44.studio/t44/workspace.yaml'
```

This extends the default t44 workspace configuration, which defines:
- **CLI commands** (`init`, `info`, `query`, `test`, `dev`, `push`, `pull`, `deploy`)
- **Shell commands** (`44`, `help`, `a`, `i`, `info`, `p`, `h`, `dev`, `deploy`)
- **Shell environment variables** (`F_WORKSPACE_DIR`, etc.)

The config file supports **inheritance** via `extends` — child configs can extend parent configs, forming a tree. The workspace config system resolves `resolve('${__dirname}/..')` expressions relative to the config file's directory.

---

## 4. Automatic Overrides

The workspace runtime injects overrides for three capsules:

```typescript
overrides: {
    ['@stream44.studio/t44/caps/WorkspaceConfig']: {
        '#': {
            workspaceRootDir    // ← discovered workspace root
        }
    },
    ['@stream44.studio/t44/caps/ProjectTest']: {
        '#': {
            testRootDir: options?.importMeta?.dir
        }
    },
    ['@stream44.studio/t44-ipfs.tech/caps/IpfsWorkbench']: {
        '#': {
            cacheDir: join(workspaceRootDir, '.~o/workspace.foundation',
                          '@stream44.studio~t44-ipfs.tech~caps~IpfsWorkbench', 'daemons')
        }
    }
}
```

**Key difference from standalone-rt**: The `WorkspaceConfig.workspaceRootDir` override is what makes workspace capsules aware of the workspace root directory. This is the foundation for all workspace operations.

---

## 5. Tracing Mode

Pass `--trace` as a CLI argument to enable detailed timing and membrane event logging:

```bash
bun bin/t44 info --trace
```

When `--trace` is present:
1. **TimingObserver** records timing for each major phase (`INIT SPINE`, `ENCAPSULATE`, `FREEZE`, `HOIST SNAPSHOT`, `RUN`, `DONE`)
2. **Membrane events** are logged to stderr in real time with colored output:
   ```
   [0]  call          /path/to/capsule.ts:42  .methodName  from caller:15
   [1]  call-result   /path/to/capsule.ts:42  .methodName  from caller:15
   [2]  get           /path/to/capsule.ts:42  .propName    from caller:20
   ```

---

## 6. CLI Entry Points (bin/)

The workspace provides three entry points in `t44.sh/packages/t44/bin/`:

### `bin/t44` — Main CLI

The primary workspace CLI. Maps `WorkspaceCli` capsule and calls `runCli(process.argv)`.

```typescript
#!/usr/bin/env bun

import { run } from '../workspace-rt'

await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                cli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceCli'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44/.workspace/bin/t44'
    })
    return { spine }
}, async ({ spine, apis }) => {
    const runCli = await apis[spine.capsuleSourceLineRef].cli.runCli
    await runCli(process.argv)
})
```

**Usage**: `t44 <command> [options]`

Available commands (defined in `WorkspaceConfig.yaml`):

| Command | Capsule | Description |
|---|---|---|
| `init` | `WorkspaceInit` | Initialize a new workspace |
| `activate` | `WorkspaceShell` | Generate shell environment exports |
| `info` | `WorkspaceInfo` | Display workspace information |
| `query` | `WorkspaceModel` | Query the workspace entity model |
| `test` | `ProjectTesting` | Run project/package tests |
| `dev` | `ProjectDevelopment` | Run dev servers |
| `push` | `ProjectPublishing` | Publish to git/npm providers |
| `pull` | `ProjectPulling` | Sync from remote branches |
| `deploy` | `ProjectDeployment` | Deploy to hosting providers |

**Global flags**:
- `--trace` — Timing + event logging
- `--yes` — Auto-confirm all prompts
- `--now` — Fetch fresh data instead of cached

### `bin/shell` — Shell Integration

Maps `WorkspaceShellCli` capsule. Used for `--help` display of shell commands. Shell commands themselves are sourced (not executed) via `bin/activate.ts`.

### `bin/activate.ts` — Shell Activation

Maps `WorkspaceCli` and calls `cliCommands.activate()` to generate shell `export` statements and function definitions that are sourced into the user's shell.

**Activation flow**:
1. `WorkspaceShell.run()` outputs `export VAR="value"` statements
2. Loads `WorkspaceShell.sh` template
3. Dynamically generates shell functions from `WorkspaceShell.yaml` config
4. Replaces `#${COMMANDS}` placeholder in the shell script
5. Outputs the complete shell script for sourcing

---

## 7. Workspace Capsule Catalog

### Shared Utility Capsules

#### `@stream44.studio/t44/caps/WorkspaceLib`

Shared utility capsule providing common Node.js/Bun modules as capsule properties. Workspace capsules should map this instead of using direct imports for `chalk`, `$`, `yaml`, `path`, `fs`, etc. See [Section 15: WorkspaceLib Import Pattern](#15-workspacelib-import-pattern) for usage guidance.

| Property | Type | Description |
|---|---|---|
| `path` | `Constant` | Node.js `path` module |
| `fs` | `Constant` | `fs/promises` + `fs.constants` + `existsSync` merged |
| `$` | `Constant` | Bun shell (`import { $ } from 'bun'`) |
| `chalk` | `Constant` | Chalk terminal styling library |
| `yaml` | `Constant` | `js-yaml` YAML parser/serializer |
| `childProcess` | `Constant` | Node.js `child_process` module |
| `dgram` | `Constant` | Node.js `dgram` module |
| `spawnProcess(options)` | `Function` | Spawn a child process with stdout/stderr capture |
| `runPackageScript(options)` | `Function` | Run a package.json script via `bun run <script>` |
| `waitForFetch(options)` | `Function` | Poll a URL until it responds |

> **Note**: `@stream44.studio/t44/caps/ProjectTestLib` is a backward-compatible re-export of `WorkspaceLib`.

### Core Infrastructure Capsules

#### `@stream44.studio/t44/caps/WorkspaceConfig`

Central configuration capsule. Loads and validates `workspace.yaml` with inheritance resolution.

| Property | Type | Description |
|---|---|---|
| `workspaceRootDir` | `Literal` | Set by workspace-rt override. The root directory of the workspace. |
| `config` | `GetterFunction` | Loads the full merged config from `workspace.yaml` (with extends resolution). |
| `configTree` | `GetterFunction` | Returns the config file inheritance tree structure. |
| `entitySources` | `GetterFunction` | Returns a map of entity names to their source file locations. |
| `ensureConfigBase()` | `Function` | Ensures `rootDir` and `rootConfigFilepath` are set in config. |
| `ensureConfigIdentity()` | `Function` | Ensures `name` and `identifier` (DID) are set — prompts user if missing. |
| `setConfigValue(path, value)` | `Function` | Writes a value to the workspace config file. |

**Mapped sub-capsules**: `WorkspacePrompt`, `HomeRegistry`, `WorkspaceConfigFile`

#### `@stream44.studio/t44/caps/WorkspaceConfigFile`

Low-level YAML config file operations. Handles loading, merging, `extends` resolution, `resolve()` expression evaluation, and atomic writes.

#### `@stream44.studio/t44/caps/WorkspaceConnection`

Encrypted credential storage for external service connections (Bunny.net, Vercel, GitHub, etc.).

| Property | Type | Description |
|---|---|---|
| `getFilepath()` | `Function` | Returns the encrypted credential file path for this connection type. |
| `getStoredConfig()` | `Function` | Loads and decrypts the stored credentials. Returns `null` if not configured. |
| `setStoredConfig(config)` | `Function` | Encrypts and saves credentials (AES-256-GCM per-value encryption). |
| `getConfigValue(key)` | `Function` | Gets a specific credential — prompts user interactively if missing. |

**⚠️ NEVER delete connection config files programmatically.** They contain encrypted credentials. If decryption fails, log an error and let the user investigate.

#### `@stream44.studio/t44/caps/WorkspacePrompt`

Interactive terminal prompts (input, confirm, select). Respects `--yes` flag for automated workflows.

#### `@stream44.studio/t44/caps/HomeRegistry`

Manages the home directory registry (`~/.o/workspace.foundation/`) which stores workspace identities, keys, and rack registrations across workspaces.

#### `@stream44.studio/t44/caps/Home`

Provides the home directory path (typically `~`). Respects `T44_HOME_DIR` env var for test isolation.

### Identity & Security Capsules

#### `@stream44.studio/t44/caps/WorkspaceKey`

Manages workspace encryption keys for credential storage. Keys are passphrase-protected (`T44_KEYS_PASSPHRASE` env var in tests).

#### `@stream44.studio/t44/caps/RootKey`

Manages the root SSH key (`~/.ssh/id_t44_ed25519`).

#### `@stream44.studio/t44/caps/SigningKey`

Manages the signing SSH key (`~/.ssh/id_t44_signing_ed25519`).

#### `@stream44.studio/t44/caps/ProjectRack`

Manages the project rack — a registry of all projects in the workspace with their DIDs and git repositories.

### CLI & Shell Capsules

#### `@stream44.studio/t44/caps/WorkspaceCli`

The main CLI orchestrator. Maps all workspace capsules and wires up commander.js commands from `WorkspaceCliConfig`.

| Property | Type | Description |
|---|---|---|
| `runCli(argv)` | `Function` | Parses argv with commander.js and dispatches to the appropriate capsule. |
| `cliCommands` | `GetterFunction` | Returns a map of command names to async functions (loaded from config). |
| `jsApi` | `GetterFunction` | Returns the JavaScript API as defined in the workspace config. |
| `spawnCli(options)` | `Function` | Spawns a child `t44` CLI process. Used by tests. |
| `validateIdentities()` | `Function` | Validates workspace, key, and rack identities against the home registry. |

**CLI startup sequence** (in `runCli`):
1. Parse `--yes` and `--now` flags
2. Detect `init --from <path>` early for config pre-population
3. `WorkspaceConfig.ensureConfigBase()` — ensure rootDir is set
4. `HomeRegistry.ensureRootDir()` — ensure home registry exists
5. `WorkspaceConfig.ensureConfigIdentity()` — ensure name + DID
6. `validateIdentities()` — check registry consistency
7. `RootKey.ensureKey()` — ensure SSH root key
8. `SigningKey.ensureKey()` — ensure SSH signing key
9. `WorkspaceKey.ensureKey()` — ensure encryption key
10. `ProjectRack.ensureRack()` — ensure project rack
11. `WorkspaceProjects.ensureIdentifiers()` — ensure project DIDs
12. `ProjectCatalogs.validate()` — validate catalog config
13. Parse and dispatch command via commander.js

#### `@stream44.studio/t44/caps/WorkspaceShellCli`

Shell command CLI (used by `bin/shell`). Reads `shell.commands` from config and registers them as commander.js commands. Shell commands cannot be run directly — they must be sourced into the shell.

#### `@stream44.studio/t44/caps/WorkspaceShell`

Generates the shell activation script. Outputs `export` statements for environment variables and dynamically generates shell functions from config.

#### `@stream44.studio/t44/caps/WorkspaceInit`

Handles `t44 init` and `t44 init --from <path>`. The `--from` variant copies HomeRegistryConfig, WorkspaceKeyConfig, and ProjectRackConfig from a source workspace.

### Project Management Capsules

#### `@stream44.studio/t44/caps/WorkspaceProjects`

Discovers and manages projects within the workspace. Reads `WorkspaceProjectsConfig` from the workspace config.

#### `@stream44.studio/t44/caps/ProjectTesting`

Orchestrates test execution across workspace projects.

| Feature | Description |
|---|---|
| Project/package discovery | Scans `packages/` subdirectories for `package.json` with `test` scripts |
| Selector resolution | Matches by name, path, or walk-up from current directory |
| Parallel mode (`-p`) | Runs matched tests concurrently |
| Timeout (`-t N`) | Kills tests after N seconds |
| Linux VM (`--linux`) | Stages and runs tests in OrbStack VMs |

#### `@stream44.studio/t44/caps/ProjectPublishing`

Multi-provider publishing orchestrator. Lifecycle steps: `validateSource` → `prepareSource` → `bump` → `ensureRemote` → `prepare` → `tag` → `push` → `afterPush`.

Provider tags (`git`, `pkg`) allow filtering with `--git` or `--pkg` flags.

#### `@stream44.studio/t44/caps/ProjectDeployment`

Multi-provider deployment orchestrator. Supports `deploy`, `deprovision`, and `status` lifecycle methods. Dynamically loads provider capsules via `importCapsule`.

#### `@stream44.studio/t44/caps/ProjectPulling`

Syncs changes from remote branch URLs into the local workspace.

#### `@stream44.studio/t44/caps/ProjectDevelopment`

Runs dev servers for workspace projects.

### Information & Modeling Capsules

#### `@stream44.studio/t44/caps/WorkspaceInfo`

Displays comprehensive workspace information: config tree, projects, repositories, deployments, and provider status.

#### `@stream44.studio/t44/caps/WorkspaceModel`

Queries the workspace entity model. Resolves schemas, config entities, fact entities, connection entities, and registry entities. Supports entity filtering by name or path.

#### `@stream44.studio/t44/caps/WorkspaceEntityConfig`

Base capsule for entities that store configuration in the workspace YAML files.

#### `@stream44.studio/t44/caps/WorkspaceEntityFact`

Base capsule for entities that store runtime facts as JSON files in `.~o/workspace.foundation/`.

#### `@stream44.studio/t44/caps/JsonSchemas`

Manages JSON schemas for workspace entities. Schemas are stored in `.~o/workspace.foundation/@stream44.studio~t44~caps~JsonSchemas/`.

---

## 8. Workspace Config System

### Config File Inheritance

Workspace configuration uses a **YAML inheritance chain** via `extends`:

```
.workspace/workspace.yaml
  extends:
    - '@stream44.studio/t44/workspace.yaml'        ← npm package config
        extends:
          - ./WorkspaceShell.yaml          ← relative path
```

Each config file can define entities using struct keys:

```yaml
"#@stream44.studio/t44/structs/WorkspaceConfig":
  name: my-workspace
  identifier: did:key:z6Mk...
  rootDir: /path/to/workspace
```

### Struct Keys

Config entities are namespaced with `#` prefix struct keys:

| Struct Key | Purpose |
|---|---|
| `#@stream44.studio/t44/structs/WorkspaceConfig` | Workspace identity (name, DID, rootDir) |
| `#@stream44.studio/t44/structs/WorkspaceKeyConfig` | Workspace encryption key config |
| `#@stream44.studio/t44/structs/ProjectRackConfig` | Project rack identity |
| `#@stream44.studio/t44/structs/HomeRegistryConfig` | Home registry directory config |
| `#@stream44.studio/t44/structs/WorkspaceCliConfig` | CLI commands and JavaScript API |
| `#@stream44.studio/t44/structs/WorkspaceShellConfig` | Shell commands and environment |
| `#@stream44.studio/t44/structs/ProjectPublishingConfig` | Repository publishing providers |
| `#@stream44.studio/t44/structs/ProjectDeploymentConfig` | Deployment providers |
| `#@stream44.studio/t44/structs/WorkspaceProjectsConfig` | Project list and git metadata |
| `#@stream44.studio/t44/structs/WorkspaceMappingsConfig` | Package name remapping (workspace → npm) |
| `#@stream44.studio/t44/structs/ProjectCatalogsConfig` | Project catalog groupings |

### Dynamic Expressions in Config

Config values support dynamic expressions:

- **`resolve('${__dirname}/..')`** — Resolves a path relative to the config file's directory
- **`jit(pick('path/to/file.json', 'JSONPath'))`** — Loads a JSON file and extracts a value at runtime

---

## 9. Capsule Definition Pattern (in workspace context)

All workspace capsules follow the same export pattern:

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
            // Optional struct bindings:
            '#@stream44.studio/t44/structs/SomeConfig': {
                as: '$config'    // ← access merged config via this.$config
            },
            '#': {
                // Mapped sub-capsules
                SubCapsule: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/SubCapsule'
                },
                // Properties (Literal, Function, GetterFunction, Constant, etc.)
                myProp: {
                    type: CapsulePropertyTypes.Literal,
                    value: 'default'
                },
                myMethod: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, args: any): Promise<void> {
                        // Access other capsules via this.SubCapsule
                        // Access struct config via this.$config.config
                        // Access own properties via this.myProp
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
capsule['#'] = '@stream44.studio/t44/caps/MyCapsule'
```

### Key Patterns

1. **`capsule['#']`** — The capsule's canonical name. Set after the function definition. Used for `capsuleName` in `encapsulate()` options.

2. **Struct bindings** — Access workspace config structs via `as: '$alias'`. The config is loaded from the inherited YAML chain.
   ```typescript
   '#@stream44.studio/t44/structs/WorkspaceCliConfig': {
       as: '$config'
   }
   // Then in methods: this.$config.config
   ```

3. **Mapping sub-capsules** — Compose capsules by mapping them as properties:
   ```typescript
   WorkspaceConfig: {
       type: CapsulePropertyTypes.Mapping,
       value: '@stream44.studio/t44/caps/WorkspaceConfig'
   }
   // Then in methods: this.WorkspaceConfig.workspaceRootDir
   ```

4. **Dynamic capsule loading** — Load capsules at runtime:
   ```typescript
   const { api } = await this.self.importCapsule({ uri: '@stream44.studio/t44/caps/SomeCapsule' })
   await api.someMethod()
   ```

---

## 10. Writing Workspace Tests

Workspace tests use `workspace-rt` to test the full CLI and workspace lifecycle. They map `ProjectTest` alongside `WorkspaceCli` to get both test utilities and CLI capabilities.

### Complete Workspace Test Template

```typescript
#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/workspace-rt'

const {
    test: { describe, it, expect, beforeAll, workbenchDir, lib: { fs, path } },
    cli,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: {
                        '#': {
                            bunTest,
                        }
                    }
                },
                cli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceCli'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44/examples/my-feature/main.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

// Set up isolated workspace environment
const homeDir = path.join(workbenchDir, 'my-test', 'home')
const repoDir = path.join(workbenchDir, 'my-test', 'repo')
const env = { T44_HOME_DIR: homeDir, T44_KEYS_PASSPHRASE: 't44-test' }

async function runT44(...args: string[]) {
    return cli.spawnCli({ cwd: repoDir, args, env, timeout: 15_000 })
}

describe('My Feature', function () {

    beforeAll(async () => {
        // Clean up and create fresh directories
        await fs.rm(path.join(workbenchDir, 'my-test'), { recursive: true, force: true })
        await fs.mkdir(homeDir, { recursive: true })
        await fs.mkdir(path.join(homeDir, '.ssh'), { recursive: true })
        await fs.mkdir(repoDir, { recursive: true })

        // Initialize workspace
        const { exitCode, stdout, stderr } = await runT44('init')
        if (exitCode !== 0) {
            throw new Error(`t44 init failed: ${stderr}`)
        }
    }, 30_000)

    it('runs a CLI command', async () => {
        const { exitCode, stdout } = await runT44('info')
        expect(exitCode).toBe(0)
        expect(stdout).toContain('WORKSPACE INFORMATION')
    }, 15_000)
})
```

### Key Points

1. **`cli.spawnCli(options)`** — Spawns an isolated `t44` CLI child process with custom env:
   ```typescript
   const { exitCode, stdout, stderr } = await cli.spawnCli({
       cwd: repoDir,        // working directory
       args: ['info'],       // CLI arguments
       env: {                // environment overrides
           T44_HOME_DIR: homeDir,
           T44_KEYS_PASSPHRASE: 't44-test'
       },
       timeout: 15_000       // kill after N ms
   })
   ```

2. **Test isolation** — Every workspace test creates an isolated home directory (`T44_HOME_DIR`) and repo directory. This prevents tests from interfering with the real workspace.

3. **`T44_KEYS_PASSPHRASE`** — Set to a known value (`'t44-test'`) so key generation doesn't prompt for input.

4. **`--yes` flag** — `spawnCli` automatically appends `--yes` to skip interactive prompts.

5. **`workbenchDir`** — Auto-emptied per-test working directory from `ProjectTest`. Creates nested directories for test isolation.

6. **Timeouts** — Workspace tests are slow (multiple process spawns). Use generous timeouts: `15_000` for single commands, `30_000` for `beforeAll` setup.

---

## 11. Workspace Filesystem Layout

### Core workspace structure

```
<workspaceRootDir>/
├── .workspace/
│   └── workspace.yaml              ← Workspace config (extends t44 base config)
├── .~o/
│   └── workspace.foundation/       ← Runtime artifacts (gitignored)
│       ├── @stream44.studio~t44~caps~JsonSchemas/
│       ├── @stream44.studio~t44~caps~WorkspaceEntityFact/
│       ├── @stream44.studio~t44~caps~ProjectDeployment/
│       ├── @stream44.studio~t44~caps~ProjectPublishing/
│       ├── @stream44.studio~t44~caps~ProjectTesting/
│       └── workbenches/            ← Test workbench directories
├── <project-a>/                    ← Project directories
│   ├── packages/
│   │   └── <package>/
│   │       └── package.json
│   ├── package.json
│   └── tsconfig.json
├── <project-b>/
│   └── ...
├── package.json                    ← Root package.json (bun workspaces)
└── tsconfig.json
```

### Home registry structure

```
~/.o/workspace.foundation/          ← Home registry (T44_HOME_DIR overrides ~)
├── @stream44.studio~t44~structs~HomeRegistry/
│   └── registry.json
├── @stream44.studio~t44~structs~ProjectRack/
│   └── <workspace-name>/
│       └── @stream44.studio~t44~caps~ProjectRepository/
│           └── <did>/              ← One per project
├── @stream44.studio~t44~caps~WorkspaceConnection/
│   └── <workspace-name>/
│       └── <struct~name>.json      ← Encrypted credentials
└── workspaces/
    └── <workspace-name>.json       ← Workspace identity (DID + private key)
```

### t44 package structure

```
t44.sh/packages/t44/
├── bin/
│   ├── t44                         ← Main CLI entry point
│   ├── shell                       ← Shell CLI entry point
│   └── activate.ts                 ← Shell activation script
├── caps/
│   ├── WorkspaceCli.ts             ← CLI orchestrator
│   ├── WorkspaceConfig.ts          ← Config loader
│   ├── WorkspaceConfigFile.ts      ← YAML operations
│   ├── WorkspaceConfig.yaml        ← Default CLI config
│   ├── WorkspaceConnection.ts      ← Encrypted credential storage
│   ├── WorkspaceInfo.ts            ← Info display
│   ├── WorkspaceInit.ts            ← Init command
│   ├── WorkspaceKey.ts             ← Encryption key management
│   ├── WorkspaceModel.ts           ← Entity model query
│   ├── WorkspaceProjects.ts        ← Project discovery
│   ├── WorkspacePrompt.ts          ← Interactive prompts
│   ├── WorkspaceShell.ts           ← Shell activation
│   ├── WorkspaceShell.sh           ← Shell script template
│   ├── WorkspaceShell.yaml         ← Shell commands config
│   ├── WorkspaceShellCli.ts        ← Shell CLI
│   ├── ProjectDeployment.ts        ← Deployment orchestrator
│   ├── ProjectDevelopment.ts       ← Dev server runner
│   ├── ProjectPublishing.ts        ← Publishing orchestrator
│   ├── ProjectPulling.ts           ← Remote sync
│   ├── ProjectRack.ts              ← Project rack
│   ├── ProjectRepository.ts        ← Git repository management
│   ├── ProjectTest.ts              ← Test harness
│   ├── WorkspaceLib.ts             ← Shared workspace utilities (fs, path, $, chalk, yaml, spawn)
│   ├── ProjectTestLib.ts           ← Backward-compat re-export of WorkspaceLib
│   ├── ProjectTesting.ts           ← Test orchestrator
│   ├── ProjectCatalogs.ts          ← Project catalog management
│   ├── TaskWorkflow.ts             ← Task workflow (standalone-rt)
│   └── patterns/
│       ├── git-scm.com/ProjectPublishing.ts
│       └── semver.org/ProjectPublishing.ts
├── docs/
│   ├── AI-ENCAPSULATE-BUILD-REFERENCE.md
│   ├── AI-STANDALONE-RT-BUILD-REFERENCE.md
│   └── AI-WORKSPACE-RT-BUILD-REFERENCE.md  ← This file
├── examples/
│   ├── 01-Init/main.test.ts        ← Init lifecycle tests
│   ├── 02-Basics/main.test.ts      ← CLI lifecycle tests
│   └── 03-Testing/main.test.ts     ← Test command tests
├── standalone-rt.ts                ← Standalone runtime
├── workspace-rt.ts                 ← Workspace runtime (this doc)
└── workspace.yaml                  ← Base workspace config
```

---

## 12. Provider Capsule Architecture

The workspace uses a **provider pattern** where deployment, publishing, and pulling operations are delegated to external capsules:

### Publishing Providers

Located in sibling packages (`t44-github.com`, `t44-npmjs.com`, etc.):

```
t44.sh/packages/
├── t44-github.com/caps/ProjectPublishing.ts    ← GitHub push
├── t44-npmjs.com/caps/ProjectPublishing.ts     ← npm publish
├── t44-bunny.net/caps/                         ← Bunny.net CDN
│   ├── api-storage.test.ts
│   └── StaticWebsite/ProjectDeployment.ts
├── t44-vercel.com/caps/                        ← Vercel deployment
│   ├── api.test.ts
│   └── ProjectDeployment.ts
├── t44-dynadot.com/caps/                       ← Dynadot DNS
│   ├── api-restful-v1.test.ts
│   └── ProjectDeployment.ts
└── t44-docker.com/caps/Hub.test.ts             ← Docker Hub
```

### Provider Test Pattern

Provider capsule tests use `workspace-rt` (not `standalone-rt`) because they need access to the workspace config and credential system:

```typescript
#!/usr/bin/env bun test --timeout 60000

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/workspace-rt'

const {
    test: { describe, it, expect },
    api,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest } }
                },
                api: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44-vercel.com/caps/Api'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-vercel.com/caps/api.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })
```

Provider tests that require credentials use the `MISSING_CREDENTIALS` pattern to auto-skip when credentials aren't configured.

---

## 13. Quick Reference: Adding a New CLI Command

1. **Add command to `WorkspaceConfig.yaml`**:
   ```yaml
   cli:
     commands:
       mycommand:
         capsule: "@stream44.studio/t44/caps/MyCommandCapsule"
         description: My new command.
         arguments:
           target:
             optional: true
             description: Target to operate on
         options:
           verbose:
             description: Show detailed output
   ```

2. **Create the capsule** in `caps/MyCommandCapsule.ts`:
   ```typescript
   export async function capsule({ encapsulate, CapsulePropertyTypes, makeImportStack }) {
       return encapsulate({
           '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
               '#@stream44.studio/encapsulate/structs/Capsule': {},
               '#': {
                   WorkspaceConfig: {
                       type: CapsulePropertyTypes.Mapping,
                       value: '@stream44.studio/t44/caps/WorkspaceConfig'
                   },
                   run: {
                       type: CapsulePropertyTypes.Function,
                       value: async function (this: any, { args }: any): Promise<void> {
                           const { target, verbose } = args
                           // Implementation here
                       }
                   }
               }
           }
       }, {
           importMeta: import.meta,
           importStack: makeImportStack(),
           capsuleName: capsule['#'],
       })
   }
   capsule['#'] = '@stream44.studio/t44/caps/MyCommandCapsule'
   ```

3. **Add dispatch to `WorkspaceCli.ts`** (in the `cliCommands` getter):
   ```typescript
   } else if (capsule === '@stream44.studio/t44/caps/MyCommandCapsule') {
       await self.MyCommandCapsule.run({ args: commandArgs })
   }
   ```

4. **Map the capsule in `WorkspaceCli.ts`** (in the capsule tree):
   ```typescript
   MyCommandCapsule: {
       type: CapsulePropertyTypes.Mapping,
       value: '@stream44.studio/t44/caps/MyCommandCapsule'
   },
   ```

5. **Optionally add a shell alias** in `WorkspaceShell.yaml`:
   ```yaml
   shell:
     commands:
       mycommand:
         cliCommand: mycommand
   ```

---

## 14. Quick Reference: Adding a New Provider Integration

1. **Create a package** `t44.sh/packages/t44-provider.com/`
2. **Create API capsule(s)** in `caps/` with methods for the provider's REST/GraphQL API
3. **Create a connection struct** for credential schema
4. **Extend `WorkspaceConnection`** for encrypted credential storage
5. **Create test files** using `workspace-rt` — provider tests need workspace config access
6. **Create publishing/deployment capsule** implementing the standard lifecycle interface

---

## 15. WorkspaceLib Import Pattern

### For workspace capsules

Workspace capsules should **map `WorkspaceLib` as `lib`** and access its properties via `this.lib.*` — **never destructure**, always use the full path:

```typescript
export async function capsule({ encapsulate, CapsulePropertyTypes, makeImportStack }) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceLib'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {
                        await this.lib.fs.writeFile(this.lib.path.join('/tmp', 'out.txt'), 'hello')
                        console.log(this.lib.chalk.green('Done'))
                        const data = this.lib.yaml.load(content)
                    }
                }
            }
        }
    }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: capsule['#'] })
}
```

**Rules**:
- Map `WorkspaceLib` with the property name **`lib`** (not `WorkspaceLib`)
- In capsule methods, always use **`this.lib.*`** directly — e.g. `this.lib.path.join(...)`, `this.lib.fs.readFile(...)`, `this.lib.chalk.red(...)`
- **`const lib = this.lib` is ONLY allowed inside `helpers` getters** (see below). Regular capsule methods must use `this.lib.*` directly.
- **Never destructure** — always use `this.lib.path.resolve(...)` not `const { resolve } = this.lib.path`
- **No top-level imports** for modules provided by `WorkspaceLib` (`path`, `fs/promises`, `fs`, `chalk`, `js-yaml`, `fast-glob`, `json-stable-stringify`, `dotenv`, `bun`). The capsule file should have **zero import statements** — all dependencies come through `this.lib.*`
- **Only add direct `import` statements** when `WorkspaceLib` does not provide the module you need (e.g., specialized libraries like `commander`, `inquirer`, `semver`, etc.).

### Helpers getter for utility functions

When a capsule has standalone helper/utility functions that are used by multiple capsule methods, move them into a **memoized `helpers` getter**:

```typescript
'#': {
    lib: {
        type: CapsulePropertyTypes.Mapping,
        value: '@stream44.studio/t44/caps/WorkspaceLib'
    },
    helpers: {
        type: CapsulePropertyTypes.GetterFunction,
        memoize: true,
        value: function (this: any) {
            const lib = this.lib

            function deepMerge(target: any, source: any): any {
                // ... uses lib.path.join(...) etc. via closure
            }

            function formatError(msg: string): string {
                return lib.chalk.red(msg)
            }

            return { deepMerge, formatError }
        }
    },
    run: {
        type: CapsulePropertyTypes.Function,
        value: async function (this: any): Promise<void> {
            const merged = this.helpers.deepMerge(a, b)
            console.log(this.helpers.formatError('oops'))
        }
    }
}
```

**Key points**:
- The `helpers` getter is **memoized** (`memoize: true`) so the function definitions are created once
- **`const lib = this.lib` is ONLY allowed here** — inside the `helpers` getter. Helper functions access `lib` via closure.
- Regular capsule methods (like `run`) use **`this.lib.*`** directly — never `const lib = this.lib`
- Other capsule methods call helpers via `this.helpers.functionName(...)`
- Helper functions can call each other directly (they share the same closure scope)
- This pattern replaces module-level standalone functions and eliminates the need for top-level imports

### Static analyzer: ambient reference errors

The `encapsulate` static analyzer checks that all identifiers used inside capsule property functions are accounted for (imports, locals, builtins, or declared `ambientReferences`). When refactoring:

- **Deleted a standalone function but still reference it in a capsule method?** → Update the call site to `this.helpers.functionName(...)` 
- **Moved a function inside a `helpers` getter but call it before its declaration?** → This is fine (JavaScript hoists function declarations). The static analyzer handles this correctly.
- **Getting `Ambient reference 'X' ... is not provided` errors after removing imports?** → The capsule method still references a bare identifier. Update to `this.lib.*` or `this.helpers.*`
- **Run `t44 info 2>&1 | grep 'Ambient'`** to check for ambient reference errors after changes

**Available `WorkspaceLib` properties**:

| Property | Provides | Replaces direct import |
|---|---|---|
| `path` | Node.js `path` | `import { join, resolve, ... } from 'path'` |
| `fs` | `fs/promises` + `fs.constants` + `existsSync` | `import { readFile, writeFile, ... } from 'fs/promises'` and `import { existsSync, constants } from 'fs'` |
| `$` | Bun shell | `import { $ } from 'bun'` |
| `chalk` | Chalk terminal colors | `import chalk from 'chalk'` |
| `yaml` | js-yaml | `import * as yaml from 'js-yaml'` |
| `glob` | fast-glob | `import glob from 'fast-glob'` |
| `stringify` | json-stable-stringify | `import stringify from 'json-stable-stringify'` |
| `dotenv` | dotenv (`{ config }`) | `import { config as loadDotenv } from 'dotenv'` |
| `childProcess` | Node.js `child_process` | `import * as childProcess from 'child_process'` |
| `dgram` | Node.js `dgram` | `import dgram from 'node:dgram'` |

### For standalone capsules (test files)

Standalone capsules used in test files access `WorkspaceLib` through `test.lib` (the `ProjectTest` capsule maps `WorkspaceLib` internally). They do **not** need to map `WorkspaceLib` separately:

```typescript
const { test: { describe, it, expect, lib } } = await run(/* ... */)

// Use lib properties:
const content = await lib.fs.readFile(filepath, 'utf-8')
const parsed = lib.yaml.load(content)
const fullPath = lib.path.join(dir, 'file.txt')
```

### Migration note

`@stream44.studio/t44/caps/ProjectTestLib` still exists as a backward-compatible re-export of `WorkspaceLib`. New code should use `@stream44.studio/t44/caps/WorkspaceLib` directly.

---

## 16. Common Gotchas

| Problem | Cause | Fix |
|---|---|---|
| `Could not find workspace root` | No `.workspace/workspace.yaml` in any parent | Run `t44 init` first, or check `cwd` |
| `workspaceRootDir` is `undefined` | Override not injected | Ensure using `workspace-rt`, not `standalone-rt` |
| CLI command not found | Missing dispatch in `WorkspaceCli.ts` | Add the `else if` block for the new capsule |
| Config value not resolved | `resolve()` expression in wrong file | `resolve('${__dirname}/...')` is relative to the YAML file it's in |
| Credential decryption fails | Workspace key changed | User must manually delete and recreate the credential file |
| Test hangs on prompt | `--yes` not passed or `T44_KEYS_PASSPHRASE` not set | Use `cli.spawnCli` (auto-adds `--yes`) and set `T44_KEYS_PASSPHRASE` env |
| Test interference | Shared home directory | Use isolated `T44_HOME_DIR` per test suite |
| Slow tests | Multiple CLI process spawns | Use generous timeouts (15s per command, 30s for setup) |
| Shell command `not defined` | Function not in `WorkspaceShell.yaml` | Add command definition and re-activate |
| `extends` config not merging | Missing `extends` entry | Verify YAML syntax and path resolution |

---

## 17. Decision Checklist

- **Adding workspace functionality?** → Create a capsule in `caps/`, map it in `WorkspaceCli`, add config to YAML
- **Need common modules in a workspace capsule?** → Map `WorkspaceLib` as `lib`, use `this.lib.chalk`, `this.lib.$`, etc. Never destructure. Never use `const lib = this.lib` except in `helpers` getters. Only import directly for modules not in WorkspaceLib.
- **Capsule has standalone helper functions?** → Move them into a memoized `helpers` getter, access via `this.helpers.*`. Remove top-level imports.
- **Getting ambient reference errors?** → Update call sites to `this.helpers.*` or `this.lib.*`. Run `t44 info 2>&1 | grep 'Ambient'` to verify.
- **Testing the CLI?** → Use `workspace-rt`, map `WorkspaceCli`, use `cli.spawnCli()`
- **Testing a capsule in isolation?** → Use `standalone-rt` (see AI-STANDALONE-RT-BUILD-REFERENCE.md)
- **Need credentials from a provider?** → Extend `WorkspaceConnection`, define a schema, use `getConfigValue()`
- **Adding a deployment target?** → Add to `ProjectDeploymentConfig` in `workspace.yaml`, create provider capsule
- **Adding a publish target?** → Add to `ProjectPublishingConfig.repositories`, create provider capsule
- **Need shell integration?** → Add command to `WorkspaceShell.yaml`, use `cliCommand` for forwarding
- **Need dynamic config value?** → Use `resolve('${__dirname}/...')` or `jit(pick(...))` in YAML

---
