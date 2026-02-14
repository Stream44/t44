
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
                                projectName: {
                                    type: 'string',
                                    description: 'The name of the published project'
                                },
                                provider: {
                                    type: 'string',
                                    description: 'The publishing provider (e.g., github.com, git-scm.com, npmjs.com)'
                                },
                                status: {
                                    type: 'string',
                                    enum: ['READY', 'PUBLISHED', 'ERROR', 'SKIPPED', 'UNKNOWN'],
                                    description: 'Current publishing status'
                                },
                                publicUrl: {
                                    type: 'string',
                                    format: 'uri',
                                    description: 'The public URL where the published resource is accessible'
                                },
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp when the publishing was created'
                                },
                                updatedAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp when the publishing was last updated'
                                },
                                error: {
                                    type: 'string',
                                    description: 'Error message if publishing failed'
                                }
                            },
                            required: ['projectName', 'provider']
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
capsule['#'] = 't44/structs/ProjectPublishingFact'
