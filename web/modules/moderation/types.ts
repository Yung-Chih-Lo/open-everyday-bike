export type ModerationVerdict =
  "skipped" | "normal" | "abnormal" | "uncertain" | "unavailable"
export interface ModerationInput {
  recordId: number
  contentVersion: number
  bikeNumber: string
  riddenOn: string
  city: string
  locationText: string
  scores: Record<string, number | null>
  overallGrade: string
  impression: string
  shortComment: string
}
export interface ModerationResult {
  verdict: ModerationVerdict
  model: string | null
  policyVersion: string
  confidence: number | null
  errorCode: string | null
}
export interface ModerationAnswer {
  choice: "normal" | "abnormal"
  confidence: number
  model: string
}
export type ModerationAdapter = (
  input: ModerationInput
) => Promise<ModerationAnswer>
