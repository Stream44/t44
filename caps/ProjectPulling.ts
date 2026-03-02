
import { join, resolve } from 'path'
import { $ } from 'bun'
import chalk from 'chalk'

// ── Provider Lifecycle Steps ─────────────────────────────────────────
// Each pull provider capsule can implement these methods:
//
//   1. parseUrl     — parse a URL and return { owner, repo, branch } or null
//   2. prepare      — clone/fetch the mirror repo, checkout the branch
//   3. pull         — generate diff and apply to sourceDir
//
// Every method receives { config, ctx } where:
//   config  = the provider's own config entry (with .capsule and .config)
//   ctx     = shared pullingContext for the current operation

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#@stream44.studio/t44/structs/WorkspaceConfig': {
                as: '$WorkspaceConfig'
            },
            '#@stream44.studio/t44/structs/ProjectPullingConfig': {
                as: '$WorkspacePulling'
            },
            '#@stream44.studio/t44/structs/ProjectPublishingConfig': {
                as: '$WorkspaceRepositories'
            },
            '#': {
                WorkspaceConfig: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceConfig'
                },
                ProjectRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectRepository'
                },
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { args }: any): Promise<void> {

                        const { url } = args

                        if (!url) {
                            console.error(chalk.red('\n[t44] ERROR: A URL argument is required.'))
                            console.error(chalk.red('  Usage: t44 pull <url>'))
                            console.error(chalk.red('  Example: t44 pull https://github.com/Stream44/FramespaceGenesis/tree/fixes\n'))
                            process.exit(1)
                        }

                        // ── Dynamic provider loader ──────────────────────────
                        const providerCache = new Map<string, any>()
                        const getProvider = async (uri: string) => {
                            const cleanUri = uri.startsWith('#') ? uri.substring(1) : uri
                            if (!providerCache.has(cleanUri)) {
                                const { api } = await this.self.importCapsule({ uri: cleanUri })
                                providerCache.set(cleanUri, api)
                            }
                            return providerCache.get(cleanUri)!
                        }

                        // ── Load pulling config ──────────────────────────────
                        const pullingConfig = await this.$WorkspacePulling.config

                        const globalProviders: any[] = Array.isArray(pullingConfig?.providers)
                            ? pullingConfig.providers
                            : []

                        if (globalProviders.length === 0) {
                            console.error(chalk.red('\n[t44] ERROR: No pulling providers configured.'))
                            console.error(chalk.red('  Add providers under "#@stream44.studio/t44/structs/ProjectPullingConfig" in workspace.yaml\n'))
                            process.exit(1)
                        }

                        // ── STEP 1: parseUrl — ask each provider to parse the URL ──
                        console.log(`\n[t44] Parsing URL: ${chalk.cyan(url)}\n`)

                        let parsedUrl: any = null
                        let matchedProviderConfig: any = null

                        for (const providerConfig of globalProviders) {
                            if (providerConfig.enabled === false) continue

                            const provider = await getProvider(providerConfig.capsule)
                            if (typeof provider.parseUrl !== 'function') continue

                            const result = await provider.parseUrl({ config: providerConfig, url })
                            if (result) {
                                parsedUrl = result
                                matchedProviderConfig = providerConfig
                                console.log(chalk.green(`   ✓ URL parsed by '${providerConfig.capsule}'`))
                                console.log(chalk.gray(`     owner: ${result.owner}, repo: ${result.repo}, branch: ${result.branch}\n`))
                                break
                            }
                        }

                        if (!parsedUrl || !matchedProviderConfig) {
                            console.error(chalk.red('\n[t44] ERROR: No pull provider could parse the URL.'))
                            console.error(chalk.red(`  URL: ${url}`))
                            console.error(chalk.red(`  Configured providers:`))
                            for (const p of globalProviders) {
                                console.error(chalk.red(`    - ${p.capsule} (enabled: ${p.enabled !== false})`))
                            }
                            console.error(chalk.red(`\n  Make sure a provider for this URL type is configured.\n`))
                            process.exit(1)
                        }

                        // ── STEP 2: Find matching publishing repository ──────
                        const publishingConfig = await this.$WorkspaceRepositories.config

                        if (!publishingConfig?.repositories) {
                            console.error(chalk.red('\n[t44] ERROR: No publishing repositories configured.'))
                            console.error(chalk.red('  Cannot match URL to a local project without publishing config.\n'))
                            process.exit(1)
                        }

                        let matchedRepoName: string | null = null
                        let matchedRepoConfig: any = null

                        for (const [repoName, repoConfig] of Object.entries(publishingConfig.repositories)) {
                            const typedConfig = repoConfig as any
                            const providers: any[] = Array.isArray(typedConfig.providers) ? typedConfig.providers : []

                            for (const provider of providers) {
                                // Match against GitHub publishing provider config
                                if (provider.capsule === '@stream44.studio/t44-github.com/caps/ProjectPublishing') {
                                    const settings = provider.config?.RepositorySettings
                                    if (settings?.owner === parsedUrl.owner && settings?.repo === parsedUrl.repo) {
                                        matchedRepoName = repoName
                                        matchedRepoConfig = typedConfig
                                        break
                                    }
                                }
                            }
                            if (matchedRepoName) break
                        }

                        if (!matchedRepoName || !matchedRepoConfig) {
                            console.error(chalk.red(`\n[t44] ERROR: No matching publishing repository found for ${parsedUrl.owner}/${parsedUrl.repo}.`))
                            console.error(chalk.red(`  The URL points to '${parsedUrl.owner}/${parsedUrl.repo}' but no repository in`))
                            console.error(chalk.red(`  "#@stream44.studio/t44/structs/ProjectPublishingConfig" has a GitHub provider with matching owner/repo.`))
                            console.error(chalk.red(`\n  Configured repositories:`))
                            for (const rn of Object.keys(publishingConfig.repositories)) {
                                console.error(chalk.red(`    - ${rn}`))
                            }
                            console.error('')
                            process.exit(1)
                        }

                        const sourceDir = resolve(matchedRepoConfig.sourceDir)
                        console.log(chalk.green(`   ✓ Matched repository: '${matchedRepoName}'`))
                        console.log(chalk.gray(`     sourceDir: ${sourceDir}\n`))

                        // ── STEP 3: prepare — ensure sourceDir has no uncommitted changes ──
                        console.log('[t44] Preparing: checking for uncommitted changes ...\n')

                        const statusResult = await $`git status --porcelain`.cwd(sourceDir).quiet().nothrow()
                        const statusOutput = statusResult.text().trim()

                        if (statusOutput.length > 0) {
                            console.error(chalk.red(`\n[t44] ERROR: sourceDir has uncommitted changes. Commit or stash them first.`))
                            console.error(chalk.red(`  sourceDir: ${sourceDir}`))
                            console.error(chalk.red(`  Changes:\n`))
                            for (const line of statusOutput.split('\n').slice(0, 20)) {
                                console.error(chalk.red(`    ${line}`))
                            }
                            if (statusOutput.split('\n').length > 20) {
                                console.error(chalk.red(`    ... and ${statusOutput.split('\n').length - 20} more`))
                            }
                            console.error('')
                            process.exit(1)
                        }

                        console.log(chalk.green(`   ✓ sourceDir is clean\n`))

                        // ── STEP 4: Set up mirror repo ───────────────────────
                        // Reuse the publishing stage repo as a fast clone source if it exists.
                        // The mirror lives in its own ProjectPulling projection dir.

                        const pullingApi = {
                            getProjectionDir: (capsuleName: string) => join(
                                this.WorkspaceConfig.workspaceRootDir,
                                '.~o/workspace.foundation/@t44.sh~t44~caps~ProjectPulling',
                                capsuleName.replace(/\//g, '~')
                            ),
                        }

                        const ctx = {
                            parsedUrl,
                            matchedRepoName,
                            matchedRepoConfig,
                            sourceDir,
                            publishingConfig,
                            pullingApi,
                            metadata: {} as Record<string, any>,
                        }

                        // ── STEP 5: Call provider prepare + pull ─────────────
                        const provider = await getProvider(matchedProviderConfig.capsule)

                        if (typeof provider.prepare === 'function') {
                            console.log('[t44] Preparing mirror repository ...\n')
                            await provider.prepare({ config: matchedProviderConfig, ctx })
                        }

                        if (typeof provider.pull !== 'function') {
                            console.error(chalk.red(`\n[t44] ERROR: Provider '${matchedProviderConfig.capsule}' does not implement 'pull'.`))
                            process.exit(1)
                        }

                        console.log('[t44] Pulling changes ...\n')
                        await provider.pull({ config: matchedProviderConfig, ctx })

                        console.log(chalk.green('\n[t44] Pull complete!'))
                    }
                }
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@stream44.studio/t44/caps/ProjectPulling'
