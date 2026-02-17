
import { execSync } from 'child_process'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'

export interface Ed25519KeyInfo {
    name: string
    privateKeyPath: string
    publicKey: string
}

export interface KeyConfig {
    name: string
    privateKeyPath: string
    publicKey: string
    keyFingerprint: string
}

/**
 * Extract the SHA256 fingerprint from ssh-keygen -lf output.
 * Output format: "256 SHA256:xxx comment (ED25519)"
 */
export function extractFingerprint(sshKeygenOutput: string): string {
    const match = sshKeygenOutput.match(/(SHA256:\S+)/)
    return match ? match[1] : sshKeygenOutput
}

/**
 * Compute the SHA256 fingerprint of a key file.
 */
export function computeFingerprint(privateKeyPath: string): string {
    return extractFingerprint(execSync(
        `ssh-keygen -lf ${JSON.stringify(privateKeyPath)}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim())
}

/**
 * Check whether an Ed25519 private key has a passphrase set.
 */
export function hasPassphrase(privateKeyPath: string): boolean {
    try {
        execSync(
            `ssh-keygen -y -P "" -f ${JSON.stringify(privateKeyPath)}`,
            { stdio: 'pipe' }
        )
        return false // empty passphrase worked → no passphrase
    } catch {
        return true // empty passphrase failed → has passphrase
    }
}

/**
 * Discover existing Ed25519 keys in the given SSH directory.
 */
export async function discoverEd25519Keys(sshDir: string): Promise<Ed25519KeyInfo[]> {
    const dir = sshDir
    const keys: Ed25519KeyInfo[] = []

    let entries: string[]
    try {
        entries = await readdir(dir)
    } catch {
        return keys
    }

    const pubFiles = entries.filter(f => f.endsWith('.pub'))

    for (const pubFile of pubFiles) {
        try {
            const pubPath = join(dir, pubFile)
            const content = await readFile(pubPath, 'utf-8')
            const trimmed = content.trim()

            if (!trimmed.startsWith('ssh-ed25519 ')) {
                continue
            }

            const privateName = pubFile.replace(/\.pub$/, '')
            const privatePath = join(dir, privateName)

            try {
                await stat(privatePath)
            } catch {
                continue
            }

            keys.push({
                name: privateName,
                privateKeyPath: privatePath,
                publicKey: trimmed
            })
        } catch {
            // Skip unreadable files
        }
    }

    return keys
}

/**
 * Check if a key file exists at the given path.
 */
export async function keyFileExists(privateKeyPath: string): Promise<boolean> {
    try {
        const s = await stat(privateKeyPath)
        return s.isFile()
    } catch {
        return false
    }
}

/**
 * Check if the key is loaded in the ssh-agent by fingerprint.
 */
export function isKeyInAgent(privateKeyPath: string): boolean {
    let keyFingerprint: string
    try {
        const fpOutput = execSync(
            `ssh-keygen -lf ${JSON.stringify(privateKeyPath)}`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim()
        const match = fpOutput.match(/(SHA256:\S+)/)
        keyFingerprint = match ? match[1] : ''
    } catch {
        return false
    }

    if (!keyFingerprint) return false

    try {
        const agentKeys = execSync('ssh-add -l', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        })
        return agentKeys.includes(keyFingerprint)
    } catch {
        return false
    }
}

/**
 * Add a key to the macOS ssh-agent with Keychain storage.
 * Returns true if added successfully, false otherwise.
 */
export function addKeyToAgent(privateKeyPath: string): boolean {
    try {
        execSync(
            `ssh-add --apple-use-keychain ${JSON.stringify(privateKeyPath)}`,
            { stdio: 'inherit' }
        )
        return true
    } catch {
        return false
    }
}

/**
 * Ensure a key is loaded in the ssh-agent. Adds it if not already present.
 * Logs status messages using chalk.
 * Skips adding to agent in non-TTY mode (e.g., CI environments).
 */
export async function ensureKeyInAgent(privateKeyPath: string, keyName: string, keyLabel: string): Promise<void> {
    const chalk = (await import('chalk')).default

    // Skip ssh-agent operations in non-TTY mode (CI, scripts, etc.)
    if (!process.stdin.isTTY || process.env.CI) {
        return
    }

    if (isKeyInAgent(privateKeyPath)) {
        return
    }

    console.log(chalk.gray(`\n   Adding ${keyLabel} '${keyName}' to ssh-agent (macOS Keychain) ...`))
    if (addKeyToAgent(privateKeyPath)) {
        console.log(chalk.green(`   ✓ ${keyLabel} added to ssh-agent`))
        console.log(chalk.gray(`     Passphrase stored in macOS Keychain.\n`))
    } else {
        console.log(chalk.yellow(`\n   ⚠  Could not add key to ssh-agent`))
        console.log(chalk.yellow(`     You may need to enter the passphrase manually when the key is used.\n`))
    }
}

/**
 * Prompt for a passphrase using inquirer (password input with confirmation).
 * Returns null in non-TTY mode (CI environments).
 */
export async function promptPassphrase(): Promise<string | null> {
    // Skip prompting in non-TTY mode (CI, scripts, etc.)
    if (!process.stdin.isTTY || process.env.CI) {
        return null
    }

    const inquirer = await import('inquirer')
    const chalk = (await import('chalk')).default

    try {
        const { passphrase } = await inquirer.default.prompt([
            {
                type: 'password',
                name: 'passphrase',
                message: 'Enter a passphrase for the key:',
                mask: '*',
                validate: (input: string) => {
                    if (!input || input.length === 0) {
                        return 'Passphrase cannot be empty'
                    }
                    if (input.length < 5) {
                        return 'Passphrase must be at least 5 characters'
                    }
                    return true
                }
            }
        ])

        const { confirm } = await inquirer.default.prompt([
            {
                type: 'password',
                name: 'confirm',
                message: 'Confirm passphrase:',
                mask: '*',
                validate: (input: string) => {
                    if (input !== passphrase) {
                        return 'Passphrases do not match'
                    }
                    return true
                }
            }
        ])

        return passphrase
    } catch (error: any) {
        if (error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
            console.log(chalk.red('\n\nABORTED\n'))
            process.exit(0)
        }
        throw error
    }
}

/**
 * Ensure a key has a passphrase. If not, prompt the user to set one.
 */
export async function ensurePassphrase(privateKeyPath: string, keyName: string, keyLabel: string): Promise<boolean> {
    const chalk = (await import('chalk')).default

    if (hasPassphrase(privateKeyPath)) {
        return true
    }

    console.log(chalk.yellow(`\n   ⚠  ${keyLabel} '${keyName}' has no passphrase`))
    console.log(chalk.gray(`   A passphrase is required to protect the key. The passphrase will be stored`))
    console.log(chalk.gray(`   in the macOS Keychain so you won't need to enter it again.\n`))

    const passphrase = await promptPassphrase()
    if (!passphrase) {
        console.log(chalk.red(`\n   ✗ A passphrase is required for the ${keyLabel.toLowerCase()}.\n`))
        return false
    }

    console.log(chalk.gray(`\n   Setting passphrase on ${privateKeyPath} ...`))
    try {
        execSync(
            `ssh-keygen -p -f ${JSON.stringify(privateKeyPath)} -P "" -N ${JSON.stringify(passphrase)}`,
            { stdio: 'pipe' }
        )
    } catch (error: any) {
        console.log(chalk.red(`\n   ✗ Failed to set passphrase: ${error.message}\n`))
        return false
    }

    console.log(chalk.green(`   ✓ Passphrase set on ${keyLabel.toLowerCase()} '${keyName}'\n`))
    return true
}

/**
 * Generate a new Ed25519 SSH key with a passphrase.
 * Returns the key info or null on failure.
 */
export async function generateEd25519Key(
    privateKeyPath: string,
    passphrase: string,
    comment: string
): Promise<{ publicKey: string; keyFingerprint: string } | null> {
    const chalk = (await import('chalk')).default
    const { mkdir } = await import('fs/promises')
    const { dirname } = await import('path')

    await mkdir(dirname(privateKeyPath), { recursive: true })

    try {
        execSync(
            `ssh-keygen -t ed25519 -f ${JSON.stringify(privateKeyPath)} -N ${JSON.stringify(passphrase)} -C ${JSON.stringify(comment)}`,
            { stdio: 'pipe' }
        )
    } catch (error: any) {
        console.log(chalk.red(`\n   ✗ Failed to generate key: ${error.message}\n`))
        return null
    }

    const pubKeyContent = await readFile(privateKeyPath + '.pub', 'utf-8')
    const publicKey = pubKeyContent.trim()
    const keyFingerprint = computeFingerprint(privateKeyPath)

    return { publicKey, keyFingerprint }
}

/**
 * Validate that a configured key exists and its fingerprint matches.
 * Returns true if valid, false otherwise (with error messages logged).
 */
export async function validateConfiguredKey(
    keyConfig: KeyConfig,
    keyLabel: string
): Promise<boolean> {
    const chalk = (await import('chalk')).default

    const exists = await keyFileExists(keyConfig.privateKeyPath)
    if (!exists) {
        console.log(chalk.red(`\n┌─────────────────────────────────────────────────────────────────┐`))
        console.log(chalk.red(`│  ✗  ${keyLabel} Error${' '.repeat(Math.max(0, 56 - keyLabel.length))}│`))
        console.log(chalk.red(`├─────────────────────────────────────────────────────────────────┤`))
        console.log(chalk.red(`│  The configured private key file is missing:                    │`))
        console.log(chalk.red(`│  ${keyConfig.privateKeyPath}`))
        console.log(chalk.red(`│                                                                 │`))
        console.log(chalk.red(`│  The private key '${keyConfig.name}' has been removed or moved.`))
        console.log(chalk.red(`│  Please restore the key file to the path above to proceed.     │`))
        console.log(chalk.red(`└─────────────────────────────────────────────────────────────────┘\n`))
        return false
    }

    let currentFingerprint: string
    try {
        currentFingerprint = computeFingerprint(keyConfig.privateKeyPath)
    } catch (error: any) {
        console.log(chalk.red(`\n┌─────────────────────────────────────────────────────────────────┐`))
        console.log(chalk.red(`│  ✗  ${keyLabel} Error${' '.repeat(Math.max(0, 56 - keyLabel.length))}│`))
        console.log(chalk.red(`├─────────────────────────────────────────────────────────────────┤`))
        console.log(chalk.red(`│  Failed to compute fingerprint for the private key at:          │`))
        console.log(chalk.red(`│  ${keyConfig.privateKeyPath}`))
        console.log(chalk.red(`│                                                                 │`))
        console.log(chalk.red(`│  The key file may be corrupted. Please restore the original     │`))
        console.log(chalk.red(`│  key file to proceed.                                           │`))
        console.log(chalk.red(`└─────────────────────────────────────────────────────────────────┘\n`))
        return false
    }

    if (currentFingerprint !== keyConfig.keyFingerprint) {
        console.log(chalk.red(`\n┌─────────────────────────────────────────────────────────────────┐`))
        console.log(chalk.red(`│  ✗  ${keyLabel} Mismatch${' '.repeat(Math.max(0, 53 - keyLabel.length))}│`))
        console.log(chalk.red(`├─────────────────────────────────────────────────────────────────┤`))
        console.log(chalk.red(`│  The private key at the configured path does not match the      │`))
        console.log(chalk.red(`│  fingerprint stored in the workspace config.                    │`))
        console.log(chalk.red(`│                                                                 │`))
        console.log(chalk.red(`│  Key name: ${keyConfig.name}`))
        console.log(chalk.red(`│  Path:     ${keyConfig.privateKeyPath}`))
        console.log(chalk.red(`│                                                                 │`))
        console.log(chalk.red(`│  The private key has changed. Please restore the original       │`))
        console.log(chalk.red(`│  private key that matches the configured fingerprint to proceed.│`))
        console.log(chalk.red(`│                                                                 │`))
        console.log(chalk.red(`│  Expected fingerprint:                                          │`))
        console.log(chalk.red(`│  ${keyConfig.keyFingerprint}`))
        console.log(chalk.red(`│                                                                 │`))
        console.log(chalk.red(`│  Current fingerprint:                                           │`))
        console.log(chalk.red(`│  ${currentFingerprint}`))
        console.log(chalk.red(`└─────────────────────────────────────────────────────────────────┘\n`))
        return false
    }

    if (!process.env.T44_KEYS_PASSPHRASE) {
        const passphraseOk = await ensurePassphrase(keyConfig.privateKeyPath, keyConfig.name, keyLabel)
        if (!passphraseOk) {
            return false
        }

        await ensureKeyInAgent(keyConfig.privateKeyPath, keyConfig.name, keyLabel)
    }

    return true
}
