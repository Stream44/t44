
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    // High level API that deals with everything concerning a project.
    // NOTE: The API signatures do NOT match the vercel SDK and this is on purpose.
    //       The goal is to move towards a standard 'project' API that can be used across providers.
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#@stream44.studio/t44/structs/providers/vercel.com/ProjectDeploymentFact.v0': {
                as: '$ProjectDeploymentFact'
            },
            '#': {
                vercel: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api.v0'
                },
                create: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { name, team }: { name: string, team?: string }) {
                        const resolvedTeam = team || await this.vercel.getDefaultTeam()

                        return (await this.vercel.vercel).projects.createProject({
                            slug: resolvedTeam,
                            requestBody: {
                                name: name,
                            },
                        })
                    }
                },
                ensureCreated: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { name, team, settings = {} }: { name: string, team?: string, settings?: any }) {
                        const resolvedTeam = team || await this.vercel.getDefaultTeam()

                        const existingProject = await this.get({ name, team: resolvedTeam })

                        if (existingProject) {
                            if (Object.keys(settings).length > 0) {
                                return (await this.vercel.vercel).projects.updateProject({
                                    idOrName: existingProject.id,
                                    slug: resolvedTeam,
                                    requestBody: settings
                                })
                            }
                            return existingProject
                        }

                        await (await this.vercel.vercel).projects.createProject({
                            slug: resolvedTeam,
                            requestBody: {
                                ...settings,
                                name,
                            },
                        })

                        const maxAttempts = 10
                        const delayMs = 3000

                        for (let attempt = 0; attempt < maxAttempts; attempt++) {
                            const result = await this.get({ name, team: resolvedTeam })
                            if (result !== null) {
                                return result
                            }

                            if (attempt < maxAttempts - 1) {
                                await new Promise(resolve => setTimeout(resolve, delayMs))
                            }
                        }

                        throw new Error(`Project "${name}" was not found after creation`)
                    }
                },
                get: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { name, team }: { name: string, team?: string }) {
                        const resolvedTeam = team || await this.vercel.getDefaultTeam()

                        const { projects } = await (await this.vercel.vercel).projects.getProjects({
                            slug: resolvedTeam,
                            search: name,
                        })

                        if (projects.length === 0) {
                            return null
                        } else if (projects.length === 1) {
                            const projectDetails = projects[0]

                            await this.$ProjectDeploymentFact.set('projects', name, 'Project', projectDetails)

                            return projectDetails
                        } else {
                            console.error('projects:', projects)
                            throw new Error(`Got more than one project when trying to get a specific project!`)
                        }
                    }
                },
                ensureDeleted: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { name, team }: { name: string, team?: string }) {
                        const resolvedTeam = team || await this.vercel.getDefaultTeam()

                        if (!await this.get({ name, team: resolvedTeam })) return

                        await this.delete({ name, team: resolvedTeam })

                        const maxAttempts = 10
                        const delayMs = 3000

                        for (let attempt = 0; attempt < maxAttempts; attempt++) {
                            const result = await this.get({ name, team: resolvedTeam })
                            if (result === null) {
                                return
                            }

                            if (attempt < maxAttempts - 1) {
                                await new Promise(resolve => setTimeout(resolve, delayMs))
                            }
                        }

                        throw new Error(`Project "${name}" still exists after deletion`)
                    }
                },
                delete: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { name, team }: { name: string, team?: string }) {
                        const resolvedTeam = team || await this.vercel.getDefaultTeam()

                        return (await this.vercel.vercel).projects.deleteProject({
                            idOrName: name,
                            slug: resolvedTeam,
                        })
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
capsule['#'] = '@stream44.studio/t44/caps/providers/vercel.com/project.v0'
