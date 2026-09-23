import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3"
import { AppError } from "@/infra/security"
export type Visibility = "private" | "public"
export interface ObjectStorage {
  put(
    key: string,
    body: Buffer,
    visibility: Visibility,
    contentType: string
  ): Promise<void>
  get(key: string, visibility: Visibility): Promise<Buffer>
  remove(key: string, visibility: Visibility): Promise<void>
  publicUrl(key: string): string
}
export function createS3Storage(): ObjectStorage {
  const required = (name: string) => {
    const value = process.env[name]
    if (!value) throw new Error(`Missing storage configuration: ${name}`)
    return value
  }
  const client = new S3Client({
    maxAttempts: 2,
    requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 },
    endpoint: required("S3_ENDPOINT"),
    region: required("S3_REGION"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
  })
  const buckets = {
    private: required("S3_PRIVATE_BUCKET"),
    public: required("S3_PUBLIC_BUCKET"),
  }
  const base = required("ASSET_PUBLIC_BASE_URL").replace(/\/$/, "")
  if (buckets.private === buckets.public)
    throw new Error("Private and public storage buckets must be different")
  let ready: Promise<void> | undefined
  async function initialize() {
    for (const bucket of Object.values(buckets)) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }))
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode !== 404
        )
          throw error
        try {
          await client.send(new CreateBucketCommand({ Bucket: bucket }))
        } catch (error) {
          // Another application instance may have created it after our check.
          if ((error as Error).name !== "BucketAlreadyOwnedByYou") throw error
        }
      }
    }
    let policy: { Version: string; Statement: Record<string, unknown>[] } = {
      Version: "2012-10-17",
      Statement: [],
    }
    try {
      const result = await client.send(
        new GetBucketPolicyCommand({ Bucket: buckets.public })
      )
      if (result.Policy) policy = JSON.parse(result.Policy)
    } catch (error) {
      if ((error as Error).name !== "NoSuchBucketPolicy") throw error
    }
    const statement = {
      Sid: "UbikePublicRead",
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: `arn:aws:s3:::${buckets.public}/*`,
    }
    if (!Array.isArray(policy.Statement))
      throw new Error("Invalid bucket policy")
    const existing = policy.Statement.find((s) => s.Sid === statement.Sid)
    if (JSON.stringify(existing) !== JSON.stringify(statement)) {
      await client.send(
        new PutBucketPolicyCommand({
          Bucket: buckets.public,
          Policy: JSON.stringify({
            ...policy,
            Statement: [
              ...policy.Statement.filter((s) => s.Sid !== statement.Sid),
              statement,
            ],
          }),
        })
      )
    }
  }
  async function ensureReady() {
    ready ??= initialize().catch((error) => {
      ready = undefined
      // Never log credentials, signed requests or raw provider responses.
      console.error("storage_initialization_failed", (error as Error).name)
      throw new AppError("圖片儲存空間初始化失敗，請稍後重試或聯絡管理員", 503)
    })
    await ready
  }
  return {
    async put(key, body, visibility, contentType) {
      await ensureReady()
      await client.send(
        new PutObjectCommand({
          Bucket: buckets[visibility],
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl:
            visibility === "public"
              ? "public, max-age=60, must-revalidate"
              : "private, no-store",
        })
      )
    },
    async get(key, visibility) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: buckets[visibility], Key: key })
      )
      if (!response.Body) throw new Error("Image not found")
      return Buffer.from(await response.Body.transformToByteArray())
    },
    async remove(key, visibility) {
      await client.send(
        new DeleteObjectCommand({ Bucket: buckets[visibility], Key: key })
      )
    },
    publicUrl(key) {
      return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`
    },
  }
}
let singleton: ObjectStorage | undefined
export function getStorage(): ObjectStorage {
  return (singleton ??= createS3Storage())
}
