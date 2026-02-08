
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
                        definitions: {
                            'NpmPackage': {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', description: 'Package name on npm' },
                                    version: { type: 'string', description: 'Published version' },
                                    private: { type: 'boolean', description: 'Whether the package is private' },
                                    shasum: { type: 'string', description: 'Package shasum' },
                                    integrity: { type: 'string', description: 'Package integrity hash' },
                                    publishedAt: { type: 'string', format: 'date-time', description: 'When the package was published' },
                                    npmUrl: { type: 'string', format: 'uri', description: 'URL to the package on npmjs.com' }
                                }
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
                    value: 'npmjs.com',
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
capsule['#'] = 't44/structs/providers/npmjs.com/ProjectPublishingFact.v0'
