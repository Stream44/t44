
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#t44/caps/OpenApiSchema.v0': {
                as: 'schema',
                options: {
                    '#': {
                        url: 'https://core-api-public-docs.b-cdn.net/docs/v3/public.json',
                        definitions: {
                            'PullZoneModel': '#/components/schemas/PullZoneModel',
                            'PaginationListModelOfPullZoneModel': '#/components/schemas/PaginationListModelOfPullZoneModel',
                            'StorageZoneModel': '#/components/schemas/StorageZoneModel',
                            'StorageZoneModelList': '#/components/schemas/StorageZoneModel',
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
                    value: 'bunny.net',
                },
            }
        }
    }, {
        extendsCapsule: 't44/caps/WorkspaceEntityFact.v0',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/providers/bunny.net/ProjectDeploymentFact.v0'
