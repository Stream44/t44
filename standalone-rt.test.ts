#!/usr/bin/env bun test --timeout 30000

import * as bunTest from 'bun:test'
import { describe, it, expect } from 'bun:test'
import { run } from './standalone-rt'

// Top-level run() — shared across all tests (e.g. for workbenchDir)
const { test: { workbenchDir } } = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest',
                    options: { '#': { bunTest, env: {} } }
                },
            }
        }
    }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: 't44/standalone-rt.test' })
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
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: 't44/standalone-rt.test.run1' })
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
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: 't44/standalone-rt.test.run2' })
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
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: 't44/standalone-rt.test.closure' })
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
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: 't44/standalone-rt.test.multi-a' })

            const spineB = await encapsulate({
                '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                    '#@stream44.studio/encapsulate/structs/Capsule': {},
                    '#': {
                        name: { type: CapsulePropertyTypes.Literal, value: 'capsule-b' },
                    }
                }
            }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: 't44/standalone-rt.test.multi-b' })

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

    it('workbenchDir from top-level run() should still be available', () => {
        expect(workbenchDir).toBeDefined();
        expect(typeof workbenchDir).toBe('string');
    });
});
