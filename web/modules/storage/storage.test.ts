import { afterEach, describe, it, expect, vi } from "vitest"
const send = vi.fn()
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = send
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))
import { createS3Storage } from "./index"
afterEach(() => {
  vi.unstubAllEnvs()
  send.mockReset()
})
function configure() {
  for (const [name, value] of Object.entries({
    S3_ENDPOINT: "https://s3.test",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_PRIVATE_BUCKET: "private",
    S3_PUBLIC_BUCKET: "public",
    ASSET_PUBLIC_BASE_URL: "https://images.test/",
  }))
    vi.stubEnv(name, value)
}
describe("S3 adapter", () => {
  it("requires explicit configuration without fallback", () => {
    vi.stubEnv("S3_ENDPOINT", "")
    expect(() => createS3Storage()).toThrow("S3_ENDPOINT")
  })
  it("isolates buckets and builds encoded URLs", async () => {
    configure()
    const store = createS3Storage()
    send.mockResolvedValue({})
    await store.put("a.jpg", Buffer.from("image"), "private", "image/jpeg")
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "private",
      Key: "a.jpg",
      CacheControl: "private, no-store",
    })
    await store.remove("a.jpg", "public")
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: "public",
      Key: "a.jpg",
    })
    expect(store.publicUrl("records/a b.jpg")).toBe(
      "https://images.test/records/a%20b.jpg"
    )
  })
})
