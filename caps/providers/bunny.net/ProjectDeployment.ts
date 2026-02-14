
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
            '#t44/structs/ProjectDeploymentFact': {
                as: '$StatusFact'
            },
            '#t44/structs/providers/bunny.net/StorageZoneFact': {
                as: '$StorageZoneFact'
            },
            '#t44/structs/providers/bunny.net/PullZoneFact': {
                as: '$PullZoneFact'
            },
            '#t44/structs/ProjectDeploymentConfig': {
                as: '$ProjectDeploymentConfig'
            },
            '#': {
                WorkspacePrompt: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspacePrompt'
                },
                storage: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-storage'
                },
                pull: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-pull'
                },
                deploy: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { projectionDir, alias, config, workspaceProjectName }: { projectionDir: string, alias: string, config: any, workspaceProjectName?: string }) {
                        let projectName = config.provider.config.ProjectSettings.name
                        const region = config.provider.config.ProjectSettings.region || 'LA'

                        console.log(`Deploying '${projectName}' to Bunny.net CDN ...`)

                        console.log(`Ensuring storage zone '${projectName}' exists ...`)

                        let storageZone: any
                        let retryCount = 0
                        const maxRetries = 3

                        while (retryCount < maxRetries) {
                            try {
                                storageZone = await this.storage.ensureZone({
                                    name: projectName,
                                    region: region
                                })
                                break
                            } catch (error: any) {
                                const errorMessage = error.message || ''

                                // Check if it's a zone name conflict error
                                if (errorMessage.includes('storagezone.name_taken') ||
                                    errorMessage.includes('storage zone is currently being deleted')) {

                                    const chalk = (await import('chalk')).default

                                    console.log(chalk.yellow(`\n⚠️  WARNING: Storage zone name '${projectName}' is already taken.\n`))
                                    console.log(chalk.gray(`   Deleted zones may remain permanently reserved.`))
                                    console.log(chalk.gray(`   Please choose a different project name.\n`))

                                    try {
                                        const newProjectName = await this.WorkspacePrompt.input({
                                            message: 'Enter a new project name:',
                                            defaultValue: `${projectName}-${Date.now()}`,
                                            validate: (input: string) => {
                                                if (!input || input.trim().length === 0) {
                                                    return 'Project name cannot be empty'
                                                }
                                                if (!/^[a-z0-9-]+$/.test(input)) {
                                                    return 'Project name must contain only lowercase letters, numbers, and hyphens'
                                                }
                                                return true
                                            }
                                        })

                                        // Update the project name in config
                                        projectName = newProjectName
                                        config.provider.config.ProjectSettings.name = newProjectName

                                        // Save the updated config back to the workspace config
                                        if (workspaceProjectName) {
                                            const configPath = ['deployments', workspaceProjectName, alias, 'provider', 'config', 'ProjectSettings', 'name']
                                            await this.$ProjectDeploymentConfig.setConfigValue(configPath, newProjectName)
                                        }

                                        console.log(chalk.green(`\n✓ Updated project name to: ${newProjectName}\n`))

                                        retryCount++
                                        continue

                                    } catch (promptError: any) {
                                        if (promptError.message?.includes('SIGINT') || promptError.message?.includes('force closed')) {
                                            console.log(chalk.red('\nABORTED\n'))
                                            throw new Error('Deployment aborted by user')
                                        }
                                        throw promptError
                                    }
                                } else {
                                    throw error
                                }
                            }
                        }

                        if (!storageZone) {
                            throw new Error('Failed to create storage zone after multiple attempts')
                        }

                        console.log(`Storage Zone ID: ${storageZone.Id}`)

                        console.log(`Ensuring pull zone '${projectName}' exists ...`)
                        const pullZone = await this.pull.ensureZone({
                            name: projectName,
                            originUrl: `https://${storageZone.StorageHostname}/${projectName}`,
                            storageZoneId: storageZone.Id
                        })
                        console.log(`Pull Zone ID: ${pullZone.Id}`)

                        const publicUrl = pullZone.Hostnames?.[0]?.Value
                            ? `https://${pullZone.Hostnames[0].Value}`
                            : `https://${projectName}.b-cdn.net`
                        console.log(`Public URL: ${publicUrl}`)

                        // Derive upload region from the actual StorageHostname returned by the API.
                        // Edge SSD zones use 'storage.bunnycdn.com' (no region prefix).
                        // Standard zones use '<region>.storage.bunnycdn.com'.
                        const storageHostname: string = storageZone.StorageHostname || ''
                        const hostnameMatch = storageHostname.match(/^([^.]+)\.storage\.bunnycdn\.com$/)
                        const uploadRegion = (hostnameMatch && hostnameMatch[1] !== 'storage') ? hostnameMatch[1] : undefined

                        console.log(`Uploading files from ${config.sourceDir} ...`)
                        await this.storage.uploadDirectory({
                            sourceDirectory: config.sourceDir,
                            destinationDirectory: '',
                            storageZoneName: projectName,
                            password: storageZone.Password,
                            region: uploadRegion,
                            cleanDestination: 'avoid-deletes'
                        })
                        console.log(`Files uploaded successfully`)

                        console.log(`Purging CDN cache ...`)
                        await this.pull.purgeZone(pullZone.Id)
                        console.log(`Cache purged`)

                        console.log(`Deployment complete: ${publicUrl}`)

                        const deploymentName = workspaceProjectName || projectName
                        const statusResult = {
                            projectName: deploymentName,
                            provider: 'bunny.net',
                            status: 'READY',
                            publicUrl
                        }
                        await this.$StatusFact.set(deploymentName, statusResult)
                    }
                },
                deprovision: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config }: { config: any }) {
                        const projectName = config.provider.config.ProjectSettings.name

                        console.log(`Deprovisioning '${projectName}' from Bunny.net ...`)

                        try {
                            const pullZones = await this.pull.listZones({ search: projectName })
                            const zones = pullZones.Items || pullZones
                            const pullZone = zones.find((zone: any) => zone.Name === projectName)

                            if (pullZone) {
                                console.log(`Deleting pull zone '${projectName}' (ID: ${pullZone.Id}) ...`)
                                await this.pull.deleteZone(pullZone.Id)
                                console.log(`Pull zone deleted`)
                            } else {
                                console.log(`Pull zone '${projectName}' not found`)
                            }
                        } catch (error: any) {
                            console.log(`Error deleting pull zone: ${error.message}`)
                        }

                        try {
                            const storageZones = await this.storage.listZones({ search: projectName })
                            const storageZone = storageZones.find((zone: any) => zone.Name === projectName)

                            if (storageZone) {
                                console.log(`Deleting storage zone '${projectName}' (ID: ${storageZone.Id}) ...`)
                                await this.storage.deleteZone(storageZone.Id)
                                console.log(`Storage zone deleted`)
                            } else {
                                console.log(`Storage zone '${projectName}' not found`)
                            }
                        } catch (error: any) {
                            console.log(`Error deleting storage zone: ${error.message}`)
                        }

                        // Delete fact files
                        console.log(`Deleting fact files ...`)
                        try {
                            await this.$StorageZoneFact.delete(projectName)
                            await this.$PullZoneFact.delete(projectName)
                            await this.$StatusFact.delete(projectName)
                            console.log(`Fact files deleted`)
                        } catch (error: any) {
                            console.log(`Error deleting fact files: ${error.message}`)
                        }

                        console.log(`Deprovision complete`)
                    }
                },
                status: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, now, passive, deploymentName }: { config: any; now?: boolean; passive?: boolean; deploymentName?: string }) {
                        const projectName = config.provider.config.ProjectSettings.name
                        const factName = deploymentName || projectName

                        if (!projectName) {
                            return {
                                projectName: factName || 'unknown',
                                provider: 'bunny.net',
                                error: 'No project name configured',
                                rawDefinitionFilepaths: []
                            }
                        }

                        // Raw fact filepaths that this status depends on (specific zone files)
                        const rawFilepaths = [
                            this.$StorageZoneFact.getRelativeFilepath(projectName),
                            this.$PullZoneFact.getRelativeFilepath(projectName)
                        ]

                        // Try to get cached status if not forcing refresh
                        if (!now) {
                            const cached = await this.$StatusFact.get(factName, rawFilepaths)
                            if (cached) {
                                return cached.data
                            }
                        }

                        // In passive mode, don't call the provider if no cache exists
                        if (passive) {
                            return null
                        }

                        const storageZones = await this.storage.listZones({ search: projectName })
                        const storageZoneMatch = storageZones.find((zone: any) => zone.Name === projectName)

                        if (!storageZoneMatch) {
                            // Write placeholder fact files so cache can be hit on subsequent calls
                            await this.$StorageZoneFact.set(projectName, { notFound: true, name: projectName })
                            await this.$PullZoneFact.set(projectName, { notFound: true, name: projectName })
                            const errorResult = {
                                projectName: factName,
                                provider: 'bunny.net',
                                error: 'Storage zone not found',
                                rawDefinitionFilepaths: rawFilepaths
                            }
                            await this.$StatusFact.set(factName, errorResult)
                            return errorResult
                        }

                        const pullZones = await this.pull.listZones({ search: projectName })
                        const zones = pullZones.Items || pullZones
                        const pullZoneMatch = zones.find((zone: any) => zone.Name === projectName)

                        if (!pullZoneMatch) {
                            // Write placeholder fact file so cache can be hit on subsequent calls
                            await this.$PullZoneFact.set(projectName, { notFound: true, name: projectName })
                            const errorResult = {
                                projectName: factName,
                                provider: 'bunny.net',
                                error: 'Pull zone not found',
                                rawDefinitionFilepaths: rawFilepaths
                            }
                            await this.$StatusFact.set(factName, errorResult)
                            return errorResult
                        }

                        // Fetch full zone details (this also saves the individual fact files)
                        const storageZone = await this.storage.getZone(storageZoneMatch.Id)
                        const pullZone = await this.pull.getZone(pullZoneMatch.Id)

                        const publicUrl = pullZone.Hostnames?.[0]?.Value
                            ? `https://${pullZone.Hostnames[0].Value}`
                            : `https://${projectName}.b-cdn.net`

                        const result: Record<string, any> = {
                            projectName: factName,
                            provider: 'bunny.net',
                            status: pullZone.Enabled ? 'READY' : 'DISABLED',
                            publicUrl: publicUrl,
                            providerProjectId: `storage:${storageZone.Id}|pull:${pullZone.Id}`,
                            providerPortalUrl: `https://dash.bunny.net/cdn/${pullZone.Id}/general/hostnames`,
                            updatedAt: storageZone.DateModified ? new Date(storageZone.DateModified + 'Z').toISOString() : undefined,
                            usage: {
                                storageBytes: storageZone.StorageUsed,
                                filesCount: storageZone.FilesStored,
                                bandwidthBytes: pullZone.MonthlyBandwidthUsed,
                                charges: pullZone.MonthlyCharges
                            },
                            rawDefinitionFilepaths: rawFilepaths
                        }

                        await this.$StatusFact.set(factName, result)

                        return result
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
capsule['#'] = 't44/caps/providers/bunny.net/ProjectDeployment'
