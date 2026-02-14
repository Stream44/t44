
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
                                    description: 'The DID (Decentralized Identifier) of the workspace key.'
                                },
                                encryptedPrivateKey: {
                                    type: 'string',
                                    description: 'The private key encrypted with a passphrase derived from the root key.'
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Legacy unencrypted private key. Migrated to encryptedPrivateKey on first access.'
                                },
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when the workspace key was created.'
                                }
                            },
                            required: ['did', 'createdAt'],
                            additionalProperties: false,
                            description: 'A workspace signing key identity.'
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
capsule['#'] = 't44/structs/WorkspaceKey'
