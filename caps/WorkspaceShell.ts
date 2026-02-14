
import { join, resolve, relative } from 'path'
import { readFile } from 'fs/promises'
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
            '#t44/structs/WorkspaceCliConfig': {
                as: '$WorkspaceCliConfig'
            },
            '#t44/structs/WorkspaceShellConfig': {
                as: '$ShellConfig'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const env = await this.$ShellConfig.env
                        const config = await this.WorkspaceConfig.config as any
                        const cliConfig = await this.$WorkspaceCliConfig.config

                        for (const name in env) {
                            process.stdout.write(`export ${name}="${env[name]}"\n`)
                        }

                        process.stdout.write('\n')

                        // Load the shell script template
                        const shellScriptModule = import.meta.resolve('t44/caps/WorkspaceShell.sh')
                        const shellScriptPath = shellScriptModule.replace('file://', '')
                        let shellScript = await readFile(shellScriptPath, 'utf-8')

                        // Generate commands dynamically from shell.commands
                        const shellConfig = await this.$ShellConfig.config
                        const shellCommands = shellConfig?.shell?.commands || {}
                        const cliCommands = cliConfig?.cli?.commands || {}
                        const commandNames = Object.keys(shellCommands).sort()

                        // Generate shell functions
                        const helpLines: string[] = []
                        for (const cmdName of commandNames) {
                            const cmdConfig = shellCommands[cmdName]

                            let cmdBody = ''

                            // Check if this is a cliCommand reference
                            if (cmdConfig.cliCommand) {
                                const cliCommandName = cmdConfig.cliCommand
                                // Auto-generate the shell code to call the CLI command
                                cmdBody = `(
            cd "$F_WORKSPACE_DIR" &&
            "\${F_WORKSPACE_IMPL_DIR}/bin/workspace" ${cliCommandName} \$@
        )`
                            } else {
                                cmdBody = cmdConfig.cmd || ''
                            }

                            helpLines.push(`    function ${cmdName} {`)
                            for (const line of cmdBody.split('\n')) {
                                helpLines.push(`        ${line}`)
                            }
                            helpLines.push(`    }`)
                            helpLines.push(``)
                        }

                        // Generate alias for h if it exists
                        if (shellCommands.h) {
                            helpLines.push(`    alias h='cd "\${F_WORKSPACE_DIR}"'`)
                            helpLines.push(``)
                        }

                        const commandsBlock = helpLines.join('\n')

                        // Replace the placeholder in the shell script
                        shellScript = shellScript.replace('#${COMMANDS}', commandsBlock)

                        // Remove the shebang line and output
                        process.stdout.write(shellScript.split('\n').slice(1).join('\n'))
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
capsule['#'] = 't44/caps/WorkspaceShell'
