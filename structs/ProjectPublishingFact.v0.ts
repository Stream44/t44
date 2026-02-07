
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/t44/caps/OpenApiSchema.v0': {
                as: 'schema',
                options: {
                    '#': {
                        definitions: {
                            'ProjectPublishingStatus': {
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
                                    updatedAt: {
                                        type: 'string',
                                        format: 'date-time',
                                        description: 'Timestamp when the publishing was last updated'
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
                }
            },
            '#': {
                capsuleName: {
                    type: CapsulePropertyTypes.Literal,
                    value: capsule['#']
                },
                origin: {
                    type: CapsulePropertyTypes.Literal,
                    value: 'workspace.foundation'
                }
            }
        }
    }, {
        extendsCapsule: '@stream44.studio/t44/caps/WorkspaceEntityFact.v0',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@stream44.studio/t44/structs/ProjectPublishingFact.v0'
