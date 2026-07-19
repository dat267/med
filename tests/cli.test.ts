import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = "/tmp/med-test-bin";

let tmpDir: string;

beforeAll(() => {
  const build = spawnSync("bun", ["build", "./main.ts", "--compile", "--outfile", BIN], {
    cwd: import.meta.dir + "/..",
    stdio: "inherit",
  });
  if (build.status !== 0) {
    throw new Error(`failed to build test binary at ${BIN}`);
  }
  tmpDir = mkdtempSync(join(tmpdir(), "med-test-"));
  mkdirSync(join(tmpDir, "home"), { recursive: true });
});

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(name: string, content: object | string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  return path;
}

interface ConfigView {
  adminToken: string;
  core: { timeout: string; retries: number };
  debug: boolean;
  dryRun: boolean;
}

function sanitizedEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { HOME: join(tmpDir, "home") };
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("MED_")) continue;
    out[k] = v;
  }
  return out;
}

function runConfigShow(env: Record<string, string> = {}, ...args: string[]): ConfigView {
  const fullEnv = { ...sanitizedEnv(), ...env };
  const out = execFileSync(BIN, ["config", "show", ...args], {
    env: fullEnv,
    cwd: tmpDir,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

function runGreet(env: Record<string, string> = {}, ...args: string[]): string {
  const fullEnv = { ...sanitizedEnv(), ...env };
  return execFileSync(BIN, ["greet", ...args], {
    env: fullEnv,
    cwd: tmpDir,
    encoding: "utf8",
  });
}

describe("parameter specificity", () => {
  test("Scenario 1: defaults with no flags, env, or file", () => {
    const empty = writeJson("empty.json", "{}");
    const cfg = runConfigShow({}, "--config-file", empty);
    expect(cfg.core.retries).toBe(3);
    expect(cfg.adminToken).toBe("");
  });

  test("Scenario 2: config file overrides defaults", () => {
    const configPath = writeJson("config.json", {
      "admin-token": "config-token",
      core: { timeout: "5m", retries: 10 },
      debug: true,
      "dry-run": true,
    });
    const cfg = runConfigShow({}, "--config-file", configPath);
    expect(cfg.adminToken).toBe("config-token");
    expect(cfg.core.retries).toBe(10);
    expect(cfg.debug).toBe(true);
  });

  test("Scenario 3: env vars override config file", () => {
    const configPath = writeJson("config.json", {
      "admin-token": "config-token",
      core: { timeout: "5m", retries: 10 },
    });
    const cfg = runConfigShow(
      { MED_ADMIN_TOKEN: "env-token", MED_CORE_TIMEOUT: "30m" },
      "--config-file",
      configPath,
    );
    expect(cfg.adminToken).toBe("env-token");
    expect(cfg.core.retries).toBe(10);
    expect(cfg.core.timeout).toBe("30m");
  });

  test("Scenario 4: env vars fully override empty config", () => {
    const empty = writeJson("empty.json", "{}");
    const cfg = runConfigShow(
      {
        MED_ADMIN_TOKEN: "env2-token",
        MED_CORE_TIMEOUT: "45m",
        MED_CORE_RETRIES: "99",
        MED_DEBUG: "true",
      },
      "--config-file",
      empty,
    );
    expect(cfg.adminToken).toBe("env2-token");
    expect(cfg.core.timeout).toBe("45m");
    expect(cfg.core.retries).toBe(99);
    expect(cfg.debug).toBe(true);
  });

  test("Scenario 5a: no config, no env => subcommand default (10s) wins over root default (2m)", () => {
    const empty = writeJson("empty.json", "{}");
    const out = runGreet({}, "--config-file", empty);
    expect(out).toContain("timeout setting is 10s");
  });

  test("Scenario 5b: config file (5m) overrides subcommand default (10s)", () => {
    const configPath = writeJson("config.json", { core: { timeout: "5m" } });
    const out = runGreet({}, "--config-file", configPath);
    expect(out).toContain("timeout setting is 5m");
  });

  test("Scenario 5c: env var (15m) overrides subcommand default (10s)", () => {
    const empty = writeJson("empty.json", "{}");
    const out = runGreet({ MED_CORE_TIMEOUT: "15m" }, "--config-file", empty);
    expect(out).toContain("timeout setting is 15m");
  });

  test("Scenario 6: CLI flag (1h) overrides env and config file", () => {
    const configPath = writeJson("config.json", { core: { timeout: "5m" } });
    const out = runGreet({ MED_CORE_TIMEOUT: "30m" }, "--config-file", configPath, "--core-timeout", "1h");
    expect(out).toContain("timeout setting is 1h");
  });

  test("Scenario 7: duplicate config keys fail with edit hint", () => {
    const dupPath = writeJson("duplicate.json", {
      "core-timeout": "5m",
      core: { timeout: "10m" },
    });
    expect(() => runGreet({}, "--config-file", dupPath)).toThrow(/Run 'med config edit' to fix this/);
  });

  test("Scenario 8a: $MED_CONFIG_FILE resolves when --config-file is omitted", () => {
    const envPath = writeJson("env_config.json", { "admin-token": "env-resolved-token" });
    const cfg = runConfigShow({ MED_CONFIG_FILE: envPath });
    expect(cfg.adminToken).toBe("env-resolved-token");
  });

  test("Scenario 8b: local med.json in cwd resolves when neither flag nor env is set", () => {
    writeJson("med.json", { "admin-token": "local-json-token" });
    const cfg = runConfigShow({});
    expect(cfg.adminToken).toBe("local-json-token");
  });

  test("Scenario 9a: explicit zero/empty in config file are preserved", () => {
    const zeroPath = writeJson("zero_config.json", { core: { timeout: "", retries: 0 } });
    const cfg = runConfigShow({}, "--config-file", zeroPath);
    expect(cfg.core.timeout).toBe("");
    expect(cfg.core.retries).toBe(0);
  });

  test("Scenario 9b: explicit empty/zero in env vars are preserved", () => {
    const empty = writeJson("empty.json", "{}");
    const cfg = runConfigShow(
      { MED_CORE_TIMEOUT: "", MED_CORE_RETRIES: "0" },
      "--config-file",
      empty,
    );
    expect(cfg.core.timeout).toBe("");
    expect(cfg.core.retries).toBe(0);
  });

  test("Scenario 9c: explicit null in JSON falls back to defaults", () => {
    const nullPath = writeJson("null_config.json", { core: { timeout: null, retries: null } });
    const cfg = runConfigShow({}, "--config-file", nullPath);
    expect(cfg.core.timeout).toBe("2m");
    expect(cfg.core.retries).toBe(3);
  });
});
