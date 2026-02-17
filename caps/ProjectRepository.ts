
import { join } from 'path'
import { $ } from 'bun'
import { mkdir, access, readFile, writeFile } from 'fs/promises'
import { constants } from 'fs'

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
            '#t44/structs/WorkspaceConfig': {
                as: '$WorkspaceConfig'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig'
                },
                getStagePath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { repoUri }: { repoUri: string }): Promise<string> {
                        const normalizedUri = repoUri.replace(/[\/]/g, '~')
                        return join(
                            this.WorkspaceConfig.workspaceRootDir,
                            '.~o/workspace.foundation/@t44.sh~t44~caps~ProjectRepository/stage',
                            normalizedUri
                        )
                    }
                },
                init: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<void> {
                        await mkdir(rootDir, { recursive: true })

                        const gitDir = join(rootDir, '.git')
                        let isGitRepo = false
                        try {
                            await access(gitDir, constants.F_OK)
                            isGitRepo = true
                        } catch { }

                        if (!isGitRepo) {
                            await $`git init`.cwd(rootDir).quiet()
                            await $`git commit --allow-empty -m init`.cwd(rootDir).quiet()
                        }
                    }
                },
                reset: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<void> {
                        await $`git checkout -- .`.cwd(rootDir).quiet().nothrow()
                        await $`git clean -fd`.cwd(rootDir).quiet().nothrow()
                    }
                },
                sync: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, sourceDir, gitignorePath, excludePatterns }: {
                        rootDir: string
                        sourceDir: string
                        gitignorePath?: string
                        excludePatterns?: string[]
                    }): Promise<void> {
                        let gitignoreExists = false
                        if (gitignorePath) {
                            try {
                                await access(gitignorePath, constants.F_OK)
                                gitignoreExists = true
                            } catch { }
                        }

                        const rsyncArgs = ['rsync', '-a', '--delete', '--exclude', '.git']
                        if (gitignoreExists && gitignorePath) {
                            rsyncArgs.push('--exclude-from=' + gitignorePath)
                        }
                        // Add additional exclude patterns from alwaysIgnore config
                        if (excludePatterns && excludePatterns.length > 0) {
                            for (const pattern of excludePatterns) {
                                rsyncArgs.push('--exclude', pattern)
                            }
                        }
                        rsyncArgs.push(sourceDir + '/', rootDir + '/')
                        await $`${rsyncArgs}`
                    }
                },
                hasChanges: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<boolean> {
                        await $`git add -A`.cwd(rootDir).quiet()
                        const diff = await $`git diff --cached --stat`.cwd(rootDir).quiet().nothrow()
                        const hasChanges = diff.text().trim().length > 0
                        await $`git reset`.cwd(rootDir).quiet().nothrow()
                        return hasChanges
                    }
                },
                commit: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, message }: {
                        rootDir: string
                        message: string
                    }): Promise<void> {
                        await $`git add -A`.cwd(rootDir).quiet()
                        await $`git commit -m ${message}`.cwd(rootDir).quiet().nothrow()
                    }
                },
                getHeadCommit: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<string> {
                        const result = await $`git rev-parse HEAD`.cwd(rootDir).quiet().nothrow()
                        if (result.exitCode !== 0) return ''
                        return result.text().trim()
                    }
                },
                getBranch: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<string> {
                        const result = await $`git rev-parse --abbrev-ref HEAD`.cwd(rootDir).quiet()
                        return result.text().trim()
                    }
                },
                getLastCommitMessage: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<string> {
                        const result = await $`git log -1 --pretty=%B`.cwd(rootDir).quiet()
                        return result.text().trim()
                    }
                },
                clone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { originUri, targetDir }: {
                        originUri: string
                        targetDir: string
                    }): Promise<{ isNewEmptyRepo: boolean }> {
                        const parentDir = join(targetDir, '..')
                        await mkdir(parentDir, { recursive: true })
                        await $`git clone ${originUri} ${targetDir}`.cwd(parentDir)

                        const headCheck = await $`git rev-parse HEAD`.cwd(targetDir).quiet().nothrow()
                        return { isNewEmptyRepo: headCheck.exitCode !== 0 }
                    }
                },
                addAll: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<boolean> {
                        await $`git add .`.cwd(rootDir).quiet()
                        const statusResult = await $`git status --porcelain`.cwd(rootDir).quiet()
                        return statusResult.text().trim().length > 0
                    }
                },
                isAheadOfRemote: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<boolean> {
                        const lsRemoteResult = await $`git ls-remote origin`.cwd(rootDir).quiet().nothrow()
                        const lsRemoteOutput = lsRemoteResult.text().trim()

                        if (!lsRemoteOutput) {
                            return true
                        }

                        const localHead = (await $`git rev-parse HEAD`.cwd(rootDir).quiet()).text().trim()
                        const remoteHeadLine = lsRemoteOutput.split('\n').find((l: string) => l.includes('refs/heads/main'))
                        const remoteHead = remoteHeadLine ? remoteHeadLine.split('\t')[0] : null

                        return !remoteHead || remoteHead !== localHead
                    }
                },
                push: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<void> {
                        await $`git push -u origin main --tags`.cwd(rootDir)
                    }
                },
                forcePush: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<void> {
                        await $`git push --force --tags`.cwd(rootDir)
                    }
                },
                squashAllCommits: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, message }: {
                        rootDir: string
                        message: string
                    }): Promise<void> {
                        const rootCommit = await $`git rev-list --max-parents=0 HEAD`.cwd(rootDir).text()
                        await $`git reset --soft ${rootCommit.trim()}`.cwd(rootDir)
                        await $`git commit --amend -m ${message}`.cwd(rootDir)
                    }
                },
                tag: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, tag }: {
                        rootDir: string
                        tag: string
                    }): Promise<void> {
                        await $`git tag ${tag}`.cwd(rootDir)
                    }
                },
                hasTag: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, tag }: {
                        rootDir: string
                        tag: string
                    }): Promise<{ exists: boolean, commit?: string }> {
                        const localTagCheck = await $`git tag -l ${tag}`.cwd(rootDir).quiet().nothrow()
                        if (localTagCheck.text().trim() === tag) {
                            const tagCommit = (await $`git rev-parse ${tag}^{}`.cwd(rootDir).quiet().nothrow()).text().trim()
                            return { exists: true, commit: tagCommit }
                        }
                        return { exists: false }
                    }
                },
                hasRemoteTag: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, tag }: {
                        rootDir: string
                        tag: string
                    }): Promise<{ exists: boolean, commit?: string }> {
                        const remoteTagCheck = await $`git ls-remote --tags origin ${tag}`.cwd(rootDir).quiet().nothrow()
                        const output = remoteTagCheck.text().trim()
                        if (output.length > 0) {
                            const commit = output.split(/\s+/)[0]
                            return { exists: true, commit }
                        }
                        return { exists: false }
                    }
                },
                diff: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, from, to }: {
                        rootDir: string
                        from: string
                        to?: string
                    }): Promise<string> {
                        const toRef = to || 'HEAD'
                        const result = await $`git diff ${from} ${toRef}`.cwd(rootDir).quiet().nothrow()
                        return result.text().trim()
                    }
                },
                exists: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<boolean> {
                        try {
                            await access(join(rootDir, '.git'), constants.F_OK)
                            return true
                        } catch {
                            return false
                        }
                    }
                },
                initBare: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir }: { rootDir: string }): Promise<void> {
                        await mkdir(rootDir, { recursive: true })

                        let isBareRepo = false
                        try {
                            await access(join(rootDir, 'HEAD'), constants.F_OK)
                            isBareRepo = true
                        } catch { }

                        if (!isBareRepo) {
                            await $`git init --bare`.cwd(rootDir).quiet()
                        }
                    }
                },
                hasRemote: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, name }: {
                        rootDir: string
                        name: string
                    }): Promise<boolean> {
                        const result = await $`git remote`.cwd(rootDir).quiet().nothrow()
                        const remotes = result.text().trim().split('\n').filter(Boolean)
                        return remotes.includes(name)
                    }
                },
                addRemote: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, name, url }: {
                        rootDir: string
                        name: string
                        url: string
                    }): Promise<void> {
                        await $`git remote add ${name} ${url}`.cwd(rootDir).quiet()
                    }
                },
                setRemoteUrl: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, name, url }: {
                        rootDir: string
                        name: string
                        url: string
                    }): Promise<void> {
                        await $`git remote set-url ${name} ${url}`.cwd(rootDir).quiet()
                    }
                },
                pushToRemote: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { rootDir, remote, branch, force }: {
                        rootDir: string
                        remote: string
                        branch?: string
                        force?: boolean
                    }): Promise<void> {
                        const branchName = branch || 'main'
                        if (force) {
                            await $`git push --force ${remote} ${branchName}`.cwd(rootDir).quiet()
                        } else {
                            await $`git push ${remote} ${branchName}`.cwd(rootDir).quiet()
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
capsule['#'] = 't44/caps/ProjectRepository'
