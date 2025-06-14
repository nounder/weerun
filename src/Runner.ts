import { Command } from "@effect/platform"
import { Process } from "@effect/platform/CommandExecutor"
import {
  Array,
  Console,
  Duration,
  Effect,
  MutableRef,
  pipe,
  Stream,
} from "effect"
import { watchFileChanges } from "./FileSystemExtra.ts"

export const start = (opts: {
  command: [string, ...string[]]
  path: string | string[]
  delay: Duration.Duration
}) => {
  const processRef = MutableRef.make<Process | null>(null)
  const paths = Array.ensure(opts.path)

  const mergedStream = Stream.mergeAll(
    paths.map(dir => watchFileChanges(dir)),
    {
      concurrency: "unbounded",
    },
  )

  return Effect.gen(function*() {
    yield* pipe(
      mergedStream,
      Stream.debounce(opts.delay),
      Stream.tap((event) =>
        Console.log(
          `${event.eventType.toUpperCase()}\t${event.filename}\n`,
        )
      ),
      Stream.runForEach(() =>
        Effect.gen(function*() {
          const [cmd, ...args] = opts.command
          const process = yield* Command
            .make(cmd, ...args)
            .pipe(
              Command.stdout("inherit"),
              Command.start,
            )

          MutableRef.set(processRef, process)
        })
      ),
      Stream.runDrain,
    )
  })
}
