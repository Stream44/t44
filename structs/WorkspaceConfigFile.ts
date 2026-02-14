
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
                                extends: {
                                    type: 'array',
                                    items: {
                                        type: 'string'
                                    },
                                    description: 'List of config file paths to extend from. Supports relative paths and npm package paths.'
                                }
                            },
                            additionalProperties: true,
                            patternProperties: {
                                '^#': {
                                    type: 'object',
                                    description: 'Workspace config entity keyed by struct capsule name prefixed with #'
                                }
                            },
                            description: 'A workspace configuration file that can extend other config files and contains workspace config entities.'
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
        extendsCapsule: 't44/caps/WorkspaceConfigFile',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/WorkspaceConfigFile'
