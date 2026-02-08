
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#': {
                capsuleName: {
                    type: CapsulePropertyTypes.Literal,
                    value: capsule['#']
                },
                schema: {
                    type: CapsulePropertyTypes.Literal,
                    value: {}
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
        extendsCapsule: 't44/caps/WorkspaceEntityConfig.v0',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/WorkspaceShellConfig.v0'
