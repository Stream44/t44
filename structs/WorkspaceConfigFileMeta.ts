
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
                                filePath: {
                                    type: 'string',
                                    description: 'Absolute path to the workspace config file.'
                                },
                                relPath: {
                                    type: 'string',
                                    description: 'Relative path to the workspace config file from workspace root.'
                                },
                                entities: {
                                    type: 'object',
                                    additionalProperties: {
                                        type: 'object',
                                        properties: {
                                            line: {
                                                type: 'integer',
                                                description: 'Line number where the entity is defined.'
                                            },
                                            data: {
                                                type: 'object',
                                                additionalProperties: true,
                                                description: 'Entity data.'
                                            }
                                        },
                                        required: ['line', 'data']
                                    },
                                    description: 'Map of entity keys (e.g., #WorkspaceConfig) to their line numbers and data.'
                                },
                                updatedAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when this metadata was last updated.'
                                }
                            },
                            required: ['filePath', 'relPath', 'entities', 'updatedAt'],
                            additionalProperties: false,
                            description: 'Cached metadata for a workspace config file including entity line numbers.'
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
        extendsCapsule: 't44/caps/WorkspaceEntityFact',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/WorkspaceConfigFileMeta'
