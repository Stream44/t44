
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#': {
                capsuleName: {
                    type: CapsulePropertyTypes.Literal,
                    value: capsule['#']
                },
                origin: {
                    type: CapsulePropertyTypes.Literal,
                    value: 'bunny.net',
                },
                schema: {
                    type: CapsulePropertyTypes.Literal,
                    value: {
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
                },
            }
        }
    }, {
        extendsCapsule: 't44/caps/WorkspaceConnection.v0',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/providers/bunny.net/WorkspaceConnectionConfig.v0'
