
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/t44/caps/ConfigSchemaStruct': {
                as: 'schema',
                options: {
                    '#': {
                        schema: {
                            type: 'object',
                            properties: {
                                alwaysIgnore: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Glob patterns to always exclude from publishing.'
                                },
                                providers: {
                                    type: 'array',
                                    description: 'Global publishing provider configurations applied to all repositories.'
                                },
                                repositories: {
                                    type: 'object',
                                    additionalProperties: {
                                        type: 'object',
                                        properties: {
                                            sourceDir: {
                                                type: 'string',
                                                description: 'Path to the repository source directory.'
                                            },
                                            activePublishingBranch: {
                                                type: 'string',
                                                description: 'Sticky branch for publishing. Set via --branch flag or directly in config. When set, pushes target this branch instead of main.'
                                            },
                                            providers: {
                                                description: 'List of publishing provider configurations.',
                                            }
                                        },
                                        additionalProperties: true
                                    },
                                    description: 'Map of repository identifiers to their configurations.'
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
                            description: 'Workspace repository configurations for publishing providers.'
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
        extendsCapsule: '@stream44.studio/t44/caps/WorkspaceEntityConfig',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@stream44.studio/t44/structs/ProjectPublishingConfig'
