
import { join } from 'path'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { validatePropertyValue } from '../lib/openapi.js'

// IMPORTANT: Connection config files (.~o/workspace.foundation/WorkspaceConnections/o/<origin>/config.json)
// contain encrypted credentials. NEVER delete these files programmatically. If decryption fails,
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
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceConfig.v0'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt.v0'
                },
                WorkspaceKey: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceKey.v0'
                },
                origin: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined,
                },
                schema: {
                    type: CapsulePropertyTypes.Literal,
                    value: {},
                },
                getFilepath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): string {
                        return join(
                            this.WorkspaceConfig.workspaceRootDir,
                            this.getRelativeFilepath()
                        )
                    }
                },
                getRelativeFilepath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): string {
                        return join(
                            '.~o',
                            'workspace.foundation',
                            'WorkspaceConnections',
                            'o',
                            this.origin,
                            'config.json'
                        )
                    }
                },
                getStoredConfig: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<Record<string, any> | null> {
                        const filepath = this.getFilepath()

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
                                            const keyPath = await this.WorkspaceKey.getKeyPath()
                                            let currentDid: string | null = null
                                            try { currentDid = await this.WorkspaceKey.getDid() } catch { }
                                            console.error(chalk.red(`\n\u2717 Decryption failed for '${key}' in ${this.origin} connection config\n`))
                                            console.error(chalk.red(`  Config file: ${filepath}`))
                                            console.error(chalk.red(`  Encrypted with key identifier: ${keyIdentifier}`))
                                            console.error(chalk.red(`  Current workspace key file: ${keyPath}`))
                                            if (currentDid) {
                                                console.error(chalk.red(`  Current workspace key DID: ${currentDid}`))
                                            }
                                            console.error(chalk.red(`  Error: ${decryptErr?.message || decryptErr}`))
                                            console.error(chalk.yellow(`\n  The workspace key may have changed since these credentials were saved.`))
                                            console.error(chalk.yellow(`  To fix: restore the original key, or manually delete the config file and re-enter credentials.\n`))
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
                            if (err?.code === 'ENOENT') {
                                return null
                            }
                            const chalk = (await import('chalk')).default
                            console.error(chalk.red(`\n\u2717 Failed to read connection config for '${this.origin}'\n`))
                            console.error(chalk.red(`  File: ${this.getFilepath()}`))
                            console.error(chalk.red(`  Error: ${err?.message || err}\n`))
                            process.exit(1)
                        }
                    }
                },
                setStoredConfig: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, config: Record<string, any>): Promise<void> {
                        const filepath = this.getFilepath()
                        const dir = join(filepath, '..')

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
                            $schema: 'https://json-schema.org/draft/2020-12/schema',
                            config: encryptedConfig
                        }

                        await writeFile(filepath, JSON.stringify(output, null, 4))
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
                        const propertySchema = this.schema?.properties?.[key]
                        if (!propertySchema) {
                            throw new Error(`No schema defined for config key "${key}" in ${this.origin} connection config`)
                        }

                        // Create promptFactId for deduplication
                        const promptFactId = `${this.capsuleName}:${key}`

                        // Show title once per origin
                        const chalk = (await import('chalk')).default
                        if (!shownConnectionTitles.has(this.origin)) {
                            console.log(chalk.cyan(`\n🔑 ${this.origin} Connection Setup\n`))
                            shownConnectionTitles.add(this.origin)
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
                                // Validate against schema using AJV
                                const result = validatePropertyValue(propertySchema, input, key)
                                if (!result.valid) {
                                    return result.error || `Invalid value for ${propertySchema.title || key}`
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
capsule['#'] = '@stream44.studio/t44/caps/WorkspaceConnection.v0'
