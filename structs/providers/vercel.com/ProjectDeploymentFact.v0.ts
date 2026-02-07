
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
                        url: 'https://openapi.vercel.sh/',
                        definitions: {
                            'Project': '#/paths/~1v9~1projects~1{idOrName}/get/responses/200/content/application~1json/schema',
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
                    value: 'vercel.com',
                },
            }
        }
    }, {
        extendsCapsule: '@stream44.studio/t44/caps/WorkspaceEntityFact.v0',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@stream44.studio/t44/structs/providers/vercel.com/ProjectDeploymentFact.v0'
