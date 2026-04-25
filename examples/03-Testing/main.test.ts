#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/workspace-rt'

const {
    test: { describe, it, expect, beforeAll, workbenchDir, lib: { fs, path } },
    cli,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: {
                        '#': {
                            bunTest,
                        }
                    }
                },
                cli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceCli'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44/examples/03-Testing/main.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

const fixturesDir = path.join(import.meta.dir, 'fixtures')
const homeDir = path.join(workbenchDir, 'testing', 'home')
const repoDir = path.join(workbenchDir, 'testing', 'repo')
const env = { T44_HOME_DIR: homeDir, T44_KEYS_PASSPHRASE: 't44-test' }

async function runT44(...args: string[]) {
    return cli.spawnCli({ cwd: repoDir, args, env })
}

async function runT44InDir(cwd: string, ...args: string[]) {
    return cli.spawnCli({ cwd, args, env })
}

describe('t44 test command', function () {

    beforeAll(async () => {
        // Clean up and set up workspace
        await fs.rm(path.join(workbenchDir, 'testing'), { recursive: true, force: true })
        await fs.mkdir(homeDir, { recursive: true })
        await fs.mkdir(path.join(homeDir, '.ssh'), { recursive: true })
        await fs.mkdir(repoDir, { recursive: true })

        // Initialize workspace
        const { exitCode, stdout, stderr } = await runT44('init')
        if (exitCode !== 0) {
            console.log('INIT STDOUT:', stdout)
            console.log('INIT STDERR:', stderr)
            throw new Error(`t44 init failed with exit code ${exitCode}`)
        }

        // Copy fixture projects into workspace
        await fs.cp(path.join(fixturesDir, 'project-alpha'), path.join(repoDir, 'project-alpha'), { recursive: true })
        await fs.cp(path.join(fixturesDir, 'project-beta'), path.join(repoDir, 'project-beta'), { recursive: true })
        await fs.cp(path.join(fixturesDir, 'project-gamma'), path.join(repoDir, 'project-gamma'), { recursive: true })
        await fs.cp(path.join(fixturesDir, 'project-timeout'), path.join(repoDir, 'project-timeout'), { recursive: true })
    }, 30_000)

    it('test --help shows usage with -p and -t flags', async () => {
        const { exitCode, stdout } = await runT44('test', '--help')

        expect(exitCode).toBe(0)
        expect(stdout).toContain('projectSelector')
        expect(stdout).toContain('-p, --parallel')
        expect(stdout).toContain('-t, --timeout')
        expect(stdout).toContain('-l, --linux')
    }, 15_000)

    it('test with project name runs that project tests', async () => {
        const { exitCode, stdout } = await runT44('test', 'project-alpha')

        if (exitCode !== 0) {
            console.log('STDOUT:', stdout)
        }

        expect(exitCode).toBe(0)
        expect(stdout).toContain('Running tests for project-alpha')
        expect(stdout).toContain('alpha-pass')
        expect(stdout).toContain('Tests passed for project-alpha')
    }, 15_000)

    it('test with package name runs that package tests', async () => {
        const { exitCode, stdout } = await runT44('test', 'pkg-one')

        if (exitCode !== 0) {
            console.log('STDOUT:', stdout)
        }

        expect(exitCode).toBe(0)
        expect(stdout).toContain('pkg-one-pass')
    }, 15_000)

    it('test warns about projects without test script', async () => {
        const { exitCode, stdout } = await runT44('test', 'project-gamma')

        expect(exitCode).toBe(0)
        expect(stdout).toContain('No "test" script')
        expect(stdout).toContain('project-gamma')
    }, 15_000)

    it('test warns about packages without test script in matched project', async () => {
        const { exitCode, stdout } = await runT44('test', 'project-alpha')

        expect(exitCode).toBe(0)
        // pkg-two has no test script
        expect(stdout).toContain('No "test" script')
        expect(stdout).toContain('pkg-two')
    }, 15_000)

    it('test with nonexistent selector shows available targets', async () => {
        const { exitCode, stdout } = await runT44('test', 'nonexistent-project')

        expect(exitCode).toBe(0)
        expect(stdout).toContain('No project found matching')
        expect(stdout).toContain('Available targets with test scripts')
    }, 15_000)

    it('test with --parallel flag runs in parallel', async () => {
        const { exitCode, stdout } = await runT44('test', 'project-alpha', '--parallel')

        expect(exitCode).toBe(0)
        expect(stdout).toContain('in parallel')
        expect(stdout).toContain('alpha-pass')
    }, 15_000)

    it('test with -p short flag runs in parallel', async () => {
        const { exitCode, stdout } = await runT44('test', 'project-alpha', '-p')

        expect(exitCode).toBe(0)
        expect(stdout).toContain('in parallel')
    }, 15_000)

    it('test with --timeout kills long-running tests', async () => {
        const { exitCode, stdout } = await runT44('test', 'project-timeout', '--timeout', '2')

        // Should not hang — timeout should kill the sleep 60
        expect(stdout).toContain('Timeout')
        expect(stdout).toContain('project-timeout')
    }, 15_000)

    it('test with -t short flag for timeout', async () => {
        const { exitCode, stdout } = await runT44('test', 'project-timeout', '-t', '2')

        expect(stdout).toContain('Timeout')
    }, 15_000)

    it('test with path-based selector (.) resolves current dir', async () => {
        const { exitCode, stdout } = await runT44InDir(
            path.join(repoDir, 'project-beta'),
            'test', '.'
        )

        expect(exitCode).toBe(0)
        expect(stdout).toContain('beta-pass')
    }, 15_000)

    it('test with path-based selector for subpackage from parent', async () => {
        const { exitCode, stdout } = await runT44InDir(
            path.join(repoDir, 'project-beta', 'packages', 'sub-pkg'),
            'test', '.'
        )

        expect(exitCode).toBe(0)
        expect(stdout).toContain('sub-pkg-pass')
    }, 15_000)

    it('test without selector runs all projects', async () => {
        // Run without selector but with timeout to prevent long-running tests from blocking
        const { exitCode, stdout } = await runT44('test', '--timeout', '3')

        // Should include results from projects with test scripts
        expect(stdout).toContain('alpha-pass')
        expect(stdout).toContain('beta-pass')
        // project-gamma has no test script
        expect(stdout).toContain('No "test" script')
    }, 30_000)

})
