
import * as crypto from 'crypto'

/**
 * Encrypt a string using AES-256-GCM with a key derived from the private key
 */
export function encryptString(plaintext: string, privateKeyBase64: string): string {
    // Derive a 32-byte symmetric key from the private key using SHA-256
    const keyBytes = Buffer.from(privateKeyBase64, 'base64')
    const symmetricKey = crypto.createHash('sha256').update(keyBytes).digest()
    
    // Generate a random IV
    const iv = crypto.randomBytes(16)
    
    // Encrypt using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, iv)
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ])
    const authTag = cipher.getAuthTag()
    
    // Combine IV + authTag + encrypted data and encode as base64
    const combined = Buffer.concat([iv, authTag, encrypted])
    return combined.toString('base64')
}

/**
 * Decrypt a string using AES-256-GCM with a key derived from the private key
 */
export function decryptString(ciphertext: string, privateKeyBase64: string): string {
    // Derive the same symmetric key from the private key
    const keyBytes = Buffer.from(privateKeyBase64, 'base64')
    const symmetricKey = crypto.createHash('sha256').update(keyBytes).digest()
    
    // Decode the combined data
    const combined = Buffer.from(ciphertext, 'base64')
    
    // Extract IV (16 bytes), authTag (16 bytes), and encrypted data
    const iv = combined.subarray(0, 16)
    const authTag = combined.subarray(16, 32)
    const encrypted = combined.subarray(32)
    
    // Decrypt using AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ])
    
    return decrypted.toString('utf8')
}
