
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
            '#': {
                homeDir: {
                    type: CapsulePropertyTypes.GetterFunction,
                    value: async function (this: any): Promise<string> {
                        return process.env.T44_HOME_DIR || homedir()
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
