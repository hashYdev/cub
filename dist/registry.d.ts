export declare const DEFAULT_REGISTRY: string;
export interface ResolvedPackage {
    name: string;
    version: string;
    tarball: string;
    integrity: string;
}
interface PackumentVersion {
    dist: {
        tarball: string;
        integrity?: string;
        shasum?: string;
    };
}
interface Packument {
    "dist-tags": Record<string, string>;
    versions: Record<string, PackumentVersion>;
}
export declare function clearRegistryCache(): void;
export declare function getPackument(name: string, registry?: string): Promise<Packument>;
export declare function resolveSpec(name: string, range: string, registry?: string): Promise<ResolvedPackage>;
/** Download a tarball; verify sha512/sha1 integrity when provided. */
export declare function downloadTarball(url: string, integrity?: string): Promise<Buffer>;
export declare function cacheDir(): string;
export {};
