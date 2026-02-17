#!/usr/bin/env bun test

export const testConfig = {
    group: 'vendor',
    runOnAll: false,
}

import * as bunTest from 'bun:test'
import { run } from 't44/workspace-rt'

const {
    test: { describe, it, expect },
    pull,
    storage
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
                                BUNNY_API_KEY: { factReference: 't44/structs/providers/bunny.net/WorkspaceConnectionConfig:apiKey' }
                            }
                        }
                    }
                },
                pull: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-pull'
                },
                storage: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-storage'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: 't44/caps/providers/bunny.net/api-pull.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('Bunny Pull Zone API', function () {

    it('listZones()', async function () {

        const result = await pull.listZones()

        expect(result).toBeArray()
    })

    describe('Pull Zone Lifecycle', function () {

        let zoneId: number
        let zoneName: string
        const originUrl = 'https://example.com'

        it('ensureZone()', async function () {
            const timestamp = Date.now()
            zoneName = `test-t44-pull-${timestamp}`

            const zone = await pull.ensureZone({
                name: zoneName,
                originUrl: originUrl
            })

            expect(zone).toBeObject()
            expect(zone.Id).toBeNumber()
            expect(zone.Name).toBe(zoneName)
            expect(zone.OriginUrl).toBe(originUrl)

            zoneId = zone.Id
        })

        it('getZone()', async function () {
            if (!zoneId) {
                console.log('\n   ⚠️  Skipping test: precondition not met (zoneId not set)')
                expect(true).toBe(true)
                return
            }

            const retrievedZone = await pull.getZone(zoneId)

            expect(retrievedZone).toBeObject()
            expect(retrievedZone.Id).toBe(zoneId)
            expect(retrievedZone.Name).toBe(zoneName)
            expect(retrievedZone.OriginUrl).toBe(originUrl)
        })

        it('deleteZone()', async function () {
            if (!zoneId) {
                console.log('\n   ⚠️  Skipping test: precondition not met (zoneId not set)')
                expect(true).toBe(true)
                return
            }

            const deleteResult = await pull.deleteZone(zoneId)

            expect(deleteResult).toBeDefined()
        })

        it('cleanup - delete all test zones', async function () {
            const result = await pull.listZones()
            const allZones = result.Items || result
            expect(allZones).toBeArray()

            const testZones = allZones.filter((zone: any) =>
                zone.Name && zone.Name.match(/^test-t44-pull-\d+$/)
            )

            for (const zone of testZones) {
                await pull.deleteZone(zone.Id)
            }
        })

    })

    describe('CDN Workflow with Storage and Pull Zone', function () {

        let storageZoneId: number
        let storageZoneName: string
        let storagePassword: string
        let storageHostname: string
        let pullZoneId: number
        let pullZoneName: string
        let pullZoneHostname: string
        let fileName: string

        it('ensureStorageZone()', async function () {
            const timestamp = Date.now()
            storageZoneName = `test-t44-cdn-${timestamp}`

            const zone = await storage.ensureZone({
                name: storageZoneName,
                region: 'LA'
            })

            expect(zone).toBeObject()
            expect(zone.Id).toBeNumber()
            expect(zone.Name).toBe(storageZoneName)
            expect(zone.Password).toBeDefined()

            storageZoneId = zone.Id
            storagePassword = zone.Password
        })

        it('getStorageZone()', async function () {
            if (!storageZoneId) {
                console.log('\n   ⚠️  Skipping test: precondition not met (storageZoneId not set)')
                expect(true).toBe(true)
                return
            }

            const retrievedZone = await storage.getZone(storageZoneId)

            expect(retrievedZone).toBeObject()
            expect(retrievedZone.StorageHostname).toBeDefined()

            storageHostname = retrievedZone.StorageHostname
        })

        it('ensurePullZone() tied to storage zone', async function () {
            if (!storageHostname || !storageZoneName || !storageZoneId) {
                console.log('\n   ⚠️  Skipping test: precondition not met (storage zone not configured)')
                expect(true).toBe(true)
                return
            }

            const timestamp = Date.now()
            pullZoneName = `test-t44-cdn-pull-${timestamp}`

            const zone = await pull.ensureZone({
                name: pullZoneName,
                originUrl: `https://${storageHostname}/${storageZoneName}`,
                storageZoneId: storageZoneId
            })

            expect(zone).toBeObject()
            expect(zone.Id).toBeNumber()
            expect(zone.Name).toBe(pullZoneName)
            expect(zone.Hostnames).toBeDefined()
            expect(zone.Hostnames).toBeArray()
            expect(zone.Hostnames.length).toBeGreaterThan(0)

            pullZoneId = zone.Id
            pullZoneHostname = zone.Hostnames[0].Value

            await new Promise(resolve => setTimeout(resolve, 2500))
        })

        it('uploadFile() to storage zone', async function () {
            if (!storageZoneName || !storageHostname || !storagePassword) {
                console.log('\n   ⚠️  Skipping test: precondition not met (storage zone not configured)')
                expect(true).toBe(true)
                return
            }

            const timestamp = Date.now()
            fileName = `test-cdn-${timestamp}.txt`
            const fileContent = 'Version 1: Initial content'

            await storage.uploadFile({
                storageZoneName: storageZoneName,
                storageHostname: storageHostname,
                fileName: fileName,
                data: fileContent,
                password: storagePassword
            })
        })

        it('fetch file from pull zone public hostname', async function () {
            if (!pullZoneHostname || !fileName) {
                console.log('\n   ⚠️  Skipping test: precondition not met (pullZoneHostname or fileName not set)')
                expect(true).toBe(true)
                return
            }

            const fileUrl = `https://${pullZoneHostname}/${fileName}`

            const response = await fetch(fileUrl)
            expect(response.ok).toBe(true)

            const content = await response.text()
            expect(content).toBe('Version 1: Initial content')
        })

        it('uploadFile() with updated content', async function () {
            if (!storageZoneName || !storageHostname || !fileName || !storagePassword) {
                console.log('\n   ⚠️  Skipping test: precondition not met')
                expect(true).toBe(true)
                return
            }

            const fileContent = 'Version 2: Updated content'

            await storage.uploadFile({
                storageZoneName: storageZoneName,
                storageHostname: storageHostname,
                fileName: fileName,
                data: fileContent,
                password: storagePassword
            })
        })

        it('uploadDirectory() to storage zone', async function () {
            if (!storageZoneName || !storagePassword) {
                console.log('\n   ⚠️  Skipping test: precondition not met (storageZoneName or storagePassword not set)')
                expect(true).toBe(true)
                return
            }

            const { mkdtemp, writeFile, rm } = await import('fs/promises')
            const { join } = await import('path')
            const { tmpdir } = await import('os')

            const tempDir = await mkdtemp(join(tmpdir(), 'bunny-upload-test-'))

            await writeFile(join(tempDir, 'file1.txt'), 'Directory upload test file 1')
            await writeFile(join(tempDir, 'file2.txt'), 'Directory upload test file 2')
            await writeFile(join(tempDir, 'file3.html'), '<html><body>Test HTML</body></html>')

            await storage.uploadDirectory({
                sourceDirectory: tempDir,
                destinationDirectory: 'test-dir',
                storageZoneName: storageZoneName,
                password: storagePassword,
                region: 'la'
            })

            await rm(tempDir, { recursive: true, force: true })
        })

        it('verify directory files are accessible from pull zone', async function () {
            if (!pullZoneHostname) {
                console.log('\n   ⚠️  Skipping test: precondition not met (pullZoneHostname not set)')
                expect(true).toBe(true)
                return
            }

            const file1Url = `https://${pullZoneHostname}/test-dir/file1.txt`
            const file2Url = `https://${pullZoneHostname}/test-dir/file2.txt`
            const file3Url = `https://${pullZoneHostname}/test-dir/file3.html`

            const response1 = await fetch(file1Url)
            expect(response1.ok).toBe(true)
            const content1 = await response1.text()
            expect(content1).toBe('Directory upload test file 1')

            const response2 = await fetch(file2Url)
            expect(response2.ok).toBe(true)
            const content2 = await response2.text()
            expect(content2).toBe('Directory upload test file 2')

            const response3 = await fetch(file3Url)
            expect(response3.ok).toBe(true)
            const content3 = await response3.text()
            expect(content3).toBe('<html><body>Test HTML</body></html>')
        })

        it('purgeZone() to clear cache', async function () {
            if (!pullZoneId) {
                console.log('\n   ⚠️  Skipping test: precondition not met (pullZoneId not set)')
                expect(true).toBe(true)
                return
            }

            await pull.purgeZone(pullZoneId)

            await new Promise(resolve => setTimeout(resolve, 2000))
        })

        it('fetch file again and verify it is updated', async function () {
            if (!pullZoneHostname || !fileName) {
                console.log('\n   ⚠️  Skipping test: precondition not met')
                expect(true).toBe(true)
                return
            }

            const fileUrl = `https://${pullZoneHostname}/${fileName}`

            const response = await fetch(fileUrl)
            expect(response.ok).toBe(true)

            const content = await response.text()
            expect(content).toBe('Version 2: Updated content')
        })

        it('deleteFile() from storage zone', async function () {
            if (!storageZoneName || !storageHostname || !fileName || !storagePassword) {
                console.log('\n   ⚠️  Skipping test: precondition not met')
                expect(true).toBe(true)
                return
            }

            await storage.deleteFile({
                storageZoneName: storageZoneName,
                storageHostname: storageHostname,
                fileName: fileName,
                password: storagePassword
            })
        })

        it('deletePullZone()', async function () {
            if (!pullZoneId) {
                console.log('\n   ⚠️  Skipping test: precondition not met (pullZoneId not set)')
                expect(true).toBe(true)
                return
            }

            const deleteResult = await pull.deleteZone(pullZoneId)
            expect(deleteResult).toBeDefined()
        })

        it('deleteStorageZone()', async function () {
            if (!storageZoneId) {
                console.log('\n   ⚠️  Skipping test: precondition not met (storageZoneId not set)')
                expect(true).toBe(true)
                return
            }

            const deleteResult = await storage.deleteZone(storageZoneId)
            expect(deleteResult).toBeDefined()
        })

        it('cleanup - delete all test zones', async function () {
            const pullResult = await pull.listZones()
            const allPullZones = pullResult.Items || pullResult
            expect(allPullZones).toBeArray()

            const testPullZones = allPullZones.filter((zone: any) =>
                zone.Name && zone.Name.match(/^test-t44-cdn-pull-\d+$/)
            )

            for (const zone of testPullZones) {
                await pull.deleteZone(zone.Id)
            }

            const allStorageZones = await storage.listZones()
            expect(allStorageZones).toBeArray()

            const testStorageZones = allStorageZones.filter((zone: any) =>
                zone.Name && zone.Name.match(/^test-t44-cdn-\d+$/)
            )

            for (const zone of testStorageZones) {
                await storage.deleteZone(zone.Id)
            }
        })

    })

})
