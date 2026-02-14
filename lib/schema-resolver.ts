
import { join, relative } from 'path'
import { readdir, readFile } from 'fs/promises'
import { RefResolver } from 'json-schema-ref-resolver'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

export interface ResolvedEntity {
    schemaId: string
    name: string
    data: any
    filePath: string
    relPath: string
    line?: number
    valid: boolean
    errors: any[]
}

export interface ResolverContext {
    workspaceRootDir: string
    workspaceName: string
    schemasDir: string
    factsDir: string
    metaCacheDir: string
    homeRegistryConnectionsDir: string
}

export interface WorkspaceResolverResult {
    schemas: Map<string, any>
    entities: Map<string, ResolvedEntity[]>
    configEntities: Map<string, any>
    factEntities: Map<string, ResolvedEntity[]>
    connectionEntities: Map<string, ResolvedEntity[]>
    refResolver: RefResolver
}

function createAjvInstance(): Ajv {
    const ajv = new Ajv({
        allErrors: true,
        strict: false,
        validateFormats: true,
        logger: false
    })
    addFormats(ajv)
    return ajv
}

export function Resolver(context: ResolverContext) {
    const refResolver = new RefResolver()
    const ajv = createAjvInstance()
    const schemas = new Map<string, any>()

    return {
        async loadSchemas(): Promise<Map<string, any>> {
            await loadSchemasInternal(context.schemasDir, refResolver, schemas)
            return schemas
        },

        async loadConfigEntities(): Promise<{ configEntities: Map<string, any>; entities: Map<string, ResolvedEntity[]> }> {
            const configEntities = new Map<string, any>()
            const entities = new Map<string, ResolvedEntity[]>()
            await loadConfigFileEntities(context.metaCacheDir, ajv, schemas, configEntities, entities)
            return { configEntities, entities }
        },

        async loadFactEntities(): Promise<{ factEntities: Map<string, ResolvedEntity[]>; entities: Map<string, ResolvedEntity[]> }> {
            const factEntities = new Map<string, ResolvedEntity[]>()
            const entities = new Map<string, ResolvedEntity[]>()
            await loadEntityFiles({
                entityDir: context.factsDir,
                workspaceRootDir: context.workspaceRootDir,
                ajv,
                schemas,
                entityMap: factEntities,
                allEntities: entities
            })
            return { factEntities, entities }
        },

        async loadConnectionEntities(): Promise<{ connectionEntities: Map<string, ResolvedEntity[]>; entities: Map<string, ResolvedEntity[]> }> {
            const connectionEntities = new Map<string, ResolvedEntity[]>()
            const entities = new Map<string, ResolvedEntity[]>()
            await loadEntityFiles({
                entityDir: context.homeRegistryConnectionsDir,
                workspaceRootDir: context.workspaceRootDir,
                ajv,
                schemas,
                entityMap: connectionEntities,
                allEntities: entities,
                isFlat: true
            })
            return { connectionEntities, entities }
        },

        getRefResolver(): RefResolver {
            return refResolver
        },

        getSchemas(): Map<string, any> {
            return schemas
        }
    }
}

async function loadSchemasInternal(
    schemasDir: string,
    refResolver: RefResolver,
    schemas: Map<string, any>
): Promise<void> {
    let files: string[]
    try {
        files = await readdir(schemasDir)
    } catch {
        return
    }

    for (const file of files) {
        if (!file.endsWith('.json')) continue
        const filePath = join(schemasDir, file)
        try {
            const content = await readFile(filePath, 'utf-8')
            const schema = JSON.parse(content)
            if (schema.$id) {
                refResolver.addSchema(schema)
                // Store by $id (with version)
                schemas.set(schema.$id, schema)
                // Also store by entity name (without version) for easier lookup
                const entityName = schema.$id.replace(/\.v\d+$/, '')
                schemas.set(entityName, schema)
            }
        } catch {
            // Skip files that can't be parsed
        }
    }
}

async function loadConfigFileEntities(
    metaCacheDir: string,
    ajv: Ajv,
    schemas: Map<string, any>,
    configEntities: Map<string, any>,
    entities: Map<string, ResolvedEntity[]>
): Promise<void> {

    let metaFiles: string[]
    try {
        metaFiles = await readdir(metaCacheDir)
    } catch {
        return
    }

    for (const metaFile of metaFiles) {
        if (!metaFile.endsWith('.json')) continue

        try {
            const metaPath = join(metaCacheDir, metaFile)
            const metaContent = await readFile(metaPath, 'utf-8')
            const metadata = JSON.parse(metaContent)

            if (!metadata.entities || typeof metadata.entities !== 'object') continue

            for (const [entityKey, entityMeta] of Object.entries(metadata.entities as Record<string, any>)) {
                if (!entityKey.startsWith('#')) continue
                const entityName = entityKey.substring(1)

                configEntities.set(entityKey, entityMeta.data)

                // Try to validate against schema
                const schemaId = entityName + '.v0'
                const schema = schemas.get(schemaId)

                const resolved: ResolvedEntity = {
                    schemaId,
                    name: entityName,
                    data: entityMeta.data,
                    filePath: metadata.filePath,
                    relPath: metadata.relPath,
                    line: entityMeta.line,
                    valid: true,
                    errors: []
                }

                if (schema) {
                    try {
                        const validate = ajv.compile(schema)
                        if (!validate(entityMeta.data)) {
                            resolved.valid = false
                            resolved.errors = validate.errors?.map(e => ({
                                path: e.instancePath || '/',
                                message: e.message,
                                keyword: e.keyword
                            })) || []
                        }
                    } catch {
                        // Schema compilation failed
                    }
                }

                if (!entities.has(entityKey)) entities.set(entityKey, [])
                entities.get(entityKey)!.push(resolved)
            }
        } catch {
            // Skip unparseable metadata files
        }
    }
}

interface LoadEntityFilesOptions {
    entityDir: string
    workspaceRootDir: string
    ajv: Ajv
    schemas: Map<string, any>
    entityMap: Map<string, ResolvedEntity[]>
    allEntities: Map<string, ResolvedEntity[]>
    isFlat?: boolean // true for connections (flat .json files), false for facts (subdirectories)
}

async function loadEntityFiles(options: LoadEntityFilesOptions): Promise<void> {
    const { entityDir, workspaceRootDir, ajv, schemas, entityMap, allEntities, isFlat = false } = options

    let items: string[]
    try {
        items = await readdir(entityDir)
    } catch {
        return
    }

    if (isFlat) {
        // Flat structure: files are directly in entityDir (e.g., connections)
        for (const file of items) {
            if (!file.startsWith('@') || !file.endsWith('.json')) continue

            const entityTypeDir = file.replace(/\.json$/, '')
            const entityName = entityTypeDir.replace(/~/g, '/')
            const schema = schemas.get(entityName)
            const filePath = join(entityDir, file)
            const fileName = file.replace(/\.json$/, '')

            try {
                const content = await readFile(filePath, 'utf-8')
                const data = JSON.parse(content)
                const cleanData = { ...data }
                delete cleanData.$schema
                delete cleanData.$defs
                delete cleanData.$id

                const resolved: ResolvedEntity = {
                    schemaId: entityName,
                    name: fileName,
                    data: cleanData,
                    filePath,
                    relPath: relative(workspaceRootDir, filePath),
                    valid: true,
                    errors: []
                }

                if (schema) {
                    try {
                        const validate = ajv.compile(schema)
                        if (!validate(cleanData)) {
                            resolved.valid = false
                            resolved.errors = validate.errors?.map(e => ({
                                path: e.instancePath || '/',
                                message: e.message,
                                keyword: e.keyword
                            })) || []
                        }
                    } catch {
                        // Schema compilation failed
                    }
                }

                if (!entityMap.has(entityName)) entityMap.set(entityName, [])
                entityMap.get(entityName)!.push(resolved)

                const entityKey = `#${entityName}`
                if (!allEntities.has(entityKey)) allEntities.set(entityKey, [])
                allEntities.get(entityKey)!.push(resolved)
            } catch {
                // Skip unparseable files
            }
        }
    } else {
        // Nested structure: subdirectories contain entity files (e.g., facts)
        for (const entityTypeDir of items) {
            if (!entityTypeDir.startsWith('@')) continue
            const entityTypePath = join(entityDir, entityTypeDir)
            const entityName = entityTypeDir.replace(/~/g, '/')
            const schema = schemas.get(entityName)

            let entityFiles: string[]
            try {
                entityFiles = await readdir(entityTypePath)
            } catch {
                continue
            }

            for (const entityFile of entityFiles) {
                if (!entityFile.endsWith('.json')) continue
                const entityFilePath = join(entityTypePath, entityFile)
                const entityFileName = entityFile.slice(0, -5) // strip .json

                try {
                    const content = await readFile(entityFilePath, 'utf-8')
                    const data = JSON.parse(content)
                    const cleanData = { ...data }
                    delete cleanData.$schema
                    delete cleanData.$defs
                    delete cleanData.$id

                    const resolved: ResolvedEntity = {
                        schemaId: entityName,
                        name: entityFileName,
                        data: cleanData,
                        filePath: entityFilePath,
                        relPath: relative(workspaceRootDir, entityFilePath),
                        valid: true,
                        errors: []
                    }

                    if (schema) {
                        try {
                            const validate = ajv.compile(schema)
                            if (!validate(cleanData)) {
                                resolved.valid = false
                                resolved.errors = validate.errors?.map(e => ({
                                    path: e.instancePath || '/',
                                    message: e.message,
                                    keyword: e.keyword
                                })) || []
                            }
                        } catch {
                            // Schema compilation failed
                        }
                    }

                    if (!entityMap.has(entityName)) entityMap.set(entityName, [])
                    entityMap.get(entityName)!.push(resolved)

                    const entityKey = `#${entityName}`
                    if (!allEntities.has(entityKey)) allEntities.set(entityKey, [])
                    allEntities.get(entityKey)!.push(resolved)
                } catch {
                    // Skip unparseable files
                }
            }
        }
    }
}
