
import { join } from 'path'
import { mkdir, access, readFile, writeFile } from 'fs/promises'
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
    // High level API that deals with everything concerning a git repository.
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#@stream44.studio/t44/structs/patterns/git-scm.com/ProjectPublishingFact': {
                as: '$GitFact'
            },
            '#@stream44.studio/t44/structs/ProjectPublishingFact': {
                as: '$StatusFact'
            },
            '#': {
                tags: {
                    type: CapsulePropertyTypes.Constant,
                    value: ['git'],
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt'
                },
                ProjectRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectRepository'
                },
                ProjectCatalogs: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectCatalogs'
                },
                prepare: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, ctx }: { config: any, ctx: any }) {

                        const originUri = config.config.RepositorySettings.origin
                        const authorConfig = config.config?.RepositorySettings?.author

                        console.log(`Preparing git repo '${originUri}' from source '${ctx.repoSourceDir}' ...`)

                        const projectionDir = ctx.publishingApi.getProjectionDir(capsule['#'])
                        const stageDir = join(projectionDir, 'stage', originUri.replace(/[\/]/g, '~'))

                        // ── 1. Clone if repository doesn't exist yet ────────────
                        let isNewEmptyRepo = false
                        const repoExists = await this.ProjectRepository.exists({ rootDir: stageDir })
                        if (!repoExists) {
                            console.log(`Cloning repository from '${originUri}' ...`)
                            const result = await this.ProjectRepository.clone({ originUri, targetDir: stageDir })
                            isNewEmptyRepo = result.isNewEmptyRepo
                        }

                        // ── 2. Ensure origin remote exists (heal if missing) ────
                        const hasOrigin = await this.ProjectRepository.hasRemote({ rootDir: stageDir, name: 'origin' })
                        if (!hasOrigin) {
                            console.log(`Re-adding missing 'origin' remote ...`)
                            await this.ProjectRepository.addRemote({ rootDir: stageDir, name: 'origin', url: originUri })
                        }

                        // ── 3. Set local git author ─────────────────────────────
                        if (authorConfig?.name) {
                            await $`git config user.name ${authorConfig.name}`.cwd(stageDir).quiet()
                        }
                        if (authorConfig?.email) {
                            await $`git config user.email ${authorConfig.email}`.cwd(stageDir).quiet()
                        }

                        // ── 4. Determine target branch ──────────────────────────
                        const targetBranch = ctx.options.branch
                        const effectiveBranch = targetBranch || 'main'

                        // ── 5. Detect empty repo ────────────────────────────────
                        const headCheck = await $`git rev-parse HEAD`.cwd(stageDir).quiet().nothrow()
                        const isEmptyRepo = isNewEmptyRepo || headCheck.exitCode !== 0

                        // ── 6. Fetch from remote ────────────────────────────────
                        // Always fetch so we know the true state of the remote
                        // before making any branch decisions. Skip for empty repos
                        // that were just created (nothing to fetch).
                        if (!isEmptyRepo) {
                            await $`git fetch origin`.cwd(stageDir).quiet().nothrow()
                        }

                        // ── 7. Clean working tree and sync branch to remote ─────
                        // This is the critical section: we must get the local branch
                        // to exactly match the remote before rsyncing source files.
                        let branchSwitched = false
                        if (isEmptyRepo) {
                            await $`git checkout -b ${effectiveBranch}`.cwd(stageDir).quiet().nothrow()
                            console.log(`Initialized branch '${effectiveBranch}' on empty repository`)
                            branchSwitched = true
                        } else {
                            // Discard any uncommitted changes from previous runs
                            await $`git checkout .`.cwd(stageDir).quiet().nothrow()
                            await $`git clean -fd`.cwd(stageDir).quiet().nothrow()

                            const currentBranch = await this.ProjectRepository.getBranch({ rootDir: stageDir })

                            if (currentBranch !== effectiveBranch) {
                                console.log(`Switching from branch '${currentBranch}' to '${effectiveBranch}' ...`)

                                // Check if branch exists locally
                                const localBranchCheck = await $`git branch --list ${effectiveBranch}`.cwd(stageDir).quiet().nothrow()
                                const localBranchExists = localBranchCheck.text().trim().length > 0

                                if (localBranchExists) {
                                    await $`git checkout ${effectiveBranch}`.cwd(stageDir).quiet()
                                } else {
                                    // Check if branch exists on remote
                                    const remoteBranchCheck = await $`git ls-remote --heads origin ${effectiveBranch}`.cwd(stageDir).quiet().nothrow()
                                    const remoteBranchExists = remoteBranchCheck.text().trim().length > 0

                                    if (remoteBranchExists) {
                                        await $`git checkout -b ${effectiveBranch} origin/${effectiveBranch}`.cwd(stageDir).quiet()
                                    } else {
                                        await $`git checkout -b ${effectiveBranch}`.cwd(stageDir).quiet()
                                        console.log(`Created new branch '${effectiveBranch}'`)
                                    }
                                }
                                branchSwitched = true
                            }

                            // Hard-reset local branch to match remote (if remote branch exists).
                            // This ensures the local stage repo always starts from the true
                            // remote state, regardless of what happened in previous runs.
                            const remoteRef = `origin/${effectiveBranch}`
                            const remoteRefCheck = await $`git rev-parse --verify ${remoteRef}`.cwd(stageDir).quiet().nothrow()
                            if (remoteRefCheck.exitCode === 0) {
                                const localHead = (await $`git rev-parse HEAD`.cwd(stageDir).quiet()).text().trim()
                                const remoteHead = remoteRefCheck.text().trim()
                                if (localHead !== remoteHead) {
                                    await $`git reset --hard ${remoteRef}`.cwd(stageDir).quiet()
                                    console.log(`Synced local '${effectiveBranch}' to remote (${remoteHead.slice(0, 8)})`)
                                }
                            }

                            if (branchSwitched) {
                                console.log(`On branch '${effectiveBranch}'`)
                            } else if (targetBranch) {
                                console.log(`Already on branch '${targetBranch}'`)
                            }
                        }

                        // ── 8. Rsync source files into stage repo ───────────────
                        // Now that the branch is in sync with remote, overlay
                        // the workspace source files on top.
                        const gitignorePath = join(ctx.repoSourceDir, '.gitignore')
                        await this.ProjectRepository.sync({
                            rootDir: stageDir,
                            sourceDir: ctx.repoSourceDir,
                            gitignorePath,
                            excludePatterns: ctx.alwaysIgnore || []
                        })

                        // ── 9. Security check: .env* files ──────────────────────
                        const envFilesResult = await $`find . -name '.env*' -not -path './.git/*'`.cwd(stageDir).quiet().nothrow()
                        const envFiles = envFilesResult.text().trim().split('\n').filter(Boolean)
                        if (envFiles.length > 0) {
                            console.error(chalk.bgRed.white.bold(`\n  ██████████████████████████████████████████████████████████`))
                            console.error(chalk.bgRed.white.bold(`  ██  SECURITY ERROR: .env* FILES DETECTED IN REPOSITORY  ██`))
                            console.error(chalk.bgRed.white.bold(`  ██████████████████████████████████████████████████████████\n`))
                            console.error(chalk.red.bold(`  The following .env* files were found and may leak sensitive information:`))
                            for (const f of envFiles) {
                                console.error(chalk.red(`    • ${f}`))
                            }
                            console.error(chalk.red.bold(`\n  Add these files to .gitignore before publishing.\n`))
                            process.exit(1)
                        }

                        // ── 10. Generate files from config ──────────────────────
                        // This happens AFTER rsync so generated files are not overwritten
                        if (config.config) {
                            for (const [key, value] of Object.entries(config.config)) {
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

                        // ── 11. Handle --dangerously-squash-to-commit ───────────
                        let squashedToCommit = false
                        const squashToCommit = ctx.options.dangerouslySquashToCommit
                        if (squashToCommit) {
                            // Resolve the commit hash (supports short refs)
                            const resolveResult = await $`git rev-parse ${squashToCommit}`.cwd(stageDir).quiet().nothrow()
                            if (resolveResult.exitCode !== 0) {
                                throw new Error(`Cannot resolve commit '${squashToCommit}' in stage repo at ${stageDir}. Is the commit hash correct?`)
                            }
                            const fullHash = resolveResult.text().trim()

                            // Check if HEAD is already at this commit (idempotent — already squashed)
                            const headHash = (await $`git rev-parse HEAD`.cwd(stageDir).quiet()).text().trim()
                            if (headHash === fullHash) {
                                console.log(`Stage repo HEAD is already at ${fullHash.slice(0, 8)} — squash already applied`)
                            } else {
                                // Verify the commit exists in the history
                                const ancestorCheck = await $`git merge-base --is-ancestor ${fullHash} HEAD`.cwd(stageDir).quiet().nothrow()
                                if (ancestorCheck.exitCode !== 0) {
                                    throw new Error(`Commit ${fullHash.slice(0, 8)} is not an ancestor of HEAD in stage repo`)
                                }

                                console.log(`Soft-resetting stage repo to commit ${fullHash.slice(0, 8)} ...`)
                                await $`git reset --soft ${fullHash}`.cwd(stageDir).quiet()
                                console.log(`Stage repo reset to ${fullHash.slice(0, 8)} — all subsequent changes are now staged`)
                                squashedToCommit = true
                            }
                        }

                        // Store metadata for other providers and later steps
                        ctx.metadata[capsule['#']] = {
                            originUri,
                            stageDir,
                            isNewEmptyRepo: isEmptyRepo,
                            authorConfig,
                            providerConfig: config,
                            targetBranch,
                            branchSwitched,
                            squashedToCommit,
                        }
                    }
                },
                tag: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, ctx }: { config: any, ctx: any }) {

                        const myMeta = ctx.metadata[capsule['#']]
                        if (!myMeta?.stageDir) return

                        const { stageDir } = myMeta

                        const packageJsonPath = join(ctx.repoSourceDir, 'package.json')
                        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
                        const packageJson = JSON.parse(packageJsonContent)
                        const version = packageJson.version
                        const tag = `v${version}`

                        const headCommit = await this.ProjectRepository.getHeadCommit({ rootDir: stageDir })

                        if (!headCommit) {
                            console.log(chalk.gray(`  ○ Empty repository, skipping tag (will tag after first commit)\n`))
                            return
                        }

                        // Check if tag already exists on remote first
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

                        // Check if tag already exists locally
                        const localTag = await this.ProjectRepository.hasTag({ rootDir: stageDir, tag })
                        if (localTag.exists) {
                            if (localTag.commit === headCommit) {
                                console.log(chalk.gray(`  ○ Tag ${tag} already exists at current commit, skipping\n`))
                                return
                            }
                            // Local tag points to a different commit but tag is NOT on remote —
                            // this is a stale tag from a previous failed run. Delete and re-tag.
                            console.log(chalk.yellow(`  ⟳ Local tag ${tag} is stale (at ${localTag.commit!.slice(0, 8)}, HEAD is ${headCommit.slice(0, 8)}) — re-tagging`))
                            await $`git tag -d ${tag}`.cwd(stageDir).quiet()
                        }

                        await this.ProjectRepository.tag({ rootDir: stageDir, tag })
                        console.log(chalk.green(`  ✓ Tagged with ${tag}\n`))
                    }
                },
                push: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, ctx }: { config: any, ctx: any }) {

                        const myMeta = ctx.metadata[capsule['#']]
                        if (!myMeta) return

                        const {
                            originUri,
                            stageDir,
                            isNewEmptyRepo,
                            branchSwitched,
                            squashedToCommit
                        } = myMeta

                        const { dangerouslyResetMain, branch: targetBranch } = ctx.options

                        // Check if OI provider already handled the full reset push
                        const oiMeta = ctx.metadata['@stream44.studio/t44-blockchaincommons.com/caps/ProjectPublishing']
                        if (oiMeta?.handledResetPush) {
                            // OI already did the full reset + force push — write facts and return
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
                        }

                        if (dangerouslyResetMain) {
                            console.log(`Reset mode enabled - will reset repository to initial commit`)
                        }

                        // Git add and check for changes
                        console.log(`Committing changes ...`)
                        let hasNewChanges = await this.ProjectRepository.addAll({ rootDir: stageDir })

                        // Handle reset (works on existing commits, regardless of new changes)
                        let shouldReset = false
                        if (dangerouslyResetMain) {
                            const headCommit = await this.ProjectRepository.getHeadCommit({ rootDir: stageDir })
                            const hasExistingCommits = !!headCommit

                            if (hasExistingCommits) {
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
                            } else {
                                shouldReset = true
                            }

                            if (shouldReset) {
                                await this.ProjectRepository.squashAllCommits({
                                    rootDir: stageDir,
                                    message: 'Published using @Stream44 Studio'
                                })
                                console.log(`Repository reset to initial commit`)
                            }
                        }

                        // Check if DCO/commit provider already committed
                        const dcoMeta = ctx.metadata['@stream44.studio/dco/caps/ProjectPublishing']
                        if (dcoMeta?.committed) {
                            // DCO provider already committed — use its state
                            hasNewChanges = dcoMeta.hasNewChanges
                        } else if (!dangerouslyResetMain && hasNewChanges) {
                            // No DCO provider committed, and we have changes — do a plain commit
                            await this.ProjectRepository.commit({
                                rootDir: stageDir,
                                message: 'Published using @Stream44 Studio'
                            })
                            console.log(`New changes committed`)
                        } else if (!hasNewChanges) {
                            console.log(`No new changes to commit`)
                        }

                        // Check if local is ahead of remote
                        let localAheadOfRemote = false
                        if (!shouldReset && !hasNewChanges && !isNewEmptyRepo) {
                            localAheadOfRemote = await this.ProjectRepository.isAheadOfRemote({ rootDir: stageDir, branch: targetBranch })
                        }

                        // Push to remote
                        if (shouldReset || squashedToCommit) {
                            console.log(`Force pushing to remote${squashedToCommit ? ' (squash rewrite)' : ''} ...`)
                            await this.ProjectRepository.forcePush({ rootDir: stageDir, branch: targetBranch })
                            console.log(`Force pushed to remote`)
                        } else if (isNewEmptyRepo || hasNewChanges || localAheadOfRemote || branchSwitched) {
                            console.log(`Pushing to remote${targetBranch ? ` (branch: ${targetBranch})` : ''} ...`)
                            await this.ProjectRepository.push({ rootDir: stageDir, branch: targetBranch })
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
                            status: hasNewChanges || shouldReset || localAheadOfRemote || branchSwitched || squashedToCommit ? 'PUBLISHED' : 'READY',
                            publicUrl: originUri
                        })

                    }
                },
                afterPush: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, ctx }: {
                        config: any
                        ctx: any
                    }): Promise<void> {
                        const myMeta = ctx.metadata[capsule['#']]
                        if (!myMeta?.stageDir) return

                        const branch = await this.ProjectRepository.getBranch({ rootDir: myMeta.stageDir })
                        const commit = await this.ProjectRepository.getHeadCommit({ rootDir: myMeta.stageDir })

                        const gitData: Record<string, any> = {
                            branches: {},
                        }
                        if (branch && commit) {
                            const branchEntry: Record<string, any> = { commit }
                            try {
                                const tagResult = await $`git tag --points-at ${commit}`.cwd(myMeta.stageDir).quiet().nothrow()
                                const tag = tagResult.text().trim().split('\n').filter(Boolean).pop()
                                if (tag) branchEntry.tag = tag
                            } catch { }
                            gitData.branches[branch] = branchEntry
                        }

                        await this.ProjectCatalogs.updateCatalogRepository({
                            repoName: ctx.repoName,
                            providerKey: '#' + capsule['#'],
                            providerData: gitData,
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
capsule['#'] = '@stream44.studio/t44/caps/patterns/git-scm.com/ProjectPublishing'
