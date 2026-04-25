
import { Command } from 'commander'
import { $ } from 'bun'

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
            '#@stream44.studio/t44/structs/WorkspaceCliConfig': {
                as: '$config'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceConfig'
                },
                WorkspaceKey: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceKey'
                },
                ProjectRack: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectRack'
                },
                WorkspaceShell: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceShell'
                },
                ProjectDeployment: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectDeployment'
                },
                ProjectPublishing: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectPublishing'
                },
                ProjectPulling: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectPulling'
                },
                ProjectDevelopment: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectDevelopment'
                },
                ProjectTesting: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTesting'
                },
                WorkspaceInit: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceInit'
                },
                WorkspaceInfo: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceInfo'
                },
                WorkspaceModel: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceModel'
                },
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspacePrompt'
                },
                HomeRegistry: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/HomeRegistry'
                },
                RootKey: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/RootKey'
                },
                SigningKey: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/SigningKey'
                },
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceProjects'
                },
                ProjectCatalogs: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectCatalogs'
                },
                cliOptions: {
                    type: CapsulePropertyTypes.Literal,
                    value: { yes: false }
                },
                jsApi: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<object> {

                        const config = await this.WorkspaceConfig.config as any

                        const api: Record<string, any> = {}
                        for (const propertyName in config?.javascript?.api) {
                            api[propertyName] = config.javascript.api[propertyName]
                        }
                        return api
                    }
                },
                cliCommands: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<object> {

                        const cliConfig = await this.$config.config
                        const self = this

                        const commands: Record<string, (commandArgs?: any) => Promise<void>> = {}
                        for (const commandName in cliConfig?.cli?.commands) {
                            const commandConfig = cliConfig.cli.commands[commandName]

                            commands[commandName] = async function (commandArgs?: any) {

                                const { cmd, capsule } = commandConfig

                                if (capsule) {
                                    // TODO: Dynamically load capsule
                                    if (capsule === '@stream44.studio/t44/caps/ProjectDeployment') {
                                        await self.ProjectDeployment.run({ args: commandArgs })
                                    } else if (capsule === '@stream44.studio/t44/caps/ProjectPublishing') {
                                        await self.ProjectPublishing.run({ args: commandArgs })
                                    } else if (capsule === '@stream44.studio/t44/caps/ProjectPulling') {
                                        await self.ProjectPulling.run({ args: commandArgs })
                                    } else if (capsule === '@stream44.studio/t44/caps/WorkspaceShell') {
                                        await self.WorkspaceShell.run({ args: commandArgs })
                                    } else if (capsule === '@stream44.studio/t44/caps/ProjectDevelopment') {
                                        await self.ProjectDevelopment.run({ args: commandArgs })
                                    } else if (capsule === '@stream44.studio/t44/caps/ProjectTesting') {
                                        await self.ProjectTesting.run({ args: commandArgs })
                                    } else if (capsule === '@stream44.studio/t44/caps/WorkspaceInit') {
                                        await self.WorkspaceInit.run({ args: commandArgs })
                                    } else if (capsule === '@stream44.studio/t44/caps/WorkspaceInfo') {
                                        await self.WorkspaceInfo.run({ args: commandArgs })
                                    } else if (capsule === '@stream44.studio/t44/caps/WorkspaceModel') {
                                        const full = commandArgs?.full || false
                                        const entitySelector = commandArgs?.entitySelector
                                        await self.WorkspaceModel.run({ full, entitySelector })
                                    } else {
                                        throw new Error(`Unsupported capsule '${capsule}'!`)
                                    }
                                } else if (cmd) {
                                    await $`sh -c ${cmd}`.cwd(self.WorkspaceConfig.workspaceRootDir)
                                }
                            }
                        }
                        return commands
                    }
                },
                validateIdentities: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<boolean> {
                        const chalk = (await import('chalk')).default

                        const fullConfig = await this.WorkspaceConfig.config
                        const wsConfigStructKey = '#@stream44.studio/t44/structs/WorkspaceConfig'
                        const keyConfigStructKey = '#@stream44.studio/t44/structs/WorkspaceKeyConfig'
                        const rackConfigStructKey = '#@stream44.studio/t44/structs/ProjectRackConfig'
                        const homeRegistryConfigStructKey = '#@stream44.studio/t44/structs/HomeRegistryConfig'

                        const ws = fullConfig?.[wsConfigStructKey]
                        const keyConfig = fullConfig?.[keyConfigStructKey]
                        const rackConfig = fullConfig?.[rackConfigStructKey]
                        const homeRegistryConfig = fullConfig?.[homeRegistryConfigStructKey]

                        if (!ws) return true

                        // --- Home Registry identity ---
                        if (homeRegistryConfig?.rootDir) {
                            const registryData = await this.HomeRegistry.getRegistry()
                            const registryPath = await this.HomeRegistry.getRegistryPath()

                            if (registryData) {
                                if (homeRegistryConfig.identifier) {
                                    if (registryData.did !== homeRegistryConfig.identifier) {
                                        console.log(chalk.red(`\n✗ Home Registry Identity Mismatch\n`))
                                        console.log(chalk.red(`  The home registry identifier in your config does not match the registry.\n`))
                                        console.log(chalk.white(`  Config identifier:`))
                                        console.log(chalk.white(`    ${homeRegistryConfig.identifier}`))
                                        console.log(chalk.white(`  Registry identifier (${registryPath}):`))
                                        console.log(chalk.white(`    ${registryData.did}\n`))
                                        console.log(chalk.red(`  To fix this, either:`))
                                        console.log(chalk.red(`    • Update the identifier in your workspace config to match the registry`))
                                        console.log(chalk.red(`    • Or delete the relevant config fields and re-run to set up fresh\n`))
                                        return false
                                    }
                                } else {
                                    // rootDir set but no identifier — adopt from registry
                                    await this.WorkspaceConfig.setConfigValue([homeRegistryConfigStructKey, 'identifier'], registryData.did)
                                    console.log(chalk.green(`   ✓ Adopted home registry identity from registry`))
                                    console.log(chalk.green(`     DID: ${registryData.did}\n`))
                                }
                            }
                        }

                        // --- Workspace identity ---
                        if (ws.name) {
                            const registryData = await this.HomeRegistry.getWorkspace(ws.name)
                            const registryPath = await this.HomeRegistry.getWorkspacePath(ws.name)

                            if (registryData) {
                                if (ws.identifier) {
                                    // Validate: config identifier must match registry
                                    if (registryData.did !== ws.identifier) {
                                        console.log(chalk.red(`\n✗ Workspace Identity Mismatch\n`))
                                        console.log(chalk.red(`  The identifier in your workspace config does not match the registry.\n`))
                                        console.log(chalk.white(`  Config identifier:`))
                                        console.log(chalk.white(`    ${ws.identifier}`))
                                        console.log(chalk.white(`  Registry identifier (${registryPath}):`))
                                        console.log(chalk.white(`    ${registryData.did}\n`))
                                        console.log(chalk.red(`  This can happen if the registry file was regenerated or the config was manually edited.`))
                                        console.log(chalk.red(`  To fix this, either:`))
                                        console.log(chalk.red(`    • Update the identifier in your workspace config to match the registry`))
                                        console.log(chalk.red(`    • Or delete the relevant config fields and re-run to set up fresh\n`))
                                        return false
                                    }
                                    // Validate: rootDir must match
                                    if (registryData.workspaceRootDir && registryData.workspaceRootDir !== ws.rootDir) {
                                        console.log(chalk.red(`\n✗ Workspace Root Directory Mismatch\n`))
                                        console.log(chalk.red(`  The workspace "${ws.name}" is registered to a different directory.\n`))
                                        console.log(chalk.white(`  Config rootDir:`))
                                        console.log(chalk.white(`    ${ws.rootDir}`))
                                        console.log(chalk.white(`  Registry rootDir (${registryPath}):`))
                                        console.log(chalk.white(`    ${registryData.workspaceRootDir}\n`))
                                        console.log(chalk.red(`  A workspace can only be connected to one directory.\n`))
                                        return false
                                    }
                                } else {
                                    // Name set but no identifier — check rootDir and adopt if matching
                                    if (registryData.workspaceRootDir && registryData.workspaceRootDir !== ws.rootDir) {
                                        console.log(chalk.red(`\n✗ Workspace "${ws.name}" Cannot Be Adopted\n`))
                                        console.log(chalk.red(`  The workspace "${ws.name}" is registered to a different directory.\n`))
                                        console.log(chalk.white(`  Your rootDir:`))
                                        console.log(chalk.white(`    ${ws.rootDir}`))
                                        console.log(chalk.white(`  Registry rootDir (${registryPath}):`))
                                        console.log(chalk.white(`    ${registryData.workspaceRootDir}\n`))
                                        console.log(chalk.red(`  A workspace can only be connected to one directory.`))
                                        console.log(chalk.red(`  Choose a different workspace name or update the registry.\n`))
                                        return false
                                    }
                                    // rootDir matches — adopt identity
                                    await this.WorkspaceConfig.setConfigValue([wsConfigStructKey, 'identifier'], registryData.did)
                                    console.log(chalk.green(`   ✓ Adopted workspace identity for "${ws.name}" from registry`))
                                    console.log(chalk.green(`     DID: ${registryData.did}\n`))
                                }
                            }
                        }

                        // --- Key identity ---
                        if (keyConfig?.name) {
                            const registryData = await this.HomeRegistry.getKey(keyConfig.name)
                            const registryPath = await this.HomeRegistry.getKeyPath(keyConfig.name)

                            if (registryData) {
                                if (keyConfig.identifier) {
                                    if (registryData.did !== keyConfig.identifier) {
                                        console.log(chalk.red(`\n✗ Workspace Key Identity Mismatch\n`))
                                        console.log(chalk.red(`  The key identifier in your config does not match the registry.\n`))
                                        console.log(chalk.white(`  Config identifier:`))
                                        console.log(chalk.white(`    ${keyConfig.identifier}`))
                                        console.log(chalk.white(`  Registry identifier (${registryPath}):`))
                                        console.log(chalk.white(`    ${registryData.did}\n`))
                                        console.log(chalk.red(`  To fix this, either:`))
                                        console.log(chalk.red(`    • Update the identifier in your workspace config to match the registry`))
                                        console.log(chalk.red(`    • Or delete the relevant config fields and re-run to set up fresh\n`))
                                        return false
                                    }
                                } else {
                                    // Name set but no identifier — adopt from registry
                                    await this.WorkspaceConfig.setConfigValue([keyConfigStructKey, 'identifier'], registryData.did)
                                    console.log(chalk.green(`   ✓ Adopted key identity for "${keyConfig.name}" from registry`))
                                    console.log(chalk.green(`     DID: ${registryData.did}\n`))
                                }
                            }
                        }

                        // --- Project Rack identity ---
                        if (rackConfig?.name) {
                            const registryData = await this.HomeRegistry.getRack(rackConfig.name)
                            const registryPath = await this.HomeRegistry.getRackPath(rackConfig.name)

                            if (registryData) {
                                if (rackConfig.identifier) {
                                    if (registryData.did !== rackConfig.identifier) {
                                        console.log(chalk.red(`\n✗ Project Rack Identity Mismatch\n`))
                                        console.log(chalk.red(`  The rack identifier in your config does not match the registry.\n`))
                                        console.log(chalk.white(`  Config identifier:`))
                                        console.log(chalk.white(`    ${rackConfig.identifier}`))
                                        console.log(chalk.white(`  Registry identifier (${registryPath}):`))
                                        console.log(chalk.white(`    ${registryData.did}\n`))
                                        console.log(chalk.red(`  To fix this, either:`))
                                        console.log(chalk.red(`    • Update the identifier in your workspace config to match the registry`))
                                        console.log(chalk.red(`    • Or delete the relevant config fields and re-run to set up fresh\n`))
                                        return false
                                    }
                                } else {
                                    // Name set but no identifier — adopt from registry
                                    await this.WorkspaceConfig.setConfigValue([rackConfigStructKey, 'identifier'], registryData.did)
                                    console.log(chalk.green(`   ✓ Adopted project rack identity for "${rackConfig.name}" from registry`))
                                    console.log(chalk.green(`     DID: ${registryData.did}\n`))
                                }
                            }
                        }

                        return true
                    }
                },
                spawnCli: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        cwd: string,
                        args: string[],
                        env?: Record<string, string | undefined>,
                        timeout?: number,
                    }): Promise<{ exitCode: number, stdout: string, stderr: string }> {
                        const { join, dirname } = await import('path')
                        const { fileURLToPath } = await import('url')
                        const { cwd, args, env: envOverrides = {}, timeout = 30_000 } = options
                        const capsuleDir = dirname(fileURLToPath(import.meta.url))
                        const t44Bin = join(capsuleDir, '../bin/t44')
                        const bunExe = Bun.which('bun')

                        const mergedEnv = { ...process.env, ...envOverrides }
                        const proc = Bun.spawn([bunExe!, t44Bin, ...args, '--yes'], {
                            env: mergedEnv,
                            cwd,
                            stdout: 'pipe',
                            stderr: 'pipe',
                            stdin: 'pipe',
                        })
                        proc.stdin.end()

                        const timer = setTimeout(() => proc.kill(), timeout)

                        const stdoutChunks: string[] = []
                        const stderrChunks: string[] = []

                        const verbose = !!process.env.VERBOSE

                        const stdoutWriter = new WritableStream({
                            write(chunk) {
                                const text = new TextDecoder().decode(chunk)
                                stdoutChunks.push(text)
                                if (verbose) process.stdout.write(text)
                            }
                        })

                        const stderrWriter = new WritableStream({
                            write(chunk) {
                                const text = new TextDecoder().decode(chunk)
                                stderrChunks.push(text)
                                if (verbose) process.stderr.write(text)
                            }
                        })

                        const [exitCode] = await Promise.all([
                            proc.exited,
                            proc.stdout.pipeTo(stdoutWriter),
                            proc.stderr.pipeTo(stderrWriter),
                        ])

                        clearTimeout(timer)

                        return { exitCode, stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') }
                    }
                },
                runCli: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, argv: string[]): Promise<void> {

                        const program = new Command()
                            .option('--trace', 'Detailed logging for debugging and performance tuning.')
                            .option('--yes', 'Confirm all questions with default values.')
                            .option('--now', 'Fetch fresh data instead of using cached values.')

                        // Check for flags without parsing (to avoid consuming argv)
                        const hasYesFlag = argv.includes('--yes')
                        const hasNowFlag = argv.includes('--now')

                        // Set cliOptions for use by other capsules
                        this.cliOptions = { yes: hasYesFlag, now: hasNowFlag }
                        this.WorkspacePrompt.cliOptions = { yes: hasYesFlag }

                        // Detect 'init' flags early so we can validate and pre-populate config
                        // before the ensure steps run
                        const initFromIndex = argv.indexOf('init')
                        if (initFromIndex !== -1) {
                            const fromFlagIndex = argv.indexOf('--from', initFromIndex)
                            const atFlagIndex = argv.indexOf('--at', initFromIndex)

                            if (fromFlagIndex !== -1 && fromFlagIndex + 1 < argv.length) {
                                // --from: check if current directory already has a workspace
                                if (await this.WorkspaceInit._isWorkspaceInitialized(process.cwd())) {
                                    const chalk = (await import('chalk')).default
                                    console.error(chalk.red(`\n✗ This directory is already an initialized workspace: ${process.cwd()}\n`))
                                    console.error(chalk.red(`  Cannot use --from in an already initialized workspace.\n`))
                                    process.exit(1)
                                }
                                const fromPath = argv[fromFlagIndex + 1]
                                await this.WorkspaceInit._initFrom(fromPath)
                            }

                            if (atFlagIndex !== -1 && atFlagIndex + 1 < argv.length) {
                                // --at: run _initAt and exit — no need for the ensure pipeline on the current workspace
                                // (_initAt does its own check for existing workspace config)
                                const { resolve } = await import('path')
                                const atPath = resolve(argv[atFlagIndex + 1])
                                await this.WorkspaceInit._initAt(atPath)
                                return
                            }
                        }

                        // Ensure workspace config base fields (rootDir, rootConfigFilepath)
                        await this.WorkspaceConfig.ensureConfigBase()

                        // Ensure home registry directory is configured
                        await this.HomeRegistry.ensureRootDir()

                        // Ensure workspace identity fields (name, identifier) — requires registry
                        await this.WorkspaceConfig.ensureConfigIdentity()

                        // Validate identities: adopt from registry if only name is set, halt on mismatch
                        const identityValid = await this.validateIdentities()
                        if (!identityValid) return

                        // Ensure root key is configured and valid
                        const rootKey = await this.RootKey.ensureKey()
                        if (!rootKey) return

                        // Ensure signing key is configured and valid
                        const signingKey = await this.SigningKey.ensureKey()
                        if (!signingKey) return

                        // Ensure workspace key is configured
                        await this.WorkspaceKey.ensureKey()

                        // Ensure project rack is configured
                        await this.ProjectRack.ensureRack()

                        // Ensure project identifiers exist in package.json descriptors
                        await this.WorkspaceProjects.ensureIdentifiers()

                        // Validate project catalogs configuration
                        const catalogsValid = await this.ProjectCatalogs.validate()
                        if (!catalogsValid) return

                        const cliConfig = await this.$config.config
                        const cliCommands = await this.cliCommands as Record<string, (args?: any) => Promise<void>>

                        for (const commandName in cliConfig?.cli?.commands) {
                            const commandConfig = cliConfig.cli.commands[commandName]
                            const { description, arguments: commandArgs } = commandConfig

                            const cmd = program
                                .command(commandName)
                                .description(description || '')

                            // Add arguments if defined
                            if (commandArgs) {
                                for (const argName in commandArgs) {
                                    const argConfig = commandArgs[argName]
                                    const argSyntax = argConfig.optional ? `[${argName}]` : `<${argName}>`
                                    cmd.argument(argSyntax, argConfig.description || '')
                                }
                            }

                            // Add options if defined
                            const commandOptions = commandConfig.options
                            if (commandOptions) {
                                for (const optionName in commandOptions) {
                                    const optionConfig = commandOptions[optionName]
                                    const shortFlag = optionConfig.short ? `-${optionConfig.short}, ` : ''
                                    if (optionConfig.value === 'optional') {
                                        cmd.option(`${shortFlag}--${optionName} [value]`, optionConfig.description || '')
                                    } else if (optionConfig.value === 'required') {
                                        cmd.option(`${shortFlag}--${optionName} <value>`, optionConfig.description || '')
                                    } else {
                                        cmd.option(`${shortFlag}--${optionName}`, optionConfig.description || '')
                                    }
                                }
                            }

                            cmd.action(async function (...actionArgs) {
                                // Helper to convert hyphenated names to camelCase (e.g., 'dangerously-squash' -> 'dangerouslySquash')
                                const toCamelCase = (str: string) => {
                                    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
                                }

                                // Extract argument values (last arg is the command object)
                                const commandObj = actionArgs[actionArgs.length - 1]
                                const argValues: any = {}

                                if (commandArgs) {
                                    const argNames = Object.keys(commandArgs)
                                    argNames.forEach((name, index) => {
                                        argValues[name] = actionArgs[index]
                                    })
                                }

                                // Extract option values
                                // Commander.js converts hyphenated options to camelCase in opts()
                                // Store them as camelCase in argValues for consistency
                                if (commandOptions) {
                                    const opts = commandObj.opts()
                                    for (const optionName in commandOptions) {
                                        const camelCaseKey = toCamelCase(optionName)
                                        argValues[camelCaseKey] = opts[camelCaseKey] || false
                                    }
                                }

                                // Pass global options (like --yes, --now) from program to command args
                                const globalOpts = program.opts()
                                if (globalOpts.yes) {
                                    argValues.yes = true
                                }
                                if (globalOpts.now) {
                                    argValues.now = true
                                }

                                await cliCommands[commandName](argValues)
                            })
                        }

                        await program.parseAsync(argv)
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
capsule['#'] = '@stream44.studio/t44/caps/WorkspaceCli'
