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
            '#@stream44.studio/t44/structs/WorkspaceConfig.v0': {
                as: '$WorkspaceConfig'
            },
            '#@stream44.studio/t44/structs/ProjectRackConfig.v0': {
                as: '$ProjectRackConfig'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt.v0'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/HomeRegistry.v0'
                },
                ensureRack: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<{ rackName: string }> {
                        const workspaceConfig = await this.$WorkspaceConfig.config
                        const rackConfig = await this.$ProjectRackConfig.config

                        // Check if projectRack is already set in config (object format: { name, identifier })
                        if (rackConfig?.name && rackConfig?.identifier) {
                            return { rackName: rackConfig.name }
                        }

                        let rackName: string

                        const rackConfigStructKey = '#@stream44.studio/t44/structs/ProjectRackConfig.v0'
                        if (!rackConfig?.name) {
                            rackName = await this.WorkspacePrompt.setupPrompt({
                                title: '📦 Project Rack Setup',
                                description: [
                                    `Workspace: ${workspaceConfig?.name || 'unknown'}`,
                                    `Root: ${workspaceConfig?.rootDir || 'unknown'}`,
                                    '',
                                    'The project rack holds an integrated set of projects which can be',
                                    'pulled into one or more workspaces.',
                                    'A workspace attached to a rack has access to all projects in the rack',
                                    'and is able to add more projects to the rack.',
                                    'All workspaces attached to a rack automatically sync their projects',
                                    'to the rack.',
                                    '',
                                ],
                                message: 'Enter a name for the project rack:',
                                defaultValue: 'genesis',
                                validate: (input: string) => {
                                    if (!input || input.trim().length === 0) {
                                        return 'Project rack name cannot be empty'
                                    }
                                    if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
                                        return 'Project rack name can only contain letters, numbers, underscores, and hyphens'
                                    }
                                    return true
                                },
                                configPath: [rackConfigStructKey],
                                onSuccess: async () => {
                                    // Don't write to config yet — we write the full object after rack registration
                                }
                            })
                        } else {
                            rackName = rackConfig.name
                        }

                        // Check if rack already exists in registry
                        let rackData = await this.HomeRegistry.getRack(rackName)

                        if (!rackData) {
                            const chalk = (await import('chalk')).default
                            console.log(chalk.cyan(`\n   Registering project rack '${rackName}'...\n`))

                            const { generateKeypair } = await import('../lib/ucan.js')
                            const { did, privateKey } = await generateKeypair()

                            rackData = {
                                did,
                                privateKey,
                                createdAt: new Date().toISOString()
                            }

                            const rackPath = await this.HomeRegistry.setRack(rackName, rackData)

                            console.log(chalk.green(`   ✓ Project rack registered at:`))
                            console.log(chalk.green(`     ${rackPath}`))
                            console.log(chalk.green(`   ✓ DID: ${rackData.did}\n`))
                        } else {
                            const chalk = (await import('chalk')).default
                            const rackPath = await this.HomeRegistry.getRackPath(rackName)
                            console.log(chalk.green(`\n   ✓ Using existing project rack at:`))
                            console.log(chalk.green(`     ${rackPath}`))
                            console.log(chalk.green(`   ✓ DID: ${rackData.did}\n`))
                        }

                        // Store rack as object { name, identifier } in rack config struct
                        await this.$ProjectRackConfig.setConfigValue(['name'], rackName)
                        await this.$ProjectRackConfig.setConfigValue(['identifier'], rackData.did)

                        return { rackName }
                    }
                },
                getRackName: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string | null> {
                        const rackConfig = await this.$ProjectRackConfig.config
                        return rackConfig?.name || null
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
capsule['#'] = '@stream44.studio/t44/caps/ProjectRack.v0'
