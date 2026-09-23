import { test, expect } from "@playwright/test"

for (const width of [390, 1280]) {
  test(`bike pagination and whole-card navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const record = {
      id: 13,
      bikeId: 88,
      authorCode: "RIDER123",
      status: "published",
      content: {
        bikeNumber: "0123456",
        riddenOn: "2026-09-23",
        city: "新竹市",
        location: "公園旁",
        scores: [5, 4, 3, null, 4, 5],
        overallGrade: "A+",
        shortComment: "沿著河堤，慢慢騎回家",
        impression:
          "踩踏順暢，午後的風很舒服。\n煞車反應靈敏，適合一段輕鬆的城市騎乘。",
      },
      imageUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#cad5b5"/><text x="80" y="310" font-size="50">YouBike 0123456</text></svg>')}`,
      shareUrl: "",
    }
    record.shareUrl = record.imageUrl
    await page.route("**/api/bikes/88?*", (route) => {
      const second =
        new URL(route.request().url()).searchParams.get("page") === "2"
      return route.fulfill({
        json: {
          bike: { id: 88, bikeNumber: "0123456" },
          records: second
            ? [{ ...record, id: 1 }]
            : Array.from({ length: 12 }, (_, i) => ({ ...record, id: 13 - i })),
          total: 13,
          page: second ? 2 : 1,
          pages: 2,
          latestRiddenOn: "2026-09-23",
        },
      })
    })
    await page.route("**/api/records/1", (route) =>
      route.fulfill({ json: { record: { ...record, id: 1 } } })
    )
    await page.goto("/bikes/88?page=1")
    await expect(page.locator(".record-card")).toHaveCount(12)
    await expect(
      page.getByRole("button", { name: "上一頁", exact: true })
    ).toBeDisabled()
    await page.getByRole("link", { name: "下一頁", exact: true }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.locator(".record-card")).toHaveCount(1)
    await expect(
      page.getByRole("button", { name: "下一頁", exact: true })
    ).toBeDisabled()
    await page.reload()
    await expect(page.locator(".record-card")).toHaveCount(1)
    await expect(page.getByText("共 13 筆 · 第 2 / 2 頁")).toBeVisible()
    await page.screenshot({
      path: `test-results/bike-${width}.png`,
      fullPage: true,
    })
    const card = page.locator(".record-card").first()
    const box = (await card.boundingBox())!
    // Click the footer whitespace, outside the title and photograph.
    await card.click({ position: { x: box.width - 12, y: box.height - 12 } })
    await expect(page).toHaveURL(/\/records\/1$/)
    const actions = page.getByLabel("紀錄操作")
    await expect(
      actions.getByRole("link", { name: "下載分享圖 ↓" })
    ).toBeVisible()
    await expect(
      actions.getByRole("button", { name: "複製連結" })
    ).toBeVisible()
    await actions.getByRole("button", { name: "回報這筆紀錄" }).click()
    await expect(page.getByLabel("檢舉原因")).toBeVisible()
    await actions.getByRole("button", { name: "回報這筆紀錄" }).click()
    await page.screenshot({
      path: `test-results/detail-${width}.png`,
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    await page.goBack()
    await expect(page).toHaveURL(/page=2/)
    await page.getByRole("link", { name: "上一頁", exact: true }).click()
    await expect(page.locator(".record-card")).toHaveCount(12)
    const link = page.locator(".record-card-link").last()
    await link.focus()
    await expect(link).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/records\/2$/)
  })
}
