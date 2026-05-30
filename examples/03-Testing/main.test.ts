#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/workspace-rt'

const {
    test: { describe, it, expect, beforeAll, workbenchDir, lib, lib: { fs, path } },
    cli,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: { '#': { bunTest } },
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

// ────────────────────────────────────────────────────────────────────────
// warmUp / coolDown coverage
//
// Each fixture in `warmcool-fixtures/` exercises one combination of callback
// shapes (plain `async function` vs synchronous registration-form). For each
// fixture we run three scenarios and assert on stdout and on the trace file
// that the fixture appends to:
//
//   1. cold      — no cache → onCold fires, onDefault fires
//   2. warm      — cache hit → onWarm fires (if present), onDefault fires
//   3. cooldown  — cache hit → onCooldown fires (if present), onDefault
//                  does NOT fire, warmUp cache is wiped
// ────────────────────────────────────────────────────────────────────────

const warmcoolFixturesDir = path.join(import.meta.dir, 'warmcool-fixtures')

async function runFixture(fixture: string, scenario: 'cold' | 'warm' | 'cooldown', tracePath: string) {
    const env: Record<string, string> = { T44_TRACE_FILE: tracePath }
    if (scenario === 'cooldown') env.T44_TEST_COOLDOWN = '1'

    const fixturePath = path.join(warmcoolFixturesDir, fixture)
    const result = await lib.spawnProcess({
        cmd: ['bun', 'test', fixturePath],
        cwd: warmcoolFixturesDir,
        env,
        waitForExit: true,
    })

    // Strip ANSI escape codes so regex word boundaries work reliably
    const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')
    const combined = strip(result.stdout + '\n' + result.stderr)
    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, combined }
}

async function readTrace(tracePath: string): Promise<string[]> {
    try {
        const content = await fs.readFile(tracePath, 'utf-8')
        return content.split('\n').filter(Boolean)
    } catch {
        return []
    }
}

async function resetFixture(tracePath: string) {
    // Each fixture writes its warmUp cache under `<fixtures-dir>/.~o`.
    await fs.rm(path.join(warmcoolFixturesDir, '.~o'), { recursive: true, force: true })
    await fs.rm(tracePath, { force: true })
}

describe('warmUp / coolDown — plain async callbacks', function () {
    const tracePath = '/tmp/t44-warmcool-trace-async.txt'

    beforeAll(async () => { await resetFixture(tracePath) }, 10_000)

    it('cold: onCold runs, value is cached, onDefault fires as afterAll', async () => {
        const { exitCode, combined } = await runFixture('warmcool-async.test.ts', 'cold', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('🔥 warmUp("fixture-async") — running')
        expect(combined).toContain('warmUp("fixture-async") — cached')
        expect(combined).toContain('⏭  coolDown("fixture-async") — onDefault registered as afterAll')
        const trace = await readTrace(tracePath)
        expect(trace).toEqual(['module-loaded', 'onCold-async', 'onDefault-async'])
    }, 30_000)

    it('warm: onWarm runs with cached value, onDefault fires, onCold does not', async () => {
        const { exitCode, combined } = await runFixture('warmcool-async.test.ts', 'warm', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('♻️  warmUp("fixture-async") — cached')
        // No fresh "running" log this time.
        expect(combined).not.toContain('🔥 warmUp("fixture-async") — running')
        const trace = await readTrace(tracePath)
        // Appended onto the cold trace.
        expect(trace.slice(-3)).toEqual(['module-loaded', 'onWarm-async:hello', 'onDefault-async'])
    }, 30_000)

    it('cooldown: onCooldown fires as a single it(), onDefault does NOT fire, cache cleared', async () => {
        const { exitCode, combined } = await runFixture('warmcool-async.test.ts', 'cooldown', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('❄️  coolDown("fixture-async") — registered')
        expect(combined).toContain('🗑  warmUp("fixture-async") cache cleared')
        // The cooldown describe wraps onCooldown as 1 it; the fixture's
        // top-level describe.it is skipped → 1 pass / 1 skip.
        expect(combined).toMatch(/1 pass\b/)
        expect(combined).toMatch(/\b1 skip\b/)
        const trace = await readTrace(tracePath)
        expect(trace.slice(-3)).toEqual(['module-loaded', 'onWarm-async:hello', 'onCooldown-async'])
        // Cache directory cleared.
        // The named cache file for this fixture is gone (siblings may remain).
        const cacheFileRemnants = await Bun.$`find ${path.join(warmcoolFixturesDir, '.~o/workspace.foundation/warmup-cache')} -name "*.json" -type f 2>/dev/null`.nothrow().text()
        expect(cacheFileRemnants.trim()).toBe('')
    }, 30_000)
})

describe('warmUp / coolDown — registration-form (it() blocks) callbacks', function () {
    const tracePath = '/tmp/t44-warmcool-trace-itblock.txt'

    beforeAll(async () => { await resetFixture(tracePath) }, 10_000)

    it('cold: onCold registers a visible it() that runs; onDefault its register too', async () => {
        const { exitCode, combined } = await runFixture('warmcool-itblock.test.ts', 'cold', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('🔥 warmUp("fixture-itblock") — running')
        // 3 it()s register in cold mode: onCold + regular + onDefault.
        expect(combined).toMatch(/3 pass\b/)
        expect(combined).toMatch(/Ran 3 tests/)
        const trace = await readTrace(tracePath)
        expect(trace).toEqual(['module-loaded', 'onCold-itblock', 'regular-it', 'onDefault-itblock'])
    }, 30_000)

    it('warm: onWarm registers an it() that runs; onCold its DO NOT', async () => {
        const { exitCode, combined } = await runFixture('warmcool-itblock.test.ts', 'warm', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('♻️  warmUp("fixture-itblock") — cached')
        // 3 its in warm mode: onWarm + regular + onDefault.
        expect(combined).toMatch(/3 pass\b/)
        const trace = await readTrace(tracePath)
        expect(trace.slice(-4)).toEqual(['module-loaded', 'onWarm-itblock', 'regular-it', 'onDefault-itblock'])
    }, 30_000)

    it('cooldown: onCooldown its run; outer + onDefault its skip; cache cleared', async () => {
        const { exitCode, combined } = await runFixture('warmcool-itblock.test.ts', 'cooldown', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('❄️  coolDown("fixture-itblock") — registered')
        expect(combined).toContain('🗑  warmUp("fixture-itblock") cache cleared')
        // 2 run (onWarm at top-level w/ depth bypass + onCooldown);
        // 1 skips (the regular top-level it + onDefault are skipped in cooldown mode).
        expect(combined).toMatch(/2 pass\b/)
        expect(combined).toMatch(/\b1 skip\b/)
        const trace = await readTrace(tracePath)
        // Only onWarm + onCooldown ran.
        expect(trace.slice(-3)).toEqual(['module-loaded', 'onWarm-itblock', 'onCooldown-itblock'])
    }, 30_000)
})

describe('warmUp / coolDown — minimal (omitted optional callbacks)', function () {
    const tracePath = '/tmp/t44-warmcool-trace-minimal.txt'

    beforeAll(async () => { await resetFixture(tracePath) }, 10_000)

    it('cold: onCold + onDefault fire', async () => {
        const { exitCode, combined } = await runFixture('warmcool-minimal.test.ts', 'cold', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('🔥 warmUp("fixture-minimal") — running')
        const trace = await readTrace(tracePath)
        expect(trace).toEqual(['module-loaded', 'onCold-async-only', 'onDefault-async-only'])
    }, 30_000)

    it('warm: no onWarm provided → nothing extra fires; onDefault still does', async () => {
        const { exitCode, combined } = await runFixture('warmcool-minimal.test.ts', 'warm', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('♻️  warmUp("fixture-minimal") — cached')
        const trace = await readTrace(tracePath)
        // No "onWarm-..." marker — the fixture passed no onWarm callback.
        expect(trace.slice(-2)).toEqual(['module-loaded', 'onDefault-async-only'])
    }, 30_000)

    it('cooldown: no onCooldown provided → cache is still cleared, onDefault does NOT fire', async () => {
        const { exitCode, combined } = await runFixture('warmcool-minimal.test.ts', 'cooldown', tracePath)
        expect(exitCode).toBe(0)
        expect(combined).toContain('❄️  coolDown("fixture-minimal") — no onCooldown body; clearing warmUp cache only')
        expect(combined).toContain('🗑  warmUp("fixture-minimal") cache cleared')
        const trace = await readTrace(tracePath)
        // Only "module-loaded" appended since the fixture's only top-level
        // it() got skipped and neither onCooldown nor onDefault fired.
        expect(trace.slice(-1)).toEqual(['module-loaded'])
        // The named cache file for this fixture is gone (siblings may remain).
        const cacheFileRemnants = await Bun.$`find ${path.join(warmcoolFixturesDir, '.~o/workspace.foundation/warmup-cache')} -name "*.json" -type f 2>/dev/null`.nothrow().text()
        expect(cacheFileRemnants.trim()).toBe('')
    }, 30_000)
})
