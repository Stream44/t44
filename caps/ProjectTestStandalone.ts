
// NOTE: Spawning processes with 'pipe' may fail due to a bug when run via 'bun test'.
//       See: https://github.com/oven-sh/bun/issues/24690
//       This test harness replaces ./ProjectTest.ts so we can run tests via 'bun'.
// NOTE: Using 'spawn' from 'child_process' module works with 'pipe' even when run via 'bun test'.

import type * as BunTest from 'bun:test'
import { expect } from 'bun:test'
import chalk from 'chalk'

// ── Standalone test harness ─────────────────────────────────────────
// Implements the bun:test interface (describe, it, expect, beforeAll, etc.)
// for running tests via plain `bun` without the bun test runner.
// Tests are collected synchronously, then executed sequentially via
// setTimeout(0) after all describe blocks have been registered.

type TestEntry = { suite: string[], name: string, fn: () => void | Promise<void>, timeout?: number, skip?: boolean }
type HookEntry = { suite: string[], fn: () => void | Promise<void> }

const _tests: TestEntry[] = []
const _beforeAlls: HookEntry[] = []
const _afterAlls: HookEntry[] = []
let _currentSuite: string[] = []
let _runScheduled = false

function scheduleRun() {
    if (_runScheduled) return
    _runScheduled = true
    setTimeout(async () => {
        let passed = 0, failed = 0, skipped = 0

        // Group tests by suite for beforeAll execution
        const ranBeforeAll = new Set<string>()
        for (const t of _tests) {
            const suiteKey = t.suite.join(' > ')
            if (!ranBeforeAll.has(suiteKey)) {
                ranBeforeAll.add(suiteKey)
                // Run matching beforeAlls (exact match or parent suite)
                for (const ba of _beforeAlls) {
                    const baKey = ba.suite.join(' > ')
                    if (suiteKey === baKey || suiteKey.startsWith(baKey + ' > ') || baKey === '') {
                        try { await ba.fn() } catch (err: any) {
                            console.log(chalk.red(`✗ beforeAll for "${suiteKey}" failed: ${err?.message || err}`))
                        }
                    }
                }
            }
        }

        for (const t of _tests) {
            const label = [...t.suite, t.name].join(' > ')
            if (t.skip) { skipped++; console.log(chalk.gray(`⊘ ${label} [skipped]`)); continue }
            try {
                const timeoutMs = t.timeout || 30_000
                const result = await Promise.race([
                    Promise.resolve(t.fn()).then(() => 'ok' as const),
                    new Promise<'timeout'>(r => setTimeout(() => r('timeout'), timeoutMs))
                ])
                if (result === 'timeout') {
                    failed++
                    console.log(chalk.red(`✗ ${label} [timed out after ${timeoutMs}ms]`))
                } else {
                    passed++
                    console.log(chalk.green(`✓ ${label}`))
                }
            } catch (err: any) {
                failed++
                console.log(chalk.red(`✗ ${label}`))
                console.log(chalk.red(`  ${err?.message || err}`))
            }
        }

        for (const aa of _afterAlls) {
            try { await aa.fn() } catch { }
        }

        console.log(`\n${passed} pass, ${failed} fail, ${skipped} skip`)
        console.log(`Ran ${_tests.length} tests.`)
        if (failed > 0) process.exitCode = 1
        // Force exit — capsule resources (UDP sockets, watchers, etc.) may
        // keep the event loop alive indefinitely after tests complete.
        process.exit(process.exitCode ?? 0)
    }, 0)
}

const standaloneDescribe: any = (name: string, fn: () => void) => {
    _currentSuite.push(name)
    fn()
    _currentSuite.pop()
    scheduleRun()
}
standaloneDescribe.skip = (_name: string, _fn: () => void) => { }

const standaloneIt: any = (name: string, fn: () => void | Promise<void>, options?: number | any) => {
    const timeout = typeof options === 'number' ? options : options?.timeout
    _tests.push({ suite: [..._currentSuite], name, fn, timeout })
}
standaloneIt.skip = (name: string, _fn: () => void | Promise<void>) => {
    _tests.push({ suite: [..._currentSuite], name, fn: () => { }, skip: true })
}

const standaloneTest: any = standaloneIt
standaloneTest.skip = standaloneIt.skip

const standaloneBeforeAll = (fn: () => void | Promise<void>, _options?: any) => {
    _beforeAlls.push({ suite: [..._currentSuite], fn })
}
const standaloneAfterAll = (fn: () => void | Promise<void>, _options?: any) => {
    _afterAlls.push({ suite: [..._currentSuite], fn })
}
const standaloneBeforeEach = (_fn: () => void | Promise<void>) => { }
const standaloneAfterEach = (_fn: () => void | Promise<void>) => { }

const standaloneBunTest = {
    describe: standaloneDescribe,
    it: standaloneIt,
    test: standaloneTest,
    expect,
    beforeAll: standaloneBeforeAll,
    afterAll: standaloneAfterAll,
    beforeEach: standaloneBeforeEach,
    afterEach: standaloneAfterEach,
} as any as typeof BunTest

// Global cache for loaded env files (this is fine as a cache)
const loadedEnvFiles = new Set<string>()

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
                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceLib',
                },
                bunTest: {
                    type: CapsulePropertyTypes.Literal,
                    value: standaloneBunTest,
                },
                env: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined
                },
                verbose: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },
                testRootDir: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                /**
                 * Default timeout (ms) for all test functions (it, test,
                 * beforeAll, afterAll, beforeEach, afterEach). When set,
                 * acts as the fallback when no per-test timeout is supplied.
                 * `undefined` means use Bun's built-in default (5 000 ms).
                 */
                defaultTimeout: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as number | undefined,
                },
                /**
                 * Named path aliases. Set via options as a plain object:
                 *   `paths: { fixtureSrc: '/abs/path', ... }`
                 * Accessible at `test.paths.fixtureSrc` etc.
                 */
                paths: {
                    type: CapsulePropertyTypes.Literal,
                    value: {} as Record<string, string>,
                },
                _envLoaded: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },
                loadEnvFiles: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, cwd: string): void {
                        if (this._envLoaded) return

                        // Load .env file if it exists
                        const envPath = this.lib.path.join(cwd, '.env')
                        if (!loadedEnvFiles.has(envPath)) {
                            this.lib.dotenv.config({ path: envPath, quiet: true })
                            loadedEnvFiles.add(envPath)
                        }

                        // Load .env.dev file if it exists
                        const envDevPath = this.lib.path.join(cwd, '.env.dev')
                        if (!loadedEnvFiles.has(envDevPath)) {
                            this.lib.dotenv.config({ path: envDevPath, quiet: true })
                            loadedEnvFiles.add(envDevPath)
                        }

                        this._envLoaded = true
                    }
                },
                getEnvValue: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, envVarName: string): string | undefined {
                        // Auto-load env files from testRootDir if available
                        if (this.testRootDir) {
                            this.loadEnvFiles(this.testRootDir)
                        }
                        return process.env[envVarName]
                    }
                },
                workbenchDir: {
                    type: CapsulePropertyTypes.ConstantGetterFunction,
                    value: function ({ constants }: any): string {
                        const moduleFilepath = constants['#@stream44.studio/encapsulate/structs/Capsule'].rootCapsule.moduleFilepath
                        const capsuleDir = constants.lib.path.dirname(moduleFilepath)
                        const testName = constants.lib.path.basename(moduleFilepath).replace(/\.[^.]+$/, '')
                        return constants.lib.path.join(capsuleDir, '.~o/workspace.foundation/workbenches', testName)
                    }
                },
                emptyWorkbenchDir: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {
                        const dir = this.workbenchDir

                        // Ensure the directory exists first
                        await this.lib.fs.mkdir(dir, { recursive: true })

                        // Remove directory contents (not the directory itself) including dotfiles
                        // Use shell with proper globbing to handle both regular files and dotfiles
                        await Bun.$`sh -c 'rm -rf ${dir}/* ${dir}/.[!.]* ${dir}/..?* 2>/dev/null || true'`.quiet()
                    }
                },
                RejectBunTestRunner: {
                    type: CapsulePropertyTypes.Init,
                    value: function (this: any) {
                        let insideBunTest = false
                        try {
                            (require('bun:test') as any).afterAll(() => { })
                            insideBunTest = true
                        } catch { }
                        if (insideBunTest) {
                            console.error(chalk.red(
                                '\n  ERROR: ProjectTestStandalone must be run via `bun <file>`, not `bun test <file>`.\n' +
                                '  Use ProjectTest instead if you need the bun test runner.\n' +
                                '  See: https://github.com/oven-sh/bun/issues/24690\n'
                            ))
                            process.exit(1)
                        }
                    }
                },
                EnsureEmptyWorkbenchDir: {
                    type: CapsulePropertyTypes.Init,
                    value: async function (this: any) {
                        if (!this.bunTest) return
                        await this.emptyWorkbenchDir()
                    }
                },
                RegisterSnapshotFlush: {
                    type: CapsulePropertyTypes.Init,
                    value: function (this: any) {
                        if (!this.bunTest) return
                        const self = this
                        this.bunTest.afterAll(async () => {
                            await self._flushSnapshots()
                        })
                    }
                },

                // ── warmUp / coolDown state ──────────────────────────
                /**
                 * Set of warmUp names already used in this test file. Names
                 * must be unique because each is used as a cache filename.
                 */
                _warmUpNames: {
                    type: CapsulePropertyTypes.Literal,
                    value: new Set<string>(),
                },
                /**
                 * Depth counter: > 0 while the describe/it wrappers are being
                 * called from inside a `coolDown(fn)` body's bun-collection
                 * pass. Used to decide whether to skip in cooldown mode.
                 *
                 * (Counter rather than a bool because bun runs describe
                 * callbacks deferred during collection, so multiple cooldown
                 * trees can be walked in arbitrary order.)
                 */
                _coolDownDepth: {
                    type: CapsulePropertyTypes.Literal,
                    value: 0,
                },
                /**
                 * `true` when this test process was launched with
                 * `T44_TEST_COOLDOWN=1` (i.e. `t44 test --cooldown`).
                 */
                isCoolDownMode: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (): boolean {
                        return process.env.T44_TEST_COOLDOWN === '1'
                    }
                },
                /** Directory holding cached warmUp values for this test file. */
                _warmUpCacheDir: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any): string {
                        const moduleFilepath = this['#@stream44.studio/encapsulate/structs/Capsule'].rootCapsule.moduleFilepath
                        const base = this.lib.path.basename(moduleFilepath).replace(/\.[^.]+$/, '')
                        // Short stable hash of the full path keeps same-basename
                        // files in different packages from colliding.
                        let h = 0
                        for (let i = 0; i < moduleFilepath.length; i++) {
                            h = ((h << 5) - h + moduleFilepath.charCodeAt(i)) | 0
                        }
                        const hash = (h >>> 0).toString(36).padStart(7, '0').slice(0, 7)
                        return this.lib.path.join(this.testRootDir, '.~o/workspace.foundation/warmup-cache', `${base}-${hash}`)
                    }
                },
                _warmUpCachePath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, name: string): string {
                        // Sanitize name for filesystem safety; preserve readability.
                        const safe = String(name).replace(/[^a-zA-Z0-9_\-.]/g, '_')
                        if (!safe) throw new Error(`warmUp name must contain at least one alphanumeric character (got "${name}")`)
                        return this.lib.path.join(this._warmUpCacheDir, `${safe}.json`)
                    }
                },

                /**
                 * Wrap a slow setup that's safe to skip when its result is
                 * still on disk.
                 *
                 *   warmUp(name, onCold, onWarm?)
                 *
                 * Each callback can be either form:
                 *
                 * 1) **Plain async** — an `async function`. Runs at file-load.
                 *    `onCold`'s JSON-serializable resolved value is persisted
                 *    under `.~o/workspace.foundation/warmup-cache/…` keyed by
                 *    `name` + this test file's identity, and returned to the
                 *    caller. `onWarm` receives the cached value as its only
                 *    argument; its return is ignored.
                 *
                 * 2) **Registration form** — a synchronous function that
                 *    declares `describe`/`it` blocks. The blocks run as part
                 *    of the normal test suite (not at file-load) and bypass
                 *    the cooldown-mode skip. A sentinel cache entry is
                 *    written after the suite completes, so subsequent runs
                 *    cache-hit. `warmUp(...)` returns `undefined` for the
                 *    caller in this form.
                 *
                 * Dispatch is by `fn.constructor.name === 'AsyncFunction'`,
                 * so prefer `async function () {}` for plain async and
                 * `function () { it('…') }` for the registration form.
                 *
                 * - `name` must be unique within a single test file.
                 * - The plain-async returned value must be JSON-serializable.
                 * - A successful `--cooldown` run wipes the cache for this
                 *   file at the end, so the next ordinary run re-warms.
                 */
                warmUp: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, onCold: (...args: any[]) => any | Promise<any>, onWarm?: (cached: any) => any | Promise<any>): Promise<any> {
                        if (typeof name !== 'string' || !name.trim()) {
                            throw new Error('warmUp() requires a non-empty string name as its first argument')
                        }
                        if (typeof onCold !== 'function') {
                            throw new Error(`warmUp("${name}") requires an onCold callback function as its second argument`)
                        }
                        if (onWarm !== undefined && typeof onWarm !== 'function') {
                            throw new Error(`warmUp("${name}") onWarm (3rd arg) must be a function if provided`)
                        }
                        if (this._warmUpNames.has(name)) {
                            throw new Error(`warmUp("${name}") was already declared in this test file — names must be unique`)
                        }
                        this._warmUpNames.add(name)

                        const cachePath = this._warmUpCachePath(name)
                        const chalk = this.lib.chalk
                        const bunTestModule = this.bunTest
                        const self = this
                        const fs = this.lib.fs
                        const path = this.lib.path
                        const isAsync = (fn: Function) => fn?.constructor?.name === 'AsyncFunction'

                        // Async cache write. warmUp callers are expected to
                        // `await` this function at module top level — the
                        // top-level await holds bun's test collection phase
                        // open, so it()s registered inside onCold/onWarm
                        // still arrive before collection completes.
                        const writeCache = async (value: any) => {
                            let serialized: string
                            try {
                                serialized = JSON.stringify({ name, value, t: Date.now() })
                                if (serialized === undefined) throw new Error('value is undefined')
                                JSON.parse(serialized)
                            } catch (err: any) {
                                throw new Error(`warmUp("${name}") returned a value that is not JSON-serializable: ${err?.message ?? err}`)
                            }
                            await fs.mkdir(path.dirname(cachePath), { recursive: true })
                            await fs.writeFile(cachePath, serialized + '\n', 'utf-8')
                        }

                        // ── Cache hit ───────────────────────────────────
                        if (await fs.exists(cachePath)) {
                            try {
                                const raw = await fs.readFile(cachePath, 'utf-8')
                                const parsed = JSON.parse(raw)
                                console.log(chalk.cyan(`♻️  warmUp("${name}") — cached`))
                                if (onWarm) {
                                    self._coolDownDepth++
                                    try {
                                        if (isAsync(onWarm)) {
                                            await onWarm(parsed.value)
                                        } else {
                                            onWarm(parsed.value)  // sync registration of it()
                                        }
                                    } finally {
                                        self._coolDownDepth--
                                    }
                                }
                                return parsed.value
                            } catch (err: any) {
                                console.log(chalk.yellow(`⚠ warmUp("${name}") — cached value unreadable, re-running: ${err?.message ?? err}`))
                            }
                        }

                        // ── Cache miss → run onCold ─────────────────────
                        console.log(chalk.yellow(`🔥 warmUp("${name}") — running…`))
                        if (isAsync(onCold)) {
                            const value = await onCold()
                            await writeCache(value)
                            console.log(chalk.green(`✓ warmUp("${name}") — cached`))
                            return value
                        }

                        // Registration form: invoke synchronously so tests
                        // register within the warmUp's await chain — the
                        // caller's `await warmUp(...)` keeps the top-level
                        // promise pending until this returns, so bun does
                        // not start collection until all it()s are in place.
                        self._coolDownDepth++
                        try {
                            onCold()
                        } finally {
                            self._coolDownDepth--
                        }
                        bunTestModule.afterAll(async () => {
                            if (self.isCoolDownMode) return
                            await writeCache(null)
                            console.log(chalk.green(`✓ warmUp("${name}") — cached (sentinel)`))
                        })
                        return undefined
                    }
                },

                /**
                 * Delete the cache file for one specific warmUp `name`. Used
                 * by the afterAll hook a matching `coolDown(name, …)`
                 * registers, so cleanup is scoped to one resource.
                 */
                _clearWarmUpCacheFor: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<void> {
                        const filePath = this._warmUpCachePath(name)
                        try {
                            await this.lib.fs.rm(filePath, { force: true })
                        } catch { /* ignore */ }
                    }
                },

                /**
                 * Cooldown hook tied to a named warmUp.
                 *
                 *   coolDown(name, onDefault?, onCooldown?)
                 *
                 * - `name` MUST match a previously-registered `warmUp(name, …)`
                 *   in this same test file. The cache file invalidated by
                 *   `--cooldown` is the cache belonging to that warmUp, so
                 *   the next ordinary run re-warms only that resource.
                 *
                 * Each callback can be either form:
                 *
                 * 1) **Plain async** (`async function`):
                 *    - `onDefault` is wrapped as an `afterAll` so it runs
                 *      after every test in default mode.
                 *    - `onCooldown` is wrapped as a single `it('coolDown body')`
                 *      inside the cooldown describe in --cooldown mode.
                 *
                 * 2) **Registration form** (sync function calling `it`/
                 *    `describe`):
                 *    - `onDefault`'s blocks register at top level and run
                 *      as part of the default-mode suite.
                 *    - `onCooldown`'s blocks register inside the cooldown
                 *      describe and run in --cooldown mode.
                 *
                 * Multiple `coolDown(...)` calls compose in declaration order.
                 */
                coolDown: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, name: string, onDefault?: (...args: any[]) => any | Promise<any>, onCooldown?: (...args: any[]) => any | Promise<any>): void {
                        const chalk = this.lib.chalk
                        const bunTestModule = this.bunTest
                        const self = this
                        const isAsync = (fn: Function) => fn?.constructor?.name === 'AsyncFunction'

                        if (typeof name !== 'string' || !name.trim()) {
                            throw new Error('coolDown() requires a warmUp name string as its first argument')
                        }
                        if (!self._warmUpNames.has(name)) {
                            const known = [...self._warmUpNames]
                            throw new Error(
                                `coolDown("${name}") does not match a registered warmUp in this file. ` +
                                `Known warmUps: ${known.length ? known.map(n => `"${n}"`).join(', ') : '(none)'}. ` +
                                `Call warmUp("${name}", …) earlier in the file.`,
                            )
                        }
                        if (onDefault !== undefined && typeof onDefault !== 'function') {
                            throw new Error(`coolDown("${name}") onDefault (2nd arg) must be a function or undefined`)
                        }
                        if (onCooldown !== undefined && typeof onCooldown !== 'function') {
                            throw new Error(`coolDown("${name}") onCooldown (3rd arg) must be a function or undefined`)
                        }

                        if (!self.isCoolDownMode) {
                            // ── Default mode ────────────────────────────
                            if (onDefault) {
                                if (isAsync(onDefault)) {
                                    console.log(chalk.gray(`⏭  coolDown("${name}") — onDefault registered as afterAll (use --cooldown to fully tear down)`))
                                    bunTestModule.afterAll(async () => {
                                        await onDefault()
                                    })
                                } else {
                                    console.log(chalk.gray(`⏭  coolDown("${name}") — onDefault tests registered (use --cooldown to fully tear down)`))
                                    onDefault()
                                }
                            } else {
                                console.log(chalk.gray(`⏭  coolDown("${name}") — skipped (use --cooldown to run)`))
                                bunTestModule.describe.skip(`coolDown("${name}") (skipped — use --cooldown)`, () => { })
                            }
                            return
                        }

                        // ── Cooldown mode ──────────────────────────────
                        const wipe = async () => {
                            await self._clearWarmUpCacheFor(name)
                            console.log(chalk.gray(`🗑  warmUp("${name}") cache cleared`))
                        }
                        if (onCooldown) {
                            console.log(chalk.cyan(`❄️  coolDown("${name}") — registered`))
                            bunTestModule.describe(`coolDown("${name}")`, () => {
                                self._coolDownDepth++
                                try {
                                    if (isAsync(onCooldown)) {
                                        bunTestModule.it('coolDown body', async () => {
                                            await onCooldown()
                                        })
                                    } else {
                                        onCooldown()
                                    }
                                } finally {
                                    self._coolDownDepth--
                                }
                                bunTestModule.afterAll(wipe)
                            })
                        } else {
                            console.log(chalk.cyan(`❄️  coolDown("${name}") — no onCooldown body; clearing warmUp cache only`))
                            bunTestModule.afterAll(wipe)
                        }
                    }
                },

                // ── Snapshot tracking state ──────────────────────────
                _describeStack: {
                    type: CapsulePropertyTypes.Literal,
                    value: [] as string[],
                },
                _capturedDescribeStack: {
                    type: CapsulePropertyTypes.Literal,
                    value: null as string[] | null,
                },
                _snapshotCounters: {
                    type: CapsulePropertyTypes.Literal,
                    value: new Map<string, number>(),
                },
                _snapshotData: {
                    type: CapsulePropertyTypes.Literal,
                    value: null as Record<string, any> | null,
                },
                _snapshotFile: {
                    type: CapsulePropertyTypes.Literal,
                    value: null as string | null,
                },
                _snapshotDirty: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },
                _currentItName: {
                    type: CapsulePropertyTypes.Literal,
                    value: null as string | null,
                },
                _getSnapshotFile: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): string {
                        if (this._snapshotFile) return this._snapshotFile
                        const moduleFilepath = this['#@stream44.studio/encapsulate/structs/Capsule'].rootCapsule.moduleFilepath
                        const dir = this.lib.path.dirname(moduleFilepath)
                        const base = this.lib.path.basename(moduleFilepath)
                        this._snapshotFile = this.lib.path.join(dir, '__snapshots__', base + '.snap.json')
                        return this._snapshotFile
                    }
                },
                _loadSnapshots: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<Record<string, any>> {
                        if (this._snapshotData !== null) return this._snapshotData
                        const file = this._getSnapshotFile()
                        if (await this.lib.fs.exists(file)) {
                            const raw = await this.lib.fs.readFile(file, 'utf-8')
                            this._snapshotData = JSON.parse(raw)
                        } else {
                            this._snapshotData = {}
                        }
                        return this._snapshotData!
                    }
                },
                _flushSnapshots: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {
                        if (!this._snapshotDirty) return
                        const file = this._getSnapshotFile()
                        await this.lib.fs.mkdir(this.lib.path.dirname(file), { recursive: true })
                        // Sort top-level keys for deterministic file output
                        const sorted: Record<string, any> = {}
                        for (const k of Object.keys(this._snapshotData!).sort()) {
                            sorted[k] = this._snapshotData![k]
                        }
                        await this.lib.fs.writeFile(file, JSON.stringify(sorted, null, 2) + '\n', 'utf-8')
                        this._snapshotDirty = false
                    }
                },
                expectSnapshotMatch: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, actual: any, opts?: { strict?: boolean }): Promise<void> {
                        const strict = opts?.strict === true

                        const isUpdate = process.env.UPDATE_SNAPSHOTS === '1' || process.env.BUN_UPDATE_SNAPSHOTS === '1' || process.argv.includes('--update-snapshots') || process.argv.includes('-u')
                        const expect = this.bunTest.expect

                        // Build the snapshot key from describe stack + current it name
                        // Use captured stack from it() if available, otherwise fall back to _describeStack
                        const stack = this._capturedDescribeStack ?? this._describeStack
                        const parts = [...stack]
                        if (this._currentItName) parts.push(this._currentItName)
                        const baseKey = parts.join(' > ')

                        // Increment counter for this key (supports multiple snapshots per test)
                        const count = (this._snapshotCounters.get(baseKey) || 0) + 1
                        this._snapshotCounters.set(baseKey, count)
                        const snapshotKey = `${baseKey} #${count}`

                        // Stabilize for storage: sort object keys only (preserves array order in snapshots)
                        const stabilizeForStorage = (obj: any): any => JSON.parse(this.lib.stringify(obj) || 'null')

                        // Detect hash-like strings (32+ hex chars)
                        const isHashLike = (s: string): boolean => /^[0-9a-f]{32,}$/i.test(s)

                        // Deep sort for comparison: sort both object keys AND array elements recursively
                        // Also normalizes hash-like keys/values that differ between machines
                        const deepSortForComparison = (obj: any): any => {
                            if (obj === null || obj === undefined) return obj
                            if (Array.isArray(obj)) {
                                const sorted = obj.map(deepSortForComparison)
                                return sorted.sort((a, b) => {
                                    const aStr = JSON.stringify(a) ?? ''
                                    const bStr = JSON.stringify(b) ?? ''
                                    return aStr.localeCompare(bStr)
                                })
                            }
                            if (typeof obj === 'object') {
                                const keys = Object.keys(obj)
                                const hasHashKeys = keys.some(isHashLike)

                                if (hasHashKeys) {
                                    // For objects with hash-like keys, convert to a sorted array of values
                                    // so that different hash keys with same values still match
                                    const entries = keys.map(k => deepSortForComparison(obj[k]))
                                    return entries.sort((a, b) => {
                                        const aStr = JSON.stringify(a) ?? ''
                                        const bStr = JSON.stringify(b) ?? ''
                                        return aStr.localeCompare(bStr)
                                    })
                                }

                                const sorted: Record<string, any> = {}
                                for (const key of keys.sort()) {
                                    sorted[key] = deepSortForComparison(obj[key])
                                }
                                return sorted
                            }
                            // Normalize hash-like string values to a placeholder
                            if (typeof obj === 'string' && isHashLike(obj)) {
                                return '<HASH>'
                            }
                            return obj
                        }

                        const snapshots = await this._loadSnapshots()

                        if (isUpdate || !(snapshotKey in snapshots)) {
                            // Write mode: store with sorted keys but preserve array order
                            snapshots[snapshotKey] = stabilizeForStorage(actual)
                            this._snapshotDirty = true
                            return
                        }

                        // Compare mode
                        const stored = snapshots[snapshotKey]

                        if (strict) {
                            // Strict mode: exact deep equality (order matters for both keys and arrays)
                            const stabilized = stabilizeForStorage(actual)
                            expect(stabilized).toEqual(stored)
                        } else {
                            // Default mode: sort-order-ignorant deep comparison
                            // Both sides are deeply sorted (keys AND arrays)
                            const actualSorted = deepSortForComparison(actual)
                            const storedSorted = deepSortForComparison(stored)
                            expect(actualSorted).toEqual(storedSorted)
                        }
                    }
                },
                describe: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any) {
                        const self = this
                        const bunTestModule = this.bunTest
                        const describeMethod = (name: string, fn: () => void) => {
                            // In --cooldown mode, only describes registered
                            // from inside a coolDown body run; everything else
                            // is converted to .skip. We decide at registration
                            // time AND remember the decision, so descendants
                            // walked deferred by bun see the right state.
                            const insideCoolDown = self._coolDownDepth > 0
                            const useSkip = self.isCoolDownMode && !insideCoolDown
                            const target = useSkip ? bunTestModule.describe.skip : bunTestModule.describe
                            return target(name, () => {
                                // Re-elevate the counter when this body runs
                                // deferred during collection, so nested
                                // describes/its registered inside also opt out
                                // of skip in cooldown mode.
                                if (insideCoolDown) self._coolDownDepth++
                                self._describeStack.push(name)
                                try {
                                    fn()
                                } finally {
                                    self._describeStack.pop()
                                    if (insideCoolDown) self._coolDownDepth--
                                }
                            })
                        }
                        describeMethod.skip = (name: string, fn: () => void) => {
                            return bunTestModule.describe.skip(name, () => {
                                self._describeStack.push(name)
                                try {
                                    fn()
                                } finally {
                                    self._describeStack.pop()
                                }
                            })
                        }
                        return describeMethod
                    }
                },
                it: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any) {
                        const self = this
                        const bunTestModule = this.bunTest
                        const itMethod = (name: string, fn: () => void | Promise<void>, options?: number | BunTest.TestOptions) => {
                            if (options == null && self.defaultTimeout != null) options = self.defaultTimeout
                            // In --cooldown mode, only it()s registered from
                            // inside a coolDown body run; the rest are
                            // converted to .skip.
                            const useSkip = self.isCoolDownMode && self._coolDownDepth === 0
                            const target = useSkip ? bunTestModule.it.skip : bunTestModule.it
                            // Capture describe stack at registration time (synchronous)
                            const capturedStack = [...self._describeStack]
                            return target(name, async () => {
                                // Set captured stack for snapshot key generation
                                self._capturedDescribeStack = capturedStack
                                self._currentItName = name
                                try {
                                    await fn()
                                } catch (error: any) {
                                    // Check for MISSING_CREDENTIALS error - skip test gracefully
                                    if (error?.message?.startsWith('MISSING_CREDENTIALS:')) {
                                        const parts = error.message.slice('MISSING_CREDENTIALS:'.length).split(':')
                                        const provider = parts[0] || 'unknown'
                                        const credentialName = parts[1] || 'credentials'
                                        console.log(`\n   ⚠️  Skipping test: ${provider} credentials not configured (${credentialName})`)
                                        bunTestModule.expect(true).toBe(true) // Mark as passed/skipped
                                        return
                                    }
                                    throw error
                                } finally {
                                    self._capturedDescribeStack = null
                                    self._currentItName = null
                                }
                            }, options)
                        }
                        itMethod.skip = (name: string, fn: () => void | Promise<void>, options?: number | BunTest.TestOptions) => {
                            const capturedStack = [...self._describeStack]
                            return bunTestModule.it.skip(name, async () => {
                                self._capturedDescribeStack = capturedStack
                                self._currentItName = name
                                try {
                                    await fn()
                                } finally {
                                    self._capturedDescribeStack = null
                                    self._currentItName = null
                                }
                            }, options)
                        }
                        return itMethod
                    }
                },
                test: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any) {
                        const self = this
                        const bunTestModule = this.bunTest
                        const testMethod = (name: string, fn: () => void | Promise<void>, options?: number | BunTest.TestOptions) => {
                            if (options == null && self.defaultTimeout != null) options = self.defaultTimeout
                            const useSkip = self.isCoolDownMode && self._coolDownDepth === 0
                            const target = useSkip ? bunTestModule.test.skip : bunTestModule.test
                            return target(name, async () => {
                                try {
                                    await fn()
                                } catch (error: any) {
                                    // Check for MISSING_CREDENTIALS error - skip test gracefully
                                    if (error?.message?.startsWith('MISSING_CREDENTIALS:')) {
                                        const parts = error.message.slice('MISSING_CREDENTIALS:'.length).split(':')
                                        const provider = parts[0] || 'unknown'
                                        const credentialName = parts[1] || 'credentials'
                                        console.log(`\n   ⚠️  Skipping test: ${provider} credentials not configured (${credentialName})`)
                                        bunTestModule.expect(true).toBe(true) // Mark as passed/skipped
                                        return
                                    }
                                    throw error
                                }
                            }, options)
                        }
                        testMethod.skip = (name: string, fn: () => void | Promise<void>, options?: number | BunTest.TestOptions) => {
                            return bunTestModule.test.skip(name, async () => {
                                await fn()
                            }, options)
                        }
                        return testMethod
                    }
                },
                expect: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any): typeof BunTest.expect {
                        return this.bunTest.expect
                    }
                },
                beforeAll: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, fn: () => void | Promise<void>, options?: number | { timeout?: number }) {
                        if (options == null && this.defaultTimeout != null) options = this.defaultTimeout
                        return this.bunTest.beforeAll(async () => {
                            await fn()
                        }, options)
                    }
                },
                afterAll: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, fn: () => void | Promise<void>, options?: number | { timeout?: number }) {
                        if (options == null && this.defaultTimeout != null) options = this.defaultTimeout
                        return this.bunTest.afterAll(async () => {
                            await fn()
                        }, options)
                    }
                },
                beforeEach: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, fn: () => void | Promise<void>, options?: number | { timeout?: number }) {
                        if (options == null && this.defaultTimeout != null) options = this.defaultTimeout
                        return this.bunTest.beforeEach(async () => {
                            await fn()
                        }, options)
                    }
                },
                afterEach: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, fn: () => void | Promise<void>, options?: number | { timeout?: number }) {
                        if (options == null && this.defaultTimeout != null) options = this.defaultTimeout
                        return this.bunTest.afterEach(async () => {
                            await fn()
                        }, options)
                    }
                },
                getRandomPort: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<number> {
                        const net = await import('net')
                        const isPortAvailable = (port: number): Promise<boolean> => {
                            return new Promise((resolve) => {
                                const server = net.createServer()
                                server.once('error', () => resolve(false))
                                server.once('listening', () => { server.close(); resolve(true) })
                                server.listen(port, '127.0.0.1')
                            })
                        }
                        for (let attempt = 0; attempt < 10; attempt++) {
                            const port = 10000 + Math.floor(Math.random() * (65535 - 10000))
                            if (await isPortAvailable(port)) return port
                        }
                        throw new Error('Could not find an available port after 10 attempts')
                    }
                },
                getRandomPortPool: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { size: number }): Promise<{ ports: number[], nextPort: () => number }> {
                        const ports: number[] = []
                        for (let i = 0; i < options.size; i++) {
                            ports.push(await this.getRandomPort())
                        }
                        let index = 0
                        return {
                            ports,
                            nextPort(): number {
                                if (index >= ports.length) {
                                    throw new Error('Port pool exhausted — allocate more ports')
                                }
                                return ports[index++]
                            }
                        }
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#']
    })
}
capsule['#'] = '@stream44.studio/t44/caps/ProjectTest'
