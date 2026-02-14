
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
                                apiKey: {
                                    type: 'string',
                                    title: 'Bunny.net API Key',
                                    description: 'Your Bunny.net API key from https://dash.bunny.net/account/settings',
                                    minLength: 30,
                                    pattern: '^[a-f0-9-]+$'
                                }
                            },
                            required: ['apiKey']
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
capsule['#'] = 't44/structs/providers/bunny.net/WorkspaceConnectionConfig'
