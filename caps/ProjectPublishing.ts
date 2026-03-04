
import { join, resolve } from 'path'
import { readFile, writeFile } from 'fs/promises'
import chalk from 'chalk'
import glob from 'fast-glob'

// ── Provider Lifecycle Steps ─────────────────────────────────────────
// Each provider capsule can implement any subset of these methods.
// The orchestrator calls them in order for each repository's providers.
//
//   1. validateSource  — validate source dirs before sync
//   2. prepareSource   — modify source before sync (e.g. npm private field)
//   3. bump            — bump version (e.g. semver RC/release)
//   4. ensureRemote    — ensure remote targets exist (e.g. create GitHub repo)
//   5. prepare         — set up projection/stage dirs, store metadata on ctx
//   6. tag             — tag repos with version
//   7. push            — publish/push to provider
//   8. afterPush       — post-push catalog updates
//
// Every method receives { config, ctx } where:
//   config  = the provider's own config entry (with .capsule and .config)
//   ctx     = shared publishingContext for the current repository
//
// ── Provider Tags ────────────────────────────────────────────────────
// Each provider capsule declares a `tags` property (e.g. ['git'], ['npm'])
// as part of its capsule definition. Tags classify what kind of publishing
// a provider performs. The orchestrator queries `provider.tags` after
// loading the capsule — tags are NOT stored in workspace config because
// they are an intrinsic property of the capsule itself.
//
// When the user runs `t44 push --git` or `t44 push --pkg`, only providers
// whose tags include the matching value will run. For example:
//   - `--git`  runs providers tagged 'git' (git-scm, github, OI, dco)
//   - `--pkg`  runs providers tagged 'pkg' (npmjs)
//   - neither  runs all providers
//
// Providers without tags (e.g. sourcemint license, semver) are skipped
// when a filter is active, which is correct because --git/--pkg mode only
// pushes to external targets without re-validating or bumping.

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
                as: '$WorkspaceConfig'
            },
            '#@stream44.studio/t44/structs/ProjectPublishingConfig': {
                as: '$WorkspaceRepositories'
            },
            '#@stream44.studio/t44/structs/WorkspaceProjectsConfig': {
                as: '$WorkspaceProjectsConfig'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceConfig'
                },
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceProjects'
                },
                ProjectRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectRepository'
                },
                ProjectRack: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectRack'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/HomeRegistry'
                },
                ProjectCatalogs: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectCatalogs'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const { projectSelector, rc, release, bump, git, pkg, dangerouslyResetMain, dangerouslyResetGordianOpenIntegrity, dangerouslySquashToCommit, branch, yesSignoff } = args

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

                        // ── Mode flags ───────────────────────────────────────
                        const publishFilter = git ? 'git' : pkg ? 'pkg' : null
                        const isDryRun = !rc && !release && !bump && !publishFilter
                        const shouldBumpVersions = rc || release || bump

                        // ── Provider filter (tag-based + enabled flag) ───────
                        // When --git or --pkg is given, only providers whose
                        // capsule exposes a matching `tags` property will run.
                        // Tags are queried from the loaded capsule, not from config.
                        // Additionally, providers with `enabled: false` are always skipped.
                        const isProviderIncluded = async (providerConfig: any): Promise<boolean> => {
                            // Check enabled flag first - if explicitly false, skip this provider
                            if (providerConfig.enabled === false) return false
                            if (!publishFilter) return true
                            const provider = await getProvider(providerConfig.capsule)
                            const tags: string[] | undefined = provider.tags
                            if (!tags || tags.length === 0) return false
                            return tags.includes(publishFilter)
                        }

                        // ── Config helpers ────────────────────────────────────
                        const deepMerge = (base: any, override: any): any => {
                            if (override === null || override === undefined) return base
                            if (base === null || base === undefined) return override
                            if (typeof base !== 'object' || typeof override !== 'object') return override
                            if (Array.isArray(base) || Array.isArray(override)) return override
                            const result: any = { ...base }
                            for (const key of Object.keys(override)) {
                                result[key] = deepMerge(base[key], override[key])
                            }
                            return result
                        }

                        const resolveRepoProviders = (repoConfig: any, globalProviders: any[]): any[] => {
                            const repoProviders: any[] = Array.isArray(repoConfig.providers)
                                ? repoConfig.providers
                                : repoConfig.provider
                                    ? [repoConfig.provider]
                                    : []

                            const globalDefaults = new Map<string, any>(
                                globalProviders.map((p: any) => [p.capsule, p])
                            )

                            const merged: any[] = []
                            const seen = new Set<string>()

                            for (const repoProvider of repoProviders) {
                                const capsuleName = repoProvider.capsule
                                const globalDefault = globalDefaults.get(capsuleName)
                                if (globalDefault) {
                                    // Merge: repo-level enabled overrides global, config is deep-merged
                                    const mergedProvider = {
                                        ...globalDefault,
                                        ...repoProvider,
                                        config: deepMerge(globalDefault.config, repoProvider.config),
                                    }
                                    // Explicit enabled at repo level takes precedence
                                    if ('enabled' in repoProvider) {
                                        mergedProvider.enabled = repoProvider.enabled
                                    } else if ('enabled' in globalDefault) {
                                        mergedProvider.enabled = globalDefault.enabled
                                    }
                                    merged.push(mergedProvider)
                                } else {
                                    merged.push(repoProvider)
                                }
                                seen.add(capsuleName)
                            }

                            for (const globalProvider of globalProviders) {
                                if (!seen.has(globalProvider.capsule)) {
                                    merged.unshift(globalProvider)
                                }
                            }

                            return merged
                        }

                        // ── Publishing API (passed to providers) ─────────────
                        const publishingApi = {
                            getProjectionDir: (capsuleName: string) => join(
                                this.WorkspaceConfig.workspaceRootDir,
                                '.~o/workspace.foundation/@stream44.studio~t44~caps~ProjectPublishing',
                                capsuleName.replace(/\//g, '~')
                            ),
                        }

                        // ── Load config ───────────────────────────────────────
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

                        // ── Branch validation ───────────────────────────────
                        // --branch flag requires exactly one project to be selected
                        if (branch && Object.keys(matchingRepositories).length > 1) {
                            throw new Error(
                                `--branch flag requires a single project to be selected, but ${Object.keys(matchingRepositories).length} repositories matched.\n` +
                                `  Specify a projectSelector to narrow down to one project, then use --branch.`
                            )
                        }

                        // ── Resolve per-repo effective branch ───────────────
                        // Priority: CLI --branch > config.activePublishingBranch > undefined (defaults to 'main' downstream)
                        const repoEffectiveBranches = new Map<string, string | undefined>()
                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            if (branch) {
                                repoEffectiveBranches.set(repoName, branch)
                            } else {
                                const configBranch = (repoConfig as any).activePublishingBranch
                                repoEffectiveBranches.set(repoName, configBranch || undefined)
                            }
                        }

                        // ── Show mode indicator ──────────────────────────────
                        if (isDryRun) {
                            console.log('[t44] DRY-RUN MODE: Going through all motions without irreversible operations\n')
                            console.log('[t44] Use --rc, --release, or --bump to perform actual operations\n')
                        } else if (bump) {
                            console.log('[t44] BUMP MODE: Will bump versions but skip tagging and publishing\n')
                        } else if (publishFilter) {
                            console.log(`[t44] PUBLISH MODE: Pushing current state to '${publishFilter}' providers only (no version bump or tagging)\n`)
                        }

                        const globalProviders: any[] = Array.isArray(repositoriesConfig.providers)
                            ? repositoriesConfig.providers
                            : []

                        // ── Helper: call a lifecycle step on all providers for a repo ──
                        const callProvidersForRepo = async (
                            step: string,
                            repoName: string,
                            repoConfig: any,
                            repoSourceDir: string,
                            ctx: any,
                        ) => {
                            const providers = resolveRepoProviders(repoConfig, globalProviders)
                            ctx.mergedProviders = providers
                            for (const providerConfig of providers) {
                                if (!await isProviderIncluded(providerConfig)) continue

                                const provider = await getProvider(providerConfig.capsule)
                                if (typeof provider[step] !== 'function') continue

                                await provider[step]({
                                    config: providerConfig,
                                    ctx,
                                })
                            }
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 1: validateSource — validate source dirs before sync
                        // ══════════════════════════════════════════════════════
                        console.log('[t44] Validating source directories ...\n')
                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            const ctx = {
                                repoName,
                                repoConfig,
                                repoSourceDir: join((repoConfig as any).sourceDir),
                                options: { isDryRun, shouldBumpVersions, rc, release, bump, git, pkg, publishFilter, dangerouslyResetMain, dangerouslyResetGordianOpenIntegrity, dangerouslySquashToCommit, branch: repoEffectiveBranches.get(repoName), yesSignoff },
                                metadata: {} as Record<string, any>,
                                alwaysIgnore: repositoriesConfig.alwaysIgnore || [],
                                publishingApi,
                            }
                            await callProvidersForRepo('validateSource', repoName, repoConfig, ctx.repoSourceDir, ctx)
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 2: prepareSource — modify source before sync
                        // ══════════════════════════════════════════════════════
                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            const ctx = {
                                repoName,
                                repoConfig,
                                repoSourceDir: join((repoConfig as any).sourceDir),
                                options: { isDryRun, shouldBumpVersions, rc, release, bump, git, pkg, publishFilter, dangerouslyResetMain, dangerouslyResetGordianOpenIntegrity, dangerouslySquashToCommit, branch: repoEffectiveBranches.get(repoName), yesSignoff },
                                metadata: {} as Record<string, any>,
                                alwaysIgnore: repositoriesConfig.alwaysIgnore || [],
                                publishingApi,
                            }
                            await callProvidersForRepo('prepareSource', repoName, repoConfig, ctx.repoSourceDir, ctx)
                        }

                        // ══════════════════════════════════════════════════════
                        // INTERNAL: Check for .rej / .orig files (unresolved patch conflicts)
                        // ══════════════════════════════════════════════════════
                        const allRejFiles: string[] = []
                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            const projectSourceDir = join((repoConfig as any).sourceDir)
                            const rejFiles = await glob('**/*.{rej,orig}', {
                                cwd: projectSourceDir,
                                absolute: false,
                                onlyFiles: true,
                                dot: true,
                                ignore: ['**/node_modules/**', '**/.git/**']
                            })
                            for (const rejFile of rejFiles) {
                                allRejFiles.push(join(projectSourceDir, rejFile))
                            }
                        }

                        if (allRejFiles.length > 0) {
                            console.log(chalk.red('\n[t44] ERROR: Found unresolved patch conflict files (.rej / .orig)\n'))
                            console.log(chalk.red('The following files must be resolved and removed before publishing:\n'))
                            for (const rejFile of allRejFiles) {
                                console.log(chalk.red(`   • ${rejFile}`))
                            }
                            console.log(chalk.yellow('\nThese files are created when `patch` fails to apply a hunk cleanly.'))
                            console.log(chalk.yellow('Review each file, manually apply the changes, then delete them.\n'))
                            process.exit(1)
                        }

                        // ══════════════════════════════════════════════════════
                        // INTERNAL: Sync source directories to stage repos
                        // ══════════════════════════════════════════════════════
                        console.log('[t44] Syncing source directories to stage repos ...\n')
                        const stageSourceDirs: Map<string, string> = new Map()

                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            const projectSourceDir = join((repoConfig as any).sourceDir)
                            const repoSourceDir = await this.ProjectRepository.getStagePath({ repoUri: repoName })

                            await this.ProjectRepository.init({ rootDir: repoSourceDir })
                            await this.ProjectRepository.reset({ rootDir: repoSourceDir })

                            const gitignorePath = join(projectSourceDir, '.gitignore')
                            await this.ProjectRepository.sync({
                                rootDir: repoSourceDir,
                                sourceDir: projectSourceDir,
                                gitignorePath,
                                excludePatterns: repositoriesConfig.alwaysIgnore || []
                            })

                            stageSourceDirs.set(repoName, repoSourceDir)
                            console.log(`=> Synced '${repoName}' to: ${repoSourceDir}\n`)
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 3: bump — bump versions via providers
                        // ══════════════════════════════════════════════════════
                        const bumpedRepos = new Set<string>()

                        if (shouldBumpVersions) {
                            if (rc) console.log('[t44] Release candidate mode enabled\n')
                            if (release) console.log('[t44] Release mode enabled\n')
                            if (bump) console.log('[t44] Bump mode enabled\n')

                            console.log('[t44] Bumping versions ...\n')

                            for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                                const repoSourceDir = stageSourceDirs.get(repoName)!

                                const hasChanges = await this.ProjectRepository.hasChanges({ rootDir: repoSourceDir })
                                if (!hasChanges) {
                                    console.log(`=> Skipping bump for '${repoName}' (no changes)\n`)
                                    continue
                                }

                                console.log(`=> Bumping version for '${repoName}' ...\n`)

                                const ctx = {
                                    repoName,
                                    repoConfig,
                                    repoSourceDir,
                                    options: { isDryRun, shouldBumpVersions, rc, release, bump, git, pkg, publishFilter, dangerouslyResetMain, dangerouslyResetGordianOpenIntegrity, dangerouslySquashToCommit, branch: repoEffectiveBranches.get(repoName), yesSignoff },
                                    metadata: {} as Record<string, any>,
                                    bumpedRepos,
                                    alwaysIgnore: repositoriesConfig.alwaysIgnore || [],
                                    publishingApi,
                                }
                                await callProvidersForRepo('bump', repoName, repoConfig, repoSourceDir, ctx)

                                if (ctx.metadata.bumped) {
                                    bumpedRepos.add(repoName)
                                }
                            }

                            console.log('[t44] Version bump complete!\n')
                        }

                        // ══════════════════════════════════════════════════════
                        // INTERNAL: Apply renames and resolve workspace deps
                        // (cross-repo operation — not a per-provider lifecycle step)
                        // ══════════════════════════════════════════════════════
                        const matchingDirs = new Map(
                            Object.keys(matchingRepositories)
                                .filter(name => stageSourceDirs.has(name))
                                .map(name => [name, stageSourceDirs.get(name)!])
                        )
                        const renameProviders = resolveRepoProviders(
                            Object.values(matchingRepositories)[0] || {},
                            globalProviders
                        )
                        for (const providerConfig of renameProviders) {
                            const provider = await getProvider(providerConfig.capsule)
                            if (typeof provider.rename === 'function') {
                                await provider.rename({
                                    dirs: matchingDirs.values(),
                                    repos: Object.fromEntries(matchingDirs)
                                })
                            }
                        }

                        // ══════════════════════════════════════════════════════
                        // INTERNAL: Commit bumped versions to stage repos
                        // ══════════════════════════════════════════════════════
                        if (shouldBumpVersions && !bump) {
                            for (const [repoName] of Object.entries(matchingRepositories)) {
                                const repoSourceDir = stageSourceDirs.get(repoName)!
                                await this.ProjectRepository.commit({ rootDir: repoSourceDir, message: 'bump' })
                            }
                        }

                        // ══════════════════════════════════════════════════════
                        // Build per-repo publishing contexts
                        // ══════════════════════════════════════════════════════
                        const repoContexts = new Map<string, any>()
                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            repoContexts.set(repoName, {
                                repoName,
                                repoConfig,
                                repoSourceDir: stageSourceDirs.get(repoName)!,
                                options: { isDryRun, shouldBumpVersions, rc, release, bump, git, pkg, publishFilter, dangerouslyResetMain, dangerouslyResetGordianOpenIntegrity, dangerouslySquashToCommit, branch: repoEffectiveBranches.get(repoName), yesSignoff },
                                metadata: {} as Record<string, any>,
                                bumpedRepos,
                                alwaysIgnore: repositoriesConfig.alwaysIgnore || [],
                                publishingApi,
                            })
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 4: ensureRemote — ensure remote targets exist
                        // (e.g. create GitHub repos before git-scm tries to clone)
                        // ══════════════════════════════════════════════════════
                        console.log('[t44] Ensuring remote targets ...\n')
                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            const ctx = repoContexts.get(repoName)!
                            await callProvidersForRepo('ensureRemote', repoName, repoConfig, ctx.repoSourceDir, ctx)
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 5: prepare — set up projection/stage dirs
                        // ══════════════════════════════════════════════════════
                        console.log('[t44] Preparing providers ...\n')
                        for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                            const ctx = repoContexts.get(repoName)!
                            await callProvidersForRepo('prepare', repoName, repoConfig, ctx.repoSourceDir, ctx)
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 6: tag — tag repos with version
                        // ══════════════════════════════════════════════════════
                        if ((rc || release) && !isDryRun && !publishFilter) {
                            for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                                if (!bumpedRepos.has(repoName)) {
                                    console.log(`  ○ Skipping tag for '${repoName}' (not bumped)\n`)
                                    continue
                                }
                                const ctx = repoContexts.get(repoName)!
                                await callProvidersForRepo('tag', repoName, repoConfig, ctx.repoSourceDir, ctx)
                            }
                        }

                        // ══════════════════════════════════════════════════════
                        // INTERNAL: Sync to project rack registry
                        // ══════════════════════════════════════════════════════
                        const rackName = await this.ProjectRack.getRackName()
                        if (rackName) {
                            const registryRootDir = await this.HomeRegistry.rootDir
                            const rackStructDir = '@stream44.studio/t44/structs/ProjectRack'.replace(/\//g, '~')
                            const rackCapsuleDir = '@stream44.studio/t44/caps/ProjectRepository'.replace(/\//g, '~')
                            const workspaceConfig = await this.$WorkspaceConfig.config
                            const workspaceRootDir = workspaceConfig?.rootDir
                            const projects = await this.WorkspaceProjects.list

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
                                    await this.ProjectRepository.initBare({ rootDir: rackRepoDir })

                                    const remoteName = '@stream44.studio/t44/caps/ProjectRack'
                                    const hasRemote = await this.ProjectRepository.hasRemote({ rootDir: projectSourceDir, name: remoteName })
                                    if (!hasRemote) {
                                        await this.ProjectRepository.addRemote({ rootDir: projectSourceDir, name: remoteName, url: rackRepoDir })
                                    } else {
                                        await this.ProjectRepository.setRemoteUrl({ rootDir: projectSourceDir, name: remoteName, url: rackRepoDir })
                                    }

                                    const branch = await this.ProjectRepository.getBranch({ rootDir: projectSourceDir })
                                    await this.ProjectRepository.pushToRemote({ rootDir: projectSourceDir, remote: remoteName, branch, force: true })

                                    console.log(`   ✓ Synced '${projectName}' to rack`)
                                } catch (error: any) {
                                    console.log(chalk.red(`\n   ✗ Failed to sync '${projectName}' to project rack '${rackName}'`))
                                    console.log(chalk.red(`     ${error.message || error}`))
                                    console.log(chalk.red(`[t44] ABORT: Rack sync failed. Not pushing to external providers.\n`))
                                    return
                                }
                            }

                            console.log(`[t44] Rack sync complete.\n`)
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 7: push — publish/push to providers
                        // ══════════════════════════════════════════════════════
                        if (isDryRun) {
                            console.log('[t44] DRY-RUN: Skipping publishing (would publish packages here)\n')

                            for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                                console.log(`\n=> Processing repository '${repoName}' ...\n`)
                                const providers = resolveRepoProviders(repoConfig as any, globalProviders)
                                for (const providerConfig of providers) {
                                    if (!await isProviderIncluded(providerConfig)) continue
                                    console.log(`  -> DRY-RUN: Skipping provider '${providerConfig.capsule}'\n`)
                                }
                            }
                        } else {
                            console.log('[t44] Publishing packages ...\n')

                            for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                                console.log(`\n=> Processing repository '${repoName}' ...\n`)
                                const ctx = repoContexts.get(repoName)!
                                const providers = resolveRepoProviders(repoConfig as any, globalProviders)

                                for (const providerConfig of providers) {
                                    if (!(await isProviderIncluded(providerConfig))) continue

                                    const capsuleName = providerConfig.capsule
                                    const provider = await getProvider(capsuleName)
                                    if (typeof provider.push !== 'function') continue

                                    console.log(`  -> Running provider '${capsuleName}' ...\n`)
                                    await provider.push({ config: providerConfig, ctx })
                                    console.log(`  <- Provider '${capsuleName}' complete.\n`)
                                }

                                console.log(`<= Repository '${repoName}' processing complete.\n`)
                            }
                        }

                        // ══════════════════════════════════════════════════════
                        // INTERNAL: Persist activePublishingBranch to config
                        // ══════════════════════════════════════════════════════
                        if (!isDryRun) {
                            for (const [repoName] of Object.entries(matchingRepositories)) {
                                const effectiveBranch = repoEffectiveBranches.get(repoName)
                                if (branch && effectiveBranch) {
                                    // --branch was explicitly used: persist to config
                                    await this.$WorkspaceRepositories.setConfigValue(
                                        ['repositories', repoName, 'activePublishingBranch'], effectiveBranch
                                    )
                                    console.log(`[t44] Stored activePublishingBranch '${effectiveBranch}' for '${repoName}'\n`)
                                }
                            }
                        }

                        // ══════════════════════════════════════════════════════
                        // STEP 8: afterPush — update catalogs
                        // ══════════════════════════════════════════════════════
                        if (!isDryRun) {
                            for (const [repoName, repoConfig] of Object.entries(matchingRepositories)) {
                                const ctx = repoContexts.get(repoName)!

                                // Update base catalog entry once per repo
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

                                // Call afterPush on all providers
                                await callProvidersForRepo('afterPush', repoName, repoConfig, ctx.repoSourceDir, ctx)
                            }
                        }

                        // ══════════════════════════════════════════════════════
                        // Done
                        // ══════════════════════════════════════════════════════
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
capsule['#'] = '@stream44.studio/t44/caps/ProjectPublishing'
