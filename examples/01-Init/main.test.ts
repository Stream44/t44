#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/workspace-rt'

const {
    test: { describe, it, expect, beforeAll, workbenchDir, lib: { fs, path, yaml } },
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
        capsuleName: '@stream44.studio/t44/examples/01-Init/main.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

const homeDir = path.join(workbenchDir, 'init', 'home')
const workspace1Dir = path.join(workbenchDir, 'init', 'workspace1')
const workspace2Dir = path.join(workbenchDir, 'init', 'workspace2')
const workspace3Dir = path.join(workbenchDir, 'init', 'workspace3')
const env = { T44_HOME_DIR: homeDir, T44_KEYS_PASSPHRASE: 't44-test' }

async function spawnCli(cwd: string, ...args: string[]) {
    return cli.spawnCli({ cwd, args, env })
}

async function readWorkspaceConfig(workspaceDir: string): Promise<Record<string, any>> {
    const configPath = path.join(workspaceDir, '.workspace/workspace.yaml')
    const content = await fs.readFile(configPath, 'utf-8')
    return yaml.load(content) as Record<string, any>
}

describe('t44 init --from', function () {

    beforeAll(async () => {
        // Clean up and set up directories
        await fs.rm(path.join(workbenchDir, 'init'), { recursive: true, force: true })
        await fs.mkdir(homeDir, { recursive: true })
        await fs.mkdir(path.join(homeDir, '.ssh'), { recursive: true })
        await fs.mkdir(workspace1Dir, { recursive: true })
        await fs.mkdir(workspace2Dir, { recursive: true })

        // Initialize the first workspace
        const { exitCode, stdout, stderr } = await spawnCli(workspace1Dir, 'init')
        if (exitCode !== 0) {
            console.log('INIT WS1 STDOUT:', stdout)
            console.log('INIT WS1 STDERR:', stderr)
            throw new Error(`t44 init for workspace1 failed with exit code ${exitCode}`)
        }
    }, 30_000)

    it('init --from copies config from source workspace', async () => {
        const { exitCode, stdout, stderr } = await spawnCli(workspace2Dir, 'init', '--from', workspace1Dir)

        if (exitCode !== 0) {
            console.log('INIT --from STDOUT:', stdout)
            console.log('INIT --from STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
        expect(stdout).toContain('Copied home registry configuration from source workspace')
        expect(stdout).toContain('Copied workspace key configuration from source workspace')
        expect(stdout).toContain('Copied project rack configuration from source workspace')
    }, 30_000)

    it('workspace2 has same HomeRegistryConfig as workspace1', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config2 = await readWorkspaceConfig(workspace2Dir)

        const key = '#@stream44.studio/t44/structs/HomeRegistryConfig'
        expect(config2[key]).toBeDefined()
        expect(config2[key].rootDir).toBe(config1[key].rootDir)
        expect(config2[key].identifier).toBe(config1[key].identifier)
    }, 15_000)

    it('workspace2 has same WorkspaceKeyConfig as workspace1', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config2 = await readWorkspaceConfig(workspace2Dir)

        const key = '#@stream44.studio/t44/structs/WorkspaceKeyConfig'
        expect(config2[key]).toBeDefined()
        expect(config2[key].name).toBe(config1[key].name)
        expect(config2[key].identifier).toBe(config1[key].identifier)
    }, 15_000)

    it('workspace2 has same ProjectRackConfig as workspace1', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config2 = await readWorkspaceConfig(workspace2Dir)

        const key = '#@stream44.studio/t44/structs/ProjectRackConfig'
        expect(config2[key]).toBeDefined()
        expect(config2[key].name).toBe(config1[key].name)
        expect(config2[key].identifier).toBe(config1[key].identifier)
    }, 15_000)

    it('workspace2 has its own workspace name (not copied from workspace1)', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config2 = await readWorkspaceConfig(workspace2Dir)

        const key = '#@stream44.studio/t44/structs/WorkspaceConfig'
        // workspace2 should have its own name (derived from its directory name)
        expect(config2[key]).toBeDefined()
        expect(config2[key].name).toBeDefined()
        // The rootDir should point to workspace2, not workspace1
        expect(config2[key].rootDir).toBe(workspace2Dir)
        expect(config2[key].rootDir).not.toBe(config1[key].rootDir)
    }, 15_000)

    it('workspace2 has its own workspace identifier (different from workspace1)', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config2 = await readWorkspaceConfig(workspace2Dir)

        const key = '#@stream44.studio/t44/structs/WorkspaceConfig'
        // Each workspace gets its own unique identifier
        expect(config2[key].identifier).toBeDefined()
        expect(config2[key].identifier).not.toBe(config1[key].identifier)
    }, 15_000)

    it('workspace2 responds to t44 info', async () => {
        const { exitCode, stdout, stderr } = await spawnCli(workspace2Dir, 'info')

        if (exitCode !== 0) {
            console.log('INFO workspace2 STDOUT:', stdout)
            console.log('INFO workspace2 STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
        expect(stdout).toContain('workspace2')
    }, 30_000)

    it('init --from errors if current directory is already initialized', async () => {
        // workspace1 is already initialized, so running --from inside it should fail
        const { exitCode, stderr } = await spawnCli(workspace1Dir, 'init', '--from', workspace2Dir)

        expect(exitCode).not.toBe(0)
        expect(stderr).toContain('already an initialized workspace')
    }, 30_000)

})

describe('t44 init --at', function () {

    beforeAll(async () => {
        // Clean up workspace3 if it exists from a previous run
        await fs.rm(workspace3Dir, { recursive: true, force: true })
    }, 15_000)

    it('init --at creates a new workspace at the target path', async () => {
        // Run from workspace1 (already initialized) to create workspace3
        const { exitCode, stdout, stderr } = await spawnCli(workspace1Dir, 'init', '--at', workspace3Dir)

        if (exitCode !== 0) {
            console.log('INIT --at STDOUT:', stdout)
            console.log('INIT --at STDERR:', stderr)
        }

        expect(exitCode).toBe(0)

        // Verify workspace3 has a workspace config
        const config3 = await readWorkspaceConfig(workspace3Dir)
        expect(config3).toBeDefined()
    }, 30_000)

    it('workspace3 has same HomeRegistryConfig as workspace1', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config3 = await readWorkspaceConfig(workspace3Dir)

        const key = '#@stream44.studio/t44/structs/HomeRegistryConfig'
        expect(config3[key]).toBeDefined()
        expect(config3[key].rootDir).toBe(config1[key].rootDir)
        expect(config3[key].identifier).toBe(config1[key].identifier)
    }, 15_000)

    it('workspace3 has same WorkspaceKeyConfig as workspace1', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config3 = await readWorkspaceConfig(workspace3Dir)

        const key = '#@stream44.studio/t44/structs/WorkspaceKeyConfig'
        expect(config3[key]).toBeDefined()
        expect(config3[key].name).toBe(config1[key].name)
        expect(config3[key].identifier).toBe(config1[key].identifier)
    }, 15_000)

    it('workspace3 has same ProjectRackConfig as workspace1', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config3 = await readWorkspaceConfig(workspace3Dir)

        const key = '#@stream44.studio/t44/structs/ProjectRackConfig'
        expect(config3[key]).toBeDefined()
        expect(config3[key].name).toBe(config1[key].name)
        expect(config3[key].identifier).toBe(config1[key].identifier)
    }, 15_000)

    it('workspace3 is fully initialized with its own WorkspaceConfig identity', async () => {
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config3 = await readWorkspaceConfig(workspace3Dir)

        const key = '#@stream44.studio/t44/structs/WorkspaceConfig'
        expect(config3[key]).toBeDefined()
        expect(config3[key].name).toBeDefined()
        expect(config3[key].rootDir).toBe(workspace3Dir)
        expect(config3[key].rootDir).not.toBe(config1[key].rootDir)
        expect(config3[key].identifier).toBeDefined()
        expect(config3[key].identifier).not.toBe(config1[key].identifier)
    }, 15_000)

    it('workspace3 responds to t44 info', async () => {
        const { exitCode, stdout, stderr } = await spawnCli(workspace3Dir, 'info')

        if (exitCode !== 0) {
            console.log('INFO workspace3 STDOUT:', stdout)
            console.log('INFO workspace3 STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
        expect(stdout).toContain('workspace3')
    }, 30_000)

    it('workspace3 has package.json with workspace config', async () => {
        const pkgPath = path.join(workspace3Dir, 'package.json')
        const content = await fs.readFile(pkgPath, 'utf-8')
        const pkg = JSON.parse(content)

        expect(pkg.name).toBe('workspace3')
        expect(pkg.private).toBe(true)
        expect(Array.isArray(pkg.workspaces)).toBe(true)
    }, 15_000)

    it('workspace3 has tsconfig.json', async () => {
        const tsconfigPath = path.join(workspace3Dir, 'tsconfig.json')
        const content = await fs.readFile(tsconfigPath, 'utf-8')
        const tsconfig = JSON.parse(content)

        expect(tsconfig.exclude).toContain('node_modules/.bun')
        expect(Array.isArray(tsconfig.references)).toBe(true)
    }, 15_000)

    it('workspace3 has tsconfig.paths.json', async () => {
        const pathsPath = path.join(workspace3Dir, 'tsconfig.paths.json')
        const content = await fs.readFile(pathsPath, 'utf-8')
        const pathsConfig = JSON.parse(content)

        expect(pathsConfig.compilerOptions).toBeDefined()
        expect(pathsConfig.compilerOptions.baseUrl).toBe('.')
        expect(pathsConfig.compilerOptions.paths).toBeDefined()
    }, 15_000)

    it('bun install works in workspace3', async () => {
        const { spawn } = await import('bun')
        const proc = spawn(['bun', 'install'], {
            cwd: workspace3Dir,
            stdout: 'pipe',
            stderr: 'pipe',
            env: { ...process.env }
        })
        const exitCode = await proc.exited
        if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text()
            console.log('BUN INSTALL STDERR:', stderr)
        }
        expect(exitCode).toBe(0)
    }, 30_000)

    it('init --at errors if target already has a workspace', async () => {
        // workspace3 is now fully initialized from the test above
        const { exitCode, stderr } = await spawnCli(workspace1Dir, 'init', '--at', workspace3Dir)

        expect(exitCode).not.toBe(0)
        expect(stderr).toContain('already exists at')
    }, 30_000)

})
