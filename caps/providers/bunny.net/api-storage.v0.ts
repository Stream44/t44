
import uploadToBunny from 'upload-to-bunny'


export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {

    // https://docs.bunny.net/api-reference/core/storage-zone/
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
                    value: async function (this: any, options?: { page?: number; perPage?: number; search?: string }) {
                        const params: Record<string, string | number> = {};
                        if (options?.page !== undefined) {
                            params.page = options.page;
                        }
                        if (options?.perPage !== undefined) {
                            params.perPage = options.perPage;
                        }
                        if (options?.search) {
                            params.search = options.search;
                        }

                        const result = await this.api.call({
                            method: 'GET',
                            url: 'https://api.bunny.net/storagezone',
                            params,
                            operation: 'listZones'
                        });

                        await this.$ProjectDeploymentFact.set('storage-zones', 'list', 'StorageZoneModelList', result);

                        return result;
                    }
                },

                createZone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        name: string;
                        region: string;
                        replicationRegions?: string[];
                        zoneTier?: 'Standard' | 'Premium';
                        storageZoneType?: 'NotSupported' | 'Standard' | 'Premium';
                    }) {
                        return await this.api.call({
                            method: 'POST',
                            url: 'https://api.bunny.net/storagezone',
                            data: {
                                Name: options.name,
                                Region: options.region,
                                ReplicationRegions: options.replicationRegions || [],
                                ZoneTier: options.zoneTier || 'Standard',
                                StorageZoneType: options.storageZoneType || 'NotSupported'
                            },
                            operation: 'createZone'
                        });
                    }
                },

                ensureZone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        name: string;
                        region: string;
                        replicationRegions?: string[];
                        zoneTier?: 'Standard' | 'Premium';
                        storageZoneType?: 'NotSupported' | 'Standard' | 'Premium';
                    }) {
                        const zones = await this.listZones({ search: options.name });
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
                        const storageZone = await this.api.call({
                            method: 'GET',
                            url: `https://api.bunny.net/storagezone/${id}`,
                            operation: 'getZone'
                        });

                        if (storageZone && storageZone.Name) {
                            await this.$ProjectDeploymentFact.set('storage-zones', storageZone.Name, 'StorageZoneModel', storageZone);
                        }

                        return storageZone;
                    }
                },

                deleteZone: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, id: number, deletePullZones: boolean = true) {
                        const params: Record<string, string | boolean> = {};
                        if (!deletePullZones) {
                            params.deletePullZones = false;
                        }

                        return await this.api.call({
                            method: 'DELETE',
                            url: `https://api.bunny.net/storagezone/${id}`,
                            params,
                            operation: 'deleteZone'
                        });
                    }
                },

                listFiles: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        storageZoneName: string;
                        storageHostname: string;
                        path?: string;
                        password: string;
                    }) {
                        const path = options.path ? `/${options.path}` : '';
                        const headers = {
                            'AccessKey': options.password
                        };
                        return await this.api.call({
                            method: 'GET',
                            url: `https://${options.storageHostname}/${options.storageZoneName}${path}/`,
                            operation: 'listFiles',
                            headers: headers
                        });
                    }
                },

                uploadFile: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        storageZoneName: string;
                        storageHostname: string;
                        path?: string;
                        fileName: string;
                        data: string | Buffer;
                        password: string;
                    }) {
                        const path = options.path ? `/${options.path}` : '';
                        const headers = {
                            'AccessKey': options.password,
                            'Content-Type': 'application/octet-stream'
                        };
                        return await this.api.call({
                            method: 'PUT',
                            url: `https://${options.storageHostname}/${options.storageZoneName}${path}/${options.fileName}`,
                            data: options.data,
                            operation: 'uploadFile',
                            headers: headers
                        });
                    }
                },

                deleteFile: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        storageZoneName: string;
                        storageHostname: string;
                        path?: string;
                        fileName: string;
                        password: string;
                    }) {
                        const path = options.path ? `/${options.path}` : '';
                        const headers = {
                            'AccessKey': options.password
                        };
                        return await this.api.call({
                            method: 'DELETE',
                            url: `https://${options.storageHostname}/${options.storageZoneName}${path}/${options.fileName}`,
                            operation: 'deleteFile',
                            headers: headers
                        });
                    }
                },

                uploadDirectory: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        sourceDirectory: string;
                        destinationDirectory?: string;
                        storageZoneName: string;
                        password: string;
                        region?: string;
                        cleanDestination?: 'simple' | 'avoid-deletes';
                        maxConcurrentUploads?: number;
                    }) {

                        const uploadOptions: any = {
                            storageZoneName: options.storageZoneName,
                            accessKey: options.password,
                            maxConcurrentUploads: options.maxConcurrentUploads || 10
                        };

                        if (options.region) {
                            uploadOptions.region = options.region;
                        }

                        if (options.cleanDestination) {
                            uploadOptions.cleanDestination = options.cleanDestination;
                        }

                        return await uploadToBunny(
                            options.sourceDirectory,
                            options.destinationDirectory || '',
                            uploadOptions
                        );
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
capsule['#'] = 't44/caps/providers/bunny.net/api-storage.v0'

