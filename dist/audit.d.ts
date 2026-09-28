/** cub audit — vulnerability scan via OSV (https://osv.dev).
 *
 * Threat data is fetched live from OSV at audit time, so protection is
 * always current without shipping signature files in this repo.
 * Uses only the global fetch API — zero dependencies.
 */
export interface AuditTarget {
    name: string;
    version: string;
}
export interface AuditFinding {
    name: string;
    version: string;
    vulnId: string;
    summary: string;
    severity: string;
    fixedIn: string[];
}
interface OsvVuln {
    id: string;
    summary?: string;
    severity?: {
        type: string;
        score: string;
    }[];
    affected?: {
        ranges?: {
            events?: {
                introduced?: string;
                fixed?: string;
            }[];
        }[];
    }[];
}
/** Map one OSV vuln entry to a flat finding. Pure — unit tested. */
export declare function toFinding(name: string, version: string, vuln: OsvVuln): AuditFinding;
/** Query OSV for a batch of npm packages. Returns flat findings. */
export declare function queryOsv(targets: AuditTarget[]): Promise<AuditFinding[]>;
/** Audit every package pinned in cub-lock.json. */
export declare function auditLockfile(cwd: string): Promise<{
    targets: number;
    findings: AuditFinding[];
}>;
/** Human-readable one-line-per-finding report. Pure — unit tested. */
export declare function formatReport(targets: number, findings: AuditFinding[]): string;
export {};
