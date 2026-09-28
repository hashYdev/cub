import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cacheKeyForBytes,
  cacheKeyForIntegrity,
  integrityToHex,
  tarballCachePath,
} from "./cache";
import { buildLockfile, collectDeps } from "./lockfile";
import { maxVersion, parseSpecString, resolveVersion, satisfies } from "./semver";

describe("parseSpecString", () => {
  test("bare name defaults to *", () => {
    expect(parseSpecString("left-pad")).toEqual({ name: "left-pad", range: "*" });
  });
  test("name@range splits on last @", () => {
    expect(parseSpecString("left-pad@^1.2.3")).toEqual({ name: "left-pad", range: "^1.2.3" });
  });
  test("scoped packages keep scope", () => {
    expect(parseSpecString("@scope/pkg")).toEqual({ name: "@scope/pkg", range: "*" });
    expect(parseSpecString("@scope/pkg@~2.0.0")).toEqual({ name: "@scope/pkg", range: "~2.0.0" });
  });
  test("empty spec throws", () => {
    expect(() => parseSpecString("  ")).toThrow();
  });
});

describe("semver", () => {
  const versions = ["1.0.0", "1.2.0", "1.2.3", "2.0.0-beta.1", "2.0.0"];
  test("caret picks highest compatible", () => {
    expect(resolveVersion(versions, "^1.0.0")).toBe("1.2.3");
  });
  test("tilde stays in minor", () => {
    expect(resolveVersion(versions, "~1.2.0")).toBe("1.2.3");
  });
  test("exact match", () => {
    expect(resolveVersion(versions, "1.2.0")).toBe("1.2.0");
  });
  test("* and latest pick max release", () => {
    expect(resolveVersion(versions, "*")).toBe("2.0.0");
    expect(resolveVersion(versions, "latest")).toBe("2.0.0");
  });
  test("no match returns null", () => {
    expect(resolveVersion(versions, "^3.0.0")).toBeNull();
  });
  test("satisfies comparators", () => {
    expect(satisfies("1.2.3", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfies("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
  });
  test("maxVersion ignores garbage", () => {
    expect(maxVersion(["nope", "1.0.0", "0.9.9"])).toBe("1.0.0");
  });
});

describe("cache key", () => {
  test("integrity maps to sharded content-addressable path", () => {
    const hex = "a".repeat(128);
    const integrity = `sha512-${Buffer.from(hex, "hex").toString("base64")}`;
    expect(integrityToHex(integrity)).toBe(hex);
    expect(cacheKeyForIntegrity(integrity)).toBe(`sha512/${hex.slice(0, 2)}/${hex.slice(2)}`);
    expect(tarballCachePath(integrity)).toContain("tarballs/sha512/");
  });
  test("bytes hash to sha512 key", () => {
    const key = cacheKeyForBytes(Buffer.from("hello"));
    expect(key.startsWith("sha512/")).toBe(true);
    // Deterministic.
    expect(cacheKeyForBytes(Buffer.from("hello"))).toBe(key);
    expect(cacheKeyForBytes(Buffer.from("other"))).not.toBe(key);
  });
  test("invalid integrity throws", () => {
    expect(() => integrityToHex("not-an-integrity")).toThrow();
  });
});

describe("lockfile", () => {
  test("buildLockfile keys by name@version", () => {
    const lock = buildLockfile(
      { name: "app", version: "1.0.0" },
      [{ name: "foo", version: "1.2.3", tarball: "https://r/foo.tgz", integrity: "sha512-x" }],
    );
    expect(lock.lockfileVersion).toBe(1);
    expect(lock.packages["foo@1.2.3"]).toMatchObject({ version: "1.2.3" });
  });
  test("collectDeps merges without duplicating dev over prod", () => {
    const deps = collectDeps(
      { dependencies: { a: "^1.0.0" }, devDependencies: { a: "^2.0.0", b: "*" } },
      true,
    );
    expect(deps).toEqual({ a: "^1.0.0", b: "*" });
  });
  test("lockfile round-trips through disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cub-lock-"));
    const lock = buildLockfile({ name: "app", version: "0.0.1" }, [
      { name: "bar", version: "2.0.0", tarball: "https://r/bar.tgz", integrity: "sha512-y" },
    ]);
    const { writeLockfile, readLockfile } = await import("./lockfile.js");
    await writeLockfile(dir, lock);
    const raw = readFileSync(join(dir, "cub-lock.json"), "utf8");
    expect(JSON.parse(raw).packages["bar@2.0.0"].version).toBe("2.0.0");
    const back = await readLockfile(dir);
    expect(back?.packages["bar@2.0.0"].resolved).toBe("https://r/bar.tgz");
    void writeFileSync;
  });
});
