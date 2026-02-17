#!/usr/bin/env bun test

export const testConfig = {
    group: 'vendor',
    runOnAll: false,
}

import * as bunTest from 'bun:test'
import { run } from 't44/workspace-rt'

const {
    test: { describe, it, expect },
    vercel
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
                                VERCEL_TOKEN: { factReference: 't44/structs/providers/vercel.com/WorkspaceConnectionConfig:apiToken' }
                            }
                        }
                    }
                },
                vercel: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: 't44/caps/providers/vercel.com/api.test'
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