"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  PageHeading,
  RecordList,
  RecordView,
  useResource,
  Notice,
  Loading,
  request,
} from "@/components/journal/client"
export default function Me() {
  const { data, error, reload } = useResource<{
    contributor: { publicCode: string } | null
    records: RecordView[]
  }>("/api/me")
  const [code, setCode] = useState("")
  const [recovery, setRecovery] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function action(path: string, body?: unknown) {
    setBusy(true)
    try {
      const result = await request<{ recoveryCode?: string }>(
        `/api/identity/${path}`,
        { method: "POST", body: JSON.stringify(body || {}) }
      )
      if (result.recoveryCode) setRecovery(result.recoveryCode)
      if (path === "logout") setRecovery("")
      setCode("")
      setMessage(path === "logout" ? "已登出此裝置。" : "身分設定已更新。")
      reload()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR OWN JOURNAL"
        title="我的騎乘筆記"
        description={
          data?.contributor
            ? `你好，${data.contributor.publicCode}。你的每一段路，都在這裡。`
            : "這個瀏覽器會記得你。換裝置時，可使用復原碼找回紀錄。"
        }
      />
      <Notice message={error || message} />
      {recovery && (
        <section className="recovery-panel">
          <h2>保存新的復原碼</h2>
          <p>舊復原碼已失效。請保存於安全位置，不要公開。</p>
          <code>{recovery}</code>
          <Button
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(recovery).then(
                () => setMessage("已複製。"),
                () => setMessage("請手動保存。")
              )
            }
          >
            複製復原碼
          </Button>
        </section>
      )}
      {data ? (
        <>
          {data.contributor && (
            <>
              <div className="mb-8 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void action("rotate")}
                >
                  換發復原碼
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void action("logout")}
                >
                  登出此裝置
                </Button>
              </div>
              <RecordList records={data.records} manage />
            </>
          )}
          <section className="recovery-form">
            <h2>用復原碼找回紀錄</h2>
            <p className="muted">
              復原後將撤銷舊裝置的登入狀態，並產生新的復原碼。
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void action("recover", { code })
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="recovery">私密復原碼</FieldLabel>
                  <Input
                    id="recovery"
                    type="password"
                    autoComplete="off"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                <Button disabled={busy}>取回我的紀錄</Button>
              </FieldGroup>
            </form>
            <p className="muted mt-4 text-sm">
              Cookie 和復原碼皆遺失時，無法自行取回管理權。
            </p>
          </section>
        </>
      ) : (
        !error && <Loading />
      )}
    </>
  )
}
