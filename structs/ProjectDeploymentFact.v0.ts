
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
                            'ProjectDeploymentStatus': {
                                type: 'object',
                                properties: {
                                    projectName: {
                                        type: 'string',
                                        description: 'The name of the deployed project'
                                    },
                                    provider: {
                                        type: 'string',
                                        description: 'The deployment provider (e.g., vercel.com, bunny.net)'
                                    },
                                    status: {
                                        type: 'string',
                                        enum: ['READY', 'BUILDING', 'ERROR', 'DISABLED', 'UNKNOWN'],
                                        description: 'Current deployment status'
                                    },
                                    publicUrl: {
                                        type: 'string',
                                        format: 'uri',
                                        description: 'The public URL where the deployment is accessible'
                                    },
                                    createdAt: {
                                        type: 'integer',
                                        description: 'Timestamp when the deployment was created'
                                    },
                                    updatedAt: {
                                        type: 'integer',
                                        description: 'Timestamp when the deployment was last updated'
                                    },
                                    providerProjectId: {
                                        type: 'string',
                                        description: 'Provider-specific project identifier'
                                    },
                                    providerPortalUrl: {
                                        type: 'string',
                                        format: 'uri',
                                        description: 'URL to the provider admin portal for this deployment'
                                    },
                                    usage: {
                                        type: 'object',
                                        properties: {
                                            storageBytes: {
                                                type: 'integer',
                                                description: 'Storage used in bytes'
                                            },
                                            filesCount: {
                                                type: 'integer',
                                                description: 'Number of files stored'
                                            },
                                            bandwidthBytes: {
                                                type: 'integer',
                                                description: 'Bandwidth used in bytes (monthly)'
                                            },
                                            charges: {
                                                type: 'number',
                                                description: 'Monthly charges in USD'
                                            }
                                        },
                                        description: 'Usage statistics for the deployment'
                                    },
                                    error: {
                                        type: 'string',
                                        description: 'Error message if status retrieval failed'
                                    },
                                    rawDefinitionFilepaths: {
                                        type: 'array',
                                        items: {
                                            type: 'string'
                                        },
                                        description: 'Relative filepaths to the raw provider-specific definition files'
                                    }
                                },
                                required: ['projectName', 'provider', 'rawDefinitionFilepaths']
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
capsule['#'] = '@stream44.studio/t44/structs/ProjectDeploymentFact.v0'
