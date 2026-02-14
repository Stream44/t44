
import { join, resolve } from 'path'

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
            '#': {
                workspaceRootDir: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined
                },
                workspaceConfigFilepath: {
                    type: CapsulePropertyTypes.Literal,
                    value: '.workspace/workspace.yaml'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/HomeRegistry'
                },
                WorkspaceConfigFile: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfigFile'
                },
                config: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<object> {

                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath);

                        const { config } = await this.WorkspaceConfigFile.loadConfig(configPath, this.workspaceRootDir)

                        // Validate javascript.api.workspaceDir from CLI config struct
                        const cliConfigStructKey = '#t44/structs/WorkspaceCliConfig'
                        const cliConfigStruct = config[cliConfigStructKey] || {}
                        if (resolve(cliConfigStruct?.javascript?.api?.workspaceDir) !== this.workspaceRootDir) {
                            throw new Error(`javascript.api.workspaceDir '${cliConfigStruct?.javascript?.api?.workspaceDir}' in '${configPath}' does not match expected this.workspaceRootDir '${this.workspaceRootDir}'!`)
                        }

                        // Validate rootDir if set
                        const workspaceConfigStructKey = '#t44/structs/WorkspaceConfig'
                        const workspaceConfigStruct = config[workspaceConfigStructKey] || {}
                        if (workspaceConfigStruct.rootDir && workspaceConfigStruct.rootDir !== this.workspaceRootDir) {
                            throw new Error(`rootDir '${workspaceConfigStruct.rootDir}' does not match expected '${this.workspaceRootDir}'!`)
                        }
                        if (workspaceConfigStruct.rootConfigFilepath && workspaceConfigStruct.rootConfigFilepath !== this.workspaceConfigFilepath) {
                            throw new Error(`rootConfigFilepath '${workspaceConfigStruct.rootConfigFilepath}' does not match expected '${this.workspaceConfigFilepath}'!`)
                        }

                        return config
                    }
                },
                ensureConfigBase: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {

                        const workspaceConfigStructKey = '#t44/structs/WorkspaceConfig'

                        const config = await this.config
                        const workspaceConfigStruct = config[workspaceConfigStructKey] || {}

                        if (!workspaceConfigStruct.rootDir) {
                            await this.$WorkspaceConfig.setConfigValue(['rootDir'], this.workspaceRootDir)
                        }

                        if (!workspaceConfigStruct.rootConfigFilepath) {
                            await this.$WorkspaceConfig.setConfigValue(['rootConfigFilepath'], this.workspaceConfigFilepath)
                        }
                    }
                },
                ensureConfigIdentity: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {

                        const workspaceConfigStructKey = '#t44/structs/WorkspaceConfig'

                        const config = await this.config
                        const workspaceConfigStruct = config[workspaceConfigStructKey] || {}

                        // Ensure workspace name
                        if (!workspaceConfigStruct.name) {
                            const { basename } = await import('path')

                            let workspaceName: string | undefined

                            while (!workspaceName) {
                                const candidateName = await this.WorkspacePrompt.setupPrompt({
                                    title: '🏢 Workspace Name Setup',
                                    description: 'A workspace holds some or all projects registered in a Project Rack.',
                                    message: 'Enter a name for this workspace:',
                                    defaultValue: basename(this.workspaceRootDir),
                                    validate: (input: string) => {
                                        if (!input || input.trim().length === 0) {
                                            return 'Workspace name cannot be empty'
                                        }
                                        if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
                                            return 'Workspace name can only contain letters, numbers, underscores, and hyphens'
                                        }
                                        return true
                                    },
                                    configPath: [workspaceConfigStructKey, 'name'],
                                    onSuccess: async () => {
                                        // Don't write to config yet — we need to validate first
                                    }
                                })

                                // Check if a workspace with this name already exists in the registry
                                const existingData = await this.HomeRegistry.getWorkspace(candidateName)

                                if (existingData) {
                                    if (existingData.workspaceRootDir === this.workspaceRootDir) {
                                        // Same directory — adopt existing identity
                                        const chalk = (await import('chalk')).default
                                        console.log(chalk.green(`\n   ✓ Found existing workspace identity for "${candidateName}" in this directory.`))
                                        console.log(chalk.green(`     Adopting existing identity.\n`))

                                        await this.$WorkspaceConfig.setConfigValue(['name'], candidateName)
                                        workspaceConfigStruct.name = candidateName

                                        // Adopt the existing identifier
                                        await this.$WorkspaceConfig.setConfigValue(['identifier'], existingData.did)
                                        workspaceConfigStruct.identifier = existingData.did

                                        console.log(chalk.green(`   ✓ DID: ${existingData.did}\n`))
                                        workspaceName = candidateName
                                    } else {
                                        // Different directory — warn and prompt
                                        const chalk = (await import('chalk')).default
                                        const registryPath = await this.HomeRegistry.getWorkspacePath(candidateName)
                                        console.log(chalk.yellow(`\n   ⚠  A workspace named "${candidateName}" already exists at:`))
                                        console.log(chalk.white(`        ${registryPath}`))
                                        console.log('')
                                        console.log(chalk.yellow(`      It is currently connected to:`))
                                        console.log(chalk.white(`        ${existingData.workspaceRootDir}`))
                                        console.log('')
                                        console.log(chalk.yellow(`      You are trying to set up a workspace with the same name in:`))
                                        console.log(chalk.white(`        ${this.workspaceRootDir}\n`))
                                        console.log(chalk.yellow(`      A workspace can only be connected to one directory.`))
                                        console.log('')

                                        const confirmed = await this.WorkspacePrompt.confirm({
                                            message: `Disconnect "${candidateName}" from "${existingData.workspaceRootDir}" and connect it to "${this.workspaceRootDir}" instead?`,
                                            defaultValue: false
                                        })

                                        if (confirmed) {
                                            // Update registry with new rootDir
                                            existingData.workspaceRootDir = this.workspaceRootDir
                                            await this.HomeRegistry.setWorkspace(candidateName, existingData)

                                            await this.$WorkspaceConfig.setConfigValue(['name'], candidateName)
                                            workspaceConfigStruct.name = candidateName

                                            // Adopt the existing identifier
                                            await this.$WorkspaceConfig.setConfigValue(['identifier'], existingData.did)
                                            workspaceConfigStruct.identifier = existingData.did

                                            console.log(chalk.green(`\n   ✓ Workspace "${candidateName}" reconnected to this directory.`))
                                            console.log(chalk.green(`   ✓ DID: ${existingData.did}\n`))
                                            workspaceName = candidateName
                                        } else {
                                            console.log(chalk.gray(`\n   Please choose a different workspace name.\n`))
                                            // Loop again to re-prompt
                                        }
                                    }
                                } else {
                                    // Name is available — commit it
                                    await this.$WorkspaceConfig.setConfigValue(['name'], candidateName)
                                    workspaceConfigStruct.name = candidateName
                                    workspaceName = candidateName
                                }
                            }
                        }

                        // Ensure workspace identifier
                        if (!workspaceConfigStruct.identifier) {
                            const chalk = (await import('chalk')).default

                            const workspaceName = workspaceConfigStruct.name

                            console.log(chalk.cyan('\n🔑 Workspace Identifier Setup\n'))
                            console.log(chalk.gray('   Generating unique workspace identifier...\n'))

                            // Generate Ed25519 key pair for workspace identifier
                            const { generateKeypair } = await import('../lib/ucan.js')
                            const { did, privateKey } = await generateKeypair()

                            // Store in registry
                            const identifierData = {
                                did,
                                privateKey,
                                createdAt: new Date().toISOString(),
                                workspaceRootDir: this.workspaceRootDir,
                            }

                            const identifierPath = await this.HomeRegistry.setWorkspace(workspaceName, identifierData)

                            // Update config with workspace identifier (DID)
                            await this.$WorkspaceConfig.setConfigValue(['identifier'], did)

                            console.log(chalk.green(`   ✓ Workspace identifier generated and saved to:`))
                            console.log(chalk.green(`     ${identifierPath}`))
                            console.log(chalk.green(`   ✓ DID: ${did}\n`))
                        }
                    }
                },
                configTree: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<any> {
                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath);
                        const { configTree } = await this.WorkspaceConfigFile.loadConfig(configPath, this.workspaceRootDir)
                        return configTree
                    }
                },
                entitySources: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<Map<string, { path: string, line: number }[]>> {
                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath);
                        const { entitySources } = await this.WorkspaceConfigFile.loadConfig(configPath, this.workspaceRootDir)
                        return entitySources
                    }
                },
                setConfigValue: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, path: string[], value: any, options?: { ifAbsent?: boolean }): Promise<boolean> {
                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath)
                        return this.WorkspaceConfigFile.setConfigValue(configPath, path, value, options)
                    }
                },
                setConfigValueForEntity: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, entity: { entityName: string, schema: any }, path: string[], value: any, options?: { ifAbsent?: boolean }): Promise<boolean> {
                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath)
                        return this.WorkspaceConfigFile.setConfigValueForEntity(configPath, entity, path, value, options)
                    }
                },
                ensureEntityTimestamps: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, entity: { entityName: string }, configKey: string, now: string): Promise<void> {
                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath)
                        await this.WorkspaceConfigFile.setConfigValue(configPath, [configKey, 'createdAt'], now, { ifAbsent: true })
                        await this.WorkspaceConfigFile.setConfigValue(configPath, [configKey, 'updatedAt'], now, { ifAbsent: true })
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
capsule['#'] = 't44/caps/WorkspaceConfig'
