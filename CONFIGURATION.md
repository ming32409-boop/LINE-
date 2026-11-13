# 設定與硬編碼網址盤點

## 唯一輸入位置

以根目錄 `.env.example` 複製成 `.env`。Node 讀入 `.env`（已注入的同名 process environment 優先）。不會 shell source `.env`，避免命令替換。Git 忽略 `.env*`、`.dev.vars*`、產物及 Wrangler 狀態。

| 設定 | 寫入位置／用途 | 是否公開 |
|---|---|---|
| API_URL | dist/config.js → app.js 的 DEFAULT_API_URL | 是 |
| SITE_URL | HTML canonical、OG、Twitter image、robots、sitemap | 是 |
| GITHUB_REPOSITORY | 原始碼與 Issue 連結、gh 部署目標 | 是 |
| WORKER_NAME、CLOUDFLARE_ACCOUNT_ID | worker/wrangler.generated.json | 識別資訊 |
| KV_NAMESPACE_ID | generated config 的 QUOTA binding | 識別資訊 |
| TURNSTILE_SITE_KEY | Worker vars，透過 /config 回傳 | 是 |
| TURNSTILE_SECRET | Worker secret；僅經 stdin 上傳 | 否 |
| VERTEX_API_KEY | Worker secret，認證 Vertex AI Express Mode | 否 |
| ADMIN_TOKEN | Worker secret，保護管理端點 | 否 |
| CLOUDFLARE_API_TOKEN | Wrangler 的部署認證，不上傳至應用 | 否 |
| DEFAULT_MODEL | Worker vars，可選影像生成模型 | 是 |
| GEMINI_WEB_BASE_URL | Worker vars，可選自架 AI 服務 | 是 |
| GEMINI_API_KEY | 自架模式用的 Worker secret | 否 |
| STORE_URL、DONATION_URL、CHAT_MAKER_URL、REPLAY_URL、CONTACT_URL | dist/config.js 的 links；空白隱藏 | 是 |
| CREATOR_COPYRIGHT、CREATOR_ENGLISH、CREATOR_CHINESE | 匯出上架說明中的版權與創意人名稱；空白提示使用者自行填寫 | 是 |
| PAGES_REF | dispatch 的 Git branch，預設 main | 是 |

`config.js` 僅可放公開資料，不能放 API secret。建置採靜態檔案 allowlist，不會將 `.env`、Worker 原始碼或工具打包進 Pages。`wrangler.toml` 提供通用手動模板；自動部署使用 `wrangler.generated.json`，不覆寫模板。

## 來源盤點與處理

| 原位置／內容 | 本版處理 |
|---|---|
| app.js DEFAULT_API_URL：原作者 workers.dev | 改讀 window.APP_CONFIG.apiUrl；開發預設 api.example.invalid |
| worker/src/index.js：寫死 Turnstile site key | 移除常數，改 env.TURNSTILE_SITE_KEY |
| worker/wrangler.toml：Worker 名稱、KV ID | 通用模板＋.env 產生設定；binding QUOTA 保持程式契約 |
| wrangler.toml：ching-tech 自架服務 | 移除預設，Vertex 為預設；自架路線需明確設定 |
| index.html：SEO、社群圖片、canonical | 由 SITE_URL 建置；無 JS 搜尋引擎也能讀到正確值 |
| robots.txt、sitemap.xml | 由 SITE_URL 建置，支援 /LINE-/ 子路徑 |
| index.html：商店、咖啡、對話工具、課程回放 | 移除原預設，改成可選公開連結 |
| index.html：yz-promo-footer、sendBeacon hit endpoint、動態 blog/social 注入 | 整段移除，不複製原作者統計 |
| privacy.html：原作者 GitHub issues、Facebook | 改成部署儲存庫與可選 CONTACT_URL；資料流文字更新 |
| tests/helpers.js：原作者 Worker origin | 改測試專用的 api.example.invalid，沿用網路攔截；修正匯入未完成就切頁的測試時序，保留取消匯入驗證 |
| scripts/check-line-campaigns.mjs user-agent 的 repo URL | 改本站 repo；自動活動更新改為僅手動 workflow_dispatch |
| README、worker/README 的舊部署資訊 | 改以本站部署清單為準；歷史內容保留在 UPSTREAM-README.md，非執行設定 |
| app.js 匯出說明中的 yazelin／林亞澤姓名與版權 | 改用 CREATOR_* 設定，不再將生成的貼圖歸屬原作者 |
| LICENSE 與頁尾來源連結 | 保留 MIT 授權及原始專案歸屬，非服務依賴 |

## 保留的官方 Endpoint／第三方內容

這些是協定與功能所需，不屬於原作者帳戶設定：

- `aiplatform.googleapis.com/...:generateContent`：Worker 的 Vertex AI Express Mode；模型由 DEFAULT_MODEL 選擇。
- `challenges.cloudflare.com/turnstile/v0/api.js` 與 `/siteverify`：官方 Turnstile SDK 與驗證端點。
- `creator.line.me`、`creator-mag-tw.weblog.to`、campaigns.json 的文章網址：LINE 上架指南與活動資料，不換成自己的網域。
- Google／Cloudflare 隱私政策連結保留。
- sw.js 中 `workers.dev`、Google Fonts hostname 是快取路由判斷，不是作者服務；自訂 Worker 網域仍可正常請求，只不使用此額外的 API 離線快取。
- 測試中的 example.test、localhost、官方測試 key 及內嵌 SVG namespace 是測試或規格值，不應改成正式服務。

前端仍支援既有 `localStorage['line-sticker-api-url']` 覆寫，便於本機測試。部署更新後若仍連舊服務，清除此鍵。每日免費配額（1）、輸入大小限制、預設 prompt 與 LINE 活動資料是產品行為，本次未改。
