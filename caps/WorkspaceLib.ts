import * as path from 'path'
import * as fsPromises from 'fs/promises'
import { constants as fsConstants, existsSync } from 'fs'
import { spawn, $ } from 'bun'
import * as childProcess from 'child_process'
import dgram from 'node:dgram'
import * as jsYaml from 'js-yaml'
import chalk from 'chalk'
import glob from 'fast-glob'
import stringify from 'json-stable-stringify'
import { config as dotenvConfig } from 'dotenv'

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
                path: {
                    type: CapsulePropertyTypes.Constant,
                    value: path,
                },

                fs: {
                    type: CapsulePropertyTypes.Constant,
                    value: {
                        ...fsPromises,
                        ...fsConstants,
                        existsSync,
                    },
                },

                childProcess: {
                    type: CapsulePropertyTypes.Constant,
                    value: childProcess,
                },

                dgram: {
                    type: CapsulePropertyTypes.Constant,
                    value: dgram,
                },

                yaml: {
                    type: CapsulePropertyTypes.Constant,
                    value: jsYaml,
                },

                $: {
                    type: CapsulePropertyTypes.Constant,
                    value: $,
                },

                chalk: {
                    type: CapsulePropertyTypes.Constant,
                    value: chalk,
                },

                glob: {
                    type: CapsulePropertyTypes.Constant,
                    value: glob,
                },

                stringify: {
                    type: CapsulePropertyTypes.Constant,
                    value: stringify,
                },

                dotenv: {
                    type: CapsulePropertyTypes.Constant,
                    value: { config: dotenvConfig },
                },

                spawnProcess: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: any): Promise<any> {
                        const {
                            cmd,
                            cwd = process.cwd(),
                            waitForReady = false,
                            readySignal = 'READY',
                            waitForExit = false,
                            showOutput = false,
                            env = {},
                            verbose = false,
                            detached = false
                        } = options;

                        const outputData = { stdout: '', stderr: '' };
                        const mergedEnv = { ...process.env, ...env };

                        if (verbose && env.NODE_ENV) {
                            console.log('[spawnProcess] Setting NODE_ENV to:', env.NODE_ENV);
                            console.log('[spawnProcess] Merged env NODE_ENV:', mergedEnv.NODE_ENV);
                        }

                        const proc = spawn({
                            cmd,
                            cwd,
                            stdout: 'pipe',
                            stderr: 'pipe',
                            env: mergedEnv
                        });

                        if (detached && proc.unref) {
                            proc.unref();
                        }

                        let readySignalFound: (() => void) | null = null;
                        const readyPromise = waitForReady ? new Promise<void>((resolve) => {
                            readySignalFound = resolve;
                        }) : null;

                        if (proc.stdout && !detached) {
                            const reader = (proc.stdout as any).getReader();
                            const decoder = new TextDecoder();
                            (async () => {
                                try {
                                    while (true) {
                                        const { done, value } = await reader.read();
                                        if (done) break;
                                        const chunk = decoder.decode(value);
                                        outputData.stdout += chunk;
                                        if (waitForReady && readySignalFound && chunk.indexOf(readySignal) !== -1) {
                                            readySignalFound();
                                            readySignalFound = null;
                                        }
                                        if (showOutput || verbose) {
                                            process.stdout.write(chunk);
                                        }
                                    }
                                } catch (e) {
                                    // Stream closed
                                }
                            })();
                        }

                        if (proc.stderr && !detached) {
                            const reader = (proc.stderr as any).getReader();
                            const decoder = new TextDecoder();
                            (async () => {
                                try {
                                    while (true) {
                                        const { done, value } = await reader.read();
                                        if (done) break;
                                        const chunk = decoder.decode(value);
                                        outputData.stderr += chunk;
                                        if (waitForReady && readySignalFound && chunk.indexOf(readySignal) !== -1) {
                                            readySignalFound();
                                            readySignalFound = null;
                                        }
                                        if (showOutput || verbose) {
                                            process.stderr.write(chunk);
                                        }
                                    }
                                } catch (e) {
                                    // Stream closed
                                }
                            })();
                        }

                        if (waitForReady && readyPromise) {
                            await Promise.race([
                                readyPromise,
                                proc.exited.then(() => {
                                    throw new Error(`Process exited with code ${proc.exitCode} before emitting ${readySignal} signal. stderr: ${outputData.stderr}`);
                                })
                            ]);
                        } else if (waitForExit) {
                            await proc.exited;
                        }

                        return {
                            process: proc,
                            stdout: outputData.stdout,
                            stderr: outputData.stderr,
                            exitCode: proc.exitCode ?? 0,
                            getStdout: () => outputData.stdout,
                            getStderr: () => outputData.stderr
                        };
                    }
                },

                runPackageScript: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: any): Promise<any> {
                        const {
                            runtime = 'bun',
                            script,
                            args = [],
                            cwd,
                            env,
                            verbose = false
                        } = options;

                        const cmdArgs = [...args];
                        if (cmdArgs.length) {
                            cmdArgs.unshift('--')
                        }

                        const spawned = await this.spawnProcess({
                            cmd: [runtime, 'run', script, ...cmdArgs],
                            cwd,
                            waitForReady: false,
                            waitForExit: true,
                            env,
                            verbose
                        });

                        return {
                            exitCode: spawned.exitCode,
                            stdout: spawned.stdout,
                            stderr: spawned.stderr
                        };
                    }
                },

                waitForFetch: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: any): Promise<boolean | Response> {
                        const {
                            url,
                            method = 'GET',
                            headers,
                            body,
                            status,
                            retryDelayMs = 1000,
                            requestTimeoutMs = 2000,
                            timeoutMs = 30000,
                            verbose = false,
                            returnResponse = false
                        } = options;

                        const startTime = Date.now();
                        let attemptCount = 0;

                        while (Date.now() - startTime < timeoutMs) {
                            attemptCount++;
                            const elapsed = Date.now() - startTime;

                            try {
                                const response = await fetch(url, {
                                    method,
                                    headers,
                                    body,
                                    signal: AbortSignal.timeout(requestTimeoutMs)
                                });

                                if (status === true) {
                                    if (verbose) {
                                        console.log(`[waitForFetch] URL ${url} responded (status: ${response.status}) after ${attemptCount} attempts (${elapsed}ms)`);
                                    }
                                    return returnResponse ? response : true;
                                } else if (typeof status === 'number') {
                                    if (response.status === status) {
                                        if (verbose) {
                                            console.log(`[waitForFetch] URL ${url} responded with status ${status} after ${attemptCount} attempts (${elapsed}ms)`);
                                        }
                                        return returnResponse ? response : true;
                                    } else {
                                        if (verbose) {
                                            console.log(`[waitForFetch] Attempt ${attemptCount}: Got status ${response.status}, expected ${status} (${elapsed}ms)`);
                                        }
                                    }
                                }
                            } catch (error) {
                                if (status === false) {
                                    if (verbose) {
                                        console.log(`[waitForFetch] URL ${url} is not responding (as expected) after ${attemptCount} attempts (${elapsed}ms)`);
                                    }
                                    return true;
                                } else {
                                    if (verbose) {
                                        console.log(`[waitForFetch] Attempt ${attemptCount}: Request failed (${elapsed}ms)`);
                                    }
                                }
                            }

                            const remainingTime = timeoutMs - (Date.now() - startTime);
                            if (remainingTime > 0) {
                                await new Promise(resolve => setTimeout(resolve, Math.min(retryDelayMs, remainingTime)));
                            }
                        }

                        if (verbose) {
                            console.log(`[waitForFetch] Timeout reached after ${attemptCount} attempts (${Date.now() - startTime}ms)`);
                        }
                        return false;
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#']
    })
}
capsule['#'] = '@stream44.studio/t44/caps/WorkspaceLib'
