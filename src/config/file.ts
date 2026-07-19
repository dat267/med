import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { defaultConfigFile, flatKeys } from "./schema.ts";
import { type Primitive } from "./schema.ts";

export function resolveConfigFilePath(appName: string, explicit?: string): string {
  if (explicit) return explicit;
  const envKey = `${appName.toUpperCase()}_CONFIG_FILE`;
  if (process.env[envKey]) return process.env[envKey]!;
  const local = `${appName}.json`;
  if (existsSync(local)) return local;
  return join(homedir(), ".config", appName, `${appName}.json`);
}

export interface LoadedConfig {
  path: string;
  exists: boolean;
  raw: unknown;
  flatValues: Partial<Record<keyof typeof flatKeys, Primitive>>;
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function loadConfigFile(path: string): LoadedConfig {
  if (!existsSync(path)) {
    return { path, exists: false, raw: undefined, flatValues: {} };
  }
  const text = readFileSync(path, "utf8");
  let raw: Json;
  try {
    raw = JSON.parse(text) as Json;
  } catch (err) {
    throw new Error(`failed to parse config file at ${path}: ${(err as Error).message}`);
  }
  const flat = flattenJson(raw, "");
  return { path, exists: true, raw, flatValues: flat };
}

function flattenJson(node: Json, prefix: string): Partial<Record<keyof typeof flatKeys, Primitive>> {
  const out: Partial<Record<keyof typeof flatKeys, Primitive>> = {};
  if (node === null || typeof node !== "object" || Array.isArray(node)) return out;
  for (const [k, v] of Object.entries(node as { [k: string]: Json })) {
    const flatKey = prefix === "" ? k : `${prefix}-${k}`;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenJson(v, flatKey));
    } else if (v !== null && flatKey in flatKeys) {
      out[flatKey as keyof typeof flatKeys] = v as Primitive;
    }
  }
  return out;
}

export function detectDuplicateKeys(raw: unknown, appName: string): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const seen = new Map<string, string>();
  const walk = (node: Json, flatPrefix: string, dotPrefix: string): string | null => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return null;
    for (const [k, v] of Object.entries(node as { [k: string]: Json })) {
      const flatKey = flatPrefix === "" ? k : `${flatPrefix}-${k}`;
      const dotKey = dotPrefix === "" ? k : `${dotPrefix}.${k}`;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        const err = walk(v, flatKey, dotKey);
        if (err) return err;
      } else {
        if (flatKey in flatKeys) {
          if (seen.has(flatKey)) {
            return `both ${JSON.stringify(seen.get(flatKey))} and ${JSON.stringify(dotKey)} are defined. Run '${appName} config edit' to fix this.`;
          }
          seen.set(flatKey, dotKey);
        }
      }
    }
    return null;
  };
  return walk(raw as Json, "", "");
}

export function writeDefaultConfig(path: string, profile: object = defaultConfigFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(profile, null, 2) + "\n", { mode: 0o600 });
}
