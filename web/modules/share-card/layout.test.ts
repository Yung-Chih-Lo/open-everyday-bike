import { describe, it, expect } from "vitest"
import { shareCardSvg, radarSvg } from "./layout"
import { renderShareCard } from "./index"
import sharp from "sharp"
import type { RideInput } from "../records/types"
const input: RideInput = {
  bikeNumber: "0120297",
  riddenOn: "2026-09-21",
  city: "台北",
  location: "公園",
  scores: [4, 4, 5, 3, 5, 5],
  overallGrade: "A+",
  impression: "順暢",
  shortComment: "鏈條稍微有聲音，整体很好騎。",
  cropX: 0.5,
  cropY: 0.5,
}
describe("share card", () => {
  it("keeps leading zero, escapes user text and uses independent grade", () => {
    const svg = shareCardSvg(1, { ...input, shortComment: "<script>&" })
    expect(svg).toContain("No.001")
    expect(svg).not.toContain("單車紀錄")
    expect(svg.match(/No\./g)).toHaveLength(1)
    expect(svg).toContain("0120297")
    expect(svg).toContain('A<tspan dy="-48" font-size="54">+</tspan>')
    expect(svg).toContain("&lt;script&gt;&amp;")
  })
  it("does not fill missing ratings as zero", () => {
    const svg = radarSvg([null, 2, 3, 4, 5, 1])
    expect(svg).toContain("未評")
    expect(svg).not.toContain('fill-opacity="0.42"')
    expect(svg.match(/<circle/g)).toHaveLength(5)
  })
  it("fills complete ratings with explicit SVG opacity", () => {
    expect(radarSvg([1, 2, 3, 4, 5, 5])).toContain(
      'fill="#facc15" fill-opacity="0.42"'
    )
  })
  it("supports B+ only as an overall grade with a raised plus", () => {
    expect(shareCardSvg(2, { ...input, overallGrade: "B+" })).toContain(
      'B<tspan dy="-48" font-size="54">+</tspan>'
    )
  })
  it("renders square JPEG with Chinese font", async () => {
    const mother = await sharp({
      create: { width: 1500, height: 1000, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer()
    const result = await renderShareCard(1, input, mother)
    const info = await sharp(result).metadata()
    expect(info.width).toBe(1080)
    expect(info.height).toBe(1080)
    expect(info.format).toBe("jpeg")
  })
})
