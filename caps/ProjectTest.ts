import type * as BunTest from 'bun:test'
import { config as loadDotenv } from 'dotenv'
import { join, dirname, basename } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import stringify from 'json-stable-stringify'

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
                    value: '@stream44.studio/t44/caps/ProjectTestLib',
                },
                bunTest: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as any as typeof BunTest,
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
                _envLoaded: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },
                loadEnvFiles: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, cwd: string): void {
                        if (this._envLoaded) return

                        // Load .env file if it exists
                        const envPath = join(cwd, '.env')
                        if (!loadedEnvFiles.has(envPath)) {
                            loadDotenv({ path: envPath, quiet: true })
                            loadedEnvFiles.add(envPath)
                        }

                        // Load .env.dev file if it exists
                        const envDevPath = join(cwd, '.env.dev')
                        if (!loadedEnvFiles.has(envDevPath)) {
                            loadDotenv({ path: envDevPath, quiet: true })
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
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any): string {

                        const moduleFilepath = this['#@stream44.studio/encapsulate/structs/Capsule'].rootCapsule.moduleFilepath
                        const dir = join(this.testRootDir, '.~o/workspace.foundation/workbenches', basename(moduleFilepath).replace(/\.[^\.]+$/, ''))

                        return dir
                    }
                },
                emptyWorkbenchDir: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {
                        const dir = this.workbenchDir

                        // Ensure the directory exists first
                        await mkdir(dir, { recursive: true })

                        // Remove directory contents (not the directory itself) including dotfiles
                        // Use shell with proper globbing to handle both regular files and dotfiles
                        await Bun.$`sh -c 'rm -rf ${dir}/* ${dir}/.[!.]* ${dir}/..?* 2>/dev/null || true'`.quiet()
                    }
                },
                EnsureEmptyWorkbenchDir: {
                    type: CapsulePropertyTypes.Init,
                    value: async function (this: any) {
                        // Only run if bunTest is available (test mode)
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
                // ── Snapshot tracking state ──────────────────────────
                _describeStack: {
                    type: CapsulePropertyTypes.Literal,
                    value: [] as string[],
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
                        const dir = dirname(moduleFilepath)
                        const base = basename(moduleFilepath)
                        this._snapshotFile = join(dir, '__snapshots__', base + '.snap.json')
                        return this._snapshotFile
                    }
                },
                _loadSnapshots: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<Record<string, any>> {
                        if (this._snapshotData !== null) return this._snapshotData
                        const file = this._getSnapshotFile()
                        try {
                            if (existsSync(file)) {
                                const raw = await readFile(file, 'utf-8')
                                this._snapshotData = JSON.parse(raw)
                            } else {
                                this._snapshotData = {}
                            }
                        } catch {
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
                        await mkdir(dirname(file), { recursive: true })
                        // Sort top-level keys for deterministic file output
                        const sorted: Record<string, any> = {}
                        for (const k of Object.keys(this._snapshotData!).sort()) {
                            sorted[k] = this._snapshotData![k]
                        }
                        await writeFile(file, JSON.stringify(sorted, null, 2) + '\n', 'utf-8')
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
                        const parts = [...this._describeStack]
                        if (this._currentItName) parts.push(this._currentItName)
                        const baseKey = parts.join(' > ')

                        // Increment counter for this key (supports multiple snapshots per test)
                        const count = (this._snapshotCounters.get(baseKey) || 0) + 1
                        this._snapshotCounters.set(baseKey, count)
                        const snapshotKey = `${baseKey} #${count}`

                        // Stabilize for storage: sort object keys only (preserves array order in snapshots)
                        const stabilizeForStorage = (obj: any): any => JSON.parse(stringify(obj) || 'null')

                        // Deep sort for comparison: sort both object keys AND array elements recursively
                        const deepSortForComparison = (obj: any): any => {
                            if (obj === null || obj === undefined) return obj
                            if (Array.isArray(obj)) {
                                // Recursively sort array elements, then sort the array itself
                                const sorted = obj.map(deepSortForComparison)
                                // Sort arrays by their JSON representation for deterministic ordering
                                return sorted.sort((a, b) => {
                                    const aStr = JSON.stringify(a) ?? ''
                                    const bStr = JSON.stringify(b) ?? ''
                                    return aStr.localeCompare(bStr)
                                })
                            }
                            if (typeof obj === 'object') {
                                const sorted: Record<string, any> = {}
                                for (const key of Object.keys(obj).sort()) {
                                    sorted[key] = deepSortForComparison(obj[key])
                                }
                                return sorted
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
                            return bunTestModule.describe(name, async () => {
                                self._describeStack.push(name)
                                try {
                                    await fn()
                                } finally {
                                    self._describeStack.pop()
                                }
                            })
                        }
                        describeMethod.skip = (name: string, fn: () => void) => {
                            return bunTestModule.describe.skip(name, async () => {
                                self._describeStack.push(name)
                                try {
                                    await fn()
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
                            return bunTestModule.it(name, async () => {
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
                                    self._currentItName = null
                                }
                            }, options)
                        }
                        itMethod.skip = (name: string, fn: () => void | Promise<void>, options?: number | BunTest.TestOptions) => {
                            return bunTestModule.it.skip(name, async () => {
                                self._currentItName = name
                                try {
                                    await fn()
                                } finally {
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
                        const bunTestModule = this.bunTest
                        const testMethod = (name: string, fn: () => void | Promise<void>, options?: number | BunTest.TestOptions) => {
                            return bunTestModule.test(name, async () => {
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
                    value: function (this: any, fn: () => void | Promise<void>) {
                        return this.bunTest.beforeAll(async () => {
                            await fn()
                        })
                    }
                },
                afterAll: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, fn: () => void | Promise<void>) {
                        return this.bunTest.afterAll(async () => {
                            await fn()
                        })
                    }
                },
                beforeEach: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, fn: () => void | Promise<void>) {
                        return this.bunTest.beforeEach(async () => {
                            await fn()
                        })
                    }
                },
                afterEach: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, fn: () => void | Promise<void>) {
                        return this.bunTest.afterEach(async () => {
                            await fn()
                        })
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
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#']
    })
}
capsule['#'] = '@stream44.studio/t44/caps/ProjectTest'
