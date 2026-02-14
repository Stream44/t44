
import { ed25519 } from '@ucanto/principal';
import * as Server from '@ucanto/server';


export async function generateKeypair(): Promise<{ did: string; privateKey: string }> {
    const principal = await ed25519.generate();
    // The principal itself is a Uint8Array containing the private key
    const privateKeyBytes = new Uint8Array(principal as any);
    return {
        did: principal.did(),
        privateKey: Buffer.from(privateKeyBytes).toString('base64'),
    };
}

/**
 * Extract DID from a base64-encoded private key
 * @param privateKeyBase64 - Base64-encoded private key
 * @returns The DID string
 */
export function didForPrivateKey(privateKeyBase64: string): string {
    const keyBytes = Buffer.from(privateKeyBase64, 'base64');
    const principal = ed25519.decode(new Uint8Array(keyBytes));
    return principal.did();
}

/**
 * Issue a UCAN capability delegation
 * @param options.issuerPrivateKey - Base64-encoded private key of the issuer
 * @param options.audienceDID - DID of the audience (recipient)
 * @param options.capabilities - Array of capabilities to delegate
 * @param options.expiresIn - Expiration time in seconds from now (default: 1 year)
 * @returns Base64-encoded UCAN token
 */
export async function issueCapability(options: {
    issuerPrivateKey: string;
    audienceDID: string;
    capabilities: Array<{ with: string; can: string }>;
    expiresIn?: number;
}): Promise<string> {
    // Decode the issuer's private key
    const keyBytes = Buffer.from(options.issuerPrivateKey, 'base64');
    const issuer = ed25519.decode(new Uint8Array(keyBytes));

    // Parse the audience DID
    const audience = ed25519.Verifier.parse(options.audienceDID);

    const expiresIn = options.expiresIn || 365 * 24 * 60 * 60; // 1 year
    const expiration = Math.floor(Date.now() / 1000) + expiresIn;

    const delegation = await Server.delegate({
        issuer,
        audience,
        capabilities: options.capabilities,
        expiration,
    });

    const archive = await delegation.archive();
    if (!archive.ok) {
        throw new Error('Failed to archive delegation');
    }
    return Buffer.from(archive.ok).toString('base64');
};

/**
 * Validate a UCAN capability delegation
 * @param options.ucanToken - Base64-encoded UCAN token
 * @param options.issuerDID - Expected DID of the issuer
 * @param options.expectedCapability - Expected capability (optional)
 * @returns Validation result with delegation details
 */
export async function validateCapability(options: {
    ucanToken: string;
    issuerDID: string;
    expectedCapability?: { can: string };
}): Promise<{
    valid: boolean;
    error?: string;
    issuer?: string;
    audience?: string;
    capabilities?: Array<{ with: string; can: string }>;
    expiration?: number;
}> {
    try {
        // Parse the UCAN from the token
        const carBytes = Buffer.from(options.ucanToken, 'base64');
        const result: any = await Server.Delegation.extract(carBytes);
        if (!result.ok) {
            return {
                valid: false,
                error: `Failed to parse UCAN: ${result.error.message}`,
            };
        }
        const delegation: any = result.ok;

        // Basic validation: check expiration
        const now = Math.floor(Date.now() / 1000);
        if (delegation.expiration && delegation.expiration < now) {
            return {
                valid: false,
                error: 'UCAN has expired',
            };
        }

        // Verify issuer matches expected
        if (delegation.issuer.did() !== options.issuerDID) {
            return {
                valid: false,
                error: `UCAN not issued by expected issuer. Expected: ${options.issuerDID}, Got: ${delegation.issuer.did()}`,
            };
        }

        // Validate capability if specified
        if (options.expectedCapability) {
            const capability = delegation.capabilities[0];
            if (capability.can !== options.expectedCapability.can) {
                return {
                    valid: false,
                    error: `Invalid capability: expected '${options.expectedCapability.can}', got '${capability.can}'`,
                };
            }
        }

        return {
            valid: true,
            issuer: delegation.issuer.did(),
            audience: delegation.audience.did(),
            capabilities: delegation.capabilities,
            expiration: delegation.expiration,
        };
    } catch (error: any) {
        return {
            valid: false,
            error: `Failed to validate UCAN: ${error.message}`,
        };
    }
}
