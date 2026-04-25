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
        capsuleName: '@stream44.studio/t44/examples/04-SharedProjectRack/main.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

const homeDir = path.join(workbenchDir, 'shared-rack', 'home')
const workspace1Dir = path.join(workbenchDir, 'shared-rack', 'workspace1')
const workspace2Dir = path.join(workbenchDir, 'shared-rack', 'workspace2')
const env = { T44_HOME_DIR: homeDir, T44_KEYS_PASSPHRASE: 't44-test' }

async function spawnCli(cwd: string, ...args: string[]) {
    return cli.spawnCli({ cwd, args, env })
}

async function readWorkspaceConfig(workspaceDir: string): Promise<Record<string, any>> {
    const configPath = path.join(workspaceDir, '.workspace/workspace.yaml')
    const content = await fs.readFile(configPath, 'utf-8')
    return yaml.load(content) as Record<string, any>
}

async function execGit(cwd: string, args: string[]) {
    const { spawn } = await import('bun')
    const proc = spawn(['/opt/homebrew/bin/git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
    const exitCode = await proc.exited
    return { exitCode }
}

describe('t44 shared project rack', function () {

    beforeAll(async () => {
        // Clean up and set up directories
        await fs.rm(path.join(workbenchDir, 'shared-rack'), { recursive: true, force: true })
        await fs.mkdir(homeDir, { recursive: true })
        await fs.mkdir(workspace1Dir, { recursive: true })
    }, 15_000)

    it('init workspace1', async () => {
        const { exitCode, stdout, stderr } = await spawnCli(workspace1Dir, 'init', '--yes')

        if (exitCode !== 0) {
            console.log('INIT STDOUT:', stdout)
            console.log('INIT STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
    }, 30_000)

    it('create a project with git repo in workspace1', async () => {
        const projectDir = path.join(workspace1Dir, 'testproject')
        await fs.mkdir(projectDir, { recursive: true })

        // Initialize git repo
        await execGit(projectDir, ['init'])
        await execGit(projectDir, ['config', 'user.email', 'test@test.com'])
        await execGit(projectDir, ['config', 'user.name', 'Test User'])

        // Create initial file and commit
        await fs.writeFile(path.join(projectDir, 'README.md'), '# Test Project\n\nInitial content.\n')
        await execGit(projectDir, ['add', '.'])
        await execGit(projectDir, ['commit', '-m', 'Initial commit'])

        // Verify git repo exists
        const gitDir = path.join(projectDir, '.git')
        const gitExists = await fs.access(gitDir).then(() => true).catch(() => false)
        expect(gitExists).toBe(true)
    }, 15_000)

    it('add project config to workspace1', async () => {
        const projectDir = path.join(workspace1Dir, 'testproject')
        const config = await readWorkspaceConfig(workspace1Dir)
        const rackConfig = config['#@stream44.studio/t44/structs/ProjectRackConfig']
        const homeRegistryConfig = config['#@stream44.studio/t44/structs/HomeRegistryConfig']

        // Get first commit info
        const { $ } = await import('bun')
        const firstCommitResult = await $`git rev-list --max-parents=0 HEAD`.cwd(projectDir).quiet()
        const firstCommitHash = firstCommitResult.stdout.toString().trim()

        // Build rack repo path using a DID-like identifier
        const testProjectDid = 'did:key:z6MktestProjectFakeDidForTesting123456789abcdef'
        const rackRepoDir = path.join(
            homeRegistryConfig.rootDir,
            '@stream44.studio~t44~structs~ProjectRack',
            rackConfig.name,
            '@stream44.studio~t44~caps~ProjectRepository',
            testProjectDid
        )

        // Add project config
        const projectConfig = {
            sourceDir: projectDir,
            git: {
                firstCommitHash,
                createdAt: new Date().toISOString(),
                firstCommitAuthor: {
                    name: 'Test User',
                    email: 'test@test.com'
                },
                remotes: {
                    '@stream44.studio/t44/caps/ProjectRack': rackRepoDir
                }
            }
        }

        // Write to workspace config
        const configPath = path.join(workspace1Dir, '.workspace/workspace.yaml')
        const configContent = await fs.readFile(configPath, 'utf-8')
        const configObj = yaml.load(configContent) as Record<string, any>

        if (!configObj['#@stream44.studio/t44/structs/WorkspaceProjectsConfig']) {
            configObj['#@stream44.studio/t44/structs/WorkspaceProjectsConfig'] = { projects: {} }
        }
        configObj['#@stream44.studio/t44/structs/WorkspaceProjectsConfig'].projects =
            configObj['#@stream44.studio/t44/structs/WorkspaceProjectsConfig'].projects || {}
        configObj['#@stream44.studio/t44/structs/WorkspaceProjectsConfig'].projects.testproject = projectConfig

        await fs.writeFile(configPath, yaml.dump(configObj, { lineWidth: -1 }))

        // Initialize the rack repo (bare repo for sharing)
        await fs.mkdir(rackRepoDir, { recursive: true })
        await execGit(rackRepoDir, ['init', '--bare'])

        // Write projects.json catalog (maps project name → DID)
        const catalogDir = path.join(
            homeRegistryConfig.rootDir,
            '@stream44.studio~t44~structs~ProjectRack',
            rackConfig.name,
            '@stream44.studio~t44~caps~ProjectRepository'
        )
        const catalogPath = path.join(catalogDir, 'projects.json')
        const catalog: Record<string, string> = { testproject: testProjectDid }
        await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 4) + '\n')

        // Add rack as remote and push
        await execGit(projectDir, ['remote', 'add', 'rack', rackRepoDir])
        const pushResult = await execGit(projectDir, ['push', 'rack', 'main'])

        expect(pushResult.exitCode).toBe(0)
    }, 15_000)

    it('init workspace2 using --at from workspace1', async () => {
        const { exitCode, stdout, stderr } = await spawnCli(workspace1Dir, 'init', '--at', workspace2Dir)

        if (exitCode !== 0) {
            console.log('INIT --at STDOUT:', stdout)
            console.log('INIT --at STDERR:', stderr)
        }

        expect(exitCode).toBe(0)

        // Verify workspace2 has the same rack config
        const config1 = await readWorkspaceConfig(workspace1Dir)
        const config2 = await readWorkspaceConfig(workspace2Dir)

        const rackKey = '#@stream44.studio/t44/structs/ProjectRackConfig'
        expect(config2[rackKey]).toBeDefined()
        expect(config2[rackKey].name).toBe(config1[rackKey].name)

        // Verify workspace2 is fully initialized
        const wsKey = '#@stream44.studio/t44/structs/WorkspaceConfig'
        expect(config2[wsKey]).toBeDefined()
        expect(config2[wsKey].name).toBeDefined()
        expect(config2[wsKey].rootDir).toBe(workspace2Dir)
    }, 30_000)

    it('workspace2 responds to t44 info', async () => {
        const { exitCode, stdout, stderr } = await spawnCli(workspace2Dir, 'info')

        if (exitCode !== 0) {
            console.log('INFO workspace2 STDOUT:', stdout)
            console.log('INFO workspace2 STDERR:', stderr)
        }

        expect(exitCode).toBe(0)
    }, 30_000)

    it('pull testproject into workspace2', async () => {
        const { exitCode, stdout, stderr } = await spawnCli(workspace2Dir, 'pull', 'testproject')

        console.log('PULL ws2 STDOUT:', stdout)
        console.log('PULL ws2 STDERR:', stderr)

        expect(exitCode).toBe(0)

        // Verify project was cloned
        const projectDir = path.join(workspace2Dir, 'testproject')
        const readmeContent = await fs.readFile(path.join(projectDir, 'README.md'), 'utf-8')
        expect(readmeContent).toContain('Initial content')
    }, 30_000)

    it('make a change in workspace2, commit and push to rack', async () => {
        const projectDir = path.join(workspace2Dir, 'testproject')

        // Configure git
        await execGit(projectDir, ['config', 'user.email', 'test2@test.com'])
        await execGit(projectDir, ['config', 'user.name', 'Test User 2'])

        // Make a change
        await fs.writeFile(path.join(projectDir, 'README.md'), '# Test Project\n\nInitial content.\n\nChange from workspace2.\n')
        await execGit(projectDir, ['add', '.'])
        await execGit(projectDir, ['commit', '-m', 'Change from workspace2'])

        // Get rack repo path from workspace2 config
        const config2 = await readWorkspaceConfig(workspace2Dir)
        const projectConfig = config2['#@stream44.studio/t44/structs/WorkspaceProjectsConfig']?.projects?.testproject
        const rackRepoDir = projectConfig?.git?.remotes?.['@stream44.studio/t44/caps/ProjectRack']

        expect(rackRepoDir).toBeDefined()

        // Push to rack
        const pushResult = await execGit(projectDir, ['push', rackRepoDir, 'main'])
        expect(pushResult.exitCode).toBe(0)
    }, 15_000)

    it('pull changes in workspace1 and verify', async () => {
        const { exitCode, stdout, stderr } = await spawnCli(workspace1Dir, 'pull', 'testproject')

        if (exitCode !== 0) {
            console.log('PULL workspace1 STDOUT:', stdout)
            console.log('PULL workspace1 STDERR:', stderr)
        }

        expect(exitCode).toBe(0)

        // Verify the change from workspace2 is now in workspace1
        const projectDir = path.join(workspace1Dir, 'testproject')
        const readmeContent = await fs.readFile(path.join(projectDir, 'README.md'), 'utf-8')
        expect(readmeContent).toContain('Change from workspace2')
    }, 30_000)

})
