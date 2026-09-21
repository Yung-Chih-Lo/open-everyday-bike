import { describe, expect, it } from "vitest"
import { isHeic, decodeHeic } from "./heic"
import { normalizePhoto } from "./index"
const header = (brand: string) => {
  const bytes = Buffer.alloc(24)
  bytes.writeUInt32BE(24)
  bytes.write("ftyp", 4)
  bytes.write(brand, 8)
  return bytes
}
describe("HEIC upload", () => {
  it.each(["heic", "heix", "mif1"])(
    "recognizes %s from actual bytes",
    (brand) => {
      expect(isHeic(header(brand))).toBe(true)
    }
  )
  it("does not classify JPEG or AVIF as HEIC", () => {
    expect(isHeic(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false)
    expect(isHeic(header("avif"))).toBe(false)
  })
  it("rejects invalid HEIC safely and releases the converter for retries", async () => {
    await expect(decodeHeic(header("heic"))).rejects.toThrow("HEIC")
    await expect(decodeHeic(header("heic"))).rejects.toThrow("HEIC")
  })
  it("rejects oversized HEIC before decoding", async () => {
    const bytes = Buffer.alloc(10 * 1024 * 1024 + 1)
    header("heic").copy(bytes)
    await expect(normalizePhoto(bytes)).rejects.toThrow("10 MB")
  })
})
