
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
                                name: {
                                    type: 'string',
                                    description: 'Filename of the Ed25519 private key (e.g. id_t44_ed25519).'
                                },
                                privateKeyPath: {
                                    type: 'string',
                                    description: 'Absolute path to the Ed25519 private key file.'
                                },
                                publicKey: {
                                    type: 'string',
                                    description: 'Public key string used to identify the key.'
                                },
                                keyFingerprint: {
                                    type: 'string',
                                    description: 'SSH key fingerprint (SHA256) for quick identification and validation.'
                                },
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when the entity config was created.'
                                },
                                updatedAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when the entity config was last updated.'
                                }
                            },
                            required: [],
                            additionalProperties: false,
                            description: 'Root key configuration referencing an Ed25519 SSH key.'
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
        extendsCapsule: 't44/caps/WorkspaceEntityConfig',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/RootKeyConfig'
