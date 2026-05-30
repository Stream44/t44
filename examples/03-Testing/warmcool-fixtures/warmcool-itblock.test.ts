#!/usr/bin/env bun test
/**
 * Fixture: every warmUp / coolDown callback is a synchronous function that
 * registers `it()` blocks. These tests show up in the bun output by name
 * (rather than running silently at file-load or as a hook).
 */

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const { test: { it, expect, warmUp, coolDown } } = await run(
    async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
        const spine = await encapsulate({
            '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                '#@stream44.studio/encapsulate/structs/Capsule': {},
                '#': {
                    test: {
                        type: CapsulePropertyTypes.Mapping,
                        value: '@stream44.studio/t44/caps/ProjectTest',
                        options: { '#': { bunTest } },
                    },
                },
            },
        }, {
            importMeta: import.meta,
            importStack: makeImportStack(),
            capsuleName: '@stream44.studio/t44/examples/03-Testing/warmcool-fixtures/warmcool-itblock.test',
        })
        return { spine }
    },
    async ({ spine, apis }: any) => apis[spine.capsuleSourceLineRef],
    { importMeta: import.meta },
)

const TRACE = process.env.T44_TRACE_FILE
const trace = (marker: string) => {
    if (!TRACE) return
    mkdirSync(dirname(TRACE), { recursive: true })
    appendFileSync(TRACE, marker + '\n', 'utf-8')
}

trace('module-loaded')

await warmUp(
    'fixture-itblock',
    function () {
        it('warmUp.onCold: registers a real it() block', function () {
            trace('onCold-itblock')
            expect(1 + 1).toBe(2)
        })
    },
    function () {
        it('warmUp.onWarm: registers a real it() block', function () {
            trace('onWarm-itblock')
            expect(true).toBe(true)
        })
    },
)

it('regular top-level test in fixture', function () {
    trace('regular-it')
    expect(true).toBe(true)
})

coolDown(
    'fixture-itblock',
    function () {
        it('coolDown.onDefault: registers a real it() block', function () {
            trace('onDefault-itblock')
            expect(true).toBe(true)
        })
    },
    function () {
        it('coolDown.onCooldown: registers a real it() block', function () {
            trace('onCooldown-itblock')
            expect(true).toBe(true)
        })
    },
)
