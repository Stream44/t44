
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
                                did: {
                                    type: 'string',
                                    description: 'The DID (Decentralized Identifier) of the home registry.'
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'The private key associated with the home registry DID.'
                                },
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when the registry was created.'
                                },
                                rootDir: {
                                    type: 'string',
                                    description: 'Absolute path to the home registry root directory.'
                                }
                            },
                            required: ['did', 'privateKey', 'createdAt', 'rootDir'],
                            additionalProperties: false,
                            description: 'Home registry identity containing the root DID and private key.'
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
        extendsCapsule: 't44/caps/HomeRegistryFile',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/HomeRegistry'
