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
            '#@stream44.studio/t44/structs/WorkspaceConfig': {
                as: '$WorkspaceConfig'
            },
            '#@stream44.studio/t44/structs/ProjectRackConfig': {
                as: '$ProjectRackConfig'
            },
            '#': {
                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceLib'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/HomeRegistry'
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

                        const rackConfigStructKey = '#@stream44.studio/t44/structs/ProjectRackConfig'
                        if (!rackConfig?.name) {
                            console.log(this.lib.chalk.cyan(`\n📦 Project Rack Setup\n`))
                            console.log(this.lib.chalk.gray(`   Workspace: ${workspaceConfig?.name || 'unknown'}`))
                            console.log(this.lib.chalk.gray(`   Root: ${workspaceConfig?.rootDir || 'unknown'}`))
                            console.log(this.lib.chalk.gray(''))
                            console.log(this.lib.chalk.gray('   The project rack holds an integrated set of projects which can be'))
                            console.log(this.lib.chalk.gray('   pulled into one or more workspaces.'))
                            console.log(this.lib.chalk.gray('   A workspace attached to a rack has access to all projects in the rack'))
                            console.log(this.lib.chalk.gray('   and is able to add more projects to the rack.'))
                            console.log(this.lib.chalk.gray('   All workspaces attached to a rack automatically sync their projects'))
                            console.log(this.lib.chalk.gray('   to the rack.'))
                            console.log(this.lib.chalk.gray(''))

                            // List existing project racks from registry
                            const existingRacks = await this.HomeRegistry.listRacks()

                            // Build choices
                            const choices: Array<{ name: string; value: any }> = []

                            for (const rack of existingRacks) {
                                choices.push({
                                    name: `${rack.name}  ${this.lib.chalk.gray(rack.did ? rack.did.substring(0, 50) + '...' : '')}`,
                                    value: { type: 'existing', name: rack.name }
                                })
                            }

                            choices.push({
                                name: this.lib.chalk.yellow('+ Create a new project rack'),
                                value: { type: 'create' }
                            })

                            const selected = await this.WorkspacePrompt.select({
                                message: 'Select a project rack:',
                                choices,
                                defaultValue: { type: 'create' },
                                pageSize: 15
                            })

                            if (selected.type === 'existing') {
                                rackName = selected.name
                            } else {
                                // Prompt for rack name
                                rackName = await this.WorkspacePrompt.input({
                                    message: 'Enter a name for the new project rack:',
                                    defaultValue: workspaceConfig?.name || 'genesis',
                                    validate: (input: string) => {
                                        if (!input || input.trim().length === 0) {
                                            return 'Project rack name cannot be empty'
                                        }
                                        if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
                                            return 'Project rack name can only contain letters, numbers, underscores, and hyphens'
                                        }
                                        return true
                                    }
                                })
                            }
                        } else {
                            rackName = rackConfig.name
                        }

                        // Check if rack already exists in registry
                        let rackData = await this.HomeRegistry.getRack(rackName)

                        if (!rackData) {
                            console.log(this.lib.chalk.cyan(`\n   Registering project rack '${rackName}'...\n`))

                            const { generateKeypair } = await import('../lib/ucan.js')
                            const { did, privateKey } = await generateKeypair()

                            rackData = {
                                did,
                                privateKey,
                                createdAt: new Date().toISOString()
                            }

                            const rackPath = await this.HomeRegistry.setRack(rackName, rackData)

                            console.log(this.lib.chalk.green(`   ✓ Project rack registered at:`))
                            console.log(this.lib.chalk.green(`     ${rackPath}`))
                            console.log(this.lib.chalk.green(`   ✓ DID: ${rackData.did}\n`))
                        } else {
                            const rackPath = await this.HomeRegistry.getRackPath(rackName)
                            console.log(this.lib.chalk.green(`\n   ✓ Using existing project rack at:`))
                            console.log(this.lib.chalk.green(`     ${rackPath}`))
                            console.log(this.lib.chalk.green(`   ✓ DID: ${rackData.did}\n`))
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
capsule['#'] = '@stream44.studio/t44/caps/ProjectRack'
