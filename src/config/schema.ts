export type Primitive = string | number | boolean;

export interface CoreConfig {
  timeout: string;
  retries: number;
}

export interface Config {
  adminToken: string;
  core: CoreConfig;
  debug: boolean;
  dryRun: boolean;
}

export type FieldType = "string" | "number" | "boolean";

export interface FieldSpec {
  type: FieldType;
  default: Primitive;
}

/** Where this flat key lives in the nested `Config` object. */
export interface FlatSpec extends FieldSpec {
  path: readonly string[];
}

export const flatKeys = {
  "admin-token": { type: "string", default: "", path: ["adminToken"] },
  "core-timeout": { type: "string", default: "2m", path: ["core", "timeout"] },
  "core-retries": { type: "number", default: 3, path: ["core", "retries"] },
  "debug": { type: "boolean", default: false, path: ["debug"] },
  "dry-run": { type: "boolean", default: false, path: ["dryRun"] },
} as const satisfies Record<string, FlatSpec>;

const kebab = (seg: string): string => seg.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function nestDefaults(formatSegment: (seg: string) => string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of Object.values(flatKeys)) {
    let node = out;
    for (let i = 0; i < spec.path.length - 1; i++) {
      const k = formatSegment(spec.path[i]!);
      if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
      node = node[k] as Record<string, unknown>;
    }
    node[formatSegment(spec.path[spec.path.length - 1]!)] = spec.default;
  }
  return out;
}

export const configDefaults = nestDefaults((seg) => seg) as unknown as Config;

export const defaultConfigFile: object = nestDefaults(kebab);

export function envVarFor(flatKey: string, appPrefix: string): string {
  return `${appPrefix}_${flatKey.replace(/-/g, "_").toUpperCase()}`;
}
