
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
    // Ensures the GitHub repository is provisioned before git-scm pushes to it.
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#t44/structs/providers/github.com/ProjectPublishingFact': {
                as: '$GitHubFact'
            },
            '#t44/structs/ProjectPublishingFact': {
                as: '$StatusFact'
            },
            '#': {
                GitHubApi: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api'
                },
                ProjectCatalogs: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectCatalogs'
                },
                push: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config }: { config: any }) {

                        const repoSettings = config.provider.config.RepositorySettings
                        const owner = repoSettings.owner
                        const repo = repoSettings.repo
                        const isPrivate = repoSettings.public === true ? false : true
                        const description = repoSettings.description || ''

                        console.log(chalk.cyan(`\n🔍 Ensuring GitHub repository '${owner}/${repo}' ...`))

                        const result = await this.GitHubApi.ensureRepo({
                            owner,
                            repo,
                            isPrivate,
                            description
                        })

                        if (result.created) {
                            console.log(chalk.green(`   ✓ Repository '${owner}/${repo}' created on GitHub\n`))
                        } else {
                            console.log(chalk.green(`   ✓ Repository '${owner}/${repo}' already exists\n`))

                            const actualIsPrivate = result.repo.private
                            const wantsPublic = repoSettings.public === true

                            if (wantsPublic && actualIsPrivate) {
                                console.log(chalk.yellow(`   ⚡ Repository '${owner}/${repo}' is private but config wants public. Updating visibility ...`))
                                const updated = await this.GitHubApi.updateRepoVisibility({ owner, repo, isPrivate: false })
                                result.repo = updated
                                console.log(chalk.green(`   ✓ Repository '${owner}/${repo}' is now public\n`))
                            } else if (!wantsPublic && !actualIsPrivate) {
                                console.error(chalk.red(`\n   ✗ Error: Repository '${owner}/${repo}' is public on GitHub but config does not set 'public: true'.`))
                                console.error(chalk.red(`     If you want the repo to remain public, add 'public: true' to the RepositorySettings.`))
                                console.error(chalk.red(`     If you want the repo to be private, change it manually on GitHub first.\n`))
                                throw new Error(`Repository '${owner}/${repo}' visibility mismatch: repo is public but config wants private`)
                            }
                        }

                        // Write provider-specific fact file
                        await this.$GitHubFact.set(`${owner}~${repo}`, result.repo)

                        const statusResult = {
                            projectName: `${owner}/${repo}`,
                            provider: 'github.com',
                            status: 'READY',
                            publicUrl: result.repo.html_url
                        }
                        await this.$StatusFact.set(`${owner}~${repo}`, statusResult)
                    }
                },
                afterPush: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { repoName, config }: {
                        repoName: string
                        config: any
                    }): Promise<void> {
                        const ghSettings = config.provider.config?.RepositorySettings
                        if (!ghSettings) return

                        const owner = ghSettings.owner
                        const repo = ghSettings.repo

                        const branches: Record<string, any> = {}
                        let isPublic = false
                        try {
                            const [apiBranches, repoInfo] = await Promise.all([
                                this.GitHubApi.listBranches({ owner, repo }),
                                this.GitHubApi.getRepo({ owner, repo }),
                            ])
                            for (const b of apiBranches) {
                                branches[b.name] = { commit: b.commit }
                            }
                            if (repoInfo) isPublic = !repoInfo.private
                        } catch { }

                        const ghData: Record<string, any> = {
                            owner,
                            repo,
                            public: isPublic,
                            repoUrl: `https://github.com/${owner}/${repo}`,
                            gitUri: `git@github.com:${owner}/${repo}.git`,
                            branches,
                        }

                        await this.ProjectCatalogs.updateCatalogRepository({
                            repoName,
                            providerKey: '#' + capsule['#'],
                            providerData: ghData,
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
capsule['#'] = 't44/caps/providers/github.com/ProjectPublishing'
