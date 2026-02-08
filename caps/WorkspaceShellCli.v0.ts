
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
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#t44/structs/WorkspaceCliConfig.v0': {
                as: '$WorkspaceCliConfig'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig.v0'
                },
                shellCommands: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<object> {

                        const config = await this.WorkspaceConfig.config as any
                        const self = this

                        const commands: Record<string, (commandArgs?: any) => Promise<void>> = {}
                        for (const commandName in config.shell.commands) {
                            const commandConfig = config.shell.commands[commandName]

                            commands[commandName] = async function () {
                                throw new Error(`Shell commands cannot be run directly! They must be sourced into the shell.`)
                            }
                        }
                        return commands
                    }
                },
                runCli: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, argv: string[]): Promise<void> {

                        const config = await this.WorkspaceConfig.config as any
                        const cliConfig = await this.$WorkspaceCliConfig.config
                        const shellCommands = await this.shellCommands as Record<string, (args?: any) => Promise<void>>

                        const program = new Command()
                            .option('--yes', 'Confirm all questions with default values.')

                        for (const commandName in config.shell.commands) {
                            const commandConfig = config.shell.commands[commandName]

                            // If this is a cliCommand reference, pull description and arguments from CLI command
                            let description = commandConfig.description || ''
                            let commandArgs = commandConfig.arguments
                            let commandOptions = commandConfig.options

                            if (commandConfig.cliCommand) {
                                const cliCommandName = commandConfig.cliCommand
                                const cliCommand = cliConfig?.cli?.commands?.[cliCommandName]
                                if (cliCommand) {
                                    description = cliCommand.description || description
                                    commandArgs = cliCommand.arguments || commandArgs
                                    commandOptions = cliCommand.options || commandOptions
                                }
                            }

                            const cmd = program
                                .command(commandName)
                                .description(description)

                            // Add arguments if defined
                            if (commandArgs) {
                                for (const argName in commandArgs) {
                                    const argConfig = commandArgs[argName]
                                    const argSyntax = argConfig.optional ? `[${argName}]` : `<${argName}>`
                                    cmd.argument(argSyntax, argConfig.description || '')
                                }
                            }

                            // Add options if defined
                            if (commandOptions) {
                                for (const optionName in commandOptions) {
                                    const optionConfig = commandOptions[optionName]
                                    cmd.option(`--${optionName}`, optionConfig.description || '')
                                }
                            }

                            cmd.action(async function (...actionArgs) {
                                throw new Error(`Shell commands cannot be run directly! They must be sourced into the shell.`)
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
capsule['#'] = 't44/caps/WorkspaceShellCli.v0'
