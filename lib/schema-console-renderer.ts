import chalk from 'chalk'

export interface RenderOptions {
    indent?: number
    maxDepth?: number
    currentDepth?: number
    showTypes?: boolean
}

/**
 * Generic schema-based console renderer that formats data based on JSON Schema properties
 */
export class SchemaConsoleRenderer {
    /**
     * Render entity data based on its schema
     */
    static renderEntity(
        data: any,
        schema: any,
        options: RenderOptions = {}
    ): string {
        const {
            indent = 0,
            maxDepth = 5,
            currentDepth = 0,
            showTypes = false
        } = options

        // maxDepth of -1 means unlimited depth
        if (maxDepth !== -1 && currentDepth >= maxDepth) {
            return chalk.gray('  '.repeat(indent) + '[max depth reached]')
        }

        const lines: string[] = []
        const properties = schema?.properties || {}
        const required = new Set(schema?.required || [])

        // If data is primitive, render directly
        if (typeof data !== 'object' || data === null) {
            return chalk.yellow(String(data))
        }

        // Render each property based on schema
        for (const [key, value] of Object.entries(data)) {
            const propSchema = properties[key]
            const isRequired = required.has(key)
            const prefix = '  '.repeat(indent)

            // Format key with required indicator
            const keyDisplay = isRequired
                ? chalk.bold.cyan(key)
                : chalk.cyan(key)

            // Add type annotation if requested
            const typeAnnotation = showTypes && propSchema?.type
                ? chalk.gray(` (${propSchema.type})`)
                : ''

            // Render value based on type
            if (value === null || value === undefined) {
                lines.push(`${prefix}${keyDisplay}${typeAnnotation}: ${chalk.gray('null')}`)
            } else if (Array.isArray(value)) {
                lines.push(`${prefix}${keyDisplay}${typeAnnotation}: ${chalk.gray(`[${value.length} items]`)}`)

                // Render array items if not too deep
                if ((maxDepth === -1 || currentDepth < maxDepth - 1) && value.length > 0) {
                    const itemSchema = propSchema?.items
                    value.forEach((item, idx) => {
                        if (typeof item === 'object' && item !== null) {
                            lines.push(`${prefix}  ${chalk.gray(`${idx}`)}:`)
                            lines.push(this.renderEntity(item, itemSchema, {
                                indent: indent + 3,
                                maxDepth,
                                currentDepth: currentDepth + 1,
                                showTypes
                            }))
                        } else {
                            lines.push(`${prefix}  ${chalk.gray(`${idx}`)}: ${this.formatValue(item, propSchema)}`)
                        }
                    })
                }
            } else if (typeof value === 'object') {
                const description = propSchema?.description
                const descSuffix = description ? chalk.gray(` // ${description}`) : ''
                lines.push(`${prefix}${keyDisplay}${typeAnnotation}:${descSuffix}`)

                // Recursively render nested object
                lines.push(this.renderEntity(value, propSchema, {
                    indent: indent + 1,
                    maxDepth,
                    currentDepth: currentDepth + 1,
                    showTypes
                }))
            } else {
                const description = propSchema?.description
                const descSuffix = description ? chalk.gray(` // ${description}`) : ''
                lines.push(`${prefix}${keyDisplay}${typeAnnotation}: ${this.formatValue(value, propSchema)}${descSuffix}`)
            }
        }

        return lines.join('\n')
    }

    /**
     * Format a primitive value based on its schema
     */
    private static formatValue(value: any, schema?: any): string {
        if (value === null || value === undefined) {
            return chalk.gray('null')
        }

        const type = schema?.type || typeof value
        const format = schema?.format

        switch (type) {
            case 'string':
                if (format === 'date-time') {
                    return chalk.green(value)
                } else if (format === 'uri' || format === 'url') {
                    return chalk.blue.underline(value)
                } else if (schema?.enum) {
                    return chalk.magenta(value)
                }
                return chalk.yellow(JSON.stringify(value))

            case 'number':
            case 'integer':
                return chalk.cyan(String(value))

            case 'boolean':
                return value ? chalk.green('true') : chalk.red('false')

            default:
                return chalk.yellow(JSON.stringify(value))
        }
    }

    /**
     * Render a summary line for an entity
     */
    static renderSummary(
        entityName: string,
        data: any,
        schema: any
    ): string {
        const properties = schema?.properties || {}
        const parts: string[] = []

        // Try to find key identifying properties
        const identifiers = ['name', 'identifier', 'id', 'title']
        for (const key of identifiers) {
            if (data[key] && properties[key]) {
                parts.push(chalk.yellow(data[key]))
                break
            }
        }

        // Add status if present
        if (data.status && properties.status) {
            const statusColor = data.status === 'READY' ? chalk.green :
                data.status === 'ERROR' ? chalk.red :
                    chalk.yellow
            parts.push(statusColor(`[${data.status}]`))
        }

        return parts.length > 0 ? parts.join(' ') : ''
    }

    /**
     * Render validation errors
     */
    static renderErrors(errors: any[]): string {
        if (errors.length === 0) return ''

        const lines: string[] = [chalk.red.bold('Validation Errors:')]
        for (const err of errors) {
            lines.push(chalk.red(`  ${err.path}: ${err.message}`))
        }
        return lines.join('\n')
    }
}
