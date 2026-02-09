
import { join } from 'path'
import { $ } from 'bun'
import { mkdir, access, readFile, writeFile } from 'fs/promises'
import { constants } from 'fs'
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
    // High level API that deals with everything concerning a git repository.
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#t44/structs/providers/git-scm.com/ProjectPublishingFact.v0': {
                as: '$GitFact'
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
                    value: async function (this: any, { projectionDir, config }: { projectionDir: string, config: any }) {

                        const originUri = config.provider.config.RepositorySettings.origin

                        console.log(`Preparing git repo '${originUri}' from source '${config.sourceDir}' ...`)

                        const projectSourceDir = join(config.sourceDir)
                        const projectProjectionDir = join(projectionDir, 'repos', originUri.replace(/[@:\/]/g, '~'))

                        // Check if repository directory exists
                        let repoExists = false
                        try {
                            await access(projectProjectionDir, constants.F_OK)
                            repoExists = true
                        } catch {
                            repoExists = false
                        }

                        let isNewEmptyRepo = false
                        if (!repoExists) {
                            // Clone the repository if it doesn't exist
                            console.log(`Cloning repository from '${originUri}' ...`)
                            const reposDir = join(projectionDir, 'repos')
                            await mkdir(reposDir, { recursive: true })
                            await $`git clone "${originUri}" "${projectProjectionDir}"`.cwd(reposDir)

                            // Check if the cloned repo is empty (no commits)
                            const headCheck = await $`git rev-parse HEAD`.cwd(projectProjectionDir).quiet().nothrow()
                            if (headCheck.exitCode !== 0) {
                                isNewEmptyRepo = true
                            }
                        }

                        // Sync files using rsync with gitignore support and delete removed files
                        // --exclude-from reads patterns from .gitignore
                        // --exclude '.git' ensures we don't copy git metadata
                        // --delete removes files in dest that are no longer in source
                        const gitignorePath = join(projectSourceDir, '.gitignore')
                        await $`rsync -a --delete --exclude '.git' --exclude-from="${gitignorePath}" "${projectSourceDir}/" "${projectProjectionDir}/"`

                        // Generate files from config properties starting with '/'
                        // This happens AFTER rsync so generated files are not overwritten
                        if (config.provider.config) {
                            for (const [key, value] of Object.entries(config.provider.config)) {
                                if (key.startsWith('/')) {
                                    const targetPath = join(projectProjectionDir, key)
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
                            projectProjectionDir,
                            isNewEmptyRepo
                        }
                    }
                },
                tag: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { metadata, repoSourceDir }: { metadata: any, repoSourceDir: string }) {

                        const { projectProjectionDir } = metadata

                        const packageJsonPath = join(repoSourceDir, 'package.json')
                        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                        const packageJson = JSON.parse(packageJsonContent)
                        const version = packageJson.version
                        const tag = `v${version}`

                        const headCommit = (await $`git rev-parse HEAD`.cwd(projectProjectionDir).quiet().nothrow()).text().trim()

                        // Check if tag already exists locally
                        const localTagCheck = await $`git tag -l ${tag}`.cwd(projectProjectionDir).quiet().nothrow()
                        if (localTagCheck.text().trim() === tag) {
                            const tagCommit = (await $`git rev-parse ${tag}^{}`.cwd(projectProjectionDir).quiet().nothrow()).text().trim()
                            if (tagCommit === headCommit) {
                                console.log(chalk.gray(`  ○ Tag ${tag} already exists at current commit, skipping\n`))
                                return
                            }
                            console.log(chalk.yellow(`\n  Tag ${tag} exists at ${tagCommit.slice(0, 8)} but HEAD is ${headCommit.slice(0, 8)}\n`))
                            const diffOutput = await $`git diff ${tag} HEAD`.cwd(projectProjectionDir).quiet().nothrow()
                            if (diffOutput.text().trim().length > 0) {
                                console.log(diffOutput.text())
                            }
                            throw new Error(
                                `Git tag '${tag}' already exists but points to a different commit.\n` +
                                `  Please bump to a different version before pushing.`
                            )
                        }

                        // Check if tag already exists on remote
                        const remoteTagCheck = await $`git ls-remote --tags origin ${tag}`.cwd(projectProjectionDir).quiet().nothrow()
                        const remoteOutput = remoteTagCheck.text().trim()
                        if (remoteOutput.length > 0) {
                            const remoteCommit = remoteOutput.split(/\s+/)[0]
                            if (remoteCommit === headCommit) {
                                console.log(chalk.gray(`  ○ Tag ${tag} already exists on remote at current commit, skipping\n`))
                                return
                            }
                            console.log(chalk.yellow(`\n  Tag ${tag} exists on remote at ${remoteCommit.slice(0, 8)} but HEAD is ${headCommit.slice(0, 8)}\n`))
                            const remoteDiffOutput = await $`git diff ${remoteCommit} HEAD`.cwd(projectProjectionDir).quiet().nothrow()
                            if (remoteDiffOutput.text().trim().length > 0) {
                                console.log(remoteDiffOutput.text())
                            }
                            throw new Error(
                                `Git tag '${tag}' already exists on remote but points to a different commit.\n` +
                                `  Please bump to a different version before pushing.`
                            )
                        }

                        await $`git tag ${tag}`.cwd(projectProjectionDir)
                        console.log(chalk.green(`  ✓ Tagged with ${tag}\n`))
                    }
                },
                push: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, dangerouslyResetMain, metadata }: { config: any, dangerouslyResetMain?: boolean, metadata: any }) {

                        const {
                            originUri,
                            projectProjectionDir,
                            isNewEmptyRepo
                        } = metadata

                        if (dangerouslyResetMain) {
                            console.log(`Reset mode enabled - will reset repository to initial commit`)
                        }

                        // Git add, commit, and push changes
                        console.log(`Committing changes ...`)
                        await $`git add .`.cwd(projectProjectionDir)

                        // Check if there are changes to commit
                        const statusResult = await $`git status --porcelain`.cwd(projectProjectionDir).text()
                        const hasNewChanges = statusResult.trim().length > 0

                        // Handle reset (works on existing commits, regardless of new changes)
                        let shouldReset = false
                        if (dangerouslyResetMain) {
                            shouldReset = await this.WorkspacePrompt.confirm({
                                title: '⚠️  WARNING: DESTRUCTIVE OPERATION ⚠️',
                                description: [
                                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                    'Resetting will:',
                                    '  • Destroy all commit history in the local repository',
                                    '  • Destroy all commit history on GitHub when force pushed',
                                    '  • Cannot be undone once pushed to remote',
                                    '',
                                    'This should ONLY be done at the very beginning of a project.',
                                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                                ],
                                message: 'Are you absolutely sure you want to reset all commits and destroy the history?',
                                defaultValue: false,
                                onSuccess: async (confirmed: boolean) => {
                                    if (confirmed) {
                                        const chalk = (await import('chalk')).default
                                        console.log(chalk.cyan(`\nResetting all commits to initial commit ...`))
                                    } else {
                                        console.log('\nReset operation cancelled. Pushing without resetting...\n')
                                    }
                                }
                            })

                            if (shouldReset) {
                                // Get the initial commit (root commit)
                                const rootCommit = await $`git rev-list --max-parents=0 HEAD`.cwd(projectProjectionDir).text()
                                const rootCommitHash = rootCommit.trim()

                                // Soft reset to the root commit, keeping all changes staged
                                await $`git reset --soft ${rootCommitHash}`.cwd(projectProjectionDir)

                                // Commit all changes as a single commit (this replaces the root commit)
                                await $`git commit --amend -m "Published using @Stream44 Studio"`.cwd(projectProjectionDir)

                                console.log(`Repository reset to initial commit`)
                            }
                        } else if (hasNewChanges) {
                            // Only commit new changes if not resetting
                            await $`git commit -m "Published using @Stream44 Studio"`.cwd(projectProjectionDir)
                            console.log(`New changes committed`)
                        } else {
                            console.log(`No new changes to commit`)
                        }

                        // Check if local is ahead of remote using ls-remote (not cached refs)
                        let localAheadOfRemote = false
                        if (!shouldReset && !hasNewChanges && !isNewEmptyRepo) {
                            const lsRemoteResult = await $`git ls-remote origin`.cwd(projectProjectionDir).quiet().nothrow()
                            const lsRemoteOutput = lsRemoteResult.text().trim()

                            if (!lsRemoteOutput) {
                                // Remote is completely empty — must push
                                localAheadOfRemote = true
                            } else {
                                // Parse remote HEAD ref
                                const localHead = (await $`git rev-parse HEAD`.cwd(projectProjectionDir).quiet()).text().trim()
                                const remoteHeadLine = lsRemoteOutput.split('\n').find((l: string) => l.includes('refs/heads/main'))
                                const remoteHead = remoteHeadLine ? remoteHeadLine.split('\t')[0] : null

                                if (!remoteHead || remoteHead !== localHead) {
                                    localAheadOfRemote = true
                                }
                            }
                        }

                        // Push to remote
                        if (shouldReset) {
                            console.log(`Force pushing to remote ...`)
                            await $`git push --force --tags`.cwd(projectProjectionDir)
                            console.log(`Force pushed to remote`)
                        } else if (isNewEmptyRepo || hasNewChanges || localAheadOfRemote) {
                            console.log(`Pushing to remote ...`)
                            await $`git push -u origin main --tags`.cwd(projectProjectionDir)
                            console.log(`Pushed to remote`)
                        }

                        // Write fact files
                        const lastCommit = await $`git rev-parse HEAD`.cwd(projectProjectionDir).text()
                        const lastCommitMessage = await $`git log -1 --pretty=%B`.cwd(projectProjectionDir).text()
                        const branch = await $`git rev-parse --abbrev-ref HEAD`.cwd(projectProjectionDir).text()

                        const repoFactName = originUri.replace(/[@:\/]/g, '~')

                        await this.$GitFact.set('repositories', repoFactName, 'GitRepository', {
                            origin: originUri,
                            branch: branch.trim(),
                            lastCommit: lastCommit.trim(),
                            lastCommitMessage: lastCommitMessage.trim(),
                            pushedAt: new Date().toISOString()
                        })

                        await this.$StatusFact.set('ProjectPublishingStatus', repoFactName, 'ProjectPublishingStatus', {
                            projectName: originUri,
                            provider: 'git-scm.com',
                            status: hasNewChanges || shouldReset || localAheadOfRemote ? 'PUBLISHED' : 'READY',
                            publicUrl: originUri,
                            updatedAt: new Date().toISOString()
                        })

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
capsule['#'] = 't44/caps/providers/git-scm.com/ProjectPublishing.v0'
