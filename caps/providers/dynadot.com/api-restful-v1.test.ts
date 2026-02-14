#!/usr/bin/env bun test

export const testConfig = {
    group: 'vendor',
    runOnAll: false,
}

import * as bunTest from 'bun:test'
import { run } from 't44/workspace-rt'

const {
    test: { describe, it, expect },
    api
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
                            }
                        }
                    }
                },
                api: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-restful-v1'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: 't44/caps/providers/dynadot.com/api-restful-v1.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('Dynadot REST API v1', function () {

    let domainName: string

    it('should list domains', async function () {

        const result = await api.call({
            method: 'GET',
            path: 'domains',
            operation: 'list'
        })

        expect(result).toBeObject()
        expect(result.code).toBe(200)
        expect(result.data).toBeObject()
        expect(result.data.domainInfo).toBeArray()
        expect(result.data.domainInfo.length).toBeGreaterThan(0)

        domainName = result.data.domainInfo[0].domainName
    })

    it('should get domain info for first domain', async function () {

        const result = await api.call({
            method: 'GET',
            path: `domains/${domainName}`,
            operation: 'info'
        })

        expect(result).toBeObject()
        expect(result.code).toBe(200)
        expect(result.data).toBeObject()
        expect(result.data.domainInfo).toBeArray()
        expect(result.data.domainInfo[0].domainName).toBe(domainName)
    })

    it('should set a TXT test record, verify, remove, and verify removal', async function () {

        // 1. Get current DNS to snapshot existing records
        const beforeDns = await api.call({
            method: 'GET',
            path: `domains/${domainName}`,
            operation: 'getDns'
        })
        expect(beforeDns.code).toBe(200)
        const nsBefore = beforeDns.data.domainInfo[0].glueInfo?.name_server_settings || {}
        const existingMainRecords = nsBefore.main_records || nsBefore.dns_main_list || []
        const existingSubs = nsBefore.sub_domains || []

        // 2. Add a TXT test record using add_dns_to_current_setting to preserve all existing records
        const setResult = await api.call({
            method: 'POST',
            path: `domains/${domainName}/records`,
            body: {
                add_dns_to_current_setting: true,
                dns_main_list: [],
                sub_list: [{
                    sub_host: 't44-v1-api-test',
                    record_type: 'txt',
                    record_value1: 'v1-test-value'
                }]
            },
            operation: 'setDns'
        })
        expect(setResult).toBeObject()
        expect(setResult.code).toBe(200)

        // 3. Get DNS again — verify TXT record was added and existing records preserved
        const afterSet = await api.call({
            method: 'GET',
            path: `domains/${domainName}`,
            operation: 'getDns'
        })
        expect(afterSet.code).toBe(200)
        const nsAfterSet = afterSet.data.domainInfo[0].glueInfo?.name_server_settings || {}
        const subsAfterSet = nsAfterSet.sub_domains || []

        const txtRecord = subsAfterSet.find((r: any) => r.sub_host === 't44-v1-api-test')
        expect(txtRecord).toBeDefined()
        expect(txtRecord.record_type).toBe('txt')
        expect(txtRecord.value).toBe('v1-test-value')

        // Verify existing subdomain records are still present
        for (const orig of existingSubs) {
            const found = subsAfterSet.find((r: any) => r.sub_host === orig.sub_host && r.record_type === orig.record_type)
            expect(found).toBeDefined()
        }

        // 4. Remove the TXT record by re-setting all records WITHOUT the test record
        const subsWithoutTest = subsAfterSet
            .filter((r: any) => r.sub_host !== 't44-v1-api-test')
            .map((r: any) => ({
                sub_host: r.sub_host,
                record_type: r.record_type,
                record_value1: r.value,
            }))

        const mainRecordsForRestore = (nsAfterSet.main_records || nsAfterSet.dns_main_list || []).map((r: any) => ({
            record_type: r.record_type,
            record_value1: r.value || r.record_value1,
            ...(r.record_value2 ? { record_value2: r.record_value2 } : {}),
        }))

        // Need at least one dns_main_list entry
        const dnsMainList = mainRecordsForRestore.length > 0
            ? mainRecordsForRestore
            : [{ record_type: 'a', record_value1: '127.0.0.1' }]

        const removeResult = await api.call({
            method: 'POST',
            path: `domains/${domainName}/records`,
            body: {
                dns_main_list: dnsMainList,
                sub_list: subsWithoutTest,
            },
            operation: 'setDns'
        })
        expect(removeResult).toBeObject()
        expect(removeResult.code).toBe(200)

        // 5. Get DNS again — verify TXT record is gone and original records restored
        const afterRemove = await api.call({
            method: 'GET',
            path: `domains/${domainName}`,
            operation: 'getDns'
        })
        expect(afterRemove.code).toBe(200)
        const nsAfterRemove = afterRemove.data.domainInfo[0].glueInfo?.name_server_settings || {}
        const subsAfterRemove = nsAfterRemove.sub_domains || []

        const removedRecord = subsAfterRemove.find((r: any) => r.sub_host === 't44-v1-api-test')
        expect(removedRecord).toBeUndefined()

        // Verify original subdomain records are still present
        for (const orig of existingSubs) {
            const found = subsAfterRemove.find((r: any) => r.sub_host === orig.sub_host && r.record_type === orig.record_type)
            expect(found).toBeDefined()
        }
    })

})
