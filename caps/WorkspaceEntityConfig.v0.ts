
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig.v0'
                },
                config: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<void> {

                        const config = await this.WorkspaceConfig.config

                        const configKey = '#' + this.capsuleName

                        const entityConfig = config[configKey]
                        if (entityConfig) {
                            const now = new Date().toISOString()
                            if (!entityConfig.createdAt) {
                                await this.WorkspaceConfig.setConfigValue([configKey, 'createdAt'], now)
                            }
                            if (!entityConfig.updatedAt) {
                                await this.WorkspaceConfig.setConfigValue([configKey, 'updatedAt'], now)
                            }
                        }

                        return entityConfig || undefined
                    }
                },
                setConfigValue: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, path: string[], value: any): Promise<void> {

                        const configKey = '#' + this.capsuleName

                        await this.WorkspaceConfig.setConfigValue([configKey, 'createdAt'], new Date().toISOString(), { ifAbsent: true })

                        const changed = await this.WorkspaceConfig.setConfigValue([configKey, ...path], value)

                        if (changed) {
                            await this.WorkspaceConfig.setConfigValue([configKey, 'updatedAt'], new Date().toISOString())
                        }
                    }
                }
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/caps/WorkspaceEntityConfig.v0'
