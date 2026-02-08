#!/usr/bin/env bun test

export const testConfig = {
    group: 'vendor',
    runOnAll: false,
}

import * as bunTest from 'bun:test'
import { run } from '../../../workspace-rt'

const {
    test: { describe, it, expect },
    domains
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest.v0',
                    options: {
                        '#': {
                            bunTest,
                            env: {
                                DYNADOT_API_KEY: { factReference: 't44/structs/providers/dynadot.com/WorkspaceConnectionConfig.v0:apiKey' }
                            }
                        }
                    }
                },
                domains: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-domains.v0'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: 't44/caps/providers/dynadot.com/api-domains.v0.test'
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
        expect(result.ListDomainInfoResponse).toBeObject()
        expect(result.ListDomainInfoResponse.MainDomains).toBeArray()
        expect(result.ListDomainInfoResponse.MainDomains.length).toBeGreaterThan(0)

        domainName = result.ListDomainInfoResponse.MainDomains[0].Name
    })

    it('should return domain info for a specific domain', async function () {

        const result = await domains.getInfo({ name: domainName })

        expect(result).toBeObject()
        expect(result.DomainInfoResponse).toBeObject()
        expect(result.DomainInfoResponse.DomainInfo).toBeObject()
        expect(result.DomainInfoResponse.DomainInfo.Name).toBe(domainName)
    })

    it('should return DNS records for a specific domain', async function () {

        const result = await domains.getDns({ name: domainName })

        expect(result).toBeObject()
        expect(result.GetDnsResponse).toBeObject()
    })

    it('should return nameservers for a specific domain', async function () {

        const result = await domains.getNameservers({ name: domainName })

        expect(result).toBeObject()
        expect(result.GetNsResponse).toBeObject()
    })

    it('should set DNS records, verify, and restore original', async function () {

        const originalDns = await domains.getDns({ name: domainName })
        expect(originalDns).toBeObject()
        expect(originalDns.GetDnsResponse).toBeObject()

        const originalRecords = originalDns.GetDnsResponse.GetDns?.NameServerSettings?.SubDomains || []

        const testCnameRecord = {
            record_type: 'cname',
            subdomain: 't44-test-api-domains',
            value: 'example.com'
        }

        const updatedRecords = [...originalRecords.map((r: any) => ({
            record_type: r.RecordType.toLowerCase(),
            subdomain: r.Subhost,
            value: r.Value
        })), testCnameRecord]

        const setResult = await domains.setDns({
            name: domainName,
            records: updatedRecords
        })
        expect(setResult).toBeObject()
        expect(setResult.SetDnsResponse.Status).toBe('success')

        const verifyDns = await domains.getDns({ name: domainName })
        expect(verifyDns).toBeObject()
        expect(verifyDns.GetDnsResponse).toBeObject()
        const verifyRecords = verifyDns.GetDnsResponse.GetDns?.NameServerSettings?.SubDomains || []
        expect(verifyRecords.length).toBe(originalRecords.length + 1)

        const foundNewRecord = verifyRecords.find((r: any) => r.Subhost === 't44-test-api-domains')
        expect(foundNewRecord).toBeDefined()
        expect(foundNewRecord.RecordType).toBe('CNAME')
        expect(foundNewRecord.Value).toBe('example.com')

        const restoreRecords = originalRecords.map((r: any) => ({
            record_type: r.RecordType.toLowerCase(),
            subdomain: r.Subhost,
            value: r.Value
        }))

        const restoreResult = await domains.setDns({
            name: domainName,
            records: restoreRecords
        })
        expect(restoreResult).toBeObject()

        const finalDns = await domains.getDns({ name: domainName })
        expect(finalDns).toBeObject()
        const finalRecords = finalDns.GetDnsResponse.GetDns?.NameServerSettings?.SubDomains || []
        expect(finalRecords.length).toBe(originalRecords.length)
    })

})
