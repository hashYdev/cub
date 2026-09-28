import { readlink } from "node:fs/promises";
import { type ResolvedPackage } from "./registry.js";
import { type CubLockfile } from "./lockfile.js";
export declare const CONCURRENCY = 20;
export interface InstallOptions {
    dev?: boolean;
    registry?: string;
    concurrency?: number;
    useLockfile?: boolean;
}
/** Bounded parallel map — keeps at most `limit` promises in flight. */
export declare function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]>;
export declare function fetchTarballCached(pkg: ResolvedPackage): Promise<Buffer>;
export declare function installOne(cwd: string, pkg: ResolvedPackage, opts?: InstallOptions): Promise<void>;
export declare function linkPackageBin(cwd: string, name: string): Promise<void>;
export interface InstallResult {
    installed: ResolvedPackage[];
    lock: CubLockfile;
}
/**
 * Full install: resolve every dep (parallel, shared packument cache),
 * download tarballs in parallel (concurrency 20), cache, atomic extract,
 * link bins, write cub-lock.json.
 */
export declare function installAll(cwd: string, opts?: InstallOptions): Promise<InstallResult>;
/** `cub install pkg[@range]...` — resolve ad-hoc specs and install. */
export declare function installSpecs(cwd: string, specs: string[], opts?: InstallOptions): Promise<InstallResult>;
export { readlink };
