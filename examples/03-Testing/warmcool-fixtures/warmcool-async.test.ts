#!/usr/bin/env bun test
/**
 * Fixture: every warmUp / coolDown callback is a plain `async function`.
 *
 *   warmUp.onCold       — async, returns a JSON-serializable value (cached)
 *   warmUp.onWarm       — async, receives cached value
 *   coolDown.onDefault  — async, registered as afterAll in default mode
 *   coolDown.onCooldown — async, wrapped as a single it() inside the
 *                          coolDown describe in --cooldown mode
 *
 * Each callback appends a marker to a trace file so the parent test can
 * verify which paths fired.
 */

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const { test: { describe, it, expect, warmUp, coolDown } } = await run(
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
            capsuleName: '@stream44.studio/t44/examples/03-Testing/warmcool-fixtures/warmcool-async.test',
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

const cached: { greeting: string; count: number } = await warmUp(
    'fixture-async',
    async function () {
        trace('onCold-async')
        return { greeting: 'hello', count: 1 }
    },
    async function (cachedValue: { greeting: string; count: number }) {
        trace(`onWarm-async:${cachedValue.greeting}`)
    },
)

describe('warmcool-async fixture', function () {
    it('warmUp resolved to the cached value', function () {
        expect(cached.greeting).toBe('hello')
        expect(cached.count).toBe(1)
    })
})

coolDown(
    'fixture-async',
    async function () {
        trace('onDefault-async')
    },
    async function () {
        trace('onCooldown-async')
    },
)
