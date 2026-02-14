
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
                                    description: 'The DID (Decentralized Identifier) of the workspace.'
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'The private key associated with the workspace DID.'
                                },
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when the workspace was registered.'
                                },
                                workspaceRootDir: {
                                    type: 'string',
                                    description: 'Absolute path to the workspace root directory.'
                                }
                            },
                            required: ['did', 'privateKey', 'createdAt', 'workspaceRootDir'],
                            additionalProperties: false,
                            description: 'Workspace identity and location in the home registry.'
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
capsule['#'] = 't44/structs/Workspace'
