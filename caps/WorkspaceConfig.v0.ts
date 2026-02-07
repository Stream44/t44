
import * as yaml from 'js-yaml'
import { readFile, writeFile, access } from 'fs/promises';
import { join, resolve } from 'path'
import { createRequire } from 'module'
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
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#@stream44.studio/t44/structs/WorkspaceConfig.v0': {
                as: '$WorkspaceConfig'
            },
            '#': {
                workspaceRootDir: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined
                },
                workspaceConfigFilepath: {
                    type: CapsulePropertyTypes.Literal,
                    value: '.workspace/workspace.yaml'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt.v0'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/HomeRegistry.v0'
                },
                config: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<object> {

                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath);

                        const { config } = await loadConfigWithExtends(configPath, this.workspaceRootDir)

                        // Get struct configs from the loaded config (avoid circular dependency by not calling struct.config)
                        const workspaceConfigStructKey = '#@stream44.studio/t44/structs/WorkspaceConfig.v0'
                        const cliConfigStructKey = '#@stream44.studio/t44/structs/WorkspaceCliConfig.v0'
                        const workspaceConfigStruct = config[workspaceConfigStructKey] || {}
                        const cliConfigStruct = config[cliConfigStructKey] || {}

                        // Validate javascript.api.workspaceDir from CLI config struct
                        if (resolve(cliConfigStruct?.javascript?.api?.workspaceDir) !== this.workspaceRootDir) {
                            throw new Error(`javascript.api.workspaceDir '${cliConfigStruct?.javascript?.api?.workspaceDir}' in '${configPath}' does not match expected this.workspaceRootDir '${this.workspaceRootDir}'!`)
                        }

                        // Check rootDir - validate if set, set if not
                        if (workspaceConfigStruct.rootDir) {
                            if (workspaceConfigStruct.rootDir !== this.workspaceRootDir) {
                                throw new Error(`rootDir '${workspaceConfigStruct.rootDir}' does not match expected '${this.workspaceRootDir}'!`)
                            }
                        } else {
                            await this.$WorkspaceConfig.setConfigValue(['rootDir'], this.workspaceRootDir)
                        }

                        // Check rootConfigFilepath - validate if set, set if not
                        if (workspaceConfigStruct.rootConfigFilepath) {
                            if (workspaceConfigStruct.rootConfigFilepath !== this.workspaceConfigFilepath) {
                                throw new Error(`rootConfigFilepath '${workspaceConfigStruct.rootConfigFilepath}' does not match expected '${this.workspaceConfigFilepath}'!`)
                            }
                        } else {
                            await this.$WorkspaceConfig.setConfigValue(['rootConfigFilepath'], this.workspaceConfigFilepath)
                        }

                        // Check workspace name - prompt if not set
                        if (!workspaceConfigStruct.name) {
                            const { basename } = await import('path')

                            let workspaceName: string | undefined

                            while (!workspaceName) {
                                const candidateName = await this.WorkspacePrompt.setupPrompt({
                                    title: '🏢 Workspace Name Setup',
                                    description: 'A workspace holds some or all projects registered in a Project Rack.',
                                    message: 'Enter a name for this workspace:',
                                    defaultValue: basename(this.workspaceRootDir),
                                    validate: (input: string) => {
                                        if (!input || input.trim().length === 0) {
                                            return 'Workspace name cannot be empty'
                                        }
                                        if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
                                            return 'Workspace name can only contain letters, numbers, underscores, and hyphens'
                                        }
                                        return true
                                    },
                                    configPath: [workspaceConfigStructKey, 'name'],
                                    onSuccess: async () => {
                                        // Don't write to config yet — we need to validate first
                                    }
                                })

                                // Check if a workspace with this name already exists in the registry
                                const existingData = await this.HomeRegistry.getWorkspace(candidateName)

                                if (existingData) {
                                    if (existingData.workspaceRootDir === this.workspaceRootDir) {
                                        // Same directory — adopt existing identity
                                        const chalk = (await import('chalk')).default
                                        console.log(chalk.green(`\n   ✓ Found existing workspace identity for "${candidateName}" in this directory.`))
                                        console.log(chalk.green(`     Adopting existing identity.\n`))

                                        await this.$WorkspaceConfig.setConfigValue(['name'], candidateName)
                                        workspaceConfigStruct.name = candidateName

                                        // Adopt the existing identifier
                                        await this.$WorkspaceConfig.setConfigValue(['identifier'], existingData.did)
                                        workspaceConfigStruct.identifier = existingData.did

                                        console.log(chalk.green(`   ✓ DID: ${existingData.did}\n`))
                                        workspaceName = candidateName
                                    } else {
                                        // Different directory — warn and prompt
                                        const chalk = (await import('chalk')).default
                                        const registryPath = await this.HomeRegistry.getWorkspacePath(candidateName)
                                        console.log(chalk.yellow(`\n   ⚠  A workspace named "${candidateName}" already exists at:`))
                                        console.log(chalk.white(`        ${registryPath}`))
                                        console.log('')
                                        console.log(chalk.yellow(`      It is currently connected to:`))
                                        console.log(chalk.white(`        ${existingData.workspaceRootDir}`))
                                        console.log('')
                                        console.log(chalk.yellow(`      You are trying to set up a workspace with the same name in:`))
                                        console.log(chalk.white(`        ${this.workspaceRootDir}\n`))
                                        console.log(chalk.yellow(`      A workspace can only be connected to one directory.`))
                                        console.log('')

                                        const confirmed = await this.WorkspacePrompt.confirm({
                                            message: `Disconnect "${candidateName}" from "${existingData.workspaceRootDir}" and connect it to "${this.workspaceRootDir}" instead?`,
                                            defaultValue: false
                                        })

                                        if (confirmed) {
                                            // Update registry with new rootDir
                                            existingData.workspaceRootDir = this.workspaceRootDir
                                            await this.HomeRegistry.setWorkspace(candidateName, existingData)

                                            await this.$WorkspaceConfig.setConfigValue(['name'], candidateName)
                                            workspaceConfigStruct.name = candidateName

                                            // Adopt the existing identifier
                                            await this.$WorkspaceConfig.setConfigValue(['identifier'], existingData.did)
                                            workspaceConfigStruct.identifier = existingData.did

                                            console.log(chalk.green(`\n   ✓ Workspace "${candidateName}" reconnected to this directory.`))
                                            console.log(chalk.green(`   ✓ DID: ${existingData.did}\n`))
                                            workspaceName = candidateName
                                        } else {
                                            console.log(chalk.gray(`\n   Please choose a different workspace name.\n`))
                                            // Loop again to re-prompt
                                        }
                                    }
                                } else {
                                    // Name is available — commit it
                                    await this.$WorkspaceConfig.setConfigValue(['name'], candidateName)
                                    workspaceConfigStruct.name = candidateName
                                    workspaceName = candidateName
                                }
                            }
                        }

                        // Check workspace identifier - generate if not set
                        if (!workspaceConfigStruct.identifier) {
                            const chalk = (await import('chalk')).default

                            const workspaceName = workspaceConfigStruct.name

                            console.log(chalk.cyan('\n🔑 Workspace Identifier Setup\n'))
                            console.log(chalk.gray('   Generating unique workspace identifier...\n'))

                            // Generate Ed25519 key pair for workspace identifier
                            const { generateKeypair } = await import('../lib/ucan.js')
                            const { did, privateKey } = await generateKeypair()

                            // Store in registry
                            const identifierData = {
                                did,
                                privateKey,
                                createdAt: new Date().toISOString(),
                                workspaceRootDir: this.workspaceRootDir,
                            }

                            const identifierPath = await this.HomeRegistry.setWorkspace(workspaceName, identifierData)

                            // Update config with workspace identifier (DID)
                            await this.$WorkspaceConfig.setConfigValue(['identifier'], did)

                            console.log(chalk.green(`   ✓ Workspace identifier generated and saved to:`))
                            console.log(chalk.green(`     ${identifierPath}`))
                            console.log(chalk.green(`   ✓ DID: ${did}\n`))
                        }

                        return config
                    }
                },
                configTree: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<any> {
                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath);
                        const { configTree } = await loadConfigWithExtends(configPath, this.workspaceRootDir)
                        return configTree
                    }
                },
                setConfigValue: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, path: string[], value: any): Promise<void> {
                        const configPath = join(this.workspaceRootDir, this.workspaceConfigFilepath)
                        const configContent = await readFile(configPath, 'utf-8')
                        const config = yaml.load(configContent) as any || {}

                        // Set value at path using lodash-style set
                        setAtPath(config, path, value)

                        // Write back to file
                        const updatedContent = yaml.dump(config, {
                            indent: 2,
                            lineWidth: -1,
                            noRefs: true,
                            sortKeys: false
                        })
                        await writeFile(configPath, updatedContent)
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
capsule['#'] = '@stream44.studio/t44/caps/WorkspaceConfig.v0'

function resolveExtendPath(extendPath: string, configDir: string, workspaceRequire: NodeRequire): string {
    if (extendPath.startsWith('.')) {
        return resolve(configDir, extendPath)
    } else {
        // For module paths, we need to resolve the package directory first
        // because require.resolve() only works for JS modules, not .yaml files
        // Split the path into package name and file path
        // Handle scoped packages like @stream44.studio/t44/workspace.yaml
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

        // Resolve the package's package.json to get its directory
        const packageJsonPath = workspaceRequire.resolve(`${packageName}/package.json`)
        const packageDir = join(packageJsonPath, '..')

        // Resolve the file path within the package
        return resolve(packageDir, filePath)
    }
}

async function loadConfigWithExtends(configPath: string, workspaceRootDir: string): Promise<{ config: any, configTree: any }> {
    const loadedConfigs: any[] = []
    const mainConfigDir = join(resolve(configPath), '..')
    let configTree: any = null

    // Create a require function relative to workspace root for module resolution
    const workspaceRequire = createRequire(join(workspaceRootDir, 'package.json'))

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

        let configContent = await readFile(absolutePath, 'utf-8')
        const configDir = join(absolutePath, '..')

        // Replace ${__dirname} with the directory of the current config file
        configContent = configContent.replaceAll('${__dirname}', configDir)

        // Replace all resolve('...') patterns with resolved paths
        const resolvePattern = /resolve\(['"]([^'"]+)['"]\)/g
        const matches = Array.from(configContent.matchAll(resolvePattern))
        for (const m of matches) {
            const fullMatch = m[0]
            const pathArg = m[1]
            const resolvedPath = resolve(pathArg)
            configContent = configContent.replace(fullMatch, resolvedPath)
        }

        const config = yaml.load(configContent) as any

        // Check for deprecated top-level deployments property
        if (config.deployments) {
            throw new Error(`Top-level 'deployments' property found in '${absolutePath}'. This format is deprecated. Please move your deployments configuration under the '#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level cli property
        if (config.cli) {
            throw new Error(`Top-level 'cli' property found in '${absolutePath}'. This format is deprecated. Please move your cli configuration under the '#@stream44.studio/t44/structs/WorkspaceCliConfig.v0' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level shell property
        if (config.shell) {
            throw new Error(`Top-level 'shell' property found in '${absolutePath}'. This format is deprecated. Please move your shell configuration under the '#@stream44.studio/t44/structs/WorkspaceShellConfig.v0' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level env property
        if (config.env) {
            throw new Error(`Top-level 'env' property found in '${absolutePath}'. This format is deprecated. Please move your env configuration under the '#@stream44.studio/t44/structs/WorkspaceShellConfig.v0' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level javascript property
        if (config.javascript) {
            throw new Error(`Top-level 'javascript' property found in '${absolutePath}'. This format is deprecated. Please move your javascript configuration under the '#@stream44.studio/t44/structs/WorkspaceCliConfig.v0' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level workspace property
        if (config.workspace) {
            throw new Error(`Top-level 'workspace' property found in '${absolutePath}'. This format is deprecated. Please move your workspace configuration under the '#@stream44.studio/t44/structs/WorkspaceConfig.v0' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level repositories property
        if (config.repositories) {
            throw new Error(`Top-level 'repositories' property found in '${absolutePath}'. This format is deprecated. Please move your repositories configuration under the '#@stream44.studio/t44/structs/WorkspaceRepositories.v0' key. See documentation for the new format.`)
        }

        // Check for deprecated top-level mappings property
        if (config.mappings) {
            throw new Error(`Top-level 'mappings' property found in '${absolutePath}'. This format is deprecated. Please move your mappings configuration under the '#@stream44.studio/t44/structs/WorkspaceMappings.v0' key. See documentation for the new format.`)
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
                const resolvedExtendPath = resolveExtendPath(extendPath, configDir, workspaceRequire)
                const childNode = await loadConfigRecursive(resolvedExtendPath, absolutePath, currentChain)
                // Store the original extends value for display
                childNode.extendsValue = extendPath
                treeNode.extends.push(childNode)
            }
        }

        // Remove extends key and push current config (child overrides parent)
        delete config.extends
        loadedConfigs.push(config)

        return treeNode
    }

    configTree = await loadConfigRecursive(configPath)

    // Merge configs: parent configs first, then child configs override
    let mergedConfig = {} as any
    for (const config of loadedConfigs) {
        mergedConfig = deepMerge(mergedConfig, config)
    }

    // Ensure workspace directory paths are set correctly based on main config location
    // This overrides any inherited values from parent configs
    const expectedWorkspaceDir = resolve(mainConfigDir, '..')

    // Set javascript.api.workspaceDir in the CLI config struct
    const cliConfigKey = '#@stream44.studio/t44/structs/WorkspaceCliConfig.v0'
    if (!mergedConfig[cliConfigKey]) mergedConfig[cliConfigKey] = {}
    if (!mergedConfig[cliConfigKey].javascript) mergedConfig[cliConfigKey].javascript = {}
    if (!mergedConfig[cliConfigKey].javascript.api) mergedConfig[cliConfigKey].javascript.api = {}
    mergedConfig[cliConfigKey].javascript.api.workspaceDir = expectedWorkspaceDir

    // Set F_WORKSPACE_DIR in the shell config struct
    const shellConfigKey = '#@stream44.studio/t44/structs/WorkspaceShellConfig.v0'
    if (!mergedConfig[shellConfigKey]) mergedConfig[shellConfigKey] = {}
    if (!mergedConfig[shellConfigKey].env) mergedConfig[shellConfigKey].env = {}
    if (!mergedConfig[shellConfigKey].env.force) mergedConfig[shellConfigKey].env.force = {}
    mergedConfig[shellConfigKey].env.force.F_WORKSPACE_DIR = expectedWorkspaceDir

    // Set workspaceRootDir and workspaceConfigFilepath in the workspace config struct
    const workspaceConfigStructKey = '#@stream44.studio/t44/structs/WorkspaceConfig.v0'
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

    return { config: mergedConfig, configTree }
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

