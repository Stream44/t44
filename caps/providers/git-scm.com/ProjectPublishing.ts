
import { join } from 'path'
import { mkdir, access, readFile, writeFile, copyFile, rm, cp } from 'fs/promises'
import { constants } from 'fs'
import { $ } from 'bun'
import chalk from 'chalk'

const OI_REGISTRY_CAPSULE = '@t44.sh~t44~caps~providers~blockchaincommons.com~GordianOpenIntegrity'
const GENERATOR_FILE = '.git/o/GordianOpenIntegrity-generator.yaml'

async function copyFilesToSourceDirs({ files, sourceDir, targetDirs }: {
    files: string[]
    sourceDir: string
    targetDirs: (string | undefined | null)[]
}) {
    for (const targetDir of targetDirs) {
        if (!targetDir) continue
        for (const file of files) {
            const srcPath = join(sourceDir, file)
            const destPath = join(targetDir, file)
            try {
                await access(srcPath, constants.F_OK)
                await mkdir(join(destPath, '..'), { recursive: true })
                await copyFile(srcPath, destPath)
            } catch { }
        }
    }
}

async function fileExistsInGitHistory(stageDir: string, filePath: string): Promise<boolean> {
    const result = await $`git log --all --format=%H -1 -- ${filePath}`.cwd(stageDir).quiet().nothrow()
    return result.exitCode === 0 && result.text().trim().length > 0
}

async function fileExistsInWorkingTree(dir: string, filePath: string): Promise<boolean> {
    try {
        await access(join(dir, filePath), constants.F_OK)
        return true
    } catch {
        return false
    }
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
    // High level API that deals with everything concerning a git repository.
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#t44/structs/providers/git-scm.com/ProjectPublishingFact': {
                as: '$GitFact'
            },
            '#t44/structs/ProjectPublishingFact': {
                as: '$StatusFact'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt'
                },
                ProjectRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectRepository'
                },
                GordianOpenIntegrity: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44-blockchaincommons.com/caps/GordianOpenIntegrity'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/HomeRegistry'
                },
                ProjectCatalogs: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectCatalogs'
                },
                Dco: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/dco/caps/Dco'
                },
                SigningKey: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/SigningKey'
                },
                prepare: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { projectionDir, config }: { projectionDir: string, config: any }) {

                        const originUri = config.provider.config.RepositorySettings.origin

                        console.log(`Preparing git repo '${originUri}' from source '${config.sourceDir}' ...`)

                        const projectSourceDir = join(config.sourceDir)
                        const stageDir = join(projectionDir, 'stage', originUri.replace(/[\/]/g, '~'))

                        // Clone if repository doesn't exist yet
                        let isNewEmptyRepo = false
                        const repoExists = await this.ProjectRepository.exists({ rootDir: stageDir })
                        if (!repoExists) {
                            console.log(`Cloning repository from '${originUri}' ...`)
                            const result = await this.ProjectRepository.clone({ originUri, targetDir: stageDir })
                            isNewEmptyRepo = result.isNewEmptyRepo
                        }

                        // Set local git author from RepositorySettings config
                        const authorConfig = config.provider?.config?.RepositorySettings?.author
                        if (authorConfig?.name) {
                            await $`git config user.name ${authorConfig.name}`.cwd(stageDir).quiet()
                        }
                        if (authorConfig?.email) {
                            await $`git config user.email ${authorConfig.email}`.cwd(stageDir).quiet()
                        }

                        // Sync files using rsync with gitignore support and delete removed files
                        const gitignorePath = join(projectSourceDir, '.gitignore')
                        await this.ProjectRepository.sync({
                            rootDir: stageDir,
                            sourceDir: projectSourceDir,
                            gitignorePath,
                            excludePatterns: config.alwaysIgnore || []
                        })

                        // Generate files from config properties starting with '/'
                        // This happens AFTER rsync so generated files are not overwritten
                        if (config.provider.config) {
                            for (const [key, value] of Object.entries(config.provider.config)) {
                                if (key.startsWith('/')) {
                                    const targetPath = join(stageDir, key)
                                    const targetDir = join(targetPath, '..')

                                    // Check if file already exists
                                    let fileExists = false
                                    try {
                                        await access(targetPath, constants.F_OK)
                                        fileExists = true
                                    } catch {
                                        fileExists = false
                                    }

                                    if (fileExists) {
                                        console.log(`Overwriting file '${key}' in repository ...`)
                                    } else {
                                        console.log(`Creating file '${key}' in repository ...`)
                                    }

                                    // Ensure directory exists
                                    await mkdir(targetDir, { recursive: true })

                                    // Write file content
                                    const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
                                    await writeFile(targetPath, content, 'utf-8')
                                }
                            }
                        }

                        return {
                            originUri,
                            projectSourceDir,
                            stageDir,
                            isNewEmptyRepo
                        }
                    }
                },
                tag: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { metadata, repoSourceDir }: { metadata: any, repoSourceDir: string }) {

                        const { stageDir } = metadata

                        const packageJsonPath = join(repoSourceDir, 'package.json')
                        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                        const packageJson = JSON.parse(packageJsonContent)
                        const version = packageJson.version
                        const tag = `v${version}`

                        const headCommit = await this.ProjectRepository.getHeadCommit({ rootDir: stageDir })

                        if (!headCommit) {
                            console.log(chalk.gray(`  ○ Empty repository, skipping tag (will tag after first commit)\n`))
                            return
                        }

                        // Check if tag already exists locally
                        const localTag = await this.ProjectRepository.hasTag({ rootDir: stageDir, tag })
                        if (localTag.exists) {
                            if (localTag.commit === headCommit) {
                                console.log(chalk.gray(`  ○ Tag ${tag} already exists at current commit, skipping\n`))
                                return
                            }
                            console.log(chalk.yellow(`\n  Tag ${tag} exists at ${localTag.commit!.slice(0, 8)} but HEAD is ${headCommit.slice(0, 8)}\n`))
                            const diffText = await this.ProjectRepository.diff({ rootDir: stageDir, from: tag })
                            if (diffText.length > 0) {
                                console.log(diffText)
                            }
                            throw new Error(
                                `Git tag '${tag}' already exists but points to a different commit.\n` +
                                `  Please bump to a different version before pushing.`
                            )
                        }

                        // Check if tag already exists on remote
                        const remoteTag = await this.ProjectRepository.hasRemoteTag({ rootDir: stageDir, tag })
                        if (remoteTag.exists) {
                            if (remoteTag.commit === headCommit) {
                                console.log(chalk.gray(`  ○ Tag ${tag} already exists on remote at current commit, skipping\n`))
                                return
                            }
                            console.log(chalk.yellow(`\n  Tag ${tag} exists on remote at ${remoteTag.commit!.slice(0, 8)} but HEAD is ${headCommit.slice(0, 8)}\n`))
                            const diffText = await this.ProjectRepository.diff({ rootDir: stageDir, from: remoteTag.commit! })
                            if (diffText.length > 0) {
                                console.log(diffText)
                            }
                            throw new Error(
                                `Git tag '${tag}' already exists on remote but points to a different commit.\n` +
                                `  Please bump to a different version before pushing.`
                            )
                        }

                        await this.ProjectRepository.tag({ rootDir: stageDir, tag })
                        console.log(chalk.green(`  ✓ Tagged with ${tag}\n`))
                    }
                },
                push: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, dangerouslyResetMain, dangerouslyResetGordianOpenIntegrity, yesSignoff, metadata, projectSourceDir }: { config: any, dangerouslyResetMain?: boolean, dangerouslyResetGordianOpenIntegrity?: boolean, yesSignoff?: boolean, metadata: any, projectSourceDir?: string }) {

                        const {
                            originUri,
                            stageDir,
                            isNewEmptyRepo
                        } = metadata

                        // Check if GordianOpenIntegrity is enabled for this provider
                        const oiConfig = config.provider?.config?.['#@stream44.studio/t44-blockchaincommons.com']
                        const oiEnabled = oiConfig?.GordianOpenIntegrity === true

                        // Restore OI files that rsync --delete may have removed from the working tree.
                        // rsync syncs source → stage and deletes anything not in source. OI files like
                        // .repo-identifier and .o/* are committed in git but not in the source dir, so
                        // rsync removes them. We restore them here so all downstream code can rely on
                        // the working tree. This also copies them back to source dirs so future rsyncs
                        // preserve them.
                        if (oiEnabled && !dangerouslyResetMain) {
                            const hasRepoIdInHistory = await fileExistsInGitHistory(stageDir, '.repo-identifier')
                            const hasRepoIdInTree = await fileExistsInWorkingTree(stageDir, '.repo-identifier')

                            if (hasRepoIdInHistory && !hasRepoIdInTree) {
                                // .repo-identifier was committed but rsync deleted it — restore from git
                                await $`git checkout HEAD -- .repo-identifier`.cwd(stageDir).quiet().nothrow()
                            }

                            const hasOiYamlInHistory = await fileExistsInGitHistory(stageDir, '.o/GordianOpenIntegrity.yaml')
                            const hasOiYamlInTree = await fileExistsInWorkingTree(stageDir, '.o/GordianOpenIntegrity.yaml')

                            if (hasOiYamlInHistory && !hasOiYamlInTree) {
                                // OI files were committed but rsync deleted them — restore all from git
                                const oiFiles = await this.GordianOpenIntegrity.getTrackedFiles()
                                for (const file of oiFiles) {
                                    await $`git checkout HEAD -- ${file}`.cwd(stageDir).quiet().nothrow()
                                }
                            }

                            // Copy restored OI files back to source dirs so future rsyncs preserve them
                            if (hasRepoIdInHistory || hasOiYamlInHistory) {
                                const oiFiles = await this.GordianOpenIntegrity.getTrackedFiles()
                                await copyFilesToSourceDirs({
                                    files: oiFiles,
                                    sourceDir: stageDir,
                                    targetDirs: [config.sourceDir, projectSourceDir],
                                })
                            }
                        }

                        if (dangerouslyResetMain) {
                            if (oiEnabled) {
                                console.log(`Reset mode enabled with GordianOpenIntegrity - will create a fresh open integrity repo`)
                            } else {
                                console.log(`Reset mode enabled - will reset repository to initial commit`)
                            }
                        }

                        // Git add and check for changes
                        console.log(`Committing changes ...`)
                        let hasNewChanges = await this.ProjectRepository.addAll({ rootDir: stageDir })

                        // Handle reset (works on existing commits, regardless of new changes)
                        let shouldReset = false
                        if (dangerouslyResetMain) {

                            // Check if the repo already has commits
                            const headCommit = await this.ProjectRepository.getHeadCommit({ rootDir: stageDir })
                            const hasExistingCommits = !!headCommit

                            if (hasExistingCommits) {
                                // Repo has commits — warn user and require confirmation
                                const descriptionLines = oiEnabled
                                    ? [
                                        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                        'This will create a fresh GordianOpenIntegrity repository.',
                                        '',
                                        'What this means:',
                                        '  • The existing local stage repo will be deleted entirely',
                                        '  • A new repo will be created with a cryptographic inception commit',
                                        '  • An XID identity and SSH signing key will be generated',
                                        '  • All source files will be added as a signed commit',
                                        '  • The new repo will be force pushed, destroying all remote history',
                                        '  • All existing commit history, tags, and signatures will be lost',
                                        '',
                                        'This cannot be undone once pushed to remote.',
                                        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                                    ]
                                    : [
                                        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                        'Resetting will:',
                                        '  • Destroy all commit history in the local repository',
                                        '  • Destroy all commit history on GitHub when force pushed',
                                        '  • Cannot be undone once pushed to remote',
                                        '',
                                        'This should ONLY be done at the very beginning of a project.',
                                        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                                    ]

                                shouldReset = await this.WorkspacePrompt.confirm({
                                    title: '⚠️  WARNING: DESTRUCTIVE OPERATION ⚠️',
                                    description: descriptionLines,
                                    message: oiEnabled
                                        ? 'Are you absolutely sure you want to recreate this as a GordianOpenIntegrity repo?'
                                        : 'Are you absolutely sure you want to reset all commits and destroy the history?',
                                    defaultValue: false,
                                    onSuccess: async (confirmed: boolean) => {
                                        if (confirmed) {
                                            const chalk = (await import('chalk')).default
                                            if (oiEnabled) {
                                                console.log(chalk.cyan(`\nCreating fresh GordianOpenIntegrity repository ...`))
                                            } else {
                                                console.log(chalk.cyan(`\nResetting all commits to initial commit ...`))
                                            }
                                        } else {
                                            console.log('\nReset operation cancelled. Pushing without resetting...\n')
                                        }
                                    }
                                })
                            } else {
                                // No existing commits — safe to proceed without confirmation
                                shouldReset = true
                            }

                            if (shouldReset && oiEnabled) {
                                // GordianOpenIntegrity reset: create a fresh OI repo

                                // Get author info from workspace.yaml config
                                const authorConfig = config.provider?.config?.RepositorySettings?.author
                                if (!authorConfig?.name || !authorConfig?.email) {
                                    throw new Error('GordianOpenIntegrity requires author.name and author.email in RepositorySettings config')
                                }
                                const authorName = authorConfig.name
                                const authorEmail = authorConfig.email

                                // Resolve the workspace signing key
                                const signingKeyPath = await this.SigningKey.getKeyPath()
                                const signingPublicKey = await this.SigningKey.getPublicKey()
                                const signingFingerprint = await this.SigningKey.getFingerprint()
                                const signingKeyName = await this.SigningKey.getKeyName()
                                if (!signingKeyPath || !signingPublicKey || !signingFingerprint) {
                                    throw new Error('Signing key not configured. Run SigningKey.ensureKey() first.')
                                }
                                console.log(chalk.gray(`  Signing key: ${signingKeyName} (${signingKeyPath})`))

                                // Delete existing OI registry data for the previous repo DID
                                const registryRootDir_ = await this.HomeRegistry.rootDir
                                try {
                                    const existingOiYaml = await readFile(join(stageDir, '.o', 'GordianOpenIntegrity.yaml'), 'utf-8')
                                    const existingDidMatch = existingOiYaml.match(/^#\s*Repository DID:\s*(.+)$/m)
                                    if (existingDidMatch) {
                                        const existingDid = existingDidMatch[1].trim()
                                        const existingOiRegistryDir = join(registryRootDir_, OI_REGISTRY_CAPSULE, existingDid)
                                        try {
                                            await access(existingOiRegistryDir, constants.F_OK)
                                            console.log(`Removing existing OI registry for ${existingDid} ...`)
                                            await rm(existingOiRegistryDir, { recursive: true, force: true })
                                        } catch { }
                                    }
                                } catch { }

                                // Delete existing stage dir to start completely fresh
                                console.log(`Removing existing stage directory ...`)
                                await rm(stageDir, { recursive: true, force: true })

                                // Remove stale DCO signatures from source dirs (fresh repo = fresh DCO)
                                for (const dir of [config.sourceDir, projectSourceDir].filter(Boolean)) {
                                    await rm(join(dir!, '.dco-signatures'), { force: true })
                                }

                                // Create OI inception repo at stageDir using the workspace signing key
                                console.log(`Creating GordianOpenIntegrity inception repository ...`)
                                console.log(chalk.gray(`  Author: ${authorName} <${authorEmail}>`))
                                const repoResult = await this.GordianOpenIntegrity.createRepository({
                                    repoDir: stageDir,
                                    authorName,
                                    authorEmail,
                                    firstTrustKeyPath: signingKeyPath,
                                    provenanceKeyPath: signingKeyPath,
                                })
                                console.log(chalk.green(`  ✓ Inception commit: ${repoResult.commitHash.slice(0, 8)}`))
                                console.log(chalk.green(`  ✓ DID: ${repoResult.did}`))

                                // Set local git author on the fresh repo (needed for DCO signing)
                                await $`git config user.name ${authorName}`.cwd(stageDir).quiet()
                                await $`git config user.email ${authorEmail}`.cwd(stageDir).quiet()

                                // Store generator and metadata in the registry
                                const registryRootDir = await this.HomeRegistry.rootDir
                                const oiRegistryDir = join(registryRootDir, OI_REGISTRY_CAPSULE, repoResult.did)
                                await mkdir(oiRegistryDir, { recursive: true })

                                console.log(chalk.green(`  ✓ Using workspace signing key: ${signingKeyName} (${signingFingerprint})`))
                                console.log(chalk.green(`    ${signingKeyPath}`))

                                // Copy the generator file from the repo's .git dir to the registry
                                const repoGeneratorPath = join(stageDir, GENERATOR_FILE)
                                const registryGeneratorPath = join(oiRegistryDir, 'GordianOpenIntegrity-generator.yaml')
                                await cp(repoGeneratorPath, registryGeneratorPath)
                                console.log(chalk.green(`  ✓ Generator stored at: ${registryGeneratorPath}`))

                                // Write repo.json metadata to the registry
                                const repoMeta: Record<string, any> = {
                                    did: repoResult.did,
                                    firstCommit: repoResult.commitHash,
                                    firstCommitDate: new Date().toISOString(),
                                    origin: originUri,
                                }
                                // Try to read packageName from source package.json
                                try {
                                    const pkgPath = join(config.sourceDir, 'package.json')
                                    const pkgContent = await readFile(pkgPath, 'utf-8')
                                    const pkg = JSON.parse(pkgContent)
                                    if (pkg.name) {
                                        repoMeta.packageName = pkg.name
                                    }
                                } catch { }
                                await writeFile(join(oiRegistryDir, 'repo.json'), JSON.stringify(repoMeta, null, 2), 'utf-8')
                                console.log(chalk.green(`  ✓ Registry metadata stored at: ${join(oiRegistryDir, 'repo.json')}`))

                                // Copy all OI tracked files back to source directories
                                const oiTrackedFiles__ = await this.GordianOpenIntegrity.getTrackedFiles()
                                await copyFilesToSourceDirs({
                                    files: oiTrackedFiles__,
                                    sourceDir: stageDir,
                                    targetDirs: [config.sourceDir, projectSourceDir],
                                })
                                console.log(chalk.green(`  ✓ Copied OI files to source directories`))

                                // Update Repository DID in README.md files if present
                                const DID_PATTERN = /^(Repository DID: `)([^`]*)(`)$/m
                                for (const dir of [config.sourceDir, projectSourceDir].filter(Boolean)) {
                                    const readmePath = join(dir!, 'README.md')
                                    try {
                                        const readmeContent = await readFile(readmePath, 'utf-8')
                                        if (DID_PATTERN.test(readmeContent)) {
                                            const updated = readmeContent.replace(DID_PATTERN, `$1${repoResult.did}$3`)
                                            await writeFile(readmePath, updated, 'utf-8')
                                        }
                                    } catch { }
                                }

                                // Sync source files into the OI repo
                                console.log(`Syncing source files ...`)
                                const gitignorePath = join(config.sourceDir, '.gitignore')
                                await this.ProjectRepository.sync({
                                    rootDir: stageDir,
                                    sourceDir: config.sourceDir,
                                    gitignorePath,
                                    excludePatterns: config.alwaysIgnore || []
                                })

                                // Generate files from config properties starting with '/'
                                if (config.provider.config) {
                                    for (const [key, value] of Object.entries(config.provider.config)) {
                                        if (key.startsWith('/')) {
                                            const targetPath = join(stageDir, key)
                                            const targetDir = join(targetPath, '..')
                                            await mkdir(targetDir, { recursive: true })
                                            const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
                                            await writeFile(targetPath, content, 'utf-8')
                                        }
                                    }
                                }

                                // Run DCO signing process if DCO.md is present
                                const hasDco = await this.Dco.hasDco({ repoDir: stageDir })
                                if (hasDco) {
                                    console.log(chalk.cyan(`DCO.md detected — running DCO signing process ...`))
                                    await this.Dco.sign({ repoDir: stageDir, autoAgree: yesSignoff, signingKeyPath })
                                }

                                // Stage all files and commit as a signed commit
                                console.log(`Committing source content as signed commit ...`)
                                await $`git add -A`.cwd(stageDir).quiet()
                                await this.GordianOpenIntegrity.commitToRepository({
                                    repoDir: stageDir,
                                    authorName,
                                    authorEmail,
                                    signingKeyPath,
                                    message: 'Published using @Stream44 Studio',
                                })
                                console.log(chalk.green(`  ✓ Source content committed`))

                                // Copy .dco-signatures back to project source so it persists
                                if (hasDco && projectSourceDir) {
                                    const stageSigFile = join(stageDir, '.dco-signatures')
                                    try {
                                        await access(stageSigFile, constants.F_OK)
                                        await copyFile(stageSigFile, join(projectSourceDir, '.dco-signatures'))
                                    } catch { }
                                }

                                // Add remote origin and force push
                                const hasRemote = await this.ProjectRepository.hasRemote({ rootDir: stageDir, name: 'origin' })
                                if (!hasRemote) {
                                    await this.ProjectRepository.addRemote({ rootDir: stageDir, name: 'origin', url: originUri })
                                }

                                console.log(`Force pushing to remote ...`)
                                await $`git push --force -u origin main --tags`.cwd(stageDir)
                                console.log(chalk.green(`  ✓ Force pushed to remote`))

                                // Write fact files
                                const lastCommit = await this.ProjectRepository.getHeadCommit({ rootDir: stageDir })
                                const lastCommitMessage = await this.ProjectRepository.getLastCommitMessage({ rootDir: stageDir })
                                const branch = await this.ProjectRepository.getBranch({ rootDir: stageDir })

                                const repoFactName = originUri.replace(/[\/]/g, '~')

                                await this.$GitFact.set(repoFactName, {
                                    origin: originUri,
                                    branch: branch,
                                    lastCommit: lastCommit,
                                    lastCommitMessage: lastCommitMessage,
                                    pushedAt: new Date().toISOString()
                                })

                                await this.$StatusFact.set(repoFactName, {
                                    projectName: originUri,
                                    provider: 'git-scm.com',
                                    status: 'PUBLISHED',
                                    publicUrl: originUri
                                })

                                return
                            } else if (shouldReset) {
                                await this.ProjectRepository.squashAllCommits({
                                    rootDir: stageDir,
                                    message: 'Published using @Stream44 Studio'
                                })
                                console.log(`Repository reset to initial commit`)
                            }
                        }

                        // Handle Gordian Open Integrity trust root reset (without deleting git history)
                        if (dangerouslyResetGordianOpenIntegrity && oiEnabled && !dangerouslyResetMain) {
                            console.log(chalk.cyan(`\nResetting Gordian Open Integrity trust root ...`))

                            // Get author info from workspace.yaml config
                            const authorConfig = config.provider?.config?.RepositorySettings?.author
                            if (!authorConfig?.name || !authorConfig?.email) {
                                throw new Error('GordianOpenIntegrity requires author.name and author.email in RepositorySettings config')
                            }
                            const authorName = authorConfig.name
                            const authorEmail = authorConfig.email

                            // Resolve the workspace signing key
                            const signingKeyPath = await this.SigningKey.getKeyPath()
                            const signingPublicKey = await this.SigningKey.getPublicKey()
                            const signingFingerprint = await this.SigningKey.getFingerprint()
                            const signingKeyName = await this.SigningKey.getKeyName()
                            if (!signingKeyPath || !signingPublicKey || !signingFingerprint) {
                                throw new Error('Signing key not configured. Run SigningKey.ensureKey() first.')
                            }
                            console.log(chalk.gray(`  Signing key: ${signingKeyName} (${signingKeyPath})`))
                            console.log(chalk.gray(`  Author: ${authorName} <${authorEmail}>`))

                            const repoIdentifierExists = await fileExistsInWorkingTree(stageDir, '.repo-identifier')

                            let repoResult: any
                            if (repoIdentifierExists) {
                                // .repo-identifier exists — reset trust root only
                                console.log(chalk.gray(`  Found existing .repo-identifier — resetting trust root only`))
                                repoResult = await this.GordianOpenIntegrity.createTrustRoot({
                                    repoDir: stageDir,
                                    authorName,
                                    authorEmail,
                                    firstTrustKeyPath: signingKeyPath,
                                    provenanceKeyPath: signingKeyPath,
                                })
                            } else {
                                // No .repo-identifier — create full repository (identifier + trust root)
                                console.log(chalk.gray(`  No .repo-identifier found — creating repository identifier and trust root`))
                                repoResult = await this.GordianOpenIntegrity.createRepository({
                                    repoDir: stageDir,
                                    authorName,
                                    authorEmail,
                                    firstTrustKeyPath: signingKeyPath,
                                    provenanceKeyPath: signingKeyPath,
                                })
                            }
                            console.log(chalk.green(`  ✓ New trust root created`))
                            console.log(chalk.green(`  ✓ DID: ${repoResult.did}`))

                            // Copy all OI tracked files back to source directories
                            const oiTrackedFiles = await this.GordianOpenIntegrity.getTrackedFiles()
                            await copyFilesToSourceDirs({
                                files: oiTrackedFiles,
                                sourceDir: stageDir,
                                targetDirs: [config.sourceDir, projectSourceDir],
                            })
                            console.log(chalk.green(`  ✓ Copied OI files to source directories`))

                            // Update Repository DID in README.md files if present
                            const DID_PATTERN = /^(Repository DID: `)([^`]*)(`)$/m
                            for (const dir of [stageDir, config.sourceDir, projectSourceDir].filter(Boolean)) {
                                const readmePath = join(dir!, 'README.md')
                                try {
                                    const readmeContent = await readFile(readmePath, 'utf-8')
                                    if (DID_PATTERN.test(readmeContent)) {
                                        const updated = readmeContent.replace(DID_PATTERN, `$1${repoResult.did}$3`)
                                        await writeFile(readmePath, updated, 'utf-8')
                                        console.log(chalk.green(`  ✓ Updated Repository DID in ${readmePath}`))
                                    }
                                } catch { }
                            }

                            // Store generator in the registry
                            const registryRootDir = await this.HomeRegistry.rootDir
                            const oiRegistryDir = join(registryRootDir, OI_REGISTRY_CAPSULE, repoResult.did)
                            await mkdir(oiRegistryDir, { recursive: true })

                            const repoGeneratorPath = join(stageDir, GENERATOR_FILE)
                            const registryGeneratorPath = join(oiRegistryDir, 'GordianOpenIntegrity-generator.yaml')
                            await cp(repoGeneratorPath, registryGeneratorPath)
                            console.log(chalk.green(`  ✓ Generator stored at: ${registryGeneratorPath}`))
                        }

                        // Auto-initialize GordianOpenIntegrity if enabled but not yet set up
                        // This handles: (1) first publish of a new repo, (2) OI newly enabled on existing repo
                        if (oiEnabled && !dangerouslyResetMain && !dangerouslyResetGordianOpenIntegrity) {
                            const repoIdentifierExists = await fileExistsInWorkingTree(stageDir, '.repo-identifier')

                            if (!repoIdentifierExists) {
                                console.log(chalk.cyan(`\nInitializing Gordian Open Integrity (first time setup) ...`))

                                // Get author info from workspace.yaml config
                                const authorConfig = config.provider?.config?.RepositorySettings?.author
                                if (!authorConfig?.name || !authorConfig?.email) {
                                    throw new Error('GordianOpenIntegrity requires author.name and author.email in RepositorySettings config')
                                }
                                const authorName = authorConfig.name
                                const authorEmail = authorConfig.email

                                // Resolve the workspace signing key
                                const signingKeyPath = await this.SigningKey.getKeyPath()
                                const signingPublicKey = await this.SigningKey.getPublicKey()
                                const signingFingerprint = await this.SigningKey.getFingerprint()
                                const signingKeyName = await this.SigningKey.getKeyName()
                                if (!signingKeyPath || !signingPublicKey || !signingFingerprint) {
                                    throw new Error('Signing key not configured. Run SigningKey.ensureKey() first.')
                                }
                                console.log(chalk.gray(`  Signing key: ${signingKeyName} (${signingKeyPath})`))
                                console.log(chalk.gray(`  Author: ${authorName} <${authorEmail}>`))

                                // Create full OI repository (identifier + trust root)
                                const repoResult = await this.GordianOpenIntegrity.createRepository({
                                    repoDir: stageDir,
                                    authorName,
                                    authorEmail,
                                    firstTrustKeyPath: signingKeyPath,
                                    provenanceKeyPath: signingKeyPath,
                                })
                                console.log(chalk.green(`  ✓ GordianOpenIntegrity initialized`))
                                console.log(chalk.green(`  ✓ DID: ${repoResult.did}`))

                                // Copy all OI tracked files back to source directories
                                const oiTrackedFiles_ = await this.GordianOpenIntegrity.getTrackedFiles()
                                await copyFilesToSourceDirs({
                                    files: oiTrackedFiles_,
                                    sourceDir: stageDir,
                                    targetDirs: [config.sourceDir, projectSourceDir],
                                })
                                console.log(chalk.green(`  ✓ Copied OI files to source directories`))

                                // Update Repository DID in README.md files if present
                                const DID_PATTERN = /^(Repository DID: `)([^`]*)(`)$/m
                                for (const dir of [stageDir, config.sourceDir, projectSourceDir].filter(Boolean)) {
                                    const readmePath = join(dir!, 'README.md')
                                    try {
                                        const readmeContent = await readFile(readmePath, 'utf-8')
                                        if (DID_PATTERN.test(readmeContent)) {
                                            const updated = readmeContent.replace(DID_PATTERN, `$1${repoResult.did}$3`)
                                            await writeFile(readmePath, updated, 'utf-8')
                                            console.log(chalk.green(`  ✓ Updated Repository DID in ${readmePath}`))
                                        }
                                    } catch { }
                                }

                                // Store generator in the registry
                                const registryRootDir = await this.HomeRegistry.rootDir
                                const oiRegistryDir = join(registryRootDir, OI_REGISTRY_CAPSULE, repoResult.did)
                                await mkdir(oiRegistryDir, { recursive: true })

                                const repoGeneratorPath = join(stageDir, GENERATOR_FILE)
                                const registryGeneratorPath = join(oiRegistryDir, 'GordianOpenIntegrity-generator.yaml')
                                await cp(repoGeneratorPath, registryGeneratorPath)
                                console.log(chalk.green(`  ✓ Generator stored at: ${registryGeneratorPath}`))

                                // Write repo.json metadata to the registry
                                const repoMeta: Record<string, any> = {
                                    did: repoResult.did,
                                    firstCommit: repoResult.commitHash,
                                    firstCommitDate: new Date().toISOString(),
                                    origin: originUri,
                                }
                                try {
                                    const pkgPath = join(config.sourceDir, 'package.json')
                                    const pkgContent = await readFile(pkgPath, 'utf-8')
                                    const pkg = JSON.parse(pkgContent)
                                    if (pkg.name) {
                                        repoMeta.packageName = pkg.name
                                    }
                                } catch { }
                                await writeFile(join(oiRegistryDir, 'repo.json'), JSON.stringify(repoMeta, null, 2), 'utf-8')
                                console.log(chalk.green(`  ✓ Registry metadata stored at: ${join(oiRegistryDir, 'repo.json')}`))

                                // Re-stage all files since OI added new files and update hasNewChanges
                                hasNewChanges = await this.ProjectRepository.addAll({ rootDir: stageDir })
                                if (!hasNewChanges) hasNewChanges = true  // OI commits created new state to push
                            }
                        }

                        if (!dangerouslyResetMain && hasNewChanges) {
                            // Check if DCO.md exists in the stage dir
                            const hasDco = await this.Dco.hasDco({ repoDir: stageDir })

                            if (hasDco) {
                                console.log(chalk.cyan(`DCO.md detected — running DCO signing process ...`))

                                // Resolve signing key from workspace SigningKey capsule
                                let signingKeyPath: string | undefined
                                const skPath = await this.SigningKey.getKeyPath()
                                if (skPath) {
                                    signingKeyPath = skPath
                                }

                                await this.Dco.signAndCommit({
                                    repoDir: stageDir,
                                    message: 'Published using @Stream44 Studio',
                                    autoAgree: yesSignoff,
                                    signingKeyPath,
                                    projectSourceDir,
                                })
                            } else {
                                await this.ProjectRepository.commit({
                                    rootDir: stageDir,
                                    message: 'Published using @Stream44 Studio'
                                })
                            }
                            console.log(`New changes committed`)
                        } else {
                            console.log(`No new changes to commit`)
                        }

                        // Copy OI tracked files back to source directories so rsync preserves them
                        if (oiEnabled) {
                            const oiFiles = await this.GordianOpenIntegrity.getTrackedFiles()
                            await copyFilesToSourceDirs({
                                files: oiFiles,
                                sourceDir: stageDir,
                                targetDirs: [config.sourceDir, projectSourceDir],
                            })
                        }

                        // Check if local is ahead of remote
                        let localAheadOfRemote = false
                        if (!shouldReset && !hasNewChanges && !isNewEmptyRepo) {
                            localAheadOfRemote = await this.ProjectRepository.isAheadOfRemote({ rootDir: stageDir })
                        }

                        // Push to remote
                        if (shouldReset) {
                            console.log(`Force pushing to remote ...`)
                            await this.ProjectRepository.forcePush({ rootDir: stageDir })
                            console.log(`Force pushed to remote`)
                        } else if (isNewEmptyRepo || hasNewChanges || localAheadOfRemote) {
                            console.log(`Pushing to remote ...`)
                            await this.ProjectRepository.push({ rootDir: stageDir })
                            console.log(`Pushed to remote`)
                        }

                        // Write fact files
                        const lastCommit = await this.ProjectRepository.getHeadCommit({ rootDir: stageDir })
                        const lastCommitMessage = await this.ProjectRepository.getLastCommitMessage({ rootDir: stageDir })
                        const branch = await this.ProjectRepository.getBranch({ rootDir: stageDir })

                        const repoFactName = originUri.replace(/[\/]/g, '~')

                        await this.$GitFact.set(repoFactName, {
                            origin: originUri,
                            branch: branch,
                            lastCommit: lastCommit,
                            lastCommitMessage: lastCommitMessage,
                            pushedAt: new Date().toISOString()
                        })

                        await this.$StatusFact.set(repoFactName, {
                            projectName: originUri,
                            provider: 'git-scm.com',
                            status: hasNewChanges || shouldReset || localAheadOfRemote ? 'PUBLISHED' : 'READY',
                            publicUrl: originUri
                        })

                    }
                },
                afterPush: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { repoName, config, metadata }: {
                        repoName: string
                        config: any
                        metadata?: any
                    }): Promise<void> {
                        if (!metadata) return

                        const branch = await this.ProjectRepository.getBranch({ rootDir: metadata.stageDir })
                        const commit = await this.ProjectRepository.getHeadCommit({ rootDir: metadata.stageDir })

                        const gitData: Record<string, any> = {
                            branches: {},
                        }
                        if (branch && commit) {
                            const branchEntry: Record<string, any> = { commit }
                            try {
                                const tagResult = await $`git tag --points-at ${commit}`.cwd(metadata.stageDir).quiet().nothrow()
                                const tag = tagResult.text().trim().split('\n').filter(Boolean).pop()
                                if (tag) branchEntry.tag = tag
                            } catch { }
                            gitData.branches[branch] = branchEntry
                        }

                        await this.ProjectCatalogs.updateCatalogRepository({
                            repoName,
                            providerKey: '#' + capsule['#'],
                            providerData: gitData,
                        })

                        const oiConfig = config.provider?.config?.['#@stream44.studio/t44-blockchaincommons.com']
                        if (oiConfig?.GordianOpenIntegrity === true) {
                            const oiYamlPath = join(metadata.stageDir, '.o', 'GordianOpenIntegrity.yaml')
                            try {
                                const oiContent = await readFile(oiYamlPath, 'utf-8')
                                const didMatch = oiContent.match(/^#\s*Repository DID:\s*(.+)$/m)
                                const currentMarkMatch = oiContent.match(/^#\s*Current Mark:\s*(\S+)/m)
                                const inceptionMarkMatch = oiContent.match(/^#\s*Inception Mark:\s*(\S+)/m)
                                if (didMatch) {
                                    await this.ProjectCatalogs.updateCatalogRepository({
                                        repoName,
                                        providerKey: '#t44/caps/providers/blockchaincommons.com/GordianOpenIntegrity',
                                        providerData: {
                                            did: didMatch[1].trim(),
                                            inceptionMark: inceptionMarkMatch?.[1] || undefined,
                                            currentMark: currentMarkMatch?.[1] || undefined,
                                        },
                                    })
                                }
                            } catch { }
                        }
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
capsule['#'] = 't44/caps/providers/git-scm.com/ProjectPublishing'
