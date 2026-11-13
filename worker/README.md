# Worker

部署與金鑰申請請見 [DEPLOYMENT.md](../DEPLOYMENT.md)，完整變數見 [CONFIGURATION.md](../CONFIGURATION.md)。

`wrangler.toml` 是手動模板；自動部署會從根目錄 `.env` 產生被 Git 忽略的 `wrangler.generated.json`。KV binding 必須保持 `QUOTA`，ID 換成自己的。

本機：將測試用 secrets 放在被忽略的 `.dev.vars`，修改模板的公開測試設定，再執行 `npm run dev`。Cloudflare 官方測試 key 僅適用開發，不可正式部署。
