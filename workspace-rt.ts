#!/usr/bin/env bun
/// <reference types="bun" />
/// <reference types="node" />

const startTime = Date.now()

import { join, resolve } from 'path'
import { access } from 'fs/promises'
import chalk from 'chalk'
import { CapsuleSpineFactory } from "@stream44.studio/encapsulate/spine-factories/CapsuleSpineFactory.v0"
import { CapsuleSpineContract } from "@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0/Membrane.v0"
import { TimingObserver } from "@stream44.studio/encapsulate/src/spine-factories/TimingObserver"

async function findWorkspaceRoot(): Promise<string> {
    let currentDir = resolve(process.cwd())

    while (true) {
        const workspaceConfigPath = join(currentDir, '.workspace', 'workspace.yaml')
        try {
            await access(workspaceConfigPath)
            return currentDir
        } catch {
            // File doesn't exist, continue traversing
        }

        const parentDir = resolve(currentDir, '..')
        if (parentDir === currentDir) {
            throw new Error(
                `Could not find workspace root. Please run this command from within a workspace directory ` +
                `(a directory containing .workspace/workspace.yaml).`
            )
        }
        currentDir = parentDir
    }
}

export async function run(encapsulateHandler: any, runHandler: any, options?: { importMeta?: { dir: string } }) {

    const timing = process.argv.includes('--trace') ? TimingObserver({ startTime }) : undefined

    timing?.recordMajor('INIT SPINE')

    const eventsByKey = new Map<string, any>()

    const workspaceRootDir = await findWorkspaceRoot()

    const { encapsulate, freeze, CapsulePropertyTypes, makeImportStack, hoistSnapshot } = await CapsuleSpineFactory({
        spineFilesystemRoot: workspaceRootDir,
        capsuleModuleProjectionRoot: (import.meta as any).dir,
        enableCallerStackInference: true,
        spineContracts: {
            ['#' + CapsuleSpineContract['#']]: CapsuleSpineContract
        },
        timing,
        onMembraneEvent: timing ? (event: any) => {
            const instanceId = event.target?.spineContractCapsuleInstanceId
            const eventIndex = event.eventIndex

            // Store event by composite key (instance ID + event index)
            const key = `${eventIndex}`
            eventsByKey.set(key, event)

            let capsuleRef = event.target?.capsuleSourceLineRef
            let prop = event.target?.prop
            let callerLocation = event.caller ? `${event.caller.filepath}:${event.caller.line}` : 'unknown'
            const eventType = event.event

            // For call-result events, look up the original call event to get all info
            if (eventType === 'call-result') {
                const callKey = `${event.callEventIndex}`
                const callEvent = eventsByKey.get(callKey)
                if (callEvent) {
                    capsuleRef = callEvent.target?.capsuleSourceLineRef || capsuleRef
                    prop = callEvent.target?.prop || prop
                    if (callEvent.caller) {
                        callerLocation = `${callEvent.caller.filepath}:${callEvent.caller.line}`
                    }
                }
            }

            console.error(
                chalk.gray(`[${eventIndex}]`),
                chalk.cyan(eventType.padEnd(12)),
                chalk.yellow(capsuleRef),
                chalk.magenta(`.${prop}`),
                chalk.dim(`from ${callerLocation}`)
            )
        } : undefined
    })

    timing?.recordMajor('ENCAPSULATE')

    const exportedApi = await encapsulateHandler({
        encapsulate,
        CapsulePropertyTypes,
        makeImportStack
    })

    timing?.recordMajor('FREEZE')

    const snapshot = await freeze()

    timing?.recordMajor('HOIST SNAPSHOT')

    const { run } = await hoistSnapshot({
        snapshot
    })

    timing?.recordMajor('RUN')

    const result = await run({
        overrides: {
            ['@stream44.studio/t44/caps/WorkspaceConfig.v0']: {
                '#': {
                    workspaceRootDir
                }
            },
            ['@stream44.studio/t44/caps/WorkspaceTest.v0']: {
                '#': {
                    testRootDir: options?.importMeta?.dir
                }
            }
        }
    }, async (opts) => {
        return runHandler({
            ...opts,
            ...(exportedApi || {})
        })
    })

    timing?.recordMajor('DONE')

    return result
}
