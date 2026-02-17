import type * as BunTest from 'bun:test'
import { config as loadDotenv } from 'dotenv'
import { join, dirname, basename } from 'path'
import { mkdir } from 'fs/promises'

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
                bunTest: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as any as typeof BunTest,
                },
                env: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined
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
                    type: CapsulePropertyTypes.StructInit,
                    value: async function (this: any) {
                        // Only run if bunTest is available (test mode)
                        if (!this.bunTest) return
                        await this.emptyWorkbenchDir()
                    }
                },
                describe: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any) {
                        const bunTestModule = this.bunTest
                        const describeMethod = (name: string, fn: () => void) => {
                            return bunTestModule.describe(name, async () => {
                                await fn()
                            })
                        }
                        describeMethod.skip = (name: string, fn: () => void) => {
                            return bunTestModule.describe.skip(name, async () => {
                                await fn()
                            })
                        }
                        return describeMethod
                    }
                },
                it: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: function (this: any) {
                        const bunTestModule = this.bunTest
                        const itMethod = (name: string, fn: () => void | Promise<void>, options?: number | BunTest.TestOptions) => {
                            return bunTestModule.it(name, async () => {
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
                        itMethod.skip = (name: string, fn: () => void | Promise<void>, options?: number | BunTest.TestOptions) => {
                            return bunTestModule.it.skip(name, async () => {
                                await fn()
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
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#']
    })
}
capsule['#'] = 't44/caps/WorkspaceTest'
