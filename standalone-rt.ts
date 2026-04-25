#!/usr/bin/env bun
/// <reference types="bun" />
/// <reference types="node" />

const startTime = Date.now()

import { resolve, join } from 'path'
import { access, readdir, writeFile } from 'fs/promises'
import chalk from 'chalk'
import { CapsuleSpineFactory } from "@stream44.studio/encapsulate/spine-factories/CapsuleSpineFactory"
import { CapsuleSpineContract } from "@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0/Membrane"
import { TimingObserver } from "@stream44.studio/encapsulate/spine-factories/TimingObserver"

async function findPackageRoot(startDir: string): Promise<string> {
    let dir = resolve(startDir)
    while (true) {
        try {
            await access(join(dir, 'package.json'))
            return dir
        } catch { }
        const parent = resolve(dir, '..')
        if (parent === dir) return resolve(startDir)
        dir = parent
    }
}

export async function run(encapsulateHandler: any, runHandler: any, options?: { importMeta?: { dir: string }, runFromSnapshot?: boolean, captureEvents?: boolean }) {

    const timing = process.argv.includes('--trace') ? TimingObserver({ startTime }) : undefined
    const shouldCaptureEvents = options?.captureEvents === true || process.argv.includes('--capture-events')
    const saveMembraneEvents = shouldCaptureEvents

    timing?.recordMajor('INIT SPINE')

    const eventsByKey = new Map<string, any>()
    const capturedEvents: any[] = []
    let isSerializing = false

    const spineFilesystemRoot = options?.importMeta?.dir
        ? await findPackageRoot(options.importMeta.dir)
        : process.cwd()

    const { encapsulate, freeze, CapsulePropertyTypes, makeImportStack, hoistSnapshot, run: spineRun } = await CapsuleSpineFactory({
        spineFilesystemRoot,
        capsuleModuleProjectionRoot: options?.importMeta?.dir!,
        enableCallerStackInference: true,
        spineContracts: {
            ['#' + CapsuleSpineContract['#']]: CapsuleSpineContract
        },
        timing,
        onMembraneEvent: (timing || shouldCaptureEvents) ? (event: any) => {
            // Suppress spurious events triggered by JSON.stringify traversing proxy objects
            if (isSerializing) return

            const instanceId = event.target?.spineContractCapsuleInstanceId
            const eventIndex = event.eventIndex

            // Store event by composite key (instance ID + event index)
            const key = `${eventIndex}`
            eventsByKey.set(key, event)

            // Collect event for .events.json persistence
            if (shouldCaptureEvents) {
                // Serialize value/result safely — they may contain capsule proxies with cyclic references
                let safeValue: any = undefined
                let safeResult: any = undefined
                isSerializing = true
                try {
                    if (event.value !== undefined) {
                        JSON.stringify(event.value)
                        safeValue = event.value
                    }
                } catch {
                    safeValue = typeof event.value === 'object' ? `[${typeof event.value}]` : String(event.value)
                }
                try {
                    if (event.result !== undefined) {
                        JSON.stringify(event.result)
                        safeResult = event.result
                    }
                } catch {
                    safeResult = typeof event.result === 'object' ? `[${typeof event.result}]` : String(event.result)
                } finally {
                    isSerializing = false
                }
                // Serialize caller safely — strip stack array which may contain non-serializable objects
                let safeCaller: any = undefined
                if (event.caller) {
                    const { stack, ...callerRest } = event.caller
                    safeCaller = { ...callerRest }
                    if (stack) {
                        isSerializing = true
                        try {
                            JSON.stringify(stack)
                            safeCaller.stack = stack
                        } catch {
                            // stack frames may contain non-serializable objects
                        } finally {
                            isSerializing = false
                        }
                    }
                }

                capturedEvents.push({
                    eventIndex: event.eventIndex,
                    event: event.event,
                    membrane: event.membrane,
                    target: event.target ? { ...event.target } : undefined,
                    value: safeValue,
                    result: safeResult,
                    caller: safeCaller,
                    callEventIndex: event.callEventIndex,
                })
            }

            if (timing) {
                let capsuleRef = event.target?.capsuleSourceLineRef
                let prop = event.target?.prop
                let callerLocation = event.caller ? `${event.caller.fileUri}:${event.caller.line}` : 'unknown'
                const eventType = event.event

                // For call-result events, look up the original call event to get all info
                if (eventType === 'call-result') {
                    const callKey = `${event.callEventIndex}`
                    const callEvent = eventsByKey.get(callKey)
                    if (callEvent) {
                        capsuleRef = callEvent.target?.capsuleSourceLineRef || capsuleRef
                        prop = callEvent.target?.prop || prop
                        if (callEvent.caller) {
                            callerLocation = `${callEvent.caller.fileUri}:${callEvent.caller.line}`
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
            }
        } : undefined
    })

    timing?.recordMajor('ENCAPSULATE')

    const exportedApi = await encapsulateHandler({
        encapsulate,
        CapsulePropertyTypes,
        makeImportStack
    })

    let run

    if (options?.runFromSnapshot === false) {

        run = spineRun
        timing?.recordMajor('RUN (in-memory)')
    } else {

        timing?.recordMajor('FREEZE')

        const snapshot = await freeze()

        timing?.recordMajor('HOIST SNAPSHOT')

        const spine = await hoistSnapshot({
            snapshot
        })

        run = spine.run
        timing?.recordMajor('RUN (snapshot)')
    }

    const result = await run({
        overrides: {
            ['@stream44.studio/t44/caps/ProjectTest']: {
                '#': {
                    testRootDir: options?.importMeta?.dir,
                    verbose: !!process.env.VERBOSE,
                }
            },
            ['@stream44.studio/t44-ipfs.tech/caps/IpfsWorkbench']: {
                '#': {
                    cacheDir: join(spineFilesystemRoot, '.~o/workspace.foundation', '@stream44.studio~t44-ipfs.tech~caps~IpfsWorkbench', 'daemons')
                }
            }
        },
        saveMembraneEvents,
    }, async (opts) => {
        const handlerResult = await runHandler({
            ...opts,
            ...(exportedApi || {}),
            spineFilesystemRoot
        })

        return handlerResult
    })

    // Write .events.json alongside .sit.json files when capture is enabled
    // This must happen AFTER run() completes so that post-handler lifecycle events
    // (e.g. StructDispose, Dispose, property accesses during cleanup) are captured.
    if (saveMembraneEvents && capturedEvents.length > 0 && options?.importMeta?.dir) {
        try {
            const spineInstancesDir = join(options.importMeta.dir, '.~o/encapsulate.dev/spine-instances')
            await access(spineInstancesDir)
            const dirs = await readdir(spineInstancesDir)
            for (const dir of dirs) {
                const dirPath = join(spineInstancesDir, String(dir))
                const eventsFile = join(dirPath, 'root-capsule.events.json')
                try {
                    isSerializing = true
                    const serialized = JSON.stringify(capturedEvents, null, 2)
                    isSerializing = false
                    await writeFile(eventsFile, serialized, 'utf-8')
                } catch (writeErr: any) {
                    if (process.env.DEBUG_EVENTS) console.error(`[standalone-rt] write failed for ${eventsFile}: ${writeErr.message}`)
                }
            }
            if (process.env.DEBUG_EVENTS) console.error(`[standalone-rt] Wrote events to ${dirs.length} dirs (${capturedEvents.length} events)`)
        } catch (outerErr: any) {
            if (process.env.DEBUG_EVENTS) console.error(`[standalone-rt] events write skipped: ${outerErr.message}`)
        }
    }

    timing?.recordMajor('DONE')

    return result
}
