type TestTarget = {
    label: string
    type: 'project' | 'package'
    projectName: string
    packageName?: string
    dir: string
    script: string | null
    pkgJsonPath: string
}

type RunnableTarget = TestTarget & { script: string }

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
            '#@stream44.studio/t44/structs/ProjectPublishingConfig': {
                as: '$WorkspaceRepositories'
            },
            '#@stream44.studio/t44/structs/WorkspaceMappingsConfig': {
                as: '$WorkspaceMappings'
            },
            '#': {
                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceLib'
                },
                helpers: {
                    type: CapsulePropertyTypes.GetterFunction,
                    memoize: true,
                    value: function (this: any) {
                        const lib = this.lib

                        // Walk up from a path to find the nearest known target directory
                        async function findNearestTarget(selectorPath: string, allTargets: TestTarget[]): Promise<{ target: TestTarget, resolvedSelector: string } | null> {
                            let current = lib.path.resolve(selectorPath)
                            // Try to stat the path - if it's a file, start from its directory
                            try {
                                const s = await lib.fs.stat(current)
                                if (!s.isDirectory()) {
                                    current = lib.path.dirname(current)
                                }
                            } catch {
                                // Path doesn't exist, try dirname in case it's a file reference
                            }

                            const maxDepth = 20
                            for (let i = 0; i < maxDepth; i++) {
                                for (const t of allTargets) {
                                    const resolvedDir = lib.path.resolve(t.dir)
                                    if (resolvedDir === current) {
                                        return { target: t, resolvedSelector: lib.path.resolve(selectorPath) }
                                    }
                                }
                                const parent = lib.path.dirname(current)
                                if (parent === current) break
                                current = parent
                            }
                            return null
                        }

                        return { findNearestTarget }
                    }
                },
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceConfig'
                },
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceProjects'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt'
                },
                ProjectRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectRepository'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const { projectSelector, parallel, timeout: timeoutStr, linux } = args
                        const timeoutSeconds = timeoutStr ? parseInt(timeoutStr, 10) : 0

                        const projects = await this.WorkspaceProjects.list

                        // ── Discover all packages across projects ──────────────
                        const allTargets: TestTarget[] = []

                        for (const [projectName, projectInfo] of Object.entries(projects)) {
                            const sourceDir = (projectInfo as any).sourceDir
                            if (!sourceDir) continue

                            const projectPkgPath = this.lib.path.join(sourceDir, 'package.json')
                            try {
                                await this.lib.fs.access(projectPkgPath, this.lib.fs.F_OK)
                                const pkgContent = await this.lib.fs.readFile(projectPkgPath, 'utf-8')
                                const pkg = JSON.parse(pkgContent)
                                allTargets.push({
                                    label: projectName,
                                    type: 'project',
                                    projectName,
                                    dir: sourceDir,
                                    script: pkg.scripts?.test || null,
                                    pkgJsonPath: projectPkgPath
                                })
                            } catch { }

                            const packagesDir = this.lib.path.join(sourceDir, 'packages')
                            try {
                                await this.lib.fs.access(packagesDir, this.lib.fs.F_OK)
                                const packageEntries = await this.lib.fs.readdir(packagesDir, { withFileTypes: true })
                                for (const entry of packageEntries) {
                                    if (!entry.isDirectory()) continue
                                    const pkgDir = this.lib.path.join(packagesDir, entry.name)
                                    const pkgJsonPath = this.lib.path.join(pkgDir, 'package.json')
                                    try {
                                        await this.lib.fs.access(pkgJsonPath, this.lib.fs.F_OK)
                                        const pkgContent = await this.lib.fs.readFile(pkgJsonPath, 'utf-8')
                                        const pkg = JSON.parse(pkgContent)
                                        allTargets.push({
                                            label: `${projectName}/packages/${entry.name}`,
                                            type: 'package',
                                            projectName,
                                            packageName: entry.name,
                                            dir: pkgDir,
                                            script: pkg.scripts?.test || null,
                                            pkgJsonPath
                                        })
                                    } catch { }
                                }
                            } catch { }
                        }

                        allTargets.sort((a, b) => a.label.localeCompare(b.label))

                        // ── Resolve selector ───────────────────────────────────
                        let matchedTargets: TestTarget[]
                        // If the selector points deeper than the matched target dir,
                        // we pass that subdirectory as the cwd to bun run test
                        let selectorSubdir: string | null = null

                        if (projectSelector) {
                            const resolvedSelector = this.lib.path.resolve(process.cwd(), projectSelector)

                            // First try name-based matching
                            matchedTargets = allTargets.filter(t => {
                                if (t.label === projectSelector ||
                                    t.label.startsWith(projectSelector) ||
                                    t.projectName === projectSelector ||
                                    t.packageName === projectSelector) {
                                    return true
                                }
                                const resolvedDir = this.lib.path.resolve(t.dir)
                                if (resolvedDir === resolvedSelector || resolvedDir.startsWith(resolvedSelector + '/')) {
                                    return true
                                }
                                return false
                            })

                            // If no name match, try path-based walk-up
                            if (matchedTargets.length === 0) {
                                const found = await this.helpers.findNearestTarget(resolvedSelector, allTargets)
                                if (found) {
                                    matchedTargets = [found.target]
                                    // Check if selector points to a subdir of the target
                                    const targetDir = this.lib.path.resolve(found.target.dir)
                                    if (found.resolvedSelector !== targetDir && found.resolvedSelector.startsWith(targetDir + '/')) {
                                        // Check if the subdir itself has a package.json with a test script
                                        // Walk down from target dir to resolved selector to find the deepest dir with package.json
                                        let checkDir = found.resolvedSelector
                                        try {
                                            const s = await this.lib.fs.stat(checkDir)
                                            if (!s.isDirectory()) checkDir = this.lib.path.dirname(checkDir)
                                        } catch {
                                            checkDir = this.lib.path.dirname(checkDir)
                                        }
                                        // Find deepest directory between target and selector that has a package.json with test script
                                        let deepestTestDir: string | null = null
                                        let walkDir = checkDir
                                        while (walkDir !== targetDir && walkDir.startsWith(targetDir + '/')) {
                                            const walkPkgPath = this.lib.path.join(walkDir, 'package.json')
                                            try {
                                                await this.lib.fs.access(walkPkgPath, this.lib.fs.F_OK)
                                                const pkgContent = await this.lib.fs.readFile(walkPkgPath, 'utf-8')
                                                const pkg = JSON.parse(pkgContent)
                                                if (pkg.scripts?.test) {
                                                    deepestTestDir = walkDir
                                                    break
                                                }
                                            } catch { }
                                            walkDir = this.lib.path.dirname(walkDir)
                                        }
                                        if (deepestTestDir) {
                                            selectorSubdir = deepestTestDir
                                        }
                                    }
                                }
                            } else {
                                // Even for name/path matches, check if selector is deeper
                                if (matchedTargets.length === 1) {
                                    const targetDir = this.lib.path.resolve(matchedTargets[0].dir)
                                    if (resolvedSelector !== targetDir && resolvedSelector.startsWith(targetDir + '/')) {
                                        let checkDir = resolvedSelector
                                        try {
                                            const s = await this.lib.fs.stat(checkDir)
                                            if (!s.isDirectory()) checkDir = this.lib.path.dirname(checkDir)
                                        } catch {
                                            checkDir = this.lib.path.dirname(checkDir)
                                        }
                                        let walkDir = checkDir
                                        while (walkDir !== targetDir && walkDir.startsWith(targetDir + '/')) {
                                            const walkPkgPath = this.lib.path.join(walkDir, 'package.json')
                                            try {
                                                await this.lib.fs.access(walkPkgPath, this.lib.fs.F_OK)
                                                const pkgContent = await this.lib.fs.readFile(walkPkgPath, 'utf-8')
                                                const pkg = JSON.parse(pkgContent)
                                                if (pkg.scripts?.test) {
                                                    selectorSubdir = walkDir
                                                    break
                                                }
                                            } catch { }
                                            walkDir = this.lib.path.dirname(walkDir)
                                        }
                                    }
                                }
                            }

                            if (matchedTargets.length === 0) {
                                const withTests = allTargets.filter(t => t.script)
                                console.log(this.lib.chalk.red(`\nNo project found matching '${projectSelector}'.\n`))
                                if (withTests.length > 0) {
                                    console.log(this.lib.chalk.gray('Available targets with test scripts:'))
                                    for (const t of withTests) {
                                        const typeTag = t.type === 'project'
                                            ? this.lib.chalk.cyan('[project]')
                                            : this.lib.chalk.magenta('[package]')
                                        console.log(this.lib.chalk.gray(`  - ${t.label} ${typeTag}`))
                                    }
                                    console.log('')
                                }
                                return
                            }
                        } else {
                            matchedTargets = allTargets
                        }

                        // Warn about matched targets that lack a test script
                        for (const t of matchedTargets) {
                            if (!t.script) {
                                console.log(this.lib.chalk.yellow(`⚠ No "test" script in ${t.pkgJsonPath} — skipping`))
                            }
                        }

                        const selectedTargets = matchedTargets.filter(t => t.script) as RunnableTarget[]

                        if (selectedTargets.length === 0) {
                            console.log(this.lib.chalk.yellow('\nNo matched projects or packages with a "test" script found.\n'))
                            return
                        }

                        // ── Linux VM staging ─────────────────────────────────
                        // Maps target label -> linux stage dir (only populated when --linux)
                        const linuxStageDirs = new Map<string, string>()
                        const linuxVmNames = new Set<string>()
                        const linuxVmNamesMap = new Map<string, string>() // target.label -> vmName

                        if (linux) {
                            // Load repositories config to determine which packages have declared repos
                            const repositoriesConfig = await this.$WorkspaceRepositories.config
                            const repositories: Record<string, any> = repositoriesConfig?.repositories || {}

                            // Load npm rename mappings to map public names back to workspace packages
                            const mappingsConfig = await this.$WorkspaceMappings.config
                            const npmRenames: Record<string, string> = mappingsConfig?.mappings?.['@stream44.studio/t44/caps/patterns/ProjectPublishing']?.npm || {}
                            // Build reverse map: publicName -> workspaceName
                            const reverseRenames: Record<string, string> = {}
                            for (const [wsName, pubName] of Object.entries(npmRenames)) {
                                reverseRenames[pubName] = wsName
                            }

                            // Build lookups: sourceDir -> repoName, workspacePkgName -> repoName
                            const sourceDirToRepo = new Map<string, { repoName: string, repoConfig: any }>()
                            const wsPkgNameToRepo = new Map<string, { repoName: string, sourceDir: string }>()
                            for (const [repoName, repoConfig] of Object.entries(repositories)) {
                                const sd = (repoConfig as any).sourceDir
                                if (!sd) continue
                                sourceDirToRepo.set(this.lib.path.resolve(sd), { repoName, repoConfig })
                                // Read workspace package name from source package.json
                                try {
                                    const pkgContent = await this.lib.fs.readFile(this.lib.path.join(sd, 'package.json'), 'utf-8')
                                    const pkg = JSON.parse(pkgContent)
                                    if (pkg.name) {
                                        wsPkgNameToRepo.set(pkg.name, { repoName, sourceDir: sd })
                                        // Also index by public name if renamed
                                        const pubName = npmRenames[pkg.name]
                                        if (pubName) wsPkgNameToRepo.set(pubName, { repoName, sourceDir: sd })
                                    }
                                } catch { }
                            }

                            const workspaceRootDir = this.WorkspaceConfig.workspaceRootDir
                            const linuxBaseDir = this.lib.path.join(
                                workspaceRootDir,
                                '.~o/workspace.foundation/@stream44.studio~t44~caps~ProjectTesting/linux'
                            )

                            // Only process 'package' targets that match a declared ProjectRepository
                            for (const target of selectedTargets) {
                                if (target.type !== 'package') {
                                    console.log(this.lib.chalk.gray(`   --linux: skipping ${target.label} (not a package)`))
                                    continue
                                }

                                const resolvedTargetDir = this.lib.path.resolve(target.dir)
                                const repoEntry = sourceDirToRepo.get(resolvedTargetDir)
                                if (!repoEntry) {
                                    console.log(this.lib.chalk.gray(`   --linux: skipping ${target.label} (no ProjectRepository declared)`))
                                    continue
                                }

                                const { repoName } = repoEntry
                                // Read npm package name from source package.json for directory naming
                                let npmUri = target.packageName || target.label
                                try {
                                    const srcPkg = JSON.parse(await this.lib.fs.readFile(this.lib.path.join(target.dir, 'package.json'), 'utf-8'))
                                    if (srcPkg.name) npmUri = srcPkg.name
                                } catch { }
                                const npmUriNormalized = npmUri.replace(/\//g, '~')
                                const linuxStageDir = this.lib.path.join(linuxBaseDir, npmUriNormalized, 'stage')
                                // Sanitize VM name for OrbStack: strip @, replace ~ and / with -
                                const vmNameSafe = npmUri.replace(/@/g, '').replace(/[\/~]/g, '-')
                                const vmName = `t44-test-${vmNameSafe}`

                                console.log(this.lib.chalk.cyan(`\n🐧 Preparing Linux stage for ${target.label}...\n`))

                                // Run t44 push to prepare fully staged code (renames + workspace:* resolved)
                                console.log(this.lib.chalk.gray(`   Running t44 push ${repoName}...`))
                                await this.self.importCapsule({ uri: '@stream44.studio/t44/caps/ProjectPublishing' }).then(
                                    async ({ api }: any) => api.run({ args: { projectSelector: repoName } })
                                )

                                // Get the prepared repo stage path
                                const repoStagePath = await this.ProjectRepository.getStagePath({ repoUri: repoName })

                                // Clean and recreate linux stage dir, copy prepared stage
                                await this.lib.fs.rm(linuxStageDir, { recursive: true, force: true })
                                await this.lib.fs.mkdir(linuxStageDir, { recursive: true })
                                console.log(this.lib.chalk.gray(`   Copying prepared stage to linux stage dir...`))
                                await this.lib.$`rsync -a --exclude .git ${repoStagePath}/ ${linuxStageDir}/`

                                // Copy .~o/ directories from source (gitignored build artifacts needed by tests)
                                const dotODirs = await this.lib.$`find ${target.dir} -name ".~o" -type d -not -path "*/node_modules/*"`.quiet().nothrow()
                                for (const dotOLine of dotODirs.text().trim().split('\n').filter(Boolean)) {
                                    const relPath = this.lib.path.relative(target.dir, dotOLine)
                                    const destPath = this.lib.path.join(linuxStageDir, relPath)
                                    await this.lib.fs.mkdir(this.lib.path.dirname(destPath), { recursive: true })
                                    await this.lib.$`rsync -a ${dotOLine}/ ${destPath}/`.nothrow()
                                    console.log(this.lib.chalk.gray(`   Copied build artifact ${relPath}`))
                                }

                                // Apply npm renames to .~o/ files (they use workspace names, need public names)
                                if (Object.keys(npmRenames).length > 0) {
                                    const dotODestDirs = await this.lib.$`find ${linuxStageDir} -name ".~o" -type d -not -path "*/node_modules/*"`.quiet().nothrow()
                                    for (const dotODir of dotODestDirs.text().trim().split('\n').filter(Boolean)) {
                                        const tsFiles = await this.lib.$`find ${dotODir} -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx"`.quiet().nothrow()
                                        for (const filePath of tsFiles.text().trim().split('\n').filter(Boolean)) {
                                            let content = await this.lib.fs.readFile(filePath, 'utf-8')
                                            let changed = false
                                            for (const [wsName, pubName] of Object.entries(npmRenames)) {
                                                if (content.includes(wsName)) {
                                                    content = content.split(wsName).join(pubName)
                                                    changed = true
                                                }
                                            }
                                            if (changed) await this.lib.fs.writeFile(filePath, content)
                                        }
                                    }
                                    console.log(this.lib.chalk.gray(`   Applied npm renames to build artifacts`))
                                }

                                // Resolve workspace dependencies transitively from the prepared stage
                                // After t44 push, workspace:* deps are replaced with ^version using public names.
                                // We need to find which of those deps are workspace packages (may not be published
                                // at that version yet) and copy their prepared stages into node_modules/.
                                console.log(this.lib.chalk.gray(`   Resolving workspace dependencies...`))
                                const resolvedDeps = new Map<string, string>() // publicDepName -> repoStagePath
                                const pendingPkgJsons: Array<{ path: string, isRoot: boolean }> = [
                                    { path: this.lib.path.join(linuxStageDir, 'package.json'), isRoot: true }
                                ]

                                // Also collect sub-workspace package.json paths
                                const collectSubWorkspaces = async (baseDir: string, pkgJsonPath: string, isRoot: boolean) => {
                                    try {
                                        const pkg = JSON.parse(await this.lib.fs.readFile(pkgJsonPath, 'utf-8'))
                                        const workspaces: string[] = pkg.workspaces || []
                                        if (workspaces.length > 0) {
                                            const glob = (await import('fast-glob')).default
                                            const patterns = workspaces.map((ws: string) => this.lib.path.join(ws, 'package.json'))
                                            const subPkgPaths = await glob(patterns, { cwd: baseDir, absolute: true, onlyFiles: true })
                                            for (const p of subPkgPaths) pendingPkgJsons.push({ path: p, isRoot })
                                        }
                                    } catch { }
                                }
                                await collectSubWorkspaces(linuxStageDir, this.lib.path.join(linuxStageDir, 'package.json'), true)

                                while (pendingPkgJsons.length > 0) {
                                    const { path: pkgJsonPath, isRoot } = pendingPkgJsons.pop()!
                                    let pkg: any
                                    try {
                                        pkg = JSON.parse(await this.lib.fs.readFile(pkgJsonPath, 'utf-8'))
                                    } catch { continue }

                                    // Root package: follow dependencies + devDependencies (need test deps like @stream44.studio/t44)
                                    // Transitive deps: only follow dependencies (avoid pulling entire t44 ecosystem)
                                    const allDeps = isRoot
                                        ? { ...pkg.dependencies, ...pkg.devDependencies }
                                        : { ...pkg.dependencies }

                                    for (const [depName, depVersion] of Object.entries(allDeps)) {
                                        if (resolvedDeps.has(depName)) continue
                                        // Check if this dep is a workspace package (by public or workspace name)
                                        const depRepoInfo = wsPkgNameToRepo.get(depName)
                                        if (!depRepoInfo) continue

                                        const { repoName: depRepoName, sourceDir: depSourceDir } = depRepoInfo

                                        // Run t44 push for this dependency to prepare its stage
                                        console.log(this.lib.chalk.gray(`   Running t44 push ${depRepoName} (dep: ${depName})...`))
                                        await this.self.importCapsule({ uri: '@stream44.studio/t44/caps/ProjectPublishing' }).then(
                                            async ({ api }: any) => api.run({ args: { projectSelector: depRepoName } })
                                        )

                                        const depRepoStagePath = await this.ProjectRepository.getStagePath({ repoUri: depRepoName })
                                        resolvedDeps.set(depName, depRepoStagePath)

                                        // Copy prepared dep stage to _ws_deps/<depName>
                                        const depTargetDir = this.lib.path.join(linuxStageDir, '_ws_deps', depName)
                                        await this.lib.fs.mkdir(this.lib.path.dirname(depTargetDir), { recursive: true })
                                        await this.lib.fs.rm(depTargetDir, { recursive: true, force: true })
                                        await this.lib.$`rsync -a --exclude .git ${depRepoStagePath}/ ${depTargetDir}/`

                                        // Queue this dep's package.json (and sub-workspaces) for further resolution
                                        pendingPkgJsons.push({ path: this.lib.path.join(depTargetDir, 'package.json'), isRoot: false })
                                        await collectSubWorkspaces(depTargetDir, this.lib.path.join(depTargetDir, 'package.json'), false)
                                    }
                                }

                                // Rewrite package.json files: replace workspace dep versions with file: references
                                // so bun install uses local copies instead of trying to fetch from npm
                                console.log(this.lib.chalk.gray(`   Rewriting workspace dep references to file: paths...`))
                                const rewriteWorkspaceDeps = async (pkgJsonPath: string) => {
                                    let pkg: any
                                    try {
                                        pkg = JSON.parse(await this.lib.fs.readFile(pkgJsonPath, 'utf-8'))
                                    } catch { return }

                                    let changed = false
                                    for (const depSection of ['dependencies', 'devDependencies', 'optionalDependencies']) {
                                        const deps = pkg[depSection]
                                        if (!deps) continue
                                        for (const [depName, depVersion] of Object.entries(deps)) {
                                            if (!resolvedDeps.has(depName)) continue
                                            const pkgDir = this.lib.path.dirname(pkgJsonPath)
                                            const relPath = this.lib.path.relative(pkgDir, this.lib.path.join(linuxStageDir, '_ws_deps', depName))
                                            deps[depName] = `file:${relPath}`
                                            changed = true
                                        }
                                    }
                                    if (changed) {
                                        await this.lib.fs.writeFile(pkgJsonPath, JSON.stringify(pkg, null, 4) + '\n')
                                    }
                                }

                                // Rewrite root + sub-workspace package.json files
                                const glob = (await import('fast-glob')).default
                                const allPkgJsonsToRewrite = [this.lib.path.join(linuxStageDir, 'package.json')]
                                try {
                                    const rootPkg = JSON.parse(await this.lib.fs.readFile(this.lib.path.join(linuxStageDir, 'package.json'), 'utf-8'))
                                    const workspaces: string[] = rootPkg.workspaces || []
                                    if (workspaces.length > 0) {
                                        const patterns = workspaces.map((ws: string) => this.lib.path.join(ws, 'package.json'))
                                        const subPkgs = await glob(patterns, { cwd: linuxStageDir, absolute: true, onlyFiles: true })
                                        allPkgJsonsToRewrite.push(...subPkgs)
                                    }
                                } catch { }
                                // Also rewrite dep package.json files
                                for (const depName of resolvedDeps.keys()) {
                                    allPkgJsonsToRewrite.push(this.lib.path.join(linuxStageDir, '_ws_deps', depName, 'package.json'))
                                }
                                for (const pkgPath of allPkgJsonsToRewrite) {
                                    await rewriteWorkspaceDeps(pkgPath)
                                }

                                // Remove test files from _ws_deps so bun test doesn't discover them
                                if (resolvedDeps.size > 0) {
                                    const wsDepsDir = this.lib.path.join(linuxStageDir, '_ws_deps')
                                    await this.lib.$`find ${wsDepsDir} -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.test.js" -o -name "*.test.jsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.spec.js" -o -name "*.spec.jsx" | xargs rm -f`.nothrow()
                                }

                                console.log(this.lib.chalk.green(`   ✓ Linux stage ready at ${linuxStageDir}`))
                                console.log(this.lib.chalk.gray(`   ${resolvedDeps.size} workspace dependencies resolved\n`))

                                // ── OrbStack VM lifecycle ────────────────────────
                                console.log(this.lib.chalk.cyan(`   🖥  Preparing OrbStack VM '${vmName}'...\n`))

                                // Check if VM exists
                                const listResult = await this.lib.$`orbctl list`.quiet().nothrow()
                                const vmExists = listResult.text().includes(vmName)

                                if (!vmExists) {
                                    console.log(this.lib.chalk.gray(`   Creating VM '${vmName}'...`))
                                    await this.lib.$`orbctl create ubuntu ${vmName}`
                                } else {
                                    // Start if stopped
                                    const infoResult = await this.lib.$`orbctl info ${vmName}`.quiet().nothrow()
                                    if (infoResult.text().includes('stopped')) {
                                        console.log(this.lib.chalk.gray(`   Starting VM '${vmName}'...`))
                                        await this.lib.$`orbctl start ${vmName}`
                                    }
                                }

                                linuxVmNames.add(vmName)
                                linuxVmNamesMap.set(target.label, vmName)

                                // One-time setup: only install system deps + bun if not already present
                                const bunCheck = await this.lib.$`orb -m ${vmName} bash -c ${"$HOME/.bun/bin/bun --version 2>&1"}`.quiet().nothrow()
                                if (bunCheck.exitCode !== 0) {
                                    console.log(this.lib.chalk.gray(`   Installing system dependencies in VM...`))
                                    await this.lib.$`orb -m ${vmName} bash -c ${"sudo apt-get update -qq && sudo apt-get install -y -qq unzip curl rsync > /dev/null 2>&1"}`.quiet().nothrow()

                                    console.log(this.lib.chalk.gray(`   Installing bun in VM...`))
                                    await this.lib.$`orb -m ${vmName} bash -c ${"curl -fsSL https://bun.sh/install | bash 2>&1"}`.nothrow()

                                    // Verify bun is now installed
                                    const bunVerify = await this.lib.$`orb -m ${vmName} bash -c ${"$HOME/.bun/bin/bun --version 2>&1"}`.quiet().nothrow()
                                    if (bunVerify.exitCode !== 0) {
                                        console.log(this.lib.chalk.red(`   ✗ Failed to install bun in VM '${vmName}'`))
                                        console.log(this.lib.chalk.red(`     ${bunVerify.text().trim()}`))
                                        continue
                                    }
                                    console.log(this.lib.chalk.gray(`   bun ${bunVerify.text().trim()} installed`))
                                } else {
                                    console.log(this.lib.chalk.gray(`   bun ${bunCheck.text().trim()} already installed`))
                                    // Ensure rsync is available (may be missing in older VMs)
                                    await this.lib.$`orb -m ${vmName} bash -c ${"which rsync > /dev/null 2>&1 || (sudo apt-get update -qq && sudo apt-get install -y -qq rsync > /dev/null 2>&1)"}`.quiet().nothrow()
                                }

                                // Copy stage into /opt/t44-test in the VM's native filesystem
                                // Cannot symlink because bun resolves symlinks back to the real macOS path
                                // which contains ~ characters that bun URL-encodes to %7E
                                const vmStageDir = '/opt/t44-test'
                                console.log(this.lib.chalk.gray(`   Copying stage to ${vmStageDir}...`))
                                await this.lib.$`orb -m ${vmName} bash -c ${`sudo rm -rf ${vmStageDir} && sudo mkdir -p ${vmStageDir} && sudo rsync -a --copy-links ${linuxStageDir}/ ${vmStageDir}/ && sudo chown -R $(whoami):$(whoami) ${vmStageDir}`}`.nothrow()

                                // Create .workspace/workspace.yaml so workspace-rt can find a workspace root
                                // Tests using workspace-rt walk up from cwd looking for this file
                                await this.lib.$`orb -m ${vmName} bash -c ${`mkdir -p ${vmStageDir}/.workspace && echo 'extends:\n  - "@stream44.studio/t44/workspace.yaml"' > ${vmStageDir}/.workspace/workspace.yaml`}`.nothrow()

                                // Run bun install in the mounted stage dir
                                console.log(this.lib.chalk.gray(`   Running bun install in VM...`))
                                const installResult = await this.lib.$`orb -m ${vmName} bash -c ${`cd ${vmStageDir} && $HOME/.bun/bin/bun install --no-save 2>&1`}`.nothrow()
                                if (installResult.exitCode !== 0) {
                                    const installOutput = installResult.text()
                                    // Split on \r and \n to properly handle carriage returns in bun output
                                    const lines = installOutput.split(/\r?\n|\r/).filter((l: string) => l.trim())
                                    console.log(this.lib.chalk.yellow(`   ⚠ bun install exited with code ${installResult.exitCode}`))
                                    for (const line of lines.slice(-5)) {
                                        console.log(this.lib.chalk.gray(`     ${line.trim()}`))
                                    }
                                }

                                console.log(this.lib.chalk.green(`   ✓ VM '${vmName}' ready\n`))

                                // Record VM stage dir for this target
                                linuxStageDirs.set(target.label, vmStageDir)
                            }
                        }

                        // ── Output buffering for menu interaction ────────────
                        let outputPaused = false
                        const outputBuffer: Array<{ stream: 'stdout' | 'stderr', data: Uint8Array }> = []

                        const writeOutput = (stream: 'stdout' | 'stderr', data: Uint8Array) => {
                            if (outputPaused) {
                                outputBuffer.push({ stream, data })
                            } else {
                                if (stream === 'stdout') process.stdout.write(data)
                                else process.stderr.write(data)
                            }
                        }

                        const flushOutputBuffer = () => {
                            for (const entry of outputBuffer) {
                                if (entry.stream === 'stdout') process.stdout.write(entry.data)
                                else process.stderr.write(entry.data)
                            }
                            outputBuffer.length = 0
                        }

                        // Pipe a readable stream to our buffered output
                        // Normalizes bare \r (carriage return without \n) to \n so progress
                        // lines from tools like bun render correctly instead of overwriting
                        const pipeToBuffered = (readable: ReadableStream<Uint8Array>, stream: 'stdout' | 'stderr') => {
                            const reader = readable.getReader()
                            const decoder = new TextDecoder()
                            const encoder = new TextEncoder()
                            const pump = async () => {
                                while (true) {
                                    const { done, value } = await reader.read()
                                    if (done) break
                                    // Replace bare \r (not followed by \n) with \n
                                    const text = decoder.decode(value, { stream: true })
                                    const normalized = text.replace(/\r(?!\n)/g, '\n')
                                    writeOutput(stream, encoder.encode(normalized))
                                }
                            }
                            pump().catch(() => { })
                            return reader
                        }

                        // ── Stdin watcher for skip command ─────────────────────
                        const isTTY = process.stdin.isTTY
                        let skipRequested = false
                        let currentProc: ReturnType<typeof Bun.spawn> | null = null
                        // For all modes: map of label -> { proc, startTime }
                        const runningProcs = new Map<string, { proc: ReturnType<typeof Bun.spawn>, startTime: number }>()
                        let stdinBuffer = ''
                        let menuShown = false
                        const promptForSkip = this.WorkspacePrompt

                        let stdinCleanup: (() => void) | null = null

                        const showSkipSelector = async () => {
                            if (menuShown) return
                            if (runningProcs.size === 0) return

                            // Immediately pause output before any async work
                            menuShown = true
                            outputPaused = true

                            // Build choices: "Continue" first (default), then running tests
                            const choices: Array<{ name: string, value: string }> = [
                                { name: this.lib.chalk.green('▶ Continue running tests'), value: '__continue__' }
                            ]
                            for (const [label, info] of runningProcs.entries()) {
                                const elapsed = ((Date.now() - info.startTime) / 1000).toFixed(1)
                                choices.push({
                                    name: `${this.lib.chalk.yellow('⏭')} Skip ${label}  ${this.lib.chalk.gray(`(${elapsed}s)`)}`,
                                    value: label
                                })
                            }

                            // Clear visual separator
                            console.log(this.lib.chalk.gray('\n  ─────────────────────────────────────'))
                            console.log(this.lib.chalk.cyan('  ⏸  Test output paused'))
                            console.log(this.lib.chalk.gray(`  ${runningProcs.size} test(s) running\n`))

                            process.stdin.setRawMode(false)

                            try {
                                const selected = await promptForSkip.select({
                                    message: 'Action:',
                                    choices,
                                    pageSize: 20
                                })
                                if (selected !== '__continue__') {
                                    const entry = runningProcs.get(selected)
                                    if (entry) {
                                        console.log(this.lib.chalk.yellow(`\n  ⏭ Skipping ${selected}...\n`))
                                        entry.proc.kill()
                                        if (currentProc && entry.proc === currentProc) {
                                            skipRequested = true
                                        }
                                    }
                                }
                            } catch {
                                // Cancelled
                            }

                            console.log(this.lib.chalk.gray('  ─────────────────────────────────────\n'))

                            menuShown = false
                            outputPaused = false
                            flushOutputBuffer()
                            if (isTTY) {
                                try { process.stdin.setRawMode(true) } catch { }
                            }
                        }

                        if (isTTY) {
                            process.stdin.setRawMode(true)
                            process.stdin.resume()
                            process.stdin.setEncoding('utf-8')

                            const onData = async (data: string) => {
                                // Ctrl+C
                                if (data === '\x03') {
                                    process.stdin.setRawMode(false)
                                    process.stdin.pause()
                                    process.exit(130)
                                }

                                // While menu is shown, ignore all input
                                if (menuShown) return

                                // Enter key — always open skip selector
                                if (data === '\r' || data === '\n') {
                                    stdinBuffer = ''
                                    await showSkipSelector()
                                } else if (data === '\x7f') {
                                    stdinBuffer = stdinBuffer.slice(0, -1)
                                } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
                                    stdinBuffer += data
                                    // Check for typed commands
                                    const cmd = stdinBuffer.trim().toLowerCase()
                                    if (cmd === 's' || cmd === 'skip') {
                                        stdinBuffer = ''
                                        await showSkipSelector()
                                    }
                                }
                            }

                            process.stdin.on('data', onData)
                            stdinCleanup = () => {
                                process.stdin.removeListener('data', onData)
                                if (isTTY) {
                                    try { process.stdin.setRawMode(false) } catch { }
                                }
                                process.stdin.pause()
                            }
                        }

                        // ── Spawn helper: local or Linux VM ──────────────────
                        const spawnTestProcess = (target: RunnableTarget, testCwd: string) => {
                            const linuxStageDir = linuxStageDirs.get(target.label)
                            if (linux && linuxStageDir) {
                                const vmName = linuxVmNamesMap.get(target.label) || `t44-test-${target.packageName || target.label}`
                                const cmd = `cd ${linuxStageDir} && $HOME/.bun/bin/bun run test`
                                return Bun.spawn(['orb', '-m', vmName, 'bash', '-c', cmd], {
                                    stdin: 'pipe',
                                    stdout: 'pipe',
                                    stderr: 'pipe'
                                })
                            }
                            return Bun.spawn(['bun', 'run', 'test'], {
                                cwd: testCwd,
                                stdin: 'pipe',
                                stdout: 'pipe',
                                stderr: 'pipe'
                            })
                        }

                        // ── Run a single test (sequential) ───────────────────
                        const runTest = async (target: RunnableTarget): Promise<number> => {
                            const typeTag = target.type === 'project'
                                ? this.lib.chalk.cyan('[project]')
                                : this.lib.chalk.magenta('[package]')

                            // Determine the cwd: use selectorSubdir if it applies to this target
                            let testCwd = target.dir
                            if (selectorSubdir && selectedTargets.length === 1) {
                                testCwd = selectorSubdir
                            }

                            const linuxStageDir = linuxStageDirs.get(target.label)
                            const modeTag = linux && linuxStageDir ? ' ' + this.lib.chalk.blue('[linux]') : ''

                            console.log(this.lib.chalk.green(`\n=> Running tests for ${target.label} ${typeTag}${modeTag}\n`))
                            console.log(this.lib.chalk.gray(`   Directory: ${linuxStageDir || testCwd}`))
                            console.log(this.lib.chalk.gray(`   Script:    ${target.script}\n`))

                            skipRequested = false

                            const proc = spawnTestProcess(target, testCwd)
                            proc.stdin.end()

                            currentProc = proc
                            const startTime = Date.now()
                            runningProcs.set(target.label, { proc, startTime })

                            // Pipe through our buffered output
                            pipeToBuffered(proc.stdout, 'stdout')
                            pipeToBuffered(proc.stderr, 'stderr')

                            let timedOut = false
                            let timer: ReturnType<typeof setTimeout> | null = null

                            if (timeoutSeconds > 0) {
                                timer = setTimeout(() => {
                                    timedOut = true
                                    console.log(this.lib.chalk.yellow(`\n⏱ Timeout (${timeoutSeconds}s) reached for ${target.label} — killing...\n`))
                                    proc.kill()
                                }, timeoutSeconds * 1000)
                            }

                            const exitCode = await proc.exited

                            if (timer) clearTimeout(timer)
                            currentProc = null
                            runningProcs.delete(target.label)

                            if (timedOut) {
                                console.log(this.lib.chalk.yellow(`\n⏱ Tests timed out for ${target.label}\n`))
                                return 124 // standard timeout exit code
                            } else if (skipRequested) {
                                console.log(this.lib.chalk.yellow(`\n⏭ Tests skipped for ${target.label}\n`))
                                return 0
                            } else if (exitCode !== 0) {
                                console.log(this.lib.chalk.red(`\n✗ Tests failed for ${target.label} (exit code ${exitCode})\n`))
                            } else {
                                console.log(this.lib.chalk.green(`\n✓ Tests passed for ${target.label}\n`))
                            }
                            return exitCode
                        }

                        // ── Run a single test (parallel) ─────────────────────
                        const runTestParallel = async (target: RunnableTarget): Promise<number> => {
                            const typeTag = target.type === 'project'
                                ? this.lib.chalk.cyan('[project]')
                                : this.lib.chalk.magenta('[package]')

                            let testCwd = target.dir
                            if (selectorSubdir && selectedTargets.length === 1) {
                                testCwd = selectorSubdir
                            }

                            const linuxStageDir = linuxStageDirs.get(target.label)
                            const modeTag = linux && linuxStageDir ? ' ' + this.lib.chalk.blue('[linux]') : ''

                            console.log(this.lib.chalk.green(`\n=> Running tests for ${target.label} ${typeTag}${modeTag}\n`))
                            console.log(this.lib.chalk.gray(`   Directory: ${linuxStageDir || testCwd}\n`))

                            const proc = spawnTestProcess(target, testCwd)
                            proc.stdin.end()

                            const startTime = Date.now()
                            runningProcs.set(target.label, { proc, startTime })

                            // Pipe through our buffered output
                            pipeToBuffered(proc.stdout, 'stdout')
                            pipeToBuffered(proc.stderr, 'stderr')

                            let timedOut = false
                            let timer: ReturnType<typeof setTimeout> | null = null

                            if (timeoutSeconds > 0) {
                                timer = setTimeout(() => {
                                    timedOut = true
                                    console.log(this.lib.chalk.yellow(`\n⏱ Timeout (${timeoutSeconds}s) reached for ${target.label} — killing...\n`))
                                    proc.kill()
                                }, timeoutSeconds * 1000)
                            }

                            const exitCode = await proc.exited

                            if (timer) clearTimeout(timer)
                            runningProcs.delete(target.label)

                            if (timedOut) {
                                console.log(this.lib.chalk.yellow(`\n⏱ Tests timed out for ${target.label}\n`))
                                return 124
                            } else if (exitCode !== 0 && exitCode !== null) {
                                console.log(this.lib.chalk.red(`\n✗ Tests failed for ${target.label} (exit code ${exitCode})\n`))
                            } else {
                                console.log(this.lib.chalk.green(`\n✓ Tests passed for ${target.label}\n`))
                            }
                            return exitCode ?? 1
                        }

                        try {
                            if (parallel) {
                                console.log(this.lib.chalk.cyan(`\nRunning tests for ${selectedTargets.length} target(s) in parallel...\n`))
                                const results = await Promise.all(selectedTargets.map(runTestParallel))
                                const failed = results.filter(c => c !== 0).length
                                if (failed > 0) {
                                    console.log(this.lib.chalk.red(`\n${failed} of ${selectedTargets.length} target(s) failed.\n`))
                                } else {
                                    console.log(this.lib.chalk.green(`\nAll ${selectedTargets.length} target(s) passed.\n`))
                                }
                            } else {
                                let failed = 0
                                for (const target of selectedTargets) {
                                    const exitCode = await runTest(target)
                                    if (exitCode !== 0) failed++
                                }
                                if (selectedTargets.length > 1) {
                                    if (failed > 0) {
                                        console.log(this.lib.chalk.red(`\n${failed} of ${selectedTargets.length} target(s) failed.\n`))
                                    } else {
                                        console.log(this.lib.chalk.green(`\nAll ${selectedTargets.length} target(s) passed.\n`))
                                    }
                                }
                            }
                        } finally {
                            if (stdinCleanup) stdinCleanup()

                            // Stop Linux VMs after tests
                            if (linux && linuxVmNames.size > 0) {
                                for (const vmName of linuxVmNames) {
                                    console.log(this.lib.chalk.gray(`\n   Stopping VM '${vmName}'...`))
                                    await this.lib.$`orbctl stop ${vmName}`.quiet().nothrow()
                                }
                                console.log(this.lib.chalk.gray(`   VMs stopped.\n`))
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
capsule['#'] = '@stream44.studio/t44/caps/ProjectTesting'
