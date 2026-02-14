

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {

    // Dynadot REST API v2
    // Docs: https://www.dynadot.com/domain/api-document
    // All operations use v2 (snake_case response: domain_info, glue_info, etc.)
    // v2 supports ANAME record type
    // DNS records: POST domains/{name}/records (body: { dns_main_list, sub_list, ttl, add_dns_to_current_setting })
    // DNS read: embedded in domain info via glue_info.name_server_settings
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#t44/structs/providers/dynadot.com/DomainFact': {
                as: '$DomainFact'
            },
            '#': {

                api: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-restful-v2'
                },

                list: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any) {
                        const result = await this.api.call({
                            method: 'GET',
                            path: 'domains',
                            operation: 'list'
                        });

                        await this.$DomainFact.set('list', result);

                        return result;
                    }
                },

                getInfo: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { name: string }) {
                        const result = await this.api.call({
                            method: 'GET',
                            path: `domains/${options.name}`,
                            operation: 'info'
                        });

                        await this.$DomainFact.set(options.name, result);

                        return result;
                    }
                },

                getDns: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { name: string }) {
                        // DNS info is embedded in domain info via glueInfo.name_server_settings
                        const result = await this.api.call({
                            method: 'GET',
                            path: `domains/${options.name}`,
                            operation: 'getDns'
                        });

                        await this.$DomainFact.set(options.name, result);

                        return result;
                    }
                },

                getNameservers: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { name: string }) {
                        const result = await this.api.call({
                            method: 'GET',
                            path: `domains/${options.name}/nameservers`,
                            operation: 'getNameservers'
                        });

                        await this.$DomainFact.set(options.name, result);

                        return result;
                    }
                },

                setDns: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        name: string;
                        records: any[];
                        mainDomain?: { recordType: string; value: string; value2?: string };
                        mainDomains?: Array<{ recordType: string; value: string; value2?: string }>;
                        addToCurrent?: boolean;
                    }) {
                        const mainDomains = options.mainDomains || (options.mainDomain ? [options.mainDomain] : []);

                        // v1 REST API body format per docs:
                        // { dns_main_list, sub_list, ttl, add_dns_to_current_setting }
                        const body: Record<string, any> = {}

                        if (options.addToCurrent) {
                            body.add_dns_to_current_setting = true
                        }

                        // dns_main_list is required by the v2 API (at least one entry)
                        if (mainDomains.length > 0) {
                            body.dns_main_list = mainDomains.map(r => {
                                const record: any = {
                                    record_type: r.recordType,
                                    record_value1: r.value,
                                }
                                if (r.value2 !== undefined) {
                                    record.record_value2 = r.value2
                                }
                                return record
                            })
                        } else {
                            // Fetch current main records to preserve them
                            const current = await this.api.call({
                                method: 'GET',
                                path: `domains/${options.name}`,
                                operation: 'getDns'
                            })
                            const ns = current?.data?.domain_info?.[0]?.glue_info?.name_server_settings || {}
                            const existingMain = ns.main_domains || []
                            body.dns_main_list = existingMain.length > 0
                                ? existingMain.map((r: any) => ({
                                    record_type: r.record_type,
                                    record_value1: r.value || r.record_value1,
                                    ...(r.record_value2 ? { record_value2: r.record_value2 } : {}),
                                }))
                                : [{ record_type: 'a', record_value1: '127.0.0.1' }]
                        }

                        if (options.records.length > 0) {
                            body.sub_list = options.records.map(r => ({
                                sub_host: r.subdomain,
                                record_type: r.record_type,
                                record_value1: r.value,
                            }))
                        }

                        // POST /restful/v2/domains/{domain_name}/records
                        return await this.api.call({
                            method: 'POST',
                            path: `domains/${options.name}/records`,
                            body,
                            operation: 'setDns'
                        })
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
capsule['#'] = 't44/caps/providers/dynadot.com/api-domains'

