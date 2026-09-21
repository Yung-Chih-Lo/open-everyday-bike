import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { normalizePhoto } from "./index"
describe("photo validation", () => {
  it("rejects oversized bodies and unsupported actual formats", async () => {
    await expect(
      normalizePhoto(Buffer.alloc(10 * 1024 * 1024 + 1))
    ).rejects.toThrow("10 MB")
    const gif = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .gif()
      .toBuffer()
    await expect(normalizePhoto(gif)).rejects.toThrow("JPEG")
  })
  it("rejects decompression dimensions beyond limit", async () => {
    const image = await sharp({
      create: { width: 5001, height: 5000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer()
    await expect(normalizePhoto(image)).rejects.toThrow()
  })
  it("normalizes orientation and strips EXIF", async () => {
    const image = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "blue" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const info = await sharp(await normalizePhoto(image)).metadata()
    expect(info.width).toBe(10)
    expect(info.height).toBe(20)
    expect(info.exif).toBeUndefined()
    expect(info.orientation).toBeUndefined()
  })
})
