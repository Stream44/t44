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
            '#t44/structs/HomeRegistryConfig': {
                as: '$HomeRegistryConfig'
            },
            '#t44/structs/HomeRegistry': {
                as: '$HomeRegistry'
            },
            '#t44/structs/Workspace': {
                as: '$Workspace'
            },
            '#t44/structs/WorkspaceKey': {
                as: '$WorkspaceKey'
            },
            '#t44/structs/ProjectRack': {
                as: '$ProjectRack'
            },
            '#t44/structs/WorkspaceCatalogs': {
                as: '$WorkspaceCatalogs'
            },
            '#': {
                Home: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/Home'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt'
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
                        const { stat, mkdir } = await import('fs/promises')
                        const { join } = await import('path')
                        const chalk = (await import('chalk')).default

                        const config = await this.$HomeRegistryConfig.config
                        const defaultHomeDir = await this.Home.homeDir

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
                            // rootDir not set — prompt user for home directory
                            console.log(chalk.cyan(`\n🏠 Home Directory Setup\n`))
                            console.log(chalk.gray('   The home directory is where your workspace keeps its registry,'))
                            console.log(chalk.gray('   SSH keys, and other workspace-related files.'))
                            console.log('')

                            const chosenHomeDir = await this.WorkspacePrompt.input({
                                message: 'Enter the home directory:',
                                defaultValue: defaultHomeDir,
                                validate: (input: string) => {
                                    if (!input || input.trim().length === 0) {
                                        return 'Directory path cannot be empty'
                                    }
                                    return true
                                }
                            })

                            // Check if home directory exists
                            let homeDirExists = false
                            try {
                                const s = await stat(chosenHomeDir)
                                homeDirExists = s.isDirectory()
                            } catch {
                                // Does not exist
                            }

                            if (homeDirExists) {
                                const confirmed = await this.WorkspacePrompt.confirm({
                                    message: `Directory '${chosenHomeDir}' already exists. Use it as the home directory for your workspace?`,
                                    defaultValue: true
                                })

                                if (!confirmed) {
                                    console.log(chalk.red('\n\nABORTED\n'))
                                    process.exit(0)
                                }
                            } else {
                                // Create the home directory
                                await mkdir(chosenHomeDir, { recursive: true })
                                console.log(chalk.green(`\n   ✓ Created home directory: ${chosenHomeDir}\n`))
                            }

                            // Derive registry dir from home dir
                            chosenDir = join(chosenHomeDir, '.o/workspace.foundation')
                            await mkdir(chosenDir, { recursive: true })

                            await this.$HomeRegistryConfig.setConfigValue(['homeDir'], chosenHomeDir)
                            await this.$HomeRegistryConfig.setConfigValue(['rootDir'], chosenDir)
                        }

                        // Ensure registry.json exists via the HomeRegistry struct
                        let registryData = await this.$HomeRegistry.get('registry')

                        if (!registryData) {
                            // registry.json does not exist — generate identity
                            console.log(chalk.cyan(`\n   Generating home registry identity...\n`))

                            const { generateKeypair } = await import('../lib/ucan.js')
                            const { did, privateKey } = await generateKeypair()

                            registryData = {
                                did,
                                privateKey,
                                createdAt: new Date().toISOString(),
                                rootDir: chosenDir
                            }

                            const registryFilePath = await this.$HomeRegistry.set('registry', registryData)

                            console.log(chalk.green(`   ✓ Registry identity saved to:`))
                            console.log(chalk.green(`     ${registryFilePath}`))
                            console.log(chalk.green(`   ✓ DID: ${registryData.did}\n`))
                        }

                        // Ensure rootDir is set in registry data
                        if (!registryData.rootDir || registryData.rootDir !== chosenDir) {
                            registryData.rootDir = chosenDir
                            await this.$HomeRegistry.set('registry', registryData)
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
                        return this.$HomeRegistry.getPath('registry')
                    }
                },
                getRegistry: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<any | null> {
                        return this.$HomeRegistry.get('registry')
                    }
                },
                getWorkspace: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<any | null> {
                        return this.$Workspace.get(name)
                    }
                },
                setWorkspace: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, data: { did: string; privateKey: string; createdAt: string; workspaceRootDir: string }): Promise<string> {
                        return this.$Workspace.set(name, data)
                    }
                },
                getWorkspacePath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<string> {
                        return this.$Workspace.getPath(name)
                    }
                },
                listKeys: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<Array<{ name: string; did: string; createdAt?: string }>> {
                        const { readdir, readFile } = await import('fs/promises')
                        const { join } = await import('path')
                        const rootDir = await this.rootDir
                        const keyDir = join(rootDir, '@t44.sh~t44~structs~WorkspaceKey')
                        try {
                            const files = await readdir(keyDir)
                            const keys: Array<{ name: string; did: string; createdAt?: string }> = []
                            for (const file of files) {
                                if (file.endsWith('.json')) {
                                    try {
                                        const data = JSON.parse(await readFile(join(keyDir, file), 'utf-8'))
                                        keys.push({
                                            name: file.replace(/\.json$/, ''),
                                            did: data.did || '',
                                            createdAt: data.createdAt,
                                        })
                                    } catch { }
                                }
                            }
                            return keys
                        } catch {
                            return []
                        }
                    }
                },
                getKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<any | null> {
                        return this.$WorkspaceKey.get(name)
                    }
                },
                setKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, data: { did: string; privateKey: string; createdAt: string }): Promise<string> {
                        return this.$WorkspaceKey.set(name, data)
                    }
                },
                getKeyPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<string> {
                        return this.$WorkspaceKey.getPath(name)
                    }
                },
                keyExists: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<boolean> {
                        return this.$WorkspaceKey.exists(name)
                    }
                },
                listRacks: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<Array<{ name: string; did: string; createdAt?: string }>> {
                        const { readdir, readFile } = await import('fs/promises')
                        const { join } = await import('path')
                        const rootDir = await this.rootDir
                        const rackDir = join(rootDir, '@t44.sh~t44~structs~ProjectRack')
                        try {
                            const files = await readdir(rackDir)
                            const racks: Array<{ name: string; did: string; createdAt?: string }> = []
                            for (const file of files) {
                                if (file.endsWith('.json')) {
                                    try {
                                        const data = JSON.parse(await readFile(join(rackDir, file), 'utf-8'))
                                        racks.push({
                                            name: file.replace(/\.json$/, ''),
                                            did: data.did || '',
                                            createdAt: data.createdAt,
                                        })
                                    } catch { }
                                }
                            }
                            return racks
                        } catch {
                            return []
                        }
                    }
                },
                getRack: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<any | null> {
                        return this.$ProjectRack.get(name)
                    }
                },
                setRack: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, data: { did: string; privateKey: string; createdAt: string }): Promise<string> {
                        return this.$ProjectRack.set(name, data)
                    }
                },
                getRackPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<string> {
                        return this.$ProjectRack.getPath(name)
                    }
                },
                getCatalog: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<any | null> {
                        return this.$WorkspaceCatalogs.get(name)
                    }
                },
                setCatalog: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, data: any): Promise<string> {
                        return this.$WorkspaceCatalogs.set(name, data)
                    }
                },
                getCatalogPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<string> {
                        return this.$WorkspaceCatalogs.getPath(name)
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
capsule['#'] = 't44/caps/HomeRegistry'
