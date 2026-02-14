
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
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp when the project deployment fact was created'
                                },
                                updatedAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp when the project deployment fact was last updated'
                                }
                            },
                            additionalProperties: true
                        }
                    }
                }
            },
            '#t44/caps/OpenApiSchema': {
                as: 'schemaOpenApi',
                options: {
                    '#': {
                        url: 'https://openapi.vercel.sh/',
                        def: '#/paths/~1v9~1projects~1{idOrName}/get/responses/200/content/application~1json/schema'
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
capsule['#'] = 't44/structs/providers/vercel.com/ProjectDeploymentFact'
