
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
                RegisterSchemas: {
                    type: CapsulePropertyTypes.StructInit,
                    value: async function (this: any): Promise<void> {
                        if (this.schema?.schema) {
                            const version = this.schemaMinorVersion || '0'
                            await this.JsonSchema.registerSchema(this.capsuleName, this.schema.schema, version)
                        }
                    }
                },
                getFilepath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, instanceName: string): string {
                        return join(
                            this.WorkspaceConfig.workspaceRootDir,
                            this.getRelativeFilepath(instanceName)
                        )
                    }
                },
                getRelativeFilepath: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, instanceName: string): string {
                        return join(
                            '.~o',
                            'workspace.foundation',
                            capsule['#'].replace(/\//g, '~'),
                            this.capsuleName.replace(/\//g, '~'),
                            instanceName + '.json'
                        )
                    }
                },
                get: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, instanceName: string, rawFilepaths?: string[]): Promise<{ data: any; stale: boolean } | null> {
                        const factFilepath = this.getFilepath(instanceName)

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
                            const { $schema, $id, _ValidationFeedback, ...data } = parsed

                            return { data, stale }
                        } catch {
                            return null
                        }
                    }
                },
                set: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, instanceName: string, data: any): Promise<void> {

                        const factDir = join(
                            this.WorkspaceConfig.workspaceRootDir,
                            '.~o',
                            'workspace.foundation',
                            capsule['#'].replace(/\//g, '~'),
                            this.capsuleName.replace(/\//g, '~')
                        )

                        await mkdir(factDir, { recursive: true })

                        const factFilepath = join(factDir, instanceName + '.json')

                        // Check if schema defines updatedAt or createdAt
                        const schemaProperties = this.schema?.schema?.properties || {}
                        const hasUpdatedAt = 'updatedAt' in schemaProperties
                        const hasCreatedAt = 'createdAt' in schemaProperties

                        // Read existing data to check for changes and preserve timestamps
                        let existingData: any = null
                        try {
                            const existingContent = await readFile(factFilepath, 'utf-8')
                            const existingParsed = JSON.parse(existingContent)
                            const { $schema, $id, _ValidationFeedback, ...existing } = existingParsed
                            existingData = existing
                        } catch {
                            // File doesn't exist or can't be read
                        }

                        // Prepare output data
                        const outputData = { ...data }

                        // Track if we're adding missing timestamps
                        let addedCreatedAt = false
                        let addedUpdatedAt = false

                        // Set createdAt if schema defines it and it's not set
                        if (hasCreatedAt && !outputData.createdAt) {
                            if (existingData?.createdAt) {
                                // Preserve existing createdAt
                                outputData.createdAt = existingData.createdAt
                            } else {
                                // Set new createdAt (file exists but missing timestamp)
                                outputData.createdAt = new Date().toISOString()
                                addedCreatedAt = true
                            }
                        }

                        // Set updatedAt if schema defines it
                        if (hasUpdatedAt) {
                            if (!outputData.updatedAt && existingData?.updatedAt) {
                                // Preserve existing updatedAt for comparison
                                outputData.updatedAt = existingData.updatedAt
                            } else if (!outputData.updatedAt) {
                                // Set new updatedAt (file exists but missing timestamp, or new file)
                                outputData.updatedAt = new Date().toISOString()
                                if (existingData) {
                                    addedUpdatedAt = true
                                }
                            }
                        }

                        const version = this.schemaMinorVersion || '0'
                        const output: Record<string, any> = {
                            $schema: 'https://json-schema.org/draft/2020-12/schema',
                            $id: this.capsuleName + '.v' + version,
                            ...outputData
                        }

                        // Check if content has changed
                        if (existingData) {
                            const existingOutput = {
                                $schema: 'https://json-schema.org/draft/2020-12/schema',
                                $id: this.capsuleName + '.v' + version,
                                ...existingData
                            }
                            const existingContent = JSON.stringify(existingOutput, null, 4)
                            const newContent = JSON.stringify(output, null, 4)

                            if (existingContent === newContent) {
                                // Content is identical, skip write
                                return
                            }

                            // Content changed - update updatedAt if schema defines it and it matches existing
                            // But only if we didn't just add it (which means data actually changed)
                            if (hasUpdatedAt && !addedUpdatedAt && !addedCreatedAt && outputData.updatedAt === existingData?.updatedAt) {
                                output.updatedAt = new Date().toISOString()
                            }
                        }

                        await writeFile(factFilepath, JSON.stringify(output, null, 4))
                    }
                },
                delete: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, instanceName: string): Promise<void> {
                        const { unlink } = await import('fs/promises')
                        const factFilepath = this.getFilepath(instanceName)

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
capsule['#'] = 't44/caps/WorkspaceEntityFact'
