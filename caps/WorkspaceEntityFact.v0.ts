
import { join } from 'path'
import { mkdir, writeFile, readFile, stat } from 'fs/promises'


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
                origin: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined,
                },
                getFilepath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, factType: string, instanceName: string): string {
                        return join(
                            this.WorkspaceConfig.workspaceRootDir,
                            this.getRelativeFilepath(factType, instanceName)
                        )
                    }
                },
                getRelativeFilepath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, factType: string, instanceName: string): string {
                        return join(
                            '.~o',
                            'workspace.foundation',
                            'WorkspaceEntityFacts',
                            'o',
                            this.origin,
                            factType,
                            instanceName + '.json'
                        )
                    }
                },
                get: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, factType: string, instanceName: string, schemaName: string, rawFilepaths?: string[]): Promise<{ data: any; stale: boolean } | null> {
                        const factFilepath = this.getFilepath(factType, instanceName)

                        try {
                            const factStat = await stat(factFilepath)
                            const factMtime = factStat.mtimeMs

                            // Check if any raw filepaths are newer than our cached fact
                            let stale = false
                            if (rawFilepaths && rawFilepaths.length > 0) {
                                for (const rawPath of rawFilepaths) {
                                    const fullRawPath = rawPath.startsWith('/')
                                        ? rawPath
                                        : join(this.WorkspaceConfig.workspaceRootDir, rawPath)
                                    try {
                                        const rawStat = await stat(fullRawPath)
                                        if (rawStat.mtimeMs > factMtime) {
                                            stale = true
                                            break
                                        }
                                    } catch {
                                        // Raw file doesn't exist, consider stale
                                        stale = true
                                        break
                                    }
                                }
                            }

                            const content = await readFile(factFilepath, 'utf-8')
                            const parsed = JSON.parse(content)
                            const data = parsed[schemaName]

                            return { data, stale }
                        } catch {
                            return null
                        }
                    }
                },
                set: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, factType: string, instanceName: string, schemaName: string, data: any): Promise<void> {

                        if (this.schema?.definitions) {
                            const schemaRef = this.schema.definitions[schemaName]
                            if (!schemaRef) {
                                throw new Error(`Schema name "${schemaName}" not found in definitions. Available: ${Object.keys(this.schema.definitions).join(', ')}`)
                            }
                        }

                        const factDir = join(
                            this.WorkspaceConfig.workspaceRootDir,
                            '.~o',
                            'workspace.foundation',
                            'WorkspaceEntityFacts',
                            'o',
                            this.origin,
                            factType
                        )

                        await mkdir(factDir, { recursive: true })

                        let validationFeedback = null
                        if (this.schema?.validate) {
                            validationFeedback = await this.schema.validate(schemaName, data)
                        }

                        let schemaFilePath: string | undefined
                        if (this.schema?.definitions && this.capsuleName) {
                            const jsonSchemaDir = join(
                                this.WorkspaceConfig.workspaceRootDir,
                                '.~o',
                                'workspace.foundation',
                                'WorkspaceEntityFacts',
                                'JsonSchemas'
                            )
                            await mkdir(jsonSchemaDir, { recursive: true })

                            const schemaFilename = this.capsuleName.replace(/\//g, '~') + '.json'
                            schemaFilePath = join(jsonSchemaDir, schemaFilename)

                            const schemaOutput: Record<string, any> = {
                                $schema: 'https://json-schema.org/draft/2020-12/schema',
                                $id: this.capsuleName,
                                $defs: {}
                            }

                            for (const defName of Object.keys(this.schema.definitions)) {
                                const resolved = this.schema.resolveDefinition
                                    ? await this.schema.resolveDefinition(defName)
                                    : null
                                schemaOutput.$defs[defName] = resolved || this.schema.definitions[defName]
                            }

                            await writeFile(schemaFilePath, JSON.stringify(schemaOutput, null, 4))
                        }

                        const output: Record<string, any> = {
                            $schema: 'https://json-schema.org/draft/2020-12/schema'
                        }

                        if (schemaFilePath && this.capsuleName) {
                            output.$defs = {
                                [schemaName]: {
                                    $ref: this.capsuleName + '#/$defs/' + schemaName
                                }
                            }
                        }

                        output[schemaName] = data

                        if (validationFeedback && (validationFeedback.warnings.length > 0 || validationFeedback.errors.length > 0)) {
                            output[schemaName + '_ValidationFeedback'] = validationFeedback
                        }

                        await writeFile(join(factDir, instanceName + '.json'), JSON.stringify(output, null, 4))
                    }
                },
                delete: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, factType: string, instanceName: string): Promise<void> {
                        const { unlink } = await import('fs/promises')
                        const factFilepath = this.getFilepath(factType, instanceName)

                        try {
                            await unlink(factFilepath)
                        } catch (error: any) {
                            // Ignore if file doesn't exist
                            if (error.code !== 'ENOENT') {
                                throw error
                            }
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
capsule['#'] = 't44/caps/WorkspaceEntityFact.v0'
