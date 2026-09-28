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

const OSV_BATCH = "https://api.osv.dev/v1/querybatch";

interface OsvVuln {
  id: string;
  summary?: string;
  severity?: { type: string; score: string }[];
  affected?: {
    ranges?: { events?: { introduced?: string; fixed?: string }[] }[];
  }[];
}

/** Map one OSV vuln entry to a flat finding. Pure — unit tested. */
export function toFinding(name: string, version: string, vuln: OsvVuln): AuditFinding {
  const severities = (vuln.severity ?? []).map((s) => `${s.type}:${s.score}`);
  const fixedIn: string[] = [];
  for (const aff of vuln.affected ?? []) {
    for (const range of aff.ranges ?? []) {
      for (const ev of range.events ?? []) {
        if (ev.fixed) fixedIn.push(ev.fixed);
      }
    }
  }
  return {
    name,
    version,
    vulnId: vuln.id,
    summary: vuln.summary ?? "(no summary)",
    severity: severities.length > 0 ? severities.join(",") : "unknown",
    fixedIn: [...new Set(fixedIn)],
  };
}

/** Query OSV for a batch of npm packages. Returns flat findings. */
export async function queryOsv(targets: AuditTarget[]): Promise<AuditFinding[]> {
  if (targets.length === 0) return [];
  const res = await fetch(OSV_BATCH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      queries: targets.map((t) => ({
        package: { name: t.name, ecosystem: "npm" },
        version: t.version,
      })),
    }),
  });
  if (!res.ok) throw new Error(`osv query failed: HTTP ${res.status}`);
  const data = (await res.json()) as { results?: { vulns?: OsvVuln[] }[] };
  const findings: AuditFinding[] = [];
  (data.results ?? []).forEach((r, i) => {
    for (const v of r.vulns ?? []) findings.push(toFinding(targets[i].name, targets[i].version, v));
  });
  return findings;
}

/** Audit every package pinned in cub-lock.json. */
export async function auditLockfile(cwd: string): Promise<{ targets: number; findings: AuditFinding[] }> {
  const { readLockfile } = await import("./lockfile.js");
  const lock = await readLockfile(cwd);
  if (!lock) throw new Error("no cub-lock.json — run `cub install` first");
  const targets: AuditTarget[] = Object.entries(lock.packages).map(([key, entry]) => {
    const at = key.lastIndexOf("@");
    return { name: at > 0 ? key.slice(0, at) : key, version: entry.version };
  });
  const findings = await queryOsv(targets);
  return { targets: targets.length, findings };
}

/** Human-readable one-line-per-finding report. Pure — unit tested. */
export function formatReport(targets: number, findings: AuditFinding[]): string {
  const lines = [`audited ${targets} packages: ${findings.length} vulnerabilities`];
  for (const f of findings) {
    const fix = f.fixedIn.length > 0 ? ` (fixed in ${f.fixedIn.join(", ")})` : "";
    lines.push(`- ${f.vulnId} ${f.name}@${f.version} [${f.severity}] ${f.summary}${fix}`);
  }
  return lines.join("\n") + "\n";
}
