
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
                    value: 'dynadot.com',
                },
                schema: {
                    type: CapsulePropertyTypes.Literal,
                    value: {
                        properties: {
                            apiKey: {
                                type: 'string',
                                title: 'Dynadot API Key',
                                description: 'Your Dynadot API key from https://www.dynadot.com/account/domain/setting/api.html',
                                minLength: 10
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
capsule['#'] = 't44/structs/providers/dynadot.com/WorkspaceConnectionConfig.v0'
