

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {

    // https://www.dynadot.com/domain/api-commands
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#t44/structs/providers/dynadot.com/DomainFact.v0': {
                as: '$DomainFact'
            },
            '#': {

                api: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api.v0'
                },

                list: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any) {
                        const result = await this.api.call({
                            command: 'list_domain',
                            operation: 'list'
                        });

                        await this.$DomainFact.set('domains-list', 'list', 'ListDomainInfoResponse', result);

                        return result;
                    }
                },

                getInfo: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { name: string }) {
                        const result = await this.api.call({
                            command: 'domain_info',
                            params: {
                                domain: options.name
                            },
                            operation: 'info'
                        });

                        await this.$DomainFact.set('domains', options.name, 'DomainInfoResponse', result);

                        return result;
                    }
                },

                getDns: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { name: string }) {
                        const result = await this.api.call({
                            command: 'get_dns',
                            params: {
                                domain: options.name
                            },
                            operation: 'getDns'
                        });

                        await this.$DomainFact.set('dns', options.name, 'GetDnsResponse', result);

                        return result;
                    }
                },

                getNameservers: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { name: string }) {
                        const result = await this.api.call({
                            command: 'get_ns',
                            params: {
                                domain: options.name
                            },
                            operation: 'getNameservers'
                        });

                        await this.$DomainFact.set('nameservers', options.name, 'GetNsResponse', result);

                        return result;
                    }
                },

                setDns: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { name: string; records: any[]; mainDomain?: { recordType: string; value: string } }) {
                        const params: Record<string, any> = {
                            domain: options.name
                        };

                        // Set main domain record if provided (for root domain A/AAAA/CNAME)
                        // Note: Dynadot API requires index suffix (e.g., main_record_type0, main_record0)
                        if (options.mainDomain) {
                            params['main_record_type0'] = options.mainDomain.recordType;
                            params['main_record0'] = options.mainDomain.value;
                        }

                        options.records.forEach((record, index) => {
                            const recordIndex = index + 1;

                            if (record.subdomain !== undefined) {
                                params[`subdomain${recordIndex}`] = record.subdomain;
                            }
                            if (record.record_type) {
                                params[`sub_record_type${recordIndex}`] = record.record_type;
                            }
                            if (record.value !== undefined) {
                                params[`sub_record${recordIndex}`] = record.value;
                            }
                        });

                        return await this.api.call({
                            command: 'set_dns2',
                            params,
                            operation: 'setDns'
                        });
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
capsule['#'] = 't44/caps/providers/dynadot.com/api-domains.v0'

