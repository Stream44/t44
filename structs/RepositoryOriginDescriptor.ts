
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
                                    description: 'The DID (Decentralized Identifier) for the repository origin.'
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'The base64-encoded private key for the repository origin.'
                                },
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when the identifier was created.'
                                }
                            },
                            required: ['did', 'privateKey', 'createdAt'],
                            additionalProperties: false,
                            description: 'A repository origin identity descriptor stored in package.json.'
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
        extendsCapsule: 't44/caps/PackageDescriptor',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/RepositoryOriginDescriptor'
