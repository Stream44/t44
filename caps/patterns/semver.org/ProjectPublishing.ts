
import { join, dirname } from 'path'
import { readFile, writeFile, access } from 'fs/promises'
import glob from 'fast-glob'
import chalk from 'chalk'
import semver from 'semver'

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
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#@stream44.studio/t44/structs/ProjectPublishingConfig': {
                as: '$WorkspaceRepositories'
            },
            '#@stream44.studio/t44/structs/WorkspaceMappingsConfig': {
                as: '$WorkspaceMappings'
            },
            '#': {
                reverseRenamePatch: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { patchContent }: { patchContent: string }): Promise<{ content: string, modified: boolean }> {
                        const mappingsConfig = await this.$WorkspaceMappings.config
                        const publishingMappings = mappingsConfig?.mappings?.['@stream44.studio/t44/caps/patterns/ProjectPublishing']
                        if (!publishingMappings?.npm) return { content: patchContent, modified: false }

                        const npmRenames: Record<string, string> = publishingMappings.npm

                        // Build reverse map: publicName → workspaceName
                        // Only include mappings where the public name starts with '@' to avoid
                        // overly broad replacements (e.g. 't44' would match too many things)
                        const reverseRenames: Record<string, string> = {}
                        for (const [workspaceName, publicName] of Object.entries(npmRenames)) {
                            if (publicName.startsWith('@')) {
                                reverseRenames[publicName] = workspaceName
                            }
                        }

                        // Sort by length descending to replace longer names first (avoid partial matches)
                        const reverseEntries = Object.entries(reverseRenames)
                            .sort((a, b) => b[0].length - a[0].length)

                        if (reverseEntries.length === 0) return { content: patchContent, modified: false }

                        let content = patchContent
                        let modified = false

                        for (const [publicName, workspaceName] of reverseEntries) {
                            // Replace the literal public name with workspace name
                            const regex = new RegExp(publicName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                            const replaced = content.replace(regex, workspaceName)
                            if (replaced !== content) {
                                content = replaced
                                modified = true
                            }

                            // Also replace tilde-separated variant of scoped names
                            // (e.g. @stream44.studio~FramespaceGenesis → @stream44.studio~FramespaceGenesis)
                            const pubTilde = publicName.replace(/^(@[^/]+)\//, '$1~')
                            if (pubTilde !== publicName) {
                                const wsTilde = workspaceName.replace(/^(@[^/]+)\//, '$1~')
                                const tildeRegex = new RegExp(pubTilde.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                                const replacedTilde = content.replace(tildeRegex, wsTilde)
                                if (replacedTilde !== content) {
                                    content = replacedTilde
                                    modified = true
                                }
                            }

                            // Also replace regex-escaped versions of the public name
                            // (e.g. @stream44\.studio\/dco in test patterns)
                            const pubEscaped = publicName.replace(/[.*+?^${}()|[\]/\\]/g, '\\$&')
                            if (pubEscaped !== publicName) {
                                const wsEscaped = workspaceName.replace(/[.*+?^${}()|[\]/\\]/g, '\\$&')
                                const escapedRegex = new RegExp(pubEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                                const replacedEscaped = content.replace(escapedRegex, wsEscaped)
                                if (replacedEscaped !== content) {
                                    content = replacedEscaped
                                    modified = true
                                }
                            }
                        }

                        return { content, modified }
                    }
                },
                rename: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { dirs, repos }: { dirs: Iterable<string>, repos?: Record<string, any> }) {
                        const mappingsConfig = await this.$WorkspaceMappings.config
                        const publishingMappings = mappingsConfig?.mappings?.['@stream44.studio/t44/caps/patterns/ProjectPublishing']
                        if (publishingMappings?.npm) {
                            const npmRenames: Record<string, string> = publishingMappings.npm
                            const renameEntries = Object.entries(npmRenames)
                                .sort((a, b) => b[0].length - a[0].length)

                            if (renameEntries.length > 0) {
                                console.log('[t44] Applying package name renames ...\n')

                                for (const dir of dirs) {
                                    const files = await glob('**/*', {
                                        cwd: dir,
                                        absolute: true,
                                        onlyFiles: true,
                                        dot: true
                                    })

                                    for (const file of files) {
                                        try {
                                            const buffer = await readFile(file)

                                            // Detect binary files by checking for null bytes (the standard
                                            // heuristic used by git, diff, file(1), etc.)
                                            if (buffer.includes(0x00)) continue

                                            let content = buffer.toString('utf-8')
                                            let modified = false

                                            for (const [workspaceName, publicName] of renameEntries) {
                                                // Replace the literal workspace name
                                                const regex = new RegExp(workspaceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                                                const replaced = content.replace(regex, publicName)
                                                if (replaced !== content) {
                                                    content = replaced
                                                    modified = true
                                                }

                                                // Also replace tilde-separated variant of scoped names
                                                // (e.g. @stream44.studio~FramespaceGenesis → @stream44.studio~FramespaceGenesis)
                                                const wsTilde = workspaceName.replace(/^(@[^/]+)\//, '$1~')
                                                if (wsTilde !== workspaceName) {
                                                    const pubTilde = publicName.replace(/^(@[^/]+)\//, '$1~')
                                                    const tildeRegex = new RegExp(wsTilde.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                                                    const replacedTilde = content.replace(tildeRegex, pubTilde)
                                                    if (replacedTilde !== content) {
                                                        content = replacedTilde
                                                        modified = true
                                                    }
                                                }

                                                // Also replace regex-escaped versions of the workspace name
                                                // (e.g. @stream44\.studio\/encapsulate in test patterns)
                                                const wsEscaped = workspaceName.replace(/[.*+?^${}()|[\]/\\]/g, '\\$&')
                                                if (wsEscaped !== workspaceName) {
                                                    const pubEscaped = publicName.replace(/[.*+?^${}()|[\]/\\]/g, '\\$&')
                                                    const escapedRegex = new RegExp(wsEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                                                    const replacedEscaped = content.replace(escapedRegex, pubEscaped)
                                                    if (replacedEscaped !== content) {
                                                        content = replacedEscaped
                                                        modified = true
                                                    }
                                                }
                                            }

                                            if (modified) {
                                                await writeFile(file, content, 'utf-8')
                                            }
                                        } catch (e) {
                                            // Skip files that can't be read
                                        }
                                    }
                                }
                            }
                        }

                        // Resolve workspace:* dependencies
                        if (repos) {
                            const repositoriesConfig = await this.$WorkspaceRepositories.config
                            const mappingsConfig = await this.$WorkspaceMappings.config
                            const npmRenames: Record<string, string> = mappingsConfig?.mappings?.['@stream44.studio/t44/caps/patterns/ProjectPublishing']?.npm || {}
                            const { publicNpmPackageNames, workspaceNpmPackageNames, workspacePackageSourceDirs } = await buildWorkspacePackageMaps(repositoriesConfig, npmRenames)

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

                                // Follow workspaces declarations to update sub-workspace package.json files
                                const workspaces: string[] = packageJson.workspaces || []
                                if (workspaces.length > 0) {
                                    const workspacePatterns = workspaces.map(ws => join(ws, 'package.json'))
                                    const subPackageJsonPaths = await glob(workspacePatterns, {
                                        cwd: repoSourceDir as string,
                                        absolute: true,
                                        onlyFiles: true,
                                    })

                                    for (const subPkgPath of subPackageJsonPaths) {
                                        try {
                                            const subContent = await readFile(subPkgPath, 'utf-8')
                                            const subIndent = detectIndent(subContent)
                                            const subPkg = JSON.parse(subContent)

                                            await updateWorkspaceDependencies(subPkg, workspaceNpmPackageNames, workspacePackageSourceDirs, publicNpmPackageNames)

                                            const subUpdated = JSON.stringify(subPkg, null, subIndent) + '\n'
                                            if (subUpdated !== subContent) {
                                                await writeFile(subPkgPath, subUpdated, 'utf-8')
                                                console.log(chalk.green(`  ✓ Updated workspace dependencies in ${subPkgPath}\n`))
                                            }
                                        } catch (e) {
                                            // Skip sub-workspaces with unreadable package.json
                                        }
                                    }
                                }
                            }

                            // Clean up tsconfig.json extends paths that don't resolve in the published package
                            console.log('[t44] Cleaning up tsconfig.json extends paths ...\n')
                            for (const [repoName, repoSourceDir] of Object.entries(repos)) {
                                await cleanupTsconfigExtends(join(repoSourceDir as string, 'tsconfig.json'))

                                // Follow workspaces to find sub-workspace tsconfig.json files
                                const pkgPath = join(repoSourceDir as string, 'package.json')
                                try {
                                    const pkgContent = await readFile(pkgPath, 'utf-8')
                                    const pkg = JSON.parse(pkgContent)
                                    const workspaces: string[] = pkg.workspaces || []
                                    if (workspaces.length > 0) {
                                        const tsconfigPatterns = workspaces.map(ws => join(ws, 'tsconfig.json'))
                                        const tsconfigPaths = await glob(tsconfigPatterns, {
                                            cwd: repoSourceDir as string,
                                            absolute: true,
                                            onlyFiles: true,
                                        })
                                        for (const tsconfigPath of tsconfigPaths) {
                                            await cleanupTsconfigExtends(tsconfigPath)
                                        }
                                    }
                                } catch { }
                            }
                        }
                    }
                },
                bump: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, ctx }: { config: any, ctx: any }) {
                        const { rc, release } = ctx.options || {}

                        const projectSourceDir = join(ctx.repoSourceDir)
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

                        // Write bumped version back to the original source package.json
                        // so that if this run fails partway through, the next run starts
                        // from the already-bumped version instead of producing a duplicate tag.
                        const originalSourceDir = ctx.repoConfig?.sourceDir
                        if (originalSourceDir) {
                            const originalPackageJsonPath = join(originalSourceDir, 'package.json')
                            try {
                                const originalContent = await readFile(originalPackageJsonPath, 'utf-8')
                                const originalJson = JSON.parse(originalContent)
                                originalJson.version = newVersion
                                const originalIndent = detectIndent(originalContent)
                                await writeFile(originalPackageJsonPath, JSON.stringify(originalJson, null, originalIndent) + '\n', 'utf-8')
                                console.log(chalk.green(`  ✓ Updated ${packageJsonPath} to version ${newVersion}`))
                                console.log(chalk.green(`  ✓ Written back version ${newVersion} to source ${originalPackageJsonPath}\n`))
                            } catch {
                                console.log(chalk.green(`  ✓ Updated ${packageJsonPath} to version ${newVersion}\n`))
                            }
                        } else {
                            console.log(chalk.green(`  ✓ Updated ${packageJsonPath} to version ${newVersion}\n`))
                        }

                        ctx.metadata.bumped = true
                        ctx.metadata.newVersion = newVersion
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
capsule['#'] = '@stream44.studio/t44/caps/patterns/semver.org/ProjectPublishing'


async function buildWorkspacePackageMaps(repositoriesConfig: any, npmRenames: Record<string, string>) {
    const publicNpmPackageNames: Record<string, string> = {}
    const workspaceNpmPackageNames: Record<string, string> = {}
    const workspacePackageSourceDirs: Record<string, string> = {}

    // Build reverse rename map: publicName → workspaceName
    const reverseRenames: Record<string, string> = {}
    for (const [workspaceName, publicName] of Object.entries(npmRenames)) {
        reverseRenames[publicName] = workspaceName
    }

    if (repositoriesConfig?.repositories) {
        for (const [repoKey, repoConfig] of Object.entries(repositoriesConfig.repositories as any)) {
            const sourceDir = (repoConfig as any).sourceDir
            if (!sourceDir) continue

            const packageJsonPath = join(sourceDir, 'package.json')

            try {
                const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                const packageJson = JSON.parse(packageJsonContent)
                const workspacePackageName = packageJson.name

                // Index source dir by the original workspace package name
                workspacePackageSourceDirs[workspacePackageName] = sourceDir

                // Also index by the renamed (public) name if a rename mapping exists
                const renamedName = npmRenames[workspacePackageName]
                if (renamedName) {
                    workspacePackageSourceDirs[renamedName] = sourceDir
                    workspaceNpmPackageNames[renamedName] = workspacePackageName
                }
            } catch (error) {
                console.log(chalk.gray(`  [debug] Could not read ${packageJsonPath}: ${error}`))
            }

            const providers = (repoConfig as any).providers || ((repoConfig as any).provider ? [(repoConfig as any).provider] : [])

            for (const provider of providers) {
                if (provider.capsule === '@stream44.studio/t44-npmjs.com/caps/ProjectPublishing') {
                    try {
                        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                        const packageJson = JSON.parse(packageJsonContent)
                        const workspacePackageName = packageJson.name
                        const publicPackageName = provider.config.PackageSettings.name

                        publicNpmPackageNames[workspacePackageName] = publicPackageName
                        workspaceNpmPackageNames[publicPackageName] = workspacePackageName
                        // Also index source dir by the public package name
                        workspacePackageSourceDirs[publicPackageName] = sourceDir
                    } catch (error) {
                        throw new Error(`Could not read package.json from ${packageJsonPath}: ${error}`)
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
                        const depSourceDir = workspacePackageSourceDirs[workspaceDepName] || workspacePackageSourceDirs[depName]

                        if (!depSourceDir) {
                            // Dependency is not part of the publishing scope (external workspace dependency)
                            // Skip it - workspace: protocol deps that aren't in scope shouldn't be published
                            console.log(chalk.yellow(`  ⚠ Skipping external workspace dependency: ${depName}`))
                            continue
                        }

                        const depPackageJsonPath = join(depSourceDir, 'package.json')
                        const depPackageJsonContent = await readFile(depPackageJsonPath, 'utf-8')
                        const depPackageJson = JSON.parse(depPackageJsonContent)

                        // Replace workspace package name with public package name
                        const publicDepName = publicNpmPackageNames[workspaceDepName] || depName
                        const newVersion = depPackageJson.version
                        const newSelector = `^${newVersion}`

                        // Check if there's an existing selector in the original dependencies
                        // that would already satisfy the new version
                        const existingSelector = (packageJson as any)[depField]?.[publicDepName] ||
                            (packageJson as any)[depField]?.[depName]

                        if (existingSelector &&
                            typeof existingSelector === 'string' &&
                            !existingSelector.startsWith('workspace:') &&
                            semver.satisfies(newVersion, existingSelector, { includePrerelease: true })) {
                            // Existing selector already matches the new version, keep it
                            updatedDeps[publicDepName] = existingSelector
                        } else {
                            updatedDeps[publicDepName] = newSelector
                        }
                    } catch (error) {
                        throw new Error(`Could not resolve workspace dependency ${depName}: ${error}`)
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

async function cleanupTsconfigExtends(tsconfigPath: string): Promise<void> {
    try {
        const content = await readFile(tsconfigPath, 'utf-8')
        const tsconfig = JSON.parse(content)

        if (!tsconfig.extends) return

        // Resolve the extends path relative to the tsconfig.json directory
        const tsconfigDir = dirname(tsconfigPath)
        const extendsPath = join(tsconfigDir, tsconfig.extends)

        try {
            await access(extendsPath)
            // Path exists — keep it
        } catch {
            // Path does not exist — remove the extends field
            delete tsconfig.extends
            const indent = detectIndent(content)
            await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, indent) + '\n', 'utf-8')
            console.log(chalk.green(`  ✓ Removed invalid extends from ${tsconfigPath}\n`))
        }
    } catch {
        // tsconfig.json doesn't exist or isn't valid JSON — skip
    }
}
