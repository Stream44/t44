import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { convertOpenApiToJsonSchema, createAjvInstance } from '../lib/openapi.js'

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
                    value: '@stream44.studio/t44/caps/WorkspaceConfig.v0'
                },
                url: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined,
                },
                definitions: {
                    type: CapsulePropertyTypes.Literal,
                    value: {}
                },
                resolveDefinition: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, defName: string): Promise<any | null> {
                        const defValue = this.definitions[defName]
                        if (!defValue) return null

                        if (typeof defValue === 'object') {
                            return defValue
                        }

                        if (typeof defValue === 'string' && this.url) {
                            const cacheDir = join(
                                this.WorkspaceConfig.workspaceRootDir,
                                '.~o',
                                'workspace.foundation',
                                'WorkspaceEntityFacts',
                                'OpenApiSchemas',
                            )

                            await mkdir(cacheDir, { recursive: true })

                            const schemaFile = join(cacheDir, this.url.replace(/\//g, '~'))

                            let openApiSpec: any
                            try {
                                const cached = await readFile(schemaFile, 'utf-8')
                                openApiSpec = JSON.parse(cached)
                            } catch (error) {
                                const response = await fetch(this.url)
                                if (!response.ok) {
                                    return null
                                }
                                openApiSpec = await response.json()
                                await writeFile(schemaFile, JSON.stringify(openApiSpec, null, 2))
                            }

                            const refParts = defValue.replace(/^#\//, '').split('/')
                            let schema = openApiSpec
                            for (const part of refParts) {
                                const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~')
                                schema = schema[decodedPart]
                                if (!schema) return null
                            }
                            return schema
                        }

                        return null
                    }
                },
                validate: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, definitionName: string, data: any): Promise<{ warnings: any[], errors: any[] }> {
                        const warnings: any[] = []
                        const errors: any[] = []

                        const schemaRef = this.definitions[definitionName]
                        if (!schemaRef) {
                            errors.push({
                                type: 'schema_not_found',
                                message: `Definition "${definitionName}" not found in schema definitions`,
                                definitionName
                            })
                            return { warnings, errors }
                        }

                        let schema: any
                        let openApiSpec: any

                        if (typeof schemaRef === 'object') {
                            schema = schemaRef
                            openApiSpec = { definitions: this.definitions }
                        } else {
                            const cacheDir = join(
                                this.WorkspaceConfig.workspaceRootDir,
                                '.~o',
                                'workspace.foundation',
                                'WorkspaceEntityFacts',
                                'OpenApiSchemas',
                            )

                            await mkdir(cacheDir, { recursive: true })

                            const schemaFile = join(cacheDir, this.url.replace(/\//g, '~'))

                            try {
                                const cached = await readFile(schemaFile, 'utf-8')
                                openApiSpec = JSON.parse(cached)
                            } catch (error) {
                                const response = await fetch(this.url)
                                if (!response.ok) {
                                    errors.push({
                                        type: 'fetch_failed',
                                        message: `Failed to fetch OpenAPI spec from ${this.url}: ${response.statusText}`,
                                        url: this.url
                                    })
                                    return { warnings, errors }
                                }
                                openApiSpec = await response.json()
                                await writeFile(schemaFile, JSON.stringify(openApiSpec, null, 2))
                            }

                            const refParts = schemaRef.replace(/^#\//, '').split('/')
                            schema = openApiSpec
                            for (const part of refParts) {
                                const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~')
                                schema = schema[decodedPart]
                                if (!schema) {
                                    errors.push({
                                        type: 'schema_reference_not_found',
                                        message: `Schema reference "${schemaRef}" not found in OpenAPI spec`,
                                        schemaRef
                                    })
                                    return { warnings, errors }
                                }
                            }
                        }

                        const ajv = createAjvInstance()

                        const jsonSchema = convertOpenApiToJsonSchema(schema, openApiSpec, warnings)

                        let validate
                        try {
                            validate = ajv.compile(jsonSchema)
                        } catch (error: any) {
                            warnings.push({
                                type: 'schema_compilation_failed',
                                message: `Schema compilation failed for "${definitionName}": ${error.message}`,
                                definitionName,
                                error: error.message
                            })
                            return { warnings, errors }
                        }

                        if (!validate(data)) {
                            const validationErrors = validate.errors?.map(err => ({
                                path: err.instancePath || '/',
                                message: err.message,
                                params: err.params,
                                keyword: err.keyword,
                                schemaPath: err.schemaPath
                            })) || []

                            errors.push({
                                type: 'validation_failed',
                                message: `Data does not conform to schema "${definitionName}"`,
                                definitionName,
                                validationErrors
                            })
                        }

                        return { warnings, errors }
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
capsule['#'] = '@stream44.studio/t44/caps/OpenApiSchema.v0'
