# Custom Browser

**Electron Desktop 0.13.0 已加入：** Windows／macOS 的 Arc 式自訂視窗、四向側欄、可視化插入排序、可重排介面區塊、真實多網頁複合分頁、緊湊自適應分頁列、Chrome 帳號 Profile 擴充匯入、Drive 同步、本機工作階段還原，以及不搶焦點的背景驗證模式，請見 [DESKTOP.md](DESKTOP.md)。以下保留原 Chrome 外掛的安裝與操作說明。

繁體中文 Chrome Manifest V3 側欄外掛。專案位於 `B:\AI\ArcSpaces`，提供 Spaces、置頂捷徑、資料夾、分頁清單、手動封存、搜尋／指令、自訂漸層與圖片，以及 Google Drive 同步。

## 建置及安裝

需要 Node.js 22+。在專案資料夾執行：

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run package
```

在 Chrome 開啟 `chrome://extensions`，開啟「開發人員模式」，選「載入未封裝項目」，指定 **`B:\AI\ArcSpaces\dist`**。安裝後可將 Custom Browser 釘選到工具列，再按圖示開啟側欄。更新程式後重新建置，並在擴充功能頁按「重新載入」。

可攜套件是 `artifacts\Custom-Browser-0.2.0.zip`；先解壓縮，再選取包含 `manifest.json` 的資料夾。不要將 ZIP 直接拖入網頁當作商店套件。

固定外掛 ID：`mjgfncjcdnbgddipkohfdbedkccpmclb`。`extension-key.json` 只含公開金鑰，用來維持此 ID，請勿重新產生。各電腦必須安裝同一份套件／公開金鑰。

## 操作

- 每個視窗各有目前 Space。切換 Space 只篩選側欄，不會關閉其他 Space 的網頁。
- 新開分頁加入目前 Space。關閉按鈕僅關閉目前視窗的對應分頁，清單與置頂捷徑仍保留。
- 「⋯」選單提供置頂、重新命名、移動、封存／還原、移出同步清單。封存先保存後關閉；還原只重開網址，不恢復表單、登入狀態或頁面 JavaScript。
- 拖曳分頁至資料夾、底部 Space，或「分頁」標題可移動；拖曳至同類項目前可排序。Space 按鈕也能拖曳排序。另提供移動對話框方便不用拖曳時操作。
- 置頂項目獨立顯示在上方，資料夾關聯仍保留，取消置頂後回到資料夾。
- 搜尋可查所有 Space 的分頁、置頂與封存項目。點封存搜尋結果只預覽，選「還原並開啟」才移回瀏覽清單。
- 預設快捷鍵：`Alt+Shift+A` 開啟側欄、`Alt+Shift+K` 搜尋、`Alt+Shift+S` 下一個 Space。側欄內也支援 `Ctrl+K`。若有衝突，請到 `chrome://extensions/shortcuts` 調整。
- 設定頁提供漸層即時預覽；按「儲存外觀」才保存。背景與圖示支援 PNG/JPEG/WebP，每張上限 5 MB。不要上傳需要執行的 SVG 或 HTML。
- Chrome 原生側欄位置由 Chrome 設定決定。原生網址列與視窗框架不能透過此外掛任意重繪；可以透過獨立視窗的全螢幕模式收起頂部列。

## 獨立視窗與 Zen 風格介面（0.2.0）

側欄頂部按「▣ 另開獨立視窗」，或到設定按同名按鈕。新視窗先顯示啟動頁，選擇是否進入全螢幕，再按「開始瀏覽」。這個點擊會開啟真正的 Chrome 原生側欄，不以 iframe 包裝網站。原視窗與分頁保持原狀，新視窗沿用目前 Space，清單中的網站點擊才載入。

全螢幕時側欄頂部會顯示「返回標準 Chrome 視窗」，按下後在同一視窗保留分頁及頁面狀態，還原標準 Chrome 頂部列。也可用 F11 退出，或用側欄頂部的全螢幕按鈕切換。全螢幕可能在游標移至頂緣時顯示 Chrome 控制列，這是 Chrome 的原生行為。

已在有畫面的隔離 Chrome for Testing 驗證全螢幕、原生側欄渲染／點擊、跨站、多分頁及還原。popup 精簡視窗新增分頁會跑到其他標準視窗，因此沒有提供 popup／無框應用程式模式。獨立視窗不是另一套瀏覽器，也不是安裝網站 PWA。

介面參考 [Zen Compact Mode](https://docs.zen-browser.app/user-manual/compact-mode) 的聚焦方向，縮小標題與工具列、減少卡片邊框、採用低對比垂直分頁與底部 Spaces。這是 Chrome 外掛的可行布局，並未複製 Zen 的原生視窗邊框或自動浮出側欄。

## Google Cloud / OAuth

已建立的 Cloud 專案：**Custom Browser**，ID `custom-browser-512610`。

Chrome Extension OAuth 用戶端：`653392143371-d6t82ooosp8b5mfelfo3ji9s8eh41qfk.apps.googleusercontent.com`，綁定上述外掛 ID。此用戶端 ID 是公開識別碼，外掛不需要 client secret。

`config.local.json` 由 `config.example.json` 複製後填入 `clientId`，建置程式會將它寫入 `dist/manifest.json`。未提供時仍可離線使用，Drive 連線按鈕會停用。`config.local.json` 不納入 Git。

Cloud 必要設定：

1. Google Cloud 專案啟用 **Google Drive API**。
2. Google Auth Platform 設定品牌；測試模式需將實際登入的 Google 帳號加入測試使用者。
3. 建立「Chrome 擴充功能」OAuth 用戶端，項目 ID 使用外掛的固定 ID。
4. 資料存取權僅使用 `https://www.googleapis.com/auth/drive.file`。
5. 在外掛設定按「連線 Google Drive」，由 Chrome 顯示授權流程。雲端設定可能需要時間生效。

實際 Cloud 設定與驗收結果請見 `VERIFICATION.md`，不要將「已有 Client ID」視為登入及跨裝置驗收通過。

## 同步與資料保護

- Drive 中可見的 **Custom Browser** 專用資料夾保存不可變的 `op-*.json` 操作記錄及以 SHA-256 命名的圖片。只存取此外掛建立或使用者授權的檔案。
- `chrome.storage.local` 保存各帳號獨立 Vault、離線變更及圖片；Chrome 分頁／視窗 ID 只放本機 session storage。OAuth token 由 Chrome Identity 快取，不寫入備份、日誌或 Drive。
- 每兩分鐘檢查同步，也可手動同步。沒有即時推播承諾。同步失敗時保留本機資料與待同步操作，顯示錯誤並於下一輪重試。
- 每項操作含獨立 ID、項目 ID、前版 ID、裝置 ID、資料與時間。不同項目的變更合併；同一項目同時修改／刪除則保留分支，顯示衝突供使用者選擇。
- 圖片先上傳成功後才發布引用它的操作；重複圖片以雜湊重用。下載及匯入時驗證格式與雜湊。
- 關閉本機分頁不修改同步資料；其他裝置同步、移除或封存清單項目不會強制關閉本機網頁。
- 連接新帳號不自動搬移其他帳號／離線 Vault，也不自動匯入切換帳號前已開啟的頁面。需要搬移時，明確匯出後匯入目標帳號。
- 初次離線使用會記錄一般視窗的現有分頁網址與標題；不處理無痕視窗、網頁內容、密碼或 Cookies。重啟後以可用網址重建本機對應，同網址重複分頁的對應順序可能不同。
- 匯出完整 JSON 含圖片，匯入上限 50 MB；以操作 ID 合併，不覆蓋整份資料。資料格式版本目前是 1，未知版本拒絕處理。
- 第一版保留歷史操作，不自動清理 Drive 檔案。長期大量使用會增加檔案數與初次同步時間；移出清單不代表抹除舊操作中的網址。請不要手動修改／刪除操作檔，需刪除雲端資料時可管理整個專用資料夾。

## 測試

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
npm.cmd run test:standalone
```

`tests/model.test.ts` 驗證資料衝突／刪除／匯入邊界；`tests/drive.test.ts` 使用兩個獨立 Vault 和記憶體 Drive 驗證同步器，不是真實 Google 帳號測試。`tests/browser.mjs` 使用獨立 Chrome for Testing 個人資料，不操作使用者現有 Chrome。可透過 `CHROMIUM_PATH` 指定測試瀏覽器。

驗證產物輸出到 `artifacts`。`test:standalone` 啟動有畫面的隔離測試 Chrome，使用原生側欄的實際渲染目標驗證；完成後關閉測試瀏覽器。真實 OAuth、第二台裝置及使用者目前 Chrome 的安裝驗收仍待完成。
