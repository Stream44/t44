
import { join } from 'path'
import { $ } from 'bun'
import { mkdir, access, writeFile, readFile } from 'fs/promises'
import { constants } from 'fs'
import glob from 'fast-glob'
import chalk from 'chalk'
import { createHash } from 'crypto'


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
            '#t44/structs/providers/npmjs.com/ProjectPublishingFact.v0': {
                as: '$NpmFact'
            },
            '#t44/structs/ProjectPublishingFact.v0': {
                as: '$StatusFact'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt.v0'
                },
                prepare: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { projectionDir, config, repoSourceDir }: { projectionDir: string, config: any, repoSourceDir?: string }) {
                        const repositoriesConfig = await this.$WorkspaceRepositories.config
                        const { publicNpmPackageNames, workspaceNpmPackageNames, workspacePackageSourceDirs } = await buildWorkspacePackageMaps(repositoriesConfig)

                        const name = config.provider.config.PackageSettings.name
                        const projectSourceDir = join(config.sourceDir)
                        const projectProjectionDir = join(projectionDir, 'packages', name.replace(/[@:\/]/g, '~'))

                        await mkdir(projectProjectionDir, { recursive: true })

                        const gitignorePath = join(projectSourceDir, '.gitignore')
                        const npmignorePath = join(projectSourceDir, '.npmignore')

                        let gitignoreExists = false
                        let npmignoreExists = false

                        try {
                            await access(gitignorePath, constants.F_OK)
                            gitignoreExists = true
                        } catch { }

                        try {
                            await access(npmignorePath, constants.F_OK)
                            npmignoreExists = true
                        } catch { }

                        const rsyncArgs = ['rsync', '-a', '--delete', '--delete-excluded', '--exclude', '.git']
                        if (gitignoreExists) rsyncArgs.push('--exclude-from=' + gitignorePath)
                        if (npmignoreExists) rsyncArgs.push('--exclude-from=' + npmignorePath)
                        rsyncArgs.push(projectSourceDir + '/', projectProjectionDir + '/')
                        await $`${rsyncArgs}`

                        const packageJsonPath = join(projectProjectionDir, 'package.json')
                        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                        const originalPackageJson = JSON.parse(packageJsonContent)
                        const packageJson = JSON.parse(packageJsonContent)

                        // Only remove private flag if not explicitly set to private in config
                        const isPrivate = config.provider.config.PackageSettings?.private === true
                        if (!isPrivate) {
                            delete packageJson.private
                        }

                        // Replace package name with public npm name
                        packageJson.name = name

                        // Collect workspace packages that need to be renamed
                        // Do this BEFORE updating dependencies so we have the original workspace names
                        const renameWorkspacePackages = new Set<string>()

                        // Always include the package's own workspace name for self-references
                        const ownWorkspaceName = originalPackageJson.name
                        if (ownWorkspaceName && publicNpmPackageNames[ownWorkspaceName]) {
                            renameWorkspacePackages.add(ownWorkspaceName)
                        }

                        // Also include workspace packages used in dependencies
                        const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
                        for (const depField of dependencyFields) {
                            if (packageJson[depField]) {
                                for (const depName of Object.keys(packageJson[depField])) {
                                    // Check if this is a workspace package
                                    const workspaceDepName = workspaceNpmPackageNames[depName] || depName
                                    if (workspacePackageSourceDirs[workspaceDepName]) {
                                        renameWorkspacePackages.add(workspaceDepName)
                                    }
                                }
                            }
                        }

                        // Replace workspace package names in files for both projection and central directories
                        if (renameWorkspacePackages.size > 0) {
                            const dirsToProcess = [projectProjectionDir]
                            if (repoSourceDir) dirsToProcess.push(repoSourceDir)

                            for (const dir of dirsToProcess) {
                                const files = await glob('**/*.{ts,tsx,js,jsx,json,md,txt,yml,yaml}', {
                                    cwd: dir,
                                    absolute: true,
                                    onlyFiles: true
                                })

                                for (const file of files) {
                                    try {
                                        let content = await readFile(file, 'utf-8')
                                        let modified = false

                                        // Only replace workspace packages that are used in dependencies
                                        for (const workspaceName of Array.from(renameWorkspacePackages)) {
                                            const publicName = publicNpmPackageNames[workspaceName]
                                            if (publicName) {
                                                const regex = new RegExp(workspaceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                                                if (regex.test(content)) {
                                                    content = content.replace(regex, publicName)
                                                    modified = true
                                                }
                                            }
                                        }

                                        if (modified) {
                                            await writeFile(file, content, 'utf-8')
                                        }
                                    } catch (e) {
                                        // Skip files that can't be read as text (binary files, etc.)
                                    }
                                }
                            }
                        }

                        await updateWorkspaceDependencies(packageJson, workspaceNpmPackageNames, workspacePackageSourceDirs, publicNpmPackageNames)

                        const modifiedPackageJsonContent = JSON.stringify(packageJson, null, 4) + '\n'
                        await writeFile(packageJsonPath, modifiedPackageJsonContent, 'utf-8')

                        // Also update package.json in central source directory if provided
                        if (repoSourceDir) {
                            const centralPackageJsonPath = join(repoSourceDir, 'package.json')
                            await writeFile(centralPackageJsonPath, modifiedPackageJsonContent, 'utf-8')
                        }

                        const localVersion = packageJson.version

                        let publishedInfo: any = null
                        let publishedFiles: Map<string, string> = new Map()
                        let hasChanges = false

                        try {
                            const viewResult = await $`npm view ${name} --json`.cwd(projectProjectionDir).quiet()
                            const result = viewResult.text()

                            if (result && result.trim()) {
                                publishedInfo = JSON.parse(result)

                                if (publishedInfo && publishedInfo['dist-tags']) {
                                    try {
                                        // Determine which tag to compare against based on local version
                                        const isReleaseCandidate = localVersion.includes('-rc.')
                                        const compareTag = isReleaseCandidate ? 'next' : 'latest'
                                        const distTags = publishedInfo['dist-tags']
                                        const compareVersion = distTags[compareTag]

                                        if (compareVersion) {
                                            // Include version in directory name for proper caching
                                            const publishedDir = join(projectionDir, 'packages-published', `${name.replace(/[@:\/]/g, '~')}@${compareVersion}`)
                                            const publishedPackageDir = join(publishedDir, 'package')

                                            // Check if already downloaded
                                            let alreadyDownloaded = false
                                            try {
                                                await access(publishedPackageDir, constants.F_OK)
                                                alreadyDownloaded = true
                                            } catch { }

                                            if (!alreadyDownloaded) {
                                                await mkdir(publishedDir, { recursive: true })

                                                await $`npm pack ${name}@${compareVersion}`.cwd(publishedDir).quiet()

                                                const tarballFiles = await glob('*.tgz', { cwd: publishedDir, absolute: false })
                                                if (tarballFiles.length > 0) {
                                                    await $`tar -xzf ${tarballFiles[0]}`.cwd(publishedDir).quiet()
                                                    await $`rm ${tarballFiles[0]}`.cwd(publishedDir).quiet()
                                                }
                                            }

                                            // Read file hashes from extracted package
                                            const publishedFilePaths = await glob('**/*', {
                                                cwd: publishedPackageDir,
                                                absolute: false,
                                                onlyFiles: true
                                            })

                                            for (const filePath of publishedFilePaths) {
                                                const fullPath = join(publishedPackageDir, filePath)
                                                const fileBuffer = await readFile(fullPath)
                                                const fileHash = createHash('sha1').update(fileBuffer).digest('hex')
                                                publishedFiles.set(filePath, fileHash)
                                            }
                                        }
                                    } catch (e) { }
                                }
                            }
                        } catch (error: any) {
                            hasChanges = true
                        }

                        const localPackResult = await $`npm pack`.cwd(projectProjectionDir).quiet()
                        const localTarballName = localPackResult.text().trim().split('\n').pop()?.trim()
                        const localTarballPath = join(projectProjectionDir, localTarballName || '')

                        const localTarballBuffer = await readFile(localTarballPath)
                        const localShasum = createHash('sha1').update(localTarballBuffer).digest('hex')
                        const localIntegrity = 'sha512-' + createHash('sha512').update(localTarballBuffer).digest('base64')

                        await $`rm ${localTarballPath}`.quiet()

                        let versionExistsOnNpm = false
                        let versionMatchesChecksum = false
                        let localMatchesAnyTag = false

                        if (publishedInfo) {
                            // Check if local version exists in any tag
                            const distTags = publishedInfo['dist-tags'] || {}
                            for (const [tag, version] of Object.entries(distTags)) {
                                if (version === localVersion) {
                                    versionExistsOnNpm = true

                                    // Fetch version-specific info to check shasum
                                    try {
                                        const versionResult = await $`npm view ${name}@${version as string} --json`.cwd(projectProjectionDir).quiet()
                                        const versionInfo = JSON.parse(versionResult.text())
                                        const publishedShasum = versionInfo.dist?.shasum || ''
                                        const publishedIntegrity = versionInfo.dist?.integrity || ''

                                        if (publishedShasum === localShasum || publishedIntegrity === localIntegrity) {
                                            versionMatchesChecksum = true
                                            localMatchesAnyTag = true
                                        }
                                    } catch (e) { }

                                    break
                                }
                            }
                        }

                        if (!publishedInfo || !localMatchesAnyTag) {
                            hasChanges = true
                        }

                        return {
                            name,
                            localVersion,
                            projectSourceDir,
                            projectProjectionDir,
                            publishedInfo,
                            localShasum,
                            localIntegrity,
                            versionExistsOnNpm,
                            versionMatchesChecksum,
                            localMatchesAnyTag,
                            hasChanges,
                            publishedFiles,
                            workspaceNpmPackageNames,
                            workspacePackageSourceDirs
                        }
                    }
                },
                push: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { projectionDir, config, metadata }: { projectionDir: string, config: any, metadata?: any }) {

                        if (!metadata) {
                            throw new Error('Push method requires metadata from prepare phase')
                        }

                        // Check if package is marked as private in config
                        const isPrivate = config.provider.config.PackageSettings?.private === true
                        if (isPrivate) {
                            console.log(chalk.yellow(`\n⚠️  Package is marked as private - skipping npm publish\n`))
                            return
                        }

                        const {
                            name,
                            localVersion,
                            projectSourceDir,
                            projectProjectionDir,
                            publishedInfo,
                            localShasum,
                            localIntegrity,
                            versionExistsOnNpm,
                            versionMatchesChecksum,
                            localMatchesAnyTag,
                            hasChanges,
                            publishedFiles
                        } = metadata

                        console.log(chalk.cyan(`\n📋 Package Details:`))
                        console.log(chalk.gray(`   Package:     ${chalk.white(name)}`))
                        console.log(chalk.gray(`   Version:     ${chalk.white(localVersion)}`))
                        console.log(chalk.gray(`   Shasum:      ${chalk.white(localShasum)}`))
                        console.log(chalk.gray(`   Source:      ${chalk.white(projectSourceDir)}`))
                        console.log(chalk.gray(`   Build:       ${chalk.white(projectProjectionDir)}`))

                        if (publishedInfo) {
                            const npmUrl = `https://www.npmjs.com/package/${name}`
                            const distTags = publishedInfo['dist-tags'] || {}

                            console.log(chalk.cyan(`\n📦 Published package: ${chalk.underline(npmUrl)}`))

                            // Fetch and display info for each tag
                            const tagInfos: Array<{ tag: string, version: string, shasum: string, matches: boolean }> = []
                            let anyTagMatches = false

                            for (const [tag, version] of Object.entries(distTags)) {
                                try {
                                    const tagVersionResult = await $`npm view ${name}@${version as string} --json`.cwd(projectProjectionDir).quiet()
                                    const tagVersionInfo = JSON.parse(tagVersionResult.text())

                                    const publishedShasum = tagVersionInfo.dist?.shasum || ''
                                    const publishedIntegrity = tagVersionInfo.dist?.integrity || ''
                                    const matches = publishedShasum === localShasum || publishedIntegrity === localIntegrity

                                    if (matches) anyTagMatches = true

                                    tagInfos.push({ tag, version: version as string, shasum: publishedShasum, matches })
                                } catch (e) {
                                    tagInfos.push({ tag, version: version as string, shasum: '', matches: false })
                                }
                            }

                            console.log(chalk.gray(`   Versions:`))
                            for (const { tag, version, shasum } of tagInfos) {
                                console.log(chalk.white(`      ${tag.padEnd(10)} v${version}`))
                                console.log(chalk.gray(`         ${shasum}`))
                            }
                            console.log('')

                            // Store for later use
                            metadata.anyTagMatches = anyTagMatches
                        }

                        // Show file list (always show, even for first publish)
                        const localFilePaths = await glob('**/*', {
                            cwd: projectProjectionDir,
                            absolute: false,
                            onlyFiles: true
                        })

                        const localFileHashes = new Map<string, string>()
                        for (const filePath of localFilePaths) {
                            const fullPath = join(projectProjectionDir, filePath)
                            const fileBuffer = await readFile(fullPath)
                            const localHash = createHash('sha1').update(fileBuffer).digest('hex')
                            localFileHashes.set(filePath, localHash)
                        }

                        console.log(chalk.cyan(`\n📄 Files to be published:`))
                        if (publishedInfo && publishedFiles.size > 0) {
                            console.log(chalk.gray(`   Legend: ${chalk.green('● new')} ${chalk.yellow('● modified')} ${chalk.gray('● unchanged')}\n`))
                        } else {
                            console.log(chalk.gray(`   Legend: ${chalk.green('● new')}\n`))
                        }

                        for (const filePath of localFilePaths) {
                            const localHash = localFileHashes.get(filePath)
                            const publishedHash = publishedFiles.get(filePath)

                            const stats = await readFile(join(projectProjectionDir, filePath))
                            const sizeKB = (stats.length / 1024).toFixed(1) + 'kB'
                            const sizeB = stats.length + 'B'
                            const displaySize = stats.length >= 1024 ? sizeKB : sizeB

                            let status = ''
                            let color = chalk.gray

                            if (!publishedHash) {
                                status = chalk.green('● ')
                                color = chalk.green
                            } else if (publishedHash !== localHash) {
                                status = chalk.yellow('● ')
                                color = chalk.yellow
                            } else {
                                status = chalk.gray('● ')
                                color = chalk.gray
                            }

                            console.log(`   ${status}${color(displaySize.padEnd(8))} ${color(filePath)}`)
                        }

                        if (publishedInfo && publishedFiles.size > 0) {
                            const deletedFiles = Array.from(publishedFiles.keys()).filter(f => !localFilePaths.includes(f as any))
                            if (deletedFiles.length > 0) {
                                console.log(chalk.red(`\n   Removed files from previous version:`))
                                for (const fileName of deletedFiles) {
                                    console.log(chalk.red(`   ✗ ${fileName}`))
                                }
                            }
                        }
                        console.log('\n')

                        // Display package.json diff comparing our code to published package for same tag
                        if (publishedInfo && publishedFiles.size > 0) {
                            // Determine which tag to compare against based on local version
                            const isReleaseCandidate = localVersion.includes('-rc.')
                            const compareTag = isReleaseCandidate ? 'next' : 'latest'
                            const distTags = publishedInfo['dist-tags'] || {}
                            const compareVersion = distTags[compareTag]

                            if (compareVersion) {
                                const publishedDir = join(projectionDir, 'packages-published', `${name.replace(/[@:\/]/g, '~')}@${compareVersion}`)
                                const publishedPackageDir = join(publishedDir, 'package')
                                const publishedPackageJsonPath = join(publishedPackageDir, 'package.json')

                                // Check if published package.json exists
                                try {
                                    await access(publishedPackageJsonPath, constants.F_OK)

                                    // Read both package.json files
                                    const publishedPackageJsonContent = await readFile(publishedPackageJsonPath, 'utf-8')
                                    const localPackageJsonPath = join(projectSourceDir, 'package.json')
                                    const localPackageJsonContent = await readFile(localPackageJsonPath, 'utf-8')

                                    // Only show diff if they differ
                                    if (publishedPackageJsonContent.trim() !== localPackageJsonContent.trim()) {
                                        console.log(chalk.cyan(`\n📝 package.json changes (comparing to ${compareTag}@${compareVersion}):`))
                                        console.log(chalk.gray('─'.repeat(80)))

                                        try {
                                            const diffResult = await $`diff -u ${publishedPackageJsonPath} ${localPackageJsonPath}`.quiet().nothrow()
                                            const diffLines = diffResult.text().split('\n')

                                            for (const line of diffLines) {
                                                if (line.startsWith('---') || line.startsWith('+++')) {
                                                    console.log(chalk.gray(line))
                                                } else if (line.startsWith('@@')) {
                                                    console.log(chalk.cyan(line))
                                                } else if (line.startsWith('+')) {
                                                    console.log(chalk.green(line))
                                                } else if (line.startsWith('-')) {
                                                    console.log(chalk.red(line))
                                                } else {
                                                    console.log(chalk.gray(line))
                                                }
                                            }
                                        } catch (e) {
                                            // diff command failed
                                        }

                                        console.log(chalk.gray('─'.repeat(80)))
                                        console.log('')
                                    }
                                } catch (e) {
                                    // Published package.json doesn't exist or can't be read
                                }
                            }
                        }

                        // Get anyTagMatches from the earlier section
                        const anyTagMatches = metadata.anyTagMatches || localMatchesAnyTag

                        if (anyTagMatches) {
                            console.log(chalk.green(`✓ Local package matches published version - no publish needed\n`))
                            return
                        } else if (versionExistsOnNpm && versionMatchesChecksum) {
                            console.log(chalk.green(`✓ Version ${localVersion} already published with matching content\n`))
                            return
                        } else if (versionExistsOnNpm && !versionMatchesChecksum) {
                            console.log(chalk.red(`\n✗ ERROR: Version ${localVersion} already exists on npm with different content!`))
                            console.log(chalk.magenta(`  Run with --rc flag to bump the version and publish these changes`))
                            return
                        }

                        // Determine npm tag based on version
                        const isReleaseCandidate = localVersion.includes('-rc.')
                        const npmTag = isReleaseCandidate ? 'next' : 'latest'

                        if (publishedInfo && !versionExistsOnNpm) {
                            console.log(chalk.yellow(`\n⚠️  Ready to publish new package ${name} version ${localVersion} to npmjs.com`))
                            console.log(chalk.yellow(`   Will be tagged as: ${chalk.bold(npmTag)}\n`))
                        } else {
                            console.log(chalk.yellow(`\n⚠️  Ready to publish new package ${name} version ${localVersion} to npmjs.com (first publish)`))
                            console.log(chalk.yellow(`   Will be tagged as: ${chalk.bold(npmTag)}\n`))
                        }

                        try {
                            const otp = await this.WorkspacePrompt.input({
                                message: 'Enter your npmjs.com OTP (one-time password):',
                                defaultValue: '',
                                validate: (input: string) => {
                                    if (!input || input.trim().length === 0) {
                                        return 'OTP is required'
                                    }
                                    return true
                                }
                            })

                            console.log(chalk.cyan(`\n🚀 Publishing '${name}' version ${localVersion} to npm with tag '${npmTag}'...`))
                            await $`npm publish --access public --tag ${npmTag} --otp=${otp}`.cwd(projectProjectionDir)
                            console.log(chalk.green(`✅ Successfully published '${name}' version ${localVersion} to npm (tag: ${npmTag})\n`))

                            // Write fact files after successful publish
                            const npmFactName = name.replace(/[@:\/]/g, '~')

                            await this.$NpmFact.set('packages', npmFactName, 'NpmPackage', {
                                name,
                                version: localVersion,
                                private: false,
                                shasum: localShasum,
                                integrity: localIntegrity,
                                publishedAt: new Date().toISOString(),
                                npmUrl: `https://www.npmjs.com/package/${name}`
                            })

                            await this.$StatusFact.set('ProjectPublishingStatus', npmFactName, 'ProjectPublishingStatus', {
                                projectName: name,
                                provider: 'npmjs.com',
                                status: 'PUBLISHED',
                                publicUrl: `https://www.npmjs.com/package/${name}`,
                                updatedAt: new Date().toISOString()
                            })
                        } catch (error: any) {
                            if (error.message?.includes('force closed') || error.message?.includes('SIGINT')) {
                                console.log(chalk.red(`\nABORTED\n`))
                                process.exit(1)
                            }
                            throw error
                        }
                    }
                },
            }
        }
    }, {
        // @ts-ignore - import.meta is supported in Bun
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/caps/providers/npmjs.com/ProjectPublishing.v0'



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
