import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

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
                url: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined,
                },
                schemas: {
                    type: CapsulePropertyTypes.Literal,
                    value: {}
                },
                ensureCached: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<any | null> {
                        if (!this.url) return null

                        const cacheDir = join(
                            this.WorkspaceConfig.workspaceRootDir,
                            '.~o',
                            'workspace.foundation',
                            'OpenApiSchemas',
                        )

                        await mkdir(cacheDir, { recursive: true })

                        const schemaFile = join(cacheDir, this.url.replace(/\//g, '~'))

                        try {
                            const cached = await readFile(schemaFile, 'utf-8')
                            return JSON.parse(cached)
                        } catch (error) {
                            const response = await fetch(this.url)
                            if (!response.ok) {
                                return null
                            }
                            const openApiSpec = await response.json()
                            await writeFile(schemaFile, JSON.stringify(openApiSpec, null, 2))
                            return openApiSpec
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
capsule['#'] = 't44/caps/OpenApiSchema'
