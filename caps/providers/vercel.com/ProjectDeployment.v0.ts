
import { join } from 'path'
import { $ } from 'bun'
import { mkdir, writeFile } from 'fs/promises'

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    // High level API that deals with everything concerning deployment of projects.
    // NOTE: The API signatures do NOT match the vercel SDK and this is on purpose.
    //       The goal is to move towards a standard 'deployment' API that can be used across providers.
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#@stream44.studio/t44/structs/providers/vercel.com/ProjectDeploymentFact.v0': {
                as: '$ProjectDeploymentFact'
            },
            '#@stream44.studio/t44/structs/ProjectDeploymentFact.v0': {
                as: '$StatusFact'
            },
            '#': {
                project: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './project.v0'
                },
                deploy: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { projectionDir, alias, config }: { projectionDir: string, alias: string, config: any }) {

                        const projectName = config.provider.config.ProjectSettings.name
                        const projectSettings = {
                            ...config.provider.config.ProjectSettings || {},
                            name: undefined
                        }

                        console.log(`Ensure project '${projectName}' is created on Vercel ...`)

                        const details = await this.project.ensureCreated({
                            name: projectName,
                            settings: projectSettings
                        })

                        console.log(`Project ID: ${details.id}`)

                        // Set environment variables if configured
                        if (config.provider.config.ENV) {
                            console.log(`Managing environment variables ...`)

                            // Get existing environment variables
                            const team = await this.project.vercel.getDefaultTeam()
                            const existingVars = await (await this.project.vercel.vercel).projects.filterProjectEnvs({
                                idOrName: details.id,
                                slug: team
                            })

                            const existingVarMap = new Map<string, string>(
                                existingVars.envs?.map((env: any) => [env.key as string, env.id as string]) || []
                            )

                            const configuredKeys = new Set(Object.keys(config.provider.config.ENV))

                            // Delete variables that are no longer defined
                            for (const [key, envId] of existingVarMap.entries()) {
                                if (!configuredKeys.has(key)) {
                                    await (await this.project.vercel.vercel).projects.removeProjectEnv({
                                        idOrName: details.id,
                                        slug: team,
                                        id: envId
                                    })
                                    console.log(`Deleted environment variable: ${key}`)
                                }
                            }

                            // Create or update environment variables
                            for (const [key, value] of Object.entries(config.provider.config.ENV)) {

                                // If value is a function (jit expression), execute it
                                const resolvedValue = typeof value === 'function'
                                    ? await value()
                                    : value as string

                                if (!existingVarMap.has(key)) {
                                    // Create new variable
                                    await (await this.project.vercel.vercel).projects.createProjectEnv({
                                        idOrName: details.id,
                                        slug: team,
                                        requestBody: {
                                            key,
                                            value: resolvedValue,
                                            type: 'encrypted',
                                            target: ['production', 'preview', 'development']
                                        }
                                    })
                                    console.log(`Created environment variable: ${key}`, resolvedValue)
                                } else {
                                    // Update existing variable
                                    const envId = existingVarMap.get(key)!
                                    await (await this.project.vercel.vercel).projects.editProjectEnv({
                                        idOrName: details.id,
                                        slug: team,
                                        id: envId,
                                        requestBody: {
                                            value: resolvedValue,
                                            type: 'encrypted',
                                            target: ['production', 'preview', 'development']
                                        }
                                    })
                                    console.log(`Updated environment variable: ${key}`)
                                }
                            }

                            console.log(`Environment variables configured.`)
                        }

                        const projectSourceDir = join(config.sourceDir)
                        const projectProjectionDir = join(projectionDir, 'projects', projectName)

                        await $`rm -Rf "${projectProjectionDir}" && mkdir -p "${projectProjectionDir}" && rsync -a "${projectSourceDir}/" "${projectProjectionDir}/"`

                        const vercelDir = join(projectProjectionDir, '.vercel')
                        await mkdir(vercelDir, { recursive: true })

                        const defaultTeam = await this.project.vercel.getDefaultTeam()
                        const projectJson = {
                            projectId: details.id,
                            orgId: await this.project.vercel.orgIdForName({
                                name: defaultTeam
                            }),
                            projectName
                        }
                        await writeFile(
                            join(vercelDir, 'project.json'),
                            JSON.stringify(projectJson, null, 4)
                        )

                        const vercelJsonConfig = config.provider.config['/vercel.json'] || {}
                        const vercelJson = {
                            framework: vercelJsonConfig.framework,
                            installCommand: vercelJsonConfig.installCommand || 'bun install',
                            buildCommand: vercelJsonConfig.buildCommand || 'bun run build',
                            outputDirectory: vercelJsonConfig.outputDirectory
                        }
                        await writeFile(
                            join(projectProjectionDir, 'vercel.json'),
                            JSON.stringify(vercelJson, null, 4)
                        )

                        console.log(`Deploying to vercel ...`)

                        await $`vercel link --yes --project ${projectJson.projectName}`.cwd(projectProjectionDir)
                        await $`vercel deploy --force --target=preview`.cwd(projectProjectionDir)
                        // TODO: Add a workspace ID: '--meta WORKSPACE_ID=<id>'

                        console.log(`Deployment to vercel done.`)

                        // Fetch and store project details (automatically saved via $ProjectDeploymentFact)
                        await this.project.get({
                            name: details.name
                        })

                        // Write deployment status with updatedAt
                        const statusResult = {
                            projectName,
                            provider: 'vercel.com',
                            status: 'READY',
                            '#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0': {
                                updatedAt: new Date().toISOString()
                            }
                        }
                        await this.$StatusFact.set('ProjectDeploymentStatus', projectName, 'ProjectDeploymentStatus', statusResult)
                    }
                },
                status: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, now, passive }: { config: any; now?: boolean; passive?: boolean }) {
                        const projectName = config.provider.config.ProjectSettings.name

                        if (!projectName) {
                            return {
                                projectName: projectName || 'unknown',
                                provider: 'vercel.com',
                                error: 'No project name configured',
                                rawDefinitionFilepaths: []
                            }
                        }

                        // Raw fact filepaths that this status depends on
                        const rawFilepaths = [
                            this.$ProjectDeploymentFact.getRelativeFilepath('projects', projectName)
                        ]

                        // Try to get cached status if not forcing refresh
                        if (!now) {
                            const cached = await this.$StatusFact.get('ProjectDeploymentStatus', projectName, 'ProjectDeploymentStatus', rawFilepaths)
                            if (cached) {
                                return cached.data
                            }
                        }

                        // In passive mode, don't call the provider if no cache exists
                        if (passive) {
                            return null
                        }

                        const projectDetails = await this.project.get({
                            name: projectName
                        })

                        if (!projectDetails) {
                            const errorResult = {
                                projectName,
                                provider: 'vercel.com',
                                error: 'Project not found',
                                rawDefinitionFilepaths: rawFilepaths
                            }
                            await this.$StatusFact.set('ProjectDeploymentStatus', projectName, 'ProjectDeploymentStatus', errorResult)
                            return errorResult
                        }

                        const statusTeam = await this.project.vercel.getDefaultTeam()
                        const deploymentsResponse = await (await this.project.vercel.vercel).deployments.getDeployments({
                            projectId: projectDetails.id,
                            teamId: await this.project.vercel.orgIdForName({
                                name: statusTeam
                            }),
                            limit: 1
                        })

                        const latestDeployment = deploymentsResponse.deployments?.[0]

                        const statusMap: Record<string, string> = {
                            'READY': 'READY',
                            'BUILDING': 'BUILDING',
                            'ERROR': 'ERROR',
                            'CANCELED': 'ERROR',
                            'QUEUED': 'BUILDING'
                        }

                        // Preserve updatedAt from existing cached status
                        const existingStatus = await this.$StatusFact.get('ProjectDeploymentStatus', projectName, 'ProjectDeploymentStatus')
                        const existingMeta = existingStatus?.data?.['#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0']

                        const result: Record<string, any> = {
                            projectName: projectDetails.name,
                            provider: 'vercel.com',
                            status: statusMap[latestDeployment?.readyState] || 'UNKNOWN',
                            publicUrl: latestDeployment?.url ? `https://${latestDeployment.url}` : undefined,
                            createdAt: latestDeployment?.createdAt,
                            updatedAt: latestDeployment?.aliasAssigned,
                            providerProjectId: projectDetails.id,
                            providerPortalUrl: latestDeployment?.inspectorUrl,
                            rawDefinitionFilepaths: rawFilepaths
                        }

                        if (existingMeta?.updatedAt) {
                            result['#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0'] = {
                                updatedAt: existingMeta.updatedAt
                            }
                        }

                        await this.$StatusFact.set('ProjectDeploymentStatus', projectName, 'ProjectDeploymentStatus', result)

                        return result
                    }
                },
                deprovision: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config }: { config: any }) {

                        const projectName = config.provider.config.ProjectSettings.name

                        console.log(`Deprovisioning project '${projectName}' from Vercel ...`)

                        try {
                            // Get project details to verify it exists
                            const details = await this.project.get({
                                name: projectName
                            })

                            if (!details) {
                                console.log(`Project '${projectName}' not found on Vercel. Nothing to deprovision.`)
                                return
                            }

                            console.log(`Found project ID: ${details.id}`)

                            // Delete the project
                            const deprovisionTeam = await this.project.vercel.getDefaultTeam()
                            await (await this.project.vercel.vercel).projects.deleteProject({
                                idOrName: details.id,
                                slug: deprovisionTeam
                            })

                            console.log(`Successfully deleted project '${projectName}' from Vercel.`)

                            // Delete fact files
                            console.log(`Deleting fact files ...`)
                            try {
                                await this.$ProjectDeploymentFact.delete('projects', projectName)
                                await this.$StatusFact.delete('ProjectDeploymentStatus', projectName)
                                console.log(`Fact files deleted`)
                            } catch (error: any) {
                                console.log(`Error deleting fact files: ${error.message}`)
                            }

                        } catch (error: any) {
                            if (error.message?.includes('not found') || error.status === 404) {
                                console.log(`Project '${projectName}' not found on Vercel. Nothing to deprovision.`)

                                // Still delete fact files even if project not found
                                console.log(`Deleting fact files ...`)
                                try {
                                    await this.$ProjectDeploymentFact.delete('projects', projectName)
                                    await this.$StatusFact.delete('ProjectDeploymentStatus', projectName)
                                    console.log(`Fact files deleted`)
                                } catch (factError: any) {
                                    console.log(`Error deleting fact files: ${factError.message}`)
                                }
                            } else {
                                throw error
                            }
                        }
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
capsule['#'] = '@stream44.studio/t44/caps/providers/vercel.com/ProjectDeployment.v0'
