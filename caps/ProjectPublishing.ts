
import { join, resolve } from 'path'
import { $ } from 'bun'
import { mkdir, access, readFile, writeFile } from 'fs/promises'
import { constants } from 'fs'
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
            '#t44/structs/WorkspaceConfig': {
                as: '$WorkspaceConfig'
            },
            '#t44/structs/WorkspacePublishingConfig': {
                as: '$WorkspaceRepositories'
            },
            '#t44/structs/WorkspaceProjectsConfig': {
                as: '$WorkspaceProjectsConfig'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig'
                },
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceProjects'
                },
                ProjectRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectRepository'
                },
                SemverProvider: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/semver.org/ProjectPublishing'
                },
                GitRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/git-scm.com/ProjectPublishing'
                },
                NpmRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/npmjs.com/ProjectPublishing'
                },
                GitHubRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/github.com/ProjectPublishing'
                },
                ProjectRack: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectRack'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/HomeRegistry'
                },
                ProjectCatalogs: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectCatalogs'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const { projectSelector, rc, release, bump, publish, dangerouslyResetMain, dangerouslyResetGordianOpenIntegrity, yesSignoff } = args

                        // Determine if this is a dry-run (default) or actual publish
                        const isDryRun = !rc && !release && !bump && !publish
                        const shouldBumpVersions = rc || release || bump

                        // Provider filter: when --publish <filter> is given, only matching providers run
                        const publishFilter = typeof publish === 'string' ? publish : null
                        const PROVIDER_FILTERS: Record<string, string[]> = {
                            git: [
                                't44/caps/providers/git-scm.com/ProjectPublishing',
                                't44/caps/providers/github.com/ProjectPublishing',
                            ],
                        }
                        const isProviderIncluded = (capsuleName: string): boolean => {
                            if (!publishFilter) return true
                            const allowed = PROVIDER_FILTERS[publishFilter]
                            if (!allowed) {
                                console.log(`[t44] WARNING: Unknown provider filter '${publishFilter}', running all providers\n`)
                                return true
                            }
                            return allowed.includes(capsuleName)
                        }

                        const repositoriesConfig = await this.$WorkspaceRepositories.config

                        if (!repositoriesConfig?.repositories) {
                            throw new Error('No repositories configuration found')
                        }

                        if (dangerouslyResetMain && !projectSelector) {
                            throw new Error('--dangerously-reset-main flag requires a projectSelector or FORCE_FOR_ALL to be specified')
                        }

                        let matchingRepositories: Record<string, any>

                        if (!projectSelector || projectSelector === 'FORCE_FOR_ALL') {
                            matchingRepositories = repositoriesConfig.repositories
                        } else {
                            matchingRepositories = await this.WorkspaceProjects.resolveMatchingRepositories({
                                workspaceProject: projectSelector,
                                repositories: repositoriesConfig.repositories
                            })
                        }

                        // Show mode indicator
                        if (isDryRun) {
                            console.log('[t44] DRY-RUN MODE: Going through all motions without irreversible operations\n')
                            console.log('[t44] Use --rc, --release, or --bump to perform actual operations\n')
                        } else if (bump) {
                            console.log('[t44] BUMP MODE: Will bump versions but skip tagging and publishing\n')
                        } else if (publish) {
                            if (publishFilter) {
                                console.log(`[t44] PUBLISH MODE: Pushing current state to '${publishFilter}' providers only (no version bump or tagging)\n`)
                            } else {
                                console.log('[t44] PUBLISH MODE: Pushing current state to all providers (no version bump or tagging)\n')
                            }
                        }

                        // Phase 1: Copy source directories to stage location (git-tracked)
                        console.log('[t44] Syncing source directories to stage repos ...\n')
                        const stageSourceDirs: Map<string, string> = new Map()

                        const syncToStage = async (repoName: string, repoConfig: any) => {
                            const projectSourceDir = join((repoConfig as any).sourceDir)
                            const repoSourceDir = await this.ProjectRepository.getStagePath({ repoUri: repoName })

                            // Init git repo if not already
                            await this.ProjectRepository.init({ rootDir: repoSourceDir })

                            // Reset working tree to last commit before copying
                            await this.ProjectRepository.reset({ rootDir: repoSourceDir })

                            // Sync files from source to stage repo
                            const gitignorePath = join(projectSourceDir, '.gitignore')
                            await this.ProjectRepository.sync({
                                rootDir: repoSourceDir,
                                sourceDir: projectSourceDir,
                                gitignorePath,
                                excludePatterns: repositoriesConfig.alwaysIgnore || []
                            })

                            stageSourceDirs.set(repoName, repoSourceDir)
                            return repoSourceDir
                        }

                        // Update source package.json private field based on npm provider public config
                        for (const [, repoConfig] of Object.entries(matchingRepositories)) {
                            const providers = Array.isArray((repoConfig as any).providers)
                                ? (repoConfig as any).providers
                                : (repoConfig as any).provider
                                    ? [(repoConfig as any).provider]
                                    : []

                            for (const providerConfig of providers) {
                                if (providerConfig.capsule === 't44/caps/providers/npmjs.com/ProjectPublishing') {
                                    const publicSetting = providerConfig.config?.PackageSettings?.public
                                    if (publicSetting !== undefined) {
                                        const projectSourceDir = join((repoConfig as any).sourceDir)
                                        const sourcePackageJsonPath = join(projectSourceDir, 'package.json')
                                        try {
                                            const content = await readFile(sourcePackageJsonPath, 'utf-8')
                                            const packageJson = JSON.parse(content)
                                            const desiredPrivate = !publicSetting
                                            if (packageJson.private !== desiredPrivate) {
                                                packageJson.private = desiredPrivate
                                                const indent = content.match(/^\{\s*\n([ \t]+)/)
                                                const indentSize = indent ? indent[1].length : 2
                                                await writeFile(sourcePackageJsonPath, JSON.stringify(packageJson, null, indentSize) + '\n', 'utf-8')
                                                console.log(`  ✓ Updated ${sourcePackageJsonPath} private: ${desiredPrivate}`)
                                            }
                                        } catch { }
                                    }
                                }
                            }
                        }

                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            console.log(`=> Syncing '${repoName}' ...`)
                            const repoSourceDir = await syncToStage(repoName, repoConfig)
                            console.log(`   Synced to: ${repoSourceDir}\n`)
                        }

                        // Helper to apply renames and resolve workspace dependencies on stage source dirs
                        const applyRenamesAndFinalize = async () => {
                            const matchingDirs = new Map(
                                Object.keys(matchingRepositories)
                                    .filter(name => stageSourceDirs.has(name))
                                    .map(name => [name, stageSourceDirs.get(name)!])
                            )
                            await this.SemverProvider.rename({
                                dirs: matchingDirs.values(),
                                repos: Object.fromEntries(matchingDirs)
                            })
                        }

                        // Phase 2: Detect source changes and bump versions
                        const bumpedRepos = new Set<string>()

                        if (shouldBumpVersions) {
                            if (rc) console.log('[t44] Release candidate mode enabled\n')
                            if (release) console.log('[t44] Release mode enabled\n')
                            if (bump) console.log('[t44] Bump mode enabled\n')

                            console.log('[t44] Bumping versions ...\n')

                            for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                                const repoSourceDir = stageSourceDirs.get(repoName)!

                                // Check if there are changes since last committed state
                                const hasChanges = await this.ProjectRepository.hasChanges({ rootDir: repoSourceDir })

                                if (!hasChanges) {
                                    console.log(`=> Skipping bump for '${repoName}' (no changes)\n`)
                                    continue
                                }

                                console.log(`=> Bumping version for '${repoName}' ...\n`)

                                const result = await this.SemverProvider.bump({
                                    config: repoConfig,
                                    options: { rc, release, bump }
                                })

                                if (result?.newVersion) {
                                    bumpedRepos.add(repoName)

                                    // Update version in stage repo's package.json too
                                    const stagePackageJsonPath = join(repoSourceDir, 'package.json')
                                    const stageContent = await readFile(stagePackageJsonPath, 'utf-8')
                                    const stagePackageJson = JSON.parse(stageContent)
                                    stagePackageJson.version = result.newVersion
                                    const indent = stageContent.match(/^\{\s*\n([ \t]+)/)
                                    const indentSize = indent ? indent[1].length : 2
                                    await writeFile(stagePackageJsonPath, JSON.stringify(stagePackageJson, null, indentSize) + '\n', 'utf-8')
                                }
                            }

                            console.log('[t44] Version bump complete!\n')
                        }

                        // Phase 3: Apply renames and resolve workspace dependencies
                        await applyRenamesAndFinalize()

                        // Phase 4: Commit the final state for all repos that have changes
                        if (shouldBumpVersions && !bump) {
                            for (const [repoName] of Object.entries(matchingRepositories)) {
                                const repoSourceDir = stageSourceDirs.get(repoName)!
                                await this.ProjectRepository.commit({ rootDir: repoSourceDir, message: 'bump' })
                            }
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

                                const repoSourceDir = stageSourceDirs.get(repoName)!
                                for (const providerConfig of providers) {
                                    const capsuleName = providerConfig.capsule
                                    await callback({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir })
                                }
                            }
                        }

                        // Phase 4: Prepare all providers (copy from stage source to projection dirs)
                        console.log('[t44] Preparing providers ...\n')
                        const packageMetadata: Map<string, any> = new Map()
                        const gitMetadata: Map<string, any> = new Map()

                        await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                            if (!isProviderIncluded(capsuleName)) return
                            if (capsuleName === 't44/caps/providers/npmjs.com/ProjectPublishing') {
                                const metadata = await this.NpmRegistry.prepare({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir },
                                    projectionDir: join(
                                        this.WorkspaceConfig.workspaceRootDir,
                                        '.~o/workspace.foundation/@t44.sh~t44~caps~ProjectPublishing/@t44.sh~t44~caps~providers~npmjs.com~ProjectPublishing'
                                    ),
                                    repoSourceDir
                                })
                                packageMetadata.set(repoName, metadata)
                            } else if (capsuleName === 't44/caps/providers/github.com/ProjectPublishing' && !isDryRun) {
                                // Ensure GitHub repo exists before git-scm.com tries to clone from it
                                await this.GitHubRepository.push({ config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir } })
                            } else if (capsuleName === 't44/caps/providers/git-scm.com/ProjectPublishing') {
                                const metadata = await this.GitRepository.prepare({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir },
                                    projectionDir: join(
                                        this.WorkspaceConfig.workspaceRootDir,
                                        '.~o/workspace.foundation/@t44.sh~t44~caps~ProjectPublishing/@t44.sh~t44~caps~providers~git-scm.com~ProjectPublishing'
                                    )
                                })
                                gitMetadata.set(repoName, metadata)
                            }
                        })

                        // Phase 5: Tag git repos with version (only bumped repos)
                        if ((rc || release) && !isDryRun && !publish) {
                            const taggedRepos = new Set<string>()
                            await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                                if (capsuleName === 't44/caps/providers/git-scm.com/ProjectPublishing' && !taggedRepos.has(repoName)) {
                                    if (!bumpedRepos.has(repoName)) {
                                        console.log(`  ○ Skipping tag for '${repoName}' (not bumped)\n`)
                                        taggedRepos.add(repoName)
                                        return
                                    }
                                    const metadata = gitMetadata.get(repoName)
                                    if (!metadata?.stageDir) return

                                    await this.GitRepository.tag({ metadata, repoSourceDir })
                                    taggedRepos.add(repoName)
                                }
                            })
                        }

                        // Phase 5.5: Sync selected project repos to project rack registry
                        const rackName = await this.ProjectRack.getRackName()
                        if (rackName) {
                            const registryRootDir = await this.HomeRegistry.rootDir
                            const rackStructDir = 't44/structs/ProjectRack'.replace(/\//g, '~')
                            const rackCapsuleDir = 't44/caps/ProjectRepository'.replace(/\//g, '~')
                            const workspaceConfig = await this.$WorkspaceConfig.config
                            const workspaceRootDir = workspaceConfig?.rootDir
                            const projects = await this.WorkspaceProjects.list

                            // Determine which projects have matching repositories
                            const matchingProjectNames = new Set<string>()
                            if (workspaceRootDir) {
                                const { resolve, relative } = await import('path')
                                for (const [, repoConfig] of Object.entries(matchingRepositories)) {
                                    const typedConfig = repoConfig as any
                                    if (typedConfig.sourceDir) {
                                        const resolvedSourceDir = resolve(typedConfig.sourceDir)
                                        const relPath = relative(workspaceRootDir, resolvedSourceDir)
                                        const topDir = relPath.split('/')[0]
                                        matchingProjectNames.add(topDir)
                                    }
                                }
                            }

                            console.log(`[t44] Syncing project repos to project rack '${rackName}' ...\n`)

                            for (const [projectName, projectData] of Object.entries(projects)) {
                                if (matchingProjectNames.size > 0 && !matchingProjectNames.has(projectName)) {
                                    continue
                                }

                                const project = projectData as any
                                const projectDid = project.identifier?.did
                                if (!projectDid) {
                                    console.log(`   ○ Skipping '${projectName}' (no project identifier)`)
                                    continue
                                }

                                const projectSourceDir = project.sourceDir
                                const rackRepoDir = join(registryRootDir, rackStructDir, rackName, rackCapsuleDir, projectDid)
                                try {
                                    // Init bare repo in rack registry if needed
                                    await this.ProjectRepository.initBare({ rootDir: rackRepoDir })

                                    // Add remote to source repo if not present, or update URL
                                    const remoteName = 't44/caps/ProjectRack'
                                    const hasRemote = await this.ProjectRepository.hasRemote({ rootDir: projectSourceDir, name: remoteName })
                                    if (!hasRemote) {
                                        await this.ProjectRepository.addRemote({ rootDir: projectSourceDir, name: remoteName, url: rackRepoDir })
                                    } else {
                                        await this.ProjectRepository.setRemoteUrl({ rootDir: projectSourceDir, name: remoteName, url: rackRepoDir })
                                    }

                                    // Push source repo to rack registry
                                    const branch = await this.ProjectRepository.getBranch({ rootDir: projectSourceDir })
                                    await this.ProjectRepository.pushToRemote({ rootDir: projectSourceDir, remote: remoteName, branch, force: true })

                                    console.log(`   ✓ Synced '${projectName}' to rack`)
                                } catch (error: any) {
                                    const chalk = (await import('chalk')).default
                                    console.log(chalk.red(`\n   ✗ Failed to sync '${projectName}' to project rack '${rackName}'`))
                                    console.log(chalk.red(`     ${error.message || error}`))
                                    console.log(chalk.red(`[t44] ABORT: Rack sync failed. Not pushing to external providers.\n`))
                                    return
                                }
                            }

                            console.log(`[t44] Rack sync complete.\n`)
                        }

                        // Phase 6a: Push all providers
                        if (isDryRun) {
                            console.log('[t44] DRY-RUN: Skipping publishing (would publish packages here)\n')
                        } else {
                            console.log('[t44] Publishing packages ...\n')
                        }
                        const processedRepos = new Set<string>()
                        await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                            if (!isProviderIncluded(capsuleName)) return
                            if (!processedRepos.has(repoName)) {
                                console.log(`\n=> Processing repository '${repoName}' ...\n`)
                                processedRepos.add(repoName)
                            }

                            if (isDryRun) {
                                console.log(`  -> DRY-RUN: Skipping provider '${capsuleName}'\n`)
                            } else {
                                console.log(`  -> Running provider '${capsuleName}' ...\n`)
                            }

                            if (capsuleName === 't44/caps/providers/github.com/ProjectPublishing' && !isDryRun) {
                                await this.GitHubRepository.push({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir }
                                })
                            } else if (capsuleName === 't44/caps/providers/git-scm.com/ProjectPublishing' && !isDryRun) {
                                await this.GitRepository.push({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir, alwaysIgnore: repositoriesConfig.alwaysIgnore },
                                    dangerouslyResetMain,
                                    dangerouslyResetGordianOpenIntegrity,
                                    yesSignoff,
                                    metadata: gitMetadata.get(repoName),
                                    projectSourceDir: (repoConfig as any).sourceDir
                                })
                            } else if (capsuleName === 't44/caps/providers/npmjs.com/ProjectPublishing' && !isDryRun) {
                                await this.NpmRegistry.push({
                                    config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir },
                                    projectionDir: join(
                                        this.WorkspaceConfig.workspaceRootDir,
                                        '.~o/workspace.foundation/@t44.sh~t44~caps~ProjectPublishing/@t44.sh~t44~caps~providers~npmjs.com~ProjectPublishing'
                                    ),
                                    metadata: packageMetadata.get(repoName)
                                })
                            }

                            if (!isDryRun) {
                                console.log(`  <- Provider '${capsuleName}' complete.\n`)
                            }
                        })

                        for (const repoName of processedRepos) {
                            console.log(`<= Repository '${repoName}' processing complete.\n`)
                        }

                        // Phase 6b: Update catalogs after all pushes complete
                        if (!isDryRun) {
                            const catalogRepos = new Set<string>()
                            await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName }) => {
                                if (!isProviderIncluded(capsuleName)) return

                                if (!catalogRepos.has(repoName)) {
                                    catalogRepos.add(repoName)
                                    const repoSourceDir_ = resolve((repoConfig as any).sourceDir)
                                    const workspaceProjectName = await this.WorkspaceProjects.findProjectForPath({ targetPath: repoSourceDir_ }) || ''
                                    await this.ProjectCatalogs.updateCatalogRepository({
                                        repoName,
                                        providerKey: '#' + capsule['#'],
                                        providerData: {
                                            sourceDir: repoSourceDir_,
                                            workspaceProjectName,
                                        },
                                    })
                                }

                                if (capsuleName === 't44/caps/providers/github.com/ProjectPublishing') {
                                    await this.GitHubRepository.afterPush({
                                        repoName,
                                        config: { ...repoConfig, provider: providerConfig, sourceDir: (repoConfig as any).sourceDir },
                                    })
                                } else if (capsuleName === 't44/caps/providers/git-scm.com/ProjectPublishing') {
                                    await this.GitRepository.afterPush({
                                        repoName,
                                        config: { ...repoConfig, provider: providerConfig, sourceDir: (repoConfig as any).sourceDir },
                                        metadata: gitMetadata.get(repoName),
                                    })
                                } else if (capsuleName === 't44/caps/providers/npmjs.com/ProjectPublishing') {
                                    await this.NpmRegistry.afterPush({
                                        repoName,
                                        metadata: packageMetadata.get(repoName),
                                    })
                                }
                            })
                        }

                        if (isDryRun) {
                            console.log('[t44] DRY-RUN complete! No irreversible operations were performed.')
                            console.log('[t44] To actually publish, use: t44 push --rc (for release candidate) or t44 push --release')
                            console.log('[t44] To bump versions only: t44 push --bump')
                        } else if (bump) {
                            console.log('[t44] Version bump complete! Versions updated in package.json files.')
                            console.log('[t44] To tag and publish, use: t44 push --rc or t44 push --release')
                        } else {
                            console.log('[t44] Project repositories pushed OK!')
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
capsule['#'] = 't44/caps/ProjectPublishing'
