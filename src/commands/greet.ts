export interface GreetOptions {
  name: string;
  shout: boolean;
  times: number;
  coreTimeout: string;
}

export function runGreet(opts: GreetOptions, resolvedCoreTimeout: string): void {
  const t = Math.max(1, opts.times);
  let msg = `Hello, ${opts.name}! (Current core timeout setting is ${resolvedCoreTimeout})`;
  if (opts.shout) msg = msg.toUpperCase();
  for (let i = 0; i < t; i++) console.log(msg);
}
