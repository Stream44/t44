#!/usr/bin/env bun test

export const testConfig = {
    group: 'vendor',
    runOnAll: false,
}

import * as bunTest from 'bun:test'
import { run } from 't44/workspace-rt'

const {
    test: { describe, it, expect },
    domains
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest',
                    options: {
                        '#': {
                            bunTest,
                            env: {
                                DYNADOT_API_KEY: { factReference: 't44/structs/providers/dynadot.com/WorkspaceConnectionConfig:apiKey' },
                                DYNADOT_API_SECRET: { factReference: 't44/structs/providers/dynadot.com/WorkspaceConnectionConfig:apiSecret' },
                                DYNADOT_API_KEY_TRANSACTION_SECRET: { factReference: 't44/structs/providers/dynadot.com/WorkspaceConnectionConfig:apiKeyTransactionSecret' }
                            }
                        }
                    }
                },
                domains: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-domains'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: 't44/caps/providers/dynadot.com/api-domains.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('Dynadot Domain API', function () {

    let domainName: string

    it('should return list of domains', async function () {

        const result = await domains.list()

        expect(result).toBeObject()
        expect(result.code).toBe(200)
        expect(result.data).toBeObject()
        expect(result.data.domain_info).toBeArray()
        expect(result.data.domain_info.length).toBeGreaterThan(0)

        domainName = result.data.domain_info[0].domain_name
    })

    it('should return domain info for a specific domain', async function () {

        const result = await domains.getInfo({ name: domainName })

        expect(result).toBeObject()
        expect(result.code).toBe(200)
        expect(result.data).toBeObject()
        expect(result.data.domain_info).toBeArray()
        expect(result.data.domain_info[0].domain_name).toBe(domainName)
    })

    it('should return DNS records for a specific domain', async function () {

        const result = await domains.getDns({ name: domainName })

        expect(result).toBeObject()
        expect(result.code).toBe(200)
        expect(result.data).toBeObject()
        expect(result.data.domain_info).toBeArray()
        expect(result.data.domain_info[0].glue_info).toBeObject()
    })

    it('should return nameservers for a specific domain', async function () {

        const result = await domains.getNameservers({ name: domainName })

        expect(result).toBeObject()
        expect(result.code).toBe(200)
    })

    it('should set an ANAME main domain record via v2 API', async function () {

        // v2 API supports ANAME record type (v1 did not)
        const setResult = await domains.setDns({
            name: domainName,
            records: [],
            mainDomains: [{ recordType: 'aname', value: 'example.com' }],
        })
        expect(setResult).toBeObject()
        expect(setResult.code).toBe(200)

        // Verify ANAME was set
        const verifyDns = await domains.getDns({ name: domainName })
        expect(verifyDns.code).toBe(200)
        const nsSettings = verifyDns.data.domain_info[0].glue_info?.name_server_settings
        const mainRecords = nsSettings?.main_domains || []
        const anameRecord = mainRecords.find((r: any) => r.record_type === 'aname')
        expect(anameRecord).toBeDefined()
        expect(anameRecord.value).toBe('example.com')

        // Clean up: restore with a simple A record
        await domains.setDns({
            name: domainName,
            records: [],
            mainDomains: [{ recordType: 'a', value: '127.0.0.1' }]
        })
    })

    it('should preserve existing records when using addToCurrent', async function () {

        // First set a baseline record
        const baseResult = await domains.setDns({
            name: domainName,
            records: [{ subdomain: 't44-test-preserve-base', record_type: 'cname', value: 'base.example.com' }],
            mainDomains: [{ recordType: 'a', value: '127.0.0.1' }]
        })
        expect(baseResult.code).toBe(200)

        // Add another record using addToCurrent — should preserve the base record
        const addResult = await domains.setDns({
            name: domainName,
            records: [{ subdomain: 't44-test-preserve-add', record_type: 'cname', value: 'add.example.com' }],
            mainDomains: [],
            addToCurrent: true
        })
        expect(addResult.code).toBe(200)

        // Verify both records exist
        const verifyDns = await domains.getDns({ name: domainName })
        const nsSettings = verifyDns.data.domain_info[0].glue_info?.name_server_settings
        const subDomains = nsSettings?.sub_domains || []
        const baseRecord = subDomains.find((r: any) => r.sub_host === 't44-test-preserve-base')
        const addRecord = subDomains.find((r: any) => r.sub_host === 't44-test-preserve-add')
        expect(baseRecord).toBeDefined()
        expect(addRecord).toBeDefined()

        // Clean up
        await domains.setDns({
            name: domainName,
            records: [],
            mainDomains: [{ recordType: 'a', value: '127.0.0.1' }]
        })
    })

    it('should set DNS records, verify, and restore original', async function () {

        const originalDns = await domains.getDns({ name: domainName })
        expect(originalDns).toBeObject()
        expect(originalDns.code).toBe(200)

        const nsSettings = originalDns.data.domain_info[0].glue_info?.name_server_settings
        const allOriginalRecords = nsSettings?.sub_domains || []
        // Filter out any leftover test records to avoid duplicate subhost error
        const originalRecords = allOriginalRecords.filter((r: any) => r.sub_host !== 't44-test-api-domains')

        const testCnameRecord = {
            record_type: 'cname',
            subdomain: 't44-test-api-domains',
            value: 'example.com'
        }

        const updatedRecords = [...originalRecords.map((r: any) => ({
            record_type: r.record_type.toLowerCase(),
            subdomain: r.sub_host,
            value: r.value
        })), testCnameRecord]

        const setResult = await domains.setDns({
            name: domainName,
            records: updatedRecords
        })
        expect(setResult).toBeObject()
        expect(setResult.code).toBe(200)

        const verifyDns = await domains.getDns({ name: domainName })
        expect(verifyDns).toBeObject()
        expect(verifyDns.code).toBe(200)
        const verifyNs = verifyDns.data.domain_info[0].glue_info?.name_server_settings
        const verifyRecords = verifyNs?.sub_domains || []
        expect(verifyRecords.length).toBe(originalRecords.length + 1)

        const foundNewRecord = verifyRecords.find((r: any) => r.sub_host === 't44-test-api-domains')
        expect(foundNewRecord).toBeDefined()
        expect(foundNewRecord.record_type).toBe('cname')
        expect(foundNewRecord.value).toBe('example.com')

        // Restore original DNS by overwriting with original records
        // If original had records, restore them; otherwise restore with just the original set
        const restoreRecords = originalRecords.length > 0
            ? originalRecords.map((r: any) => ({
                record_type: r.record_type.toLowerCase(),
                subdomain: r.sub_host,
                value: r.value
            }))
            : [] // empty sub_list will clear subdomain records when dns_main_list is provided

        const restoreResult = await domains.setDns({
            name: domainName,
            records: restoreRecords,
            // Provide a main domain record to satisfy the "at least one DNS record" requirement
            mainDomains: [{ recordType: 'a', value: '127.0.0.1' }]
        })
        expect(restoreResult).toBeObject()
        expect(restoreResult.code).toBe(200)
    })

})
