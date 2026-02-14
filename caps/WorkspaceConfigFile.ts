
import * as yaml from 'js-yaml'
import { readFile, writeFile, access } from 'fs/promises';
import { join, resolve, relative, dirname } from 'path'
import chalk from 'chalk'

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
            '#t44/structs/WorkspaceConfigFile': {
                as: '$ConfigFile'
            },
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
                        const schema = this.$ConfigFile?.schema?.schema
                        const capsuleName = this.$ConfigFile?.capsuleName
                        if (schema && capsuleName) {
                            const version = this.$ConfigFile?.schemaMinorVersion || '0'
                            await this.JsonSchema.registerSchema(capsuleName, schema, version)
                        }
                    }
                },
                loadConfig: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, rootConfigPath: string, workspaceRootDir: string): Promise<{ config: any, configTree: any }> {
                        return loadConfigWithExtends(rootConfigPath, workspaceRootDir)
                    }
                },
                _struct_readConfigFromFile: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, configPath: string): Promise<any> {
                        const absolutePath = resolve(configPath)
                        const content = await readFile(absolutePath, 'utf-8')
                        const parsed = yaml.load(content) as any || {}

                        // Already schema-wrapped — return config (strip $schema for internal use)
                        if (parsed && parsed.$schema) {
                            const config = { ...parsed }
                            delete config.$schema
                            if (ensureEntityTimestamps(config)) {
                                await this.$ConfigFile._struct_writeConfigToFile(configPath, config)
                            }
                            return config
                        }

                        // Raw config file — wrap with schema and save to upgrade it
                        const config = parsed
                        const schema = this.$ConfigFile.schema
                        const capsuleName = this.$ConfigFile.capsuleName

                        ensureEntityTimestamps(config)

                        if (schema?.wrapWithSchema) {
                            const schemaFilePath = schema.resolveSchemaFilePath?.(capsuleName)
                            const schemaRef = schemaFilePath ? relative(dirname(absolutePath), schemaFilePath) : undefined
                            const output = schema.wrapWithSchema(config, schemaRef)

                            const wrapped = yaml.dump(output, {
                                indent: 2,
                                lineWidth: -1,
                                noRefs: true,
                                sortKeys: false
                            })
                            await writeFile(absolutePath, wrapped)
                        }

                        return config
                    }
                },
                _struct_writeConfigToFile: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, configPath: string, config: any): Promise<void> {
                        const absolutePath = resolve(configPath)
                        const schemaName = 'WorkspaceConfigFile'
                        const schema = this.$ConfigFile.schema
                        const capsuleName = this.$ConfigFile.capsuleName

                        // Validate against schema (use capsuleName as that's the key in JsonSchemas.schemas)
                        const validationFeedback = await schema.validate(capsuleName, config)
                        if (validationFeedback.errors.length > 0) {
                            console.error(schema.formatValidationFeedback(validationFeedback, {
                                filePath: absolutePath,
                                schemaRef: `${capsuleName}#/$defs/${schemaName}`
                            }))
                            process.exit(1)
                        }

                        // Build schema-wrapped output
                        const schemaFilePath = schema.resolveSchemaFilePath?.(capsuleName)
                        const schemaRef = schemaFilePath ? relative(dirname(absolutePath), schemaFilePath) : undefined
                        const output = schema.wrapWithSchema(config, schemaRef)

                        // Write as YAML with schema wrapper
                        const content = yaml.dump(output, {
                            indent: 2,
                            lineWidth: -1,
                            noRefs: true,
                            sortKeys: false
                        })
                        await writeFile(absolutePath, content)
                    }
                },
                readConfigFile: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, configPath: string): Promise<any> {
                        return this.$ConfigFile._struct_readConfigFromFile(configPath)
                    }
                },
                writeConfigFile: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, configPath: string, config: any): Promise<void> {
                        return this.$ConfigFile._struct_writeConfigToFile(configPath, config)
                    }
                },
                setConfigValue: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, configPath: string, path: string[], value: any, options?: { ifAbsent?: boolean }): Promise<boolean> {
                        const config = await this.$ConfigFile._struct_readConfigFromFile(configPath)

                        const existingValue = getAtPath(config, path)

                        // If ifAbsent is set, only write if the key doesn't exist yet
                        if (options?.ifAbsent && existingValue !== undefined) {
                            return false
                        }

                        // Check if value at path is already identical — skip write if unchanged
                        if (deepEqual(existingValue, value)) {
                            return false
                        }

                        // Set value at path
                        setAtPath(config, path, value)

                        await this.$ConfigFile._struct_writeConfigToFile(configPath, config)
                        return true
                    }
                },
                setConfigValueForEntity: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, configPath: string, entity: { entityName: string, schema: any }, path: string[], value: any, options?: { ifAbsent?: boolean }): Promise<boolean> {
                        const config = await this.$ConfigFile._struct_readConfigFromFile(configPath)

                        const existingValue = getAtPath(config, path)

                        // If ifAbsent is set, only write if the key doesn't exist yet
                        if (options?.ifAbsent && existingValue !== undefined) {
                            return false
                        }

                        // Check if value at path is already identical — skip write if unchanged
                        if (deepEqual(existingValue, value)) {
                            return false
                        }

                        // Set value at path in memory
                        setAtPath(config, path, value)

                        // Validate entity config block against schema before writing
                        const configKey = '#' + entity.entityName
                        const entityConfig = config[configKey]
                        if (entityConfig && entity.schema?.validate && entity.schema?.schema) {
                            const feedback = await entity.schema.validate(entity.entityName, entityConfig)
                            if (feedback.errors.length > 0) {
                                const errorDetails = feedback.errors.map((e: any) => {
                                    if (e.validationErrors?.length) {
                                        return e.validationErrors.map((ve: any) =>
                                            `  ${ve.path || '/'}: ${ve.message}`
                                        ).join('\n')
                                    }
                                    return `  ${e.message}`
                                }).join('\n')

                                throw new Error(
                                    `Entity config validation failed for "${entity.entityName}":\n${errorDetails}\n` +
                                    `  Path: ${JSON.stringify(path)}\n` +
                                    `  Value: ${JSON.stringify(value)}`
                                )
                            }
                        }

                        await this.$ConfigFile._struct_writeConfigToFile(configPath, config)
                        return true
                    }
                },
                getConfigValue: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, configPath: string, path: string[]): Promise<any> {
                        const config = await this.$ConfigFile._struct_readConfigFromFile(configPath)
                        return getAtPath(config, path)
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
capsule['#'] = 't44/caps/WorkspaceConfigFile'

function resolveExtendPath(extendPath: string, configDir: string): string {
    if (extendPath.startsWith('.')) {
        return resolve(configDir, extendPath)
    } else {
        // For module paths, we need to resolve the package directory first
        // because require.resolve() only works for JS modules, not .yaml files
        // Split the path into package name and file path
        // Handle scoped packages like t44/workspace.yaml
        let packageName: string
        let filePath: string

        if (extendPath.startsWith('@')) {
            // Scoped package: @scope/package/file/path.yaml
            const parts = extendPath.split('/')
            packageName = `${parts[0]}/${parts[1]}` // @scope/package
            filePath = parts.slice(2).join('/') // file/path.yaml
        } else {
            // Regular package: package/file/path.yaml
            const parts = extendPath.split('/')
            packageName = parts[0]
            filePath = parts.slice(1).join('/')
        }

        // Walk up from configDir looking for node_modules/<packageName>
        const { existsSync } = require('fs')
        let searchDir = configDir
        let packageDir = ''
        while (searchDir !== dirname(searchDir)) {
            const candidate = join(searchDir, 'node_modules', packageName)
            if (existsSync(join(candidate, 'package.json'))) {
                packageDir = candidate
                break
            }
            searchDir = dirname(searchDir)
        }
        if (!packageDir) {
            throw new Error(`Cannot resolve package '${packageName}' from '${configDir}'. Ensure it is installed in node_modules.`)
        }

        // Resolve the file path within the package
        return resolve(packageDir, filePath)
    }
}

async function loadConfigWithExtends(configPath: string, workspaceRootDir: string): Promise<{ config: any, configTree: any, entitySources: Map<string, { path: string, line: number }[]> }> {
    const loadedConfigs: { path: string, config: any, rawContent: string }[] = []
    const mainConfigDir = join(resolve(configPath), '..')
    let configTree: any = null

    async function loadConfigRecursive(currentPath: string, referencedFrom?: string, chain: string[] = []): Promise<any> {
        const absolutePath = resolve(currentPath)

        // Check if this file is already in the current chain (circular reference)
        if (chain.includes(absolutePath)) {
            throw new Error(`Circular extends detected: ${absolutePath}\nChain: ${chain.join(' -> ')} -> ${absolutePath}`)
        }

        // Add to current chain
        const currentChain = [...chain, absolutePath]

        // Check if file exists before attempting to read
        try {
            await access(absolutePath)
        } catch (error) {
            const errorLines = [
                '',
                chalk.bold.red('✗ Configuration File Not Found'),
                '',
                chalk.gray('  Missing file:'),
                chalk.red(`    ${absolutePath}`),
                ''
            ]

            if (referencedFrom) {
                errorLines.push(
                    chalk.gray('  Referenced from:'),
                    chalk.yellow(`    ${referencedFrom}`),
                    ''
                )
            }

            if (currentChain.length > 0) {
                errorLines.push(
                    chalk.gray('  Configuration chain:'),
                    ...currentChain.map((path, idx) =>
                        chalk.cyan(`    ${idx + 1}. ${path}`)
                    ),
                    chalk.red(`    ${currentChain.length + 1}. ${absolutePath} `) + chalk.bold.red('← MISSING'),
                    ''
                )
            }

            // Determine which file to tell user to fix
            const fileToFix = referencedFrom || (currentChain.length > 0 ? currentChain[currentChain.length - 1] : 'your workspace.yaml')

            errorLines.push(
                chalk.bold.white('  Action Required:'),
                chalk.white('    • Create the missing file, or'),
                chalk.white('    • Fix the \'extends\' path in:'),
                chalk.yellow(`      ${fileToFix}`),
                ''
            )

            const err = new Error(errorLines.join('\n'))
            err.stack = '' // Remove stack trace
            throw err
        }

        let rawContent = await readFile(absolutePath, 'utf-8')
        const configDir = join(absolutePath, '..')

        // Check if file is already schema-wrapped or raw
        const rawParsed = yaml.load(rawContent) as any
        let isWrapped = !!(rawParsed && rawParsed.$schema)
        let needsRewrite = false

        // Ensure createdAt/updatedAt timestamps on all entity configs in this file
        const rawConfig = rawParsed
        if (rawConfig && typeof rawConfig === 'object' && ensureEntityTimestamps(rawConfig)) {
            needsRewrite = true
        }

        // Migrate old schema envelope format to new format (relative $schema, no $defs)
        if (isWrapped) {
            const expectedSchemaRef = resolveSchemaRef(absolutePath, 't44/structs/WorkspaceConfigFile', workspaceRootDir)
            if (rawParsed.$schema !== expectedSchemaRef) {
                rawParsed.$schema = expectedSchemaRef
                needsRewrite = true
            }
            if (rawParsed.$defs) {
                delete rawParsed.$defs
                needsRewrite = true
            }
        }

        // Migrate old WorkspaceConfigFile wrapper format to flat format
        if (isWrapped && rawParsed.WorkspaceConfigFile) {
            const inner = rawParsed.WorkspaceConfigFile
            const schemaRef = resolveSchemaRef(absolutePath, 't44/structs/WorkspaceConfigFile', workspaceRootDir)
            const output: Record<string, any> = {}
            if (schemaRef) {
                output.$schema = schemaRef
            }
            Object.assign(output, inner)

            const wrapped = yaml.dump(output, {
                indent: 2,
                lineWidth: -1,
                noRefs: true,
                sortKeys: false
            })
            await writeFile(absolutePath, wrapped)
            rawContent = wrapped
            needsRewrite = false
        }

        // Auto-wrap raw config files with schema envelope
        if (!isWrapped && rawParsed && typeof rawParsed === 'object') {
            const schemaRef = resolveSchemaRef(absolutePath, 't44/structs/WorkspaceConfigFile', workspaceRootDir)
            const output: Record<string, any> = {}
            if (schemaRef) {
                output.$schema = schemaRef
            }
            Object.assign(output, rawParsed)

            const wrapped = yaml.dump(output, {
                indent: 2,
                lineWidth: -1,
                noRefs: true,
                sortKeys: false
            })
            await writeFile(absolutePath, wrapped)
            needsRewrite = false
            isWrapped = true
        }

        // Write back timestamps to already-wrapped files that didn't need schema wrapping
        if (needsRewrite && isWrapped) {
            const rewritten = yaml.dump(rawParsed, {
                indent: 2,
                lineWidth: -1,
                noRefs: true,
                sortKeys: false
            })
            await writeFile(absolutePath, rewritten)
            rawContent = rewritten
        }

        // Apply variable substitutions for runtime use
        let configContent = rawContent
        configContent = configContent.replaceAll('${__dirname}', configDir)

        const resolvePattern = /resolve\(['"]([^'"]+)['"]\)/g
        const matches = Array.from(configContent.matchAll(resolvePattern))
        for (const m of matches) {
            const fullMatch = m[0]
            const pathArg = m[1]
            const resolvedPath = resolve(pathArg)
            configContent = configContent.replace(fullMatch, resolvedPath)
        }

        let config = yaml.load(configContent) as any

        // Strip $schema for processing
        if (config && config.$schema) {
            delete config.$schema
        }
        // Strip $id if present
        if (config && config.$id) {
            delete config.$id
        }
        // Strip $defs if present (legacy)
        if (config && config.$defs) {
            delete config.$defs
        }

        // Check for deprecated top-level deployments property
        if (config.deployments) {
            throw new Error(`Top-level 'deployments' property found in '${absolutePath}'. This format is deprecated. Please move your deployments configuration under the '#t44/structs/ProjectDeploymentConfig' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level cli property
        if (config.cli) {
            throw new Error(`Top-level 'cli' property found in '${absolutePath}'. This format is deprecated. Please move your cli configuration under the '#t44/structs/WorkspaceCliConfig' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level shell property
        if (config.shell) {
            throw new Error(`Top-level 'shell' property found in '${absolutePath}'. This format is deprecated. Please move your shell configuration under the '#t44/structs/WorkspaceShellConfig' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level env property
        if (config.env) {
            throw new Error(`Top-level 'env' property found in '${absolutePath}'. This format is deprecated. Please move your env configuration under the '#t44/structs/WorkspaceShellConfig' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level javascript property
        if (config.javascript) {
            throw new Error(`Top-level 'javascript' property found in '${absolutePath}'. This format is deprecated. Please move your javascript configuration under the '#t44/structs/WorkspaceCliConfig' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level workspace property
        if (config.workspace) {
            throw new Error(`Top-level 'workspace' property found in '${absolutePath}'. This format is deprecated. Please move your workspace configuration under the '#t44/structs/WorkspaceConfig' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level repositories property
        if (config.repositories) {
            throw new Error(`Top-level 'repositories' property found in '${absolutePath}'. This format is deprecated. Please move your repositories configuration under the '#t44/structs/WorkspacePublishingConfig' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level mappings property
        if (config.mappings) {
            throw new Error(`Top-level 'mappings' property found in '${absolutePath}'. This format is deprecated. Please move your mappings configuration under the '#t44/structs/WorkspaceMappingsConfig' key. See documentation for the new format.`)
        }

        // Validate that only 'extends' is allowed as a top-level property, all others must start with '#'
        for (const key of Object.keys(config)) {
            if (key !== 'extends' && !key.startsWith('#')) {
                throw new Error(`Invalid top-level property '${key}' found in '${absolutePath}'. Only 'extends' is allowed as a top-level property. All other configuration must be nested under a struct key starting with '#'.`)
            }
        }

        // Build tree node
        const treeNode: any = {
            path: absolutePath,
            extends: []
        }

        // Process extends first (parent configs)
        if (config.extends && Array.isArray(config.extends)) {
            for (const extendPath of config.extends) {
                // Always use configDir for resolution - it's the directory of the file containing the extends
                const resolvedExtendPath = resolveExtendPath(extendPath, configDir)
                const childNode = await loadConfigRecursive(resolvedExtendPath, absolutePath, currentChain)
                // Store the original extends value for display
                childNode.extendsValue = extendPath
                treeNode.extends.push(childNode)
            }
        }

        // Remove extends key and push current config (child overrides parent)
        delete config.extends
        loadedConfigs.push({ path: absolutePath, config, rawContent: configContent })

        return treeNode
    }

    configTree = await loadConfigRecursive(configPath)

    // Build entitySources: track which files define each entity key with line numbers
    const entitySources = new Map<string, { path: string, line: number }[]>()
    for (const { path: filePath, config: fileConfig, rawContent: fileRawContent } of loadedConfigs) {
        if (fileConfig && typeof fileConfig === 'object') {
            // Pre-compute line numbers for entity keys by scanning raw content
            const lines = fileRawContent.split('\n')
            const keyLineMap = new Map<string, number>()
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trimStart()
                if (trimmed.startsWith("'#") || trimmed.startsWith('"#')) {
                    // Quoted key like '#@t44.sh/...':  or "#@t44.sh/...":
                    const match = trimmed.match(/^['"]([^'"]+)['"]\s*:/)
                    if (match) keyLineMap.set(match[1], i + 1)
                }
            }

            for (const key of Object.keys(fileConfig)) {
                if (key.startsWith('#')) {
                    if (!entitySources.has(key)) {
                        entitySources.set(key, [])
                    }
                    entitySources.get(key)!.push({ path: filePath, line: keyLineMap.get(key) || 1 })
                }
            }
        }
    }

    // Reverse each entity's sources so root config file comes first
    for (const [, sources] of entitySources) {
        sources.reverse()
    }

    // Merge configs: parent configs first, then child configs override
    let mergedConfig = {} as any
    for (const { config } of loadedConfigs) {
        mergedConfig = deepMerge(mergedConfig, config)
    }

    // Ensure workspace directory paths are set correctly based on main config location
    // This overrides any inherited values from parent configs
    const expectedWorkspaceDir = resolve(mainConfigDir, '..')

    // Set javascript.api.workspaceDir in the CLI config struct
    const cliConfigKey = '#t44/structs/WorkspaceCliConfig'
    if (!mergedConfig[cliConfigKey]) mergedConfig[cliConfigKey] = {}
    if (!mergedConfig[cliConfigKey].javascript) mergedConfig[cliConfigKey].javascript = {}
    if (!mergedConfig[cliConfigKey].javascript.api) mergedConfig[cliConfigKey].javascript.api = {}
    mergedConfig[cliConfigKey].javascript.api.workspaceDir = expectedWorkspaceDir

    // Set F_WORKSPACE_DIR in the shell config struct
    const shellConfigKey = '#t44/structs/WorkspaceShellConfig'
    if (!mergedConfig[shellConfigKey]) mergedConfig[shellConfigKey] = {}
    if (!mergedConfig[shellConfigKey].env) mergedConfig[shellConfigKey].env = {}
    if (!mergedConfig[shellConfigKey].env.force) mergedConfig[shellConfigKey].env.force = {}
    mergedConfig[shellConfigKey].env.force.F_WORKSPACE_DIR = expectedWorkspaceDir

    // Set workspaceRootDir and workspaceConfigFilepath in the workspace config struct
    const workspaceConfigStructKey = '#t44/structs/WorkspaceConfig'
    const expectedConfigFilepath = '.workspace/workspace.yaml'
    if (!mergedConfig[workspaceConfigStructKey]) mergedConfig[workspaceConfigStructKey] = {}

    // Validate or set workspaceRootDir
    if (mergedConfig[workspaceConfigStructKey].workspaceRootDir) {
        if (resolve(mergedConfig[workspaceConfigStructKey].workspaceRootDir) !== expectedWorkspaceDir) {
            throw new Error(`workspaceRootDir '${mergedConfig[workspaceConfigStructKey].workspaceRootDir}' does not match expected '${expectedWorkspaceDir}'`)
        }
    } else {
        mergedConfig[workspaceConfigStructKey].workspaceRootDir = expectedWorkspaceDir
    }

    // Validate or set workspaceConfigFilepath
    if (mergedConfig[workspaceConfigStructKey].workspaceConfigFilepath) {
        if (mergedConfig[workspaceConfigStructKey].workspaceConfigFilepath !== expectedConfigFilepath) {
            throw new Error(`workspaceConfigFilepath '${mergedConfig[workspaceConfigStructKey].workspaceConfigFilepath}' does not match expected '${expectedConfigFilepath}'`)
        }
    } else {
        mergedConfig[workspaceConfigStructKey].workspaceConfigFilepath = expectedConfigFilepath
    }

    mergedConfig = await processJitExpressions(mergedConfig, configPath)

    // Write metadata cache files for each loaded config file with entity line numbers
    await writeConfigMetadataCache(loadedConfigs, workspaceRootDir)

    return { config: mergedConfig, configTree, entitySources }
}

async function writeConfigMetadataCache(
    loadedConfigs: Array<{ path: string, config: any, rawContent: string }>,
    workspaceRootDir: string
): Promise<void> {
    const { mkdir, writeFile } = await import('fs/promises')
    const metaCacheDir = join(workspaceRootDir, '.~o', 'workspace.foundation', '@t44.sh~t44~caps~WorkspaceEntityFact', '@t44.sh~t44~structs~WorkspaceConfigFileMeta')

    await mkdir(metaCacheDir, { recursive: true })

    for (const { path: filePath, config: fileConfig, rawContent: fileRawContent } of loadedConfigs) {
        if (!fileConfig || typeof fileConfig !== 'object') continue

        const relPath = relative(workspaceRootDir, filePath)
        const cacheFileName = relPath.replace(/\//g, '~').replace(/\\/g, '~') + '.json'

        // Extract entity line numbers
        const lines = fileRawContent.split('\n')
        const entities: Record<string, { line: number, data: any }> = {}

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trimStart()
            if (trimmed.startsWith("'#") || trimmed.startsWith('"#')) {
                const match = trimmed.match(/^['"]([^'"]+)['"]\s*:/)
                if (match) {
                    const entityKey = match[1]
                    if (fileConfig[entityKey]) {
                        entities[entityKey] = {
                            line: i + 1,
                            data: fileConfig[entityKey]
                        }
                    }
                }
            }
        }

        const metadata = {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            $id: 't44/structs/WorkspaceConfigFileMeta.v0',
            filePath,
            relPath,
            entities,
            updatedAt: new Date().toISOString()
        }

        await writeFile(join(metaCacheDir, cacheFileName), JSON.stringify(metadata, null, 4))
    }
}

function jitJoin(...parts: string[]): string {
    return parts.join('')
}

async function jitPick(configDir: string, filepath: string, path: string): Promise<string> {
    const resolvedPath = resolve(configDir, filepath)
    const content = await readFile(resolvedPath, 'utf-8')
    const data = JSON.parse(content)

    const parts = path.split('.')
    let result: any = data

    for (const part of parts) {
        const arrayMatch = part.match(/^(.+)\[(\d+)\]$/)
        if (arrayMatch) {
            const [, key, index] = arrayMatch
            result = result[key][parseInt(index)]
        } else {
            result = result[part]
        }

        if (result === undefined) {
            throw new Error(`Path '${path}' not found in '${filepath}'`)
        }
    }

    return result
}

async function processJitExpressions(config: any, configPath: string): Promise<any> {
    const configDir = join(configPath, '..')

    async function processValue(value: any): Promise<any> {
        if (typeof value === 'string' && value.startsWith('jit(')) {
            const expression = value.slice(4, -1)
            return createJitFunction(expression, configDir)
        }
        if (Array.isArray(value)) {
            return Promise.all(value.map(processValue))
        }
        if (typeof value === 'object' && value !== null) {
            const result: any = {}
            for (const [k, v] of Object.entries(value)) {
                result[k] = await processValue(v)
            }
            return result
        }
        return value
    }

    return processValue(config)
}

function createJitFunction(expression: string, configDir: string): () => Promise<string> {
    return async () => {
        const join = jitJoin
        const pick = async (filepath: string, path: string) => jitPick(configDir, filepath, path)

        // Replace pick() calls with await pick() to ensure promises are resolved
        const awaitedExpression = expression.replace(/pick\(/g, 'await pick(')

        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor
        const fn = new AsyncFunction('join', 'pick', `return ${awaitedExpression}`)
        return await fn(join, pick)
    }
}

function getAtPath(obj: any, path: string[]): any {
    let current = obj
    for (const key of path) {
        if (current == null || typeof current !== 'object') return undefined
        current = current[key]
    }
    return current
}

function deepEqual(a: any, b: any): boolean {
    if (a === b) return true
    if (a == null || b == null) return false
    if (typeof a !== typeof b) return false
    if (typeof a !== 'object') return false
    if (Array.isArray(a) !== Array.isArray(b)) return false
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
        if (!deepEqual(a[key], b[key])) return false
    }
    return true
}

function setAtPath(obj: any, path: string[], value: any): void {
    let current = obj
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i]
        if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
            current[key] = {}
        }
        current = current[key]
    }
    current[path[path.length - 1]] = value
}

function resolveSchemaRef(dataFilePath: string, capsuleName: string, workspaceRootDir: string): string | undefined {
    const jsonSchemaDir = join(
        workspaceRootDir,
        '.~o',
        'workspace.foundation',
        '@t44.sh~t44~caps~JsonSchemas'
    )
    const schemaFilename = capsuleName.replace(/\//g, '~') + '.json'
    const schemaFilePath = join(jsonSchemaDir, schemaFilename)
    return relative(dirname(dataFilePath), schemaFilePath)
}

function ensureEntityTimestamps(config: any): boolean {
    if (!config || typeof config !== 'object') return false
    let changed = false
    const now = new Date().toISOString()
    for (const key of Object.keys(config)) {
        if (!key.startsWith('#')) continue
        const entity = config[key]
        if (!entity || typeof entity !== 'object') continue
        if (!entity.createdAt && !entity.updatedAt) {
            entity.createdAt = now
            entity.updatedAt = now
            changed = true
        } else if (!entity.createdAt) {
            entity.createdAt = entity.updatedAt
            changed = true
        } else if (!entity.updatedAt) {
            entity.updatedAt = entity.createdAt
            changed = true
        }
    }
    return changed
}

function deepMerge(target: any, source: any): any {
    if (Array.isArray(source)) {
        return source
    }

    if (typeof source !== 'object' || source === null) {
        return source
    }

    const result = { ...target }

    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                result[key] = deepMerge(result[key] || {}, source[key])
            } else {
                result[key] = source[key]
            }
        }
    }

    return result
}
