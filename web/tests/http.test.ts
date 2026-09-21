import { test, expect } from "vitest"
import { NextRequest } from "next/server"
import { boundedBody, checkOrigin } from "@/infra/http"
test("caps actual streamed body even without Content-Length", async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(8))
      c.enqueue(new Uint8Array(8))
      c.close()
    },
  })
  const req = new NextRequest(
    new Request("http://localhost/api/records", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit)
  )
  await expect(boundedBody(req, 10)).rejects.toMatchObject({ status: 413 })
})
test("rejects cross-origin writes", () => {
  expect(() =>
    checkOrigin(
      new NextRequest("http://localhost/api/records", {
        headers: { origin: "https://attacker.invalid" },
      })
    )
  ).toThrow()
})
