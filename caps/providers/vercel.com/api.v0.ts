
// Global promise to track ongoing team selection
let activeTeamSelection: Promise<string> | null = null

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    // Low level API that maps the vercel sdk API.
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#t44/structs/providers/vercel.com/WorkspaceConnectionConfig.v0': {
                as: '$ConnectionConfig'
            },
            '#': {
                // @see https://docs.vercel.com/docs/rest-api/reference/endpoints
                vercel: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any) {

                        const { Vercel } = await import('@vercel/sdk');

                        const apiToken = await this.$ConnectionConfig.getConfigValue('apiToken')

                        const vercel = new Vercel({
                            bearerToken: apiToken
                        });

                        return vercel
                    }
                },
                getDefaultTeam: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        // Check if already configured in stored config
                        const storedConfig = await this.$ConnectionConfig.getStoredConfig() || {}
                        if (storedConfig.team) {
                            return storedConfig.team
                        }

                        // Check if team selection is already in progress
                        if (activeTeamSelection) {
                            return activeTeamSelection
                        }

                        // Start team selection process
                        activeTeamSelection = (async () => {
                            try {
                                // Fetch teams from API
                                const chalk = (await import('chalk')).default
                                console.log(chalk.gray('   Fetching your Vercel teams...\n'))

                                const teamsResponse = await this.getTeams()
                                const teams = teamsResponse.teams || []

                                if (teams.length === 0) {
                                    throw new Error('No teams found in your Vercel account')
                                }

                                // Prepare choices for selection
                                const choices = teams.map((team: any) => ({
                                    name: `${team.name} (${team.slug})`,
                                    value: team.slug
                                }))

                                // Prompt user to select team
                                const inquirer = await import('inquirer')
                                const { selectedTeam } = await inquirer.default.prompt([
                                    {
                                        type: 'list',
                                        name: 'selectedTeam',
                                        message: 'Default Team',
                                        choices
                                    }
                                ])

                                // Store the selected team
                                const updatedConfig = await this.$ConnectionConfig.getStoredConfig() || {}
                                updatedConfig.team = selectedTeam
                                await this.$ConnectionConfig.setStoredConfig(updatedConfig)

                                console.log(chalk.green(`\n   ✓ Default Team saved to connection config\n`))

                                return selectedTeam
                            } finally {
                                activeTeamSelection = null
                            }
                        })()

                        return activeTeamSelection
                    }
                },
                getTeams: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any) {
                        return (await this.vercel).teams.getTeams({})
                    }
                },
                getProjects: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any) {
                        return (await this.vercel).projects.getProjects({})
                    }
                },
                orgIdForName: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { name }: { name: string }) {
                        const teamsResponse = await (await this.vercel).teams.getTeams({})
                        const team = teamsResponse.teams?.find((t: any) => t.slug === name || t.name === name)

                        if (!team) {
                            throw new Error(`Team '${name}' not found`)
                        }

                        return team.id
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
capsule['#'] = 't44/caps/providers/vercel.com/api.v0'
