
import { join, resolve, relative } from 'path'
import { readdir, readFile, access } from 'fs/promises'
import { constants } from 'fs'
import { $ } from 'bun'
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
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig.v0'
                },
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceProjects.v0'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt.v0'
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
                            const projectPkgPath = join(sourceDir, 'package.json')
                            try {
                                await access(projectPkgPath, constants.F_OK)
                                const pkgContent = await readFile(projectPkgPath, 'utf-8')
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
                            const packagesDir = join(sourceDir, 'packages')
                            try {
                                await access(packagesDir, constants.F_OK)
                                const packageEntries = await readdir(packagesDir, { withFileTypes: true })
                                for (const entry of packageEntries) {
                                    if (!entry.isDirectory()) continue
                                    const pkgDir = join(packagesDir, entry.name)
                                    const pkgJsonPath = join(pkgDir, 'package.json')
                                    try {
                                        await access(pkgJsonPath, constants.F_OK)
                                        const pkgContent = await readFile(pkgJsonPath, 'utf-8')
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
                            console.log(chalk.yellow('\nNo projects or packages with a "dev" script found.\n'))
                            return
                        }

                        // Sort alphabetically by label
                        devTargets.sort((a, b) => a.label.localeCompare(b.label))

                        let selectedTarget: typeof devTargets[0]

                        if (projectSelector) {
                            // Match by project name, package path, package name, or resolved path
                            const resolvedSelector = resolve(process.cwd(), projectSelector)

                            const matches = devTargets.filter(t => {
                                // Name-based matching
                                if (t.label === projectSelector ||
                                    t.label.startsWith(projectSelector) ||
                                    t.projectName === projectSelector ||
                                    t.packageName === projectSelector) {
                                    return true
                                }
                                // Path-based matching: resolved selector matches or contains the target dir
                                const resolvedDir = resolve(t.dir)
                                if (resolvedDir === resolvedSelector || resolvedDir.startsWith(resolvedSelector + '/')) {
                                    return true
                                }
                                return false
                            })

                            if (matches.length === 0) {
                                console.log(chalk.red(`\nNo dev script found matching '${projectSelector}'.\n`))
                                console.log(chalk.gray('Available targets:'))
                                for (const t of devTargets) {
                                    const typeTag = t.type === 'project'
                                        ? chalk.cyan('[project]')
                                        : chalk.magenta('[package]')
                                    console.log(chalk.gray(`  - ${t.label} ${typeTag}`))
                                }
                                console.log('')
                                return
                            }

                            if (matches.length > 1) {
                                console.log(chalk.red(`\nMultiple dev targets match '${projectSelector}':\n`))
                                for (const m of matches) {
                                    console.log(chalk.gray(`  - ${m.label}`))
                                }
                                console.log(chalk.red('\nPlease be more specific.\n'))
                                return
                            }

                            selectedTarget = matches[0]
                        } else {
                            // Interactive picker
                            console.log(chalk.cyan('\nSelect a dev server to run:\n'))

                            const choices: Array<{ name: string; value: number }> = []

                            for (let i = 0; i < devTargets.length; i++) {
                                const t = devTargets[i]
                                const typeTag = t.type === 'project'
                                    ? chalk.cyan('[project]')
                                    : chalk.magenta('[package]')
                                const scriptPreview = chalk.gray(t.script)

                                choices.push({
                                    name: `${chalk.white(t.label)}  ${typeTag}  ${scriptPreview}`,
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
                                    console.log(chalk.red('\nABORTED\n'))
                                    return
                                }
                                throw error
                            }
                        }

                        // Run the dev script interactively
                        const typeTag = selectedTarget.type === 'project'
                            ? chalk.cyan('[project]')
                            : chalk.magenta('[package]')

                        console.log(chalk.green(`\n=> Starting dev server for ${selectedTarget.label} ${typeTag}\n`))
                        console.log(chalk.gray(`   Directory: ${selectedTarget.dir}`))
                        console.log(chalk.gray(`   Script:    ${selectedTarget.script}\n`))

                        // Check if node_modules exists; if not, check for dependencies and run bun install
                        const nodeModulesDir = join(selectedTarget.dir, 'node_modules')
                        let needsInstall = false
                        try {
                            await access(nodeModulesDir, constants.F_OK)
                        } catch {
                            // node_modules missing — check if package.json has dependencies
                            const pkgPath = join(selectedTarget.dir, 'package.json')
                            try {
                                const pkgContent = await readFile(pkgPath, 'utf-8')
                                const pkg = JSON.parse(pkgContent)
                                if ((pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
                                    (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0)) {
                                    needsInstall = true
                                }
                            } catch { }
                        }

                        if (needsInstall) {
                            console.log(chalk.yellow(`   Installing dependencies ...\n`))
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
capsule['#'] = 't44/caps/ProjectDevelopment.v0'
