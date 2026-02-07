
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
            '#@stream44.studio/t44/structs/ProjectDeploymentFact.v0': {
                as: '$StatusFact'
            },
            '#@stream44.studio/t44/structs/providers/dynadot.com/DomainFact.v0': {
                as: '$DomainFact'
            },
            '#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0': {
                as: '$ProjectDeploymentConfig'
            },
            '#': {
                domains: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-domains.v0'
                },
                deploy: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { projectionDir, alias, config, workspaceProjectName }: { projectionDir: string, alias: string, config: any, workspaceProjectName?: string }) {
                        const domainConfig = config.provider.config.Domain
                        const domainName = domainConfig.name
                        const zones = domainConfig.zones || []

                        console.log(`Deploying DNS for '${domainName}' via Dynadot ...`)

                        // Process zones - resolve any jit() functions
                        let mainDomainRecord: { recordType: string; value: string } | undefined
                        const subdomainRecords: Array<{ subdomain: string; record_type: string; value: string }> = []

                        for (const zone of zones) {
                            let value = zone.value
                            // Resolve jit() function if value is a function
                            if (typeof value === 'function') {
                                value = await value()
                            }

                            const recordType = zone.type?.toLowerCase() || 'cname'
                            const subdomain = zone.subdomain || ''

                            if (subdomain === '' || subdomain === '@') {
                                // Root domain record
                                mainDomainRecord = {
                                    recordType,
                                    value
                                }
                                console.log(`  ${domainName} -> ${value} (${recordType.toUpperCase()})`)
                            } else {
                                // Subdomain record
                                subdomainRecords.push({
                                    subdomain,
                                    record_type: recordType,
                                    value
                                })
                                console.log(`  ${subdomain}.${domainName} -> ${value} (${recordType.toUpperCase()})`)
                            }
                        }

                        console.log(`Setting DNS records ...`)
                        const setResult = await this.domains.setDns({
                            name: domainName,
                            records: subdomainRecords,
                            mainDomain: mainDomainRecord
                        })

                        if (setResult?.SetDnsResponse?.Status !== 'success') {
                            throw new Error(`Failed to set DNS: ${setResult?.SetDnsResponse?.Error || 'Unknown error'}`)
                        }

                        console.log(`DNS deployment complete: https://${domainName}`)

                        // Write deployment status with updatedAt
                        const statusResult = {
                            projectName: domainName,
                            provider: 'dynadot.com',
                            status: 'READY',
                            publicUrl: `https://${domainName}`,
                            '#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0': {
                                updatedAt: new Date().toISOString()
                            }
                        }
                        await this.$StatusFact.set('ProjectDeploymentStatus', domainName, 'ProjectDeploymentStatus', statusResult)
                    }
                },
                deprovision: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config }: { config: any }) {
                        const domainName = config.provider.config.Domain.name

                        console.log(`Deprovisioning DNS for '${domainName}' from Dynadot ...`)

                        // Get current DNS records
                        const currentDns = await this.domains.getDns({ name: domainName })
                        const existingRecords = currentDns?.GetDnsResponse?.GetDns?.NameServerSettings?.SubDomains || []

                        // Remove CNAME for root domain
                        const filteredRecords = existingRecords.filter((r: any) => {
                            return !(r.subdomain === '' && r.record_type === 'cname')
                        })

                        if (filteredRecords.length !== existingRecords.length) {
                            console.log(`Removing root CNAME record ...`)
                            await this.domains.setDns({
                                name: domainName,
                                records: filteredRecords
                            })
                            console.log(`Root CNAME record removed`)
                        } else {
                            console.log(`No root CNAME record found to remove`)
                        }

                        // Delete fact files
                        console.log(`Deleting fact files ...`)
                        try {
                            await this.$DomainFact.delete('dns', domainName)
                            await this.$StatusFact.delete('ProjectDeploymentStatus', domainName)
                            console.log(`Fact files deleted`)
                        } catch (error: any) {
                            console.log(`Error deleting fact files: ${error.message}`)
                        }

                        console.log(`Deprovision complete`)
                    }
                },
                status: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, now, passive }: { config: any; now?: boolean; passive?: boolean }) {
                        const domainName = config.provider.config.Domain.name

                        if (!domainName) {
                            return {
                                projectName: domainName || 'unknown',
                                provider: 'dynadot.com',
                                error: 'No domain name configured',
                                rawDefinitionFilepaths: []
                            }
                        }

                        const rawFilepaths = [
                            this.$DomainFact.getRelativeFilepath('dns', domainName)
                        ]

                        // Try to get cached status if not forcing refresh
                        if (!now) {
                            const cached = await this.$StatusFact.get('ProjectDeploymentStatus', domainName, 'ProjectDeploymentStatus', rawFilepaths)
                            if (cached) {
                                return cached.data
                            }
                        }

                        // In passive mode, don't call the provider if no cache exists
                        if (passive) {
                            return null
                        }

                        const dnsInfo = await this.domains.getDns({ name: domainName })
                        const nsSettings = dnsInfo?.GetDnsResponse?.GetDns?.NameServerSettings || {}
                        const mainDomains = nsSettings.MainDomains || []
                        const subDomains = nsSettings.SubDomains || []

                        // Check for main domain CNAME record
                        const mainCname = mainDomains.find((r: any) => r.RecordType?.toLowerCase() === 'cname')

                        // Preserve updatedAt from existing cached status
                        const existingStatus = await this.$StatusFact.get('ProjectDeploymentStatus', domainName, 'ProjectDeploymentStatus')
                        const existingMeta = existingStatus?.data?.['#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0']

                        const result: Record<string, any> = {
                            projectName: domainName,
                            provider: 'dynadot.com',
                            status: mainCname ? 'READY' : 'NOT_CONFIGURED',
                            publicUrl: mainCname ? `https://${domainName}` : undefined,
                            providerPortalUrl: `https://www.dynadot.com/account/domain/name/${domainName}`,
                            dnsRecords: { mainDomains, subDomains },
                            rawDefinitionFilepaths: rawFilepaths
                        }

                        if (existingMeta?.updatedAt) {
                            result['#@stream44.studio/t44/structs/ProjectDeploymentConfig.v0'] = {
                                updatedAt: existingMeta.updatedAt
                            }
                        }

                        await this.$StatusFact.set('ProjectDeploymentStatus', domainName, 'ProjectDeploymentStatus', result)

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
capsule['#'] = '@stream44.studio/t44/caps/providers/dynadot.com/ProjectDeployment.v0'
