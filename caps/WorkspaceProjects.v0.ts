
import { join, resolve, relative } from 'path'
import { readdir, stat } from 'fs/promises'
import { $ } from 'bun'

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
            '#t44/structs/WorkspaceConfig.v0': {
                as: '$WorkspaceConfig'
            },
            '#t44/structs/WorkspaceProjectsConfig.v0': {
                as: '$WorkspaceProjectsConfig',
            },
            '#t44/structs/ProjectDeploymentConfig.v0': {
                as: '$ProjectDeploymentConfig',
            },
            '#t44/structs/WorkspaceRepositories.v0': {
                as: '$WorkspaceRepositories'
            },
            '#': {
                list: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<Record<string, { sourceDir: string, deployments: Record<string, any>, repositories: Record<string, any> }>> {
                        const workspaceConfig = await this.$WorkspaceConfig.config
                        const workspaceRootDir = workspaceConfig?.rootDir

                        if (!workspaceRootDir) {
                            throw new Error('Workspace root directory not configured')
                        }

                        const configFilepath = join(workspaceRootDir, '.workspace/workspace.yaml')

                        // Read existing projects config
                        const projectsConfig = await this.$WorkspaceProjectsConfig.config
                        const configuredProjects: Record<string, { sourceDir: string }> = projectsConfig?.projects || {}

                        // Scan workspace root for project directories
                        const entries = await readdir(workspaceRootDir, { withFileTypes: true })
                        const scannedDirs: string[] = []

                        for (const entry of entries) {
                            if (!entry.isDirectory()) continue
                            if (entry.name.startsWith('.')) continue
                            if (entry.name === 'node_modules') continue
                            if (entry.name === '___') continue
                            scannedDirs.push(entry.name)
                        }

                        // Pre-fill config with scanned projects that are not yet configured
                        for (const dirName of scannedDirs) {
                            if (!configuredProjects[dirName]) {
                                const sourceDir = `resolve('\${__dirname}/../${dirName}')`
                                await this.$WorkspaceProjectsConfig.setConfigValue(['projects', dirName, 'sourceDir'], sourceDir)
                                configuredProjects[dirName] = { sourceDir: join(workspaceRootDir, dirName) }
                            }
                        }

                        // Build projects from config values, validating each
                        const projects: Record<string, { sourceDir: string, git: any, deployments: Record<string, any>, repositories: Record<string, any> }> = {}

                        const sortedProjectEntries = Object.entries(configuredProjects).sort(([a], [b]) => a.localeCompare(b))
                        for (const [projectName, projectConfig] of sortedProjectEntries) {
                            const typedConfig = projectConfig as any

                            if (!typedConfig.sourceDir) {
                                throw new Error(
                                    `Project '${projectName}' has no sourceDir configured.\n` +
                                    `  Fix in: ${configFilepath}\n` +
                                    `  Under: '#t44/structs/WorkspaceProjectsConfig.v0' → projects → ${projectName}`
                                )
                            }

                            const resolvedSourceDir = resolve(typedConfig.sourceDir)

                            try {
                                const dirStat = await stat(resolvedSourceDir)
                                if (!dirStat.isDirectory()) {
                                    throw new Error(
                                        `Project '${projectName}' sourceDir is not a directory: ${resolvedSourceDir}\n` +
                                        `  Fix in: ${configFilepath}\n` +
                                        `  Under: '#t44/structs/WorkspaceProjectsConfig.v0' → projects → ${projectName} → sourceDir`
                                    )
                                }
                            } catch (err: any) {
                                if (err.code === 'ENOENT') {
                                    throw new Error(
                                        `Project '${projectName}' sourceDir does not exist: ${resolvedSourceDir}\n` +
                                        `  Fix in: ${configFilepath}\n` +
                                        `  Under: '#t44/structs/WorkspaceProjectsConfig.v0' → projects → ${projectName} → sourceDir`
                                    )
                                }
                                throw err
                            }

                            projects[projectName] = {
                                sourceDir: resolvedSourceDir,
                                git: typedConfig.git !== undefined ? typedConfig.git : undefined,
                                deployments: {},
                                repositories: {}
                            }
                        }

                        // Map deployments to projects
                        const deploymentConfig = await this.$ProjectDeploymentConfig.config
                        if (deploymentConfig?.deployments) {
                            for (const [deploymentName, deploymentAliases] of Object.entries(deploymentConfig.deployments)) {
                                const aliases = deploymentAliases as Record<string, any>
                                // Find the project by checking sourceDir of any alias
                                let mappedProject: string | null = null
                                for (const [aliasName, aliasConfig] of Object.entries(aliases)) {
                                    if (aliasConfig.sourceDir) {
                                        const resolvedSourceDir = resolve(aliasConfig.sourceDir)
                                        const relPath = relative(workspaceRootDir, resolvedSourceDir)
                                        const topDir = relPath.split('/')[0]
                                        if (projects[topDir]) {
                                            mappedProject = topDir
                                            break
                                        }
                                    }
                                }

                                if (!mappedProject) {
                                    throw new Error(
                                        `Deployment '${deploymentName}' does not map to any workspace project.\n` +
                                        `  Ensure at least one alias has a valid sourceDir pointing to a project directory.\n` +
                                        `  Known projects: ${Object.keys(projects).join(', ')}\n` +
                                        `  Fix in: ${configFilepath}`
                                    )
                                }

                                projects[mappedProject].deployments[deploymentName] = aliases
                            }
                        }

                        // Map repositories to projects
                        const repositoriesConfig = await this.$WorkspaceRepositories.config
                        if (repositoriesConfig?.repositories) {
                            for (const [repoName, repoConfig] of Object.entries(repositoriesConfig.repositories)) {
                                const typedConfig = repoConfig as any
                                if (typedConfig.sourceDir) {
                                    const resolvedSourceDir = resolve(typedConfig.sourceDir)
                                    const relPath = relative(workspaceRootDir, resolvedSourceDir)
                                    const topDir = relPath.split('/')[0]
                                    if (!projects[topDir]) {
                                        throw new Error(
                                            `Repository '${repoName}' sourceDir '${typedConfig.sourceDir}' does not map to any workspace project '${topDir}'.\n` +
                                            `  Known projects: ${Object.keys(projects).join(', ')}\n` +
                                            `  Fix in: ${configFilepath}`
                                        )
                                    }
                                    projects[topDir].repositories[repoName] = typedConfig
                                } else {
                                    throw new Error(
                                        `Repository '${repoName}' has no sourceDir configured.\n` +
                                        `  Fix in: ${configFilepath}`
                                    )
                                }
                            }
                        }

                        return projects
                    }
                },
                gatherGitInfo: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { now }: { now?: boolean } = {}): Promise<void> {
                        const projects = await this.list

                        for (const [projectName, projectInfo] of Object.entries(projects)) {
                            const project = projectInfo as any
                            const sourceDir = project.sourceDir

                            // If git info is already in config and --now is not passed, skip
                            if (project.git !== undefined && !now) {
                                continue
                            }

                            // Check if this is a git repo
                            try {
                                const gitDirCheck = await $`git -C ${sourceDir} rev-parse --git-dir`.quiet().nothrow()
                                if (gitDirCheck.exitCode !== 0) {
                                    // Not a git repo
                                    if (project.git === undefined) {
                                        await this.$WorkspaceProjectsConfig.setConfigValue(['projects', projectName, 'git'], false)
                                    }
                                    continue
                                }

                                // Get first commit hash
                                const firstCommitResult = await $`git -C ${sourceDir} rev-list --max-parents=0 HEAD`.quiet().nothrow()
                                if (firstCommitResult.exitCode !== 0) {
                                    // No commits yet
                                    if (project.git === undefined) {
                                        await this.$WorkspaceProjectsConfig.setConfigValue(['projects', projectName, 'git'], false)
                                    }
                                    continue
                                }

                                const firstCommitHash = firstCommitResult.text().trim().split('\n')[0]

                                // Get first commit date (createdAt)
                                const createdAtResult = await $`git -C ${sourceDir} show -s --format=%aI ${firstCommitHash}`.quiet().nothrow()
                                const createdAt = createdAtResult.exitCode === 0 ? createdAtResult.text().trim() : null

                                // Get first commit author details
                                const authorNameResult = await $`git -C ${sourceDir} show -s --format=%an ${firstCommitHash}`.quiet().nothrow()
                                const authorEmailResult = await $`git -C ${sourceDir} show -s --format=%ae ${firstCommitHash}`.quiet().nothrow()
                                const firstCommitAuthor: Record<string, string> = {}
                                if (authorNameResult.exitCode === 0) {
                                    firstCommitAuthor.name = authorNameResult.text().trim()
                                }
                                if (authorEmailResult.exitCode === 0) {
                                    firstCommitAuthor.email = authorEmailResult.text().trim()
                                }

                                // Get remotes
                                const remotesResult = await $`git -C ${sourceDir} remote -v`.quiet().nothrow()
                                const remotes: Record<string, string> = {}
                                if (remotesResult.exitCode === 0) {
                                    const lines = remotesResult.text().trim().split('\n').filter(Boolean)
                                    for (const line of lines) {
                                        const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/)
                                        if (match) {
                                            remotes[match[1]] = match[2]
                                        }
                                    }
                                }

                                // If --now is passed, sync remotes between config and git repo
                                if (now && project.git && typeof project.git === 'object' && project.git.remotes) {
                                    for (const [remoteName, remoteUri] of Object.entries(project.git.remotes)) {
                                        if (!remotes[remoteName]) {
                                            // Remote exists in config but not in git repo — add it
                                            const addResult = await $`git -C ${sourceDir} remote add ${remoteName} ${remoteUri as string}`.quiet().nothrow()
                                            if (addResult.exitCode === 0) {
                                                remotes[remoteName] = remoteUri as string
                                            }
                                        } else if (remotes[remoteName] !== remoteUri) {
                                            // Remote URL in config differs from git — update git to match config
                                            const setUrlResult = await $`git -C ${sourceDir} remote set-url ${remoteName} ${remoteUri as string}`.quiet().nothrow()
                                            if (setUrlResult.exitCode === 0) {
                                                remotes[remoteName] = remoteUri as string
                                            }
                                        }
                                    }
                                }

                                const gitInfo: Record<string, any> = {
                                    firstCommitHash,
                                    createdAt,
                                    firstCommitAuthor,
                                    remotes
                                }

                                await this.$WorkspaceProjectsConfig.setConfigValue(['projects', projectName, 'git'], gitInfo)
                            } catch (err: any) {
                                // If git commands fail entirely, mark as false
                                if (project.git === undefined) {
                                    await this.$WorkspaceProjectsConfig.setConfigValue(['projects', projectName, 'git'], false)
                                }
                            }
                        }
                    }
                },
                resolveMatchingRepositories: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { workspaceProject, repositories }: {
                        workspaceProject: string
                        repositories: Record<string, any>
                    }): Promise<Record<string, any>> {
                        const workspaceConfig = await this.$WorkspaceConfig.config
                        const workspaceRootDir = workspaceConfig?.rootDir
                        const currentDir = process.cwd()

                        let matchingRepositories: Record<string, any> = {}

                        // Strategy 1: Try prefix matching on repository names
                        const prefixMatches: string[] = []
                        for (const repoName of Object.keys(repositories)) {
                            if (repoName.startsWith(workspaceProject)) {
                                prefixMatches.push(repoName)
                            }
                        }

                        if (prefixMatches.length > 1) {
                            const chalk = (await import('chalk')).default
                            console.log(chalk.red(`\nError: Multiple repositories match prefix '${workspaceProject}':\n`))
                            for (const match of prefixMatches) {
                                console.log(chalk.gray(`  - ${match}`))
                            }
                            console.log(chalk.red('\nPlease be more specific.\n'))
                            throw new Error(`Multiple repositories match prefix: ${workspaceProject}`)
                        }

                        if (prefixMatches.length === 1) {
                            matchingRepositories[prefixMatches[0]] = repositories[prefixMatches[0]]
                            return matchingRepositories
                        }

                        // Strategy 2: Try path matching (absolute or relative from current directory)
                        let targetPath: string
                        if (workspaceProject.startsWith('/')) {
                            targetPath = workspaceProject
                        } else {
                            targetPath = resolve(currentDir, workspaceProject)
                        }

                        for (const [repoName, repoConfig] of Object.entries(repositories)) {
                            if ((repoConfig as any).sourceDir) {
                                const sourceDirPath = resolve((repoConfig as any).sourceDir)
                                const rel = relative(targetPath, sourceDirPath)

                                const isWithinOrEqual = rel === '' || !rel.startsWith('..')

                                if (isWithinOrEqual) {
                                    matchingRepositories[repoName] = repoConfig
                                }
                            }
                        }

                        if (Object.keys(matchingRepositories).length === 0) {
                            const chalk = (await import('chalk')).default
                            console.log(chalk.red(`\nError: No repositories found matching '${workspaceProject}'.\n`))
                            console.log(chalk.gray('Available repositories:'))
                            for (const repoName of Object.keys(repositories)) {
                                console.log(chalk.gray(`  - ${repoName}`))
                            }
                            console.log('')
                            throw new Error(`No repositories found matching: ${workspaceProject}`)
                        }

                        return matchingRepositories
                    }
                },
                resolveMatchingDeployments: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { workspaceProject, deployments }: {
                        workspaceProject: string
                        deployments: Record<string, any>
                    }): Promise<Record<string, any>> {
                        const workspaceConfig = await this.$WorkspaceConfig.config
                        const workspaceRootDir = workspaceConfig?.rootDir
                        const currentDir = process.cwd()

                        let matchingDeployments: Record<string, any> = {}

                        // Strategy 1: Try prefix matching on project names
                        const prefixMatches: string[] = []
                        for (const projectName of Object.keys(deployments)) {
                            if (projectName.startsWith(workspaceProject)) {
                                prefixMatches.push(projectName)
                            }
                        }

                        if (prefixMatches.length > 1) {
                            const chalk = (await import('chalk')).default
                            console.log(chalk.red(`\nError: Multiple projects match prefix '${workspaceProject}':\n`))
                            for (const match of prefixMatches) {
                                console.log(chalk.gray(`  - ${match}`))
                            }
                            console.log(chalk.red('\nPlease be more specific.\n'))
                            throw new Error(`Multiple projects match prefix: ${workspaceProject}`)
                        }

                        if (prefixMatches.length === 1) {
                            matchingDeployments[prefixMatches[0]] = deployments[prefixMatches[0]]
                            return matchingDeployments
                        }

                        // Strategy 2: Try path matching (absolute or relative from current directory)
                        let targetPath: string
                        if (workspaceProject.startsWith('/')) {
                            targetPath = workspaceProject
                        } else {
                            targetPath = resolve(currentDir, workspaceProject)
                        }

                        for (const [projectName, projectAliases] of Object.entries(deployments)) {
                            for (const [alias, aliasConfig] of Object.entries(projectAliases as Record<string, any>)) {
                                if (aliasConfig.sourceDir) {
                                    const sourceDirPath = resolve(aliasConfig.sourceDir)
                                    const rel = relative(targetPath, sourceDirPath)

                                    const isWithinOrEqual = rel === '' || !rel.startsWith('..')

                                    if (isWithinOrEqual) {
                                        if (!matchingDeployments[projectName]) {
                                            matchingDeployments[projectName] = {}
                                        }
                                        matchingDeployments[projectName][alias] = aliasConfig
                                    }
                                }
                            }
                        }

                        if (Object.keys(matchingDeployments).length > 1) {
                            const chalk = (await import('chalk')).default
                            const pathMatches = Object.keys(matchingDeployments)
                            console.log(chalk.red(`\nError: Multiple projects match path '${workspaceProject}':\n`))
                            for (const match of pathMatches) {
                                console.log(chalk.gray(`  - ${match}`))
                            }
                            console.log(chalk.red('\nPlease be more specific.\n'))
                            throw new Error(`Multiple projects match path: ${workspaceProject}`)
                        }

                        if (Object.keys(matchingDeployments).length === 0) {
                            const chalk = (await import('chalk')).default
                            console.log(chalk.red(`\nError: No deployments found matching '${workspaceProject}'.\n`))
                            console.log(chalk.gray('Available projects:'))
                            for (const projectName of Object.keys(deployments)) {
                                console.log(chalk.gray(`  - ${projectName}`))
                            }
                            console.log('')
                            throw new Error(`No deployments found matching: ${workspaceProject}`)
                        }

                        return matchingDeployments
                    }
                },
                findProjectForPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { targetPath }: { targetPath: string }): Promise<string | null> {
                        const projects = await this.list
                        const resolvedTarget = resolve(targetPath)

                        for (const [projectName, projectInfo] of Object.entries(projects)) {
                            const projectDir = (projectInfo as any).sourceDir
                            if (resolvedTarget === projectDir || resolvedTarget.startsWith(projectDir + '/')) {
                                return projectName
                            }
                        }

                        return null
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
capsule['#'] = 't44/caps/WorkspaceProjects.v0'
