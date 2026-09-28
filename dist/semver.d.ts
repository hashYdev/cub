export interface ParsedSpec {
    name: string;
    range: string;
}
/** Split `left-pad@^1.2.3` / `@scope/pkg@~2.0.0` / `pkg` into name + range. */
export declare function parseSpecString(spec: string): ParsedSpec;
/** Minimal semver range check: *, ^, ~, >=, >, <=, <, exact, partials, || groups. */
export declare function satisfies(version: string, range: string): boolean;
/** Pick the highest version satisfying `range`. Returns null if none match. */
export declare function resolveVersion(versions: string[], range: string): string | null;
export declare function maxVersion(versions: string[]): string | null;
