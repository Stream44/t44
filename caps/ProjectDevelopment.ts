
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
            '#': {
                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceLib'
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
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const { projectSelector } = args

                        const projects = await this.WorkspaceProjects.list

                        // Discover all dev scripts across projects and their packages
                        const devTargets: Array<{
                            label: string
                            type: 'project' | 'package'
                            projectName: string
                            packageName?: string
                            dir: string
                            script: string
                        }> = []

                        for (const [projectName, projectInfo] of Object.entries(projects)) {
                            const sourceDir = (projectInfo as any).sourceDir
                            if (!sourceDir) continue

                            // Check project root for dev script
                            const projectPkgPath = this.lib.path.join(sourceDir, 'package.json')
                            try {
                                await this.lib.fs.access(projectPkgPath, this.lib.fs.F_OK)
                                const pkgContent = await this.lib.fs.readFile(projectPkgPath, 'utf-8')
                                const pkg = JSON.parse(pkgContent)
                                if (pkg.scripts?.dev) {
                                    devTargets.push({
                                        label: projectName,
                                        type: 'project',
                                        projectName,
                                        dir: sourceDir,
                                        script: pkg.scripts.dev
                                    })
                                }
                            } catch { }

                            // Check packages/* for dev scripts
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
                                        if (pkg.scripts?.dev) {
                                            devTargets.push({
                                                label: `${projectName}/packages/${entry.name}`,
                                                type: 'package',
                                                projectName,
                                                packageName: entry.name,
                                                dir: pkgDir,
                                                script: pkg.scripts.dev
                                            })
                                        }
                                    } catch { }
                                }
                            } catch { }
                        }

                        if (devTargets.length === 0) {
                            console.log(this.lib.chalk.yellow('\nNo projects or packages with a "dev" script found.\n'))
                            return
                        }

                        // Sort alphabetically by label
                        devTargets.sort((a, b) => a.label.localeCompare(b.label))

                        let selectedTarget: typeof devTargets[0]

                        if (projectSelector) {
                            // Match by project name, package path, package name, or resolved path
                            const resolvedSelector = this.lib.path.resolve(process.cwd(), projectSelector)

                            const matches = devTargets.filter(t => {
                                // Name-based matching
                                if (t.label === projectSelector ||
                                    t.label.startsWith(projectSelector) ||
                                    t.projectName === projectSelector ||
                                    t.packageName === projectSelector) {
                                    return true
                                }
                                // Path-based matching: resolved selector matches or contains the target dir
                                const resolvedDir = this.lib.path.resolve(t.dir)
                                if (resolvedDir === resolvedSelector || resolvedDir.startsWith(resolvedSelector + '/')) {
                                    return true
                                }
                                return false
                            })

                            if (matches.length === 0) {
                                console.log(this.lib.chalk.red(`\nNo dev script found matching '${projectSelector}'.\n`))
                                console.log(this.lib.chalk.gray('Available targets:'))
                                for (const t of devTargets) {
                                    const typeTag = t.type === 'project'
                                        ? this.lib.chalk.cyan('[project]')
                                        : this.lib.chalk.magenta('[package]')
                                    console.log(this.lib.chalk.gray(`  - ${t.label} ${typeTag}`))
                                }
                                console.log('')
                                return
                            }

                            if (matches.length > 1) {
                                // Prefer exact match over substring matches
                                const exactMatch = matches.find(t =>
                                    t.label === projectSelector ||
                                    t.projectName === projectSelector ||
                                    t.packageName === projectSelector
                                )
                                if (exactMatch) {
                                    matches.length = 0
                                    matches.push(exactMatch)
                                } else {
                                    console.log(this.lib.chalk.red(`\nMultiple dev targets match '${projectSelector}':\n`))
                                    for (const m of matches) {
                                        console.log(this.lib.chalk.gray(`  - ${m.label}`))
                                    }
                                    console.log(this.lib.chalk.red('\nPlease be more specific.\n'))
                                    return
                                }
                            }

                            selectedTarget = matches[0]
                        } else {
                            // Interactive picker
                            console.log(this.lib.chalk.cyan('\nSelect a dev server to run:\n'))

                            const choices: Array<{ name: string; value: number }> = []

                            for (let i = 0; i < devTargets.length; i++) {
                                const t = devTargets[i]
                                const typeTag = t.type === 'project'
                                    ? this.lib.chalk.cyan('[project]')
                                    : this.lib.chalk.magenta('[package]')
                                const scriptPreview = this.lib.chalk.gray(t.script)

                                choices.push({
                                    name: `${this.lib.chalk.white(t.label)}  ${typeTag}  ${scriptPreview}`,
                                    value: i
                                })
                            }

                            try {
                                const selectedIndex = await this.WorkspacePrompt.select({
                                    message: 'Select dev target:',
                                    choices,
                                    pageSize: 20
                                })
                                selectedTarget = devTargets[selectedIndex]
                            } catch (error: any) {
                                if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
                                    console.log(this.lib.chalk.red('\nABORTED\n'))
                                    return
                                }
                                throw error
                            }
                        }

                        // Run the dev script interactively
                        const typeTag = selectedTarget.type === 'project'
                            ? this.lib.chalk.cyan('[project]')
                            : this.lib.chalk.magenta('[package]')

                        console.log(this.lib.chalk.green(`\n=> Starting dev server for ${selectedTarget.label} ${typeTag}\n`))
                        console.log(this.lib.chalk.gray(`   Directory: ${selectedTarget.dir}`))
                        console.log(this.lib.chalk.gray(`   Script:    ${selectedTarget.script}\n`))

                        // Check if node_modules exists; if not, check for dependencies and run bun install
                        const nodeModulesDir = this.lib.path.join(selectedTarget.dir, 'node_modules')
                        let needsInstall = false
                        try {
                            await this.lib.fs.access(nodeModulesDir, this.lib.fs.F_OK)
                        } catch {
                            // node_modules missing — check if package.json has dependencies
                            const pkgPath = this.lib.path.join(selectedTarget.dir, 'package.json')
                            try {
                                const pkgContent = await this.lib.fs.readFile(pkgPath, 'utf-8')
                                const pkg = JSON.parse(pkgContent)
                                if ((pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
                                    (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0)) {
                                    needsInstall = true
                                }
                            } catch { }
                        }

                        if (needsInstall) {
                            console.log(this.lib.chalk.yellow(`   Installing dependencies ...\n`))
                            const installProc = Bun.spawn(['bun', 'install'], {
                                cwd: selectedTarget.dir,
                                stdin: 'inherit',
                                stdout: 'inherit',
                                stderr: 'inherit'
                            })
                            await installProc.exited
                            console.log('')
                        }

                        // Use Bun.spawn for full interactive mode (stdin/stdout/stderr passthrough)
                        const proc = Bun.spawn(['bun', 'run', 'dev'], {
                            cwd: selectedTarget.dir,
                            stdin: 'inherit',
                            stdout: 'inherit',
                            stderr: 'inherit'
                        })

                        await proc.exited
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
capsule['#'] = '@stream44.studio/t44/caps/ProjectDevelopment'
