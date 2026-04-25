import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Recursive deep merge for N sources.
 * Objects are merged recursively; arrays and primitives are replaced by later sources.
 */
export function deepMerge<T extends Record<string, any>>(...sources: (T | undefined | null)[]): T {
    const result: any = {};
    for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        for (const [key, value] of Object.entries(source)) {
            if (isPlainObject(value) && isPlainObject(result[key])) {
                result[key] = deepMerge(result[key], value);
            } else {
                result[key] = value;
            }
        }
    }
    return result as T;
}

/**
 * Three-layer recursive deep merge: defaults → structConfig → overrides.
 * Objects are merged recursively; arrays and primitives are replaced.
 * Priority: overrides > structConfig > defaults.
 */
export function deepMerge3(defaults: any, structConfig: any, overrides: any): any {
    const allKeys = new Set([
        ...Object.keys(defaults || {}),
        ...Object.keys(structConfig || {}),
        ...Object.keys(overrides || {}),
    ]);
    const result: any = {};
    for (const key of allKeys) {
        const d = defaults?.[key];
        const s = structConfig?.[key];
        const o = overrides?.[key];
        // Pick the highest-priority defined value (overrides > struct > defaults)
        // If the winning value AND its base are both plain objects, recurse
        if (o !== undefined) {
            const base = s !== undefined ? s : d;
            if (isPlainObject(o) && isPlainObject(base)) {
                result[key] = deepMerge3(d, s, o);
            } else {
                result[key] = o;
            }
        } else if (s !== undefined) {
            if (isPlainObject(s) && isPlainObject(d)) {
                result[key] = deepMerge3(d, s, undefined);
            } else {
                result[key] = s;
            }
        } else {
            result[key] = d;
        }
    }
    return result;
}

export function isPlainObject(v: any): v is Record<string, any> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export async function findPackageJson(startPath: string): Promise<{ name: string; version: string } | null> {
    let currentDir = dirname(startPath);
    const root = '/';

    while (currentDir !== root) {
        try {
            const packageJsonPath = join(currentDir, 'package.json');
            const content = await readFile(packageJsonPath, 'utf-8');
            const packageData = JSON.parse(content);

            if (packageData.name && packageData.version) {
                return {
                    name: packageData.name,
                    version: packageData.version
                };
            }
        } catch (error) {
            // package.json not found or invalid, continue searching
        }

        const parentDir = dirname(currentDir);
        if (parentDir === currentDir) break; // Reached root
        currentDir = parentDir;
    }

    return null;
}

export function getMajorVersion(version: string): number {
    const match = version.match(/^(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
}
