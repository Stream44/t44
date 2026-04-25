import chalk from 'chalk'
import { join, resolve } from 'path'
import { readFile, access } from 'fs/promises'
import { load as parseYaml } from 'js-yaml'

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
            '#@stream44.studio/t44/structs/HomeRegistryConfig': {
                as: '$HomeRegistryConfig'
            },
            '#@stream44.studio/t44/structs/WorkspaceKeyConfig': {
                as: '$WorkspaceKeyConfig'
            },
            '#@stream44.studio/t44/structs/ProjectRackConfig': {
                as: '$ProjectRackConfig'
            },
            '#@stream44.studio/t44/structs/RootKeyConfig': {
                as: '$RootKeyConfig'
            },
            '#@stream44.studio/t44/structs/SigningKeyConfig': {
                as: '$SigningKeyConfig'
            },
            '#@stream44.studio/t44/structs/WorkspaceProjectsConfig': {
                as: '$WorkspaceProjectsConfig'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceConfig'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {
                        if (args?.at) {
                            await this._initAt(args.at)
                        } else if (args?.from) {
                            await this._initFrom(args.from)
                        } else {
                            console.log(chalk.green('You have successfully initialized a Terminal 44 Workspace!'))
                        }
                    }
                },
                _isWorkspaceInitialized: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, dirPath: string): Promise<boolean> {
                        const configPath = join(dirPath, '.workspace/workspace.yaml')
                        try {
                            await access(configPath)
                        } catch {
                            return false
                        }
                        // The scaffolding file exists. Check if it has been fully initialized
                        // (workspace-rt.ts creates a bare extends-only file for any 'init' command).
                        try {
                            const content = await readFile(configPath, 'utf-8')
                            const config = parseYaml(content) as Record<string, any>
                            const wsConfig = config?.['#@stream44.studio/t44/structs/WorkspaceConfig']
                            return !!(wsConfig?.name || wsConfig?.identifier)
                        } catch {
                            return false
                        }
                    }
                },
                _initFrom: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, fromPath: string): Promise<void> {
                        const resolvedFrom = resolve(fromPath)
                        const sourceConfigPath = join(resolvedFrom, '.workspace/workspace.yaml')

                        let sourceContent: string
                        try {
                            sourceContent = await readFile(sourceConfigPath, 'utf-8')
                        } catch (err: any) {
                            if (err?.code === 'ENOENT') {
                                console.error(chalk.red(`\n✗ No workspace config found at: ${sourceConfigPath}\n`))
                                console.error(chalk.red(`  Make sure the --from path points to an initialized workspace root directory.\n`))
                                process.exit(1)
                            }
                            throw err
                        }

                        const sourceConfig = parseYaml(sourceContent) as Record<string, any>

                        const homeRegistryConfigKey = '#@stream44.studio/t44/structs/HomeRegistryConfig'
                        const keyConfigKey = '#@stream44.studio/t44/structs/WorkspaceKeyConfig'
                        const rackConfigKey = '#@stream44.studio/t44/structs/ProjectRackConfig'
                        const rootKeyConfigKey = '#@stream44.studio/t44/structs/RootKeyConfig'
                        const signingKeyConfigKey = '#@stream44.studio/t44/structs/SigningKeyConfig'

                        const sourceHomeRegistry = sourceConfig[homeRegistryConfigKey]
                        const sourceKeyConfig = sourceConfig[keyConfigKey]
                        const sourceRackConfig = sourceConfig[rackConfigKey]
                        const sourceRootKeyConfig = sourceConfig[rootKeyConfigKey]
                        const sourceSigningKeyConfig = sourceConfig[signingKeyConfigKey]

                        // Copy home registry config (homeDir, rootDir, identifier)
                        if (sourceHomeRegistry) {
                            if (sourceHomeRegistry.homeDir) {
                                await this.$HomeRegistryConfig.setConfigValue(['homeDir'], sourceHomeRegistry.homeDir)
                            }
                            if (sourceHomeRegistry.rootDir) {
                                await this.$HomeRegistryConfig.setConfigValue(['rootDir'], sourceHomeRegistry.rootDir)
                            }
                            if (sourceHomeRegistry.identifier) {
                                await this.$HomeRegistryConfig.setConfigValue(['identifier'], sourceHomeRegistry.identifier)
                            }
                            console.log(chalk.green('   ✓ Copied home registry configuration from source workspace'))
                        }

                        // Copy workspace key config (name, identifier)
                        if (sourceKeyConfig) {
                            if (sourceKeyConfig.name) {
                                await this.$WorkspaceKeyConfig.setConfigValue(['name'], sourceKeyConfig.name)
                            }
                            if (sourceKeyConfig.identifier) {
                                await this.$WorkspaceKeyConfig.setConfigValue(['identifier'], sourceKeyConfig.identifier)
                            }
                            console.log(chalk.green('   ✓ Copied workspace key configuration from source workspace'))
                        }

                        // Copy project rack config (name, identifier)
                        if (sourceRackConfig) {
                            if (sourceRackConfig.name) {
                                await this.$ProjectRackConfig.setConfigValue(['name'], sourceRackConfig.name)
                            }
                            if (sourceRackConfig.identifier) {
                                await this.$ProjectRackConfig.setConfigValue(['identifier'], sourceRackConfig.identifier)
                            }
                            console.log(chalk.green('   ✓ Copied project rack configuration from source workspace'))
                        }

                        // Copy root key config (name, privateKeyPath, publicKey, keyFingerprint)
                        if (sourceRootKeyConfig) {
                            for (const [k, v] of Object.entries(sourceRootKeyConfig)) {
                                await this.$RootKeyConfig.setConfigValue([k], v)
                            }
                            console.log(chalk.green('   ✓ Copied root key configuration from source workspace'))
                        }

                        // Copy signing key config (name, privateKeyPath, publicKey, keyFingerprint)
                        if (sourceSigningKeyConfig) {
                            for (const [k, v] of Object.entries(sourceSigningKeyConfig)) {
                                await this.$SigningKeyConfig.setConfigValue([k], v)
                            }
                            console.log(chalk.green('   ✓ Copied signing key configuration from source workspace'))
                        }

                        console.log(chalk.green('\nYou have successfully initialized a Terminal 44 Workspace from an existing workspace!'))
                    }
                },
                _coreProjects: {
                    type: CapsulePropertyTypes.Literal,
                    value: ['t44.sh', 'encapsulate.dev']
                },
                _generatePackageJson: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, workspaceName: string, projectNames: string[]): string {
                        const workspaces = projectNames.flatMap(name => [
                            `${name}/packages/*`
                        ])
                        // Only add devDependencies for core packages that were actually cloned
                        const devDependencies: Record<string, string> = {}
                        if (projectNames.includes('encapsulate.dev')) {
                            devDependencies['@stream44.studio/encapsulate'] = 'workspace:*'
                        }
                        if (projectNames.includes('t44.sh')) {
                            devDependencies['@stream44.studio/t44'] = 'workspace:*'
                        }
                        const pkg: Record<string, any> = {
                            name: workspaceName,
                            version: '0.1.0',
                            private: true,
                            workspaces
                        }
                        if (Object.keys(devDependencies).length > 0) {
                            pkg.devDependencies = devDependencies
                        }
                        return JSON.stringify(pkg, null, 4) + '\n'
                    }
                },
                _generateTsconfigJson: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, projectNames: string[]): string {
                        const references = projectNames.map(name => ({ path: `./${name}` }))
                        const tsconfig = {
                            exclude: ['node_modules/.bun'],
                            references
                        }
                        return JSON.stringify(tsconfig, null, 4) + '\n'
                    }
                },
                _generateTsconfigPathsJson: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, projectNames: string[]): string {
                        const paths: Record<string, string[]> = {}
                        for (const name of projectNames) {
                            // Convert project dir name to package scope
                            // e.g. 't44.sh' -> '@t44.sh/*', 'encapsulate.dev' -> '@encapsulate.dev/*'
                            const scope = `@${name}/*`
                            paths[scope] = [`./${name}/packages/*`]
                        }
                        const tsconfig = {
                            compilerOptions: {
                                baseUrl: '.',
                                paths
                            }
                        }
                        return JSON.stringify(tsconfig, null, 4) + '\n'
                    }
                },
                _bootstrapWorkspaceFiles: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, targetDir: string, workspaceName: string, projectNames: string[]): Promise<void> {
                        const { writeFile: writeFileAsync } = await import('fs/promises')

                        // Generate and write package.json
                        const pkgContent = this._generatePackageJson(workspaceName, projectNames)
                        await writeFileAsync(join(targetDir, 'package.json'), pkgContent)
                        console.log(chalk.green('   ✓ Created package.json'))

                        // Generate and write tsconfig.json
                        const tsconfigContent = this._generateTsconfigJson(projectNames)
                        await writeFileAsync(join(targetDir, 'tsconfig.json'), tsconfigContent)
                        console.log(chalk.green('   ✓ Created tsconfig.json'))

                        // Generate and write tsconfig.paths.json
                        const tsconfigPathsContent = this._generateTsconfigPathsJson(projectNames)
                        await writeFileAsync(join(targetDir, 'tsconfig.paths.json'), tsconfigPathsContent)
                        console.log(chalk.green('   ✓ Created tsconfig.paths.json'))
                    }
                },
                _cloneCoreProjects: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, targetDir: string, sourceProjectsConfig: Record<string, any>, rackConfig: any, homeRegistryConfig: any, targetConfig: Record<string, any>): Promise<string[]> {
                        const { $ } = await import('bun')
                        const projectsConfigKey = '#@stream44.studio/t44/structs/WorkspaceProjectsConfig'
                        targetConfig[projectsConfigKey] = targetConfig[projectsConfigKey] || {}
                        targetConfig[projectsConfigKey].projects = targetConfig[projectsConfigKey].projects || {}

                        // Load projects.json catalog to resolve project name → DID
                        const rackBaseDir = join(
                            homeRegistryConfig.rootDir,
                            '@stream44.studio~t44~structs~ProjectRack',
                            rackConfig.name,
                            '@stream44.studio~t44~caps~ProjectRepository'
                        )
                        let catalog: Record<string, string> = {}
                        try {
                            const catalogContent = await readFile(join(rackBaseDir, 'projects.json'), 'utf-8')
                            catalog = JSON.parse(catalogContent)
                        } catch {
                            // No catalog file yet
                        }

                        const clonedProjects: string[] = []

                        for (const projectName of this._coreProjects) {
                            const projectDid = catalog[projectName]
                            if (!projectDid) {
                                console.log(chalk.yellow(`   ⚠ Core project '${projectName}' not found in project rack catalog — skipping`))
                                continue
                            }

                            const rackRepoDir = join(rackBaseDir, projectDid)
                            const projectTargetDir = join(targetDir, projectName)

                            // Clone from rack repo
                            console.log(chalk.cyan(`   Cloning '${projectName}' from project rack...`))
                            const result = await $`git clone ${rackRepoDir} ${projectTargetDir}`.nothrow().quiet()
                            if (result.exitCode !== 0) {
                                console.error(chalk.red(`   ✗ Failed to clone '${projectName}': ${result.stderr.toString()}`))
                                continue
                            }

                            // Add project config to workspace.yaml
                            targetConfig[projectsConfigKey].projects[projectName] = {
                                sourceDir: projectTargetDir,
                                git: {
                                    firstCommitHash: '',
                                    createdAt: new Date().toISOString(),
                                    firstCommitAuthor: { name: '', email: '' },
                                    remotes: {
                                        '@stream44.studio/t44/caps/ProjectRack': rackRepoDir
                                    }
                                }
                            }

                            clonedProjects.push(projectName)
                            console.log(chalk.green(`   ✓ Cloned '${projectName}'`))
                        }

                        return clonedProjects
                    }
                },
                _hasWorkspaceConfig: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, dirPath: string): Promise<boolean> {
                        const configPath = join(dirPath, '.workspace/workspace.yaml')
                        try {
                            await access(configPath)
                        } catch {
                            return false
                        }
                        // Check if the config has any t44 struct keys (not just the bare extends scaffold)
                        try {
                            const content = await readFile(configPath, 'utf-8')
                            const config = parseYaml(content) as Record<string, any>
                            const structKeys = Object.keys(config).filter(k => k.startsWith('#@stream44.studio/t44/structs/'))
                            return structKeys.length > 0
                        } catch {
                            return false
                        }
                    }
                },
                _initAt: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, atPath: string): Promise<void> {
                        const resolvedAt = resolve(atPath)

                        // Check if target already contains a workspace (any config, not just full init)
                        if (await this._hasWorkspaceConfig(resolvedAt)) {
                            console.error(chalk.red(`\n✗ A workspace already exists at: ${resolvedAt}\n`))
                            console.error(chalk.red(`  The target directory already contains workspace configuration.\n`))
                            process.exit(1)
                        }

                        // Read current workspace config as the source
                        const sourceWorkspaceRoot = this.WorkspaceConfig.workspaceRootDir
                        const sourceConfigPath = join(sourceWorkspaceRoot, '.workspace/workspace.yaml')

                        let sourceContent: string
                        try {
                            sourceContent = await readFile(sourceConfigPath, 'utf-8')
                        } catch (err: any) {
                            if (err?.code === 'ENOENT') {
                                console.error(chalk.red(`\n✗ No workspace config found at: ${sourceConfigPath}\n`))
                                console.error(chalk.red(`  The current workspace does not appear to be initialized.\n`))
                                process.exit(1)
                            }
                            throw err
                        }

                        const sourceConfig = parseYaml(sourceContent) as Record<string, any>

                        // Ensure target directory and workspace scaffold exist
                        const { mkdir, writeFile } = await import('fs/promises')
                        const targetWorkspaceDir = join(resolvedAt, '.workspace')
                        await mkdir(targetWorkspaceDir, { recursive: true })
                        const targetConfigPath = join(targetWorkspaceDir, 'workspace.yaml')
                        const workspaceYaml = `extends:\n  - '@stream44.studio/t44/workspace.yaml'\n`
                        await writeFile(targetConfigPath, workspaceYaml)

                        const homeRegistryConfigKey = '#@stream44.studio/t44/structs/HomeRegistryConfig'
                        const keyConfigKey = '#@stream44.studio/t44/structs/WorkspaceKeyConfig'
                        const rackConfigKey = '#@stream44.studio/t44/structs/ProjectRackConfig'
                        const rootKeyConfigKey = '#@stream44.studio/t44/structs/RootKeyConfig'
                        const signingKeyConfigKey = '#@stream44.studio/t44/structs/SigningKeyConfig'

                        const sourceHomeRegistry = sourceConfig[homeRegistryConfigKey]
                        const sourceKeyConfig = sourceConfig[keyConfigKey]
                        const sourceRackConfig = sourceConfig[rackConfigKey]
                        const sourceRootKeyConfig = sourceConfig[rootKeyConfigKey]
                        const sourceSigningKeyConfig = sourceConfig[signingKeyConfigKey]

                        // Read the scaffolding config and merge source values into it
                        const jsYaml = await import('js-yaml')
                        const dumpYaml = jsYaml.dump
                        const targetContent = await readFile(targetConfigPath, 'utf-8')
                        const targetConfig = parseYaml(targetContent) as Record<string, any>

                        // Copy home registry config (homeDir, rootDir, identifier)
                        if (sourceHomeRegistry) {
                            targetConfig[homeRegistryConfigKey] = targetConfig[homeRegistryConfigKey] || {}
                            if (sourceHomeRegistry.homeDir) targetConfig[homeRegistryConfigKey].homeDir = sourceHomeRegistry.homeDir
                            if (sourceHomeRegistry.rootDir) targetConfig[homeRegistryConfigKey].rootDir = sourceHomeRegistry.rootDir
                            if (sourceHomeRegistry.identifier) targetConfig[homeRegistryConfigKey].identifier = sourceHomeRegistry.identifier
                            console.log(chalk.green('   ✓ Copied home registry configuration to new workspace'))
                        }

                        // Copy workspace key config (name, identifier)
                        if (sourceKeyConfig) {
                            targetConfig[keyConfigKey] = targetConfig[keyConfigKey] || {}
                            if (sourceKeyConfig.name) targetConfig[keyConfigKey].name = sourceKeyConfig.name
                            if (sourceKeyConfig.identifier) targetConfig[keyConfigKey].identifier = sourceKeyConfig.identifier
                            console.log(chalk.green('   ✓ Copied workspace key configuration to new workspace'))
                        }

                        // Copy project rack config (name, identifier)
                        if (sourceRackConfig) {
                            targetConfig[rackConfigKey] = targetConfig[rackConfigKey] || {}
                            if (sourceRackConfig.name) targetConfig[rackConfigKey].name = sourceRackConfig.name
                            if (sourceRackConfig.identifier) targetConfig[rackConfigKey].identifier = sourceRackConfig.identifier
                            console.log(chalk.green('   ✓ Copied project rack configuration to new workspace'))
                        }

                        // Copy root key config (name, privateKeyPath, publicKey, keyFingerprint)
                        if (sourceRootKeyConfig) {
                            targetConfig[rootKeyConfigKey] = { ...sourceRootKeyConfig }
                            console.log(chalk.green('   ✓ Copied root key configuration to new workspace'))
                        }

                        // Copy signing key config (name, privateKeyPath, publicKey, keyFingerprint)
                        if (sourceSigningKeyConfig) {
                            targetConfig[signingKeyConfigKey] = { ...sourceSigningKeyConfig }
                            console.log(chalk.green('   ✓ Copied signing key configuration to new workspace'))
                        }

                        // Pre-set workspace name from target directory basename
                        // so t44 init won't prompt for it
                        const { basename } = await import('path')
                        const workspaceName = basename(resolvedAt)
                        const workspaceConfigKey = '#@stream44.studio/t44/structs/WorkspaceConfig'
                        targetConfig[workspaceConfigKey] = targetConfig[workspaceConfigKey] || {}
                        targetConfig[workspaceConfigKey].name = workspaceName

                        // Clone core projects (t44.sh, encapsulate.dev) from the rack
                        const sourceProjectsConfig = sourceConfig['#@stream44.studio/t44/structs/WorkspaceProjectsConfig']
                        const clonedProjects = await this._cloneCoreProjects(
                            resolvedAt, sourceProjectsConfig, sourceRackConfig, sourceHomeRegistry, targetConfig
                        )

                        await writeFile(targetConfigPath, dumpYaml(targetConfig, { lineWidth: -1 }))

                        // Create package.json, tsconfig.json, tsconfig.paths.json
                        await this._bootstrapWorkspaceFiles(resolvedAt, workspaceName, clonedProjects)

                        const { $ } = await import('bun')

                        // Run bun install so node_modules resolves @stream44.studio/t44 for workspace.yaml extends
                        if (clonedProjects.length > 0) {
                            console.log(chalk.cyan('\nInstalling dependencies...\n'))
                            const installResult = await $`bun install`
                                .cwd(resolvedAt)
                                .env({ ...process.env })
                                .nothrow()
                            if (installResult.exitCode !== 0) {
                                console.error(chalk.red(`\n✗ Failed to install dependencies at: ${resolvedAt}`))
                                console.error(chalk.red(`  ${installResult.stderr.toString()}\n`))
                                process.exit(1)
                            }
                            console.log(chalk.green('   ✓ Dependencies installed\n'))
                        }

                        // Run t44 init in the target workspace to complete setup
                        console.log(chalk.cyan(`Completing workspace initialization at: ${resolvedAt}\n`))

                        const initResult = await $`${process.argv[0]} ${process.argv[1]} init`
                            .cwd(resolvedAt)
                            .env({ ...process.env })
                            .nothrow()

                        if (initResult.exitCode !== 0) {
                            console.error(chalk.red(`\n✗ Failed to complete workspace initialization at: ${resolvedAt}`))
                            console.error(chalk.red(`  ${initResult.stderr.toString()}\n`))
                            process.exit(1)
                        }

                        console.log(chalk.green(`\nYou have successfully initialized a Terminal 44 Workspace at: ${resolvedAt}\n`))
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
capsule['#'] = '@stream44.studio/t44/caps/WorkspaceInit'
