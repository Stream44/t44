
import { join, dirname } from 'path'
import { readFile, access } from 'fs/promises'
import { constants } from 'fs'
import chalk from 'chalk'

// ── Provider Lifecycle ─────────────────────────────────────────────
// Each deployment provider capsule exposes a standard interface:
//
//   deploy      — deploy the project to the provider
//   deprovision — remove the project from the provider
//   status      — query deployment status (supports passive/cached mode)
//
// Every method receives { config, ... } where config contains the
// alias-level config with a .provider entry for the specific provider.
//
// The orchestrator dynamically loads provider capsules via importCapsule
// so no hard-coded provider mappings are needed.

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
            '#@stream44.studio/t44/structs/ProjectDeploymentConfig': {
                as: '$ProjectDeploymentConfig',
            },
            '#@stream44.studio/t44/structs/WorkspaceConfig': {
                as: '$WorkspaceConfig'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt'
                },
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceProjects'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        let { projectSelector, deprovision, yes } = args

                        // ── Dynamic provider loader ──────────────────────────
                        const providerCache = new Map<string, any>()
                        const getProvider = async (uri: string) => {
                            const cleanUri = uri.startsWith('#') ? uri.substring(1) : uri
                            if (!providerCache.has(cleanUri)) {
                                const { api } = await this.self.importCapsule({ uri: cleanUri })
                                providerCache.set(cleanUri, api)
                            }
                            return providerCache.get(cleanUri)!
                        }

                        // ── Projection dir helper ────────────────────────────
                        const workspaceConfig = await this.$WorkspaceConfig.config
                        const getProjectionDir = (capsuleName: string) => join(
                            workspaceConfig.rootDir,
                            '.~o/workspace.foundation/@stream44.studio~t44~caps~ProjectDeployment',
                            capsuleName.replace(/\//g, '~')
                        )

                        // ── Config helpers ────────────────────────────────────
                        const resolveProviders = (aliasConfig: any): any[] =>
                            aliasConfig.providers || (aliasConfig.provider ? [aliasConfig.provider] : [])

                        const extractProviderName = (capsulePath: string): string => {
                            const match = capsulePath.match(/t44-([^/]+)\//)
                            return match ? match[1] : 'unknown'
                        }

                        // ── Helper: call a lifecycle method on all providers for an alias ──
                        const callProvidersForAlias = async (
                            step: 'deploy' | 'deprovision' | 'status',
                            aliasConfig: any,
                            ctx: { alias: string; projectName: string },
                        ) => {
                            const providers = resolveProviders(aliasConfig)
                            for (const providerConfig of providers) {
                                const provider = await getProvider(providerConfig.capsule)
                                if (typeof provider[step] !== 'function') continue

                                const config = { ...aliasConfig, provider: providerConfig }

                                if (step === 'deploy') {
                                    await provider.deploy({
                                        alias: ctx.alias,
                                        config,
                                        projectionDir: getProjectionDir(providerConfig.capsule),
                                        workspaceProjectName: ctx.projectName,
                                    })
                                } else if (step === 'deprovision') {
                                    await provider.deprovision({ config })
                                }
                            }
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 1: Load config & resolve matching deployments
                        // ══════════════════════════════════════════════════════
                        const deploymentConfig = await this.$ProjectDeploymentConfig.config

                        if (!deploymentConfig?.deployments) {
                            throw new Error('No deployments configuration found')
                        }

                        let matchingDeployments: Record<string, any> = {}

                        if (!projectSelector) {
                            const selected = await selectProjectInteractively.call(this, {
                                deploymentConfig,
                                deprovision,
                                getProvider,
                                resolveProviders,
                                extractProviderName,
                            })
                            if (!selected) return
                            matchingDeployments = selected
                        } else {
                            matchingDeployments = await this.WorkspaceProjects.resolveMatchingDeployments({
                                workspaceProject: projectSelector,
                                deployments: deploymentConfig.deployments
                            })
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 2: Deploy or deprovision each matching project
                        // ══════════════════════════════════════════════════════
                        for (const [projectName, projectConfig] of Object.entries(matchingDeployments)) {
                            const actionText = deprovision ? 'Deprovisioning' : 'Deploying'
                            console.log(`\n=> ${actionText} project '${projectName}' ...\n`)

                            const orderedAliases = orderAliasesByDependencies(projectConfig)

                            // ── Deprovision confirmation ─────────────────────
                            if (deprovision) {
                                if (!yes) {
                                    const confirmed = await confirmDeprovision.call(this, { projectName, orderedAliases })
                                    if (confirmed === 'skip') continue
                                    if (confirmed === 'abort') return
                                } else {
                                    console.log(chalk.red(`\n✓ Auto-confirmed with --yes flag. Proceeding with deprovisioning...\n`))
                                }
                            }

                            // For deprovision, reverse the order to handle dependencies correctly
                            const aliasesToProcess = deprovision ? [...orderedAliases].reverse() : orderedAliases

                            // ── Process each alias ───────────────────────────
                            for (const alias of aliasesToProcess) {
                                const step = deprovision ? 'deprovision' : 'deploy'
                                const stepText = deprovision ? 'Deprovisioning' : 'Deploying'
                                console.log(`\n=> ${stepText} provider project alias '${alias}' for workspace project '${projectName}' ...\n`)

                                // ── Build step (deploy only) ──────────────────
                                if (!deprovision) {
                                    const aliasConfig = projectConfig[alias]
                                    if (aliasConfig.sourceDir) {
                                        await runBuildIfAvailable(aliasConfig.sourceDir)
                                    }
                                }

                                await callProvidersForAlias(step, projectConfig[alias], { alias, projectName })

                                console.log(`\n<= ${stepText} of provider project alias '${alias}' for workspace project '${projectName}' done.\n`)
                            }

                            console.log(`\n<= Project '${projectName}' ${deprovision ? 'deprovisioning' : 'deployment'} complete.\n`)
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
capsule['#'] = '@stream44.studio/t44/caps/ProjectDeployment'


// ── Interactive project selection ────────────────────────────────────
async function selectProjectInteractively(
    this: any,
    { deploymentConfig, deprovision, getProvider, resolveProviders, extractProviderName }: {
        deploymentConfig: any
        deprovision: boolean
        getProvider: (uri: string) => Promise<any>
        resolveProviders: (aliasConfig: any) => any[]
        extractProviderName: (capsulePath: string) => string
    }
): Promise<Record<string, any> | null> {
    const allProjects = Object.keys(deploymentConfig.deployments)

    if (allProjects.length === 0) {
        throw new Error('No deployments configured')
    }

    const actionText = deprovision ? 'deprovision' : 'deploy'
    console.log(chalk.cyan(`\nPick a project to ${actionText}. You will be asked for necessary credentials as needed.\n`))

    const choices: Array<{ name: string; value: string }> = []

    for (const projectName of allProjects) {
        const projectAliases = deploymentConfig.deployments[projectName]
        const aliasNames = Object.keys(projectAliases)
        const firstAlias = aliasNames[0]
        const aliasConfig = projectAliases[firstAlias]
        const providers = resolveProviders(aliasConfig)

        const providerName = extractProviderName(providers[0]?.capsule || '')

        // Check deployment status across all providers that support it
        let statusText = ''
        let isDeployed = false
        try {
            let status: any
            for (const providerConfig of providers) {
                const config = { ...aliasConfig, provider: providerConfig }
                const provider = await getProvider(providerConfig.capsule)
                if (typeof provider.status === 'function') {
                    status = await provider.status({ config, passive: true })
                }
                if (status && !status.error) break
            }

            if (!status || status?.error) {
                statusText = chalk.gray('not deployed')
            } else if (status?.status === 'READY') {
                isDeployed = true
                statusText = chalk.green('deployed') + formatDuration(status)
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

        choices.push({
            name: `${chalk.white(projectName)}  ${chalk.cyan(`[${providerName}]`)}  ${chalk.gray(`[${aliasNames.join(', ')}]`)}  ${statusText}`,
            value: projectName
        })
    }

    if (choices.length === 0) {
        console.log(chalk.gray('No deployed projects found.\n'))
        return null
    }

    try {
        const selectedProject = await this.WorkspacePrompt.select({
            message: `Select a project:`,
            choices
        })
        return { [selectedProject]: deploymentConfig.deployments[selectedProject] }
    } catch (error: any) {
        if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
            console.log(chalk.red('\nABORTED\n'))
            return null
        }
        throw error
    }
}


// ── Deprovision confirmation prompt ──────────────────────────────────
async function confirmDeprovision(
    this: any,
    { projectName, orderedAliases }: { projectName: string; orderedAliases: string[] }
): Promise<'ok' | 'skip' | 'abort'> {
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
            return 'skip'
        }

        console.log(chalk.red(`\n✓ Confirmation received. Proceeding with deprovisioning...\n`))
        return 'ok'
    } catch (error: any) {
        if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
            console.log(chalk.red('\n\nABORTED\n'))
            return 'abort'
        }
        throw error
    }
}


// ── Duration formatting for status display ───────────────────────────
function formatDuration(status: any): string {
    if (!status.createdAt && !status.updatedAt) return ''

    const deployedDate = new Date(status.updatedAt || status.createdAt)
    const now = new Date()
    const diffMs = now.getTime() - deployedDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor(diffMs / (1000 * 60))

    if (diffDays > 0) return chalk.gray(` (${diffDays}d ago)`)
    if (diffHours > 0) return chalk.gray(` (${diffHours}h ago)`)
    if (diffMinutes > 0) return chalk.gray(` (${diffMinutes}m ago)`)
    return chalk.gray(' (just now)')
}


// ── Build step: find closest package.json with build script ───────
async function runBuildIfAvailable(sourceDir: string): Promise<void> {
    // Walk up from sourceDir to find the closest package.json with a build script
    let currentDir = sourceDir

    // Normalize: if sourceDir ends with a known build output folder, start from parent
    const buildOutputFolders = ['dist', 'build', 'out', '.next', '.output']
    const lastSegment = sourceDir.split('/').pop()
    if (lastSegment && buildOutputFolders.includes(lastSegment)) {
        currentDir = dirname(sourceDir)
    }

    // Walk up looking for package.json with build script
    const maxDepth = 5
    for (let i = 0; i < maxDepth; i++) {
        const pkgPath = join(currentDir, 'package.json')
        try {
            await access(pkgPath, constants.F_OK)
            const pkgContent = await readFile(pkgPath, 'utf-8')
            const pkg = JSON.parse(pkgContent)

            if (pkg.scripts?.build) {
                console.log(chalk.cyan(`Building ${pkg.name || currentDir} ...`))
                console.log(chalk.gray(`   Directory: ${currentDir}`))
                console.log(chalk.gray(`   Script:    ${pkg.scripts.build}\n`))

                const proc = Bun.spawn(['bun', 'run', 'build'], {
                    cwd: currentDir,
                    stdin: 'inherit',
                    stdout: 'inherit',
                    stderr: 'inherit'
                })

                const exitCode = await proc.exited
                if (exitCode !== 0) {
                    throw new Error(`Build failed with exit code ${exitCode}`)
                }

                console.log(chalk.green(`Build complete.\n`))
                return
            }
        } catch (err: any) {
            // If it's our own error (build failed), rethrow
            if (err.message?.includes('Build failed')) {
                throw err
            }
            // Otherwise, package.json doesn't exist or isn't valid, continue walking up
        }

        const parentDir = dirname(currentDir)
        if (parentDir === currentDir) {
            // Reached filesystem root
            break
        }
        currentDir = parentDir
    }

    // No build script found - that's okay, just skip
}


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
