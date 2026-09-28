import { toFinding, formatReport } from "./audit.js";
import { describe, expect, test } from "bun:test";

describe("toFinding", () => {
  test("flattens severity + fixed versions", () => {
    const f = toFinding("left-pad", "1.3.0", {
      id: "GHSA-test-1",
      summary: "test vuln",
      severity: [{ type: "CVSS_V3", score: "9.8" }],
      affected: [{ ranges: [{ events: [{ introduced: "0" }, { fixed: "1.3.1" }] }] }],
    });
    expect(f.vulnId).toBe("GHSA-test-1");
    expect(f.severity).toBe("CVSS_V3:9.8");
    expect(f.fixedIn).toEqual(["1.3.1"]);
  });

  test("handles missing optional fields", () => {
    const f = toFinding("x", "1.0.0", { id: "CVE-1" });
    expect(f.summary).toBe("(no summary)");
    expect(f.severity).toBe("unknown");
    expect(f.fixedIn).toEqual([]);
  });
});

describe("formatReport", () => {
  test("zero findings", () => {
    expect(formatReport(3, [])).toBe("audited 3 packages: 0 vulnerabilities\n");
  });

  test("lists findings with fix versions", () => {
    const out = formatReport(1, [
      {
        name: "a",
        version: "1.0.0",
        vulnId: "GHSA-1",
        summary: "bad",
        severity: "HIGH",
        fixedIn: ["1.0.1"],
      },
    ]);
    expect(out).toContain("GHSA-1 a@1.0.0 [HIGH] bad (fixed in 1.0.1)");
  });
});
