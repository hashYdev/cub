export interface CubLockPackage {
    version: string;
    resolved: string;
    integrity: string;
    dev?: boolean;
}
export interface CubLockfile {
    name: string;
    version: string;
    lockfileVersion: 1;
    packages: Record<string, CubLockPackage>;
}
export interface PackageJson {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    bin?: string | Record<string, string>;
}
export declare function readPackageJson(cwd: string): Promise<PackageJson>;
export declare function writePackageJson(cwd: string, pkg: PackageJson): Promise<void>;
/** Merge deps + optionalDeps (+ devDeps unless production). */
export declare function collectDeps(pkg: PackageJson, includeDev: boolean): Record<string, string>;
export declare function readLockfile(cwd: string): Promise<CubLockfile | null>;
export declare function buildLockfile(pkg: PackageJson, resolved: Array<{
    name: string;
    version: string;
    tarball: string;
    integrity: string;
    dev?: boolean;
}>): CubLockfile;
export declare function writeLockfile(cwd: string, lock: CubLockfile): Promise<void>;
