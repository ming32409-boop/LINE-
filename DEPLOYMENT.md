# 從零開始部署清單

目前狀態：程式碼已搬入此儲存庫，尚未連接你的 Cloudflare 或發布到 GitHub Pages。來源與 MIT 授權見 README、LICENSE。以下在自己的電腦或可安全輸入金鑰的環境操作；不要把金鑰貼進對話或 GitHub Issue。

## 1. 準備工具與儲存庫

- 安裝 Node.js 22 以上、Git、[GitHub CLI](https://cli.github.com/)。Wrangler 使用 worker/package-lock.json 鎖定版本。
- 將此專案提交並推送至 `ming32409-boop/LINE-` 的 `main`，包含 `.github/workflows/pages.yml`。空儲存庫必須先有第一次提交，才可 dispatch workflow。請先檢查 `git status`，勿提交 `.env`。
- GitHub 儲存庫 → Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。需要可使用 Pages 的儲存庫方案，以及 Actions 的執行權限。
- 執行 `gh auth login`，使用可管理此儲存庫 Actions、Repository variables 的帳號。`gh auth status` 檢查登入狀態；不要為了設定另外公開 token。

```bash
npm ci
npm ci --prefix worker
cp .env.example .env
```

首次提交到既有空白儲存庫可使用（先確認 origin 指向你的儲存庫）：

```bash
git status --short
git add .
git commit -m "Import sticker studio with configurable deployment"
git branch -M main
git push -u origin main
```

後續每次改程式也要先推送 `main`，再執行部署，避免本機 Worker 與 Pages 的程式版本不同。

## 2. Cloudflare 帳戶與 KV

1. 在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 建立帳戶，進 Workers & Pages，啟用自己的 `workers.dev` 子網域。
2. 帳戶首頁／Workers & Pages overview 複製 **Account ID** → `.env` 的 `CLOUDFLARE_ACCOUNT_ID`。
3. 選一個自己的 Worker 名稱 → `WORKER_NAME`；將預期完整網址填入 `API_URL`，例如 `https://my-sticker.my-subdomain.workers.dev`。`API_URL` 只填 origin，不能含路徑。
4. 執行 `cd worker && npx wrangler login`，然後 `npx wrangler kv namespace create QUOTA`。複製回傳的 namespace **id**（不是名稱）→ 根目錄 `.env` 的 `KV_NAMESPACE_ID`。也可 Dashboard → Storage & databases → KV → Create namespace。
5. binding 一律叫 `QUOTA`，因為配額、鎖、點數與兌換碼程式碼使用 `env.QUOTA`；只有 ID 屬於你的帳戶。
6. 自動化／無瀏覽器環境可改在 `.env` 設 `CLOUDFLARE_API_TOKEN`。於 My Profile → API Tokens 建立，限制到你的帳戶，允許 Workers Scripts Edit 與 Workers KV Storage Edit；讀取帳戶／使用者資訊的權限需足以供 Wrangler `whoami` 驗證。可先使用 Workers 編輯範本，再依 CLI 的具體缺少權限調整。

## 3. Vertex AI API Key（預設 AI 路線）

1. 前往 [Vertex AI Express Mode 文件](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview) 與 [Google Cloud Console](https://console.cloud.google.com/vertex-ai)，建立／選取自己的專案，依介面啟用 Express Mode、所需服務、帳單與 API key。
2. 將 **Vertex AI Express Mode API key** 填到 `.env` 的 `VERTEX_API_KEY`。此專案使用 `aiplatform.googleapis.com/v1/publishers/google/models/...:generateContent`；一般 Google AI Studio Gemini key 或服務帳戶 JSON 不等同這個認證方式。
3. 確認自己的專案可呼叫影像生成模型；預設 `gemini-3.1-flash-image-preview` 的可用性、費用與配額以 Google 當下文件為準。若不可用，於 `.env` 設 `DEFAULT_MODEL` 為你有權限且支援 image generation 的模型。
4. 設定預算通知與使用配額。部署健康檢查不會產生圖片；最後的真實產圖驗證會消耗 API 額度。

**可選替代方案**：若你已經有相容的自架 gemini-web 服務，設定 `GEMINI_WEB_BASE_URL` 與 `GEMINI_API_KEY`；此時不需要 `VERTEX_API_KEY`。此專案不會幫你架設該服務。預設不再連接原作者的自架服務。

## 4. Turnstile 的一對金鑰

1. [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) → Add widget，選 Managed。
2. Allowed hostnames 填 `ming32409-boop.github.io`，**不含** `https://`、`/LINE-/`。有自訂網域也要加該 hostname。
3. **Site key（公開）** → `.env` 的 `TURNSTILE_SITE_KEY`。部署腳本會寫入 Worker vars，前端透過 `GET /config` 取得。
4. **Secret key（保密）** → `.env` 的 `TURNSTILE_SECRET`，由腳本上傳 Worker secret。
5. 正式部署拒絕官方測試 key。開發測試可另用官方測試 pair 放在 `worker/.dev.vars`，不能拿來驗證正式防刷能力。

## 5. 管理金鑰與公開網址

- 使用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 產生自己的 `ADMIN_TOKEN`，填在 `.env`，不要提交。它可操作管理／點數／兌換碼端點，請保密。
- `GITHUB_REPOSITORY=ming32409-boop/LINE-`。
- `SITE_URL=https://ming32409-boop.github.io/LINE-/`，保留結尾 `/`。其他儲存庫／自訂網域請改成實際完整網址。
- 可選填商店、贊助、工具、回放、聯絡連結；留空即隱藏。
- `CREATOR_COPYRIGHT`、`CREATOR_ENGLISH`、`CREATOR_CHINESE` 可填自己的貼圖版權與創意人名稱；留空時匯出的上架說明會提示使用者自行填寫。

## 6. 一鍵檢查與發布

```bash
npm run deploy:check  # 必須先填完 .env；只打包與 Wrangler dry-run，不連線發布
npm run deploy       # 需要 GitHub CLI、Cloudflare 登入或 API token
```

`deploy` 依序驗證設定、產生 `dist/` 與 Worker 設定、確認 CLI 認證、發布 Worker、以 stdin 上傳 secrets、檢查 Worker health 與 `/config`、更新 GitHub 的公開 variables、dispatch `pages.yml`。不會自動提交或推送本機程式碼；**Pages 建置的是已推送的 main**，請確保與本機版本相同。部署非跨平台原子操作，若後段失敗，前段可能已完成；修正問題後可重跑，不會重建 KV 或清除既有資料。

第一次 Worker 發布到上傳 secrets 之間，AI 端點會暫時缺少認證；腳本只在 secrets 與健康檢查成功後觸發 Pages。若 secret 上傳失敗，會停止並顯示錯誤，不回顯 secret 或其 CLI 輸出。

到 GitHub → Actions → **Deploy GitHub Pages** 確認 build/deploy 成功；dispatch 成功只表示排程已送出，不代表網站已上線。尚未設定 API_URL/SITE_URL 時，push 觸發的 Pages 工作會略過。

## 7. 上線驗收

- 訪問自己的 Pages 網址，檢查瀏覽器 Network：API 指向自己的 Worker、沒有原作者統計／私有服務流量。
- `GET <API_URL>/` 回傳 `ok: true`；`GET <API_URL>/config` 回傳自己的 site key；`GET <API_URL>/quota` 有 `kvAvailable` 且不是 false。
- 先走 BYOG 匯入圖片、去背、匯出 ZIP；再通過 Turnstile 進行一次真實 AI 產圖，確認模型權限、帳單、配額與圖片下載。
- 確認隱私頁描述符合你實際部署的服務與資料保留政策。
- 若瀏覽器曾測試舊服務，執行 `localStorage.removeItem('line-sticker-api-url')` 後重載；該相容性 override 的優先權高於 config.js。

## 開發與測試

```bash
npm run test:unit
npm run test:deployment
npm run test:worker
npx playwright install chromium
npm test
```

前端開發：`npm run serve`，預設 `config.js` 使用無效的測試 origin，不會連原作者服務。要連本機 Worker，可用上述 localStorage override 指向 `http://127.0.0.1:8787`。Worker 的 `wrangler.toml` 是手動模板，請填公開設定與 KV ID，secrets 放 `.dev.vars`；`npm run dev --prefix worker` 啟動。正式部署請用根目錄一鍵腳本，無需修改模板。
