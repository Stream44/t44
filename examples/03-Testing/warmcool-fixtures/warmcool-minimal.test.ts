#!/usr/bin/env bun test
/**
 * Fixture: only the required callbacks. Verifies optional args.
 *
 *   warmUp(name, onCold)          — no onWarm
 *   coolDown(onDefault)           — no onCooldown
 *
 * With --cooldown, onDefault is skipped and the warmUp cache is still wiped
 * (so the next ordinary run re-warms).
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
            capsuleName: '@stream44.studio/t44/examples/03-Testing/warmcool-fixtures/warmcool-minimal.test',
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

const cached: { token: string } = await warmUp(
    'fixture-minimal',
    async function () {
        trace('onCold-async-only')
        return { token: 'minimal-cached' }
    },
    // no onWarm
)

it('regular top-level test', function () {
    expect(cached.token).toBe('minimal-cached')
})

coolDown(
    'fixture-minimal',
    async function () {
        trace('onDefault-async-only')
    },
    // no onCooldown
)
