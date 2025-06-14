import * as Cli from "@effect/cli"
import { Console, Duration, Effect } from "effect"
import * as NPath from "node:path"
import * as Runner from "./Runner.ts"

const pathOpt = Cli.Options.text("path").pipe(
  Cli.Options.repeated,
  Cli.Options.withDefault(["./"]),
  Cli.Options.withAlias("p"),
  Cli.Options.withDescription("Paths to watch. Defaults to current directory."),
)

const delayOpt = Cli.Options.float("delay").pipe(
  Cli.Options.withAlias("d"),
  Cli.Options.withDefault(0.1),
  Cli.Options.withDescription("Delay in seconds before rerunning the command."),
)

const verboseOpt = Cli.Options.boolean("verbose").pipe(
  Cli.Options.withAlias("v"),
  Cli.Options.withDescription("Print resolved paths that are being watched."),
)

const commandArg = Cli.Args.text({ name: "command" }).pipe(
  Cli.Args.withDescription("Command to execute when files change"),
)

const commandArgsArg = Cli.Args.text({ name: "arg" }).pipe(
  Cli.Args.repeated,
)

const mainCommand = Cli.Command.make(
  "rerun",
  {
    paths: pathOpt,
    delay: delayOpt,
    verbose: verboseOpt,
    command: commandArg,
    args: commandArgsArg,
  },
  (args) =>
    Effect.gen(function*() {
      const watchDirs = args.paths.map(v => NPath.resolve(v))

      if (watchDirs.length === 0) {
        watchDirs.push(process.cwd())
      }

      if (args.verbose) {
        yield* Console.log(`Watching:\n${watchDirs.join("\n")}\n`)
      }

      yield* Runner.start({
        command: [args.command, ...args.args],
        path: watchDirs,
        delay: Duration.seconds(args.delay),
      })
    }),
)

export const run = Cli.Command.run(mainCommand, {
  name: "rerun",
  version: "0.1.0",
  summary: Cli.Span.text("Run command on files change"),
})
