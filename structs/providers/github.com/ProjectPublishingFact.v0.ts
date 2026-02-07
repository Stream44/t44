
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
                            'Repository': {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer', description: 'GitHub repository ID' },
                                    name: { type: 'string', description: 'Repository name' },
                                    full_name: { type: 'string', description: 'Full repository name (owner/repo)' },
                                    private: { type: 'boolean', description: 'Whether the repository is private' },
                                    html_url: { type: 'string', format: 'uri', description: 'URL to the repository on GitHub' },
                                    description: { type: 'string', description: 'Repository description' },
                                    clone_url: { type: 'string', description: 'HTTPS clone URL' },
                                    ssh_url: { type: 'string', description: 'SSH clone URL' },
                                    default_branch: { type: 'string', description: 'Default branch name' },
                                    created_at: { type: 'string', format: 'date-time' },
                                    updated_at: { type: 'string', format: 'date-time' }
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
                    value: 'github.com',
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
capsule['#'] = '@stream44.studio/t44/structs/providers/github.com/ProjectPublishingFact.v0'
