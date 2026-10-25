/** 功能：僅提供可信任介面使用的有限 IPC 橋接。入口：BrowserWindow preload；網頁 WebContentsView 沒有 preload。 */
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('browserBridge', {
  runtime: {
    sendMessage: (message: unknown) => ipcRenderer.invoke('browser:rpc', message),
    onMessage: { addListener: (fn: (data: unknown) => void) => ipcRenderer.on('browser:changed', (_event, data) => fn(data)) }
  },
  windows: { getCurrent: () => ipcRenderer.invoke('browser:window') }
});
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  control: (action: string) => ipcRenderer.invoke('browser:control', action),
  controlsMenu: (side: 'left'|'right', x: number, y: number) => ipcRenderer.invoke('browser:controls-menu', {side,x,y}),
  cursorPosition: () => ipcRenderer.invoke('browser:cursor-position'),
  copyText: (value: string) => ipcRenderer.invoke('browser:clipboard-write', value),
  layout: (options: unknown) => ipcRenderer.invoke('browser:layout', options),
  syncLayout: (layout: unknown) => ipcRenderer.invoke('browser:layout-sync', layout),
  importProfile: (browser: 'Chrome'|'Arc') => ipcRenderer.invoke('browser:profile-import', browser),
  configureOAuth: () => ipcRenderer.invoke('browser:oauth-config'),
  debug: (action: string, value?: boolean) => ipcRenderer.invoke('browser:debug', {action,value}),
  backgroundValidation: (action: 'status'|'set'|'run', value?: boolean) => ipcRenderer.invoke('browser:background-validation', {action,value}),
  extensions: (action: 'list'|'install'|'toggle'|'remove'|'store'|'chrome-profiles'|'chrome-signin'|'chrome-import', options: Record<string,unknown> = {}) => ipcRenderer.invoke('browser:extensions', {action,...options}),
  onState: (fn: (state: unknown) => void) => ipcRenderer.on('browser:state', (_event, state) => fn(state)),
  onCommand: (fn: (command: string) => void) => ipcRenderer.on('browser:command', (_event, command) => fn(command))
});
