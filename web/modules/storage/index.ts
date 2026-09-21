import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
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
  return {
    async put(key, body, visibility, contentType) {
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
