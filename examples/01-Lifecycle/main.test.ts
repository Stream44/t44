#!/usr/bin/env bun test
// Set VERBOSE=1 to see stdout/stderr from spawned t44 commands

export const testConfig = {
    group: 'lifecycle',
    runOnAll: false,
}

import { join } from 'path'
import { mkdir, writeFile, rm, stat } from 'fs/promises'
import * as bunTest from 'bun:test'
import { run } from 't44/workspace-rt'

const {
    test: { describe, it, expect, beforeAll, workbenchDir },
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest',
                    options: {
                        '#': {
                            bunTest,
                        }
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: 't44/examples/01-Lifecycle/main.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

const t44Bin = join(import.meta.dir, '../../bin/t44')
const bunExe = Bun.which('bun')

const homeDir = join(workbenchDir, 'lifecycle', 'home')
const repoDir = join(workbenchDir, 'lifecycle', 'repo')
const env = { ...process.env, T44_HOME_DIR: homeDir, T44_KEYS_PASSPHRASE: 't44-test' }

async function runT44(...args: string[]) {
    const proc = Bun.spawn([bunExe!, t44Bin, ...args, '--yes'], {
        env,
        cwd: repoDir,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'pipe',
    })
    proc.stdin.end()

    const timeout = setTimeout(() => proc.kill(), 15_000)

    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []

    const verbose = !!process.env.VERBOSE

    const stdoutReader = new WritableStream({
        write(chunk) {
            const text = new TextDecoder().decode(chunk)
            stdoutChunks.push(text)
            if (verbose) process.stdout.write(text)
        }
    })

    const stderrReader = new WritableStream({
        write(chunk) {
            const text = new TextDecoder().decode(chunk)
            stderrChunks.push(text)
            if (verbose) process.stderr.write(text)
        }
    })

    const [exitCode] = await Promise.all([
        proc.exited,
        proc.stdout.pipeTo(stdoutReader),
        proc.stderr.pipeTo(stderrReader),
    ])

    clearTimeout(timeout)

    return { exitCode, stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') }
}

describe('t44 lifecycle', function () {

    beforeAll(async () => {
        await rm(join(workbenchDir, 'lifecycle'), { recursive: true, force: true })
        await mkdir(homeDir, { recursive: true })
        await mkdir(join(homeDir, '.ssh'), { recursive: true })
        await mkdir(repoDir, { recursive: true })
        // Note: .workspace/workspace.yaml is now created automatically by t44 init
    })

    it('init --yes initializes workspace', async () => {
        const { exitCode, stdout, stderr } = await runT44('init')

        console.log('STDOUT:', stdout)
        console.log('STDERR:', stderr)
        console.log('EXIT CODE:', exitCode)

        expect(exitCode).toBe(0)

        // Verify registry was created
        const registryDir = join(homeDir, '.o/workspace.foundation')
        const registryStat = await stat(registryDir)
        expect(registryStat.isDirectory()).toBe(true)

        // Verify SSH keys were created
        const sshDir = join(homeDir, '.ssh')
        const rootKeyStat = await stat(join(sshDir, 'id_t44_ed25519'))
        expect(rootKeyStat.isFile()).toBe(true)

        const signingKeyStat = await stat(join(sshDir, 'id_t44_signing_ed25519'))
        expect(signingKeyStat.isFile()).toBe(true)
    }, 15_000)

    it('activate — bin/activate.ts outputs shell exports', async () => {
        const activateBin = join(import.meta.dir, '../../bin/activate.ts')
        const proc = Bun.spawn([bunExe!, activateBin, '--yes'], {
            env,
            cwd: repoDir,
            stdout: 'pipe',
            stderr: 'pipe',
            stdin: 'pipe',
        })
        proc.stdin.end()

        const timeout = setTimeout(() => proc.kill(), 15_000)

        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []

        const verbose = !!process.env.VERBOSE

        const stdoutReader = new WritableStream({
            write(chunk) {
                const text = new TextDecoder().decode(chunk)
                stdoutChunks.push(text)
                if (verbose) process.stdout.write(text)
            }
        })

        const stderrReader = new WritableStream({
            write(chunk) {
                const text = new TextDecoder().decode(chunk)
                stderrChunks.push(text)
                if (verbose) process.stderr.write(text)
            }
        })

        const [exitCode] = await Promise.all([
            proc.exited,
            proc.stdout.pipeTo(stdoutReader),
            proc.stderr.pipeTo(stderrReader),
        ])

        clearTimeout(timeout)

        const stdout = stdoutChunks.join('')
        const stderr = stderrChunks.join('')

        if (exitCode !== 0) {
            console.log('STDOUT:', stdout)
            console.log('STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
        expect(stdout.length).toBeGreaterThan(0)
        expect(stdout).toContain('export ')
    }, 15_000)

    it('info — displays workspace information', async () => {
        const { exitCode, stdout, stderr } = await runT44('info', '--full')

        if (exitCode !== 0) {
            console.log('STDOUT:', stdout)
            console.log('STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
        expect(stdout).toContain('WORKSPACE INFORMATION')
        expect(stdout).toContain('repo')
        expect(stdout).toContain('did:key:')
        expect(stdout).toContain('CONFIGURATION FILES')
    }, 15_000)

    it('activate — outputs shell export statements', async () => {
        const { exitCode, stdout, stderr } = await runT44('activate')

        if (exitCode !== 0) {
            console.log('STDOUT:', stdout)
            console.log('STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
        expect(stdout).toContain('export ')
        expect(stdout).toContain('F_WORKSPACE_DIR')
    }, 15_000)

    it('query — displays workspace model', async () => {
        const { exitCode, stdout, stderr } = await runT44('query', '--full')

        if (exitCode !== 0) {
            console.log('STDOUT:', stdout)
            console.log('STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
        expect(stdout).toContain('WorkspaceConfig')
    }, 15_000)

})
