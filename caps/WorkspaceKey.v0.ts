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
            '#t44/structs/WorkspaceConfig.v0': {
                as: '$WorkspaceConfig'
            },
            '#t44/structs/WorkspaceKeyConfig.v0': {
                as: '$WorkspaceKeyConfig'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt.v0'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/HomeRegistry.v0'
                },
                ensureKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<{ keyName: string; keyPath: string }> {
                        const workspaceConfig = await this.$WorkspaceConfig.config
                        const keyConfig = await this.$WorkspaceKeyConfig.config

                        // Check if key is already set in config (object format: { name, identifier })
                        if (keyConfig?.name && keyConfig?.identifier) {
                            const keyExists = await this.HomeRegistry.keyExists(keyConfig.name)

                            if (keyExists) {
                                const keyPath = await this.HomeRegistry.getKeyPath(keyConfig.name)
                                return { keyName: keyConfig.name, keyPath }
                            } else {
                                const chalk = (await import('chalk')).default
                                const keyPath = await this.HomeRegistry.getKeyPath(keyConfig.name)
                                console.log(chalk.yellow(`\n⚠️  Workspace key '${keyConfig.name}' is configured but key file not found at:`))
                                console.log(chalk.yellow(`   ${keyPath}\n`))
                                // Fall through to generate the key
                            }
                        }

                        let keyName: string

                        const keyConfigStructKey = '#t44/structs/WorkspaceKeyConfig.v0'
                        if (!keyConfig?.name) {
                            keyName = await this.WorkspacePrompt.setupPrompt({
                                title: '🔐 Workspace Key Setup',
                                description: [
                                    `Workspace: ${workspaceConfig?.name || 'unknown'}`,
                                    `Root: ${workspaceConfig?.rootDir || 'unknown'}`,
                                    '',
                                    'All credentials in this workspace are encrypted with a workspace key.',
                                    'This key can be shared across multiple workspaces.',
                                    '',
                                ],
                                message: 'Enter a name for the workspace key:',
                                defaultValue: 'genesis',
                                validate: (input: string) => {
                                    if (!input || input.trim().length === 0) {
                                        return 'Key name cannot be empty'
                                    }
                                    if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
                                        return 'Key name can only contain letters, numbers, underscores, and hyphens'
                                    }
                                    return true
                                },
                                configPath: [keyConfigStructKey],
                                onSuccess: async () => {
                                    // Don't write to config yet — we write the full object after key generation
                                }
                            })
                        } else {
                            keyName = keyConfig.name
                        }

                        // Check if key already exists in registry
                        let keyData = await this.HomeRegistry.getKey(keyName)

                        if (!keyData) {
                            const chalk = (await import('chalk')).default
                            // Generate Ed25519 key pair using UCAN library
                            console.log(chalk.cyan(`\n   Generating Ed25519 key '${keyName}'...\n`))

                            const { generateKeypair } = await import('../lib/ucan.js')
                            const { did, privateKey } = await generateKeypair()

                            keyData = {
                                did,
                                privateKey,
                                createdAt: new Date().toISOString()
                            }

                            const keyPath = await this.HomeRegistry.setKey(keyName, keyData)

                            console.log(chalk.green(`   ✓ Key generated and saved to:`))
                            console.log(chalk.green(`     ${keyPath}`))
                            console.log(chalk.green(`   ✓ DID: ${keyData.did}\n`))
                        } else {
                            const chalk = (await import('chalk')).default
                            const keyPath = await this.HomeRegistry.getKeyPath(keyName)
                            console.log(chalk.green(`\n   ✓ Using existing key at:`))
                            console.log(chalk.green(`     ${keyPath}`))
                            console.log(chalk.green(`   ✓ DID: ${keyData.did}\n`))
                        }

                        // Store key as object { name, identifier } in key config struct
                        await this.$WorkspaceKeyConfig.setConfigValue(['name'], keyName)
                        await this.$WorkspaceKeyConfig.setConfigValue(['identifier'], keyData.did)

                        const keyPath = await this.HomeRegistry.getKeyPath(keyName)
                        return { keyName, keyPath }
                    }
                },
                getKeyPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string | null> {
                        const keyConfig = await this.$WorkspaceKeyConfig.config

                        if (!keyConfig?.name) {
                            return null
                        }

                        return this.HomeRegistry.getKeyPath(keyConfig.name)
                    }
                },
                getKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<{ did: string; privateKey: string }> {
                        const keyConfig = await this.$WorkspaceKeyConfig.config

                        if (!keyConfig?.name) {
                            throw new Error('No workspace key configured. Run ensureKey() first.')
                        }

                        const keyData = await this.HomeRegistry.getKey(keyConfig.name)

                        if (!keyData) {
                            throw new Error(`Workspace key '${keyConfig.name}' not found in registry. Run ensureKey() first.`)
                        }

                        return {
                            did: keyData.did,
                            privateKey: keyData.privateKey
                        }
                    }
                },
                getDid: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        const { did } = await this.getKey()
                        return did
                    }
                },
                encryptString: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, plaintext: string): Promise<string> {
                        const { privateKey } = await this.getKey()
                        const { encryptString } = await import('../lib/crypto.js')
                        return encryptString(plaintext, privateKey)
                    }
                },
                decryptString: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, ciphertext: string): Promise<string> {
                        const { privateKey } = await this.getKey()
                        const { decryptString } = await import('../lib/crypto.js')
                        return decryptString(ciphertext, privateKey)
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
capsule['#'] = 't44/caps/WorkspaceKey.v0'
