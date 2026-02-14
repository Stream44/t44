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
            '#t44/structs/WorkspaceKeyConfig': {
                as: '$WorkspaceKeyConfig'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/HomeRegistry'
                },
                RootKey: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/RootKey'
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
                                // Migrate legacy: encrypt raw privateKey if not yet encrypted
                                const keyData = await this.HomeRegistry.getKey(keyConfig.name)
                                if (keyData?.privateKey && !keyData?.encryptedPrivateKey) {
                                    const passphrase = await this._derivePassphrase(keyConfig.name)
                                    const { encryptString: encryptFn } = await import('../lib/crypto.js')
                                    const chalk = (await import('chalk')).default
                                    keyData.encryptedPrivateKey = encryptFn(keyData.privateKey, passphrase)
                                    delete keyData.privateKey
                                    await this.HomeRegistry.setKey(keyConfig.name, keyData)
                                    console.log(chalk.green(`   ✓ Private key encrypted with root key\n`))
                                }

                                // Verify decryption works with current root key derivation
                                if (keyData?.encryptedPrivateKey) {
                                    const passphrase = await this._derivePassphrase(keyConfig.name)
                                    const { decryptString: decryptFn } = await import('../lib/crypto.js')
                                    try {
                                        decryptFn(keyData.encryptedPrivateKey, passphrase)
                                    } catch {
                                        const chalk = (await import('chalk')).default
                                        const { stat: statFile } = await import('fs/promises')
                                        const keyPath = await this.HomeRegistry.getKeyPath(keyConfig.name)

                                        // Run diagnostics
                                        const rootKeyPath = await this.RootKey.getKeyPath()
                                        let rootKeyFound = false
                                        let rootKeyFingerprint = ''
                                        if (rootKeyPath) {
                                            try {
                                                await statFile(rootKeyPath)
                                                rootKeyFound = true
                                                const { execSync } = await import('child_process')
                                                const fpOutput = execSync(`ssh-keygen -lf ${JSON.stringify(rootKeyPath)}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
                                                const match = fpOutput.match(/(SHA256:\S+)/)
                                                rootKeyFingerprint = match ? match[1] : fpOutput
                                            } catch { }
                                        }

                                        console.error(chalk.red(`\n┌─────────────────────────────────────────────────────────────────┐`))
                                        console.error(chalk.red(`│  ✗  Workspace Key Decryption Failed                             │`))
                                        console.error(chalk.red(`├─────────────────────────────────────────────────────────────────┤`))
                                        console.error(chalk.red(`│                                                                 │`))
                                        console.error(chalk.red(`│  The workspace key's encrypted private key cannot be decrypted  │`))
                                        console.error(chalk.red(`│  with the current root key. This typically happens when the     │`))
                                        console.error(chalk.red(`│  root SSH key has been changed or regenerated since the          │`))
                                        console.error(chalk.red(`│  workspace key was first created.                               │`))
                                        console.error(chalk.red(`│                                                                 │`))
                                        console.error(chalk.red(`├─────────────────────────────────────────────────────────────────┤`))
                                        console.error(chalk.red(`│  Diagnostics:                                                   │`))
                                        console.error(chalk.red(`│                                                                 │`))
                                        console.error(chalk.red(`│  ${rootKeyFound ? '✓' : '✗'}  Root SSH key: ${rootKeyPath || '(not configured)'}`))
                                        if (rootKeyFound && rootKeyFingerprint) {
                                            console.error(chalk.red(`│     Fingerprint: ${rootKeyFingerprint}`))
                                        }
                                        console.error(chalk.red(`│  ✓  Workspace key file: ${keyPath}`))
                                        console.error(chalk.red(`│     DID: ${keyData.did}`))
                                        console.error(chalk.red(`│     Created: ${keyData.createdAt}`))
                                        console.error(chalk.red(`│  ✗  Passphrase derivation: mismatch`))
                                        console.error(chalk.red(`│                                                                 │`))
                                        console.error(chalk.red(`├─────────────────────────────────────────────────────────────────┤`))
                                        console.error(chalk.red(`│  To fix, delete the workspace key file and re-run:              │`))
                                        console.error(chalk.red(`│                                                                 │`))
                                        console.error(chalk.red(`│    rm ${keyPath}`))
                                        console.error(chalk.red(`│                                                                 │`))
                                        console.error(chalk.red(`│  A new workspace key will be generated automatically.           │`))
                                        console.error(chalk.red(`│  You will need to re-enter any saved connection credentials     │`))
                                        console.error(chalk.red(`│  (e.g. GitHub tokens) as they were encrypted with the old key.  │`))
                                        console.error(chalk.red(`└─────────────────────────────────────────────────────────────────┘\n`))
                                        process.exit(1)
                                    }
                                }

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

                        const keyConfigStructKey = '#t44/structs/WorkspaceKeyConfig'
                        if (!keyConfig?.name) {
                            const chalk = (await import('chalk')).default

                            console.log(chalk.cyan(`\n🔐 Workspace Key Setup\n`))
                            console.log(chalk.gray(`   Workspace: ${workspaceConfig?.name || 'unknown'}`))
                            console.log(chalk.gray(`   Root: ${workspaceConfig?.rootDir || 'unknown'}`))
                            console.log(chalk.gray(''))
                            console.log(chalk.gray('   All credentials in this workspace are encrypted with a workspace key.'))
                            console.log(chalk.gray('   You can select an existing key or create a new one.'))
                            console.log(chalk.gray(''))

                            // List existing workspace keys from registry
                            const existingKeys = await this.HomeRegistry.listKeys()

                            // Build choices
                            const choices: Array<{ name: string; value: any }> = []

                            for (const key of existingKeys) {
                                choices.push({
                                    name: `${key.name}  ${chalk.gray(key.did ? key.did.substring(0, 50) + '...' : '')}`,
                                    value: { type: 'existing', name: key.name }
                                })
                            }

                            choices.push({
                                name: chalk.yellow('+ Create a new workspace key'),
                                value: { type: 'create' }
                            })

                            const selected = await this.WorkspacePrompt.select({
                                message: 'Select a workspace key:',
                                choices,
                                defaultValue: { type: 'create' },
                                pageSize: 15
                            })

                            if (selected.type === 'existing') {
                                keyName = selected.name
                            } else {
                                // Prompt for key name
                                keyName = await this.WorkspacePrompt.input({
                                    message: 'Enter a name for the new workspace key:',
                                    defaultValue: workspaceConfig?.name || 'genesis',
                                    validate: (input: string) => {
                                        if (!input || input.trim().length === 0) {
                                            return 'Key name cannot be empty'
                                        }
                                        if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
                                            return 'Key name can only contain letters, numbers, underscores, and hyphens'
                                        }
                                        return true
                                    }
                                })
                            }
                        } else {
                            keyName = keyConfig.name
                        }

                        // Check if key already exists in registry
                        let keyData = await this.HomeRegistry.getKey(keyName)

                        // Derive passphrase for encrypting the private key
                        const passphrase = await this._derivePassphrase(keyName)
                        const { encryptString: encryptFn } = await import('../lib/crypto.js')

                        if (!keyData) {
                            const chalk = (await import('chalk')).default
                            // Generate Ed25519 key pair using UCAN library
                            console.log(chalk.cyan(`\n   Generating Ed25519 key '${keyName}'...\n`))

                            const { generateKeypair } = await import('../lib/ucan.js')
                            const { did, privateKey } = await generateKeypair()

                            // Encrypt the private key before storing
                            const encryptedPrivateKey = encryptFn(privateKey, passphrase)

                            keyData = {
                                did,
                                encryptedPrivateKey,
                                createdAt: new Date().toISOString()
                            }

                            const keyPath = await this.HomeRegistry.setKey(keyName, keyData)

                            console.log(chalk.green(`   ✓ Key generated and saved to:`))
                            console.log(chalk.green(`     ${keyPath}`))
                            console.log(chalk.green(`   ✓ DID: ${keyData.did}\n`))
                        } else {
                            const chalk = (await import('chalk')).default
                            const keyPath = await this.HomeRegistry.getKeyPath(keyName)

                            // Migrate legacy: encrypt raw privateKey and remove it
                            if (keyData.privateKey && !keyData.encryptedPrivateKey) {
                                const encryptedPrivateKey = encryptFn(keyData.privateKey, passphrase)
                                keyData.encryptedPrivateKey = encryptedPrivateKey
                                delete keyData.privateKey
                                await this.HomeRegistry.setKey(keyName, keyData)
                                console.log(chalk.green(`\n   ✓ Using existing key at:`))
                                console.log(chalk.green(`     ${keyPath}`))
                                console.log(chalk.green(`   ✓ DID: ${keyData.did}`))
                                console.log(chalk.green(`   ✓ Private key encrypted with root key\n`))
                            } else {
                                console.log(chalk.green(`\n   ✓ Using existing key at:`))
                                console.log(chalk.green(`     ${keyPath}`))
                                console.log(chalk.green(`   ✓ DID: ${keyData.did}\n`))
                            }
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

                        // Decrypt encryptedPrivateKey at runtime
                        if (keyData.encryptedPrivateKey) {
                            const passphrase = await this._derivePassphrase(keyConfig.name)
                            const { decryptString: decryptFn } = await import('../lib/crypto.js')
                            const privateKey = decryptFn(keyData.encryptedPrivateKey, passphrase)
                            return { did: keyData.did, privateKey }
                        }

                        // Legacy fallback: raw privateKey
                        if (keyData.privateKey) {
                            return { did: keyData.did, privateKey: keyData.privateKey }
                        }

                        throw new Error(`Workspace key '${keyConfig.name}' has no private key data.`)
                    }
                },
                getDid: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        const { did } = await this.getKey()
                        return did
                    }
                },
                _derivePassphrase: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, keyName: string): Promise<string> {
                        const crypto = await import('crypto')
                        const { readFile } = await import('fs/promises')

                        const rootKeyPath = await this.RootKey.getKeyPath()
                        if (!rootKeyPath) {
                            throw new Error('Root key not configured. Run RootKey.ensureKey() first.')
                        }

                        const privateKeyData = await readFile(rootKeyPath, 'utf-8')
                        const hash = crypto.createHmac('sha256', privateKeyData)
                            .update(keyName)
                            .digest('base64url')

                        return hash
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
capsule['#'] = 't44/caps/WorkspaceKey'
