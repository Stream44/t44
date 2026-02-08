
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
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#t44/structs/providers/github.com/ProjectPublishingFact.v0': {
                as: '$GitHubFact'
            },
            '#t44/structs/ProjectPublishingFact.v0': {
                as: '$StatusFact'
            },
            '#': {
                GitHubApi: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/github.com/api.v0'
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
                        }

                        // Write provider-specific fact file
                        await this.$GitHubFact.set('repositories', `${owner}~${repo}`, 'Repository', result.repo)

                        // Write publishing status fact
                        const statusResult = {
                            projectName: `${owner}/${repo}`,
                            provider: 'github.com',
                            status: 'READY',
                            publicUrl: result.repo.html_url,
                            updatedAt: new Date().toISOString()
                        }
                        await this.$StatusFact.set('ProjectPublishingStatus', `${owner}~${repo}`, 'ProjectPublishingStatus', statusResult)
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
capsule['#'] = 't44/caps/providers/github.com/ProjectPublishing.v0'
