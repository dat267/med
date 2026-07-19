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
import { flatKeys, type Config } from "./config/schema.ts";
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

export function buildProgram(opts: BuildOptions = {}): { program: Command; appName: string } {
  const appName = opts.appName ?? DefaultAppName;
  const program = new Command();
  program
    .name(appName)
    .description(AppDescription)
    .version(process.env["MED_VERSION"] ?? "dev")
    .showHelpAfterError();

  program.option("--config-file <PATH>", "Path to config file").exitOverride();

  const configCmd = program
    .command("config")
    .description("Manage application configuration");

  configCmd
    .command("init")
    .description("Generate a default configuration profile template file")
    .option("-f, --force", "Overwrite existing configuration file")
    .action((opts: { force?: boolean }) => {
      const ctx = buildContext(program, appName, false, { skipDuplicateCheck: true });
      new ConfigInitCmd().run(ctx, Boolean(opts.force));
    });

  configCmd
    .command("path")
    .description("Show the active configuration file path")
    .action(() => {
      const ctx = buildContext(program, appName, false, { skipDuplicateCheck: true });
      new ConfigPathCmd().run(ctx);
    });

  configCmd
    .command("show")
    .description("Print the active configuration values")
    .action(() => {
      const ctx = buildContext(program, appName, true, { skipDuplicateCheck: true });
      new ConfigShowCmd().run(ctx);
    });

  configCmd
    .command("edit")
    .description("Open the active configuration file in an editor")
    .action(() => {
      const ctx = buildContext(program, appName, false, { skipDuplicateCheck: true });
      new ConfigEditCmd().run(ctx);
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
      const ctx = buildContext(program, appName, true, {
        subDefaults: { "core-timeout": opts.coreTimeout ?? "10s" },
        cliValues: cliOverrides,
        cliSource,
      });
      runGreet(
        {
          name,
          shout: Boolean(opts.shout),
          times: Number(opts.times) || 1,
          coreTimeout: opts.coreTimeout ?? "10s",
        },
        String(ctx.resolved["core-timeout"].value),
      );
    });

  return { program, appName };
}

interface ExtraInputs {
  subDefaults?: ResolveInputs["subDefaults"];
  cliValues?: ResolveInputs["cliValues"];
  cliSource?: ResolveInputs["cliSource"];
  skipDuplicateCheck?: boolean;
}

function buildContext(
  program: Command,
  appName: string,
  resolveValues: boolean,
  extra: ExtraInputs = {},
): ProgramContext {
  const rootOpts = program.opts<{ configFile?: string }>();
  const configFile = resolveConfigFilePath(appName, rootOpts.configFile);
  const loaded = loadConfigFile(configFile);

  if (!extra.skipDuplicateCheck) {
    const dup = detectDuplicateKeys(loaded.raw, appName);
    if (dup) {
      console.error(`error: duplicate config keys in ${configFile}: ${dup}`);
      process.exit(1);
    }
  }

  const resolved = resolveValues
    ? resolveAll({
        appPrefix: appName.toUpperCase(),
        fileValues: loaded.flatValues,
        cliValues: extra.cliValues ?? {},
        cliSource: extra.cliSource ?? {},
        env: process.env as Record<string, string | undefined>,
        subDefaults: extra.subDefaults ?? {},
      })
    : ({} as Record<keyof typeof flatKeys, Resolved>);

  const config: Config = resolveValues
    ? applyToConfig(resolved)
    : {
        adminToken: "",
        core: { timeout: "2m", retries: 3 },
        debug: false,
        dryRun: false,
      };

  return { appName, configFile, config, resolved };
}
