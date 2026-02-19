
import { join, dirname } from 'path'
import { readFile, writeFile } from 'fs/promises'

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
                validateSource: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { sourceDir, config }: { sourceDir: string, config: any }) {

                        const license = config.license
                        if (!license) return

                        const year = config.copyright?.year || ''
                        const author = config.copyright?.author || ''
                        const program = config.program || ''

                        console.log(`  [RepositoryLicense] Setting license '${license}' in ${sourceDir}`)

                        // 1. Set "license" property in package.json
                        const packageJsonPath = join(sourceDir, 'package.json')
                        const content = await readFile(packageJsonPath, 'utf-8')
                        const packageJson = JSON.parse(content)

                        if (packageJson.license !== license) {
                            packageJson.license = license
                            const indent = content.match(/^\{\s*\n([ \t]+)/)
                            const indentSize = indent ? indent[1].length : 2
                            await writeFile(packageJsonPath, JSON.stringify(packageJson, null, indentSize) + '\n', 'utf-8')
                            console.log(`  [RepositoryLicense] Updated package.json license: ${license}`)
                        }

                        // 2. Copy license template and replace placeholders
                        const licensesDir = join(dirname(import.meta.path), 'licenses')
                        const templatePath = join(licensesDir, `${license}.txt`)
                        let licenseText = await readFile(templatePath, 'utf-8')
                        licenseText = licenseText.replace(/\{\{year\}\}/g, String(year))
                        licenseText = licenseText.replace(/\{\{author\}\}/g, String(author))
                        licenseText = licenseText.replace(/\{\{program\}\}/g, String(program))

                        const targetPath = join(sourceDir, 'LICENSE.txt')
                        await writeFile(targetPath, licenseText, 'utf-8')
                        console.log(`  [RepositoryLicense] Wrote LICENSE.txt`)

                        // 3. Update Code license in README.md provenance footer
                        const readmePath = join(sourceDir, 'README.md')
                        const readmeContent = await readFile(readmePath, 'utf-8')
                        const updatedReadme = readmeContent.replace(/(• Code: )`[^`]*`/, `$1\`${license}\``)
                        if (updatedReadme !== readmeContent) {
                            await writeFile(readmePath, updatedReadme, 'utf-8')
                            console.log(`  [RepositoryLicense] Updated README.md Code license: ${license}`)
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
capsule['#'] = 't44/caps/features/RepositoryLicense/ProjectPublishing'
