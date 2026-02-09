
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import glob from 'fast-glob'
import chalk from 'chalk'

function detectIndent(content: string): number {
    const match = content.match(/^\{\s*\n([ \t]+)/)
    if (match) {
        return match[1].length
    }
    return 2
}

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
            '#t44/structs/WorkspaceRepositories.v0': {
                as: '$WorkspaceRepositories'
            },
            '#t44/structs/WorkspaceMappings.v0': {
                as: '$WorkspaceMappings'
            },
            '#': {
                rename: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { dirs, repos }: { dirs: Iterable<string>, repos?: Record<string, any> }) {
                        const mappingsConfig = await this.$WorkspaceMappings.config
                        const publishingMappings = mappingsConfig?.mappings?.['t44/caps/providers/ProjectPublishing.v0']
                        if (publishingMappings?.npm) {
                            const npmRenames: Record<string, string> = publishingMappings.npm
                            const renameEntries = Object.entries(npmRenames)

                            if (renameEntries.length > 0) {
                                console.log('[t44] Applying package name renames ...\n')

                                for (const dir of dirs) {
                                    const files = await glob('**/*.{ts,tsx,js,jsx,json,md,txt,yml,yaml,sh}', {
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
                        }

                        // Resolve workspace:* dependencies
                        if (repos) {
                            const repositoriesConfig = await this.$WorkspaceRepositories.config
                            const { publicNpmPackageNames, workspaceNpmPackageNames, workspacePackageSourceDirs } = await buildWorkspacePackageMaps(repositoriesConfig)

                            console.log('[t44] Resolving workspace dependencies ...\n')
                            for (const [repoName, repoSourceDir] of Object.entries(repos)) {
                                const packageJsonPath = join(repoSourceDir as string, 'package.json')

                                const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                                const indent = detectIndent(packageJsonContent)
                                const packageJson = JSON.parse(packageJsonContent)

                                await updateWorkspaceDependencies(packageJson, workspaceNpmPackageNames, workspacePackageSourceDirs, publicNpmPackageNames)

                                const updatedContent = JSON.stringify(packageJson, null, indent) + '\n'
                                if (updatedContent !== packageJsonContent) {
                                    await writeFile(packageJsonPath, updatedContent, 'utf-8')
                                    console.log(chalk.green(`  ✓ Updated workspace dependencies in ${packageJsonPath}\n`))
                                }
                            }
                        }
                    }
                },
                bump: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, options }: { config: any, options?: { rc?: boolean, release?: boolean } }) {
                        const { rc, release } = options || {}

                        const projectSourceDir = join(config.sourceDir)
                        const packageJsonPath = join(projectSourceDir, 'package.json')

                        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                        const packageJson = JSON.parse(packageJsonContent)
                        const currentVersion = packageJson.version

                        let newVersion: string

                        if (release) {
                            const rcMatch = currentVersion.match(/^(.+)-rc\.\d+$/)
                            if (rcMatch) {
                                newVersion = rcMatch[1]
                                console.log(chalk.cyan(`  Removing RC suffix: ${currentVersion} → ${newVersion}`))
                            } else {
                                console.log(chalk.yellow(`  Version ${currentVersion} has no RC suffix, skipping bump`))
                                return
                            }
                        } else if (rc) {
                            const rcMatch = currentVersion.match(/^(.+)-rc\.(\d+)$/)
                            if (rcMatch) {
                                const baseVersion = rcMatch[1]
                                const rcNumber = parseInt(rcMatch[2], 10)
                                newVersion = `${baseVersion}-rc.${rcNumber + 1}`
                                console.log(chalk.cyan(`  Incrementing RC version: ${currentVersion} → ${newVersion}`))
                            } else {
                                const versionParts = currentVersion.split('.')
                                if (versionParts.length !== 3) {
                                    throw new Error(`Invalid version format: ${currentVersion}`)
                                }
                                const [major, minor, patch] = versionParts
                                const newMinor = parseInt(minor, 10) + 1
                                newVersion = `${major}.${newMinor}.0-rc.1`
                                console.log(chalk.cyan(`  Bumping minor version and adding RC: ${currentVersion} → ${newVersion}`))
                            }
                        } else {
                            console.log(chalk.yellow(`  No version bump requested`))
                            return
                        }

                        packageJson.version = newVersion
                        const indent = detectIndent(packageJsonContent)
                        const updatedContent = JSON.stringify(packageJson, null, indent) + '\n'
                        await writeFile(packageJsonPath, updatedContent, 'utf-8')

                        console.log(chalk.green(`  ✓ Updated ${packageJsonPath} to version ${newVersion}\n`))
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
capsule['#'] = 't44/caps/providers/semver.org/ProjectPublishing.v0'


async function buildWorkspacePackageMaps(repositoriesConfig: any) {
    const publicNpmPackageNames: Record<string, string> = {}
    const workspaceNpmPackageNames: Record<string, string> = {}
    const workspacePackageSourceDirs: Record<string, string> = {}

    if (repositoriesConfig?.repositories) {
        for (const [repoKey, repoConfig] of Object.entries(repositoriesConfig.repositories as any)) {
            const providers = (repoConfig as any).providers || ((repoConfig as any).provider ? [(repoConfig as any).provider] : [])

            for (const provider of providers) {
                if (provider.capsule === 't44/caps/providers/npmjs.com/ProjectPublishing.v0') {
                    const sourceDir = (repoConfig as any).sourceDir
                    const packageJsonPath = join(sourceDir, 'package.json')

                    try {
                        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                        const packageJson = JSON.parse(packageJsonContent)
                        const workspacePackageName = packageJson.name
                        const publicPackageName = provider.config.PackageSettings.name

                        publicNpmPackageNames[workspacePackageName] = publicPackageName
                        workspaceNpmPackageNames[publicPackageName] = workspacePackageName
                        workspacePackageSourceDirs[workspacePackageName] = sourceDir
                    } catch (error) {
                        console.warn(`Could not read package.json from ${packageJsonPath}:`, error)
                    }
                }
            }
        }
    }

    return { publicNpmPackageNames, workspaceNpmPackageNames, workspacePackageSourceDirs }
}

async function updateWorkspaceDependencies(
    packageJson: any,
    workspaceNpmPackageNames: Record<string, string>,
    workspacePackageSourceDirs: Record<string, string>,
    publicNpmPackageNames: Record<string, string>
) {
    const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    const currentPackageName = packageJson.name

    for (const depField of dependencyFields) {
        if (packageJson[depField]) {
            const updatedDeps: Record<string, string> = {}

            for (const [depName, depVersion] of Object.entries(packageJson[depField])) {
                // Skip self-referencing dependencies
                if (depName === currentPackageName) {
                    continue
                }

                if (typeof depVersion === 'string' && depVersion.startsWith('workspace:')) {
                    try {
                        const workspaceDepName = workspaceNpmPackageNames[depName] || depName
                        const depSourceDir = workspacePackageSourceDirs[workspaceDepName]

                        if (!depSourceDir) {
                            console.warn(`Could not find source directory for workspace dependency ${depName} (${workspaceDepName})`)
                            continue
                        }

                        const depPackageJsonPath = join(depSourceDir, 'package.json')
                        const depPackageJsonContent = await readFile(depPackageJsonPath, 'utf-8')
                        const depPackageJson = JSON.parse(depPackageJsonContent)

                        // Replace workspace package name with public package name
                        const publicDepName = publicNpmPackageNames[workspaceDepName] || depName
                        updatedDeps[publicDepName] = `^${depPackageJson.version}`
                    } catch (error) {
                        console.warn(`Could not resolve workspace dependency ${depName}:`, error)
                    }
                } else {
                    // Keep non-workspace dependencies as-is
                    updatedDeps[depName] = depVersion as string
                }
            }

            packageJson[depField] = updatedDeps
        }
    }
}
