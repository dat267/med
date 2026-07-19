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

export const configDefaults: Config = {
  adminToken: "",
  core: { timeout: "2m", retries: 3 },
  debug: false,
  dryRun: false,
};

export const flatKeys = {
  "admin-token": { type: "string", default: "" },
  "core-timeout": { type: "string", default: "2m" },
  "core-retries": { type: "number", default: 3 },
  "debug": { type: "boolean", default: false },
  "dry-run": { type: "boolean", default: false },
} as const satisfies Record<string, FieldSpec>;

export const defaultConfigFile: object = {
  "admin-token": "",
  core: {
    timeout: "2m",
    retries: 3,
  },
  debug: false,
  "dry-run": false,
};

export function envVarFor(flatKey: string, appPrefix: string): string {
  return `${appPrefix}_${flatKey.replace(/-/g, "_").toUpperCase()}`;
}
