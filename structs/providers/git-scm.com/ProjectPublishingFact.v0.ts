
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/t44/caps/OpenApiSchema.v0': {
                as: 'schema',
                options: {
                    '#': {
                        definitions: {
                            'GitRepository': {
                                type: 'object',
                                properties: {
                                    origin: { type: 'string', description: 'Remote origin URI' },
                                    branch: { type: 'string', description: 'Current branch name' },
                                    lastCommit: { type: 'string', description: 'Last commit hash' },
                                    lastCommitMessage: { type: 'string', description: 'Last commit message' },
                                    pushedAt: { type: 'string', format: 'date-time', description: 'When the last push occurred' }
                                }
                            }
                        }
                    }
                }
            },
            '#': {
                capsuleName: {
                    type: CapsulePropertyTypes.Literal,
                    value: capsule['#']
                },
                origin: {
                    type: CapsulePropertyTypes.Literal,
                    value: 'git-scm.com',
                },
            }
        }
    }, {
        extendsCapsule: '@stream44.studio/t44/caps/WorkspaceEntityFact.v0',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@stream44.studio/t44/structs/providers/git-scm.com/ProjectPublishingFact.v0'
