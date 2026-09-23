# open-everyday-bike

免註冊的 YouBike 騎乘紀錄網站。Next.js + SQLite + S3 相容圖片儲存；Jev 審核可由管理設定切換，初始關閉。

## 本機啟動

使用 Node.js 22（原生 better-sqlite3 與執行環境必須一致）。

```sh
npm ci
cp .env.example .env
npm run db:migrate
npm run dev
```

在 `.env` 填入 MinIO endpoint、region、兩個 bucket、限定 bucket 權限的 access key / secret 與公開圖片 URL。沒有 S3 設定仍可開啟首頁，但無法完成投稿。MinIO 服務由部署者提供；程式在每個服務實例首次寫入圖片前檢查兩個 bucket，缺少時自動建立，不需要人工預建。初始化失敗會阻止上傳並回報錯誤，下次投稿會重試；403 或連線錯誤不會被當成 bucket 不存在。

- 私有 bucket：新建時預設禁止匿名存取，保存母圖與各版本私有備份；已有 bucket 的政策不會被修改。兩個 bucket 必須使用不同名稱。
- 應用程式憑證需具備這兩個 bucket 的檢查、建立及物件存取權限，以及公開 bucket 的讀取／更新政策權限。只授予物件上傳權限將無法完成初始化。
- 公開 bucket：程式自動加入 `UbikePublicRead` 政策，僅授予匿名 `s3:GetObject`，保留其他政策。請使用本專案專用 bucket，勿另行授予匿名寫入或列舉。
- `ASSET_PUBLIC_BASE_URL` 是公開 bucket 對外 URL，與 S3 API endpoint 分開。Zeabur 部署以服務環境變數為準，不讀開發機 `.env`；MinIO 通常設為 `https://<S3 公開網域>/<公開 bucket>`，不要使用 Console 網址或 localhost。
- 後端傳送圖片，不需要瀏覽器 S3 CORS 或暴露 access key。
- 建議公開媒體使用獨立網域。HTTP cache 最多 60 秒，避免下架後長期快取。
- Cloudflare 前方的媒體快取規則需尊重這個 TTL；本版不串接 Cloudflare purge API。

管理密碼使用 stdin 產生雜湊（避免密碼放入命令參數或 shell history）：

```sh
npm run admin:hash
```

輸入至少 12 字元後送出 EOF，將輸出的 `scrypt:...` 填入 `ADMIN_PASSWORD_HASH`。正式環境另填 `RATE_LIMIT_SECRET`、`APP_URL`、Turnstile site key / secret。沒有 Turnstile 的本機開發允許操作；production 缺少設定會拒絕投稿與檢舉。

## Jev

填入 `TYPESAFE_API_KEY` 或 `OPENROUTER_API_KEY` 後登入 `/admin/settings`。先按連線測試，再切換「啟用 Jev 投稿審核」。開關保存在 `site_settings`，不需要重新部署，也沒有環境變數覆蓋開關。連線測試使用固定虛構資料，會消耗 API 額度。

- 停用：零模型呼叫，記錄 skipped，正常發布。
- 啟用：正常通過；異常／低信心保留草稿，提供聯絡信箱。
- 逾時、缺少 key、錯誤、額度耗盡：保留草稿，可重試，不自動放行。
- 每次發布讀取一次設定快照，改開關不回溯已有內容。
- `MODERATION_DAILY_LIMIT` 預設每日 100 次，以 UTC 日期計；連線測試也算額度。
- `TYPESAFE_MODEL` 預設 `jev-latest`；結果保存實際模型與政策版本。
- 目前政策 `zh-TW-v1-provisional` 使用 0.8 信心門檻。這是保守初始值，尚未經真實繁體中文樣本校準；單元測試只驗證流程，不代表分類準確率。
- 只傳騎乘內容，不傳身分憑證、復原碼或 IP；不提供圖片內容審核。

## 模組邊界

`identity`、`bikes`、`records`、`media`、`storage`、`share-card`、`moderation`、`settings`、`abuse`、`administration` 分別擁有資料與職責；`publishing` 協調發布。跨模組走 `index.ts`，允許 browser-safe 的 `records/types` 與 `share-card/layout`。外部 SDK 限於 adapter。

資料庫使用 Drizzle 型別化車輛查詢，交易與其他模組使用 prepared SQL；單一版本化 SQL migration 由啟動及 `db:migrate` 共用，避免 ORM 與另一套 migration 自動改 schema。所有 DB 檔案只有伺服器模組存取。

紀錄使用全站 AUTOINCREMENT，`No.001` 是紀錄流水號，不是個人編號。車號是字串。六項未評為 null，總評獨立；同車可有多筆紀錄。編輯先建立新版本，成功後才替換公開版本。匿名作者 Cookie / 復原碼僅存雜湊，復原時撤銷舊裝置。

## API

- `GET /api/records?q=車號`、`GET /api/bikes/:id`、`GET /api/records/:id`。
- `POST /api/records`、`PUT /api/records/:id`：multipart `data`（RideInput JSON）、`photo`、`requestId`（UUID）、`turnstileToken`。編輯可不傳照片。
- `DELETE /api/records/:id`：僅本人。
- `GET /api/records/:id/download`：公開分享圖；`photo` 路徑僅本人或管理員可讀母圖。
- `GET /api/me`；`POST /api/identity`、`identity/recover`、`identity/rotate`、`identity/logout`。
- `POST /api/reports`：讀者檢舉，不自動下架。
- 管理：`admin/login`、`admin/logout`、`admin/actions`；`PATCH /api/admin/settings`、`POST /api/admin/test`。
- `GET /api/health`：SQLite 連線檢查，不洩漏設定。

寫入必須帶同源 Origin。車號歷史以 `?page=1` 分頁，每頁 12 筆，回傳總筆數與頁數；首頁與管理列表每次最多 100 筆。聯絡信箱為 ycl1006.project@gmail.com，請附紀錄編號。

## 備份與還原

```sh
npm run db:backup -- /path/to/new-backup.sqlite
DATABASE_PATH=/path/to/new-restored.sqlite npm run db:restore -- /path/to/new-backup.sqlite
```

備份使用 SQLite online backup，一致包含 WAL 中已提交資料。還原先停止應用，僅允許寫入不存在的新路徑並驗證 integrity_check，再切換 DATABASE_PATH 啟動。請將 SQLite 備份及公私 bucket 物件備份到異機位置；同主機 MinIO 不足以防範整台主機故障。Docker runtime 僅含 standalone app，CLI 備份可在含完整依賴的維護環境掛同一資料卷執行。

遷移 R2 時先複製物件並比對數量／內容，再設定 bucket 存取政策，最後切換 endpoint 與公開 base URL；不會自動搬檔。

## 圖片清理

`npm run media:cleanup` 會重試撤下隱藏圖片、刪除已刪紀錄的所有公私圖片，以及清理已替換的舊公開版本。失敗項目保留資料列並以非零狀態結束，可再次執行。請在停止應用寫入的維護時段執行，避免與管理恢復操作競爭；母圖與失敗草稿在作者刪除前保留。

## 驗證

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E 使用獨立 SQLite 與記憶體 S3 協定替身，透過真實 AWS SDK 上傳下載、真實 Sharp 圖卡與瀏覽器操作。它不等同真實 MinIO、R2 或 Jev 驗證。正式啟用前需填好配置，再驗證實際圖片存取與 Jev 連線／繁體中文樣本。

## Jev 雙通道

- 官方 `@typesafe-ai/sdk` 優先，使用 `TYPESAFE_API_KEY` 與 `TYPESAFE_MODEL`（預設 `jev-latest`）。
- OpenRouter `@openrouter/sdk` 備援使用 `OPENROUTER_API_KEY`，模型固定 `~typesafe/jev-latest`。
- 官方未配置時直接使用 OpenRouter；官方逾時、服務錯誤或無效回應才切換。正常、異常與低信心結果均不重判。
- 每個 provider 最多呼叫一次，逾時各 10 秒，不使用 SDK 自動重試。每日額度按實際呼叫預留，fallback 也消耗一次；額度不足不繞過審核。
- 兩者共用相同 state、Choice 政策與回應驗證。缺少有效 confidence 視為無效回應，不以選項機率冒充 confidence。
- `/admin/settings` 顯示兩個 provider 是否配置，不回傳金鑰。開關仍初始關閉；連線測試走相同優先與備援流程。

## iPhone 照片

支援單張 HEIC／HEIF，維持 10 MB／25 MP 上限。選取後由伺服器在獨立 worker 轉換 JPEG 預覽；不會把預覽存入 S3。發布時同樣轉成無 EXIF／GPS 的 JPEG，再產生縮圖、展示圖與分享圖。轉檔限時 20 秒，每個服務實例同時處理一張，忙碌或超出限制時顯示重試提示。48 MP 原圖需先縮小；不支援 HEIF 連拍序列。
