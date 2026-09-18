import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContext } from "../src/cli.ts";

let tmpDir: string;

function writeJson(name: string, content: object | string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  return path;
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "med-loadctx-"));
});

describe("loadContext", () => {
  test("resolves values from config file and env through one call", () => {
    const configPath = writeJson("resolve.json", { "admin-token": "file-token", core: { timeout: "5m" } });
    const result = loadContext("med", {
      configFile: configPath,
      resolveValues: true,
      env: { MED_CORE_TIMEOUT: "30m" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx.configFile).toBe(configPath);
    expect(result.ctx.config.adminToken).toBe("file-token");
    expect(result.ctx.config.core.timeout).toBe("30m");
    expect(result.ctx.resolved["core-timeout"]).toEqual({ value: "30m", source: "env" });
  });

  test("reports duplicate keys as a result instead of exiting", () => {
    const dupPath = writeJson("duplicate.json", {
      "core-timeout": "5m",
      core: { timeout: "10m" },
    });
    const result = loadContext("med", {
      configFile: dupPath,
      resolveValues: true,
      checkDuplicates: true,
      env: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("duplicate config keys in " + dupPath);
    expect(result.error).toContain("Run 'med config edit' to fix this.");
  });

  test("duplicate keys are tolerated when checkDuplicates is not requested", () => {
    const dupPath = writeJson("duplicate-tolerated.json", {
      "core-timeout": "5m",
      core: { timeout: "10m" },
    });
    const result = loadContext("med", {
      configFile: dupPath,
      resolveValues: false,
      env: {},
    });
    expect(result.ok).toBe(true);
  });

  test("without resolveValues the context carries schema defaults and no resolutions", () => {
    const result = loadContext("med", {
      configFile: join(tmpDir, "whatever.json"),
      resolveValues: false,
      env: { MED_ADMIN_TOKEN: "should-be-ignored" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx.config).toEqual({
      adminToken: "",
      core: { timeout: "2m", retries: 3 },
      debug: false,
      dryRun: false,
    });
    expect(Object.keys(result.ctx.resolved)).toEqual([]);
  });
});
