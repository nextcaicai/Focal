export interface StorageBackupSection {
  checksum: string
  itemCount?: number
  byteLength?: number
}

export interface StorageBackupManifest {
  capturedAt: string
  sourceOrigin: string
  targetOrigin: string
  version: 1
  sections: {
    imageDimensions?: StorageBackupSection
    localStorage: StorageBackupSection
    sqlite?: StorageBackupSection
  }
}

export const sha256Hex = async (bytes: Uint8Array) => {
  const digestInput = new Uint8Array(bytes.byteLength)
  digestInput.set(bytes)
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export const encodeJsonForChecksum = (value: unknown) => {
  return new TextEncoder().encode(JSON.stringify(value))
}
