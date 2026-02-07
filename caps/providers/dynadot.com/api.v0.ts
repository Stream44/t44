
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
    // https://www.dynadot.com/domain/api-commands
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule.v0': {},
            '#@stream44.studio/t44/structs/providers/dynadot.com/WorkspaceConnectionConfig.v0': {
                as: '$ConnectionConfig'
            },
            '#': {

                call: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        command: string;
                        params?: Record<string, string | number | boolean>;
                        operation?: string;
                    }) {
                        const apiKey = await this.$ConnectionConfig.getConfigValue('apiKey')

                        const baseUrl = 'https://api.dynadot.com/api3.json';

                        // Build query params
                        const searchParams = new URLSearchParams();
                        searchParams.append('key', apiKey);
                        searchParams.append('command', options.command);

                        if (options.params) {
                            for (const [key, value] of Object.entries(options.params)) {
                                searchParams.append(key, String(value));
                            }
                        }

                        const url = `${baseUrl}?${searchParams.toString()}`;

                        try {
                            const response = await axios.get(url);
                            return response.data;
                        } catch (error: any) {
                            if (error.response) {
                                const errorData = error.response.data;
                                const status = error.response.status;
                                const statusText = error.response.statusText;

                                const operationName = options.operation || options.command;
                                console.error(`Dynadot API Error [${operationName}]:`);
                                console.error(`  Status: ${status} ${statusText}`);
                                console.error(`  Response:`, JSON.stringify(errorData, null, 2));

                                let errorMessage = `Dynadot API ${operationName} failed: ${status} ${statusText}`;

                                if (errorData && typeof errorData === 'object') {
                                    if (errorData.Message) {
                                        errorMessage += ` - ${errorData.Message}`;
                                    } else if (errorData.message) {
                                        errorMessage += ` - ${errorData.message}`;
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
capsule['#'] = '@stream44.studio/t44/caps/providers/dynadot.com/api.v0'

