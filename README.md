# open-everyday-bike

免註冊的 YouBike 騎乘紀錄網站。用車號查詢歷次心得，留下自己的評分與照片，產生可以下載的分享圖。

## 適合誰

- 想查閱某台 YouBike 過往騎乘心得的使用者。
- 想記錄騎乘感受、整理照片並分享評價的騎士。
- 想參與開源單車紀錄工具的開發者與設計者。

## 功能

- **車號搜尋與歷史紀錄**：保留車號前導零，同一台車可有多筆心得。
- **匿名投稿與管理**：不需註冊，透過 Cookie 識別作者；提供復原碼、我的紀錄、編輯與刪除。
- **騎乘評分**：六項獨立評分與雷達圖，整體評等另行選擇，支援 A+、B+。
- **照片與分享圖**：支援 JPEG、PNG、WebP、單張 HEIC／HEIF，提供裁切預覽及 1080 × 1080 分享圖；移除照片 EXIF／GPS。
- **城市選擇**：可搜尋的縣市選單。
- **檢舉與後台**：檢舉、隱藏／恢復紀錄、停用作者與操作紀錄。
- **可選文字審核**：Jev 審核預設關閉，可在管理設定切換；優先使用 TypeSafe 官方服務，服務失敗時以 OpenRouter 備援。
- **基本防濫用**：限流、投稿額度、Turnstile 與寫入權限檢查。
- **手機與桌面介面**：響應式頁面與表單。

每筆紀錄限一張照片，大小上限 10 MB、解析度上限 25 MP。文字審核不驗證真實騎乘或照片內容；歷史心得不代表車輛目前位置或車況。本網站與 YouBike 官方無關。

## 技術

Next.js、React、TypeScript、Tailwind CSS、shadcn/ui、SQLite、Sharp 與 S3 相容圖片儲存。程式按身分、紀錄、圖片、審核等職責分模組，外部服務透過 adapter 串接。

## 開發入門

需要 Node.js 22；應用程式位於 `web/`。

```sh
cd web
npm ci
cp .env.example .env
npm run db:migrate
npm run dev
```

圖片投稿需要 S3 相容儲存設定。環境變數、模組與驗證指令請見 [開發文件](web/README.md)。不要提交 `.env`、密鑰或使用者資料。

## 參與貢獻

歡迎提交 bug、功能建議、文件改進及 Pull Request。開始前請閱讀 [貢獻指南](CONTRIBUTING.md)。

一般問題請使用 [GitHub Issues](https://github.com/Yung-Chih-Lo/open-everyday-bike/issues)。涉及安全漏洞或私人資料，請寄信至 [ycl1006.project@gmail.com](mailto:ycl1006.project@gmail.com)，不要公開憑證或使用者內容。

## 授權

本專案採用 [MIT License](LICENSE)。第三方套件、字型及附帶 skills 依各自的授權與聲明使用。
