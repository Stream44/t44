
import { join } from 'path'

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
            '#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0': {
                as: '$ProjectDeploymentConfig',
            },
            '#@stream44.studio/t44/structs/WorkspaceConfig.v0': {
                as: '$WorkspaceConfig'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt.v0'
                },
                Vercel: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/providers/vercel.com/ProjectDeployment.v0'
                },
                Bunny: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/providers/bunny.net/ProjectDeployment.v0'
                },
                Dynadot: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/providers/dynadot.com/ProjectDeployment.v0'
                },
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceProjects.v0'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        let { projectSelector, deprovision, yes } = args

                        const deploymentConfig = await this.$ProjectDeploymentConfig.config

                        if (!deploymentConfig?.deployments) {
                            throw new Error('No deployments configuration found')
                        }

                        let matchingDeployments: Record<string, any> = {}

                        if (!projectSelector) {
                            // Show interactive project selection
                            const chalk = (await import('chalk')).default
                            const allProjects = Object.keys(deploymentConfig.deployments)

                            if (allProjects.length === 0) {
                                throw new Error('No deployments configured')
                            }

                            // Display heading
                            const actionText = deprovision ? 'deprovision' : 'deploy'
                            console.log(chalk.cyan(`\nPick a project to ${actionText}. You will be asked for necessary credentials as needed.\n`))

                            // Build choices with deployment status
                            const choices: Array<{ name: string; value: string }> = []

                            for (const projectName of allProjects) {
                                const projectAliases = deploymentConfig.deployments[projectName]
                                const aliasNames = Object.keys(projectAliases)
                                const firstAlias = aliasNames[0]
                                const aliasConfig = projectAliases[firstAlias]

                                // Support both 'provider' (single) and 'providers' (array) patterns
                                const providers = aliasConfig.providers || (aliasConfig.provider ? [aliasConfig.provider] : [])

                                // Extract provider name from the first provider's capsule path
                                const firstCapsulePath = providers[0]?.capsule || ''
                                const providerMatch = firstCapsulePath.match(/providers\/([^/]+)\//)
                                const providerName = providerMatch ? providerMatch[1] : 'unknown'

                                // Check deployment status across all providers that support it
                                let statusText = ''
                                let isDeployed = false
                                try {
                                    let status: any
                                    for (const providerConfig of providers) {
                                        const capsulePath = providerConfig.capsule || ''
                                        const config = { ...aliasConfig, provider: providerConfig }
                                        if (capsulePath.includes('vercel.com')) {
                                            status = await this.Vercel.status({ config, passive: true })
                                        } else if (capsulePath.includes('bunny.net')) {
                                            status = await this.Bunny.status({ config, passive: true })
                                        }
                                        // Use the first provider that returns a valid status
                                        if (status && !status.error) break
                                    }

                                    if (!status || status?.error) {
                                        statusText = chalk.gray('not deployed')
                                    } else if (status?.status === 'READY') {
                                        isDeployed = true
                                        // Calculate deployment duration
                                        let durationText = ''
                                        if (status.createdAt || status.updatedAt) {
                                            const deployedDate = new Date(status.updatedAt || status.createdAt)
                                            const now = new Date()
                                            const diffMs = now.getTime() - deployedDate.getTime()
                                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
                                            const diffMinutes = Math.floor(diffMs / (1000 * 60))

                                            if (diffDays > 0) {
                                                durationText = chalk.gray(` (${diffDays}d ago)`)
                                            } else if (diffHours > 0) {
                                                durationText = chalk.gray(` (${diffHours}h ago)`)
                                            } else if (diffMinutes > 0) {
                                                durationText = chalk.gray(` (${diffMinutes}m ago)`)
                                            } else {
                                                durationText = chalk.gray(' (just now)')
                                            }
                                        }
                                        statusText = chalk.green('deployed') + durationText
                                    } else if (status?.status) {
                                        statusText = chalk.gray(status.status.toLowerCase())
                                    } else {
                                        statusText = chalk.gray('not deployed')
                                    }
                                } catch {
                                    statusText = chalk.gray('not deployed')
                                }

                                // When deprovisioning, only show deployed projects
                                if (deprovision && !isDeployed) continue

                                const providerText = chalk.cyan(`[${providerName}]`)
                                const aliasText = chalk.gray(`[${aliasNames.join(', ')}]`)
                                const projectText = chalk.white(projectName)

                                choices.push({
                                    name: `${projectText}  ${providerText}  ${aliasText}  ${statusText}`,
                                    value: projectName
                                })
                            }

                            if (choices.length === 0) {
                                console.log(chalk.gray('No deployed projects found.\n'))
                                return
                            }

                            try {
                                const selectedProject = await this.WorkspacePrompt.select({
                                    message: `Select a project:`,
                                    choices
                                })

                                // Set the selected project as workspaceProject for further processing
                                matchingDeployments[selectedProject] = deploymentConfig.deployments[selectedProject]
                            } catch (error: any) {
                                if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
                                    console.log(chalk.red('\nABORTED\n'))
                                    return
                                }
                                throw error
                            }
                        } else {
                            matchingDeployments = await this.WorkspaceProjects.resolveMatchingDeployments({
                                workspaceProject: projectSelector,
                                deployments: deploymentConfig.deployments
                            })
                        }

                        // Deploy or deprovision each matching project
                        for (const [projectName, deploymentConfig] of Object.entries(matchingDeployments)) {
                            if (deprovision) {
                                console.log(`\n=> Deprovisioning project '${projectName}' ...\n`)
                            } else {
                                console.log(`\n=> Deploying project '${projectName}' ...\n`)
                            }

                            const orderedAliases = orderAliasesByDependencies(deploymentConfig)

                            // For deprovision, confirm once at the project level
                            if (deprovision && !yes) {
                                const chalk = (await import('chalk')).default
                                const aliasNames = orderedAliases.join(', ')
                                console.log(chalk.red(`\n⚠️  WARNING: You are about to DELETE all deployments for project '${projectName}':\n`))
                                console.log(chalk.red(`   Aliases: ${aliasNames}`))
                                console.log(chalk.red(`\n   ⚠️  THIS ACTION IS IRREVERSIBLE ⚠️\n`))

                                try {
                                    const confirmation = await this.WorkspacePrompt.input({
                                        message: chalk.red(`To confirm deletion, type the project name exactly: "${projectName}"`),
                                        defaultValue: ''
                                    })

                                    if (confirmation !== projectName) {
                                        console.log(chalk.red('\n⚠️  ABORTED\n'))
                                        continue
                                    }

                                    console.log(chalk.red(`\n✓ Confirmation received. Proceeding with deprovisioning...\n`))
                                } catch (error: any) {
                                    if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
                                        console.log(chalk.red('\n\nABORTED\n'))
                                        return
                                    }
                                    throw error
                                }
                            } else if (deprovision && yes) {
                                const chalk = (await import('chalk')).default
                                console.log(chalk.red(`\n✓ Auto-confirmed with --yes flag. Proceeding with deprovisioning...\n`))
                            }

                            // For deprovision, reverse the order to handle dependencies correctly
                            const aliasesToProcess = deprovision ? orderedAliases.reverse() : orderedAliases

                            for (const alias of aliasesToProcess) {
                                if (deprovision) {
                                    console.log(`\n=> Deprovisioning provider project alias '${alias}' for workspace project '${projectName}' ...\n`)
                                } else {
                                    console.log(`\n=> Running deployment of provider project alias '${alias}' for workspace project '${projectName}' ...\n`)
                                }

                                const aliasConfig = deploymentConfig[alias]

                                // Support both 'provider' (single) and 'providers' (array) patterns
                                const providers = aliasConfig.providers || (aliasConfig.provider ? [aliasConfig.provider] : [])

                                for (const providerConfig of providers) {
                                    const capsulePath = providerConfig.capsule

                                    // Build config object that matches expected structure
                                    const config = {
                                        ...aliasConfig,
                                        provider: providerConfig
                                    }

                                    if (capsulePath === '@stream44.studio/t44/caps/providers/vercel.com/ProjectDeployment.v0') {

                                        if (deprovision) {
                                            // Check if project exists before attempting to deprovision
                                            const status = await this.Vercel.status({ config })

                                            if (status.error) {
                                                console.log(`Project not found on provider. Skipping deprovisioning.`)
                                                continue
                                            }

                                            await this.Vercel.deprovision({ config })
                                        } else {
                                            await this.Vercel.deploy({
                                                alias,
                                                config,
                                                projectionDir: join(
                                                    (await this.$WorkspaceConfig.config).rootDir,
                                                    '.~o/workspace.foundation/o/vercel.com'
                                                )
                                            })
                                        }

                                    } else if (capsulePath === '@stream44.studio/t44/caps/providers/bunny.net/ProjectDeployment.v0') {

                                        if (deprovision) {
                                            await this.Bunny.deprovision({ config })
                                        } else {
                                            await this.Bunny.deploy({
                                                alias,
                                                config,
                                                projectionDir: join(
                                                    (await this.$WorkspaceConfig.config).rootDir,
                                                    '.~o/workspace.foundation/o/bunny.net'
                                                ),
                                                workspaceProjectName: projectName
                                            })
                                        }

                                    } else if (capsulePath === '@stream44.studio/t44/caps/providers/dynadot.com/ProjectDeployment.v0') {

                                        if (deprovision) {
                                            await this.Dynadot.deprovision({ config })
                                        } else {
                                            await this.Dynadot.deploy({
                                                alias,
                                                config,
                                                projectionDir: join(
                                                    (await this.$WorkspaceConfig.config).rootDir,
                                                    '.~o/workspace.foundation/o/dynadot.com'
                                                ),
                                                workspaceProjectName: projectName
                                            })
                                        }

                                    } else {
                                        throw new Error(`Unsupported capsule '${capsulePath}'!`)
                                    }
                                }

                                if (deprovision) {
                                    console.log(`\n<= Deprovisioning of provider project alias '${alias}' for workspace project '${projectName}' done.\n`)
                                } else {
                                    console.log(`\n<= Deployment of provider project alias '${alias}' for workspace project '${projectName}' done.\n`)
                                }
                            }

                            if (deprovision) {
                                console.log(`\n<= Project '${projectName}' deprovisioning complete.\n`)
                            } else {
                                console.log(`\n<= Project '${projectName}' deployment complete.\n`)
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
capsule['#'] = '@stream44.studio/t44/caps/ProjectDeployment.v0'


function orderAliasesByDependencies(deploymentConfig: Record<string, any>): string[] {
    const aliases = Object.keys(deploymentConfig)
    const ordered: string[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    function visit(alias: string): void {
        if (visited.has(alias)) return

        if (visiting.has(alias)) {
            throw new Error(`Circular dependency detected involving alias: ${alias}`)
        }

        visiting.add(alias)

        const depends = deploymentConfig[alias].depends || []
        for (const dep of depends) {
            if (!deploymentConfig[dep]) {
                throw new Error(`Dependency '${dep}' not found for alias '${alias}'`)
            }
            visit(dep)
        }

        visiting.delete(alias)
        visited.add(alias)
        ordered.push(alias)
    }

    for (const alias of aliases) {
        visit(alias)
    }

    return ordered
}
