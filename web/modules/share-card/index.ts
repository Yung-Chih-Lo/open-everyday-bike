import sharp from "sharp"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import type { RideInput } from "../records/types"
import { shareCardSvg, photoPlacement } from "./layout"
let configured = false
function configureFont() {
  if (configured) return
  const directory = path.join(process.cwd(), "assets/fonts")
  const config = path.join(os.tmpdir(), `ubike-fonts-${process.pid}.conf`)
  const safe = directory.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  fs.writeFileSync(
    config,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${safe}</dir><cachedir>${os.tmpdir()}/ubike-font-cache</cachedir></fontconfig>`
  )
  process.env.FONTCONFIG_FILE = config
  configured = true
}
export async function renderShareCard(
  id: number,
  input: RideInput,
  mother: Buffer
): Promise<Buffer> {
  configureFont()
  const meta = await sharp(mother).metadata()
  const placement = photoPlacement(meta.width!, meta.height!, 1080, input)
  const left = Math.max(0, placement.left),
    top = Math.max(0, placement.top)
  const width = Math.min(1080, placement.left + placement.width) - left
  const height = Math.min(1080, placement.top + placement.height) - top
  const sourceLeft = Math.max(
    0,
    Math.min(
      meta.width! - 1,
      Math.round(((left - placement.left) / placement.width) * meta.width!)
    )
  )
  const sourceTop = Math.max(
    0,
    Math.min(
      meta.height! - 1,
      Math.round(((top - placement.top) / placement.height) * meta.height!)
    )
  )
  const photo = await sharp(mother)
    .extract({
      left: sourceLeft,
      top: sourceTop,
      width: Math.max(
        1,
        Math.min(
          meta.width! - sourceLeft,
          Math.round((width / placement.width) * meta.width!)
        )
      ),
      height: Math.max(
        1,
        Math.min(
          meta.height! - sourceTop,
          Math.round((height / placement.height) * meta.height!)
        )
      ),
    })
    .resize(width, height, { fit: "fill" })
    .toBuffer()
  return sharp({
    create: { width: 1080, height: 1080, channels: 3, background: "#45483a" },
  })
    .composite([
      { input: photo, left, top },
      { input: Buffer.from(shareCardSvg(id, input)) },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()
}
export { shareCardSvg, radarSvg, TEMPLATE_VERSION } from "./layout"
