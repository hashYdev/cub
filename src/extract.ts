import { gunzipSync } from "node:zlib";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Minimal ustar/pax tar extractor for npm tarballs (which are
 * gzip-compressed, rooted at `package/`). Handles dirs, files,
 * symlinks, and pax extended headers. No native deps.
 */

interface Entry {
  name: string;
  type: string;
  linkname: string;
  size: number;
  mode: number;
  offset: number;
}

function readString(buf: Buffer, off: number, len: number): string {
  const slice = buf.subarray(off, off + len);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? len : nul).toString("utf8");
}

function parseOctal(buf: Buffer, off: number, len: number): number {
  const s = readString(buf, off, len).trim();
  if (!s) return 0;
  // Base-256 extension (rare in npm tarballs) — treat as 0 to stay safe.
  if (buf[off] & 0x80) return 0;
  const n = parseInt(s, 8);
  return Number.isNaN(n) ? 0 : n;
}

function stripRoot(name: string): string | null {
  // npm tarballs root everything under `package/`.
  if (name === "package" || name === "package/") return null;
  if (name.startsWith("package/")) return name.slice("package/".length);
  if (name === "./" || name === "." || name === "./") return null;
  if (name.startsWith("./")) return name.slice(2);
  return name;
}

export async function extractTgz(data: Uint8Array, dest: string): Promise<string[]> {
  const raw = gunzipSync(data);
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const written: string[] = [];
  let offset = 0;
  let paxPath: string | null = null;
  let paxLink: string | null = null;

  const readNext = (): Entry | null => {
    if (offset + 512 > buf.length) return null;
    // Two consecutive zero blocks = end.
    if (buf.subarray(offset, offset + 512).every((b) => b === 0)) return null;
    const name = readString(buf, offset, 100);
    const mode = parseOctal(buf, offset + 100, 8);
    const size = parseOctal(buf, offset + 124, 12);
    const typeflag = String.fromCharCode(buf[offset + 156]);
    const linkname = readString(buf, offset + 157, 100);
    const prefix = readString(buf, offset + 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    offset += 512;
    return { name: fullName, type: typeflag || "0", linkname, size, mode, offset };
  };

  while (true) {
    const entry = readNext();
    if (!entry) break;
    const dataStart = entry.offset;
    const blocks = Math.ceil(entry.size / 512);
    offset = dataStart + blocks * 512;

    if (entry.type === "x" || entry.type === "g") {
      // Pax extended header: parse path/linkpath overrides.
      const rawHdr = buf.subarray(dataStart, dataStart + entry.size).toString("utf8");
      for (const line of rawHdr.split("\n")) {
        const m = /^\d+ ([^=]+)=(.*)$/.exec(line.trim());
        if (!m) continue;
        if (m[1] === "path") paxPath = m[2];
        if (m[1] === "linkpath") paxLink = m[2];
      }
      continue;
    }

    let name = paxPath ?? entry.name;
    const link = paxLink ?? entry.linkname;
    paxPath = null;
    paxLink = null;

    const rel = stripRoot(name.replace(/\\/g, "/"));
    if (rel === null || rel === "" || rel === "/") continue;
    // Reject escapes.
    const parts = rel.split("/");
    if (parts.includes("..") || rel.startsWith("/")) continue;
    const target = join(dest, ...parts);

    if (entry.type === "5" || name.endsWith("/")) {
      await mkdir(target, { recursive: true });
      continue;
    }
    if (entry.type === "2") {
      await mkdir(dirname(target), { recursive: true });
      try {
        await symlink(link, target);
      } catch {
        // best-effort
      }
      written.push(target);
      continue;
    }
    if (entry.type === "0" || entry.type === "\0" || entry.type === "") {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, buf.subarray(dataStart, dataStart + entry.size), {
        mode: entry.mode || 0o644,
      });
      written.push(target);
      continue;
    }
    // Skip other types (char/block/fifo).
  }
  return written;
}
