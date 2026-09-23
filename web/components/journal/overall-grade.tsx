import type { CSSProperties } from "react"
import { gradeColors } from "@/modules/records/types"
export function OverallGrade({ value }: { value: string }) {
  const color = gradeColors[value]
  return (
    <span
      className="rating-grade"
      data-grade={value}
      style={
        color
          ? ({
              "--grade-ink": color.ink,
              "--grade-bright": color.bright,
            } as CSSProperties)
          : undefined
      }
    >
      {value === "SSR" ? (
        <>
          <span aria-hidden="true" className="rating-flame">
            🔥
          </span>
          SSR
        </>
      ) : (
        <>
          {value[0]}
          {value.endsWith("+") && <sup className="overall-grade-plus">+</sup>}
        </>
      )}
    </span>
  )
}
