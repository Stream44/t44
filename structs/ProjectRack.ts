
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
                                    description: 'The DID (Decentralized Identifier) of the project rack.'
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'The private key for the project rack.'
                                },
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when the project rack was created.'
                                }
                            },
                            required: ['did', 'privateKey', 'createdAt'],
                            additionalProperties: false,
                            description: 'A project rack identity in the home registry.'
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
capsule['#'] = 't44/structs/ProjectRack'
