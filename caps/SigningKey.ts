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
            '#t44/structs/WorkspaceConfig': {
                as: '$WorkspaceConfig'
            },
            '#t44/structs/SigningKeyConfig': {
                as: '$SigningKeyConfig'
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
                ensureKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<{ keyName: string; privateKeyPath: string; publicKey: string; keyFingerprint: string } | null> {
                        const { join } = await import('path')
                        const { readFile, stat: statFile } = await import('fs/promises')
                        const chalk = (await import('chalk')).default
                        const {
                            discoverEd25519Keys,
                            validateConfiguredKey,
                            ensurePassphrase,
                            ensureKeyInAgent,
                            computeFingerprint,
                            promptPassphrase,
                            generateEd25519Key
                        } = await import('../lib/key.js')

                        const workspaceConfig = await this.$WorkspaceConfig.config
                        const keyConfig = await this.$SigningKeyConfig.config
                        const sshDir = await this.Home.sshDir

                        // --- Already configured: validate ---
                        if (keyConfig?.name && keyConfig?.privateKeyPath && keyConfig?.publicKey && keyConfig?.keyFingerprint) {
                            const valid = await validateConfiguredKey(keyConfig, 'Signing Key')
                            if (!valid) {
                                return null
                            }
                            return {
                                keyName: keyConfig.name,
                                privateKeyPath: keyConfig.privateKeyPath,
                                publicKey: keyConfig.publicKey,
                                keyFingerprint: keyConfig.keyFingerprint
                            }
                        }

                        // --- Not configured: discover or create ---
                        console.log(chalk.cyan(`\n🔏 Signing Key Setup\n`))
                        console.log(chalk.gray(`   Workspace: ${workspaceConfig?.name || 'unknown'}`))
                        console.log(chalk.gray(`   Root: ${workspaceConfig?.rootDir || 'unknown'}`))
                        console.log(chalk.gray(''))
                        console.log(chalk.gray('   The signing key is an Ed25519 SSH key used for code and artifact signing.'))
                        console.log(chalk.gray('   You can select an existing key from ~/.ssh or create a new one.'))
                        console.log(chalk.gray(''))

                        // Discover existing Ed25519 keys in ~/.ssh
                        const existingKeys = await discoverEd25519Keys(sshDir)

                        // Build choices
                        const choices: Array<{ name: string; value: any }> = []

                        for (const key of existingKeys) {
                            choices.push({
                                name: `${key.name}  ${chalk.gray(key.publicKey.substring(0, 60) + '...')}`,
                                value: { type: 'existing', ...key }
                            })
                        }

                        choices.push({
                            name: chalk.yellow('+ Create a new Ed25519 key'),
                            value: { type: 'create' }
                        })

                        const selected = await this.WorkspacePrompt.select({
                            message: 'Select an Ed25519 key for signing:',
                            choices,
                            defaultValue: { type: 'create' },
                            pageSize: 15
                        })

                        let keyName: string
                        let privateKeyPath: string
                        let publicKey: string
                        let keyFingerprint: string

                        if (selected.type === 'existing') {
                            keyName = selected.name
                            privateKeyPath = selected.privateKeyPath
                            publicKey = selected.publicKey
                            keyFingerprint = computeFingerprint(selected.privateKeyPath)

                            // Ensure selected existing key has a passphrase
                            const passphraseOk = await ensurePassphrase(privateKeyPath, keyName, 'Signing key')
                            if (!passphraseOk) {
                                return null
                            }

                            // Add to ssh-agent
                            await ensureKeyInAgent(privateKeyPath, keyName, 'Signing key')
                        } else {
                            // Prompt for key name
                            keyName = await this.WorkspacePrompt.input({
                                message: 'Enter a name for the new signing key:',
                                defaultValue: 'id_t44_signing_ed25519',
                                validate: (input: string) => {
                                    if (!input || input.trim().length === 0) {
                                        return 'Key name cannot be empty'
                                    }
                                    if (!/^[a-zA-Z0-9_.-]+$/.test(input)) {
                                        return 'Key name can only contain letters, numbers, underscores, dots, and hyphens'
                                    }
                                    return true
                                }
                            })

                            privateKeyPath = join(sshDir, keyName)

                            // Check if file already exists
                            let exists = false
                            try {
                                await statFile(privateKeyPath)
                                exists = true
                            } catch { }

                            if (exists) {
                                console.log(chalk.red(`\n   ✗ File already exists: ${privateKeyPath}`))
                                console.log(chalk.red(`     Choose a different name or select the existing key.\n`))
                                return null
                            }

                            // Prompt for passphrase
                            console.log(chalk.cyan(`\n   Generating Ed25519 signing key '${keyName}'...`))
                            console.log(chalk.gray(`   The key will be protected with a passphrase and added to the macOS Keychain.\n`))

                            const envPassphrase = process.env.T44_KEYS_PASSPHRASE
                            const passphrase = envPassphrase || await promptPassphrase()
                            if (!passphrase) {
                                console.log(chalk.red(`\n   ✗ A passphrase is required for the signing key.\n`))
                                return null
                            }

                            const result = await generateEd25519Key(privateKeyPath, passphrase, 't44-signing-key')
                            if (!result) {
                                return null
                            }

                            publicKey = result.publicKey
                            keyFingerprint = result.keyFingerprint

                            console.log(chalk.green(`   ✓ Signing key generated:`))
                            console.log(chalk.green(`     ${privateKeyPath}`))
                            console.log(chalk.green(`     ${privateKeyPath}.pub\n`))

                            // Add the new key to the ssh-agent with Keychain storage
                            if (!envPassphrase) {
                                await ensureKeyInAgent(privateKeyPath, keyName, 'Signing key')
                            }
                        }

                        // Store in config
                        await this.$SigningKeyConfig.setConfigValue(['name'], keyName)
                        await this.$SigningKeyConfig.setConfigValue(['privateKeyPath'], privateKeyPath)
                        await this.$SigningKeyConfig.setConfigValue(['publicKey'], publicKey)
                        await this.$SigningKeyConfig.setConfigValue(['keyFingerprint'], keyFingerprint)

                        console.log(chalk.green(`   ✓ Signing key configured: ${keyName}`))
                        console.log(chalk.green(`     ${keyFingerprint}\n`))

                        return { keyName, privateKeyPath, publicKey, keyFingerprint }
                    }
                },
                getKeyPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string | null> {
                        const keyConfig = await this.$SigningKeyConfig.config

                        if (!keyConfig?.privateKeyPath) {
                            return null
                        }

                        return keyConfig.privateKeyPath
                    }
                },
                getPublicKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string | null> {
                        const keyConfig = await this.$SigningKeyConfig.config

                        if (!keyConfig?.publicKey) {
                            return null
                        }

                        return keyConfig.publicKey
                    }
                },
                getFingerprint: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string | null> {
                        const keyConfig = await this.$SigningKeyConfig.config

                        if (!keyConfig?.keyFingerprint) {
                            return null
                        }

                        return keyConfig.keyFingerprint
                    }
                },
                getKeyName: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string | null> {
                        const keyConfig = await this.$SigningKeyConfig.config

                        if (!keyConfig?.name) {
                            return null
                        }

                        return keyConfig.name
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
capsule['#'] = 't44/caps/SigningKey'
