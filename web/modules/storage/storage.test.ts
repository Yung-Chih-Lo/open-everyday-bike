import { afterEach, describe, it, expect, vi } from "vitest"
const send = vi.fn()
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = send
  },
  HeadBucketCommand: class {
    constructor(public input: unknown) {}
  },
  CreateBucketCommand: class {
    constructor(public input: unknown) {}
  },
  GetBucketPolicyCommand: class {
    constructor(public input: unknown) {}
  },
  PutBucketPolicyCommand: class {
    constructor(public input: unknown) {}
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
import {
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"
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
    expect(
      send.mock.calls.find(([c]) => c instanceof PutObjectCommand)![0].input
    ).toMatchObject({
      Bucket: "private",
      Key: "a.jpg",
      CacheControl: "private, no-store",
    })
    await store.remove("a.jpg", "public")
    expect(send.mock.calls.at(-1)![0].input).toEqual({
      Bucket: "public",
      Key: "a.jpg",
    })
    expect(store.publicUrl("records/a b.jpg")).toBe(
      "https://images.test/records/a%20b.jpg"
    )
  })
})

it("creates missing buckets before uploads and grants only public object reads", async () => {
  configure()
  send.mockImplementation(async (command) => {
    if (command instanceof HeadBucketCommand)
      throw { $metadata: { httpStatusCode: 404 } }
    if (command instanceof GetBucketPolicyCommand)
      throw { name: "NoSuchBucketPolicy" }
    return {}
  })
  const store = createS3Storage()
  await Promise.all([
    store.put("a", Buffer.from("a"), "private", "image/jpeg"),
    store.put("b", Buffer.from("b"), "public", "image/jpeg"),
  ])
  const commands = send.mock.calls.map(([c]) => c)
  expect(
    commands
      .filter((c) => c instanceof CreateBucketCommand)
      .map((c) => c.input.Bucket)
  ).toEqual(["private", "public"])
  const policy = commands.find((c) => c instanceof PutBucketPolicyCommand)!
  expect(policy.input.Bucket).toBe("public")
  expect(JSON.parse(policy.input.Policy!).Statement).toEqual([
    {
      Sid: "UbikePublicRead",
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::public/*",
    },
  ])
  expect(
    commands.findIndex((c) => c instanceof PutObjectCommand)
  ).toBeGreaterThan(commands.indexOf(policy))
  expect(commands.filter((c) => c instanceof HeadBucketCommand)).toHaveLength(2)
})
it.each([403, 500])(
  "does not create or upload after a %s and retries initialization later",
  async (status) => {
    configure()
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const store = createS3Storage()
    send.mockRejectedValueOnce({
      name: "Unavailable",
      $metadata: { httpStatusCode: status },
    })
    await expect(
      store.put("a", Buffer.from("a"), "private", "image/jpeg")
    ).rejects.toThrow("初始化失敗")
    expect(send).toHaveBeenCalledTimes(1)
    send.mockResolvedValue({})
    await store.put("a", Buffer.from("a"), "private", "image/jpeg")
    expect(send.mock.calls.some(([c]) => c instanceof PutObjectCommand)).toBe(
      true
    )
    log.mockRestore()
  }
)
it("preserves other policy statements and recovers from a failed policy write", async () => {
  configure()
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  const unrelated = {
    Sid: "ExistingRule",
    Effect: "Deny",
    Action: "s3:DeleteObject",
    Resource: "*",
    Principal: "*",
  }
  let fail = true
  send.mockImplementation(async (c) => {
    if (c instanceof GetBucketPolicyCommand)
      return {
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [unrelated],
        }),
      }
    if (c instanceof PutBucketPolicyCommand && fail) {
      fail = false
      throw { name: "AccessDenied" }
    }
    return {}
  })
  const store = createS3Storage()
  await expect(
    store.put("a", Buffer.from("a"), "private", "image/jpeg")
  ).rejects.toThrow("初始化失敗")
  expect(send.mock.calls.some(([c]) => c instanceof PutObjectCommand)).toBe(
    false
  )
  await store.put("a", Buffer.from("a"), "private", "image/jpeg")
  const writes = send.mock.calls.filter(
    ([c]) => c instanceof PutBucketPolicyCommand
  )
  expect(writes).toHaveLength(2)
  expect(JSON.parse(writes[1][0].input.Policy).Statement).toContainEqual(
    unrelated
  )
  log.mockRestore()
})
it("accepts creation by another instance but not a bucket owned by someone else", async () => {
  configure()
  let owned = true
  send.mockImplementation(async (c) => {
    if (c instanceof HeadBucketCommand)
      throw { $metadata: { httpStatusCode: 404 } }
    if (c instanceof CreateBucketCommand)
      throw { name: owned ? "BucketAlreadyOwnedByYou" : "BucketAlreadyExists" }
    return {}
  })
  await createS3Storage().put("a", Buffer.from("a"), "private", "image/jpeg")
  owned = false
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  await expect(
    createS3Storage().put("a", Buffer.from("a"), "private", "image/jpeg")
  ).rejects.toThrow("初始化失敗")
  log.mockRestore()
})
it("rejects using the same bucket for private and public images", () => {
  configure()
  vi.stubEnv("S3_PUBLIC_BUCKET", "private")
  expect(() => createS3Storage()).toThrow("must be different")
})
