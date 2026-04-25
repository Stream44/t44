
// ── Provider Lifecycle Steps ─────────────────────────────────────────
// Each pull provider capsule can implement these methods:
//
//   1. parseUrl     — parse a URL and return { owner, repo, branch } or null
//   2. prepare      — clone/fetch the mirror repo, checkout the branch
//   3. pull         — generate diff and apply to sourceDir
//
// Every method receives { config, ctx } where:
//   config  = the provider's own config entry (with .capsule and .config)
//   ctx     = shared pullingContext for the current operation

import { join } from 'path'
import { access, mkdir } from 'fs/promises'
import chalk from 'chalk'
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
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#@stream44.studio/t44/structs/WorkspaceConfig': {
                as: '$WorkspaceConfig'
            },
            '#@stream44.studio/t44/structs/ProjectPullingConfig': {
                as: '$WorkspacePulling'
            },
            '#@stream44.studio/t44/structs/ProjectPublishingConfig': {
                as: '$WorkspaceRepositories'
            },
            '#@stream44.studio/t44/structs/WorkspaceProjectsConfig': {
                as: '$WorkspaceProjectsConfig'
            },
            '#@stream44.studio/t44/structs/ProjectRackConfig': {
                as: '$ProjectRackConfig'
            },
            '#@stream44.studio/t44/structs/HomeRegistryConfig': {
                as: '$HomeRegistryConfig'
            },
            '#': {
                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceLib'
                },
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceConfig'
                },
                ProjectRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectRepository'
                },
                _collectWorkspaceDeps: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, projectDir: string): Promise<Set<string>> {
                        const { readFile: readFileAsync, readdir } = await import('fs/promises')
                        const depScopes = new Set<string>()

                        // Collect workspace:* deps from a single package.json
                        const collectFromPkg = (pkg: any) => {
                            const allDeps = {
                                ...pkg.dependencies,
                                ...pkg.devDependencies,
                                ...pkg.peerDependencies
                            }
                            for (const [name, version] of Object.entries(allDeps)) {
                                if (version === 'workspace:*' && name.startsWith('@')) {
                                    // Extract scope: @capsula.computer/capsule -> capsula.computer
                                    const scope = name.slice(1).split('/')[0]
                                    depScopes.add(scope)
                                }
                            }
                        }

                        // Read root package.json
                        try {
                            const rootPkg = JSON.parse(await readFileAsync(join(projectDir, 'package.json'), 'utf-8'))
                            collectFromPkg(rootPkg)
                        } catch { }

                        // Read all sub-package package.json files
                        const packagesDir = join(projectDir, 'packages')
                        try {
                            const entries = await readdir(packagesDir, { withFileTypes: true })
                            for (const entry of entries) {
                                if (!entry.isDirectory()) continue
                                try {
                                    const subPkg = JSON.parse(await readFileAsync(join(packagesDir, entry.name, 'package.json'), 'utf-8'))
                                    collectFromPkg(subPkg)
                                } catch { }
                                // Also check nested dirs (e.g. packages/FramespaceGenesis/L3-model-server)
                                try {
                                    const nestedEntries = await readdir(join(packagesDir, entry.name), { withFileTypes: true })
                                    for (const nested of nestedEntries) {
                                        if (!nested.isDirectory()) continue
                                        try {
                                            const nestedPkg = JSON.parse(await readFileAsync(join(packagesDir, entry.name, nested.name, 'package.json'), 'utf-8'))
                                            collectFromPkg(nestedPkg)
                                        } catch { }
                                    }
                                } catch { }
                            }
                        } catch { }

                        return depScopes
                    }
                },
                _pullWithDeps: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, projectName: string, visitedProjects?: Set<string>): Promise<void> {
                        if (!visitedProjects) visitedProjects = new Set<string>()
                        if (visitedProjects.has(projectName)) return
                        visitedProjects.add(projectName)

                        // Pull the project itself (handles both clone and update)
                        await this._pullFromRack(projectName)

                        // Scan for workspace:* dependencies
                        const workspaceRootDir = this.WorkspaceConfig.workspaceRootDir
                        const projectDir = join(workspaceRootDir, projectName)
                        const depScopes = await this._collectWorkspaceDeps(projectDir)

                        // Load catalog to check which deps are available in the rack
                        const rackConfig = await this.$ProjectRackConfig.config
                        const homeRegistryConfig = await this.$HomeRegistryConfig.config
                        const rackBaseDir = join(
                            homeRegistryConfig.rootDir,
                            '@stream44.studio~t44~structs~ProjectRack',
                            rackConfig.name,
                            '@stream44.studio~t44~caps~ProjectRepository'
                        )
                        let catalog: Record<string, string> = {}
                        try {
                            const { readFile: readFileAsync } = await import('fs/promises')
                            catalog = JSON.parse(await readFileAsync(join(rackBaseDir, 'projects.json'), 'utf-8'))
                        } catch { }

                        for (const scope of depScopes) {
                            // Skip if already visited in this session (cycle prevention)
                            if (visitedProjects.has(scope)) continue
                            // Check if available in rack catalog
                            if (!catalog[scope]) {
                                console.log(chalk.yellow(`   ⚠ Dependency project '${scope}' not found in project rack — skipping`))
                                visitedProjects.add(scope)
                                continue
                            }
                            // Recursively pull/provision the dependency (whether new or existing)
                            console.log(chalk.cyan(`\n[t44] Provisioning dependency project '${scope}'...`))
                            await this._pullWithDeps(scope, visitedProjects)
                        }
                    }
                },
                _syncProjectWorkspaces: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, workspaceRootDir: string, projectName: string): Promise<void> {
                        const { readFile: readFileAsync, writeFile: writeFileAsync } = await import('fs/promises')

                        // Read the project's own package.json to get its workspace declarations
                        const projectPkgPath = join(workspaceRootDir, projectName, 'package.json')
                        let projectWorkspaces: string[] = []
                        try {
                            const projectPkg = JSON.parse(await readFileAsync(projectPkgPath, 'utf-8'))
                            projectWorkspaces = Array.isArray(projectPkg.workspaces) ? projectPkg.workspaces : []
                        } catch {
                            // No project package.json or no workspaces — use default
                            projectWorkspaces = ['packages/*']
                        }

                        // Prefix each project workspace with the project name for the root
                        const prefixedWorkspaces = projectWorkspaces.map(ws => `${projectName}/${ws}`)

                        // Update root package.json workspaces
                        const rootPkgPath = join(workspaceRootDir, 'package.json')
                        try {
                            const rootPkgContent = await readFileAsync(rootPkgPath, 'utf-8')
                            const rootPkg = JSON.parse(rootPkgContent)
                            if (!rootPkg.workspaces) rootPkg.workspaces = []

                            // Remove any existing entries for this project (to handle removals)
                            const projectPrefix = `${projectName}/`
                            const filtered = rootPkg.workspaces.filter((ws: string) => !ws.startsWith(projectPrefix))

                            // Add the current project workspace entries
                            const merged = [...filtered, ...prefixedWorkspaces]
                            merged.sort()

                            if (JSON.stringify(merged) !== JSON.stringify(rootPkg.workspaces)) {
                                rootPkg.workspaces = merged
                                await writeFileAsync(rootPkgPath, JSON.stringify(rootPkg, null, 4) + '\n')
                                console.log(chalk.green(`   ✓ Synced '${projectName}' workspaces to root package.json`))
                            }
                        } catch (err: any) {
                            if (err?.code !== 'ENOENT') throw err
                        }

                        // Update tsconfig.json - add reference
                        const tsconfigPath = join(workspaceRootDir, 'tsconfig.json')
                        try {
                            const tsconfigContent = await readFileAsync(tsconfigPath, 'utf-8')
                            const tsconfig = JSON.parse(tsconfigContent)
                            if (!tsconfig.references) tsconfig.references = []
                            const refPath = `./${projectName}`
                            const exists = tsconfig.references.some((r: any) => r.path === refPath)
                            if (!exists) {
                                tsconfig.references.push({ path: refPath })
                                tsconfig.references.sort((a: any, b: any) => a.path.localeCompare(b.path))
                                await writeFileAsync(tsconfigPath, JSON.stringify(tsconfig, null, 4) + '\n')
                                console.log(chalk.green(`   ✓ Added '${projectName}' to tsconfig.json references`))
                            }
                        } catch (err: any) {
                            if (err?.code !== 'ENOENT') throw err
                        }

                        // Update tsconfig.paths.json - add path mapping
                        const tsconfigPathsPath = join(workspaceRootDir, 'tsconfig.paths.json')
                        try {
                            const pathsContent = await readFileAsync(tsconfigPathsPath, 'utf-8')
                            const pathsConfig = JSON.parse(pathsContent)
                            if (!pathsConfig.compilerOptions) pathsConfig.compilerOptions = {}
                            if (!pathsConfig.compilerOptions.paths) pathsConfig.compilerOptions.paths = {}
                            const scope = `@${projectName}/*`
                            if (!pathsConfig.compilerOptions.paths[scope]) {
                                pathsConfig.compilerOptions.paths[scope] = [`./${projectName}/packages/*`]
                                await writeFileAsync(tsconfigPathsPath, JSON.stringify(pathsConfig, null, 4) + '\n')
                                console.log(chalk.green(`   ✓ Added '${projectName}' to tsconfig.paths.json`))
                            }
                        } catch (err: any) {
                            if (err?.code !== 'ENOENT') throw err
                        }
                    }
                },
                _pullFromRack: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, projectName: string): Promise<void> {
                        // Get workspace and rack config
                        const workspaceConfig = await this.$WorkspaceConfig.config
                        const rackConfig = await this.$ProjectRackConfig.config
                        const homeRegistryConfig = await this.$HomeRegistryConfig.config
                        const projectsConfig = await this.$WorkspaceProjectsConfig.config

                        if (!rackConfig?.name) {
                            console.error(chalk.red('\n[t44] ERROR: No project rack configured.'))
                            console.error(chalk.red('  Run t44 init to set up a project rack.\n'))
                            process.exit(1)
                        }

                        if (!homeRegistryConfig?.rootDir) {
                            console.error(chalk.red('\n[t44] ERROR: Home registry not configured.'))
                            console.error(chalk.red('  Run t44 init to set up the home registry.\n'))
                            process.exit(1)
                        }

                        // Resolve project name to DID via projects.json catalog
                        const rackBaseDir = join(
                            homeRegistryConfig.rootDir,
                            '@stream44.studio~t44~structs~ProjectRack',
                            rackConfig.name,
                            '@stream44.studio~t44~caps~ProjectRepository'
                        )
                        const catalogPath = join(rackBaseDir, 'projects.json')
                        let catalog: Record<string, string> = {}
                        try {
                            const { readFile: readFileAsync } = await import('fs/promises')
                            const catalogContent = await readFileAsync(catalogPath, 'utf-8')
                            catalog = JSON.parse(catalogContent)
                        } catch {
                            // No catalog file yet
                        }

                        const projectDid = catalog[projectName]
                        if (!projectDid) {
                            console.log(chalk.yellow(`\n   ⚠ Project '${projectName}' not found in project rack '${rackConfig.name}' — skipping`))
                            console.log(chalk.gray(`     The project rack catalog does not contain '${projectName}'.`))
                            console.log(chalk.gray(`     Use 't44 push' from a workspace that has the project to add it to the rack.\n`))
                            return
                        }

                        const rackRepoDir = join(rackBaseDir, projectDid)

                        // Check if the project repo exists in the home registry
                        let rackRepoExists = false
                        try {
                            await access(rackRepoDir)
                            rackRepoExists = true
                        } catch {
                            // Repo doesn't exist in rack
                        }

                        if (!rackRepoExists) {
                            console.log(chalk.yellow(`\n   ⚠ Project '${projectName}' (DID: ${projectDid}) not found in rack repo — skipping`))
                            console.log(chalk.gray(`     Expected repo at: ${rackRepoDir}`))
                            console.log(chalk.gray(`     Use 't44 push' from a workspace that has the project to add it to the rack.\n`))
                            return
                        }

                        // Check if project already exists in this workspace
                        const existingProject = projectsConfig?.projects?.[projectName]
                        const workspaceRootDir = this.WorkspaceConfig.workspaceRootDir

                        if (existingProject) {
                            // Project exists — pull changes from rack repo
                            const sourceDir = existingProject.sourceDir
                            console.log(chalk.cyan(`\n[t44] Pulling changes for '${projectName}' from project rack...\n`))

                            // Pull from the rack repo
                            const result = await $`git pull ${rackRepoDir} main`.cwd(sourceDir).nothrow()
                            if (result.exitCode !== 0) {
                                // Try without branch name for repos that might use different default
                                const result2 = await $`git pull ${rackRepoDir}`.cwd(sourceDir).nothrow()
                                if (result2.exitCode !== 0) {
                                    console.error(chalk.red(`\n[t44] ERROR: Failed to pull from rack repo.`))
                                    console.error(chalk.red(`  ${result2.stderr.toString()}\n`))
                                    process.exit(1)
                                }
                            }

                            // Sync workspace declarations after pulling changes
                            await this._syncProjectWorkspaces(workspaceRootDir, projectName)

                            console.log(chalk.green(`\n   ✓ Successfully pulled changes for '${projectName}'\n`))
                        } else {
                            // Project doesn't exist — clone from rack repo and add config
                            const targetDir = join(workspaceRootDir, projectName)
                            console.log(chalk.cyan(`\n[t44] Cloning '${projectName}' from project rack...\n`))

                            // Clone from the rack repo
                            const result = await $`git clone ${rackRepoDir} ${targetDir}`.nothrow()
                            if (result.exitCode !== 0) {
                                console.error(chalk.red(`\n[t44] ERROR: Failed to clone from rack repo.`))
                                console.error(chalk.red(`  ${result.stderr.toString()}\n`))
                                process.exit(1)
                            }

                            // Get git info for the cloned repo
                            const firstCommitResult = await $`git rev-list --max-parents=0 HEAD`.cwd(targetDir).quiet().nothrow()
                            const firstCommitHash = firstCommitResult.stdout.toString().trim().split('\n')[0] || ''

                            let firstCommitAuthor = { name: '', email: '' }
                            let createdAt = new Date().toISOString()
                            if (firstCommitHash) {
                                const authorResult = await $`git log ${firstCommitHash} --format=%an`.cwd(targetDir).quiet().nothrow()
                                const emailResult = await $`git log ${firstCommitHash} --format=%ae`.cwd(targetDir).quiet().nothrow()
                                const dateResult = await $`git log ${firstCommitHash} --format=%aI`.cwd(targetDir).quiet().nothrow()
                                firstCommitAuthor = {
                                    name: authorResult.stdout.toString().trim(),
                                    email: emailResult.stdout.toString().trim()
                                }
                                createdAt = dateResult.stdout.toString().trim() || createdAt
                            }

                            // Add project config to workspace
                            const projectConfig = {
                                sourceDir: targetDir,
                                git: {
                                    firstCommitHash,
                                    createdAt,
                                    firstCommitAuthor,
                                    remotes: {
                                        '@stream44.studio/t44/caps/ProjectRack': rackRepoDir
                                    }
                                }
                            }

                            await this.$WorkspaceProjectsConfig.setConfigValue(['projects', projectName], projectConfig)

                            // Sync workspace declarations to root workspace files
                            await this._syncProjectWorkspaces(workspaceRootDir, projectName)

                            console.log(chalk.green(`   ✓ Cloned '${projectName}' to ${targetDir}`))
                            console.log(chalk.green(`   ✓ Added project configuration to workspace\n`))
                        }
                    }
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const { projectNameOrUrl } = args

                        // If no argument provided, pull all known projects in the workspace
                        if (!projectNameOrUrl) {
                            const projectsConfig = await this.$WorkspaceProjectsConfig.config
                            const projects = projectsConfig?.projects || {}
                            const projectNames = Object.keys(projects)

                            if (projectNames.length === 0) {
                                console.log(chalk.yellow('\n[t44] No projects configured in workspace.\n'))
                                return
                            }

                            console.log(chalk.cyan(`\n[t44] Pulling all ${projectNames.length} workspace projects...\n`))

                            const visitedProjects = new Set<string>()
                            for (const projectName of projectNames) {
                                await this._pullWithDeps(projectName, visitedProjects)
                            }

                            // Run bun install after all projects have been pulled
                            const workspaceRootDir = this.WorkspaceConfig.workspaceRootDir
                            console.log(chalk.cyan('\n[t44] Installing dependencies...\n'))
                            const installResult = await $`bun install`.cwd(workspaceRootDir).nothrow()
                            if (installResult.exitCode !== 0) {
                                console.error(chalk.red('\n[t44] WARNING: bun install failed.'))
                                console.error(chalk.red(`  ${installResult.stderr.toString()}\n`))
                            } else {
                                console.log(chalk.green('   ✓ Dependencies installed\n'))
                            }
                            return
                        }

                        // Check if this is a project name in the rack (not a URL)
                        const isUrl = projectNameOrUrl.startsWith('http://') || projectNameOrUrl.startsWith('https://')

                        // For non-URL inputs, pull from rack with recursive dependency resolution
                        if (!isUrl) {
                            await this._pullWithDeps(projectNameOrUrl)

                            // Run bun install after all projects and deps have been pulled
                            const workspaceRootDir = this.WorkspaceConfig.workspaceRootDir
                            console.log(chalk.cyan('\n[t44] Installing dependencies...\n'))
                            const installResult = await $`bun install`.cwd(workspaceRootDir).nothrow()
                            if (installResult.exitCode !== 0) {
                                console.error(chalk.red('\n[t44] WARNING: bun install failed.'))
                                console.error(chalk.red(`  ${installResult.stderr.toString()}\n`))
                            } else {
                                console.log(chalk.green('   ✓ Dependencies installed\n'))
                            }
                            return
                        }

                        // It's a URL — proceed with URL-based pulling
                        const url = projectNameOrUrl

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

                        // ── Load pulling config ──────────────────────────────
                        const pullingConfig = await this.$WorkspacePulling.config

                        const globalProviders: any[] = Array.isArray(pullingConfig?.providers)
                            ? pullingConfig.providers
                            : []

                        if (globalProviders.length === 0) {
                            console.error(this.lib.chalk.red('\n[t44] ERROR: No pulling providers configured.'))
                            console.error(this.lib.chalk.red('  Add providers under "#@stream44.studio/t44/structs/ProjectPullingConfig" in workspace.yaml\n'))
                            process.exit(1)
                        }

                        // ── STEP 1: parseUrl — ask each provider to parse the URL ──
                        console.log(`\n[t44] Parsing URL: ${this.lib.chalk.cyan(url)}\n`)

                        let parsedUrl: any = null
                        let matchedProviderConfig: any = null

                        for (const providerConfig of globalProviders) {
                            if (providerConfig.enabled === false) continue

                            const provider = await getProvider(providerConfig.capsule)
                            if (typeof provider.parseUrl !== 'function') continue

                            const result = await provider.parseUrl({ config: providerConfig, url })
                            if (result) {
                                parsedUrl = result
                                matchedProviderConfig = providerConfig
                                console.log(this.lib.chalk.green(`   ✓ URL parsed by '${providerConfig.capsule}'`))
                                console.log(this.lib.chalk.gray(`     owner: ${result.owner}, repo: ${result.repo}, branch: ${result.branch}${result.commit ? `, commit: ${result.commit.slice(0, 8)}` : ''}\n`))
                                break
                            }
                        }

                        if (!parsedUrl || !matchedProviderConfig) {
                            console.error(this.lib.chalk.red('\n[t44] ERROR: No pull provider could parse the URL.'))
                            console.error(this.lib.chalk.red(`  URL: ${url}`))
                            console.error(this.lib.chalk.red(`  Configured providers:`))
                            for (const p of globalProviders) {
                                console.error(this.lib.chalk.red(`    - ${p.capsule} (enabled: ${p.enabled !== false})`))
                            }
                            console.error(this.lib.chalk.red(`\n  Make sure a provider for this URL type is configured.\n`))
                            process.exit(1)
                        }

                        // ── STEP 2: Find matching publishing repository ──────
                        const publishingConfig = await this.$WorkspaceRepositories.config

                        if (!publishingConfig?.repositories) {
                            console.error(this.lib.chalk.red('\n[t44] ERROR: No publishing repositories configured.'))
                            console.error(this.lib.chalk.red('  Cannot match URL to a local project without publishing config.\n'))
                            process.exit(1)
                        }

                        let matchedRepoName: string | null = null
                        let matchedRepoConfig: any = null

                        for (const [repoName, repoConfig] of Object.entries(publishingConfig.repositories)) {
                            const typedConfig = repoConfig as any
                            const providers: any[] = Array.isArray(typedConfig.providers) ? typedConfig.providers : []

                            for (const provider of providers) {
                                // Match against GitHub publishing provider config
                                if (provider.capsule === '@stream44.studio/t44-github.com/caps/ProjectPublishing') {
                                    const settings = provider.config?.RepositorySettings
                                    if (settings?.owner === parsedUrl.owner && settings?.repo === parsedUrl.repo) {
                                        matchedRepoName = repoName
                                        matchedRepoConfig = typedConfig
                                        break
                                    }
                                }
                            }
                            if (matchedRepoName) break
                        }

                        if (!matchedRepoName || !matchedRepoConfig) {
                            console.error(this.lib.chalk.red(`\n[t44] ERROR: No matching publishing repository found for ${parsedUrl.owner}/${parsedUrl.repo}.`))
                            console.error(this.lib.chalk.red(`  The URL points to '${parsedUrl.owner}/${parsedUrl.repo}' but no repository in`))
                            console.error(this.lib.chalk.red(`  "#@stream44.studio/t44/structs/ProjectPublishingConfig" has a GitHub provider with matching owner/repo.`))
                            console.error(this.lib.chalk.red(`\n  Configured repositories:`))
                            for (const rn of Object.keys(publishingConfig.repositories)) {
                                console.error(this.lib.chalk.red(`    - ${rn}`))
                            }
                            console.error('')
                            process.exit(1)
                        }

                        const sourceDir = this.lib.path.resolve(matchedRepoConfig.sourceDir)
                        console.log(this.lib.chalk.green(`   ✓ Matched repository: '${matchedRepoName}'`))
                        console.log(this.lib.chalk.gray(`     sourceDir: ${sourceDir}\n`))

                        // ── STEP 3: prepare — ensure sourceDir has no uncommitted changes ──
                        console.log('[t44] Preparing: checking for uncommitted changes ...\n')

                        const statusResult = await this.lib.$`git status --porcelain`.cwd(sourceDir).quiet().nothrow()
                        const statusOutput = statusResult.text().trim()

                        if (statusOutput.length > 0) {
                            console.error(this.lib.chalk.red(`\n[t44] ERROR: sourceDir has uncommitted changes. Commit or stash them first.`))
                            console.error(this.lib.chalk.red(`  sourceDir: ${sourceDir}`))
                            console.error(this.lib.chalk.red(`  Changes:\n`))
                            for (const line of statusOutput.split('\n').slice(0, 20)) {
                                console.error(this.lib.chalk.red(`    ${line}`))
                            }
                            if (statusOutput.split('\n').length > 20) {
                                console.error(this.lib.chalk.red(`    ... and ${statusOutput.split('\n').length - 20} more`))
                            }
                            console.error('')
                            process.exit(1)
                        }

                        console.log(this.lib.chalk.green(`   ✓ sourceDir is clean\n`))

                        // ── STEP 4: Set up mirror repo ───────────────────────
                        // Reuse the publishing stage repo as a fast clone source if it exists.
                        // The mirror lives in its own ProjectPulling projection dir.

                        const pullingApi = {
                            getProjectionDir: (capsuleName: string) => this.lib.path.join(
                                this.WorkspaceConfig.workspaceRootDir,
                                '.~o/workspace.foundation/@stream44.studio~t44~caps~ProjectPulling',
                                capsuleName.replace(/\//g, '~')
                            ),
                        }

                        const ctx = {
                            parsedUrl,
                            matchedRepoName,
                            matchedRepoConfig,
                            sourceDir,
                            publishingConfig,
                            pullingApi,
                            metadata: {} as Record<string, any>,
                        }

                        // ── STEP 5: Call provider prepare + pull ─────────────
                        const provider = await getProvider(matchedProviderConfig.capsule)

                        if (typeof provider.prepare === 'function') {
                            console.log('[t44] Preparing mirror repository ...\n')
                            await provider.prepare({ config: matchedProviderConfig, ctx })
                        }

                        if (typeof provider.pull !== 'function') {
                            console.error(this.lib.chalk.red(`\n[t44] ERROR: Provider '${matchedProviderConfig.capsule}' does not implement 'pull'.`))
                            process.exit(1)
                        }

                        console.log('[t44] Pulling changes ...\n')
                        await provider.pull({ config: matchedProviderConfig, ctx })

                        console.log(this.lib.chalk.green('\n[t44] Pull complete!'))
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
capsule['#'] = '@stream44.studio/t44/caps/ProjectPulling'
