import { gradeColors } from "../records/types"
import type { RideInput } from "../records/types"
export const CARD_SIZE = 1080
export const TEMPLATE_VERSION = 4
export const SCORE_LABELS = ["推進", "整潔", "操控", "車況", "感應", "機動"]
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!
  )
const point = (axis: number, radius: number) => {
  const angle = -Math.PI / 2 - (axis * Math.PI) / 3
  return [290 + Math.cos(angle) * radius, 765 + Math.sin(angle) * radius]
}
export function radarSvg(scores: (number | null)[]): string {
  const grid = [1, 2, 3, 4, 5]
    .map(
      (level) =>
        `<polygon points="${scores.map((_, i) => point(i, level * 34).join(",")).join(" ")}" fill="none" stroke="#ffffff66"/>`
    )
    .join("")
  const axes = scores
    .map(
      (_, i) =>
        `<line x1="290" y1="765" x2="${point(i, 170)[0]}" y2="${point(i, 170)[1]}" stroke="#ffffff55"/>`
    )
    .join("")
  const full = scores.every((s) => s !== null)
  const shape = full
    ? `<polygon points="${scores.map((s, i) => point(i, s! * 34).join(",")).join(" ")}" fill="#facc15" fill-opacity="0.42" stroke="#facc15" stroke-width="5"/>`
    : ""
  const dots = scores
    .map((s, i) =>
      s === null
        ? ""
        : `<circle cx="${point(i, s * 34)[0]}" cy="${point(i, s * 34)[1]}" r="7" fill="#facc15"/>`
    )
    .join("")
  const labels = scores
    .map((s, i) => {
      const [x, y] = point(i, 213)
      return `<text x="${x}" y="${y + 10}" text-anchor="middle" font-size="26" font-weight="700">${SCORE_LABELS[i]} ${s === null ? "未評" : "EDCBA"[s - 1]}</text>`
    })
    .join("")
  return grid + axes + shape + dots + labels
}
export function shareCardSvg(id: number | string, input: RideInput): string {
  const lines = Array.from(input.shortComment).reduce<string[]>((out, c, i) => {
    const n = Math.floor(i / 10)
    out[n] = (out[n] ?? "") + c
    return out
  }, [])
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><defs><linearGradient id="shade" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".36"/><stop offset=".45" stop-color="#000" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".9"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#shade)"/><g fill="white" font-family="Noto Sans TC, sans-serif"><text x="42" y="68" font-size="44" font-weight="800">No.${escape(String(id).padStart(3, "0"))}</text><text x="42" y="108" font-size="28">${escape(input.bikeNumber)}</text><text x="1038" y="65" text-anchor="end" font-size="28">${escape(input.riddenOn.replaceAll("-", "."))}</text>${radarSvg(input.scores)}${input.overallGrade === "SSR" ? '<g transform="translate(642 827) scale(1.2)"><path d="M24 0C31 20 45 22 45 39A23 23 0 0 1 0 39C0 25 12 19 14 9C16 22 22 25 24 0Z" fill="#ef4428"/><path d="M24 26C25 37 34 38 32 46A10 10 0 0 1 12 44C12 38 20 34 24 26Z" fill="#ffd36a"/></g>' : ""}<text x="600" y="945" font-size="${input.overallGrade === "SSR" ? 65 : 108}" font-weight="800" fill="${gradeColors[input.overallGrade].bright}">${escape(input.overallGrade === "SSR" ? "SSR" : input.overallGrade[0])}${input.overallGrade.endsWith("+") ? '<tspan dy="-48" font-size="54">+</tspan>' : ""}</text>${lines.map((line, i) => `<text x="770" y="${860 + i * 36}" font-size="27">${escape(line)}</text>`).join("")}</g><rect y="1065" width="1080" height="15" fill="#facc15"/></svg>`
}
