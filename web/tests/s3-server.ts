// Isolated protocol test double. Never imported by application code.
import { createServer } from "node:http"
const objects = new Map<string, Buffer>()
const buckets = new Set<string>()
const policies = new Map<string, string>()
createServer(async (req, res) => {
  const url = new URL(req.url!, "http://localhost")
  const key = url.pathname
  const bucket = key.split("/")[1]
  const bucketOnly = key.split("/").filter(Boolean).length === 1
  if (bucketOnly) {
    if (req.method === "PUT" && !url.searchParams.has("policy")) {
      buckets.add(bucket)
      res.end()
      return
    }
    if (!buckets.has(bucket)) {
      res.statusCode = 404
      res.end("<Error><Code>NoSuchBucket</Code></Error>")
      return
    }
    if (req.method === "HEAD") {
      res.end()
      return
    }
    if (url.searchParams.has("policy")) {
      if (req.method === "PUT") {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(Buffer.from(chunk))
        policies.set(bucket, Buffer.concat(chunks).toString())
        res.end()
        return
      }
      const policy = policies.get(bucket)
      if (!policy) {
        res.statusCode = 404
        res.end("<Error><Code>NoSuchBucketPolicy</Code></Error>")
      } else {
        res.setHeader("Content-Type", "application/json")
        res.end(policy)
      }
      return
    }
  }
  if (!buckets.has(bucket)) {
    res.statusCode = 404
    res.end("<Error><Code>NoSuchBucket</Code></Error>")
    return
  }
  if (req.method === "PUT") {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    objects.set(key, Buffer.concat(chunks))
    res.setHeader("ETag", '"fixture"')
    res.end()
    return
  }
  if (req.method === "DELETE") {
    objects.delete(key)
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method === "GET") {
    const data = objects.get(key)
    if (!data) {
      res.statusCode = 404
      res.end("<Error><Code>NoSuchKey</Code></Error>")
      return
    }
    res.setHeader("Content-Type", "image/jpeg")
    res.end(data)
    return
  }
  res.statusCode = 405
  res.end()
}).listen(19000, "127.0.0.1")
