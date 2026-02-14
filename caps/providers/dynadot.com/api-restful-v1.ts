
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
    // Dynadot REST API v1
    // Docs: https://www.dynadot.com/domain/api-document
    // Reference impl: https://github.com/level23/dynadot-api
    // URL format: https://api.dynadot.com/restful/v1/{resource}/{resource_identify}/{action}
    // Auth: Bearer apiKey, HMAC-SHA256 signed with apiSecret
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#t44/structs/providers/dynadot.com/WorkspaceConnectionConfig': {
                as: '$ConnectionConfig'
            },
            '#': {

                call: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
                        path: string;
                        query?: Record<string, string>;
                        body?: any;
                        operation?: string;
                    }) {
                        const { createHmac, randomUUID } = await import('crypto')
                        const apiKey = await this.$ConnectionConfig.getConfigValue('apiKey')
                        const apiSecret = await this.$ConnectionConfig.getConfigValue('apiSecret')

                        const baseUrl = 'https://api.dynadot.com/restful/v1/'
                        const relativePath = options.path.replace(/^\//, '')
                        const requestId = randomUUID()

                        // Build request
                        const axiosOpts: any = {
                            method: options.method,
                            url: `${baseUrl}${relativePath}`,
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'X-Request-Id': requestId,
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                            },
                            validateStatus: () => true,
                        }

                        // For GET: params as query string, empty payload
                        // For POST/PUT: JSON body as payload
                        // Send pre-serialized string to ensure signature matches body exactly
                        let payloadJson = ''
                        if (options.method === 'GET' && options.query) {
                            axiosOpts.params = options.query
                        } else if (options.body) {
                            payloadJson = JSON.stringify(options.body)
                            axiosOpts.data = payloadJson
                        }

                        // HMAC-SHA256 signature: sign with apiSecret, relative path
                        const stringToSign = `${apiKey}\n${relativePath}\n${requestId}\n${payloadJson}`
                        const signature = createHmac('sha256', apiSecret).update(stringToSign).digest('hex')
                        axiosOpts.headers['X-Signature'] = signature

                        const response = await axios(axiosOpts)

                        if (response.status >= 400 || (response.data?.code && response.data.code >= 400)) {
                            const errorData = response.data
                            const operationName = options.operation || options.path
                            const desc = errorData?.error?.description || errorData?.message || JSON.stringify(errorData)
                            throw new Error(`Dynadot API ${operationName} failed: ${response.status} - ${desc}`)
                        }

                        return response.data
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
capsule['#'] = 't44/caps/providers/dynadot.com/api-restful-v1'

