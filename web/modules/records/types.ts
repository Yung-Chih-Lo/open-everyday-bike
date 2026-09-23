import { z } from "zod"
export const scoreLabels = [
  "推進",
  "整潔",
  "操控",
  "車況",
  "感應",
  "機動",
] as const
export const overallGrades = [
  "E",
  "D",
  "C",
  "B",
  "B+",
  "A",
  "A+",
  "SSR",
] as const
export const gradeColors: Record<string, { ink: string; bright: string }> = {
  E: { ink: "#59616a", bright: "#cbd5e1" },
  D: { ink: "#855719", bright: "#f5cb83" },
  C: { ink: "#247047", bright: "#86efac" },
  B: { ink: "#2366a3", bright: "#93c5fd" },
  "B+": { ink: "#4f57b4", bright: "#b4baff" },
  A: { ink: "#7d3daf", bright: "#d8b4fe" },
  "A+": { ink: "#aa3178", bright: "#f9a8d4" },
  SSR: { ink: "#c53020", bright: "#ff9866" },
}
export const rideSchema = z.object({
  bikeNumber: z
    .string()
    .trim()
    .regex(/^\d{1,20}$/, "請填寫有效車號"),
  riddenOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "日期無效"
    ),
  city: z.string().trim().min(1).max(30),
  location: z.string().trim().max(120),
  scores: z.array(z.number().int().min(1).max(5).nullable()).length(6),
  overallGrade: z.enum(overallGrades),
  impression: z.string().trim().max(2000),
  shortComment: z.string().trim().max(40),
  cropX: z.number().min(0).max(1).default(0.5),
  cropY: z.number().min(0).max(1).default(0.5),
})
export type RideInput = z.infer<typeof rideSchema>
export type RecordStatus = "draft" | "published" | "hidden" | "deleted"
export type RecordView = {
  id: number
  bikeId: number
  authorId: string
  authorCode: string
  status: RecordStatus
  version: number
  content: RideInput
  updatedAt: string
  imageUrl?: string
  shareUrl?: string
}
