

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {

    // https://docs.bunny.net/api-reference/core/pull-zone/list-pull-zones
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#t44/structs/providers/bunny.net/ProjectDeploymentFact.v0': {
                as: '$ProjectDeploymentFact'
            },
            '#': {

                api: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './api.v0'
                },

                listZones: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options?: { page?: number; perPage?: number; search?: string; includeCertificate?: boolean }) {
                        const params: Record<string, string | number | boolean> = {};
                        if (options?.page !== undefined) {
                            params.page = options.page;
                        }
                        if (options?.perPage !== undefined) {
                            params.perPage = options.perPage;
                        }
                        if (options?.search) {
                            params.search = options.search;
                        }
                        if (options?.includeCertificate !== undefined) {
                            params.includeCertificate = options.includeCertificate;
                        }

                        const result = await this.api.call({
                            method: 'GET',
                            url: 'https://api.bunny.net/pullzone',
                            params,
                            operation: 'listZones'
                        });

                        await this.$ProjectDeploymentFact.set('pull-zones', 'list', 'PaginationListModelOfPullZoneModel', result);

                        return result;
                    }
                },

                createZone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        name: string;
                        originUrl: string;
                        storageZoneId?: number;
                        type?: 'Premium' | 'Standard';
                    }) {
                        const requestBody: any = {
                            Name: options.name,
                            OriginUrl: options.originUrl,
                        };

                        if (options.storageZoneId !== undefined) {
                            requestBody.StorageZoneId = options.storageZoneId;
                        }
                        if (options.type) {
                            requestBody.Type = options.type;
                        }

                        return await this.api.call({
                            method: 'POST',
                            url: 'https://api.bunny.net/pullzone',
                            data: requestBody,
                            operation: 'createZone'
                        });
                    }
                },

                ensureZone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        name: string;
                        originUrl: string;
                        storageZoneId?: number;
                        type?: 'Premium' | 'Standard';
                    }) {
                        const result = await this.listZones({ search: options.name });
                        const zones = result.Items || result;
                        const existingZone = zones.find((zone: any) => zone.Name === options.name);

                        if (existingZone) {
                            return await this.getZone(existingZone.Id);
                        }

                        return await this.createZone(options);
                    }
                },

                getZone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, id: number) {
                        const pullZone = await this.api.call({
                            method: 'GET',
                            url: `https://api.bunny.net/pullzone/${id}`,
                            operation: 'getZone'
                        });

                        if (pullZone && pullZone.Name) {
                            await this.$ProjectDeploymentFact.set('pull-zones', pullZone.Name, 'PullZoneModel', pullZone);
                        }

                        return pullZone;
                    }
                },

                deleteZone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, id: number) {
                        return await this.api.call({
                            method: 'DELETE',
                            url: `https://api.bunny.net/pullzone/${id}`,
                            operation: 'deleteZone'
                        });
                    }
                },

                purgeZone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, id: number, options?: { cacheTag?: string }) {
                        const requestBody: any = {};

                        if (options?.cacheTag) {
                            requestBody.CacheTag = options.cacheTag;
                        }

                        return await this.api.call({
                            method: 'POST',
                            url: `https://api.bunny.net/pullzone/${id}/purgeCache`,
                            data: requestBody,
                            operation: 'purgeZone'
                        });
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
capsule['#'] = 't44/caps/providers/bunny.net/api-pull.v0'

