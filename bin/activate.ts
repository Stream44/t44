#!/usr/bin/env bun

import { run } from '../workspace-rt'

await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {

    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#': {
                cli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceCli.v0'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: 'cli'
    })

    return { spine }

}, async ({ spine, apis }: any) => {

    const cliCommands = await apis[spine.capsuleSourceLineRef].cli.cliCommands

    await cliCommands.activate()
})
