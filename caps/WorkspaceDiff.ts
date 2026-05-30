
import chalk from 'chalk'

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
                as: '$Config'
            },
            '#': {
                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceLib',
                },

                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { }: any): Promise<void> {
                        const workspaceConfig = await this.$Config.config
                        const workspaceRootDir = workspaceConfig?.rootDir

                        if (!workspaceRootDir) {
                            throw new Error('Workspace root directory not configured')
                        }

                        const lib = this.lib

                        type FileChange = {
                            file: string
                            additions: number
                            deletions: number
                            status: string
                        }
                        const projectChanges: Record<string, FileChange[]> = {}
                        let totalFiles = 0
                        let totalAdditions = 0
                        let totalDeletions = 0

                        const addChange = (project: string, change: FileChange) => {
                            if (!projectChanges[project]) projectChanges[project] = []
                            projectChanges[project].push(change)
                            totalFiles++
                            totalAdditions += change.additions
                            totalDeletions += change.deletions
                        }

                        /**
                         * Collect git changes from a repo at `repoPath`.
                         * Files are prefixed with `pathPrefix` for display.
                         * `projectKey` is used as the grouping key.
                         * Any untracked paths that are themselves git repos
                         * are excluded and returned for recursive processing.
                         */
                        const collectRepoChanges = async (
                            repoPath: string,
                            pathPrefix: string,
                            projectKey: string,
                            skipPrefixes: Set<string>,
                        ): Promise<string[]> => {
                            const nestedRepos: string[] = []

                            // name-status for A/D/M classification
                            const statusResult = await lib.spawnProcess({
                                cmd: ['git', 'diff', 'HEAD', '--name-status', '--no-renames'],
                                cwd: repoPath,
                                waitForExit: true,
                            })
                            // numstat for +/- counts
                            const numstatResult = await lib.spawnProcess({
                                cmd: ['git', 'diff', 'HEAD', '--numstat', '--no-renames'],
                                cwd: repoPath,
                                waitForExit: true,
                            })

                            const numstats: Record<string, { additions: number, deletions: number }> = {}
                            if (numstatResult.exitCode === 0 && numstatResult.stdout.trim()) {
                                for (const line of numstatResult.stdout.trim().split('\n')) {
                                    if (!line.trim()) continue
                                    const [addStr, delStr, ...fileParts] = line.split('\t')
                                    const file = fileParts.join('\t')
                                    numstats[file] = {
                                        additions: addStr === '-' ? 0 : parseInt(addStr, 10),
                                        deletions: delStr === '-' ? 0 : parseInt(delStr, 10),
                                    }
                                }
                            }

                            if (statusResult.exitCode === 0 && statusResult.stdout.trim()) {
                                for (const line of statusResult.stdout.trim().split('\n')) {
                                    if (!line.trim()) continue
                                    const [statusCode, ...fileParts] = line.split('\t')
                                    const file = fileParts.join('\t')
                                    // Skip files belonging to directories we should ignore
                                    if ([...skipPrefixes].some(p => file === p || file.startsWith(p + '/'))) continue

                                    const displayPath = pathPrefix ? lib.path.join(pathPrefix, file) : file
                                    const stats = numstats[file] || { additions: 0, deletions: 0 }
                                    addChange(projectKey, {
                                        file: displayPath,
                                        additions: stats.additions,
                                        deletions: stats.deletions,
                                        status: statusCode.charAt(0),
                                    })
                                }
                            }

                            // Discover untracked directories (may contain nested git repos)
                            const untrackedDirsResult = await lib.spawnProcess({
                                cmd: ['git', 'ls-files', '--others', '--exclude-standard', '--directory'],
                                cwd: repoPath,
                                waitForExit: true,
                            })
                            const nestedRepoDirs: Set<string> = new Set()
                            if (untrackedDirsResult.exitCode === 0 && untrackedDirsResult.stdout.trim()) {
                                for (const rawEntry of untrackedDirsResult.stdout.trim().split('\n')) {
                                    if (!rawEntry.trim()) continue
                                    const entry = rawEntry.replace(/\/$/, '')
                                    if ([...skipPrefixes].some(p => entry === p || entry.startsWith(p + '/'))) continue
                                    const entryGitDir = lib.path.join(repoPath, entry, '.git')
                                    if (await lib.fs.exists(entryGitDir)) {
                                        nestedRepos.push(entry)
                                        nestedRepoDirs.add(entry)
                                    }
                                }
                            }

                            // Untracked files (individual files only, no directory summaries)
                            const untrackedResult = await lib.spawnProcess({
                                cmd: ['git', 'ls-files', '--others', '--exclude-standard'],
                                cwd: repoPath,
                                waitForExit: true,
                            })
                            if (untrackedResult.exitCode === 0 && untrackedResult.stdout.trim()) {
                                for (const file of untrackedResult.stdout.trim().split('\n')) {
                                    if (!file.trim()) continue
                                    if ([...skipPrefixes].some(p => file === p || file.startsWith(p + '/'))) continue
                                    // Skip files inside nested git repos
                                    if ([...nestedRepoDirs].some(d => file.startsWith(d + '/'))) continue

                                    const displayPath = pathPrefix ? lib.path.join(pathPrefix, file) : file
                                    addChange(projectKey, { file: displayPath, additions: 0, deletions: 0, status: 'A' })
                                }
                            }

                            return nestedRepos
                        }

                        // Discover top-level dirs with their own git repo
                        const entries = await lib.fs.readdir(workspaceRootDir, { withFileTypes: true })
                        const ownRepoProjects: Set<string> = new Set()
                        for (const entry of entries) {
                            if (!entry.isDirectory()) continue
                            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
                            const gitDir = lib.path.join(workspaceRootDir, entry.name, '.git')
                            if (await lib.fs.exists(gitDir)) {
                                ownRepoProjects.add(entry.name)
                            }
                        }

                        // Workspace root repo
                        const rootHasGit = await lib.fs.exists(lib.path.join(workspaceRootDir, '.git'))
                        if (rootHasGit) {
                            await collectRepoChanges(workspaceRootDir, '', '.', ownRepoProjects)
                        }

                        // Each project with its own git repo
                        for (const projectDir of ownRepoProjects) {
                            const projectPath = lib.path.join(workspaceRootDir, projectDir)
                            const nestedRepos = await collectRepoChanges(projectPath, projectDir, projectDir, new Set())

                            // Process nested repos as sub-projects
                            for (const nested of nestedRepos) {
                                const nestedAbsPath = lib.path.join(projectPath, nested)
                                const subProjectKey = lib.path.join(projectDir, nested)
                                await collectRepoChanges(nestedAbsPath, subProjectKey, subProjectKey, new Set())
                            }
                        }

                        // Render output
                        if (totalFiles === 0) {
                            console.log(chalk.green('No pending changes.'))
                            return
                        }

                        const sortedProjects = Object.keys(projectChanges).sort()

                        for (const project of sortedProjects) {
                            const changes = projectChanges[project]
                            const projectLabel = project === '.'
                                ? chalk.bold.white('(workspace root)')
                                : chalk.bold.white(project)
                            const fileCount = chalk.gray(`(${changes.length} file${changes.length === 1 ? '' : 's'})`)
                            console.log(`\n${projectLabel} ${fileCount}`)

                            for (const change of changes) {
                                let statusIndicator: string
                                if (change.status === 'A') {
                                    statusIndicator = chalk.green('  A ')
                                } else if (change.status === 'D') {
                                    statusIndicator = chalk.red('  D ')
                                } else {
                                    statusIndicator = chalk.yellow('  M ')
                                }

                                const parts: string[] = [statusIndicator, chalk.white(change.file)]

                                const stats: string[] = []
                                if (change.additions > 0) stats.push(chalk.green(`+${change.additions}`))
                                if (change.deletions > 0) stats.push(chalk.red(`-${change.deletions}`))
                                if (stats.length > 0) {
                                    parts.push(chalk.gray(' ') + stats.join(chalk.gray(' ')))
                                }

                                console.log(parts.join(''))
                            }
                        }

                        // Summary line
                        const summaryParts = [
                            chalk.white(`${totalFiles} file${totalFiles === 1 ? '' : 's'} changed`),
                        ]
                        if (totalAdditions > 0) summaryParts.push(chalk.green(`+${totalAdditions}`))
                        if (totalDeletions > 0) summaryParts.push(chalk.red(`-${totalDeletions}`))
                        console.log(`\n${summaryParts.join(chalk.gray(', '))}`)
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
capsule['#'] = '@stream44.studio/t44/caps/WorkspaceDiff'
