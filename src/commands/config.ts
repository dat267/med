import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Config } from "../config/schema.ts";
import { writeDefaultConfig } from "../config/file.ts";

export interface ConfigContext {
  appName: string;
  configFile: string;
  config: Config;
}

export class ConfigInitCmd {
  run(ctx: ConfigContext, force = false): void {
    if (existsSync(ctx.configFile) && !force) {
      throw new Error(`configuration file already exists at ${ctx.configFile}`);
    }
    writeDefaultConfig(ctx.configFile);
    console.log(`Successfully generated base configuration file at: ${ctx.configFile}`);
  }
}

export class ConfigPathCmd {
  run(ctx: ConfigContext): void {
    if (!existsSync(ctx.configFile)) {
      console.log(`${ctx.configFile} (does not exist)`);
      return;
    }
    console.log(ctx.configFile);
  }
}

export class ConfigShowCmd {
  run(ctx: ConfigContext): void {
    console.log(JSON.stringify(ctx.config, null, 2));
  }
}

export class ConfigEditCmd {
  run(ctx: ConfigContext): void {
    mkdirSync(dirname(ctx.configFile), { recursive: true });
    if (!existsSync(ctx.configFile)) {
      writeDefaultConfig(ctx.configFile);
    }
    const editor = process.env.EDITOR || "vim";
    const res = spawnSync(editor, [ctx.configFile], { stdio: "inherit" });
    if (res.error) throw res.error;
    if (res.signal) throw new Error(`editor killed by signal ${res.signal}`);
    if (res.status !== 0) throw new Error(`editor exited with status ${res.status}`);
  }
}
