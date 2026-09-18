import { Command } from "commander";
import {
  ConfigEditCmd,
  ConfigInitCmd,
  ConfigPathCmd,
  ConfigShowCmd,
} from "./commands/config.ts";
import { runGreet } from "./commands/greet.ts";
import {
  applyToConfig,
  resolveAll,
  type ResolveInputs,
  type Resolved,
} from "./config/resolve.ts";
import { configDefaults, flatKeys, type Config } from "./config/schema.ts";
import {
  detectDuplicateKeys,
  loadConfigFile,
  resolveConfigFilePath,
} from "./config/file.ts";

export const AppDescription = "Internal workflows and troubleshooting utility";
export const DefaultAppName = "med";

export interface BuildOptions {
  appName?: string;
}

export interface ProgramContext {
  appName: string;
  configFile: string;
  config: Config;
  resolved: Record<keyof typeof flatKeys, Resolved>;
}

interface LoadContextOptions {
  configFile?: string;
  resolveValues?: boolean;
  checkDuplicates?: boolean;
  cliValues?: ResolveInputs["cliValues"];
  cliSource?: ResolveInputs["cliSource"];
  subDefaults?: ResolveInputs["subDefaults"];
  env?: Record<string, string | undefined>;
}

export type LoadResult =
  | { ok: true; ctx: ProgramContext }
  | { ok: false; error: string };

export function loadContext(appName: string, opts: LoadContextOptions): LoadResult {
  const env = opts.env ?? process.env;
  const configFile = resolveConfigFilePath(appName, opts.configFile, env);
  const loaded = loadConfigFile(configFile);

  if (opts.checkDuplicates) {
    const dup = detectDuplicateKeys(loaded.raw, appName);
    if (dup) {
      return { ok: false, error: `duplicate config keys in ${configFile}: ${dup}` };
    }
  }

  const resolved = opts.resolveValues
    ? resolveAll({
        appPrefix: appName.toUpperCase(),
        fileValues: loaded.flatValues,
        cliValues: opts.cliValues ?? {},
        cliSource: opts.cliSource ?? {},
        env: env as Record<string, string | undefined>,
        subDefaults: opts.subDefaults ?? {},
      })
    : ({} as Record<keyof typeof flatKeys, Resolved>);

  const config: Config = opts.resolveValues
    ? applyToConfig(resolved)
    : { ...configDefaults };

  return { ok: true, ctx: { appName, configFile, config, resolved } };
}

export function buildProgram(opts: BuildOptions = {}): { program: Command; appName: string } {
  const appName = opts.appName ?? DefaultAppName;
  const program = new Command();
  program
    .name(appName)
    .description(AppDescription)
    .version(process.env["MED_VERSION"] ?? "dev")
    .showHelpAfterError();

  program.option("--config-file <PATH>", "Path to config file").exitOverride();

  const rootConfigFile = (): string | undefined =>
    program.opts<{ configFile?: string }>().configFile;

  const configCmd = program
    .command("config")
    .description("Manage application configuration");

  configCmd
    .command("init")
    .description("Generate a default configuration profile template file")
    .option("-f, --force", "Overwrite existing configuration file")
    .action((opts: { force?: boolean }) => {
      new ConfigInitCmd().run(ctxOrExit(appName, { configFile: rootConfigFile() }), Boolean(opts.force));
    });

  configCmd
    .command("path")
    .description("Show the active configuration file path")
    .action(() => {
      new ConfigPathCmd().run(ctxOrExit(appName, { configFile: rootConfigFile() }));
    });

  configCmd
    .command("show")
    .description("Print the active configuration values")
    .action(() => {
      new ConfigShowCmd().run(ctxOrExit(appName, { configFile: rootConfigFile(), resolveValues: true }));
    });

  configCmd
    .command("edit")
    .description("Open the active configuration file in an editor")
    .action(() => {
      new ConfigEditCmd().run(ctxOrExit(appName, { configFile: rootConfigFile() }));
    });

  program
    .command("greet")
    .description("Print a personalized greeting message")
    .argument("[name]", "Name of the person to greet.", "World")
    .option("-s, --shout", "Convert the greeting to uppercase.")
    .option("-t, --times <count>", "Number of times to repeat the greeting.", "1")
    .option("--core-timeout <duration>", "Core timeout override", "10s")
    .action(function (this: Command, name: string, opts: { shout?: boolean; times?: string; coreTimeout?: string }) {
      const source = this.getOptionValueSource("coreTimeout");
      const cliOverrides: ResolveInputs["cliValues"] = {};
      const cliSource: ResolveInputs["cliSource"] = {};
      if (source === "cli") {
        cliOverrides["core-timeout"] = opts.coreTimeout ?? "10s";
        cliSource["core-timeout"] = true;
      }
      const result = loadContext(appName, {
        configFile: rootConfigFile(),
        resolveValues: true,
        checkDuplicates: true,
        subDefaults: { "core-timeout": opts.coreTimeout ?? "10s" },
        cliValues: cliOverrides,
        cliSource,
      });
      if (!result.ok) {
        console.error(`error: ${result.error}`);
        process.exit(1);
      }
      runGreet(
        {
          name,
          shout: Boolean(opts.shout),
          times: Number(opts.times) || 1,
          coreTimeout: opts.coreTimeout ?? "10s",
        },
        String(result.ctx.resolved["core-timeout"].value),
      );
    });

  return { program, appName };
}

function ctxOrExit(appName: string, opts: LoadContextOptions = {}): ProgramContext {
  const result = loadContext(appName, opts);
  if (!result.ok) {
    console.error(`error: ${result.error}`);
    process.exit(1);
  }
  return result.ctx;
}


