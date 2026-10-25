# Custom Browser Desktop 0.12.0

Windows／macOS 的 Electron 桌面版。保留 Chrome 外掛原始碼，桌面版以獨立沙箱網頁視圖提供瀏覽功能。Drive 只同步 Spaces、資料夾、外觀、圖片及釘選分頁；一般分頁與整個視窗的工作階段只留在本機。

0.12 版把擴充功能載入移出啟動關鍵路徑，目標在 3 秒內顯示可操作介面；背景更新不再清除正在輸入的新增或重新命名欄位。分頁文字可雙擊原位重新搜尋，F2 原位重新命名且只有 Enter 儲存，Hover 仍顯示網頁實際標題。網頁中鍵連結採背景分頁，分頁中鍵直接關閉；資料夾選單停留在側欄且不改變網頁內容。視窗控制位置選單改為原生置頂選單，四向停靠各自保存尺寸，吸附預覽使用目標方向的實際尺寸。側邊欄、外框間隙及視窗控制共用同一 Space 主題表面。

0.11 版新增行內建立／重新搜尋、Shift 複選、F2 重新命名、Delete 刪除、資料夾巢狀拖放、網站 favicon、可同步的介面區塊排序、全域與 Space 個別字型／圓角設定，以及解壓縮 Chrome 擴充功能管理。網址列點選後自動全選且只保留最右側複製按鈕。網站要求 HTML 全螢幕時直接進入無外框頁面，退出控制由網站本身顯示；相機、麥克風、定位等權限仍會詢問。視窗控制列直接嵌入 Space 主題外框，不使用獨立懸浮膠囊。

## 使用

0.10 版把整體側邊欄設定與各 Space 樣式分開；Space 右鍵可設定樣式、重新命名、刪除或調整順序。刪除 Space 時可選擇將內容搬到其他 Space 或全部移除。外觀即時預覽並持久套用於整個自繪外框；側邊欄拖曳時會暫時隱藏網頁層，使吸附預覽保持在最上方。

0.9 版重新配置上／下停靠的雙列介面，視窗控制、分頁列、網址列與 Space 工具都有獨立區域。設定新增上／右／下／左位置按鈕與大小滑桿；四向邊界保留可見調整線及空白拖曳區。頂端視窗拖曳區會避開視窗控制按鈕。

0.8 版讓網頁內容四角維持原生圓角裁切；側邊欄改用圖釘控制固定狀態，收合時仍可見。Hover 展開後須把游標移到接近畫面中央才會自動收回，並修正視窗控制按鈕與拖曳區域的點擊衝突。

0.7 版移除 Custom 品牌，上一頁／下一頁／重新整理移至頂端；上下停靠時會與較短的網址列排成同一行。網址列整合搜尋、分頁與 Space 建議。四向停靠均可拖曳邊界調整寬度或高度；視窗控制改為圓角矩形，右鍵可選靠左或靠右。設定外觀即時預覽，點擊外側時可選擇套用、不套用或取消。

0.6 版頂端固定顯示三個小圓點視窗按鈕，不顯示分頁名稱；網頁外圍深色框可拖曳整個視窗。側欄吸附時會沿目標邊緣顯示無文字的全長預覽，四向版面共用同一套無白邊、低對比控制樣式。

Windows 安裝包與 ZIP 輸出在 `release/`。ZIP 解壓後執行 `CustomBrowser.exe`；安裝包可選安裝位置。現階段尚未簽署。Mac 需在 macOS 建置 DMG／ZIP，並使用 Apple Developer 憑證簽署、公證後再正式分發；Windows 測試不能替代 Mac 驗收。

側欄可以停靠上、下、左、右；按住側欄內沒有項目或控制元件的任意空白背景，移動超過 8px 後會浮起半透明淺框並以 1:1 跟隨滑鼠。進入距視窗邊緣約 42px 的緩衝範圍並短暫停留後才顯示吸附預覽，放開後切換版面。拖曳期間不重排真實欄位，上／下切換也不會卡在遮罩。可收合，收合後滑到停靠邊緣會暫時展開。頂端平常不顯示或預留分頁名稱列，滑到頂緣才浮出名稱及視窗控制。拖曳側欄邊界可調整尺寸；F11 切換全螢幕。外框漸層及背景跟隨 Space。上／下停靠採 Chrome 類水平分頁：少量顯示圖示、標題與關閉，多量自動縮成 favicon 列。

快捷鍵：Ctrl（Mac 為 ⌘）+ K 搜尋、L 網址、T 開啟新增分頁輸入框、W 關閉目前分頁、N 新視窗、Tab 切換開啟分頁、Shift+S 下一個 Space。新增 Space、資料夾與分頁都只顯示單行輸入框，Enter 確認，Esc、右側 X 或點外側取消，沒有標題、儲存按鈕及說明文字。直接關閉一般分頁會移出本機清單；關閉整個視窗則保存本機工作階段，下次啟動還原。釘選捷徑關閉網頁後仍保留並可同步。

網址列右側「⧉」會複製目前分頁網址。頂部加號只新增資料夾、分頁區下方只新增分頁、底部加號只新增 Space。設定可匯入 Chrome Bookmarks／Preferences 與 Arc 可辨識的側邊欄網址；不匯入密碼、Cookie、登入狀態或擴充功能。

## 使用者可選的偵錯模式

設定 →「偵錯（僅本機）」→「啟用偵錯模式」，預設關閉。開啟後可選：

- 介面開發工具：檢查側欄、自繪框架及前端錯誤。
- 目前網頁開發工具：檢查正在瀏覽的網頁。
- 匯出診斷：JSON 只含版本、作業系統、視窗／分頁數量及最多 200 筆分類錯誤代碼，不含網址、帳號、頁面內容或 token。

設定保存在本機 `desktop-preferences.json`，不進入 Drive 或備份。關閉時關閉已開啟的開發工具並清空記憶體診斷事件。重啟保留使用者開關選擇，但不自動彈出開發工具。開發工具本身能讀取目前頁面的資料，請不要貼入不明程式碼。沒有開啟外部可連線的遠端偵錯連接埠。

開發者使用 `npm run debug:desktop`：自動使用獨立 `.desktop-profile-debug`，不共用正式帳號、網站 Cookies 或設定。自動測試使用各自新建的 `.desktop-profile-test-*` 並設定 `CUSTOM_BROWSER_TEST_HIDDEN=1`，以隱藏的真實 Electron 視窗執行，不搶占使用者畫面；測試透過 Playwright 的 Electron 偵錯通道，不控制使用者滑鼠鍵盤。正式啟動不設定此環境變數，視窗正常顯示。

## 背景驗證模式

設定 →「背景驗證（僅本機）」可選「每 5 分鐘在背景驗證」，也可按「立即驗證」。它檢查本機儲存可寫、視窗容器、介面程序、分頁容器及資料／同步程序，顯示最後驗證時間、未通過項目及外框／完整介面啟動耗時。驗證不開啟開發工具、不跳出或搶焦點，不保存網址、頁面內容、帳號或 token。開關與最後結果只存在本機 `desktop-preferences.json`，不進 Drive 或備份。

## Drive 登入與資料搬移

Google Cloud 專案沿用 `custom-browser-512610`，新增桌面 OAuth 用戶端 `Custom Browser Desktop`。範圍仍只有 `drive.file`。桌面版使用系統瀏覽器完成 PKCE＋127.0.0.1 回呼；token 由主程序用作業系統安全儲存加密，不能由遠端網頁或介面 IPC 讀取。

設定頁按「連線 Google Drive」進入實際授權。測試模式只允許 Cloud 目標對象列出的測試帳號。Cloud 憑證建立完成不代表實際登入或跨裝置同步驗收完成。

開發設定可將 `desktop.oauth.example.json` 複製成 `desktop.oauth.local.json` 填入 Google **桌面應用程式**用戶端資料後建置；或在設定按「匯入桌面 OAuth 設定」選取 Google 下載的 installed JSON。不能使用 Chrome 擴充功能或 Web OAuth 用戶端。原生應用程式的用戶端設定會隨程式分發，不能當作保密憑證；授權安全依賴 PKCE 及使用者同意。token 不隨程式分發。

從舊外掛搬移：在外掛設定匯出完整 JSON → 桌面版選擇目標帳號 → 匯入備份。另可由桌面設定選擇 Chrome／Arc 的特定 Profile 資料夾匯入書籤／可辨識網址。兩種方式都不搬移 Cookies、密碼或登入狀態。同一帳號與專案的 Drive 資料相容性仍需真實授權後驗收。

## 開發、測試與封裝

需要 Node.js 22.12+。

```powershell
npm ci
npm run build:desktop
npm run desktop
npm run debug:desktop
npm test
npm run test:desktop
npm run package:win
```

在 Mac 使用 `npm run package:mac`；設定包含 Apple Silicon arm64 及 Intel x64。GitHub Actions 手動建置流程位於 `.github/workflows/desktop-build.yml`，需先把程式放入自己的 repository 再執行。沒有自動上傳／發布本機程式。

桌面資料預設在 Electron 的 userData：Windows `%APPDATA%/Custom Browser`、Mac `~/Library/Application Support/Custom Browser`。可用 `CUSTOM_BROWSER_DATA` 環境變數指定獨立路徑；例如測試與 B 槽安裝。`storage.json` 是所有帳號分離的本機 Vault；完整備份請使用設定頁匯出。

更新 Chromium 需要升級 Electron、通過測試並重新發布桌面程式，並非跟隨已安裝的 Chrome 自動變更。本版尚未配置正式更新下載站與簽章，因此不宣稱已啟用自動更新。

## 本次驗證與限制

Windows 真實 Electron 自動測試結果在 `artifacts/desktop-test.json`，資料／同步器及安全邊界使用 `npm test`。同步器測試中的 Drive 是模擬傳輸，不是真實 Google 服務。

已驗證外框先顯示、UI、真實網頁視圖、跨來源多分頁、保持頁面輸入、空白區四向吸附／收合 Hover、上下分頁密度、單行新增、禁止外框反白、頂端 Hover、網址複製、置頂／一般分頁規則、漸層／圖片、Chrome／Arc 匯入、備份、本機工作階段還原、背景驗證及使用者偵錯選項。`desktop-browser.png`／`desktop-native-window.png` 是 Electron UI renderer 截圖，不包含獨立 WebContentsView 的完整合成結果，不能當作整個桌面畫面驗收。

待驗：Mac 實機、Apple 簽署／公證、真實 OAuth／Drive 雙裝置、受保護影音 DRM、特殊網站登入／付款彈窗。擴充管理器可匯入解壓縮的 Chrome 擴充功能並開啟 Chrome Web Store 瀏覽，但 Electron 不支援直接由商店一鍵安裝所有 CRX；Chrome 帳號同步未移植。網站只能使用隔離的 HTTP／HTTPS 分頁；檔案與程式執行協定被拒絕。這是首版桌面瀏覽器，不宣稱與 Chrome 所有網站能力完全一致。
