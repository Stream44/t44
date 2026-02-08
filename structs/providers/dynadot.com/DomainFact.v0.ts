
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#t44/caps/OpenApiSchema.v0': {
                as: 'schema',
                options: {
                    '#': {
                        definitions: {
                            'ListDomainInfoResponse': {
                                type: 'object',
                                properties: {
                                    ListDomainInfoResponse: {
                                        type: 'object',
                                        properties: {
                                            MainDomains: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        Name: { type: 'string' },
                                                        Id: { type: 'integer' },
                                                        Locked: { type: 'boolean' },
                                                        Expired: { type: 'boolean' },
                                                        Expiration: { type: 'integer' },
                                                        UdrpLocked: { type: 'boolean' },
                                                        Privacy: { type: 'boolean' },
                                                        Whois: { type: 'boolean' },
                                                        Renew: { type: 'boolean' },
                                                        RenewOption: { type: 'string' }
                                                    },
                                                    required: ['Name']
                                                }
                                            }
                                        },
                                        required: ['MainDomains']
                                    }
                                },
                                required: ['ListDomainInfoResponse']
                            },
                            'DomainInfoResponse': {
                                type: 'object',
                                properties: {
                                    DomainInfoResponse: {
                                        type: 'object',
                                        properties: {
                                            DomainInfo: {
                                                type: 'object',
                                                properties: {
                                                    Name: { type: 'string' },
                                                    Id: { type: 'integer' },
                                                    Locked: { type: 'boolean' },
                                                    Expired: { type: 'boolean' },
                                                    Expiration: { type: 'integer' },
                                                    UdrpLocked: { type: 'boolean' },
                                                    Privacy: { type: 'boolean' },
                                                    Whois: { type: 'boolean' },
                                                    Renew: { type: 'boolean' },
                                                    RenewOption: { type: 'string' },
                                                    NameServers: {
                                                        type: 'array',
                                                        items: { type: 'string' }
                                                    }
                                                },
                                                required: ['Name']
                                            }
                                        },
                                        required: ['DomainInfo']
                                    }
                                },
                                required: ['DomainInfoResponse']
                            },
                            'GetDnsResponse': {
                                type: 'object',
                                properties: {
                                    GetDnsResponse: {
                                        type: 'object',
                                        properties: {
                                            GetDns: {
                                                type: 'object',
                                                properties: {
                                                    NameServerSettings: {
                                                        type: 'object',
                                                        properties: {
                                                            SubDomains: {
                                                                type: 'array',
                                                                items: {
                                                                    type: 'object',
                                                                    properties: {
                                                                        subdomain: { type: 'string' },
                                                                        record_type: { type: 'string' },
                                                                        value: { type: 'string' }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                required: ['GetDnsResponse']
                            },
                            'GetNsResponse': {
                                type: 'object',
                                properties: {
                                    GetNsResponse: {
                                        type: 'object',
                                        properties: {
                                            NameServers: {
                                                type: 'array',
                                                items: { type: 'string' }
                                            }
                                        }
                                    }
                                },
                                required: ['GetNsResponse']
                            }
                        }
                    }
                }
            },
            '#': {
                capsuleName: {
                    type: CapsulePropertyTypes.Literal,
                    value: capsule['#']
                },
                origin: {
                    type: CapsulePropertyTypes.Literal,
                    value: 'dynadot.com',
                },
            }
        }
    }, {
        extendsCapsule: 't44/caps/WorkspaceEntityFact.v0',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/structs/providers/dynadot.com/DomainFact.v0'
