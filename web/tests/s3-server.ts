// Isolated protocol test double. Never imported by application code.
import { createServer } from "node:http"
const objects = new Map<string, Buffer>()
createServer(async (req, res) => {
  const key = new URL(req.url!, "http://localhost").pathname
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
