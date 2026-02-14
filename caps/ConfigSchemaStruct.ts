
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
                JsonSchema: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/JsonSchemas'
                },
                schema: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined
                },
                validate: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, definitionName: string, data: any): Promise<{ warnings: any[], errors: any[] }> {
                        return this.JsonSchema.validate(definitionName, data)
                    }
                },
                wrapWithSchema: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, data: any, capsuleName: string, version?: string): Record<string, any> {
                        return this.JsonSchema.wrapWithSchema(data, capsuleName, version)
                    }
                },
                resolveSchemaFilePath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, capsuleName?: string): string | undefined {
                        return this.JsonSchema.resolveSchemaFilePath(capsuleName || this.capsuleName)
                    }
                },
                formatValidationFeedback: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, feedback: { warnings: any[], errors: any[] }, context: { filePath?: string, schemaRef?: string }): string {
                        return this.JsonSchema.formatValidationFeedback(feedback, context)
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
capsule['#'] = 't44/caps/ConfigSchemaStruct'
