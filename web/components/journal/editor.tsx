"use client"
/* eslint-disable @next/next/no-img-element -- Images are server-sized assets or local blob/SVG previews; avoid a second optimizer and preserve authenticated access. */
import { overallGrades } from "@/modules/records/types"
import { OverallGrade } from "./overall-grade"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { shareCardSvg, photoPlacement } from "@/modules/share-card/layout"
import {
  Notice,
  PageHeading,
  RecordView,
  RideInput,
  request,
  scoreLabels,
  grade,
} from "./client"
import { RideLocation } from "./ride-location"
import { Turnstile } from "./turnstile"
const initial: RideInput = {
  bikeNumber: "",
  riddenOn: new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
  }).format(new Date()),
  city: "台北市",
  location: "",
  scores: [null, null, null, null, null, null],
  overallGrade: "A",
  impression: "",
  shortComment: "",
  cropX: 0.5,
  cropY: 0.5,
}
export function Editor({ record }: { record?: RecordView }) {
  const router = useRouter()
  const [value, setValue] = useState<RideInput>(record?.content ?? initial)
  const previewRequest = useRef(0)
  const [preparingPhoto, setPreparingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState(record?.imageUrl || "")
  const [photoSize, setPhotoSize] = useState({ width: 1080, height: 1080 })
  const placement = photoPlacement(
    photoSize.width,
    photoSize.height,
    1080,
    value
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [recovery, setRecovery] = useState("")
  const [token, setToken] = useState("")
  const [challengeRevision, setChallengeRevision] = useState(0)
  const [requestId, setRequestId] = useState("")
  const [savedId, setSavedId] = useState<number | undefined>(record?.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview)
    },
    [preview]
  )
  function change<K extends keyof RideInput>(key: K, next: RideInput[K]) {
    setValue((v) => ({ ...v, [key]: next }))
    setRequestId("")
  }
  async function selectPhoto(file: File | null) {
    const revision = ++previewRequest.current
    setPhoto(file)
    setPreview("")
    setRequestId("")
    setPhotoError("")
    setPreparingPhoto(false)
    if (!file) {
      setPreview(record?.imageUrl || "")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError("照片不得超過 10 MB")
      return
    }
    const heic =
      /\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)
    if (!heic) {
      setPreview(URL.createObjectURL(file))
      return
    }
    setPreparingPhoto(true)
    try {
      const form = new FormData()
      form.set("photo", file)
      const response = await fetch("/api/media/preview", {
        method: "POST",
        body: form,
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || "照片預覽失敗，請重新選擇")
      }
      const blob = await response.blob()
      if (revision === previewRequest.current)
        setPreview(URL.createObjectURL(blob))
    } catch (error) {
      if (revision === previewRequest.current)
        setPhotoError((error as Error).message)
    } finally {
      if (revision === previewRequest.current) setPreparingPhoto(false)
    }
  }
  async function save() {
    setBusy(true)
    let attemptedPublish = false
    setMessage("")
    try {
      const me = await request<{ contributor: unknown }>("/api/me")
      if (!me.contributor) {
        const created = await request<{ recoveryCode: string }>(
          "/api/identity",
          { method: "POST" }
        )
        setRecovery(created.recoveryCode)
        setMessage("匿名身分已建立。請先保存復原碼，再按一次發布。")
        return
      }
      const body = new FormData()
      body.set("data", JSON.stringify(value))
      body.set("requestId", requestId || crypto.randomUUID())
      setRequestId(String(body.get("requestId")))
      body.set("turnstileToken", token)
      if (photo) body.set("photo", photo)
      attemptedPublish = true
      const result = await request<{
        id: number
        status: string
        message: string
      }>(savedId ? `/api/records/${savedId}` : "/api/records", {
        method: savedId ? "PUT" : "POST",
        body,
      })
      setSavedId(result.id)
      if (result.status === "published") router.push(`/records/${result.id}`)
      else {
        setMessage(result.message || "資料已保存，可稍後重試。")
        setRequestId("")
      }
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      if (attemptedPublish) {
        setToken("")
        setChallengeRevision((n) => n + 1)
      }
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="WRITE YOUR RIDE"
        title={record ? "更新這段騎乘" : "今天，騎得如何？"}
        description="一張照片，六個感受。留下你自己的騎乘筆記。"
      />
      <Notice message={message} />
      {recovery && (
        <section className="recovery-panel">
          <h2>請保存你的復原碼</h2>
          <p>換裝置或清除 Cookie 時，用它找回管理權。請勿公開分享。</p>
          <code>{recovery}</code>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(recovery).then(
                () => setMessage("復原碼已複製。"),
                () => setMessage("無法複製，請手動保存復原碼。")
              )
            }
          >
            複製復原碼
          </Button>
        </section>
      )}
      <form
        className="editor-layout"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="editor-fields">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="photo">01 / 騎乘照片</FieldLabel>
              <Input
                id="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                required={!savedId && !photo}
                onChange={(e) => void selectPhoto(e.target.files?.[0] ?? null)}
              />
              <FieldDescription>
                JPEG、PNG、WebP、HEIC 或 HEIF；最多 10 MB／25 MP。iPhone
                照片會自動轉檔。
              </FieldDescription>
            </Field>
            <div className="two-fields">
              <Field>
                <FieldLabel htmlFor="bikeNumber">車號</FieldLabel>
                <Input
                  id="bikeNumber"
                  value={value.bikeNumber}
                  inputMode="numeric"
                  required
                  maxLength={20}
                  placeholder="0120297"
                  onChange={(e) => change("bikeNumber", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="riddenOn">騎乘日期</FieldLabel>
                <Input
                  id="riddenOn"
                  type="date"
                  required
                  value={value.riddenOn}
                  onChange={(e) => change("riddenOn", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="city">騎乘縣市</FieldLabel>
                <RideLocation
                  value={value.city}
                  onChange={(city) => {
                    setValue((v) => ({ ...v, city, location: "" }))
                    setRequestId("")
                  }}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>02 / 六個面向</FieldLabel>
              <FieldDescription>
                E 至 A，由低到高；沒有體驗的項目可保留未評。
              </FieldDescription>
              <div className="score-fields">
                {scoreLabels.map((label, i) => (
                  <Field key={label}>
                    <FieldLabel htmlFor={`score${i}`}>{label}</FieldLabel>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      size="sm"
                      className="flex-wrap"
                      id={`score${i}`}
                      aria-label={label}
                      value={String(value.scores[i] ?? "unrated")}
                      onValueChange={(next) => {
                        if (next)
                          change(
                            "scores",
                            value.scores.map((score, j) =>
                              i === j
                                ? next === "unrated"
                                  ? null
                                  : Number(next)
                                : score
                            )
                          )
                      }}
                    >
                      <ToggleGroupItem
                        value="unrated"
                        aria-label={`${label}未評`}
                      >
                        未評
                      </ToggleGroupItem>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <ToggleGroupItem
                          key={n}
                          value={String(n)}
                          aria-label={`${label} ${grade(n)}`}
                        >
                          <OverallGrade value={grade(n)} />
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </Field>
                ))}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="overallGrade">整體評等</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                className="flex-wrap"
                id="overallGrade"
                aria-label="整體評等"
                value={value.overallGrade}
                onValueChange={(next) => {
                  if (next)
                    change("overallGrade", next as RideInput["overallGrade"])
                }}
              >
                {overallGrades.map((g) => (
                  <ToggleGroupItem
                    key={g}
                    value={g}
                    aria-label={`總評 ${g}`}
                    data-grade={g}
                  >
                    <span>
                      <OverallGrade value={g} />
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                這是你的整體感受，不是六項分數的平均。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="shortComment">03 / 一句短評</FieldLabel>
              <Input
                id="shortComment"
                maxLength={20}
                value={value.shortComment}
                placeholder="這次騎乘，最想說的一句話"
                onChange={(e) => change("shortComment", e.target.value)}
              />
              <FieldDescription>
                {value.shortComment.length} / 20 字，選填，會出現在分享圖上。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="impression">完整感想</FieldLabel>
              <Textarea
                id="impression"
                required
                maxLength={2000}
                rows={5}
                value={value.impression}
                placeholder="路況、踩踏感，或是這台車的小個性……"
                onChange={(e) => change("impression", e.target.value)}
              />
            </Field>
            <Turnstile key={challengeRevision} onToken={setToken} />
            <Notice message={photoError} />
            <Button
              size="lg"
              type="submit"
              disabled={busy || preparingPhoto || Boolean(photoError)}
            >
              {busy
                ? "正在保存與產生分享圖…"
                : record
                  ? "儲存並發布更新"
                  : "發布騎乘紀錄 ↗"}
            </Button>
            {record && (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmDelete((v) => !v)}
                >
                  刪除這筆紀錄
                </Button>
                {confirmDelete && (
                  <div className="flex flex-col gap-3">
                    <p>刪除後將撤下紀錄與公開圖片。確定刪除？</p>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          await request(`/api/records/${record.id}`, {
                            method: "DELETE",
                          })
                          router.push("/me")
                        } catch (e) {
                          setMessage((e as Error).message)
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      確認刪除
                    </Button>
                  </div>
                )}
              </>
            )}
          </FieldGroup>
        </div>
        <aside className="preview-column">
          <p className="eyebrow">YOUR SHARE CARD / 即時預覽</p>
          {preparingPhoto && <p role="status">正在轉換 iPhone 照片，請稍候…</p>}
          <div className="share-preview">
            {preview && (
              <img
                className="preview-photo"
                src={preview}
                alt="照片裁切預覽"
                onLoad={(e) =>
                  setPhotoSize({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight,
                  })
                }
                style={{
                  width: `${placement.width / 10.8}%`,
                  height: `${placement.height / 10.8}%`,
                  left: `${placement.left / 10.8}%`,
                  top: `${placement.top / 10.8}%`,
                }}
              />
            )}
            <img
              className="preview-overlay"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(shareCardSvg(savedId ?? "預覽", value))}`}
              alt="分享圖預覽"
            />
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cropZoom">
                照片縮放 · {Math.round((value.cropZoom ?? 1) * 100)}%
              </FieldLabel>
              <input
                id="cropZoom"
                type="range"
                min="0.25"
                max="2"
                step="0.01"
                value={value.cropZoom ?? 1}
                onChange={(e) => change("cropZoom", Number(e.target.value))}
              />
              <FieldDescription>
                縮小可顯示更多照片，留白會以深色填滿；放大可裁切細節。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="cropX">照片水平位置</FieldLabel>
              <input
                id="cropX"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={value.cropX}
                onChange={(e) => change("cropX", Number(e.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cropY">照片垂直位置</FieldLabel>
              <input
                id="cropY"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={value.cropY}
                onChange={(e) => change("cropY", Number(e.target.value))}
              />
            </Field>
            <Field>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  change("cropZoom", 1)
                  change("cropX", 0.5)
                  change("cropY", 0.5)
                }}
              >
                重設照片位置與縮放
              </Button>
            </Field>
          </FieldGroup>
          <p className="muted text-sm">
            正式編號會在儲存後產生。發布後可下載 1080 × 1080 分享圖。
          </p>
        </aside>
      </form>
    </>
  )
}
