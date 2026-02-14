
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
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig'
                },
                JsonSchema: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/JsonSchemas'
                },
                config: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<void> {

                        const config = await this.WorkspaceConfig.config

                        const configKey = '#' + this.capsuleName

                        const entityConfig = config[configKey] || undefined

                        return entityConfig
                    }
                },
                setConfigValue: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, path: string[], value: any): Promise<void> {

                        const configKey = '#' + this.capsuleName

                        const now = new Date().toISOString()
                        await this.WorkspaceConfig.ensureEntityTimestamps(
                            { entityName: this.capsuleName },
                            configKey, now
                        )

                        const changed = await this.WorkspaceConfig.setConfigValueForEntity(
                            { entityName: this.capsuleName, schema: this.schema },
                            [configKey, ...path], value
                        )

                        if (changed) {
                            await this.WorkspaceConfig.setConfigValueForEntity(
                                { entityName: this.capsuleName, schema: this.schema },
                                [configKey, 'updatedAt'], new Date().toISOString()
                            )
                        }
                    }
                },
                RegisterSchemas: {
                    type: CapsulePropertyTypes.StructInit,
                    value: async function (this: any): Promise<void> {
                        if (this.schema?.schema) {
                            const version = this.schemaMinorVersion || '0'
                            await this.JsonSchema.registerSchema(this.capsuleName, this.schema.schema, version)
                        }
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/caps/WorkspaceEntityConfig'
