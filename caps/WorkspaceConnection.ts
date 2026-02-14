
import { join } from 'path'

// IMPORTANT: Connection config files contain encrypted credentials.
// NEVER delete these files programmatically. If decryption fails,
// log a clear error and exit so the user can investigate. The user must manually delete and re-enter
// credentials if the workspace key has changed.

// Track which connection setup titles and descriptions have been shown
const shownConnectionTitles = new Set<string>()
const shownDescriptions = new Set<string>()

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
                Home: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/Home'
                },
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt'
                },
                WorkspaceKey: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceKey'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/HomeRegistry'
                },
                JsonSchema: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/JsonSchemas'
                },
                RegisterSchemas: {
                    type: CapsulePropertyTypes.StructInit,
                    value: async function (this: any): Promise<void> {
                        if (this.schema?.schema) {
                            const version = this.schemaMinorVersion || '0'
                            await this.JsonSchema.registerSchema(this.capsuleName, this.schema.schema, version)
                        }
                    }
                },
                getFilepath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        const registryDir = await this.Home.registryDir
                        const workspaceConfig = await this.WorkspaceConfig.config
                        const workspaceConfigStruct = workspaceConfig?.['#t44/structs/WorkspaceConfig'] || {}
                        const workspaceName = workspaceConfigStruct.name
                        const connectionType = this.capsuleName.replace(/\//g, '~')
                        return join(registryDir, '@t44.sh~t44~caps~WorkspaceConnection', workspaceName, `${connectionType}.json`)
                    }
                },
                getRelativeFilepath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        const fullPath = await this.getFilepath()
                        return this.Home.relativePath(fullPath)
                    }
                },
                getStoredConfig: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<Record<string, any> | null> {
                        const { readFile } = await import('fs/promises')
                        const filepath = await this.getFilepath()

                        try {
                            const content = await readFile(filepath, 'utf-8')
                            const parsed = JSON.parse(content)
                            const config = parsed.config || {}

                            // Handle legacy encryptedConfig format (migrate to per-value encryption)
                            if (parsed.encryptedConfig) {
                                const decrypted = await this.WorkspaceKey.decryptString(parsed.encryptedConfig)
                                const legacyConfig = JSON.parse(decrypted)
                                // Re-save with per-value encryption
                                await this.setStoredConfig(legacyConfig)
                                return legacyConfig
                            }

                            const result: Record<string, any> = {}
                            let needsMigration = false

                            for (const [key, value] of Object.entries(config)) {
                                if (typeof value === 'string' && value.startsWith('aes-256-gcm:')) {
                                    // Encrypted value: <algo>:<keyName>-<did>:<enc value>
                                    // Also supports legacy format: <algo>:<keyName>:<enc value>
                                    // Use lastIndexOf since DID contains colons but base64 does not
                                    const lastColon = value.lastIndexOf(':')
                                    if (lastColon > 'aes-256-gcm:'.length) {
                                        const encryptedValue = value.substring(lastColon + 1)
                                        const keyIdentifier = value.substring('aes-256-gcm:'.length, lastColon)
                                        try {
                                            const decrypted = await this.WorkspaceKey.decryptString(encryptedValue)
                                            result[key] = JSON.parse(decrypted)
                                        } catch (decryptErr: any) {
                                            const chalk = (await import('chalk')).default
                                            let currentKeyId = 'unknown'
                                            try {
                                                const keyConfig = await this.WorkspaceKey.ensureKey()
                                                const did = await this.WorkspaceKey.getDid()
                                                currentKeyId = `${keyConfig.keyName}-${did}`
                                            } catch { }
                                            console.error(chalk.red(`\n┌─────────────────────────────────────────────────────────────────┐`))
                                            console.error(chalk.red(`│  ✗  Connection Credential Decryption Failed                     │`))
                                            console.error(chalk.red(`├─────────────────────────────────────────────────────────────────┤`))
                                            console.error(chalk.red(`│                                                                 │`))
                                            console.error(chalk.red(`│  Cannot decrypt '${key}' in ${this.capsuleName}`))
                                            console.error(chalk.red(`│                                                                 │`))
                                            console.error(chalk.red(`│  This credential was encrypted with a different workspace key.  │`))
                                            console.error(chalk.red(`│  Encrypted with: ${keyIdentifier}`))
                                            console.error(chalk.red(`│  Current key:    ${currentKeyId}`))
                                            console.error(chalk.red(`│                                                                 │`))
                                            console.error(chalk.red(`├─────────────────────────────────────────────────────────────────┤`))
                                            console.error(chalk.red(`│  To fix, delete the connection config and re-enter credentials: │`))
                                            console.error(chalk.red(`│                                                                 │`))
                                            console.error(chalk.red(`│    rm ${filepath}`))
                                            console.error(chalk.red(`│                                                                 │`))
                                            console.error(chalk.red(`└─────────────────────────────────────────────────────────────────┘\n`))
                                            process.exit(1)
                                        }
                                    }
                                } else {
                                    // Plain text value - needs migration
                                    result[key] = value
                                    needsMigration = true
                                }
                            }

                            // Auto-migrate plain text values to encrypted
                            if (needsMigration) {
                                await this.setStoredConfig(result)
                            }

                            return Object.keys(result).length > 0 ? result : null
                        } catch (err: any) {
                            // If file doesn't exist, that's normal - user hasn't configured this provider yet
                            if (err?.code === 'ENOENT') {
                                return null
                            }

                            // For other errors (permission issues, malformed JSON, etc.), log and exit
                            const chalk = (await import('chalk')).default
                            console.error(chalk.red(`\n\u2717 Failed to read connection config for '${this.capsuleName}'\n`))
                            console.error(chalk.red(`  File: ${filepath}`))
                            console.error(chalk.red(`  Error: ${err?.message || err}\n`))
                            process.exit(1)
                        }
                    }
                },
                setStoredConfig: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, config: Record<string, any>): Promise<void> {
                        const { mkdir, writeFile } = await import('fs/promises')
                        const { dirname } = await import('path')
                        const filepath = await this.getFilepath()
                        const dir = dirname(filepath)

                        await mkdir(dir, { recursive: true })

                        // Ensure workspace key exists and get key name + DID
                        const { keyName } = await this.WorkspaceKey.ensureKey()
                        const did = await this.WorkspaceKey.getDid()

                        // Encrypt each value separately with prefix format
                        const encryptedConfig: Record<string, string> = {}
                        for (const [key, value] of Object.entries(config)) {
                            const valueJson = JSON.stringify(value)
                            const encrypted = await this.WorkspaceKey.encryptString(valueJson)
                            // Format: <algo>:<keyName>-<did>:<enc value>
                            encryptedConfig[key] = `aes-256-gcm:${keyName}-${did}:${encrypted}`
                        }

                        const output = {
                            config: encryptedConfig
                        }

                        await writeFile(filepath, JSON.stringify(output, null, 4), { mode: 0o600 })
                    }
                },
                getConfigValue: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, key: string): Promise<any> {
                        const storedConfig = await this.getStoredConfig() || {}

                        if (storedConfig[key] !== undefined) {
                            return storedConfig[key]
                        }

                        // Value not set, need to prompt user
                        const propertySchema = this.schema?.schema?.properties?.[key]
                        if (!propertySchema) {
                            throw new Error(`No schema defined for config key "${key}" in ${this.capsuleName} connection config`)
                        }

                        // Create promptFactId for deduplication
                        const promptFactId = `${this.capsuleName}:${key}`

                        // Show title once per capsuleName
                        const chalk = (await import('chalk')).default
                        if (!shownConnectionTitles.has(this.capsuleName)) {
                            console.log(chalk.cyan(`\n🔑 ${this.capsuleName} Connection Setup\n`))
                            shownConnectionTitles.add(this.capsuleName)
                        }

                        // Show description once per promptFactId
                        if (propertySchema.description && !shownDescriptions.has(promptFactId)) {
                            console.log(chalk.gray(`   ${propertySchema.description}\n`))
                            shownDescriptions.add(promptFactId)
                        }

                        const value = await this.WorkspacePrompt.input({
                            message: `${propertySchema.title || key}:`,
                            validate: (input: string) => {
                                if (!input || input.trim().length === 0) {
                                    return `${propertySchema.title || key} cannot be empty`
                                }
                                return true
                            },
                            promptFactId
                        })

                        // Store the value
                        storedConfig[key] = value
                        await this.setStoredConfig(storedConfig)

                        console.log(chalk.green(`\n   ✓ ${propertySchema.title || key} saved to connection config\n`))

                        return value
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
capsule['#'] = 't44/caps/WorkspaceConnection'
