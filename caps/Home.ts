
import { join } from 'path'
import { homedir } from 'os'

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
            '#t44/structs/HomeRegistryConfig': {
                as: '$HomeRegistryConfig'
            },
            '#': {
                homeDir: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<string> {
                        if (process.env.T44_HOME_DIR) return process.env.T44_HOME_DIR
                        const config = await this.$HomeRegistryConfig.config
                        if (config?.homeDir) return config.homeDir
                        return homedir()
                    }
                },
                sshDir: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<string> {
                        return join(await this.homeDir, '.ssh')
                    }
                },
                registryDir: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<string> {
                        return join(await this.homeDir, '.o/workspace.foundation')
                    }
                },
                relativePath: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, fullPath: string): Promise<string> {
                        const home = await this.homeDir
                        return fullPath.startsWith(home + '/') ? fullPath.slice(home.length + 1) : fullPath
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
capsule['#'] = 't44/caps/Home'
