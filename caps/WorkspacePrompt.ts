
// Global prompt queue to ensure sequential prompting and deduplication
const globalPromptQueue: Array<() => Promise<any>> = []
const globalActivePrompts: Record<string, Promise<any>> = {}
const globalShownTitles: Set<string> = new Set()
let globalIsProcessing = false

async function processGlobalQueue() {
    if (globalIsProcessing || globalPromptQueue.length === 0) return
    globalIsProcessing = true

    while (globalPromptQueue.length > 0) {
        const task = globalPromptQueue.shift()!
        await task()
    }

    globalIsProcessing = false
}

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
                WorkspaceCli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceCli'
                },
                WorkspaceTest: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest'
                },
                prompt: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, questions: any[]): Promise<any> {
                        // Check if --yes flag is set
                        const cliOptions = await this.WorkspaceCli.cliOptions
                        const yes = cliOptions?.yes || false

                        // If --yes is set, return default values
                        if (yes) {
                            const result: Record<string, any> = {}
                            for (const question of questions) {
                                result[question.name] = question.default
                            }
                            return result
                        }

                        // Otherwise, load inquirer and prompt user
                        const inquirer = await import('inquirer')
                        try {
                            return await inquirer.default.prompt(questions)
                        } catch (error: any) {
                            if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
                                const chalk = (await import('chalk')).default
                                console.log(chalk.red('\n\nABORTED\n'))
                                process.exit(0)
                            }
                            throw error
                        }
                    }
                },
                confirm: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, {
                        title,
                        description,
                        message,
                        defaultValue = false,
                        onSuccess,
                        onAbort
                    }: {
                        title?: string
                        description?: string | string[]
                        message: string
                        defaultValue?: boolean
                        onSuccess?: (confirmed: boolean) => Promise<void> | void
                        onAbort?: () => Promise<void> | void
                    }): Promise<boolean> {
                        const chalk = (await import('chalk')).default

                        if (title) {
                            console.log(chalk.cyan(`\n${title}\n`))
                        }
                        if (description) {
                            const lines = Array.isArray(description) ? description : [description]
                            for (const line of lines) {
                                console.log(chalk.gray(`   ${line}`))
                            }
                            console.log('')
                        }

                        // Check if --yes flag is set
                        const cliOptions = await this.WorkspaceCli.cliOptions
                        const yes = cliOptions?.yes || false

                        let confirmed: boolean

                        // If --yes is set, return default value
                        if (yes) {
                            confirmed = defaultValue
                        } else {
                            try {
                                // Otherwise, load inquirer and prompt user
                                const inquirer = await import('inquirer')
                                const result = await inquirer.default.prompt([
                                    {
                                        type: 'confirm',
                                        name: 'confirmed',
                                        message,
                                        default: defaultValue
                                    }
                                ])
                                confirmed = result.confirmed
                            } catch (error: any) {
                                if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
                                    console.log(chalk.red('\n\nABORTED\n'))
                                    if (onAbort) {
                                        await onAbort()
                                    }
                                    process.exit(0)
                                }
                                throw error
                            }
                        }

                        if (onSuccess) {
                            await onSuccess(confirmed)
                        }

                        return confirmed
                    }
                },
                input: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, {
                        message,
                        defaultValue,
                        validate,
                        promptFactId
                    }: {
                        message: string
                        defaultValue?: string
                        validate?: (input: string) => boolean | string
                        promptFactId?: string
                    }): Promise<string> {
                        // Try to get value from env first (works in both interactive and non-interactive modes)
                        if (promptFactId) {
                            const envValue = this.getEnvValueForFactReference(promptFactId)
                            if (envValue) {
                                return envValue
                            }
                        }

                        // In non-interactive mode, throw error if env value not found
                        if (!process.stdin.isTTY && promptFactId) {
                            throw new Error(
                                `Cannot prompt for "${message}" in non-interactive mode. ` +
                                `Please run interactively first to configure credentials, or set the corresponding env variable.`
                            )
                        }

                        // Check for existing prompt with same ID
                        if (promptFactId && promptFactId in globalActivePrompts) {
                            return globalActivePrompts[promptFactId]
                        }

                        // Create the prompt task
                        const promptTask = async () => {
                            try {
                                // Check if --yes flag is set
                                const cliOptions = await this.WorkspaceCli.cliOptions
                                const yes = cliOptions?.yes || false

                                // If --yes is set, return default value
                                if (yes) {
                                    if (!defaultValue) {
                                        throw new Error(`Cannot use --yes flag without a default value for prompt: ${message}`)
                                    }
                                    return defaultValue
                                }

                                // Otherwise, load inquirer and prompt user
                                const inquirer = await import('inquirer')
                                const question: any = {
                                    type: 'input',
                                    name: 'value',
                                    message,
                                    validate
                                }

                                // Only add default if explicitly provided
                                if (defaultValue !== undefined) {
                                    question.default = defaultValue
                                }

                                const { value } = await inquirer.default.prompt([question])
                                return value
                            } catch (error: any) {
                                if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
                                    const chalk = (await import('chalk')).default
                                    console.log(chalk.red('\n\nABORTED\n'))
                                    process.exit(0)
                                }
                                throw error
                            } finally {
                                // Remove from active prompts when done
                                if (promptFactId) {
                                    delete globalActivePrompts[promptFactId]
                                }
                            }
                        }

                        // Create promise and add to queue
                        const promise = new Promise<string>((resolve, reject) => {
                            globalPromptQueue.push(async () => {
                                try {
                                    const result = await promptTask()
                                    resolve(result)
                                } catch (error) {
                                    reject(error)
                                }
                            })
                        })

                        // Track active prompt
                        if (promptFactId) {
                            globalActivePrompts[promptFactId] = promise
                        }

                        // Start processing queue (inlined to avoid ambient reference issues)
                        if (!globalIsProcessing && globalPromptQueue.length > 0) {
                            globalIsProcessing = true

                                // Process queue asynchronously
                                ; (async () => {
                                    while (globalPromptQueue.length > 0) {
                                        const task = globalPromptQueue.shift()!
                                        await task()
                                    }
                                    globalIsProcessing = false
                                })()
                        }

                        return promise
                    }
                },
                getEnvValueForFactReference: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, factReference: string): string | undefined {
                        const workspaceTest = this.WorkspaceTest
                        if (!workspaceTest) return undefined

                        const envConfig = workspaceTest.env || {}

                        for (const [envVarName, envDef] of Object.entries(envConfig)) {
                            if ((envDef as any)?.factReference === factReference) {
                                return workspaceTest.getEnvValue(envVarName)
                            }
                        }
                        return undefined
                    }
                },
                select: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, {
                        message,
                        choices,
                        defaultValue,
                        pageSize
                    }: {
                        message: string
                        choices: Array<{ name: string; value: any; disabled?: boolean | string }>
                        defaultValue?: any
                        pageSize?: number
                    }): Promise<any> {
                        // Check if --yes flag is set
                        const cliOptions = await this.WorkspaceCli.cliOptions
                        const yes = cliOptions?.yes || false

                        // If --yes is set, return default value
                        if (yes) {
                            if (defaultValue === undefined) {
                                throw new Error(`Cannot use --yes flag without a default value for select: ${message}`)
                            }
                            return defaultValue
                        }

                        // Otherwise, load inquirer and prompt user
                        const inquirer = await import('inquirer')
                        try {
                            // Resolve defaultValue to the actual choice reference for inquirer v12
                            // inquirer v12 matches default by === on choice.value, so we need
                            // the exact reference from the choices array, not a separate object.
                            let resolvedDefault: any = undefined
                            if (defaultValue !== undefined) {
                                const match = choices.find(c =>
                                    JSON.stringify(c.value) === JSON.stringify(defaultValue)
                                )
                                if (match) resolvedDefault = match.value
                            }
                            const { value } = await inquirer.default.prompt([
                                {
                                    type: 'list',
                                    name: 'value',
                                    message,
                                    choices,
                                    default: resolvedDefault,
                                    pageSize: pageSize || 10
                                }
                            ])
                            return value
                        } catch (error: any) {
                            if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
                                const chalk = (await import('chalk')).default
                                console.log(chalk.red('\n\nABORTED\n'))
                                process.exit(0)
                            }
                            throw error
                        }
                    }
                },
                setupPrompt: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, {
                        title,
                        description,
                        message,
                        defaultValue,
                        validate,
                        configPath,
                        configKey,
                        onSuccess,
                        onAbort
                    }: {
                        title: string
                        description?: string | string[]
                        message: string
                        defaultValue: string
                        validate?: (input: string) => boolean | string
                        configPath: string[]
                        configKey?: string
                        onSuccess?: (value: string) => Promise<void> | void
                        onAbort?: () => Promise<void> | void
                    }): Promise<string> {
                        const chalk = (await import('chalk')).default

                        console.log(chalk.cyan(`\n${title}\n`))
                        if (description) {
                            const lines = Array.isArray(description) ? description : [description]
                            for (const line of lines) {
                                console.log(chalk.gray(`   ${line}`))
                            }
                            console.log('')
                        }

                        try {
                            const value = await this.input({
                                message,
                                defaultValue,
                                validate
                            })

                            if (onSuccess) {
                                await onSuccess(value)
                            }

                            const displayKey = configKey || configPath.join('.')
                            console.log(chalk.green(`\n   ✓ Updated config with ${displayKey}: ${value}\n`))

                            return value
                        } catch (error: any) {
                            if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
                                console.log(chalk.red('\n\nABORTED\n'))
                                if (onAbort) {
                                    await onAbort()
                                }
                                process.exit(0)
                            }
                            throw error
                        }
                    }
                }
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
        ambientReferences: {
            globalPromptQueue,
            globalActivePrompts,
            globalShownTitles,
            globalIsProcessing
        }
    })
}
capsule['#'] = 't44/caps/WorkspacePrompt'
