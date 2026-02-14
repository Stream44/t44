
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#t44/caps/ConfigSchemaStruct': {
                as: 'schema',
                options: {
                    '#': {
                        schema: {
                            type: 'object',
                            properties: {
                                apiToken: {
                                    type: 'string',
                                    title: 'GitHub Personal Access Token',
                                    description: 'Your GitHub personal access token from https://github.com/settings/tokens (needs repo scope)',
                                    minLength: 10,
                                    pattern: '^(ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)$'
                                }
                            },
                            required: ['apiToken']
                        }
                    }
                }
            },
            '#': {
                capsuleName: {
                    type: CapsulePropertyTypes.Literal,
                    value: capsule['#']
                },
            }
        }
    }, {
        extendsCapsule: 't44/caps/WorkspaceConnection',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/providers/github.com/WorkspaceConnectionConfig'
