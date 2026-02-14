
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
                                    title: 'Vercel API Token',
                                    description: 'Your Vercel API token from https://vercel.com/account/tokens',
                                    minLength: 20,
                                    pattern: '^[A-Za-z0-9_-]+$'
                                },
                                team: {
                                    type: 'string',
                                    title: 'Default Team',
                                    description: 'Your default Vercel team slug',
                                    minLength: 1
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
capsule['#'] = 't44/structs/providers/vercel.com/WorkspaceConnectionConfig'
