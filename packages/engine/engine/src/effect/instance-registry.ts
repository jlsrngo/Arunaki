export * as InstanceRegistry from "./instance-registry"

// The registry moved to core so `buildLocationServiceMap` can register the location layer's own
// teardown. See packages/engine/core/src/instance-registry.ts.
export { registerDisposer, disposeInstance } from "@arunaki/core/instance-registry"
