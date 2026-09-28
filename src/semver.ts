export interface ParsedSpec {
  name: string;
  range: string;
}

/** Split `left-pad@^1.2.3` / `@scope/pkg@~2.0.0` / `pkg` into name + range. */
export function parseSpecString(spec: string): ParsedSpec {
  const s = spec.trim();
  if (!s) throw new Error("empty spec");
  // Scoped: @scope/name[@range]
  if (s.startsWith("@")) {
    const slash = s.indexOf("/");
    if (slash === -1) throw new Error(`invalid spec: ${spec}`);
    const at = s.indexOf("@", slash + 1);
    if (at === -1) return { name: s, range: "*" };
    return { name: s.slice(0, at), range: s.slice(at + 1) || "*" };
  }
  const at = s.lastIndexOf("@");
  if (at <= 0) return { name: s, range: "*" };
  return { name: s.slice(0, at), range: s.slice(at + 1) || "*" };
}

function parseVersion(v: string): [number, number, number, string] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.\-+]+))?$/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ""];
}

function cmp(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  // release > prerelease
  if (pa[3] === pb[3]) return 0;
  if (!pa[3]) return 1;
  if (!pb[3]) return -1;
  return pa[3] < pb[3] ? -1 : 1;
}

function satisfiesComparator(version: string, op: string, target: string): boolean {
  const c = cmp(version, target);
  switch (op) {
    case "":
    case "=":
    case "==":
    case "===":
      return c === 0;
    case ">":
      return c > 0;
    case ">=":
      return c >= 0;
    case "<":
      return c < 0;
    case "<=":
      return c <= 0;
    case "^": {
      const t = parseVersion(target);
      const v = parseVersion(version);
      if (!t || !v) return false;
      if (c < 0) return false;
      if (t[0] !== 0) return v[0] === t[0];
      if (t[1] !== 0) return v[0] === 0 && v[1] === t[1];
      return v[0] === 0 && v[1] === 0 && v[2] === t[2];
    }
    case "~": {
      const t = parseVersion(target);
      const v = parseVersion(version);
      if (!t || !v) return false;
      if (c < 0) return false;
      return v[0] === t[0] && v[1] === t[1];
    }
    default:
      return false;
  }
}

function satisfiesSingle(version: string, token: string): boolean {
  const t = token.trim();
  if (!t || t === "*" || t.toLowerCase() === "x") return true;
  const m = /^(>=|<=|>|<|=|==|===|\^|~)?\s*v?(\d+\.\d+\.\d+(?:-[\w.\-+]+)?|(\d+\.\d+)|(\d+)|x|\*)(\.x)?$/i.exec(t);
  if (!m) {
    // Bare tag handled by caller; unknown tokens never match.
    return false;
  }
  const op = (m[1] ?? "") as string;
  let target = m[2];
  if (/^(x|\*)$/i.test(target)) return true;
  // Normalize partial versions: "1.2" -> ">=1.2.0 <1.3.0", "1" -> ">=1.0.0 <2.0.0"
  if (/^\d+$/.test(target)) {
    const major = Number(target);
    const v = parseVersion(version);
    if (!v) return false;
    if (op === "^" || op === "" || op === "=" || op === "==") return v[0] === major && cmp(version, `${major}.0.0`) >= 0;
    return satisfiesComparator(version, op || ">=", `${major}.0.0`);
  }
  if (/^\d+\.\d+$/.test(target)) {
    const [maj, min] = target.split(".").map(Number);
    const v = parseVersion(version);
    if (!v) return false;
    if (!op || op === "^" || op === "~" || op === "=" || op === "==") {
      return v[0] === maj && v[1] === min && cmp(version, `${maj}.${min}.0`) >= 0;
    }
    return satisfiesComparator(version, op, `${target}.0`);
  }
  return satisfiesComparator(version, op, target);
}

/** Minimal semver range check: *, ^, ~, >=, >, <=, <, exact, partials, || groups. */
export function satisfies(version: string, range: string): boolean {
  const r = (range ?? "").trim();
  if (!r || r === "*" || r === "latest") return true;
  // OR groups
  const groups = r.split("||").map((g) => g.trim()).filter(Boolean);
  return groups.some((group) => {
    // Hyphen ranges: "1.2.3 - 2.3.4"
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(group);
    if (hyphen) {
      return cmp(version, hyphen[1]) >= 0 && cmp(version, hyphen[2]) <= 0;
    }
    const tokens = group.split(/\s+/).filter(Boolean);
    return tokens.every((tok) => satisfiesSingle(version, tok));
  });
}

/** Pick the highest version satisfying `range`. Returns null if none match. */
export function resolveVersion(versions: string[], range: string): string | null {
  const r = (range ?? "").trim();
  if (!r || r === "*" || r === "latest") {
    return maxVersion(versions);
  }
  let best: string | null = null;
  for (const v of versions) {
    if (!parseVersion(v)) continue;
    if (!satisfies(v, r)) continue;
    if (best === null || cmp(v, best) > 0) best = v;
  }
  return best;
}

export function maxVersion(versions: string[]): string | null {
  let best: string | null = null;
  for (const v of versions) {
    if (!parseVersion(v)) continue;
    if (best === null || cmp(v, best) > 0) best = v;
  }
  return best;
}
