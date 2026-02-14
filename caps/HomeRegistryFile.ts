
import { join, relative, dirname } from 'path'
import { readFile, writeFile, mkdir, access } from 'fs/promises'

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
            '#t44/structs/HomeRegistryConfig': {
                as: '$HomeRegistryConfig'
            },
            '#': {
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
                _resolveDir: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<string> {
                        const config = await this.$HomeRegistryConfig.config
                        if (!config?.rootDir) {
                            throw new Error('Home registry rootDir is not configured. Run ensureRootDir() first.')
                        }
                        const dirName = this.capsuleName.replace(/\//g, '~')
                        return join(config.rootDir, dirName)
                    }
                },
                get: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<any | null> {
                        const filePath = join(await this._resolveDir, `${name}.json`)
                        let parsed: any
                        try {
                            parsed = JSON.parse(await readFile(filePath, 'utf-8'))
                        } catch {
                            return null
                        }

                        // Migrate old wrapper format: { $schema, $defs?, SchemaName: { ...data }, ... }
                        // to flat format: { $schema, $id, ...data }
                        if (parsed && parsed.$schema) {
                            const schemaName = this.capsuleName.split('/').pop()?.replace(/\.v\d+$/, '')
                            if (schemaName && parsed[schemaName] && typeof parsed[schemaName] === 'object') {
                                const innerData = parsed[schemaName]
                                // Re-write in new format with $schema and $id
                                const version = this.schemaMinorVersion || '0'
                                const output = this.schema.wrapWithSchema(innerData, this.capsuleName, version)
                                await writeFile(filePath, JSON.stringify(output, null, 2), { mode: 0o600 })
                                return innerData
                            }
                        }

                        // Migrate old relative $schema format to new $schema + $id format
                        if (parsed && parsed.$schema && !parsed.$id && typeof parsed.$schema === 'string' && parsed.$schema.includes('/')) {
                            const data = { ...parsed }
                            delete data.$schema
                            // Re-write in new format with $schema and $id
                            const version = this.schemaMinorVersion || '0'
                            const output = this.schema.wrapWithSchema(data, this.capsuleName, version)
                            await writeFile(filePath, JSON.stringify(output, null, 2), { mode: 0o600 })
                            return data
                        }

                        // Already schema-wrapped (new format) — return data (strip $schema and $id)
                        if (parsed && (parsed.$schema || parsed.$id)) {
                            const data = { ...parsed }
                            delete data.$schema
                            delete data.$id
                            return data
                        }

                        // Raw data — wrap with schema and re-write
                        const data = parsed
                        if (this.schema?.wrapWithSchema) {
                            const version = this.schemaMinorVersion || '0'
                            const output = this.schema.wrapWithSchema(data, this.capsuleName, version)
                            await writeFile(filePath, JSON.stringify(output, null, 2), { mode: 0o600 })
                        }

                        return data
                    }
                },
                set: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string, data: any): Promise<string> {
                        const dir = await this._resolveDir
                        const filePath = join(dir, `${name}.json`)
                        await mkdir(dir, { recursive: true })

                        if (this.schema?.wrapWithSchema) {
                            const version = this.schemaMinorVersion || '0'
                            const output = this.schema.wrapWithSchema(data, this.capsuleName, version)
                            await writeFile(filePath, JSON.stringify(output, null, 2), { mode: 0o600 })
                        } else {
                            await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
                        }

                        return filePath
                    }
                },
                getPath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<string> {
                        return join(await this._resolveDir, `${name}.json`)
                    }
                },
                exists: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, name: string): Promise<boolean> {
                        const filePath = join(await this._resolveDir, `${name}.json`)
                        try {
                            await access(filePath)
                            return true
                        } catch {
                            return false
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
capsule['#'] = 't44/caps/HomeRegistryFile'
