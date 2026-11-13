# LINE 貼圖工作室（自架版）

完整搬自 [yazelin/line-sticker-studio](https://github.com/yazelin/line-sticker-studio)，來源版本 `f8958fb9892872c2d8a541d323309debbe5d37f0`。保留原 MIT LICENSE、前端編輯器、字型、素材、測試與 Worker 功能。

請先閱讀 [從零部署清單](DEPLOYMENT.md) 與 [設定及網址盤點](CONFIGURATION.md)。原始使用說明保存在 [UPSTREAM-README.md](UPSTREAM-README.md)，其中的原作者服務與舊部署命令不適用於本站。

```bash
npm ci
npm ci --prefix worker
cp .env.example .env
# 填寫 .env
npm run deploy:check   # 檢查正式設定、打包前端與 Worker，不發布
npm run deploy        # 部署 Worker、上傳 secrets、驗證，再觸發 GitHub Pages workflow
```

僅在本機試用前端（BYOG 不需要金鑰）：`npm run serve`。開啟 http://localhost:8917 。`config.js` 預設不連任何真實 AI 服務。
