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
            '#t44/structs/HomeRegistryConfig.v0': {
                as: '$HomeRegistryConfig'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt.v0'
                },
                rootDir: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<string> {
                        const config = await this.$HomeRegistryConfig.config
                        if (!config?.rootDir) {
                            throw new Error('Home registry rootDir is not configured. Run ensureRootDir() first.')
                        }
                        return config.rootDir
                    }
                },
                ensureRootDir: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        const { join } = await import('path')
                        const { stat, mkdir, readFile, writeFile } = await import('fs/promises')
                        const { homedir } = await import('os')
                        const chalk = (await import('chalk')).default

                        const config = await this.$HomeRegistryConfig.config
                        const defaultDir = join(homedir(), '.o/workspace.foundation')

                        let chosenDir: string

                        if (config?.rootDir) {
                            // Validate that the directory exists
                            try {
                                const s = await stat(config.rootDir)
                                if (!s.isDirectory()) {
                                    throw new Error(`Home registry path '${config.rootDir}' exists but is not a directory.`)
                                }
                            } catch (error: any) {
                                if (error.code === 'ENOENT') {
                                    throw new Error(`Home registry directory '${config.rootDir}' does not exist. Please create it or reconfigure.`)
                                }
                                throw error
                            }
                            chosenDir = config.rootDir
                        } else {
                            // rootDir not set — prompt user
                            console.log(chalk.cyan(`\n🏠 Home Registry Setup\n`))
                            console.log(chalk.gray('   The home registry is the place in your home directory that keeps'))
                            console.log(chalk.gray('   details about your workspaces and projects.'))
                            console.log('')

                            chosenDir = await this.WorkspacePrompt.input({
                                message: 'Enter the home registry directory:',
                                defaultValue: defaultDir,
                                validate: (input: string) => {
                                    if (!input || input.trim().length === 0) {
                                        return 'Directory path cannot be empty'
                                    }
                                    return true
                                }
                            })

                            // Check if directory exists
                            let dirExists = false
                            try {
                                const s = await stat(chosenDir)
                                dirExists = s.isDirectory()
                            } catch {
                                // Does not exist
                            }

                            if (dirExists) {
                                const confirmed = await this.WorkspacePrompt.confirm({
                                    message: `Directory '${chosenDir}' already exists. Use this existing registry as the home registry for your workspace?`,
                                    defaultValue: true
                                })

                                if (!confirmed) {
                                    console.log(chalk.red('\n\nABORTED\n'))
                                    process.exit(0)
                                }
                            } else {
                                // Create the directory
                                await mkdir(chosenDir, { recursive: true })
                                console.log(chalk.green(`\n   ✓ Created home registry directory: ${chosenDir}\n`))
                            }

                            await this.$HomeRegistryConfig.setConfigValue(['rootDir'], chosenDir)
                        }

                        // Ensure registry.json exists at the root of the home registry
                        const registryFilePath = join(chosenDir, 'registry.json')
                        let registryData: any

                        try {
                            registryData = JSON.parse(await readFile(registryFilePath, 'utf-8'))
                        } catch {
                            // registry.json does not exist — generate identity
                            console.log(chalk.cyan(`\n   Generating home registry identity...\n`))

                            const { generateKeypair } = await import('../lib/ucan.js')
                            const { did, privateKey } = await generateKeypair()

                            registryData = {
                                did,
                                privateKey,
                                createdAt: new Date().toISOString()
                            }

                            await writeFile(registryFilePath, JSON.stringify(registryData, null, 2), { mode: 0o600 })

                            console.log(chalk.green(`   ✓ Registry identity saved to:`))
                            console.log(chalk.green(`     ${registryFilePath}`))
                            console.log(chalk.green(`   ✓ DID: ${registryData.did}\n`))
                        }

                        // Ensure identifier is set in config
                        if (!config?.identifier || config.identifier !== registryData.did) {
                            await this.$HomeRegistryConfig.setConfigValue(['identifier'], registryData.did)
                        }

                        return chosenDir
                    }
                },
                getRegistryPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        const { join } = await import('path')
                        const rootDir = await this.rootDir
                        return join(rootDir, 'registry.json')
                    }
                },
                getRegistry: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<any | null> {
                        const { join } = await import('path')
                        const { readFile } = await import('fs/promises')
                        const rootDir = await this.rootDir
                        const filePath = join(rootDir, 'registry.json')
                        try {
                            return JSON.parse(await readFile(filePath, 'utf-8'))
                        } catch {
                            return null
                        }
                    }
                },
                getWorkspace: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<any | null> {
                        const { join } = await import('path')
                        const { readFile } = await import('fs/promises')

                        const rootDir = await this.rootDir
                        const filePath = join(rootDir, 'workspaces', `${name}.json`)
                        try {
                            return JSON.parse(await readFile(filePath, 'utf-8'))
                        } catch {
                            return null
                        }
                    }
                },
                setWorkspace: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, data: { did: string; privateKey: string; createdAt: string; workspaceRootDir: string }): Promise<string> {
                        const { join } = await import('path')
                        const { writeFile, mkdir } = await import('fs/promises')

                        const rootDir = await this.rootDir
                        const dir = join(rootDir, 'workspaces')
                        const filePath = join(dir, `${name}.json`)
                        await mkdir(dir, { recursive: true })
                        await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
                        return filePath
                    }
                },
                getWorkspacePath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<string> {
                        const { join } = await import('path')

                        const rootDir = await this.rootDir
                        return join(rootDir, 'workspaces', `${name}.json`)
                    }
                },
                getKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<any | null> {
                        const { join } = await import('path')
                        const { readFile } = await import('fs/promises')

                        const rootDir = await this.rootDir
                        const filePath = join(rootDir, 'workspace-keys', `${name}.json`)
                        try {
                            return JSON.parse(await readFile(filePath, 'utf-8'))
                        } catch {
                            return null
                        }
                    }
                },
                setKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, data: { did: string; privateKey: string; createdAt: string }): Promise<string> {
                        const { join } = await import('path')
                        const { writeFile, mkdir } = await import('fs/promises')

                        const rootDir = await this.rootDir
                        const dir = join(rootDir, 'workspace-keys')
                        const filePath = join(dir, `${name}.json`)
                        await mkdir(dir, { recursive: true })
                        await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
                        return filePath
                    }
                },
                getKeyPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<string> {
                        const { join } = await import('path')

                        const rootDir = await this.rootDir
                        return join(rootDir, 'workspace-keys', `${name}.json`)
                    }
                },
                keyExists: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<boolean> {
                        const { join } = await import('path')
                        const { access } = await import('fs/promises')

                        const rootDir = await this.rootDir
                        const filePath = join(rootDir, 'workspace-keys', `${name}.json`)
                        try {
                            await access(filePath)
                            return true
                        } catch {
                            return false
                        }
                    }
                },
                getRack: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<any | null> {
                        const { join } = await import('path')
                        const { readFile } = await import('fs/promises')

                        const rootDir = await this.rootDir
                        const filePath = join(rootDir, 'project-racks', `${name}.json`)
                        try {
                            return JSON.parse(await readFile(filePath, 'utf-8'))
                        } catch {
                            return null
                        }
                    }
                },
                setRack: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, data: { did: string; privateKey: string; createdAt: string }): Promise<string> {
                        const { join } = await import('path')
                        const { writeFile, mkdir } = await import('fs/promises')

                        const rootDir = await this.rootDir
                        const dir = join(rootDir, 'project-racks')
                        const filePath = join(dir, `${name}.json`)
                        await mkdir(dir, { recursive: true })
                        await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
                        return filePath
                    }
                },
                getRackPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<string> {
                        const { join } = await import('path')

                        const rootDir = await this.rootDir
                        return join(rootDir, 'project-racks', `${name}.json`)
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
capsule['#'] = 't44/caps/HomeRegistry.v0'
