"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  PageHeading,
  RecordView,
  useResource,
  Notice,
  Loading,
  request,
  numberLabel,
} from "./client"
type AdminData = {
  records: RecordView[]
  reports: { id: number; recordId: number; reason: string; status: string }[]
  settings: {
    moderationEnabled: boolean
    configured: boolean
    providers: { official: boolean; openrouter: boolean }
  }
}
export function Admin({ settingsOnly = false }: { settingsOnly?: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const { data, error, reload } = useResource<AdminData>(
    `/api/admin?q=${encodeURIComponent(search)}`
  )
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState("")
  async function perform(url: string, body: unknown, method = "POST") {
    setBusy(true)
    try {
      const result = await request<{
        message?: string
        verdict?:
          "normal" | "abnormal" | "uncertain" | "unavailable" | "skipped"
        errorCode?: string | null
      }>(url, {
        method,
        body: JSON.stringify(body),
      })
      if (url === "/api/admin/test") {
        const labels = {
          normal: "正常",
          abnormal: "不正常",
          uncertain: "信心不足",
          skipped: "未執行",
          unavailable: "無法連線",
        }
        setMessage(
          result.verdict &&
            ["normal", "abnormal", "uncertain"].includes(result.verdict)
            ? `Jev 連線成功，測試分類：${labels[result.verdict]}。`
            : `Jev 連線測試未成功${result.errorCode ? `（${result.errorCode}）` : ""}，請確認服務設定或稍後重試。`
        )
      } else setMessage(result.message || "操作完成。")
      setPassword("")
      if (url.endsWith("logout")) router.push("/admin")
      reload()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="text-center">
        <PageHeading
          eyebrow="JOURNAL MANAGEMENT"
          title={settingsOnly ? "網站設定" : "管理工作台"}
          description="維護內容品質，讓每份真實感受都能被看見。"
        />
      </div>
      <Notice message={message} />
      {!data ? (
        error ? (
          <section className="login-panel text-center">
            <h2>管理員登入</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void perform("/api/admin/login", { password })
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel className="justify-center" htmlFor="password">
                    管理密碼
                  </FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Button disabled={busy}>登入</Button>
              </FieldGroup>
            </form>
          </section>
        ) : (
          <Loading />
        )
      ) : (
        <>
          <nav className="mb-8 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/admin">紀錄與檢舉</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/settings">網站設定</Link>
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void perform("/api/admin/logout", {})}
            >
              登出
            </Button>
          </nav>
          {settingsOnly ? (
            <Card>
              <CardHeader>
                <CardTitle>投稿審核</CardTitle>
                <CardDescription>
                  開關會立即影響後續發布嘗試，不回溯處理既有紀錄。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="moderation">
                    啟用 Jev 投稿審核
                  </FieldLabel>
                  <Switch
                    id="moderation"
                    checked={data.settings.moderationEnabled}
                    disabled={
                      busy ||
                      (!data.settings.configured &&
                        !data.settings.moderationEnabled)
                    }
                    onCheckedChange={(enabled) =>
                      void perform("/api/admin/settings", { enabled }, "PATCH")
                    }
                  />
                </Field>
                <p>
                  Jev（官方優先／OpenRouter 備援）：
                  {data.settings.configured
                    ? "已配置"
                    : "尚未配置 API key，暫時無法開啟"}
                </p>
                <p className="muted text-sm">
                  官方：{data.settings.providers.official ? "已配置" : "未配置"}
                  ；OpenRouter：
                  {data.settings.providers.openrouter ? "已配置" : "未配置"}
                </p>
                <p className="muted">
                  關閉時直接發布且不呼叫
                  Jev。開啟時，異常內容保留為非公開草稿；服務失敗可稍後重試。
                </p>
                <Button
                  variant="outline"
                  disabled={busy || !data.settings.configured}
                  onClick={() => void perform("/api/admin/test", {})}
                >
                  {busy ? "處理中…" : "測試 Jev 連線"}
                </Button>
                <p className="muted text-sm">
                  連線測試使用固定測試文字，會依官方優先、OpenRouter
                  備援順序呼叫服務。
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Field className="mb-8">
                <FieldLabel htmlFor="actionReason">管理操作原因</FieldLabel>
                <Input
                  id="actionReason"
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="請先填寫隱藏、恢復或停用的原因"
                />
              </Field>
              <h2>待處理檢舉</h2>
              <div className="admin-list">
                {data.reports
                  .filter((r) => r.status !== "resolved")
                  .map((report) => (
                    <Card key={report.id}>
                      <CardHeader>
                        <CardTitle>紀錄 #{report.recordId}</CardTitle>
                        <CardDescription>{report.reason}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          disabled={busy || !reason.trim()}
                          onClick={() =>
                            void perform("/api/admin/actions", {
                              action: "resolve",
                              reportId: report.id,
                              reason,
                            })
                          }
                        >
                          標記已處理
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                {!data.reports.some((r) => r.status !== "resolved") && (
                  <p className="muted">目前沒有待處理的檢舉。</p>
                )}
              </div>
              <h2>所有紀錄</h2>
              <form
                className="my-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  setSearch(query.trim())
                }}
              >
                <Field>
                  <FieldLabel htmlFor="admin-search">依車號查找紀錄</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="admin-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="輸入完整車號"
                      inputMode="numeric"
                    />
                    <Button type="submit">查找</Button>
                  </div>
                </Field>
              </form>
              <div className="admin-list">
                {data.records.map((record) => (
                  <Card key={record.id}>
                    <CardHeader>
                      <CardTitle>
                        {numberLabel(record.id)} · {record.content.bikeNumber}
                      </CardTitle>
                      <CardDescription>
                        {record.content.shortComment} · {record.status} ·{" "}
                        {record.authorCode}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button asChild variant="outline">
                        <Link href={`/records/${record.id}`}>查看</Link>
                      </Button>
                      <Button
                        disabled={busy || !reason.trim()}
                        variant="outline"
                        onClick={() =>
                          void perform("/api/admin/actions", {
                            action:
                              record.status === "hidden" ? "restore" : "hide",
                            recordId: record.id,
                            reason,
                          })
                        }
                      >
                        {record.status === "hidden" ? "恢復公開" : "隱藏"}
                      </Button>
                      <Button
                        disabled={busy || !reason.trim()}
                        variant="destructive"
                        onClick={() =>
                          void perform("/api/admin/actions", {
                            action: "disable",
                            contributorId: record.authorId,
                            reason,
                          })
                        }
                      >
                        停用作者
                      </Button>
                      <Button
                        disabled={busy || !reason.trim()}
                        variant="outline"
                        onClick={() =>
                          void perform("/api/admin/actions", {
                            action: "enable",
                            contributorId: record.authorId,
                            reason,
                          })
                        }
                      >
                        恢復作者
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
