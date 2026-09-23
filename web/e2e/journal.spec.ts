import { test, expect } from "@playwright/test"
import sharp from "sharp"
test("mobile publication, search, edit, recovery and administrator controls", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/records/new")
  const photo = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#b5c9ab" },
  })
    .jpeg()
    .toBuffer()
  await page
    .locator("#photo")
    .setInputFiles({ name: "bike.jpg", mimeType: "image/jpeg", buffer: photo })
  await page.locator("#bikeNumber").fill("0120297")
  await page.getByRole("combobox", { name: "騎乘縣市", exact: true }).click()
  await page.getByPlaceholder("搜尋縣市…").fill("臺北")
  await page.getByRole("option", { name: "台北市", exact: true }).click()
  await expect(page.locator("#shortComment")).toHaveAttribute("maxlength", "20")
  await expect(page.locator("#shortComment")).not.toHaveAttribute("required")
  await page.locator("#shortComment").fill("鏈條有聲音，但很好騎")
  const zoom = page.getByRole("slider", { name: /照片縮放/ })
  await zoom.focus()
  await zoom.press("Home")
  await expect(zoom).toHaveValue("0.25")
  await expect(page.getByText("照片縮放 · 25%")).toBeVisible()
  await page.getByRole("button", { name: "重設照片位置與縮放" }).click()
  await expect(zoom).toHaveValue("1")
  await zoom.focus()
  await zoom.press("Home")
  await page.locator("#impression").fill("踩踏順暢，煞車正常。")
  await page.getByRole("radio", { name: "推進 A", exact: true }).click()
  await page.getByRole("radio", { name: "總評 SSR", exact: true }).click()
  await page.getByRole("button", { name: "發布騎乘紀錄 ↗" }).click()
  await expect(page.getByText("請保存你的復原碼")).toBeVisible()
  const recovery = await page.locator(".recovery-panel code").innerText()
  await page.getByRole("button", { name: "發布騎乘紀錄 ↗" }).click()
  await expect(page).toHaveURL(/\/records\/\d+$/, { timeout: 45000 })
  const recordId = Number(page.url().split("/").pop())
  const persisted = await (
    await page.request.get(`/api/records/${recordId}`)
  ).json()
  expect(persisted.record.content.cropZoom).toBe(0.25)
  await expect(page.getByText("0120297").first()).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/mobile-record.png",
    fullPage: true,
  })
  const download = await request.get(`/api/records/${recordId}/download`)
  expect(download.status()).toBe(200)
  expect((await sharp(await download.body()).metadata()).width).toBe(1080)
  const search = await request.get("/api/records?q=0120297")
  expect((await search.json()).records.length).toBeGreaterThan(0)
  const other = await request.put(`/api/records/${recordId}`, {
    headers: { Origin: "http://127.0.0.1:3100" },
  })
  expect(other.status()).toBe(401)
  await page.goto(`/records/${recordId}/edit`)
  await page.locator("#shortComment").fill("更新後的短評")
  await page.getByRole("button", { name: "儲存並發布更新" }).click()
  await expect(page).toHaveURL(`/records/${recordId}`, { timeout: 45000 })
  // Recovery invalidates the original browser session.
  const recovered = await request.post("/api/identity/recover", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { code: recovery },
  })
  expect(recovered.status()).toBe(200)
  expect(
    (await (await page.request.get("/api/me")).json()).contributor
  ).toBeNull()
  await page.goto("/admin")
  await page.locator("#password").fill("test-admin-password")
  await page.getByRole("button", { name: "登入", exact: true }).click()
  await page.goto("/admin/settings")
  await expect(page.getByRole("switch")).toBeDisabled()
  const denied = await request.patch("/api/admin/settings", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { enabled: true },
  })
  expect(denied.status()).toBe(401)

  const origin = { Origin: "http://127.0.0.1:3100" }
  const missingKey = await page.request.patch("/api/admin/settings", {
    headers: origin,
    data: { enabled: true },
  })
  expect(missingKey.status()).toBe(400)
  const off = await page.request.patch("/api/admin/settings", {
    headers: origin,
    data: { enabled: false },
  })
  expect(off.status()).toBe(200)
  const report = await request.post("/api/reports", {
    headers: origin,
    data: { recordId, reason: "測試檢舉", details: "隔離資料" },
  })
  expect(report.status()).toBe(200)
  const before = await (await request.get(`/api/records/${recordId}`)).json()
  const hide = await page.request.post("/api/admin/actions", {
    headers: origin,
    data: { action: "hide", recordId, reason: "test" },
  })
  expect(hide.status()).toBe(200)
  // Public HTTP context has no rider cookie.
  const outsider = await page.context().browser()!.newContext()
  expect(
    (
      await outsider.request.get(
        `http://127.0.0.1:3100/api/records/${recordId}`
      )
    ).status()
  ).toBe(404)
  expect((await request.get(before.record.shareUrl)).status()).toBe(404)
  expect(
    (
      await page.request.post("/api/admin/actions", {
        headers: origin,
        data: { action: "restore", recordId, reason: "test" },
      })
    ).status()
  ).toBe(200)
  expect(
    (
      await outsider.request.get(
        `http://127.0.0.1:3100/api/records/${recordId}`
      )
    ).status()
  ).toBe(200)
  await outsider.close()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto("/")
  await page.screenshot({
    path: "test-results/desktop-home.png",
    fullPage: true,
  })
})

test("footer feedback preserves recipient and hides admin navigation", async ({
  page,
}) => {
  await page.goto("/")
  const footer = page.locator("footer")
  const href = await footer
    .getByRole("link", { name: "問題與回饋" })
    .getAttribute("href")
  expect(new URL(href!).searchParams.get("to")).toBe(
    "ycl1006.project@gmail.com"
  )
  await expect(
    footer.getByRole("link", { name: "管理", exact: true })
  ).toHaveCount(0)
})
