#!/usr/bin/env bun
import { CommanderError } from "commander";
import { buildProgram } from "./src/cli.ts";

const { program, appName } = buildProgram({
  appName: process.env["MED_APP_NAME"] ?? undefined,
});
program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CommanderError) {
    if (err.code === "commander.helpDisplayed") process.exit(0);
    if (err.code === "commander.helpInvocation") process.exit(0);
    if (err.code === "commander.version") process.exit(0);
    if (err.code === "commander.unknownOption") {
      console.error(`Error: ${err.message}`);
      process.exit(err.exitCode);
    }
    process.exit(err.exitCode ?? 1);
  }
  console.error(`${appName}: ${(err as Error).message ?? err}`);
  process.exit(1);
});
