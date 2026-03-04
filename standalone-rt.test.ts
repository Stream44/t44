#!/usr/bin/env bun test --timeout 30000

import * as bunTest from 'bun:test'
import { describe, it, expect } from 'bun:test'
import { run } from './standalone-rt'
import * as fs from 'fs/promises'
import { join } from 'path'

// Top-level run() — shared across all tests (e.g. for workbenchDir)
const { test: { workbenchDir } } = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest, env: {} } }
                },
            }
        }
    }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test' })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })

describe('standalone-rt multiple run() calls', () => {

    it('should support a second run() call with static options', async () => {
        const result = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
            const spine = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        greeting: {
                            type: CapsulePropertyTypes.Literal,
                            value: 'hello-from-run-1',
                        },
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test.run1' })
            return { spine }
        }, async ({ spine, apis }: any) => {
            return apis[spine.capsuleSourceLineRef].greeting
        }, { importMeta: import.meta, runFromSnapshot: false })

        expect(result).toBe('hello-from-run-1');
    });

    it('should support a third run() call with different options', async () => {
        const result = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
            const spine = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        greeting: {
                            type: CapsulePropertyTypes.Literal,
                            value: 'hello-from-run-2',
                        },
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test.run2' })
            return { spine }
        }, async ({ spine, apis }: any) => {
            return apis[spine.capsuleSourceLineRef].greeting
        }, { importMeta: import.meta, runFromSnapshot: false })

        expect(result).toBe('hello-from-run-2');
    });

    it('should support run() with closure variables in options', async () => {
        const dynamicValue = `dynamic-${Date.now()}`;

        const result = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
            const spine = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        value: {
                            type: CapsulePropertyTypes.Literal,
                            value: dynamicValue,
                        },
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test.closure' })
            return { spine }
        }, async ({ spine, apis }: any) => {
            return apis[spine.capsuleSourceLineRef].value
        }, { importMeta: import.meta, runFromSnapshot: false })

        expect(result).toBe(dynamicValue);
    });

    it('should support run() with two capsules in the same spine', async () => {
        const result = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
            const spineA = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        name: { type: CapsulePropertyTypes.Literal, value: 'capsule-a' },
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test.multi-a' })

            const spineB = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        name: { type: CapsulePropertyTypes.Literal, value: 'capsule-b' },
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test.multi-b' })

            return { spineA, spineB }
        }, async ({ spineA, spineB, apis }: any) => {
            return {
                a: apis[spineA.capsuleSourceLineRef].name,
                b: apis[spineB.capsuleSourceLineRef].name,
            }
        }, { importMeta: import.meta, runFromSnapshot: false })

        expect(result.a).toBe('capsule-a');
        expect(result.b).toBe('capsule-b');
    });

    it('should support run() with runFromSnapshot: true', async () => {
        const result = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
            const spine = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        greeting: {
                            type: CapsulePropertyTypes.Literal,
                            value: 'hello-from-snapshot',
                        },
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test.snapshot' })
            return { spine }
        }, async ({ spine, apis }: any) => {
            return apis[spine.capsuleSourceLineRef].greeting
        }, { importMeta: import.meta, runFromSnapshot: true })

        expect(result).toBe('hello-from-snapshot');
    });

    it('workbenchDir from top-level run() should still be available', () => {
        expect(workbenchDir).toBeDefined();
        expect(typeof workbenchDir).toBe('string');
    });

    it('should write .events.json when captureEvents is true', async () => {
        // Clean up any existing spine-instances directory
        const spineInstancesDir = join(import.meta.dir, '.~o/encapsulate.dev/spine-instances');
        try {
            await fs.rm(spineInstancesDir, { recursive: true });
        } catch { }

        const result = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
            const spine = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        counter: {
                            type: CapsulePropertyTypes.Literal,
                            value: 0,
                        },
                        increment: {
                            type: CapsulePropertyTypes.Function,
                            value: function (this: any) {
                                this.counter++;
                                return this.counter;
                            }
                        }
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test.events' })
            return { spine }
        }, async ({ spine, apis }: any) => {
            const api = apis[spine.capsuleSourceLineRef];
            // Trigger some membrane events
            api.increment();
            api.increment();
            const finalCount = api.counter;
            return { finalCount, spineRef: spine.capsuleSourceLineRef };
        }, { importMeta: import.meta, runFromSnapshot: true, captureEvents: true })

        expect(result.finalCount).toBe(2);

        // Verify .events.json was written
        const dirs = await fs.readdir(spineInstancesDir);
        expect(dirs.length).toBeGreaterThan(0);

        const eventsFile = join(spineInstancesDir, dirs[0], 'root-capsule.events.json');
        await fs.access(eventsFile); // Should not throw

        const eventsContent = await fs.readFile(eventsFile, 'utf-8');
        const events = JSON.parse(eventsContent);

        expect(Array.isArray(events)).toBe(true);
        expect(events.length).toBeGreaterThan(0);

        // Verify event structure
        const callEvents = events.filter((e: any) => e.event === 'call');
        expect(callEvents.length).toBe(2); // Two increment() calls

        const getEvents = events.filter((e: any) => e.event === 'get');
        expect(getEvents.length).toBeGreaterThan(0); // counter property reads

        // Verify membrane property is captured
        for (const event of events) {
            expect(event.membrane).toBeDefined();
            expect(['external', 'internal']).toContain(event.membrane);
        }

        // Verify we have both internal and external events
        const externalEvents = events.filter((e: any) => e.membrane === 'external');
        const internalEvents = events.filter((e: any) => e.membrane === 'internal');
        expect(externalEvents.length).toBeGreaterThan(0);
        expect(internalEvents.length).toBeGreaterThan(0);

        // Clean up
        await fs.rm(spineInstancesDir, { recursive: true });
    });

    it('should NOT write .events.json when captureEvents is false/undefined', async () => {
        // Clean up any existing spine-instances directory
        const spineInstancesDir = join(import.meta.dir, '.~o/encapsulate.dev/spine-instances');
        try {
            await fs.rm(spineInstancesDir, { recursive: true });
        } catch { }

        await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
            const spine = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        value: {
                            type: CapsulePropertyTypes.Literal,
                            value: 'test',
                        },
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44/standalone-rt.test.no-events' })
            return { spine }
        }, async ({ spine, apis }: any) => {
            return apis[spine.capsuleSourceLineRef].value;
        }, { importMeta: import.meta, runFromSnapshot: false }) // No captureEvents

        // Verify .events.json was NOT written (directory may or may not exist)
        try {
            const dirs = await fs.readdir(spineInstancesDir);
            for (const dir of dirs) {
                const eventsFile = join(spineInstancesDir, dir, 'root-capsule.events.json');
                try {
                    await fs.access(eventsFile);
                    throw new Error('events.json should not exist');
                } catch (e: any) {
                    if (e.message === 'events.json should not exist') throw e;
                    // Expected: file does not exist
                }
            }
        } catch (e: any) {
            // Directory doesn't exist - that's fine
            if (e.code !== 'ENOENT') throw e;
        }
    });
});
