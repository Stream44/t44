
import { join, relative } from 'path'
import { readdir } from 'fs/promises'
import chalk from 'chalk'
import { Resolver } from '../lib/schema-resolver.js'
import type { ResolvedEntity } from '../lib/schema-resolver.js'
import { SchemaConsoleRenderer } from '../lib/schema-console-renderer.js'

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
            '#t44/structs/WorkspaceConfig': {
                as: '$Config'
            },
            '#': {
                Home: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/Home'
                },
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/HomeRegistry'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options?: { full?: boolean; entitySelector?: string }): Promise<void> {
                        const showFull = options?.full || false
                        const entitySelector = options?.entitySelector

                        const workspaceConfig = await this.$Config.config
                        const workspaceRootDir = workspaceConfig?.rootDir
                        const workspaceName = workspaceConfig?.name || 'default'

                        // Build resolver context with all required paths
                        const registryDir = await this.Home.registryDir
                        const foundationDir = join(workspaceRootDir, '.~o', 'workspace.foundation')
                        const homeRegistryConnectionsDir = join(registryDir, '@t44.sh~t44~caps~WorkspaceConnection', workspaceName)

                        const resolver = Resolver({
                            workspaceRootDir,
                            workspaceName,
                            schemasDir: join(foundationDir, '@t44.sh~t44~caps~JsonSchemas'),
                            factsDir: join(foundationDir, '@t44.sh~t44~caps~WorkspaceEntityFact'),
                            metaCacheDir: join(foundationDir, '@t44.sh~t44~caps~WorkspaceEntityFact', '@t44.sh~t44~structs~WorkspaceConfigFileMeta'),
                            homeRegistryConnectionsDir
                        })

                        // Load all entity types in parallel
                        const [schemas, configResult, factResult, connectionResult, registryEntities] = await Promise.all([
                            resolver.loadSchemas(),
                            resolver.loadConfigEntities(),
                            resolver.loadFactEntities(),
                            resolver.loadConnectionEntities(),
                            (async () => {
                                const registryRootDir = await this.HomeRegistry.rootDir
                                try {
                                    const entries = await readdir(registryRootDir)
                                    return {
                                        rootDir: registryRootDir,
                                        entities: entries
                                            .filter((e: string) => e.startsWith('@'))
                                            .map((e: string) => e.replace(/~/g, '/'))
                                    }
                                } catch {
                                    return { rootDir: registryRootDir, entities: [] }
                                }
                            })()
                        ])

                        // Merge entity maps from individual loaders
                        const entities = new Map<string, ResolvedEntity[]>()
                        for (const [key, value] of configResult.entities) entities.set(key, value)
                        for (const [key, value] of factResult.entities) {
                            if (entities.has(key)) entities.get(key)!.push(...value)
                            else entities.set(key, value)
                        }
                        for (const [key, value] of connectionResult.entities) {
                            if (entities.has(key)) entities.get(key)!.push(...value)
                            else entities.set(key, value)
                        }

                        const configEntities = configResult.configEntities
                        const factEntities = factResult.factEntities
                        const connectionEntities = connectionResult.connectionEntities
                        const registryEntitySet = new Set(registryEntities.entities)
                        const registryRootDir = registryEntities.rootDir

                        // Build schema lookup: entity name (without #) → schema file path
                        const schemaMap = new Map<string, string>()
                        const schemasDir = join(workspaceRootDir, '.~o', 'workspace.foundation', '@t44.sh~t44~caps~JsonSchemas')
                        for (const [schemaId] of schemas) {
                            const entityName = schemaId.replace(/\.v\d+$/, '')
                            // Schema files don't include version in filename, only in $id
                            const schemaFileName = entityName.replace(/\//g, '~') + '.json'
                            const schemaPath = relative(workspaceRootDir, join(schemasDir, schemaFileName))
                            schemaMap.set(entityName, schemaPath)
                        }

                        // Build unified entity list from all sources
                        const allEntities = new Set<string>()
                        for (const key of entities.keys()) allEntities.add(key)
                        for (const name of registryEntitySet) {
                            const key = name.startsWith('#') ? name : '#' + name
                            allEntities.add(key)
                        }
                        // Add schema-only entities (schemas without data)
                        // Skip if entity already has config/fact/connection/registry data
                        for (const entityName of schemaMap.keys()) {
                            const key = '#' + entityName
                            if (!entities.has(key) && !registryEntitySet.has(entityName)) {
                                allEntities.add(key)
                            }
                        }

                        // Build entity matching function
                        const matchesSelector = (entity: string): boolean => {
                            if (!entitySelector) return true

                            const entityName = entity.startsWith('#') ? entity.substring(1) : entity
                            const schemaId = schemaMap.has(entityName) ? entityName : null

                            // Path-based matching (starts with '.')
                            if (entitySelector.startsWith('.')) {
                                const selectorPath = join(process.cwd(), entitySelector)

                                // Check config entities
                                const configInstances = entities.get(entity) || []
                                for (const instance of configInstances) {
                                    if (instance.filePath.includes(selectorPath) || instance.relPath.includes(entitySelector)) {
                                        return true
                                    }
                                }

                                // Check fact entities
                                const facts = factEntities.get(entityName) || []
                                for (const fact of facts) {
                                    if (fact.filePath.includes(selectorPath) || fact.relPath.includes(entitySelector)) {
                                        return true
                                    }
                                }

                                // Check connection entities
                                const connections = connectionEntities.get(entityName) || []
                                for (const conn of connections) {
                                    if (conn.filePath.includes(selectorPath) || conn.relPath.includes(entitySelector)) {
                                        return true
                                    }
                                }

                                return false
                            }

                            // Entity name matching (indexOf)
                            if (entityName.indexOf(entitySelector) !== -1) {
                                return true
                            }

                            // Schema ID matching (indexOf)
                            if (schemaId && schemaId.indexOf(entitySelector) !== -1) {
                                return true
                            }

                            return false
                        }

                        // Filter entities based on selector
                        const filteredEntities = Array.from(allEntities).filter(matchesSelector).sort()

                        console.log('')

                        for (const entity of filteredEntities) {
                            const entityName = entity.startsWith('#') ? entity.substring(1) : entity
                            const isRegistry = registryEntitySet.has(entityName)
                            const isConfig = configEntities.has(entity)
                            const isFact = factEntities.has(entityName)
                            const isConnection = connectionEntities.has(entityName)
                            const hasSchema = schemaMap.has(entityName)

                            const schemaSuffix = hasSchema ? chalk.gray(' - ') + chalk.gray(schemaMap.get(entityName)!) : ''

                            // Collect validation status
                            const entityInstances = entities.get(entity) || []
                            const invalidInstances = entityInstances.filter(e => !e.valid)
                            const validationSuffix = invalidInstances.length > 0
                                ? chalk.red(` ✗ ${invalidInstances.length} validation error(s)`)
                                : ''

                            // Skip schema-only display if entity also has registry/config/fact/connection data
                            // This prevents duplicate lines for entities like HomeRegistry
                            if (!isConfig && !isRegistry && !isFact && !isConnection) {
                                // Schema-only entity
                                if (hasSchema) {
                                    console.log(chalk.gray(entityName) + schemaSuffix)
                                }
                                continue
                            }

                            if (isRegistry && !isConfig && !isFact && !isConnection) {
                                const dirName = entity.replace(/\//g, '~')
                                const registryPath = `${registryRootDir}/${dirName}`
                                console.log(chalk.bold.white(entityName) + ' ' + chalk.magenta('[registry]') + chalk.gray(' - ') + chalk.yellow(`${registryPath}/`) + schemaSuffix + validationSuffix)
                            } else if (isConfig) {
                                const configInstances = entityInstances.filter(e => e.filePath.endsWith('.yaml'))
                                if (configInstances.length > 0) {
                                    const first = configInstances[0]
                                    const lineInfo = first.line ? `:${first.line}` : ''
                                    console.log(chalk.bold.white(entityName) + ' ' + chalk.cyan('[config]') + chalk.gray(' - ') + chalk.yellow(first.relPath + lineInfo) + schemaSuffix + validationSuffix)
                                } else {
                                    console.log(chalk.bold.white(entityName) + ' ' + chalk.cyan('[config]') + schemaSuffix + validationSuffix)
                                }

                                if (isRegistry) {
                                    const dirName = entity.replace(/\//g, '~')
                                    const registryPath = `${registryRootDir}/${dirName}`
                                    console.log(chalk.magenta('  [registry]') + chalk.gray(' - ') + chalk.yellow(`${registryPath}/`))
                                }
                            }

                            // Show fact files
                            if (isFact) {
                                const facts = factEntities.get(entityName)!
                                if (!isConfig && !isRegistry && !isConnection) {
                                    console.log(chalk.bold.white(entityName) + ' ' + chalk.green('[fact]') + schemaSuffix + validationSuffix)
                                } else {
                                    console.log(chalk.green('  [fact]'))
                                }
                                for (let i = 0; i < facts.length; i++) {
                                    const fact = facts[i]
                                    const connector = i === facts.length - 1 ? '└── ' : '├── '
                                    const indent = (isConfig || isRegistry || isConnection) ? '    ' : '  '
                                    const validMark = fact.valid ? '' : chalk.red(' ✗')
                                    console.log(chalk.gray(indent + connector) + chalk.green(fact.relPath) + chalk.gray(` (${fact.name})`) + validMark)

                                    // Show full details for this specific file if --full flag is set
                                    if (showFull) {
                                        const schema = schemas.get(fact.schemaId)
                                        const detailIndent = indent + '    '

                                        if (schema) {
                                            const rendered = SchemaConsoleRenderer.renderEntity(fact.data, schema, {
                                                indent: detailIndent.length / 2,
                                                maxDepth: -1,
                                                showTypes: false
                                            })
                                            console.log(rendered)
                                        } else {
                                            const jsonLines = JSON.stringify(fact.data, null, 2).split('\n')
                                            for (const line of jsonLines) {
                                                console.log(chalk.gray(detailIndent + line))
                                            }
                                        }

                                        if (fact.errors.length > 0) {
                                            const errorLines = SchemaConsoleRenderer.renderErrors(fact.errors).split('\n')
                                            for (const line of errorLines) {
                                                console.log(detailIndent + line)
                                            }
                                        }
                                    }
                                }
                            }

                            // Show connection files
                            if (isConnection) {
                                const connections = connectionEntities.get(entityName)!
                                if (!isConfig && !isRegistry && !isFact) {
                                    console.log(chalk.bold.white(entityName) + ' ' + chalk.magenta('[registry]') + schemaSuffix + validationSuffix)
                                } else {
                                    console.log(chalk.magenta('  [registry]'))
                                }
                                for (let i = 0; i < connections.length; i++) {
                                    const conn = connections[i]
                                    const connector = i === connections.length - 1 ? '└── ' : '├── '
                                    const indent = (isConfig || isRegistry || isFact) ? '    ' : '  '
                                    const validMark = conn.valid ? '' : chalk.red(' ✗')
                                    console.log(chalk.gray(indent + connector) + chalk.yellow(conn.relPath) + chalk.gray(` (${conn.name})`) + validMark)

                                    // Show full details for this specific file if --full flag is set
                                    if (showFull) {
                                        const schema = schemas.get(conn.schemaId)
                                        const detailIndent = indent + '    '

                                        if (schema) {
                                            // Connection data is wrapped in 'config' object, unwrap it for schema validation
                                            const dataToRender = conn.data.config || conn.data
                                            const rendered = SchemaConsoleRenderer.renderEntity(dataToRender, schema, {
                                                indent: detailIndent.length / 2,
                                                maxDepth: -1,
                                                showTypes: false
                                            })
                                            console.log(rendered)
                                        } else {
                                            const jsonLines = JSON.stringify(conn.data, null, 2).split('\n')
                                            for (const line of jsonLines) {
                                                console.log(chalk.gray(detailIndent + line))
                                            }
                                        }

                                        if (conn.errors.length > 0) {
                                            const errorLines = SchemaConsoleRenderer.renderErrors(conn.errors).split('\n')
                                            for (const line of errorLines) {
                                                console.log(detailIndent + line)
                                            }
                                        }
                                    }
                                }
                            }

                            // Show validation errors in detail (for compact mode)
                            if (!showFull) {
                                for (const instance of invalidInstances) {
                                    for (const err of instance.errors) {
                                        console.log(chalk.red(`    ${err.path}: ${err.message}`))
                                    }
                                }
                            }

                            // Show full entity details for config entities if --full flag is set
                            if (showFull && isConfig && !isFact && !isConnection) {
                                const configInstances = entityInstances.filter(e => e.filePath.endsWith('.yaml'))
                                for (const instance of configInstances) {
                                    const schema = schemas.get(instance.schemaId)
                                    const baseIndent = '    '

                                    if (schema) {
                                        const rendered = SchemaConsoleRenderer.renderEntity(instance.data, schema, {
                                            indent: baseIndent.length / 2 + 1,
                                            maxDepth: -1,
                                            showTypes: false
                                        })
                                        console.log(rendered)
                                    } else {
                                        const jsonLines = JSON.stringify(instance.data, null, 2).split('\n')
                                        for (const line of jsonLines) {
                                            console.log(chalk.gray(baseIndent + line))
                                        }
                                    }

                                    if (instance.errors.length > 0) {
                                        const errorLines = SchemaConsoleRenderer.renderErrors(instance.errors).split('\n')
                                        for (const line of errorLines) {
                                            console.log(baseIndent + line)
                                        }
                                    }
                                }
                            }
                        }

                        console.log('')
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
capsule['#'] = 't44/caps/WorkspaceModel'
