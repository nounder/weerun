import { Error } from "@effect/platform"
import { pipe, Stream } from "effect"
import type { WatchOptions } from "node:fs"
import * as NFSP from "node:fs/promises"
import * as NPath from "node:path"

/**
 * `@effect/platform` doesn't support recursive file watching.
 */
export const watchFileChanges = (
  path?: string,
  opts?: WatchOptions,
): Stream.Stream<
  NFSP.FileChangeInfo<string>,
  Error.SystemError
> => {
  const baseDir = path ?? process.cwd()

  let stream: Stream.Stream<NFSP.FileChangeInfo<string>, Error.SystemError>
  try {
    stream = Stream.fromAsyncIterable(
      NFSP.watch(baseDir, {
        persistent: false,
        recursive: true,
        ...(opts || {}),
      }),
      error => handleWatchError(error, baseDir),
    )
  } catch (e) {
    const err = handleWatchError(e, baseDir)

    stream = Stream.fail(err)
  }

  return pipe(
    stream,
    Stream.map(event => ({
      ...event,
      filename: event.filename ? NPath.resolve(baseDir, event.filename) : null,
    })),
  )
}

const handleWatchError = (error: any, path: string) =>
  Error.SystemError({
    message: error.message,
    module: "FileSystem",
    reason: "Unknown",
    method: "watch",
    pathOrDescriptor: path,
  })
