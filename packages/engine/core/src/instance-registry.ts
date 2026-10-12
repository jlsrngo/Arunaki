export * as InstanceRegistry from "./instance-registry"

/**
 * Teardown hooks keyed by the directory of the instance being disposed.
 *
 * Lives in core rather than the engine because the thing that has to be torn down when a directory
 * goes away is the location service map, and that map is built in core. An instance and its location
 * share a directory, so "this instance is gone" has to reach the location layer or it keeps serving
 * whatever it read from disk the first time it was asked for.
 */
const disposers = new Set<(directory: string) => Promise<void>>()

export function registerDisposer(disposer: (directory: string) => Promise<void>) {
  disposers.add(disposer)
  return () => {
    disposers.delete(disposer)
  }
}

export async function disposeInstance(directory: string) {
  await Promise.allSettled([...disposers].map((disposer) => disposer(directory)))
}