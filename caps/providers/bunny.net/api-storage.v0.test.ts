#!/usr/bin/env bun test

export const testConfig = {
    group: 'vendor',
    runOnAll: false,
}

import * as bunTest from 'bun:test'
import { run } from '../../../workspace-rt'

const {
    test: { describe, it, expect },
    storage
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceTest.v0',
                    options: {
                        '#': {
                            bunTest,
                            env: {
                                BUNNY_API_KEY: { factReference: '@stream44.studio/t44/structs/providers/bunny.net/WorkspaceConnectionConfig.v0:apiKey' }
                            }
                        }
                    }
                },
                storage: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api-storage.v0'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44/caps/providers/bunny.net/api-storage.v0.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('Bunny Storage API', function () {

    it('listZones()', async function () {

        const result = await storage.listZones()

        expect(result).toBeArray()
    }, 15_000)

    describe('Storage Zone Lifecycle', function () {

        let zoneId: number
        let zoneName: string
        let password: string
        let storageHostname: string
        let fileName: string

        it('ensureZone()', async function () {
            const timestamp = Date.now()
            zoneName = `test-t44-${timestamp}`

            const zone = await storage.ensureZone({
                name: zoneName,
                region: 'LA'
            })

            expect(zone).toBeObject()
            expect(zone.Id).toBeNumber()
            expect(zone.Name).toBe(zoneName)
            expect(zone.Password).toBeDefined()

            zoneId = zone.Id
        })

        it('getZone()', async function () {
            const retrievedZone = await storage.getZone(zoneId)

            expect(retrievedZone).toBeObject()
            expect(retrievedZone.Id).toBe(zoneId)
            expect(retrievedZone.Name).toBe(zoneName)
            expect(retrievedZone.Password).toBeDefined()

            password = retrievedZone.Password
            storageHostname = retrievedZone.StorageHostname

            await new Promise(resolve => setTimeout(resolve, 2000))
        })

        it('uploadFile()', async function () {
            const timestamp = Date.now()
            fileName = `test-file-${timestamp}.txt`
            const fileContent = 'Hello from Bunny.net Storage API test!'

            await storage.uploadFile({
                storageZoneName: zoneName,
                storageHostname: storageHostname,
                fileName: fileName,
                data: fileContent,
                password: password
            })
        })

        it('listFiles() - verify upload', async function () {
            const filesAfterUpload = await storage.listFiles({
                storageZoneName: zoneName,
                storageHostname: storageHostname,
                password: password
            })

            expect(filesAfterUpload).toBeArray()
            expect(filesAfterUpload.length).toBeGreaterThan(0)
            const uploadedFile = filesAfterUpload.find((f: any) => f.ObjectName === fileName)
            expect(uploadedFile).toBeDefined()
            expect(uploadedFile.ObjectName).toBe(fileName)
            expect(uploadedFile.IsDirectory).toBe(false)
        })

        it('deleteFile()', async function () {
            await storage.deleteFile({
                storageZoneName: zoneName,
                storageHostname: storageHostname,
                fileName: fileName,
                password: password
            })
        })

        it('listFiles() - verify deletion', async function () {
            const filesAfterDelete = await storage.listFiles({
                storageZoneName: zoneName,
                storageHostname: storageHostname,
                password: password
            })

            expect(filesAfterDelete).toBeArray()
            const deletedFile = filesAfterDelete.find((f: any) => f.ObjectName === fileName)
            expect(deletedFile).toBeUndefined()
        })

        it('deleteZone()', async function () {
            const deleteResult = await storage.deleteZone(zoneId)

            expect(deleteResult).toBeDefined()
        })

        it('cleanup - delete all test zones', async function () {
            const allZones = await storage.listZones()
            expect(allZones).toBeArray()

            const testZones = allZones.filter((zone: any) =>
                zone.Name && zone.Name.match(/^test-t44-\d+$/)
            )

            for (const zone of testZones) {
                await storage.deleteZone(zone.Id)
            }
        })

    })

})