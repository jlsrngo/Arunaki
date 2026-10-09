import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { CLI_PROVIDER_REGISTRY } from "../src/server/local-cli/registry"
import { LocalCliProviderDescriptor } from "../src/server/routes/instance/httpapi/groups/provider"

/**
 * The provider note for OpenCode rendered nothing on the card even though the registry had it, and
 * the field was absent from the HTTP response too.
 *
 * LocalCliProviderDescriptor is a Schema.Struct, and a Struct encodes exactly the keys it declares.
 * So a field added to the registry that is not repeated in the schema is dropped during encoding -
 * no error, no warning, at either end. The web type was a third copy of the same list, which is how
 * it survived a while.
 *
 * This encodes every real descriptor and fails on any key the schema does not carry, so the next
 * registry field is a test failure instead of a field that silently does nothing.
 */
const encode = Schema.encodeSync(LocalCliProviderDescriptor)
type Descriptor = Schema.Schema.Type<typeof LocalCliProviderDescriptor>

describe("registry descriptors survive the HTTP schema", () => {
  const descriptors = CLI_PROVIDER_REGISTRY as unknown as Descriptor[]

  test("there is at least one descriptor to check", () => {
    expect(descriptors.length).toBeGreaterThan(0)
  })

  for (const descriptor of descriptors) {
    const id = descriptor.id as string

    test(`${id}: no field is dropped by the schema`, () => {
      const encoded = encode(descriptor) as Record<string, unknown>
      for (const key of Object.keys(descriptor)) {
        expect(Object.keys(encoded)).toContain(key)
      }
    })
  }

  test("a standing note reaches the client", () => {
    // Entitlement only renders before sign-in; a caveat like latency has to survive connected too.
    const withNote = descriptors.find((d) => d.note !== undefined)
    expect(withNote).toBeDefined()
    const encoded = encode(withNote!) as { note?: { text: string; textId: string } }
    expect(encoded.note?.text.length ?? 0).toBeGreaterThan(0)
    expect(encoded.note?.textId.length ?? 0).toBeGreaterThan(0)
  })
})