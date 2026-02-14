
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    // Low level API that maps the GitHub REST API.
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#t44/structs/providers/github.com/WorkspaceConnectionConfig': {
                as: '$ConnectionConfig'
            },
            '#': {
                // @see https://docs.github.com/en/rest
                apiHeaders: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any) {
                        const apiToken = await this.$ConnectionConfig.getConfigValue('apiToken')
                        return {
                            'Authorization': `Bearer ${apiToken}`,
                            'Accept': 'application/vnd.github+json',
                            'X-GitHub-Api-Version': '2022-11-28'
                        }
                    }
                },
                getRepo: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { owner, repo }: { owner: string, repo: string }) {
                        const headers = await this.apiHeaders
                        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
                        if (response.status === 404) return null
                        if (!response.ok) {
                            throw new Error(`GitHub API error: ${response.status} ${await response.text()}`)
                        }
                        return response.json()
                    }
                },
                createRepo: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { org, name, isPrivate, description }: { org?: string, name: string, isPrivate?: boolean, description?: string }) {
                        const headers = await this.apiHeaders
                        const url = org
                            ? `https://api.github.com/orgs/${org}/repos`
                            : `https://api.github.com/user/repos`
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name,
                                private: isPrivate ?? false,
                                description: description || '',
                                auto_init: false
                            })
                        })
                        if (!response.ok) {
                            throw new Error(`GitHub API error creating repo: ${response.status} ${await response.text()}`)
                        }
                        return response.json()
                    }
                },
                listBranches: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { owner, repo }: { owner: string, repo: string }) {
                        const headers = await this.apiHeaders
                        const branches: Array<{ name: string, commit: string }> = []
                        let page = 1
                        while (true) {
                            const response = await fetch(
                                `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
                                { headers }
                            )
                            if (!response.ok) {
                                throw new Error(`GitHub API error: ${response.status} ${await response.text()}`)
                            }
                            const data = await response.json() as any[]
                            if (data.length === 0) break
                            for (const b of data) {
                                branches.push({ name: b.name, commit: b.commit.sha })
                            }
                            if (data.length < 100) break
                            page++
                        }
                        return branches
                    }
                },
                ensureRepo: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { owner, repo, isPrivate, description }: { owner: string, repo: string, isPrivate?: boolean, description?: string }) {
                        const existing = await this.getRepo({ owner, repo })
                        if (existing) {
                            return { created: false, repo: existing }
                        }
                        const created = await this.createRepo({
                            org: owner,
                            name: repo,
                            isPrivate,
                            description
                        })
                        return { created: true, repo: created }
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/caps/providers/github.com/api'
