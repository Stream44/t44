import { resolve, relative } from 'path'
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
            '#t44/structs/ProjectDeploymentConfig': {
                as: '$config'
            },
            '#t44/structs/WorkspaceConfig': {
                as: '$Config'
            },
            '#t44/structs/WorkspacePublishingConfig': {
                as: '$WorkspaceRepositories'
            },
            '#': {
                WorkspaceProjects: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceProjects'
                },
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceConfig'
                },
                Vercel: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/vercel.com/ProjectDeployment'
                },
                Bunny: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/bunny.net/ProjectDeployment'
                },
                Dynadot: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/providers/dynadot.com/ProjectDeployment'
                },
                ProjectCatalogs: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectCatalogs'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const workspaceConfig = await this.$Config.config
                        const workspaceRootDir = workspaceConfig?.rootDir
                        const configTree = await this.WorkspaceConfig.configTree
                        await this.WorkspaceProjects.gatherGitInfo({ now: args?.now })
                        const workspaceProjects = await this.WorkspaceProjects.list

                        console.log('\n' + chalk.bold('═══════════════════════════════════════════════════════════════'))
                        console.log(chalk.bold.cyan('                    WORKSPACE INFORMATION'))
                        console.log(chalk.bold('═══════════════════════════════════════════════════════════════\n'))

                        console.log(chalk.gray('Current Directory:'), chalk.white(process.cwd()))
                        console.log(chalk.gray('   Workspace Root:'), chalk.white(workspaceRootDir))
                        console.log(chalk.gray('  Workspace Name:'), chalk.white(workspaceConfig?.name || 'N/A'))
                        console.log(chalk.gray('    Workspace ID:'), chalk.white(workspaceConfig?.identifier || 'N/A') + '\n')

                        // Display config tree
                        console.log(chalk.bold.magenta('CONFIGURATION FILES'))
                        console.log(chalk.gray('───────────────────────────────────────────────────────────────\n'))

                        const printTree = (treeNode: any, prefix: string = '', isLast: boolean = true) => {
                            // Determine what to display
                            let displayPath: string
                            let formattedPath: string

                            if (treeNode.extendsValue) {
                                displayPath = treeNode.extendsValue

                                // Check if it's a relative path (starts with '.')
                                if (displayPath.startsWith('.')) {
                                    formattedPath = chalk.white(displayPath)
                                } else {
                                    // It's an npm package - highlight the package name
                                    let packageName: string
                                    let restOfPath: string

                                    if (displayPath.startsWith('@')) {
                                        // Scoped package: @org/name/rest
                                        const match = displayPath.match(/^(@[^/]+\/[^/]+)(\/.*)?$/)
                                        if (match) {
                                            packageName = match[1]
                                            restOfPath = match[2] || ''
                                        } else {
                                            packageName = displayPath
                                            restOfPath = ''
                                        }
                                    } else {
                                        // Unscoped package: name/rest
                                        const match = displayPath.match(/^([^/]+)(\/.*)?$/)
                                        if (match) {
                                            packageName = match[1]
                                            restOfPath = match[2] || ''
                                        } else {
                                            packageName = displayPath
                                            restOfPath = ''
                                        }
                                    }

                                    formattedPath = chalk.cyan(packageName) + chalk.white(restOfPath)
                                }
                            } else {
                                // Root config - show relative path
                                displayPath = relative(workspaceRootDir, treeNode.path)
                                formattedPath = chalk.white(displayPath)
                            }

                            // Compute relative path from workspace root for clickable terminal link
                            const relFilePath = relative(workspaceRootDir, treeNode.path)

                            const connector = isLast ? '└── ' : '├── '
                            console.log(chalk.gray(prefix + connector) + formattedPath + chalk.gray(' - ' + relFilePath))

                            if (treeNode.extends && treeNode.extends.length > 0) {
                                const childPrefix = prefix + (isLast ? '    ' : '│   ')
                                treeNode.extends.forEach((child: any, index: number) => {
                                    printTree(child, childPrefix, index === treeNode.extends.length - 1)
                                })
                            }
                        }

                        printTree(configTree)
                        console.log('')

                        // Display Projects
                        const projectNames = Object.keys(workspaceProjects)

                        if (projectNames.length > 0) {
                            console.log(chalk.bold.yellow('PROJECTS'))
                            console.log(chalk.gray('───────────────────────────────────────────────────────────────\n'))

                            for (const projectName of projectNames) {
                                const project = workspaceProjects[projectName]

                                if (project.missing) {
                                    console.log(chalk.bold.white(`  ${projectName}`) + chalk.red(' ✗ directory does not exist: ') + chalk.gray(project.sourceDir))
                                    continue
                                }

                                const hasDeployments = Object.keys(project.deployments).length > 0
                                const hasRepositories = Object.keys(project.repositories).length > 0

                                const gitOrigin = project.git && typeof project.git === 'object' && project.git.remotes?.origin
                                    ? chalk.gray(' - ' + project.git.remotes.origin)
                                    : ''
                                console.log(chalk.bold.white(`  ${projectName}`) + gitOrigin)
                                if (args?.full && project.identifier?.did) {
                                    console.log(chalk.gray('    did: ') + chalk.white(project.identifier.did))
                                }

                                const repoEntries = Object.entries(project.repositories)
                                const deploymentEntries = Object.entries(project.deployments)

                                // Pre-resolve all deployment statuses so we can count lines for tree connectors
                                const resolvedDeployments: { deploymentName: string, tree: any[], statusResults: Map<string, any> }[] = []

                                if (hasDeployments) {
                                    for (const [deploymentName, projectAliases] of deploymentEntries) {
                                        const tree = buildDependencyTree(projectAliases as Record<string, any>)
                                        const statusPromises = new Map<string, Promise<any>>()

                                        const collectStatusCalls = (node: any) => {
                                            const aliasConfig = node.config
                                            const providers = aliasConfig.providers || (aliasConfig.provider ? [aliasConfig.provider] : [])

                                            if (providers.length > 0) {
                                                const providerStatusPromises: Promise<any>[] = []

                                                for (const providerConfig of providers) {
                                                    const capsulePath = providerConfig.capsule
                                                    const config = { ...aliasConfig, provider: providerConfig }

                                                    const passive = !args?.now && !args?.full

                                                    if (capsulePath === 't44/caps/providers/vercel.com/ProjectDeployment') {
                                                        providerStatusPromises.push(this.Vercel.status({
                                                            config,
                                                            now: args?.now,
                                                            passive,
                                                            deploymentName
                                                        }).catch((error: any) => ({
                                                            projectName: deploymentName,
                                                            provider: 'vercel.com',
                                                            error: error.message,
                                                            rawDefinitionFilepaths: []
                                                        })))
                                                    } else if (capsulePath === 't44/caps/providers/bunny.net/ProjectDeployment') {
                                                        providerStatusPromises.push(this.Bunny.status({
                                                            config,
                                                            now: args?.now,
                                                            passive,
                                                            deploymentName
                                                        }).catch((error: any) => ({
                                                            projectName: deploymentName,
                                                            provider: 'bunny.net',
                                                            error: error.message,
                                                            rawDefinitionFilepaths: []
                                                        })))
                                                    } else if (capsulePath === 't44/caps/providers/dynadot.com/ProjectDeployment') {
                                                        providerStatusPromises.push(this.Dynadot.status({
                                                            config,
                                                            now: args?.now,
                                                            passive,
                                                            deploymentName
                                                        }).catch((error: any) => ({
                                                            projectName: deploymentName,
                                                            provider: 'dynadot.com',
                                                            error: error.message,
                                                            rawDefinitionFilepaths: []
                                                        })))
                                                    }
                                                }

                                                if (providerStatusPromises.length > 0) {
                                                    statusPromises.set(node.alias, Promise.all(providerStatusPromises))
                                                }
                                            }

                                            if (node.children.length > 0) {
                                                for (const child of node.children) {
                                                    collectStatusCalls(child)
                                                }
                                            }
                                        }

                                        for (const node of tree) {
                                            collectStatusCalls(node)
                                        }

                                        const statusResults = new Map<string, any>()
                                        await Promise.all(
                                            Array.from(statusPromises.entries()).map(async ([alias, promise]) => {
                                                const result = await promise
                                                // Filter out null results (passive mode, no cached data)
                                                const filtered = Array.isArray(result) ? result.filter((r: any) => r !== null) : result
                                                if (Array.isArray(filtered) && filtered.length > 0) {
                                                    statusResults.set(alias, filtered)
                                                } else if (!Array.isArray(filtered) && filtered !== null) {
                                                    statusResults.set(alias, filtered)
                                                }
                                            })
                                        )

                                        resolvedDeployments.push({ deploymentName, tree, statusResults })
                                    }
                                }

                                // Count total lines for tree connectors
                                let totalItems: number
                                if (args?.full) {
                                    totalItems = repoEntries.length + resolvedDeployments.length
                                } else {
                                    // In compact mode, each provider status is one line;
                                    // aliases with no cached status still get one line
                                    let compactDeploymentLines = 0
                                    for (const { tree, statusResults } of resolvedDeployments) {
                                        const countLines = (nodes: any[]): number => {
                                            let count = 0
                                            for (const node of nodes) {
                                                const statuses = statusResults.get(node.alias) || []
                                                count += statuses.length > 0 ? statuses.length : 1
                                                if (node.children.length > 0) count += countLines(node.children)
                                            }
                                            return count
                                        }
                                        compactDeploymentLines += countLines(tree)
                                    }
                                    totalItems = repoEntries.length + compactDeploymentLines
                                }

                                let itemIndex = 0

                                // Build reverse lookup: repoName -> catalog names
                                const catalogList = await this.ProjectCatalogs.list
                                const repoCatalogMap: Record<string, string[]> = {}
                                if (catalogList && typeof catalogList === 'object') {
                                    for (const [catalogName, catalogConfig] of Object.entries(catalogList)) {
                                        const repos = (catalogConfig as any)?.repositories
                                        if (repos && typeof repos === 'object') {
                                            for (const repoKey of Object.keys(repos)) {
                                                if (!repoCatalogMap[repoKey]) repoCatalogMap[repoKey] = []
                                                repoCatalogMap[repoKey].push(catalogName)
                                            }
                                        }
                                    }
                                }

                                // Display repositories for this project (first)
                                if (hasRepositories) {
                                    for (const [repoName, repoConfig] of repoEntries) {
                                        const typedConfig = repoConfig as any
                                        const sourceDirPath = typedConfig.sourceDir ? resolve(typedConfig.sourceDir) : 'N/A'
                                        let relPath = typedConfig.sourceDir ? relative(workspaceRootDir, sourceDirPath) : '.'
                                        if (relPath === '') relPath = '.'

                                        const providers = Array.isArray(typedConfig.providers)
                                            ? typedConfig.providers
                                            : typedConfig.provider
                                                ? [typedConfig.provider]
                                                : []

                                        const vendors = providers
                                            .map((p: any) => {
                                                const capsule = p.capsule || ''
                                                const vendorMatch = capsule.match(/\/caps\/providers\/([^\/]+)\//)
                                                return vendorMatch ? vendorMatch[1] : 'unknown'
                                            })
                                            .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)

                                        const vendor = vendors.length > 0 ? vendors.join(' & ') : 'unknown'

                                        const gitProvider = providers.find((p: any) =>
                                            p.capsule && p.capsule.includes('git-scm.com')
                                        )
                                        const origin = gitProvider?.config?.RepositorySettings?.origin || 'N/A'

                                        itemIndex++
                                        const connector = itemIndex === totalItems ? '└── ' : '├── '
                                        console.log(chalk.gray('    ' + connector) + chalk.blue('repository: ') + chalk.white(relPath) + chalk.gray(' | ') +
                                            chalk.cyan(repoName) + chalk.gray(' → ') +
                                            chalk.green(vendor) + chalk.gray(' | ') +
                                            chalk.yellow(origin))

                                        const catalogs = repoCatalogMap[repoName]
                                        if (catalogs && catalogs.length > 0) {
                                            const continueLine = itemIndex === totalItems ? '    ' : '│   '
                                            for (let ci = 0; ci < catalogs.length; ci++) {
                                                const catConnector = ci === catalogs.length - 1 ? '└── ' : '├── '
                                                console.log(chalk.gray('    ' + continueLine + catConnector) + chalk.gray('catalog: ') + chalk.yellow(catalogs[ci]))
                                            }
                                        }
                                    }
                                }

                                // Display deployments for this project (after repositories)
                                for (const { deploymentName, tree, statusResults } of resolvedDeployments) {
                                    if (args?.full) {
                                        // Full mode: verbose multi-line display
                                        itemIndex++
                                        const isLastItem = itemIndex === totalItems
                                        const connector = isLastItem ? '└── ' : '├── '
                                        const continueLine = isLastItem ? '    ' : '│   '

                                        console.log(chalk.gray('    ' + connector) + chalk.yellow('deployment: ') + chalk.white(deploymentName))

                                        const printNode = (node: any, indent: string, isLast: boolean) => {
                                            const aliasConfig = node.config
                                            const providers = aliasConfig.providers || (aliasConfig.provider ? [aliasConfig.provider] : [])

                                            if (providers.length === 0) {
                                                const nodeConnector = isLast ? '└── ' : '├── '
                                                console.log(chalk.gray(indent + nodeConnector) + chalk.cyan(node.alias) + chalk.gray(': ') + chalk.red('No provider capsule configured'))
                                                return
                                            }

                                            const sourceDirPath = aliasConfig.sourceDir ? resolve(aliasConfig.sourceDir) : 'N/A'
                                            const relPath = aliasConfig.sourceDir ? relative(workspaceRootDir, sourceDirPath) : 'N/A'

                                            const nodeConnector = isLast ? '└── ' : '├── '
                                            console.log(chalk.gray(indent + nodeConnector) + chalk.cyan(node.alias) + chalk.gray(' (') + chalk.white(relPath) + chalk.gray(')'))

                                            const detailIndent = indent + (isLast ? '    ' : '│   ')
                                            const statusArray = statusResults.get(node.alias) || []

                                            if (statusArray.length === 0) {
                                                console.log(chalk.gray(`${detailIndent}Status:  `) + chalk.gray('not deployed'))
                                            }

                                            const printStatus = (status: any) => {
                                                if (!status) {
                                                    console.log(chalk.yellow(`${detailIndent}Status method not available for this provider`))
                                                } else if (status.error) {
                                                    console.log(chalk.gray(`${detailIndent}Project: `) + chalk.magenta(status.projectName || 'N/A') + chalk.gray(' → ') + chalk.green(status.provider || 'unknown'))
                                                    console.log(chalk.red(`${detailIndent}Error:   ${status.error}`))
                                                    const isNotFoundError = status.error.toLowerCase().includes('not found')
                                                    if (!isNotFoundError && status.rawDefinitionFilepaths && status.rawDefinitionFilepaths.length > 0) {
                                                        status.rawDefinitionFilepaths.forEach((filepath: string) => {
                                                            console.log(chalk.gray(`${detailIndent}Fact:    `) + chalk.white(filepath))
                                                        })
                                                    }
                                                } else {
                                                    console.log(chalk.gray(`${detailIndent}Project: `) + chalk.magenta(status.projectName || 'N/A') + chalk.gray(' → ') + chalk.green(status.provider || 'unknown'))

                                                    const statusColor = status.status === 'READY' ? chalk.green :
                                                        status.status === 'ERROR' ? chalk.red :
                                                            status.status === 'DISABLED' ? chalk.red :
                                                                chalk.yellow
                                                    console.log(chalk.gray(`${detailIndent}Status:  `) + statusColor(status.status || 'UNKNOWN'))

                                                    if (status.publicUrl) {
                                                        console.log(chalk.gray(`${detailIndent}URL:     `) + chalk.blue(status.publicUrl))
                                                    }

                                                    if (status.createdAt) {
                                                        const date = new Date(status.createdAt)
                                                        const elapsed = formatElapsedTime(status.createdAt)
                                                        console.log(chalk.gray(`${detailIndent}Created: `) + chalk.white(date.toLocaleString()) + chalk.gray(` (${elapsed})`))
                                                    }

                                                    if (status.updatedAt) {
                                                        const date = new Date(status.updatedAt)
                                                        const elapsed = formatElapsedTime(status.updatedAt)
                                                        console.log(chalk.gray(`${detailIndent}Updated: `) + chalk.white(date.toLocaleString()) + chalk.gray(` (${elapsed})`))
                                                    }

                                                    if (status.usage) {
                                                        if (status.usage.storageBytes !== undefined) {
                                                            const storageMB = (status.usage.storageBytes / (1024 * 1024)).toFixed(2)
                                                            console.log(chalk.gray(`${detailIndent}Storage: `) + chalk.white(`${storageMB} MB`) + chalk.gray(` (${status.usage.filesCount || 0} files)`))
                                                        }

                                                        if (status.usage.bandwidthBytes !== undefined) {
                                                            const bandwidthGB = (status.usage.bandwidthBytes / (1024 * 1024 * 1024)).toFixed(2)
                                                            console.log(chalk.gray(`${detailIndent}Bandwidth: `) + chalk.white(`${bandwidthGB} GB this month`))
                                                        }

                                                        if (status.usage.charges !== undefined) {
                                                            console.log(chalk.gray(`${detailIndent}Charges: `) + chalk.white(`$${status.usage.charges.toFixed(2)} this month`))
                                                        }
                                                    }

                                                    if (status.providerPortalUrl) {
                                                        console.log(chalk.gray(`${detailIndent}Portal:  `) + chalk.blue(status.providerPortalUrl))
                                                    }

                                                    if (status.rawDefinitionFilepaths && status.rawDefinitionFilepaths.length > 0) {
                                                        status.rawDefinitionFilepaths.forEach((filepath: string) => {
                                                            console.log(chalk.gray(`${detailIndent}Fact:    `) + chalk.white(filepath))
                                                        })
                                                    }
                                                }
                                            }

                                            for (const status of statusArray) {
                                                printStatus(status)
                                            }

                                            if (node.children.length > 0) {
                                                const childIndent = indent + (isLast ? '    ' : '│   ')
                                                for (let i = 0; i < node.children.length; i++) {
                                                    printNode(node.children[i], childIndent, i === node.children.length - 1)
                                                }
                                            }
                                        }

                                        tree.forEach((node, index) => {
                                            printNode(node, '    ' + continueLine, index === tree.length - 1)
                                        })
                                    } else {
                                        // Compact mode: one line per provider status;
                                        // aliases with no cached status get a single 'not deployed' line
                                        const allLines: { status: any, alias: string }[] = []
                                        const collectAllLines = (nodes: any[]) => {
                                            for (const node of nodes) {
                                                const statusArray = statusResults.get(node.alias) || []
                                                if (statusArray.length > 0) {
                                                    for (const status of statusArray) {
                                                        allLines.push({ status, alias: node.alias })
                                                    }
                                                } else {
                                                    allLines.push({ status: null, alias: node.alias })
                                                }
                                                if (node.children.length > 0) {
                                                    collectAllLines(node.children)
                                                }
                                            }
                                        }
                                        collectAllLines(tree)

                                        for (const { status, alias } of allLines) {
                                            itemIndex++
                                            const isLastItem = itemIndex === totalItems
                                            const connector = isLastItem ? '└── ' : '├── '

                                            if (status === null) {
                                                // No cached data — extract provider name from config
                                                const aliasConfig = (tree.find((n: any) => n.alias === alias) || { config: {} }).config
                                                const providers = aliasConfig.providers || (aliasConfig.provider ? [aliasConfig.provider] : [])
                                                const vendorNames = providers.map((p: any) => {
                                                    const match = (p.capsule || '').match(/\/caps\/providers\/([^\/]+)\//)
                                                    return match ? match[1] : 'unknown'
                                                }).join(' & ')
                                                console.log(chalk.gray('    ' + connector +
                                                    alias + ' → ' +
                                                    vendorNames + ' [not deployed]'))
                                            } else if (status.error) {
                                                const providerName = status?.provider || 'unknown'
                                                const projName = status?.projectName || 'unknown'
                                                console.log(chalk.gray('    ' + connector +
                                                    deploymentName + ' → ' +
                                                    providerName + ' [' + projName + ']'))
                                            } else {
                                                const updatedAgo = status.updatedAt ? formatElapsedTime(status.updatedAt) : null
                                                const nameWithAge = chalk.yellow(deploymentName) +
                                                    (updatedAgo ? chalk.gray(' (') + chalk.magenta(updatedAgo) + chalk.gray(')') : '')

                                                const parts = [
                                                    nameWithAge + chalk.gray(' → ') +
                                                    chalk.green(status.provider) + chalk.gray(' [') + chalk.magenta(status.projectName) + chalk.gray(']')
                                                ]
                                                if (status.publicUrl) {
                                                    parts.push(chalk.blue(status.publicUrl))
                                                }
                                                if (status.providerPortalUrl) {
                                                    parts.push(chalk.gray('portal: ') + chalk.blue(status.providerPortalUrl))
                                                }
                                                console.log(chalk.gray('    ' + connector) + parts.join(chalk.gray(' | ')))
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            console.log(chalk.bold.yellow('PROJECTS:'), chalk.gray('None configured\n'))
                        }

                        console.log(chalk.bold('═══════════════════════════════════════════════════════════════\n'))
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
capsule['#'] = 't44/caps/WorkspaceInfo'



function buildDependencyTree(projectAliases: Record<string, any>): { alias: string, children: any[], config: any }[] {
    const aliasMap = new Map<string, { alias: string, children: any[], config: any }>()
    const roots: any[] = []

    // Create nodes for all aliases
    for (const [alias, config] of Object.entries(projectAliases)) {
        aliasMap.set(alias, { alias, children: [], config })
    }

    // Build parent-child relationships
    for (const [alias, config] of Object.entries(projectAliases)) {
        const node = aliasMap.get(alias)!
        const depends = config.depends || []

        if (depends.length === 0) {
            // No dependencies, this is a root
            roots.push(node)
        } else {
            // Add this node as a child to all its dependencies
            for (const dep of depends) {
                const parent = aliasMap.get(dep)
                if (parent) {
                    parent.children.push(node)
                }
            }
        }
    }

    return roots
}

function formatElapsedTime(timestamp: string | number): string {
    const now = Date.now()
    const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
    const elapsed = now - ts

    const days = Math.floor(elapsed / (1000 * 60 * 60 * 24))
    const hours = Math.floor(elapsed / (1000 * 60 * 60))
    const minutes = Math.floor(elapsed / (1000 * 60))
    const seconds = Math.floor(elapsed / 1000)

    if (days > 0) {
        return `${days}d`
    } else if (hours > 0) {
        return `${hours}h`
    } else if (minutes > 0) {
        return `${minutes}m`
    } else if (seconds > 0) {
        return `${seconds}s`
    } else {
        return 'now'
    }
}
