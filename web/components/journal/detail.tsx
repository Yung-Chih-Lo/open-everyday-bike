"use client"
/* eslint-disable @next/next/no-img-element -- Images are server-sized assets or local blob/SVG previews; avoid a second optimizer and preserve authenticated access. */
import { OverallGrade } from "./overall-grade"
import { useParams } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  RecordView,
  useResource,
  Notice,
  Loading,
  PageHeading,
  numberLabel,
  scoreLabels,
  grade,
  request,
} from "@/components/journal/client"
import { Turnstile } from "@/components/journal/turnstile"
export default function Detail() {
  const { id } = useParams()
  const { data, error } = useResource<{ record: RecordView }>(
    `/api/records/${id}`
  )
  const [report, setReport] = useState(false)
  const [reason, setReason] = useState("")
  const [token, setToken] = useState("")
  const [challengeRevision, setChallengeRevision] = useState(0)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function reportRecord() {
    setBusy(true)
    try {
      await request("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          recordId: Number(id),
          reason,
          details: "",
          turnstileToken: token,
        }),
      })
      setReport(false)
      setMessage("已收到檢舉，謝謝你一起維護騎乘紀錄。")
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setToken("")
      setChallengeRevision((n) => n + 1)
      setBusy(false)
    }
  }
  return (
    <>
      <Notice message={error} />
      {data ? (
        <>
          <PageHeading
            eyebrow={`${numberLabel(data.record.id)} / ${data.record.content.riddenOn}`}
            title={data.record.content.shortComment}
          />
          <div className="detail-layout">
            <div>
              {data.record.shareUrl ? (
                <img
                  className="detail-image"
                  src={data.record.shareUrl}
                  alt={`車號 ${data.record.content.bikeNumber} 的騎乘分享圖`}
                />
              ) : data.record.imageUrl ? (
                <img
                  className="detail-image"
                  src={data.record.imageUrl}
                  alt="騎乘照片"
                />
              ) : (
                <Notice message="分享圖尚未完成，可至我的紀錄重試。" />
              )}
            </div>
            <article className="detail-copy">
              <div className="flex justify-end">
                <Badge variant="secondary">{data.record.content.city}</Badge>
              </div>
              <div className="detail-grade">
                <div>
                  <OverallGrade value={data.record.content.overallGrade} />
                </div>
                <Link
                  className="bike-link"
                  href={`/bikes/${data.record.bikeId}`}
                >
                  車號 {data.record.content.bikeNumber} ↗
                </Link>
              </div>
              <dl className="score-summary">
                {scoreLabels.map((label, i) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{grade(data.record.content.scores[i])}</dd>
                  </div>
                ))}
              </dl>
              <header className="flex flex-col gap-2">
                <h2>騎乘筆記</h2>
                <p className="muted text-sm">
                  記錄者 {data.record.authorCode} ·{" "}
                  {data.record.content.riddenOn.replaceAll("-", ".")}
                </p>
              </header>
              <p className="impression">{data.record.content.impression}</p>
              <p className="muted text-sm">
                歷史心得不代表車輛目前車況。每一次騎乘都可能有不同感受。
              </p>
              <div className="detail-actions" aria-label="紀錄操作">
                {data.record.shareUrl && (
                  <Button asChild>
                    <a href={`/api/records/${id}/download`} download>
                      下載分享圖 ↓
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(window.location.href).then(
                      () => setMessage("紀錄連結已複製。"),
                      () => setMessage("請複製瀏覽器網址分享。")
                    )
                  }
                >
                  複製連結
                </Button>
                <Button
                  variant="destructive"
                  aria-expanded={report}
                  aria-controls="report-form"
                  onClick={() => setReport((v) => !v)}
                >
                  回報這筆紀錄
                </Button>
              </div>
              <Notice message={message} />
              {report && (
                <form
                  id="report-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void reportRecord()
                  }}
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="reason">檢舉原因</FieldLabel>
                      <Input
                        id="reason"
                        required
                        maxLength={300}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                    <Turnstile key={challengeRevision} onToken={setToken} />
                    <Button disabled={busy}>送出檢舉</Button>
                  </FieldGroup>
                </form>
              )}
            </article>
          </div>
        </>
      ) : (
        !error && <Loading />
      )}
    </>
  )
}
