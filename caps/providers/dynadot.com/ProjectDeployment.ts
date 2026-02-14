
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
            '#t44/structs/providers/dynadot.com/DomainFact': {
                as: '$DomainFact'
            },
            '#t44/structs/ProjectDeploymentConfig': {
                as: '$ProjectDeploymentConfig'
            },
            '#': {
                domains: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-domains'
                },
                deploy: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { projectionDir, alias, config, workspaceProjectName }: { projectionDir: string, alias: string, config: any, workspaceProjectName?: string }) {
                        const domainConfig = config.provider.config.Domain
                        const domainName = domainConfig.name
                        const zones = domainConfig.zones || []

                        console.log(`Deploying DNS for '${domainName}' via Dynadot ...`)

                        const unsupportedApiTypes: string[] = []

                        // Process only the zones we define — resolve jit() values
                        const mainRecords: Array<{ recordType: string; value: string }> = []
                        const subdomainRecords: Array<{ subdomain: string; record_type: string; value: string }> = []

                        for (const zone of zones) {
                            let value = zone.value
                            if (typeof value === 'function') {
                                value = await value()
                            }

                            const recordType = zone.type || 'cname'
                            const subdomain = zone.subdomain || ''

                            if (unsupportedApiTypes.includes(recordType.toLowerCase())) {
                                console.log(`  ⚠ ${domainName} -> ${value} (${recordType.toUpperCase()}) — not settable via API`)
                                console.log(`    Set manually at: https://www.dynadot.com/account/domain/name/${domainName}`)
                                continue
                            }

                            if (subdomain === '' || subdomain === '@') {
                                mainRecords.push({ recordType, value })
                                console.log(`  ${domainName} -> ${value} (${recordType.toUpperCase()})`)
                            } else {
                                subdomainRecords.push({ subdomain, record_type: recordType, value })
                                console.log(`  ${subdomain}.${domainName} -> ${value} (${recordType.toUpperCase()})`)
                            }
                        }

                        if (mainRecords.length === 0 && subdomainRecords.length === 0) {
                            console.log(`  No DNS records to update.`)
                        } else {
                            console.log(`  Setting DNS records (${mainRecords.length} main, ${subdomainRecords.length} sub) ...`)
                            const setResult = await this.domains.setDns({
                                name: domainName,
                                records: subdomainRecords,
                                mainDomains: mainRecords,
                                addToCurrent: true
                            })

                            // v2 REST API returns { code: 200, message: "Success" }
                            const code = setResult?.code
                            const message = setResult?.message
                            if (code !== 200) {
                                console.log(`  DNS API response:`, JSON.stringify(setResult, null, 2))
                                throw new Error(`Failed to set DNS: ${message || JSON.stringify(setResult)}`)
                            }
                        }

                        console.log(`  DNS deployment complete: https://${domainName}`)

                        const statusResult = {
                            projectName: domainName,
                            provider: 'dynadot.com',
                            status: 'READY',
                            publicUrl: `https://${domainName}`
                        }
                        await this.$StatusFact.set(domainName, statusResult)
                    }
                },
                deprovision: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config }: { config: any }) {
                        const domainName = config.provider.config.Domain.name

                        console.log(`Deprovisioning DNS for '${domainName}' from Dynadot ...`)

                        // Get current DNS records
                        const currentDns = await this.domains.getDns({ name: domainName })
                        const nsSettings = currentDns?.data?.domain_info?.[0]?.glue_info?.name_server_settings || {}
                        const existingRecords = nsSettings?.sub_domains || []

                        // Remove CNAME for root domain
                        const filteredRecords = existingRecords.filter((r: any) => {
                            return !(r.sub_host === '' && r.record_type === 'cname')
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
                            await this.$DomainFact.delete(domainName)
                            await this.$StatusFact.delete(domainName)
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
                        const domainName = config.provider.config.Domain.name
                        const factName = deploymentName || domainName

                        if (!domainName) {
                            return {
                                projectName: factName || 'unknown',
                                provider: 'dynadot.com',
                                error: 'No domain name configured',
                                rawDefinitionFilepaths: []
                            }
                        }

                        const rawFilepaths = [
                            this.$DomainFact.getRelativeFilepath(domainName)
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

                        const dnsInfo = await this.domains.getDns({ name: domainName })
                        const nsSettings = dnsInfo?.data?.domain_info?.[0]?.glue_info?.name_server_settings || {}
                        const mainDomains = nsSettings.main_domains || []
                        const subDomains = nsSettings.sub_domains || []

                        // Check for main domain CNAME or ANAME record
                        const mainCname = mainDomains.find((r: any) => ['cname', 'aname'].includes(r.record_type?.toLowerCase()))

                        const result: Record<string, any> = {
                            projectName: factName,
                            provider: 'dynadot.com',
                            status: mainCname ? 'READY' : 'NOT_CONFIGURED',
                            publicUrl: mainCname ? `https://${domainName}` : undefined,
                            providerPortalUrl: `https://www.dynadot.com/account/domain/name/${domainName}`,
                            dnsRecords: { mainDomains, subDomains },
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
capsule['#'] = 't44/caps/providers/dynadot.com/ProjectDeployment'
