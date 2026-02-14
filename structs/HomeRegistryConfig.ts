
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
                                homeDir: {
                                    type: 'string',
                                    description: 'Absolute path to the home directory (parent of registry, .ssh, etc).'
                                },
                                rootDir: {
                                    type: 'string',
                                    description: 'Absolute path to the home registry root directory.'
                                },
                                identifier: {
                                    type: 'string',
                                    description: 'DID (Decentralized Identifier) of the home registry.'
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
                            required: ['createdAt', 'updatedAt'],
                            additionalProperties: false,
                            description: 'Home registry configuration with identity and location.'
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
capsule['#'] = 't44/structs/HomeRegistryConfig'
