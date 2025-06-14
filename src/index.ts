import * as Cli from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, pipe } from "effect"
import * as Command from "./Command.ts"

if (import.meta.main) {
  pipe(
    Command.run(process.argv),
    Effect.provide(
      Cli.CliConfig.layer({
        showTypes: false,
        showBuiltIns: false,
      }),
    ),
    Effect.provide(
      BunContext.layer,
    ),
    Effect.scoped,
    BunRuntime.runMain,
  )
}
