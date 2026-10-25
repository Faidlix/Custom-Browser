# Custom Browser 驗證紀錄

## Electron Desktop 0.12.0（2026-10-26）

- 擴充功能改為介面顯示後在背景載入；背景資料更新不會再中斷新增資料夾、Space、分頁或原位重新命名。
- 分頁雙擊可在原文字位置搜尋／導覽；F2 原位重新命名只在 Enter 儲存，失焦或 Esc 取消，Hover 顯示網頁實際標題。
- 網頁中鍵連結建立背景分頁、分頁中鍵關閉；資料夾選單限制於側欄附近且不隱藏、重載或重排網頁內容。
- 視窗控制左右選單改用原生置頂選單；四向尺寸分開保存，吸附預覽以目標方向實際尺寸繪製；外框、間隙、側邊欄與控制按鈕共用 Space 主題。
- TypeScript 檢查與 13 項核心測試通過。Windows 0.12.0 ZIP／NSIS 已完成並靜默安裝至 `B:\AI\CustomBrowser`；安裝版以隱藏真實 Electron 視窗通過 9 項原生檢查，包含 3 秒內介面啟動、WebContentsView、視窗控制、全螢幕、安全儲存與剪貼簿。封裝及安裝版 `app.asar` SHA256 均為 `7579E5F3A332A60ECC8939D5F7E7ABB9AF7F9DB9B977B5C004909DC418D7D77F`。完整人工視覺驗收仍須由可存取本機 Windows 的聊天執行；指定的 durable 聊天因綁定 Linux 無法存取 B 槽，未宣稱通過。

## Electron Desktop 0.11.0（2026-10-25）

- 新增行內新增／重新搜尋、Shift 複選、F2 重新命名、Delete 刪除、巢狀資料夾拖放、網頁 favicon 與 Space／資料夾鄰近右鍵選單；分頁不再顯示 `…`，Hover 以整列底線回饋。
- 新增全域及 Space 個別字型／圓角、介面區塊排序與可選 Drive 佈局同步；漸層會套用側欄、自繪外框及視窗控制列。
- 網址列聚焦自動全選，只保留最右側複製；網頁內容使用原生圓角裁切。網站 HTML 全螢幕自動允許並移除外框，其他敏感權限仍詢問。
- 視窗控制使用嵌入主題框的圓角矩形，不再有不同色的懸浮膠囊；三個圖示由 CSS 幾何繪製並置中。
- 13 項核心測試、36 項 Electron 端對端測試全數通過。Windows ZIP／NSIS 已完成；封裝與 `B:\AI\CustomBrowser` 正式安裝位置各通過 9 項原生檢查，兩處 `app.asar` SHA256 相同。

## Electron Desktop 0.10.0（2026-10-25）

- 收合後只保留無外框的面板圖示；游標進入深色邊緣即展開，超過側邊欄 1.5 倍距離才收合。
- 視窗控制固定靠左上／右上，上下停靠保留獨立網格；圓角矩形按鈕可實際最小化、最大化與關閉。
- Space 右鍵提供樣式、重新命名、刪除、移至最前／最後；刪除時可搬移內容或全部移除。Space 過多時可水平滾動，新增鍵固定。
- 整體設定與各 Space 外觀完全分離；顏色、方向、透明度及圖片即時預覽，儲存後可穩定持久套用於側邊欄與外框。
- 拖曳側邊欄時暫時隱藏 WebContentsView，使吸附預覽保持最上層；放開或取消後原網頁狀態恢復。
- 13 項核心測試、36 項 Electron 端對端測試全數通過。Windows ZIP／NSIS 已完成，封裝與安裝位置各通過 9 項原生檢查，安裝版讀回 0.10.0，兩處 `app.asar` SHA256 相同。

## Electron Desktop 0.9.0（2026-10-25）

- 上／下停靠改為保留 30px 視窗控制區的雙列網格；網址列、Space、工作區、設定、圖釘及新增分頁不再互相重疊。
- 頂端原生視窗拖曳區會依控制列靠左／靠右位置扣除 120px；端對端測試在上、下模式實際完成最大化及還原。
- 四向邊界顯示細調整線；拖曳仍能調整寬度／高度，設定內另提供四向位置按鈕及大小滑桿。
- 上方模式的實際像素截圖已檢查，網頁、分頁列、工具列與控制列彼此分離。
- 13 項核心測試與 35 項隔離 Electron 端對端測試通過。
- Windows 0.9.0 ZIP／NSIS 已完成；封裝及正式安裝位置各通過 9 項原生檢查，安裝版讀回 0.9.0，兩處 `app.asar` SHA256 相同。

## Electron Desktop 0.8.0（2026-10-25）

- 網頁 WebContentsView 使用 15px 原生圓角裁切，四個停靠方向均保留四角圓角。
- 側邊欄控制改為圖釘；收合時保留 34px 控制區，Hover 暫時展開後點圖釘可固定展開。
- 暫時展開的側邊欄只在游標越過視窗 42%／58% 中央門檻並停留 280ms 後收回。
- 視窗控制區與按鈕明確設為非拖曳點擊區，空白頂框仍由底層原生拖曳區移動視窗。
- 13 項核心測試與 34 項隔離 Electron 端對端測試通過；端對端測試實際操作最大化／還原並確認圖釘在收合邊緣可見。
- Windows 0.8.0 ZIP／NSIS 已完成；封裝及正式安裝位置各通過 9 項原生檢查，安裝版讀回 0.8.0，兩處 `app.asar` SHA256 相同。

## Electron Desktop 0.7.0（2026-10-24）

- 移除 Custom 品牌，導覽鍵依左右／上下停靠自動移到頂端或網址列同行；獨立搜尋按鈕已移除，網址列整合分頁、Space、搜尋及指令建議。
- 四個方向均實際驗證邊界寬度／高度調整；收合鍵依左、右、上、下位置排列。
- 視窗控制改為可點擊的圓角矩形，右鍵可切換整組靠左／靠右，本機保存偏好。
- 設定介面重新排版，顏色、漸層、透明度、圖片與名稱即時預覽；點外側、X 或 Esc 遇到未套用變更會提供套用、不套用、取消。
- 新增、搜尋、操作與移動對話框統一支援點擊外側取消；新增小窗限制為 440px 並固定 X 在輸入框右側。
- 13 項核心測試與 33 項隔離 Electron 端對端測試通過。
- Windows 0.7.0 ZIP／NSIS 已完成；`win-unpacked` 與安裝到 `B:\AI\CustomBrowser` 後的 EXE 均通過 9 項原生檢查，兩處 `app.asar` SHA256 相同。

## Electron Desktop 0.6.0（2026-10-24）

- 頂部固定為 30px 原生拖曳列，只顯示縮小、放大／還原、關閉三個 11px 圓點，不顯示分頁名稱。
- 網頁外圍四邊加入原生視窗拖曳區；內容框、側欄邊界與四向版面移除白邊、粗框、灰色方塊及分類／狀態說明文字。
- 側欄吸附預覽改為沿上、下、左、右頭尾拉滿的無文字色塊；保留 8px 起拖、1:1 跟隨、約 42px 緩衝與 140ms 延遲吸附。
- 13 項核心測試與 32 項隔離 Electron 端對端測試通過；四向切換不再對寬高套用動畫，切換後立即取得正確尺寸。
- Windows 0.6.0 ZIP／NSIS 已完成；`win-unpacked` 與安裝到 `B:\AI\CustomBrowser` 後的 EXE 均通過 9 項原生檢查。安裝後版本讀回 0.6.0，`app.asar` 與封裝產物 SHA256 相同。

## Electron Desktop 0.5.0（2026-10-24）

- 13 項資料／模擬 Drive／安全邊界測試與 32 項隔離 Electron 端對端測試通過。
- Electron 測試通道本次在 376 ms 取得已顯示的外框；應用程式內部計時確認外框先於完整介面完成，OAuth 與本機工作階段不再阻塞外框顯示。此數值只代表本機本次測試，不承諾所有裝置固定耗時。
- 新增 Space、資料夾與分頁改為單行輸入、Enter 確認、右側 X／Esc／點外側取消；新增介面沒有標題、儲存按鈕與說明文字。
- 頂端平常不顯示或預留分頁名稱，Hover 才顯示名稱及視窗控制；外框文字不可反白，網址與搜尋欄仍可選取。
- 移除頂部拖曳把手；側欄內沒有項目或控制元件的任意空白背景都可起拖。已驗證 8px 起拖門檻、浮框 1:1 跟隨游標、約 42px 邊緣緩衝、140ms 延遲吸附、四邊切換、放開清除遮罩，以及上／下與密集 favicon 分頁切換。
- Windows 0.5.0 ZIP／NSIS 已完成；`win-unpacked` 與安裝到 `B:\AI\CustomBrowser` 後的 EXE 均通過 9 項檢查。安裝程式回傳 0，安裝後 `app.asar` 與封裝產物 SHA256 相同，版本讀回 0.5.0。
- `release/SHA256.txt` 已加入 0.5.0 安裝包及 ZIP 雜湊。Mac 實機與真實 Drive 雙裝置仍待驗證。

## Electron Desktop 0.4.0（2026-10-24）

- 13 項 TypeScript 資料／模擬 Drive／安全邊界測試通過；已確認一般分頁不進 Drive，只有釘選項目同步。
- 32 項隔離 Electron 端對端測試通過：重複啟動喚回、確認後才新增分頁、跨網站多分頁、直接關閉與整窗還原、四向停靠、收合 Hover、上下少量／大量分頁、網址複製、Chrome／Arc 匯入、佈局同步選項、漸層／圖片、視窗控制、偵錯與損壞儲存復原。
- 背景驗證預設關閉；啟用後每 5 分鐘驗證本機儲存、視窗、介面、分頁與資料／同步程序。端對端測試確認最小化時立即驗證後視窗仍保持最小化，結果不含網址，設定不進同步備份，重啟保留且可關閉。
- 網址列右側複製按鈕已用 Electron 系統剪貼簿讀回相同目前網址，不只驗證按鈕提示。
- Windows 0.4.0 ZIP／NSIS 已完成；封裝前 `win-unpacked` 與安裝至 `B:\AI\CustomBrowser` 後的 EXE 均通過 8 項檢查：啟動、偵錯預設、剪貼簿、背景驗證、WebContentsView 邊界、最小化還原、Hover 控制列退出全螢幕、Windows 安全儲存。安裝程式回傳 0。
- `release/SHA256.txt` 已加入 0.4.0 安裝包及 ZIP 雜湊。Mac、Apple 簽署／公證與真實 Google Drive 雙裝置仍是待驗項目。

## Electron Desktop 0.3.0（2026-10-24）

已新增 Arc 參考的自訂視窗、真正的沙箱 WebContentsView 分頁與本機可選偵錯模式。Chrome 外掛仍保留；桌面操作詳見 `DESKTOP.md`。

- TypeScript 桌面建置通過；20 項真實 Electron 端對端測試通過，含偵錯預設關閉、UI／網頁開發工具、關閉清理、診斷匯出、重啟保存與不進入同步備份。
- 12 項資料／模擬 Drive／安全邊界測試通過。
- 實際封裝 Windows EXE 的 6 項測試通過：啟動、偵錯預設、內容視圖可見與尺寸、最小化還原、自訂控制列退出全螢幕、作業系統安全儲存加解密。
- 最終 NSIS 安裝至 `B:\AI\CustomBrowser`，安裝程式回傳 0；對安裝後 `CustomBrowser.exe` 再執行上述 6 項檢查全部通過。安裝包與 ZIP 的 SHA256 記錄在 `release/SHA256.txt`。
- 桌面 OAuth 用戶端已建立並讀回：`653392143371-5dqf415f25cn8apjd80vv52brdm1q76m.apps.googleusercontent.com`；仍只有 `drive.file`。用戶端設定隨桌面套件提供；使用者 token 未建立／未分發。
- `artifacts/desktop-test.json`、`desktop-package-test.json`、`desktop-diagnostics-test.json` 為本次證據。桌面截圖 `desktop-browser.png` 與 `desktop-native-window.png` 僅包含 UI renderer，網頁 renderer 另存 `desktop-webpage-renderer.png`；未把兩張拼成假冒的完整桌面截圖。
- 本次使用專用 Electron 設定檔及程式偵錯通道；沒有再操作使用者滑鼠鍵盤。
- Mac 交叉封裝實際遭 electron-builder 拒絕：`Build for macOS is supported only on macOS`。已提供雙架構設定與手動 CI，但未產生 Mac 安裝包、未簽署／公證、未執行 Mac 實機驗證。
- 真實 Google OAuth 首次同意與 Drive 雙裝置同步尚待使用者登入後驗收；模擬同步測試不替代真實雲端驗證。

以下保留舊版 Chrome 外掛的驗證歷史。

日期：2026-10-24。此交付為可載入的 0.2.0 測試版，尚未完成使用者目前 Chrome 的安裝及真實跨裝置驗收。

## 0.2.0 獨立視窗與介面驗證

- `tests/window-probe.mjs` 實測 popup 新分頁沒有留在原 popup，而是進入其他 normal 視窗，所以不開放 popup 模式。詳見 `artifacts/window-probe.json`。
- `npm.cmd run test:standalone` 在有畫面的 Chrome for Testing 使用真實尺寸（無 viewport 模擬）。8 項通過：啟動全螢幕、建立 SIDE_PANEL、原生側欄載入並綁定正確視窗、跨網站導覽、多分頁留在同窗、原生側欄點擊切換、點返回按鈕保留分頁 ID／網址、原視窗不受影響。
- 原生側欄不在 Playwright 的一般分頁列表，因此測試只對自行啟動的隔離 Chrome 附加側欄渲染目標，執行 DOM 點擊並截圖。未連接或繞過使用者 Chrome 擴充功能管理頁的限制。
- 證據：`artifacts/standalone-test.json`、`artifacts/standalone-launch.png`、`artifacts/standalone-native-sidebar.png`。已檢視原生側欄截圖；回歸的 19 項瀏覽器測試與 10 項模型／同步器測試全部通過。
- 跨站補驗從原生側欄網址表單提交，並確認 example.com 與 example.org 的實際頁面文字載入。最初測試預期舊版「Example Domain」標題而失敗；讀回頁面確認網站文案已變更後，改用目前實際正文驗證，重新執行通過。
- 已開放獨立標準視窗＋可選全螢幕；不是無框 popup 或 PWA。Zen 參考範圍為緊湊標題、低對比分頁、垂直排列與底部 Spaces，不包含原生框架及浮出側欄。

## 已通過

- TypeScript 靜態檢查。
- 10 項模型與同步器測試：衝突、刪除、操作合併、備份邊界，以及兩個 Vault 的離線／同時修改、圖片與失敗處理。Drive 傳輸使用記憶體模擬，不能視為真實 Google 同步成功。
- Chrome for Testing 156.0.8078.4 共 19 項實際擴充功能測試，完整結果在 `artifacts/browser-test.json`。包含新增 Space、新分頁歸屬、資料夾、置頂、關閉與重開、封存還原、切換不開關網頁、匯入不自動開啟、拖曳、備份冪等、漸層、圖片、搜尋、衝突選擇、280px 佈局、移出清單、無 JavaScript 例外及重啟保留資料。
- 已檢視 `artifacts/sidebar-280.png`；側欄內容在窄寬度沒有水平溢位。自動測試將側欄 HTML 開在擴充功能分頁中，未替代原生 Side Panel 的實際點擊驗收。

## Google Cloud 已設定並讀回確認

- 專案：Custom Browser（`custom-browser-512610`）。
- 已取得使用者對 Google API 使用者資料政策及建立 OAuth 用戶端的明確同意。
- Chrome 擴充功能 OAuth 綁定 ID：`mjgfncjcdnbgddipkohfdbedkccpmclb`。
- OAuth Client ID：`653392143371-d6t82ooosp8b5mfelfo3ji9s8eh41qfk.apps.googleusercontent.com`。
- 外部測試模式，已加入本次帳號為測試使用者。
- Google Drive API 顯示「已啟用」。
- 資料存取權只列 `https://www.googleapis.com/auth/drive.file`，已看到「已儲存資料存取權變更」通知。
- 證據：`artifacts/google-oauth-created.png`、`artifacts/google-drive-enabled.png`、`artifacts/google-scopes-saved.png`。

## 尚待驗收

1. 在使用者目前 Chrome 手動載入 `B:\AI\ArcSpaces\dist`，確認固定 ID 與原生側欄能開啟。瀏覽器連接器的安全政策拒絕開啟 `chrome://extensions/`，因此未自動安裝，也未繞過限制。
2. 在外掛連線 Google Drive，實際完成 OAuth 同意並確認專用資料夾、操作檔與圖片建立成功。
3. 第二個真實 Chrome 環境／裝置：圖片下載、離線修改、同時修改、刪除衝突、登入失效、帳號隔離，以及同步不強制開關其他裝置分頁。
4. 原生側欄中的快捷鍵、背景可讀性、網址導覽與不同視窗的操作。
5. 使用者目前 Chrome 的版本／顯示器設定驗收。隔離測試已通過全螢幕＋原生側欄；popup 因多分頁限制不開放。實體 F11 按鍵未自動驗證，返回按鈕已驗證。

## 重現

依 README 執行 `npm.cmd test`、`npm.cmd run check` 及 `npm.cmd run test:browser`。瀏覽器測試使用獨立個人資料，結果不代表目前使用者 Chrome 已安裝。套件以 `npm.cmd run package` 建置，雜湊另存 `artifacts/SHA256.txt`。
