/** 功能：獨立視窗的使用者手勢入口；用法：由側欄「獨立視窗」開啟，按開始以開啟原生側欄並選擇全螢幕。 */
export {};
const start = document.getElementById('start') as HTMLButtonElement;
const status = document.getElementById('launch-status')!;
const win = await chrome.windows.getCurrent();
start.onclick = async () => {
  start.disabled = true;
  try {
    // Invoke directly in the click handler so Chrome retains the required user gesture.
    await chrome.sidePanel.open({ windowId: win.id! });
    if ((document.getElementById('focus-mode') as HTMLInputElement).checked) await chrome.windows.update(win.id!, { state: 'fullscreen' });
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) await chrome.tabs.update(tab.id, { url: 'chrome://newtab/' });
  } catch (error) {
    status.textContent = `無法啟動：${(error as Error).message}。可取消全螢幕後重試。`;
    await chrome.windows.update(win.id!, { state: 'normal' });
    start.disabled = false;
  }
};
