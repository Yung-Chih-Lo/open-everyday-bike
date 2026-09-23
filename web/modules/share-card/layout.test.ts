import { describe, it, expect } from "vitest"
import { shareCardSvg, radarSvg, photoPlacement } from "./layout"
import { renderShareCard } from "./index"
import sharp from "sharp"
import { rideSchema, overallGrades, gradeColors } from "../records/types"
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

it("accepts and renders SSR in full while keeping six scores bounded to A", async () => {
  const ssr = { ...input, overallGrade: "SSR" as const }
  expect(rideSchema.parse(ssr).overallGrade).toBe("SSR")
  expect(
    rideSchema.safeParse({ ...ssr, scores: [6, 5, 5, 5, 5, 5] }).success
  ).toBe(false)
  const svg = shareCardSvg(1, ssr)
  expect(svg).toContain(">SSR</text>")
  expect(svg).toContain('fill="#ef4428"')
  expect(svg).toContain(`fill="${gradeColors.SSR.bright}"`)
  for (const g of overallGrades)
    expect(shareCardSvg(1, { ...input, overallGrade: g })).toContain(
      `fill="${gradeColors[g].bright}"`
    )
  const mother = await sharp({
    create: { width: 1080, height: 1080, channels: 3, background: "#333" },
  })
    .jpeg()
    .toBuffer()
  const rendered = await renderShareCard(1, ssr, mother)
  expect((await sharp(rendered).metadata()).width).toBe(1080)
})

it("allows an empty short comment and caps it at twenty characters", () => {
  for (const shortComment of ["", "好".repeat(20)]) {
    expect(rideSchema.safeParse({ ...input, shortComment }).success).toBe(true)
  }
  expect(
    rideSchema.safeParse({ ...input, shortComment: "好".repeat(21) }).success
  ).toBe(false)
  expect(shareCardSvg(1, { ...input, shortComment: "" })).toContain("No.001")
})

it("matches photo placement for fit, shrink, zoom and edge alignment", () => {
  expect(photoPlacement(1600, 800, 1080, input)).toEqual({
    width: 2160,
    height: 1080,
    left: -540,
    top: 0,
  })
  expect(photoPlacement(1600, 800, 1080, { ...input, cropZoom: 0.5 })).toEqual({
    width: 1080,
    height: 540,
    left: 0,
    top: 270,
  })
  expect(
    photoPlacement(800, 1600, 1080, {
      ...input,
      cropZoom: 2,
      cropX: 1,
      cropY: 0,
    })
  ).toEqual({ width: 2160, height: 4320, left: -1080, top: 0 })
  expect(rideSchema.safeParse({ ...input, cropZoom: 0 }).success).toBe(false)
  expect(rideSchema.safeParse({ ...input, cropZoom: 2.1 }).success).toBe(false)
})
it("renders zoomed-out photos with padding and zoomed-in photos without padding", async () => {
  const photo = await sharp({
    create: { width: 1600, height: 800, channels: 3, background: "#ff0000" },
  })
    .jpeg()
    .toBuffer()
  for (const cropZoom of [0.25, 1, 2]) {
    const card = await renderShareCard(
      1,
      { ...input, cropZoom, shortComment: "" },
      photo
    )
    const { data, info } = await sharp(card)
      .raw()
      .toBuffer({ resolveWithObject: true })
    const pixel = (x: number, y: number) =>
      Array.from(
        data.subarray(
          (y * info.width + x) * info.channels,
          (y * info.width + x) * info.channels + 3
        )
      )
    const center = pixel(540, 500),
      edge = pixel(10, 500)
    expect(center[0]).toBeGreaterThan(center[1] * 2)
    if (cropZoom === 0.25) expect(Math.abs(edge[0] - edge[1])).toBeLessThan(15)
    else expect(edge[0]).toBeGreaterThan(edge[1] * 2)
  }
})
