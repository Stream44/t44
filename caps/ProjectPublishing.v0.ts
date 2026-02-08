
import { join } from 'path'
import { $ } from 'bun'
import { mkdir, access, readFile, writeFile } from 'fs/promises'
import { constants } from 'fs'
import glob from 'fast-glob'
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
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#t44/structs/WorkspaceConfig.v0': {
                as: '$WorkspaceConfig'
            },
            '#t44/structs/WorkspaceRepositories.v0': {
                as: '$WorkspaceRepositories'
            },
            '#t44/structs/WorkspaceMappings.v0': {
                as: '$WorkspaceMappings'
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

                        // Phase 0: Copy source directories to central location
                        console.log('[t44] Copying source directories to central location ...\n')
                        const centralSourceDirs: Map<string, string> = new Map()

                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            const projectSourceDir = join((repoConfig as any).sourceDir)
                            const repoSourceDir = join(
                                this.WorkspaceConfig.workspaceRootDir,
                                '.~o/workspace.foundation/ProjectPublishing/repos',
                                repoName
                            )

                            console.log(`=> Syncing '${repoName}' to central location ...`)

                            await mkdir(repoSourceDir, { recursive: true })

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
                            console.log(`   Synced to: ${repoSourceDir}\n`)
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

                        // Phase 1: Prepare - analyze all packages and collect metadata
                        console.log('[t44] Analyzing packages ...\n')
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

                        // Reusable closure: Apply package name renames from workspace mappings
                        const applyRenames = async () => {
                            const mappingsConfig = await this.$WorkspaceMappings.config
                            const publishingMappings = mappingsConfig?.mappings?.['t44/caps/providers/ProjectPublishing.v0']
                            if (!publishingMappings?.npm) return

                            const npmRenames: Record<string, string> = publishingMappings.npm
                            const renameEntries = Object.entries(npmRenames)
                            if (renameEntries.length === 0) return

                            // Collect all directories that need renaming (projection dirs + central source dirs)
                            const dirsToRename: string[] = []

                            for (const metadata of gitMetadata.values()) {
                                if (metadata.projectProjectionDir) {
                                    dirsToRename.push(metadata.projectProjectionDir)
                                }
                            }
                            for (const metadata of packageMetadata.values()) {
                                if (metadata.projectProjectionDir) {
                                    dirsToRename.push(metadata.projectProjectionDir)
                                }
                            }
                            for (const dir of centralSourceDirs.values()) {
                                dirsToRename.push(dir)
                            }

                            if (dirsToRename.length === 0) return

                            console.log('[t44] Applying package name renames ...\n')

                            for (const dir of dirsToRename) {
                                const files = await glob('**/*.{ts,tsx,js,jsx,json,md,txt,yml,yaml}', {
                                    cwd: dir,
                                    absolute: true,
                                    onlyFiles: true
                                })

                                for (const file of files) {
                                    try {
                                        let content = await readFile(file, 'utf-8')
                                        let modified = false

                                        for (const [workspaceName, publicName] of renameEntries) {
                                            const regex = new RegExp(workspaceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                                            if (regex.test(content)) {
                                                content = content.replace(regex, publicName)
                                                modified = true
                                            }
                                        }

                                        if (modified) {
                                            await writeFile(file, content, 'utf-8')
                                        }
                                    } catch (e) {
                                        // Skip files that can't be read as text
                                    }
                                }
                            }
                        }

                        // Reusable closure: Finalize workspace dependencies in all central source package.json files
                        const finalizeDeps = async () => {
                            console.log('[t44] Resolving workspace dependencies ...\n')
                            const finalizedRepos = new Set<string>()
                            await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                                if (capsuleName === 't44/caps/providers/npmjs.com/ProjectPublishing.v0' && !finalizedRepos.has(repoName)) {
                                    await this.NpmRegistry.finalize({
                                        config: { ...repoConfig, provider: providerConfig, sourceDir: repoSourceDir }
                                    })
                                    finalizedRepos.add(repoName)
                                }
                            })
                        }

                        // Reusable closure: Re-prepare npm packages so projection dirs reflect current state
                        const reprepareNpm = async () => {
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
                                }
                            })
                        }

                        // Run rename and finalize
                        await reprepareNpm()
                        await applyRenames()
                        await finalizeDeps()

                        // Phase 2: Bump - only bump packages that have changes
                        if (rc || release) {
                            if (rc) console.log('[t44] Release candidate mode enabled\n')
                            if (release) console.log('[t44] Release mode enabled\n')

                            console.log('[t44] Bumping versions for changed packages ...\n')

                            const bumpedRepos = new Set<string>()
                            await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                                if (capsuleName === 't44/caps/providers/npmjs.com/ProjectPublishing.v0') {
                                    const metadata = packageMetadata.get(repoName)

                                    if (metadata && metadata.hasChanges) {
                                        if (!bumpedRepos.has(repoName)) {
                                            console.log(`\n=> Bumping version for '${repoName}' ...\n`)
                                            bumpedRepos.add(repoName)
                                        }

                                        await this.NpmRegistry.bump({
                                            config: { ...repoConfig, provider: providerConfig },
                                            options: { rc, release },
                                            repoSourceDir,
                                            metadata
                                        })
                                    } else if (metadata && !bumpedRepos.has(repoName)) {
                                        console.log(`\n=> Skipping '${repoName}' (no changes)\n`)
                                        bumpedRepos.add(repoName)
                                    }
                                }
                            })

                            console.log('[t44] Version bump complete!\n')

                            // After bump: re-run rename, finalize, and re-prepare with updated versions
                            await reprepareNpm()
                            await applyRenames()
                            await finalizeDeps()

                            // Tag git-scm repos with the bumped version
                            const taggedRepos = new Set<string>()
                            await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                                if (capsuleName === 't44/caps/providers/git-scm.com/ProjectPublishing.v0' && !taggedRepos.has(repoName)) {
                                    const metadata = gitMetadata.get(repoName)
                                    if (!metadata?.projectProjectionDir) return

                                    const { projectProjectionDir } = metadata

                                    // Read the bumped version from the source package.json
                                    const packageJsonPath = join(repoSourceDir, 'package.json')
                                    try {
                                        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                                        const packageJson = JSON.parse(packageJsonContent)
                                        const version = packageJson.version
                                        const tag = `v${version}`

                                        // Check if tag already exists locally or on remote
                                        const localTagCheck = await $`git tag -l ${tag}`.cwd(projectProjectionDir).quiet().nothrow()
                                        if (localTagCheck.text().trim() === tag) {
                                            throw new Error(
                                                `Git tag '${tag}' already exists in repository '${repoName}'.\n` +
                                                `  Please bump to a different version before pushing.`
                                            )
                                        }

                                        const remoteTagCheck = await $`git ls-remote --tags origin ${tag}`.cwd(projectProjectionDir).quiet().nothrow()
                                        if (remoteTagCheck.text().trim().length > 0) {
                                            throw new Error(
                                                `Git tag '${tag}' already exists on remote for repository '${repoName}'.\n` +
                                                `  Please bump to a different version before pushing.`
                                            )
                                        }

                                        await $`git tag ${tag}`.cwd(projectProjectionDir)
                                        console.log(chalk.green(`  ✓ Tagged repository '${repoName}' with ${tag}\n`))
                                        taggedRepos.add(repoName)
                                    } catch (error: any) {
                                        if (error.message?.includes('already exists')) {
                                            throw error
                                        }
                                        // Skip if package.json can't be read
                                    }
                                }
                            })
                        }

                        // Phase 3: Push - publish packages
                        console.log('[t44] Publishing packages ...\n')

                        const processedRepos = new Set<string>()
                        await forEachProvider(async ({ repoName, repoConfig, providerConfig, capsuleName, repoSourceDir }) => {
                            if (!processedRepos.has(repoName)) {
                                console.log(`\n=> Processing repository '${repoName}' ...\n`)
                                processedRepos.add(repoName)
                            }

                            console.log(`  -> Running provider '${capsuleName}' ...\n`)

                            const metadata = packageMetadata.get(repoName)

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
                                    metadata
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
