
import type * as BunTest from 'bun:test'
import { config as loadDotenv } from 'dotenv'
import { join } from 'path'

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
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
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
                                await fn()
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
                                await fn()
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
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/caps/WorkspaceTest.v0'
