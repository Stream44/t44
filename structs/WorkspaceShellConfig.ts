
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
                                env: {
                                    type: 'object',
                                    properties: {
                                        default: {
                                            type: 'object',
                                            additionalProperties: { type: 'string' },
                                            description: 'Default environment variables.'
                                        },
                                        force: {
                                            type: 'object',
                                            additionalProperties: { type: 'string' },
                                            description: 'Forced environment variables that override defaults.'
                                        }
                                    },
                                    additionalProperties: true,
                                    description: 'Shell environment variable configuration.'
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
                            additionalProperties: true,
                            description: 'Workspace shell configuration with environment variables.'
                        }
                    }
                }
            },
            '#': {
                capsuleName: {
                    type: CapsulePropertyTypes.Literal,
                    value: capsule['#']
                },
                env: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<object> {
                        const shellConfig = await this.config

                        if (!shellConfig?.env) {
                            return {}
                        }

                        const defaultEnv = shellConfig.env.default || {}
                        const forceEnv = shellConfig.env.force || {}

                        return {
                            ...defaultEnv,
                            ...forceEnv
                        }
                    }
                },
            }
        }
    }, {
        extendsCapsule: 't44/caps/WorkspaceEntityConfig',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/WorkspaceShellConfig'
