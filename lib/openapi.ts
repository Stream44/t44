
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

/**
 * Convert OpenAPI schema to JSON Schema compatible format
 */
export function convertOpenApiToJsonSchema(obj: any, root: any, warnings: any[] = [], visited = new WeakSet()): any {
    if (typeof obj !== 'object' || obj === null) return obj
    if (visited.has(obj)) return obj
    visited.add(obj)

    if (obj.$ref) {
        const refPath = obj.$ref.replace(/^#\//, '').split('/')
        let resolved = root
        for (const part of refPath) {
            const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~')
            resolved = resolved?.[decodedPart]
            if (!resolved) {
                warnings.push({
                    type: 'unresolved_reference',
                    message: `Cannot resolve reference ${obj.$ref}, using permissive schema`,
                    ref: obj.$ref
                })
                return {}
            }
        }
        return convertOpenApiToJsonSchema(resolved, root, warnings, visited)
    }

    const result: any = Array.isArray(obj) ? [] : {}
    for (const key in obj) {
        if (key === 'nullable' && obj.nullable === true) {
            if (obj.type) {
                result.type = Array.isArray(obj.type) ? [...obj.type, 'null'] : [obj.type, 'null']
            } else {
                result.type = 'null'
            }
        } else if (key === 'example' || key === 'discriminator') {
            continue
        } else {
            result[key] = convertOpenApiToJsonSchema(obj[key], root, warnings, visited)
        }
    }
    return result
}

/**
 * Create a configured AJV instance for OpenAPI/JSON Schema validation
 */
export function createAjvInstance(): Ajv {
    const ajv = new Ajv({
        allErrors: true,
        strict: false,
        validateFormats: true,
        logger: false
    })
    addFormats(ajv)
    return ajv
}

/**
 * Validate data against a JSON Schema
 */
export function validateWithSchema(
    schema: any,
    data: any,
    ajv?: Ajv
): { valid: boolean; errors: any[] } {
    const validator = ajv || createAjvInstance()
    
    let validate
    try {
        validate = validator.compile(schema)
    } catch (error: any) {
        return {
            valid: false,
            errors: [{
                type: 'schema_compilation_failed',
                message: `Schema compilation failed: ${error.message}`,
                error: error.message
            }]
        }
    }

    if (!validate(data)) {
        const validationErrors = validate.errors?.map(err => ({
            path: err.instancePath || '/',
            message: err.message,
            params: err.params,
            keyword: err.keyword,
            schemaPath: err.schemaPath
        })) || []

        return {
            valid: false,
            errors: validationErrors
        }
    }

    return { valid: true, errors: [] }
}

/**
 * Validate a single value against a property schema
 */
export function validatePropertyValue(
    propertySchema: any,
    value: any,
    propertyName: string
): { valid: boolean; error?: string } {
    // Build a minimal schema for the single property
    const schema = {
        type: 'object',
        properties: {
            [propertyName]: propertySchema
        },
        required: [propertyName]
    }

    const result = validateWithSchema(schema, { [propertyName]: value })
    
    if (!result.valid && result.errors.length > 0) {
        const error = result.errors[0]
        return {
            valid: false,
            error: error.message || `Invalid value for ${propertyName}`
        }
    }

    return { valid: true }
}
