#!/usr/bin/env bun test

export const testConfig = {
    group: 'vendor',
    runOnAll: false,
}

import * as bunTest from 'bun:test'
import { run } from '../../../workspace-rt'

const {
    test: { describe, it, expect },
    vercel
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
                                VERCEL_TOKEN: { factReference: '@stream44.studio/t44/structs/providers/vercel.com/WorkspaceConnectionConfig.v0:apiToken' }
                            }
                        }
                    }
                },
                vercel: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api.v0'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44/caps/providers/vercel.com/api.v0.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('Vercel SDK', function () {

    it('getTeams()', async function () {

        const result = await vercel.getTeams()

        expect(result).toBeObject()
        expect(result.teams).toBeArray()
    })

    it('getProjects()', async function () {

        const result = await vercel.getProjects()

        expect(result).toBeObject()
        expect(result.projects).toBeArray()
    })

})