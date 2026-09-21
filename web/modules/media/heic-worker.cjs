/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS worker executed directly by Node.js. */
const { parentPort, workerData } = require("node:worker_threads")
const decode = require("heic-decode")
const sharp = require("sharp")

async function convert() {
  let images
  try {
    images = await decode.all({ buffer: new Uint8Array(workerData) })
    const image = images[0]
    if (!image || images.length !== 1) throw new Error("STATIC_ONLY")
    if (
      !Number.isSafeInteger(image.width) ||
      !Number.isSafeInteger(image.height) ||
      image.width < 1 ||
      image.height < 1 ||
      image.width * image.height > 25_000_000
    )
      throw new Error("PIXEL_LIMIT")
    const { width, height, data } = await image.decode()
    const jpeg = await sharp(Buffer.from(data), {
      raw: { width, height, channels: 4 },
    })
      .jpeg({ quality: 92 })
      .toBuffer()
    parentPort.postMessage({ jpeg })
  } catch (error) {
    const code = ["STATIC_ONLY", "PIXEL_LIMIT"].includes(error?.message)
      ? error.message
      : "INVALID_HEIC"
    parentPort.postMessage({ error: code })
  } finally {
    images?.dispose()
  }
}
void convert()
