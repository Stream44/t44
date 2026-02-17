#!/usr/bin/env bun test

export const testConfig = {
    group: 'vendor',
    runOnAll: false,
}

import * as bunTest from 'bun:test'
import { run } from 't44/workspace-rt'

const {
    test: { describe, it, expect },
    project
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
                                VERCEL_TOKEN: { factReference: 't44/structs/providers/vercel.com/WorkspaceConnectionConfig:apiToken' },
                                VERCEL_TEAM: { factReference: 't44/structs/providers/vercel.com/WorkspaceConnectionConfig:team' }
                            }
                        }
                    }
                },
                project: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './project'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: 't44/caps/providers/vercel.com/project.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('Vercel SDK', function () {

    describe('Project Lifecycle', function () {

        const testProjectName = `test-t44-vercel-api`

        it('ensureDeleted()', async function () {

            await project.ensureDeleted({
                name: testProjectName,
            })
        }, 30_000)

        it('get()', async function () {

            const result = await project.get({
                name: testProjectName,
            })

            expect(result).toBeNull()
        })

        it('ensureCreated()', async function () {

            const result = await project.ensureCreated({
                name: testProjectName,
            })

            expect(result).toBeObject()
            expect(result.id).toBeString()
        }, 30_000)

        it('get()', async function () {

            const result = await project.get({
                name: testProjectName,
            })

            expect(result).toBeObject()
            expect(result.id).toBeString()
        })

        it('ensureDeleted()', async function () {

            await project.ensureDeleted({
                name: testProjectName,
            })
        }, 30_000)

        it('get()', async function () {

            const result = await project.get({
                name: testProjectName,
            })

            expect(result).toBeNull()
        })
    })
})