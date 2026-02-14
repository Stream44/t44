
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
                                name: {
                                    type: 'string',
                                    description: 'Project name (directory name in workspace).'
                                },
                                sourceDir: {
                                    type: 'string',
                                    description: 'Absolute path to the project source directory.'
                                },
                                git: {
                                    oneOf: [
                                        {
                                            type: 'object',
                                            properties: {
                                                firstCommitHash: {
                                                    type: 'string',
                                                    description: 'Hash of the first commit in the repository.'
                                                },
                                                createdAt: {
                                                    type: 'string',
                                                    description: 'Date of the first commit.'
                                                },
                                                firstCommitAuthor: {
                                                    type: 'object',
                                                    properties: {
                                                        name: { type: 'string' },
                                                        email: { type: 'string' }
                                                    },
                                                    description: 'Author of the first commit.'
                                                },
                                                remotes: {
                                                    type: 'object',
                                                    additionalProperties: { type: 'string' },
                                                    description: 'Map of remote names to URLs.'
                                                }
                                            },
                                            additionalProperties: true,
                                            description: 'Git repository metadata.'
                                        },
                                        {
                                            type: 'boolean',
                                            const: false,
                                            description: 'false if not a git repository.'
                                        }
                                    ]
                                },
                                deployments: {
                                    type: 'object',
                                    additionalProperties: {
                                        type: 'object',
                                        additionalProperties: true
                                    },
                                    description: 'Deployment configurations mapped to this project.'
                                },
                                repositories: {
                                    type: 'object',
                                    additionalProperties: {
                                        type: 'object',
                                        additionalProperties: true
                                    },
                                    description: 'Repository configurations mapped to this project.'
                                },
                                updatedAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601 timestamp of when this project data was last updated.'
                                }
                            },
                            required: ['name', 'sourceDir'],
                            additionalProperties: true,
                            description: 'Cached workspace project data with enriched metadata from git, deployments, and repositories.'
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
capsule['#'] = 't44/structs/WorkspaceProject'
