
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import chalk from 'chalk'

function createAjvInstance(): Ajv {
    const ajv = new Ajv({
        allErrors: true,
        strict: false,
        validateFormats: true,
        logger: false
    })
    addFormats(ajv)
    return ajv
}

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
                schemas: {
                    type: CapsulePropertyTypes.Literal,
                    value: {}
                },
                resolveDefinition: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, defName: string): Promise<any | null> {
                        const defValue = this.schemas[defName]
                        if (!defValue) return null
                        if (typeof defValue === 'object') return defValue
                        return null
                    }
                },
                validate: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, definitionName: string, data: any): Promise<{ warnings: any[], errors: any[] }> {
                        const warnings: any[] = []
                        const errors: any[] = []

                        const schema = this.schemas[definitionName]
                        if (!schema) {
                            errors.push({
                                type: 'schema_not_found',
                                message: `Definition "${definitionName}" not found in schema schemas`,
                                definitionName
                            })
                            return { warnings, errors }
                        }

                        const ajv = createAjvInstance()

                        let validate
                        try {
                            validate = ajv.compile(schema)
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
                            const validationErrors = validate.errors?.map((err: any) => ({
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
                },
                registerSchema: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, capsuleName: string, schema: Record<string, any>, schemaMinorVersion?: string): Promise<string | undefined> {
                        if (!schema || !capsuleName) {
                            return undefined
                        }

                        this.schemas[capsuleName] = schema

                        const workspaceRootDir = this.WorkspaceConfig?.workspaceRootDir
                        if (!workspaceRootDir) {
                            return undefined
                        }

                        const jsonSchemaDir = join(
                            workspaceRootDir,
                            '.~o',
                            'workspace.foundation',
                            capsule['#'].replace(/\//g, '~')
                        )
                        await mkdir(jsonSchemaDir, { recursive: true })

                        const version = schemaMinorVersion || '0'
                        const schemaFilename = capsuleName.replace(/\//g, '~') + '.json'
                        const schemaFilePath = join(jsonSchemaDir, schemaFilename)

                        const schemaOutput: Record<string, any> = {
                            $schema: 'https://json-schema.org/draft/2020-12/schema',
                            $id: capsuleName + '.v' + version,
                            ...schema
                        }

                        const schemaJson = JSON.stringify(schemaOutput, null, 4)
                        const existing = await readFile(schemaFilePath, 'utf-8').catch(() => null)
                        if (existing !== schemaJson) {
                            await writeFile(schemaFilePath, schemaJson)
                        }
                        return schemaFilePath
                    }
                },
                formatValidationFeedback: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, feedback: { warnings: any[], errors: any[] }, context: { filePath?: string, schemaRef?: string }): string {
                        const lines: string[] = [
                            '',
                            chalk.bold.red('✗ Schema Validation Failed'),
                            ''
                        ]

                        if (context.filePath) {
                            lines.push(
                                chalk.gray('  File:'),
                                chalk.yellow(`    ${context.filePath}`),
                                ''
                            )
                        }

                        if (context.schemaRef) {
                            lines.push(
                                chalk.gray('  Schema:'),
                                chalk.cyan(`    ${context.schemaRef}`),
                                ''
                            )
                        }

                        if (feedback.errors.length > 0) {
                            lines.push(
                                chalk.gray('  Errors:'),
                                ...feedback.errors.map((e: any) => chalk.red(`    • ${e.message || e}`)),
                                ''
                            )
                        }

                        if (feedback.warnings.length > 0) {
                            lines.push(
                                chalk.gray('  Warnings:'),
                                ...feedback.warnings.map((w: any) => chalk.yellow(`    • ${w.message || w}`)),
                                ''
                            )
                        }

                        return lines.join('\n')
                    }
                },
                resolveSchemaFilePath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, capsuleName: string): string | undefined {
                        const workspaceRootDir = this.WorkspaceConfig?.workspaceRootDir
                        if (!workspaceRootDir) return undefined
                        const jsonSchemaDir = join(
                            workspaceRootDir,
                            '.~o',
                            'workspace.foundation',
                            capsule['#'].replace(/\//g, '~')
                        )
                        const schemaFilename = capsuleName.replace(/\//g, '~') + '.json'
                        return join(jsonSchemaDir, schemaFilename)
                    }
                },
                wrapWithSchema: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, data: any, capsuleName: string, version?: string): Record<string, any> {
                        const output: Record<string, any> = {}
                        // Use standard JSON Schema URL for $schema
                        output.$schema = 'https://json-schema.org/draft/2020-12/schema'
                        // Use entity identifier with version for $id
                        const versionSuffix = version ? `.v${version}` : '.v0'
                        output.$id = `${capsuleName}${versionSuffix}`
                        Object.assign(output, data)
                        return output
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
capsule['#'] = 't44/caps/JsonSchemas'
