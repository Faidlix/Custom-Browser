/** 功能：桌面瀏覽協定與 IPC 白名單。用法：主程序及測試匯入；遠端網頁永遠不能存取桌面橋接。 */
export function browsingURL(input: string): string {
  if (input === 'about:blank' || input === 'chrome://newtab/' || input === 'chrome://newtab') return 'about:blank';
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('桌面版僅開啟 HTTP／HTTPS 網址；不支援 Chrome 內部頁面或本機檔案');
  return url.href;
}
export const UI_URL = 'custom-browser://ui/index.html';
export const RPC_TYPES = new Set(['snapshot','search-seen','space','create-space','create-folder','update','resolve','move','remove','delete-space','open','close','pin','navigate','navigation','asset','settings','import-browser','save-window-session','restore-window-session','disconnect','export','import','normal-window','standalone-window','fullscreen-window','connect','sync']);
export function validateMessage(message: unknown): asserts message is {type:string;[key:string]:unknown} {
  if (!message || typeof message !== 'object' || !RPC_TYPES.has((message as any).type)) throw new Error('不支援的桌面操作');
  if (JSON.stringify(message).length > 75 * 1024 * 1024) throw new Error('資料超過匯入上限');
}
