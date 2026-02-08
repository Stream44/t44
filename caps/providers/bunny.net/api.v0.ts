
import axios from 'axios';

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    // https://docs.bunny.net/api-reference/core
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#t44/structs/providers/bunny.net/WorkspaceConnectionConfig.v0': {
                as: '$ConnectionConfig'
            },
            '#': {

                call: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
                        url: string;
                        data?: any;
                        params?: Record<string, string | number | boolean>;
                        operation?: string;
                        headers?: Record<string, string>;
                    }) {
                        const apiKey = options.headers?.AccessKey || await this.$ConnectionConfig.getConfigValue('apiKey')

                        try {
                            const config: any = {
                                method: options.method,
                                url: options.url,
                                headers: options.headers || {
                                    'AccessKey': apiKey
                                }
                            };

                            if (options.data) {
                                if (!config.headers['Content-Type']) {
                                    config.headers['Content-Type'] = 'application/json';
                                }
                                config.data = options.data;
                            }

                            if (options.params) {
                                config.params = options.params;
                            }

                            const response = await axios(config);
                            return response.data;
                        } catch (error: any) {
                            if (error.response) {
                                const errorData = error.response.data;
                                const status = error.response.status;
                                const statusText = error.response.statusText;

                                const operationName = options.operation || options.method;
                                console.error(`Bunny API Error [${operationName}]:`);
                                console.error(`  Status: ${status} ${statusText}`);
                                console.error(`  Response:`, JSON.stringify(errorData, null, 2));

                                let errorMessage = `Bunny API ${operationName} failed: ${status} ${statusText}`;

                                if (errorData && typeof errorData === 'object') {
                                    if (errorData.Message) {
                                        errorMessage += ` - ${errorData.Message}`;
                                    } else if (errorData.ErrorKey) {
                                        errorMessage += ` - ${errorData.ErrorKey}`;
                                    } else {
                                        errorMessage += ` - ${JSON.stringify(errorData)}`;
                                    }
                                }

                                throw new Error(errorMessage);
                            }
                            throw error;
                        }
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
capsule['#'] = 't44/caps/providers/bunny.net/api.v0'

