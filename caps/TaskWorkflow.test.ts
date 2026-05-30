#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { describe, it, expect } from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'

const { workflow } = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                workflow: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/TaskWorkflow',
                    options: { '#': { exitOnComplete: false } },
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44/caps/TaskWorkflow.test',
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta,
})

describe('TaskWorkflow', () => {

    it('exitOnComplete is configurable via options', () => {
        expect(workflow.exitOnComplete).toBe(false);
    });

    it('spineFilesystemRoot is set on the Capsule struct metadata', () => {
        const root = workflow['#@stream44.studio/encapsulate/structs/Capsule']?.spineFilesystemRoot;
        expect(root).toBeTruthy();
        expect(typeof root).toBe('string');
    });

    it('originCacheRoot points to .~o/ under spineFilesystemRoot', () => {
        expect(workflow.originCacheRoot).toBeTruthy();
        expect(workflow.originCacheRoot).toMatch(/\.~o$/);
    });

    it('auto-runs serial tasks on next tick', async () => {
        let stepExecuted = false;
        let resolve: () => void;
        const done = new Promise<void>(r => { resolve = r; });

        workflow.serial('auto-serial', () => {
            workflow.step('verify', async () => {
                stepExecuted = true;
                resolve();
            });
        });

        expect(stepExecuted).toBe(false);
        await done;
        expect(stepExecuted).toBe(true);
    });

    it('auto-runs parallel tasks on next tick', async () => {
        const results: string[] = [];
        let resolve: () => void;
        const done = new Promise<void>(r => { resolve = r; });

        workflow.parallel('auto-parallel', () => {
            workflow.step('a', async () => { results.push('a'); });
            workflow.step('b', async () => {
                results.push('b');
                resolve();
            });
        });

        await done;
        expect(results).toContain('a');
        expect(results).toContain('b');
    });

    it('executes serial steps in order', async () => {
        const order: number[] = [];
        let resolve: () => void;
        const done = new Promise<void>(r => { resolve = r; });

        workflow.serial('order-test', () => {
            workflow.step('first', async () => { order.push(1); });
            workflow.step('second', async () => { order.push(2); });
            workflow.step('third', async () => {
                order.push(3);
                resolve();
            });
        });

        await done;
        expect(order).toEqual([1, 2, 3]);
    });

    it('run() throws error saying it is no longer required', () => {
        expect(() => workflow.run()).toThrow('TaskWorkflow.run() is no longer required');
    });
});
