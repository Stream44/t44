
import { join } from 'path'
import { $ } from 'bun'
import { mkdir, access } from 'fs/promises'
import { constants } from 'fs'

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
            '#t44/structs/WorkspaceRepositories.v0': {
                as: '$WorkspaceRepositories'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig.v0'
                },
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceProjects.v0'
                },
                SemverProvider: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/semver.org/ProjectPublishing.v0'
                },
                GitRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/git-scm.com/ProjectPublishing.v0'
                },
                NpmRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/npmjs.com/ProjectPublishing.v0'
                },
                GitHubRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/github.com/ProjectPublishing.v0'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const { projectSelector, rc, release, dangerouslyResetMain } = args

                        const repositoriesConfig = await this.$WorkspaceRepositories.config

                        if (!repositoriesConfig?.repositories) {
                            throw new Error('No repositories configuration found')
                        }

                        if (dangerouslyResetMain && !projectSelector) {
                            throw new Error('--dangerously-reset-main flag requires a projectSelector to be specified')
                        }

                        let matchingRepositories: Record<string, any>

                        if (!projectSelector) {
                            matchingRepositories = repositoriesConfig.repositories
                        } else {
                            matchingRepositories = await this.WorkspaceProjects.resolveMatchingRepositories({
                                workspaceProject: projectSelector,
                                repositories: repositoriesConfig.repositories
                            })
                        }

                        // Phase 1: Copy source directories to central location (git-tracked)
                        console.log('[t44] Syncing source directories to central repos ...\n')
                        const centralSourceDirs: Map<string, string> = new Map()

                        const syncToCentral = async (repoName: string, repoConfig: any) => {
                            const projectSourceDir = join((repoConfig as any).sourceDir)
                            const repoSourceDir = join(
                                this.WorkspaceConfig.workspaceRootDir,
                                '.~o/workspace.foundation/ProjectPublishing/repos',
                                repoName
                            )

                            await mkdir(repoSourceDir, { recursive: true })

                            // Init git repo if not already
                            const gitDir = join(repoSourceDir, '.git')
                            let isGitRepo = false
                            try {
                                await access(gitDir, constants.F_OK)
                                isGitRepo = true
                            } catch { }
                            if (!isGitRepo) {
                                await $`git init`.cwd(repoSourceDir).quiet()
                                await $`git commit --allow-empty -m init`.cwd(repoSourceDir).quiet()
                            }

                            // Reset working tree to last commit before copying
                            await $`git checkout -- .`.cwd(repoSourceDir).quiet().nothrow()
                            await $`git clean -fd`.cwd(repoSourceDir).quiet().nothrow()

                            const gitignorePath = join(projectSourceDir, '.gitignore')
                            let gitignoreExists = false
                            try {
                                await access(gitignorePath, constants.F_OK)
                                gitignoreExists = true
                            } catch { }

                            const rsyncArgs = ['rsync', '-a', '--delete', '--exclude', '.git']
                            if (gitignoreExists) rsyncArgs.push('--exclude-from=' + gitignorePath)
                            rsyncArgs.push(projectSourceDir + '/', repoSourceDir + '/')
                            await $`${rsyncArgs}`

                            centralSourceDirs.set(repoName, repoSourceDir)
                            return repoSourceDir
                        }

                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            console.log(`=> Syncing '${repoName}' ...`)
                            const repoSourceDir = await syncToCentral(repoName, repoConfig)
                            console.log(`   Synced to: ${repoSourceDir}\n`)
                        }

                        // Helper to apply renames and resolve workspace dependencies on central source dirs
                        const applyRenamesAndFinalize = async () => {
                            const matchingDirs = new Map(
                                Object.keys(matchingRepositories)
                                    .filter(name => centralSourceDirs.has(name))
                                    .map(name => [name, centralSourceDirs.get(name)!])
                            )
                            await this.SemverProvider.rename({
                                dirs: matchingDirs.values(),
                                repos: Object.fromEntries(matchingDirs)
                            })
                        }

                        // Phase 2: Apply renames and resolve workspace dependencies
                        await applyRenamesAndFinalize()

                        // Phase 3: Bump versions on original source directories
                        const bumpedRepos = new Set<string>()

                        if (rc || release) {
                            if (rc) console.log('[t44] Release candidate mode enabled\n')
                            if (release) console.log('[t44] Release mode enabled\n')

                            console.log('[t44] Bumping versions ...\n')

                            for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                                const repoSourceDir = centralSourceDirs.get(repoName)!

                                // Check if there are changes since last committed state
                                await $`git add -A`.cwd(repoSourceDir).quiet()
                                const diff = await $`git diff --cached --stat`.cwd(repoSourceDir).quiet().nothrow()
                                const diffText = diff.text().trim()
                                const hasChanges = diffText.length > 0
                                await $`git reset`.cwd(repoSourceDir).quiet().nothrow()

                                if (hasChanges) {
                                    console.log(`[debug] Changes detected in '${repoName}':\n${diffText}\n`)
                                }

                                if (!hasChanges) {
                                    console.log(`=> Skipping bump for '${repoName}' (no changes)\n`)
                                    continue
                                }

                                console.log(`=> Bumping version for '${repoName}' ...\n`)

                                await this.SemverProvider.bump({
                                    config: repoConfig,
                                    options: { rc, release }
                                })

                                bumpedRepos.add(repoName)

                                // Re-sync after bump to pick up version change in central repo
                                await syncToCentral(repoName, repoConfig)
                            }

                            // Re-apply renames and finalize only on bumped repos
                            if (bumpedRepos.size > 0) {
                                const bumpedDirs = new Map(
                                    Array.from(bumpedRepos)
                                        .filter(name => centralSourceDirs.has(name))
                                        .map(name => [name, centralSourceDirs.get(name)!])
                                )
                                await this.SemverProvider.rename({
                                    dirs: bumpedDirs.values(),
                                    repos: Object.fromEntries(bumpedDirs)
                                })
                            }

                            // Commit the final state only for bumped repos
                            for (const repoName of bumpedRepos) {
                                const repoSourceDir = centralSourceDirs.get(repoName)!
                                await $`git add -A`.cwd(repoSourceDir).quiet()
                                await $`git commit -m bump`.cwd(repoSourceDir).quiet().nothrow()
                            }

                            console.log('[t44] Version bump complete!\n')
                        }

                        // Helper to iterate providers with custom callback
                        const forEachProvider = async (callback: (params: {
                            repoName: string,
                            repoConfig: any,
                            providerConfig: any,
                            capsuleName: string,
                            repoSourceDir: string
                        }) => Promise<void>) => {
                            for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                                const providers = Array.isArray((repoConfig as any).providers)
                                    ? (repoConfig as any).providers
                                    : (repoConfig as any).provider
                                        ? [(repoConfig as any).provider]
                                        : []

                                const repoSourceDir = centralSourceDirs.get(repoName)!
                                for (const providerConfig of providers) {
                                    const capsuleName = providerConfig.capsule
                                    await callback({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir })
                                }
                            }
                        }

                        // Phase 4: Prepare all providers (copy from central source to projection dirs)
                        console.log('[t44] Preparing providers ...\n')
                        const packageMetadata: Map<string, any> = new Map()
                        const gitMetadata: Map<string, any> = new Map()

                        await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                            if (capsuleName === 't44/caps/providers/npmjs.com/ProjectPublishing.v0') {
                                const metadata = await this.NpmRegistry.prepare({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir },
                                    projectionDir: join(
                                        this.WorkspaceConfig.workspaceRootDir,
                                        '.~o/workspace.foundation/o/npmjs.com'
                                    ),
                                    repoSourceDir
                                })
                                packageMetadata.set(repoName, metadata)
                            } else if (capsuleName === 't44/caps/providers/git-scm.com/ProjectPublishing.v0') {
                                const metadata = await this.GitRepository.prepare({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir },
                                    projectionDir: join(
                                        this.WorkspaceConfig.workspaceRootDir,
                                        '.~o/workspace.foundation/o/git-scm.com'
                                    )
                                })
                                gitMetadata.set(repoName, metadata)
                            }
                        })

                        // Phase 5: Tag git repos with version (only bumped repos)
                        if (rc || release) {
                            const taggedRepos = new Set<string>()
                            await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                                if (capsuleName === 't44/caps/providers/git-scm.com/ProjectPublishing.v0' && !taggedRepos.has(repoName)) {
                                    if (!bumpedRepos.has(repoName)) {
                                        console.log(`  ○ Skipping tag for '${repoName}' (not bumped)\n`)
                                        taggedRepos.add(repoName)
                                        return
                                    }
                                    const metadata = gitMetadata.get(repoName)
                                    if (!metadata?.projectProjectionDir) return

                                    await this.GitRepository.tag({ metadata, repoSourceDir })
                                    taggedRepos.add(repoName)
                                }
                            })
                        }

                        // Phase 6: Push all providers
                        console.log('[t44] Publishing packages ...\n')

                        const processedRepos = new Set<string>()
                        await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                            if (!processedRepos.has(repoName)) {
                                console.log(`\n=> Processing repository '${repoName}' ...\n`)
                                processedRepos.add(repoName)
                            }

                            console.log(`  -> Running provider '${capsuleName}' ...\n`)

                            if (capsuleName === 't44/caps/providers/github.com/ProjectPublishing.v0') {
                                await this.GitHubRepository.push({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir }
                                })
                            } else if (capsuleName === 't44/caps/providers/git-scm.com/ProjectPublishing.v0') {
                                await this.GitRepository.push({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir },
                                    dangerouslyResetMain,
                                    metadata: gitMetadata.get(repoName)
                                })
                            } else if (capsuleName === 't44/caps/providers/npmjs.com/ProjectPublishing.v0') {
                                await this.NpmRegistry.push({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir },
                                    projectionDir: join(
                                        this.WorkspaceConfig.workspaceRootDir,
                                        '.~o/workspace.foundation/o/npmjs.com'
                                    ),
                                    metadata: packageMetadata.get(repoName)
                                })
                            }

                            console.log(`  <- Provider '${capsuleName}' complete.\n`)
                        })

                        for (const repoName of processedRepos) {
                            console.log(`<= Repository '${repoName}' processing complete.\n`)
                        }

                        console.log('[t44] Project repositories pushed OK!')
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
capsule['#'] = 't44/caps/ProjectPublishing.v0'
