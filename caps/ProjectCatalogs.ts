
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
            '#t44/structs/ProjectCatalogsConfig': {
                as: '$ProjectCatalogsConfig',
            },
            '#': {
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/HomeRegistry'
                },
                list: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<Record<string, any>> {
                        const catalogsConfig = await this.$ProjectCatalogsConfig.config
                        return catalogsConfig?.catalogs || {}
                    }
                },
                validate: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<boolean> {
                        const catalogsConfig = await this.$ProjectCatalogsConfig.config
                        const catalogs = catalogsConfig?.catalogs

                        if (!catalogs || typeof catalogs !== 'object') {
                            return true
                        }

                        const chalk = (await import('chalk')).default

                        for (const [catalogName, catalogConfig] of Object.entries(catalogs)) {
                            if (!catalogConfig || typeof catalogConfig !== 'object') {
                                console.log(chalk.red(`\n✗ Invalid catalog '${catalogName}': must be an object.\n`))
                                return false
                            }

                            const fileName = catalogName.replace(/\//g, '~')
                            const typedConfig = catalogConfig as Record<string, any>

                            const existing = await this.HomeRegistry.getCatalog(fileName) || {}
                            const now = new Date().toISOString()

                            // Deep merge: config keys into existing, preserving existing nested data
                            let changed = false
                            for (const [key, value] of Object.entries(typedConfig)) {
                                if (key === 'repositories' && typeof value === 'object' && typeof existing[key] === 'object') {
                                    // Merge repositories: add missing repos, keep existing repo data
                                    for (const [repoName, repoConfig] of Object.entries(value as Record<string, any>)) {
                                        if (!existing[key][repoName]) {
                                            existing[key][repoName] = repoConfig || {}
                                            changed = true
                                        }
                                    }
                                } else if (JSON.stringify(existing[key]) !== JSON.stringify(value)) {
                                    existing[key] = value
                                    changed = true
                                }
                            }

                            if (changed) {
                                existing.updatedAt = now
                            }
                            if (!existing.createdAt) {
                                existing.createdAt = now
                            }

                            const filePath = await this.HomeRegistry.setCatalog(fileName, existing)
                            if (changed) {
                                console.log(chalk.green(`   ✓ Catalog '${catalogName}' → ${filePath}`))
                            }
                        }

                        return true
                    }
                },
                updateCatalogRepository: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, {
                        repoName,
                        providerKey,
                        providerData,
                    }: {
                        repoName: string
                        providerKey: string
                        providerData: Record<string, any>
                    }): Promise<void> {
                        const catalogsConfig = await this.$ProjectCatalogsConfig.config
                        const catalogs = catalogsConfig?.catalogs

                        if (!catalogs || typeof catalogs !== 'object') return

                        for (const [catalogName, catalogConfig] of Object.entries(catalogs)) {
                            const typedConfig = catalogConfig as Record<string, any>
                            const repositories = typedConfig.repositories
                            if (!repositories || typeof repositories !== 'object') continue
                            if (!(repoName in repositories)) continue

                            const fileName = catalogName.replace(/\//g, '~')
                            const existing = await this.HomeRegistry.getCatalog(fileName)
                            if (!existing) continue

                            if (!existing.repositories) existing.repositories = {}
                            if (!existing.repositories[repoName]) existing.repositories[repoName] = {}
                            const repoEntry = existing.repositories[repoName]
                            const now = new Date().toISOString()

                            const existingEntity = repoEntry[providerKey]
                            const entityCreatedAt = existingEntity?.createdAt || now

                            // Check if data actually changed (compare without timestamps, order-independent)
                            const { createdAt: _ec, updatedAt: _eu, ...existingData } = existingEntity || {}
                            const stableStringify = (obj: any): string => JSON.stringify(obj, (_, v) =>
                                v && typeof v === 'object' && !Array.isArray(v)
                                    ? Object.keys(v).sort().reduce((o: any, k) => { o[k] = v[k]; return o }, {})
                                    : v
                            )
                            const dataChanged = stableStringify(existingData) !== stableStringify(providerData)

                            repoEntry[providerKey] = {
                                ...providerData,
                                createdAt: entityCreatedAt,
                                updatedAt: dataChanged ? now : (existingEntity?.updatedAt || now),
                            }

                            if (!repoEntry.createdAt) repoEntry.createdAt = now
                            if (dataChanged) {
                                repoEntry.updatedAt = now
                                existing.updatedAt = now
                            }

                            await this.HomeRegistry.setCatalog(fileName, existing)
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
capsule['#'] = 't44/caps/ProjectCatalogs'
