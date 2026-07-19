import { type FieldSpec, type Primitive, configDefaults, envVarFor, flatKeys } from "./schema.ts";

export type Source = "cli" | "env" | "file" | "subDefault" | "rootDefault";

export interface Resolved {
  value: Primitive;
  source: Source;
}

const configDefaultsByFlatKey: Record<keyof typeof flatKeys, Primitive> = {
  "admin-token": configDefaults.adminToken,
  "core-timeout": configDefaults.core.timeout,
  "core-retries": configDefaults.core.retries,
  "debug": configDefaults.debug,
  "dry-run": configDefaults.dryRun,
};

export function parsePrimitive(spec: FieldSpec, raw: string): Primitive {
  switch (spec.type) {
    case "string":
      return raw;
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new Error(`invalid number value: ${JSON.stringify(raw)}`);
      }
      return n;
    }
    case "boolean":
      return raw === "true" || raw === "1";
  }
}

function isExplicitlySet(value: Primitive, spec: FieldSpec): boolean {
  switch (spec.type) {
    case "string":
      return value !== "";
    case "number":
      return value !== 0;
    case "boolean":
      return value !== false;
  }
}

function envIsExplicitlySet(raw: string | undefined): boolean {
  return raw !== undefined;
}

function isExplicitlyZero(value: Primitive, spec: FieldSpec): boolean {
  return spec.type === "number" && value === 0;
}

function isExplicitlyEmpty(value: Primitive, spec: FieldSpec): boolean {
  return spec.type === "string" && value === "";
}

export interface ResolveInputs {
  appPrefix: string;
  fileValues: Partial<Record<keyof typeof flatKeys, Primitive>>;
  cliValues: Partial<Record<keyof typeof flatKeys, Primitive>>;
  cliSource: Partial<Record<keyof typeof flatKeys, boolean>>;
  env: Record<string, string | undefined>;
  subDefaults: Partial<Record<keyof typeof flatKeys, Primitive>>;
}

export function resolveKey(flatKey: keyof typeof flatKeys, inputs: ResolveInputs): Resolved {
  const spec = flatKeys[flatKey];
  const envKey = envVarFor(flatKey, inputs.appPrefix);

  if (inputs.cliSource[flatKey] === true) {
    const v = inputs.cliValues[flatKey]!;
    return { value: v, source: "cli" };
  }

  const envRaw = inputs.env[envKey];
  if (envIsExplicitlySet(envRaw)) {
    return { value: parsePrimitive(spec, envRaw!), source: "env" };
  }

  const fileVal = inputs.fileValues[flatKey];
  if (fileVal !== undefined) {
    if (isExplicitlyZero(fileVal, spec) || isExplicitlyEmpty(fileVal, spec)) {
      return { value: fileVal, source: "file" };
    }
    if (isExplicitlySet(fileVal, spec)) {
      return { value: fileVal, source: "file" };
    }
  }

  const subDefault = inputs.subDefaults[flatKey];
  if (subDefault !== undefined && isExplicitlySet(subDefault, spec)) {
    return { value: subDefault, source: "subDefault" };
  }

  return { value: configDefaultsByFlatKey[flatKey]!, source: "rootDefault" };
}

export function resolveAll(inputs: ResolveInputs): Record<keyof typeof flatKeys, Resolved> {
  const out = {} as Record<keyof typeof flatKeys, Resolved>;
  for (const key of Object.keys(flatKeys) as (keyof typeof flatKeys)[]) {
    out[key] = resolveKey(key, inputs);
  }
  return out;
}

export function applyToConfig(
  resolved: Record<keyof typeof flatKeys, Resolved>,
): import("./schema.ts").Config {
  return {
    adminToken: String(resolved["admin-token"].value),
    core: {
      timeout: String(resolved["core-timeout"].value),
      retries: Number(resolved["core-retries"].value),
    },
    debug: Boolean(resolved["debug"].value),
    dryRun: Boolean(resolved["dry-run"].value),
  };
}
