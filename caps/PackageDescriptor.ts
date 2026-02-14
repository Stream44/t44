
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

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
                RegisterSchemas: {
                    type: CapsulePropertyTypes.StructInit,
                    value: async function (this: any): Promise<void> {
                        if (this.schema?.schema) {
                            const version = this.schemaMinorVersion || '0'
                            await this.JsonSchema.registerSchema(this.capsuleName, this.schema.schema, version)
                        }
                    }
                },
                _readPackageJson: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, packageJsonPath: string): Promise<any> {
                        const content = await readFile(packageJsonPath, 'utf-8')
                        return JSON.parse(content)
                    }
                },
                _writePackageJson: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, packageJsonPath: string, pkg: any): Promise<void> {
                        await writeFile(packageJsonPath, JSON.stringify(pkg, null, 4) + '\n')
                    }
                },
                _resolveConfigSection: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, pkg: any): any {
                        const structKey = this.capsuleName
                        if (!pkg.config) return undefined
                        if (!pkg.config.o) return undefined
                        if (!pkg.config.o['workspace.foundation']) return undefined
                        return pkg.config.o['workspace.foundation'][structKey] || undefined
                    }
                },
                get: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, packageJsonPath: string): Promise<any | null> {
                        try {
                            const pkg = await this._readPackageJson(packageJsonPath)
                            return this._resolveConfigSection(pkg) || null
                        } catch {
                            return null
                        }
                    }
                },
                set: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, packageJsonPath: string, data: any): Promise<void> {
                        const pkg = await this._readPackageJson(packageJsonPath)
                        const structKey = this.capsuleName

                        if (!pkg.config) pkg.config = {}
                        if (!pkg.config.o) pkg.config.o = {}
                        if (!pkg.config.o['workspace.foundation']) pkg.config.o['workspace.foundation'] = {}

                        pkg.config.o['workspace.foundation'][structKey] = data

                        await this._writePackageJson(packageJsonPath, pkg)
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
capsule['#'] = 't44/caps/PackageDescriptor'
