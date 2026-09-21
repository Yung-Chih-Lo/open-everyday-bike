import { z } from "zod"
export const scoreLabels = [
  "推進",
  "整潔",
  "操控",
  "車況",
  "感應",
  "機動",
] as const
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
  overallGrade: z.enum(["E", "D", "C", "B", "B+", "A", "A+"]),
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
