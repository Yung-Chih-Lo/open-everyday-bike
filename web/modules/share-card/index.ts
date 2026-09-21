import sharp from "sharp"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import type { RideInput } from "../records/types"
import { shareCardSvg } from "./layout"
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
  const side = Math.min(meta.width!, meta.height!)
  const left = Math.round(
    (meta.width! - side) * Math.max(0, Math.min(1, input.cropX))
  )
  const top = Math.round(
    (meta.height! - side) * Math.max(0, Math.min(1, input.cropY))
  )
  return sharp(mother)
    .extract({ left, top, width: side, height: side })
    .resize(1080, 1080)
    .composite([{ input: Buffer.from(shareCardSvg(id, input)) }])
    .jpeg({ quality: 90 })
    .toBuffer()
}
export { shareCardSvg, radarSvg, TEMPLATE_VERSION } from "./layout"
