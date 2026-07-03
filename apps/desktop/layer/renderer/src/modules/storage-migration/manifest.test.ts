import { describe, expect, it } from "vitest"

import { encodeJsonForChecksum, sha256Hex } from "./manifest"

describe("storage migration manifest helpers", () => {
  it("creates stable sha256 checksums", async () => {
    await expect(sha256Hex(new TextEncoder().encode("focal"))).resolves.toBe(
      "bdb9a6ffe089902d706901766eb5cd9267ca4cec67e5791a56bac1d91aa97a40",
    )
  })

  it("encodes JSON snapshots for checksums", () => {
    expect(Array.from(encodeJsonForChecksum({ a: 1 }))).toEqual(
      Array.from(new TextEncoder().encode('{"a":1}')),
    )
  })
})
