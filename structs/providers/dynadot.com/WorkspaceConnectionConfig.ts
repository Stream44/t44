
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
                                    title: 'Dynadot API Key',
                                    description: 'Your Dynadot API key. Generate at https://www.dynadot.com/account/domain/setting/api.html',
                                    minLength: 10
                                },
                                apiSecret: {
                                    type: 'string',
                                    title: 'Dynadot API Secret',
                                    description: 'Your Dynadot API secret for REST API HMAC-SHA256 signing.',
                                    minLength: 10
                                },
                                apiKeyTransactionSecret: {
                                    type: 'string',
                                    title: 'Dynadot API Key Transaction Secret',
                                    description: 'Your Dynadot API key transaction secret (optional, for transactional endpoints).',
                                    minLength: 10
                                }
                            },
                            required: ['apiKey', 'apiSecret']
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
capsule['#'] = 't44/structs/providers/dynadot.com/WorkspaceConnectionConfig'
