import { parseArgs, type ParseArgsConfig } from "node:util";
import { z } from "zod";

export type CliParseOptions = NonNullable<ParseArgsConfig["options"]>;

export type CliParseResult = {
  values: Record<string, unknown>;
  positionals: string[];
};

/**
 * Strict argv parsing via `node:util.parseArgs` (unknown flags throw).
 * Pair with Zod in {@link parseCli} for validated, typed CLI input.
 */
function parseArgv(
  argv: readonly string[],
  config: {
    options: CliParseOptions;
    strict?: boolean;
    allowPositionals?: boolean;
  },
): CliParseResult {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: config.options,
    strict: config.strict ?? true,
    allowPositionals: config.allowPositionals ?? false,
  });
  return { values: { ...values }, positionals };
}

/**
 * Parse argv with declared flags, then validate/coerce with Zod.
 * Use `transform` when the schema needs positionals or env-backed defaults.
 */
export function parseCli<S extends z.ZodTypeAny>(
  argv: readonly string[],
  config: {
    options: CliParseOptions;
    schema: S;
    strict?: boolean;
    allowPositionals?: boolean;
    transform?: (input: CliParseResult) => unknown;
  },
): z.infer<S> {
  const parsed = parseArgv(argv, {
    options: config.options,
    ...(config.strict === undefined ? {} : { strict: config.strict }),
    ...(config.allowPositionals === undefined ? {} : { allowPositionals: config.allowPositionals }),
  });
  const raw = config.transform ? config.transform(parsed) : parsed.values;
  return config.schema.parse(raw);
}

export type SubcommandCliConfig<S extends z.ZodTypeAny> = {
  options: CliParseOptions;
  schema: S;
  /** First positional token (subcommand), e.g. `start` or `restart`. */
  subcommands: readonly string[];
};

/**
 * Parses declared flags plus a required first positional subcommand.
 * Fails fast if the subcommand is missing or not allowed.
 */
export function parseSubcommandCli<S extends z.ZodTypeAny>(
  argv: readonly string[],
  config: SubcommandCliConfig<S>,
): z.infer<S> {
  return parseCli(argv, {
    options: config.options,
    schema: config.schema,
    strict: true,
    allowPositionals: true,
    transform: ({ values, positionals }) => {
      const action = positionals[0];
      if (!action) {
        throw new Error(`Missing subcommand. Expected one of: ${config.subcommands.join(", ")}.`);
      }
      if (!config.subcommands.includes(action)) {
        throw new Error(
          `Unknown subcommand ${JSON.stringify(action)}. Expected one of: ${config.subcommands.join(", ")}.`,
        );
      }
      return { ...values, action };
    },
  });
}

export type CliCommandRouterConfig<Command extends string> = {
  commands: readonly Command[];
  usage: () => string;
};

export function parseCliCommand<Command extends string>(
  argv: readonly string[],
  config: CliCommandRouterConfig<Command>,
): { command: Command | "help"; args: string[] } {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") return { command: "help", args: [] };
  if (!config.commands.includes(command as Command)) {
    throw new Error(`Unknown command ${JSON.stringify(command)}.\n\n${config.usage()}`);
  }
  return { command: command as Command, args };
}

export async function runCliMain(run: () => Promise<void> | void): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}

export function parseOutputFormat(raw: string | undefined, fallback = "json"): "json" | "markdown" {
  const value = raw?.trim().toLowerCase() || fallback;
  if (value === "json" || value === "markdown") return value;
  throw new Error(`--format must be json or markdown; got ${JSON.stringify(raw)}.`);
}
