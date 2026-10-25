/** 功能：本機分頁映射、資料操作與 Drive 同步。入口：MV3 service worker；OAuth 由建置設定注入 manifest。 */
import { type Vault, type Entity, type Item, type Space, type Folder, type Asset, emptyVault, seed, edit, records, mergeOps, validateOps, validateGraph, validateEntity, verifyAssets, referencedAssets, navigable, safeSavedUrl, sharedOps, DEFAULT_THEME, DEFAULT_STYLE } from './model';
import { Drive } from './drive';
interface Binding { key: string; windowId: number }
interface Local { activeSpaces: Record<string, string>; bindings: Record<string, Binding>; searchWindow?: number; standalone?: Record<string, boolean> }
interface RestoreTab {url:string;title:string;space:string;folder?:string;order:number;pinnedKey?:string}
interface Database { schema: 1; device: string; active: string; accounts: Record<string, string>; vaults: Record<string, Vault>; suppressedUrls?: Record<string, string[]>; restoreTabs?: RestoreTab[] }
let db: Database;
let local: Local;
let queue: Promise<unknown> = Promise.resolve();
let syncing = false;
function serial<T>(fn: () => Promise<T>): Promise<T> { const result = queue.then(fn); queue = result.catch(() => undefined); return result; }
const ready = (async () => {
  const saved = await chrome.storage.local.get('database');
  db = saved.database || { schema: 1, device: crypto.randomUUID(), active: 'offline', accounts: {}, vaults: { offline: emptyVault() } };
  if (db.schema !== 1) throw new Error('本機資料版本不支援');
  seed(db.vaults[db.active], db.device);
  const session = await chrome.storage.session.get('local');
  local = session.local || { activeSpaces: {}, bindings: {} };
  const tabs = await chrome.tabs.query({});
  const ids = new Set(tabs.map(t => String(t.id)));
  for (const id of Object.keys(local.bindings)) if (!ids.has(id)) delete local.bindings[id];
  for (const id of new Set(tabs.filter(t => !t.incognito).map(t => t.windowId))) await reconcile(id);
  await persist();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.alarms.create('drive-sync', { periodInMinutes: 2 });
})();
function vault(): Vault { return db.vaults[db.active]; }
function value(key: string): Entity | null | undefined { return records(vault().ops).find(r => r.key === key)?.value; }
function active(windowId: number): string {
  const spaces = records(vault().ops).filter(r => r.value?.kind === 'space').sort((a, b) => (a.value as Space).order - (b.value as Space).order);
  if (!spaces.length) { const key = crypto.randomUUID(); edit(vault(), db.device, key, { kind: 'space', name: '日常', order: 0, theme: { ...DEFAULT_THEME } }); local.activeSpaces[windowId] = key; }
  if (!value(local.activeSpaces[windowId]) || value(local.activeSpaces[windowId])?.kind !== 'space') local.activeSpaces[windowId] = spaces[0]?.key || local.activeSpaces[windowId];
  return local.activeSpaces[windowId];
}
async function persist(): Promise<void> {
  await chrome.storage.local.set({ database: db });
  await chrome.storage.session.set({ local });
}
async function isolateAccountTabs(): Promise<void> {
  // Existing windows belong to the previous vault. Only explicitly opened or newly created tabs enter the new vault.
  const tabs = await chrome.tabs.query({});
  local = { activeSpaces: {}, bindings: {} };
  db.suppressedUrls ||= {};
  db.suppressedUrls[db.active] = [...new Set(tabs.map(t => t.pendingUrl || t.url || '').filter(safeSavedUrl))];
  for (const tab of tabs) if (tab.id) local.bindings[tab.id] = { key: 'suppressed', windowId: tab.windowId };
}
function notify(): void { void chrome.runtime.sendMessage({ event: 'changed' }).catch(() => undefined); }
function touch(key: string, entity: Entity | null, resolve = false): void {
  if (entity !== null && !validateEntity(entity)) throw new Error('欄位格式不正確');
  edit(vault(), db.device, key, entity, resolve);
}
async function reconcile(windowId: number, freshTabId?: number): Promise<void> {
  const win = await chrome.windows.get(windowId);
  if (win.type !== 'normal' || win.incognito) return;
  const tabs = await chrome.tabs.query({ windowId });
  const claimed = new Set(Object.values(local.bindings).filter(b => b.windowId === windowId).map(b => b.key));
  const items = records(vault().ops).filter(r => r.value?.kind === 'item');
  for (const tab of tabs) {
    if (!tab.id || local.bindings[tab.id]) continue;
    const url = tab.pendingUrl || tab.url || '';
    if (!safeSavedUrl(url)) continue;
    if (tab.id !== freshTabId && db.suppressedUrls?.[db.active]?.includes(url)) {
      local.bindings[tab.id] = { key: 'suppressed', windowId }; continue;
    }
    if (tab.id === freshTabId && db.suppressedUrls?.[db.active]) db.suppressedUrls[db.active] = db.suppressedUrls[db.active].filter(u => u !== url);
    // URL match only rebuilds a local association; it never opens remote items.
    const existing = tab.id === freshTabId ? undefined : items.find(r => (r.value as Item).url === url && !claimed.has(r.key));
    const key = existing?.key || crypto.randomUUID();
    if (!existing) touch(key, { kind: 'item', title: tab.title || url, pageTitle:tab.title||url, url, space: active(windowId), order: Date.now() + tab.index, pinned: false, archived: false, localOnly: true, favicon: tab.favIconUrl });
    local.bindings[tab.id] = { key, windowId }; claimed.add(key);
  }
}
async function snapshot(windowId: number) {
  await reconcile(windowId);
  const space = active(windowId); await persist();
  const tabs = await chrome.tabs.query({ windowId });
  const current = tabs.find(t => t.active);
  const v = vault();
  return { records: records(v.ops), assets: v.assets, activeSpace: space, bindings: local.bindings, windowId, activeTab: current ? { id: current.id, url: current.url, title: current.title } : null,
    account: db.active === 'offline' ? null : db.accounts[db.active], configured: !!chrome.runtime.getManifest().oauth2?.client_id,
    sync: { running: syncing, pending: sharedOps(v.ops).filter(o => !v.uploaded.includes(o.id)).length, lastSync: v.lastSync, error: v.error, folderId: v.folderId },
    searchRequested: local.searchWindow === windowId, device: db.device, standalone: !!local.standalone?.[windowId], windowState: (await chrome.windows.get(windowId)).state };
}
async function token(interactive: boolean): Promise<string> {
  if (!chrome.runtime.getManifest().oauth2?.client_id) throw new Error('尚未設定 Google OAuth Client ID，請依 README 設定後重新建置');
  const result = await chrome.identity.getAuthToken({ interactive });
  if (!result.token) throw new Error('尚未授權 Google Drive');
  return result.token;
}
async function syncNow(): Promise<void> {
  await ready;
  if (syncing || db.active === 'offline') return;
  syncing = true; notify();
  const accountId = db.active;
  let access: string | undefined;
  try {
    access = await token(false);
    const drive = new Drive(access);
    const account = await drive.account();
    if (account.id !== accountId) throw new Error('Google 帳號已變更，請重新連線；未上傳原帳號資料');
    const copy = await serial(async () => structuredClone(db.vaults[accountId]));
    const remote = await drive.sync(copy);
    await serial(async () => {
      const current = db.vaults[accountId];
      current.ops = mergeOps(current.ops, remote.ops);
      current.assets = { ...remote.assets, ...current.assets };
      current.uploaded = remote.uploaded; current.assetFiles = remote.assetFiles; current.folderId = remote.folderId; current.lastSync = remote.lastSync; delete current.error;
      await persist();
    });
  } catch (error) {
    if (access && error instanceof Error && error.message.includes('授權已失效')) await chrome.identity.removeCachedAuthToken({ token: access });
    await serial(async () => { db.vaults[accountId].error = error instanceof Error ? error.message : String(error); await persist(); });
  } finally { syncing = false; notify(); }
}
async function bindOpen(key: string, windowId: number): Promise<void> {
  const item = value(key);
  if (item?.kind !== 'item') throw new Error('找不到分頁');
  if (db.suppressedUrls?.[db.active]) db.suppressedUrls[db.active] = db.suppressedUrls[db.active].filter(u => u !== item.url);
  const bound = Object.entries(local.bindings).find(([, b]) => b.key === key && b.windowId === windowId);
  if (bound) {
    try { await chrome.tabs.update(Number(bound[0]), { active: true }); local.activeSpaces[windowId] = item.space; return; }
    catch { delete local.bindings[bound[0]]; }
  }
  if (!safeSavedUrl(item.url)) throw new Error('不支援此網址');
  const tab = await chrome.tabs.create({ windowId, url: item.url, active: true });
  if (tab.id) local.bindings[tab.id] = { key, windowId };
  local.activeSpaces[windowId] = item.space;
}
async function closeLocal(key: string, windowId: number): Promise<void> {
  const tabs = Object.entries(local.bindings).filter(([, b]) => b.key === key && b.windowId === windowId);
  if (!tabs.length) { const item=value(key); if(item?.kind==='item'&&!item.pinned)touch(key,null); }
  for (const [id] of tabs) {
    try { await chrome.tabs.remove(Number(id)); }
    catch (error) { if ((await chrome.tabs.query({ windowId })).some(t => t.id === Number(id))) throw error; }
  }
}
async function dispatch(m: any) {
  const windowId = Number(m.windowId);
  if (!Number.isInteger(windowId) || windowId < 0) throw new Error('無效視窗');
  if (m.type === 'snapshot') return snapshot(windowId);
  if (m.type === 'search-seen') { delete local.searchWindow; return; }
  if (m.type === 'space') { if (value(m.key)?.kind !== 'space') throw new Error('Space 不存在'); local.activeSpaces[windowId] = m.key; }
  else if (m.type === 'create-space') { const key = crypto.randomUUID(); touch(key, { kind: 'space', name: String(m.name).trim().slice(0, 200) || '新 Space', order: Date.now(), theme: { ...DEFAULT_THEME } }); local.activeSpaces[windowId] = key; }
  else if (m.type === 'create-folder') {const key=crypto.randomUUID();touch(key, { kind: 'folder', name: String(m.name).trim().slice(0, 200) || '資料夾', space: active(windowId), order: Date.now(),parent:typeof m.parent==='string'?m.parent:undefined });for(const itemKey of Array.isArray(m.items)?m.items:[]){const item=value(itemKey);if(item?.kind==='item'&&item.space===active(windowId))touch(itemKey,{...item,folder:key});}}
  else if (m.type === 'update') {
    if (!value(m.key)) throw new Error('項目不存在');
    const heads = records(vault().ops).find(r => r.key === m.key)!.heads.map(o => o.id).sort();
    if (m.baseHeads && JSON.stringify([...m.baseHeads].sort()) !== JSON.stringify(heads)) throw new Error('此項目已在其他地方更新，請重新開啟編輯後再儲存');
    touch(m.key, m.value);
  }
  else if (m.type === 'resolve') {
    const record = records(vault().ops).find(r => r.key === m.key);
    const chosen = record?.heads.find(o => o.id === m.head);
    if (!chosen) throw new Error('衝突版本不存在'); touch(m.key, chosen.value, true);
  }
  else if (m.type === 'move') {
    const current = value(m.key);
    if (!current || current.kind === 'settings') throw new Error('無法移動此項目');
    const next = { ...current, order: Number(m.order) };
    if (next.kind !== 'space') { if (value(m.space)?.kind !== 'space') throw new Error('目標 Space 不存在'); next.space = m.space; }
    if (next.kind === 'item') {
      const folder = m.folder ? value(m.folder) : null;
      if (m.folder && (folder?.kind !== 'folder' || folder.space !== m.space)) throw new Error('目標資料夾不屬於此 Space');
      next.folder = m.folder || undefined;
    }
    if(next.kind==='folder'){
      const parent=m.folder?value(m.folder):null;if(m.folder&&(parent?.kind!=='folder'||parent.space!==m.space))throw new Error('目標資料夾不存在');
      let cursorKey=m.folder as string|undefined;while(cursorKey){if(cursorKey===m.key)throw new Error('資料夾不能移入自身或子資料夾');const cursor=value(cursorKey);cursorKey=cursor?.kind==='folder'?cursor.parent:undefined;}
      next.parent=m.folder||undefined;
    }
    const children:ReturnType<typeof records>=[];if(next.kind==='folder'){const queue=[m.key];while(queue.length){const parent=queue.shift()!;for(const r of records(vault().ops).filter(r=>(r.value?.kind==='item'&&r.value.folder===parent)||(r.value?.kind==='folder'&&r.value.parent===parent))){if(children.some(x=>x.key===r.key))continue;children.push(r);if(r.value?.kind==='folder')queue.push(r.key);}}}
    if ([records(vault().ops).find(r => r.key === m.key)!, ...children].some(r => r.heads.length > 1)) throw new Error('此項目或子項目有同步衝突，請先解決');
    touch(m.key, next);
    if (next.kind === 'folder') for (const r of children) touch(r.key, { ...(r.value as any), space: next.space });
  }
  else if (m.type === 'remove') {
    const current = value(m.key);
    if (!current || current.kind === 'settings') throw new Error('找不到可移除的項目');
    if (current.kind === 'space') {
      const spaces = records(vault().ops).filter(r => r.value?.kind === 'space');
      if (spaces.length < 2) throw new Error('至少保留一個 Space');
      if (records(vault().ops).some(r => r.value && 'space' in r.value && r.value.space === m.key)) throw new Error('請先移走此 Space 的資料夾與分頁');
    }
    const children = current.kind === 'folder' ? records(vault().ops).filter(r => (r.value?.kind === 'item' && r.value.folder === m.key)||(r.value?.kind==='folder'&&r.value.parent===m.key)) : [];
    if ([records(vault().ops).find(r => r.key === m.key)!, ...children].some(r => r.heads.length > 1)) throw new Error('此項目或子項目有同步衝突，請先解決');
    const parent=current.kind==='folder'?current.parent:undefined;for (const r of children) {if(r.value?.kind==='folder')touch(r.key,{...r.value,parent});else if(r.value?.kind==='item')touch(r.key,{...r.value,folder:parent});}
    touch(m.key, null);
    if (current.kind === 'item' && Object.values(local.bindings).some(b => b.key === m.key)) {
      db.suppressedUrls ||= {}; db.suppressedUrls[db.active] = [...new Set([...(db.suppressedUrls[db.active] || []), current.url])];
    }
    // Keep bindings as suppressed associations: open tabs must not be re-imported immediately.
  }
  else if (m.type === 'delete-space') {
    const current = value(m.key);
    if (current?.kind !== 'space') throw new Error('Space 不存在');
    if (!['move', 'remove'].includes(m.strategy)) throw new Error('刪除方式不支援');
    const related = records(vault().ops).filter(r => r.value && 'space' in r.value && r.value.space === m.key);
    const folders = related.filter(r => r.value?.kind === 'folder');
    const items = related.filter(r => r.value?.kind === 'item');
    const sourceRecord = records(vault().ops).find(r => r.key === m.key)!;
    if ([sourceRecord, ...related].some(r => r.heads.length > 1)) throw new Error('此 Space 或其項目有同步衝突，請先解決');
    let destination = '';
    if (m.strategy === 'move') {
      if (m.target === m.key || value(m.target)?.kind !== 'space') throw new Error('目標 Space 不存在');
      destination = m.target;
      for (const r of folders) touch(r.key, { ...(r.value as Folder), space: destination });
      for (const r of items) touch(r.key, { ...(r.value as Item), space: destination });
    } else {
      for (const r of items) {
        const item = r.value as Item;
        touch(r.key, null);
        if (Object.values(local.bindings).some(b => b.key === r.key)) {
          db.suppressedUrls ||= {}; db.suppressedUrls[db.active] = [...new Set([...(db.suppressedUrls[db.active] || []), item.url])];
        }
      }
      for (const r of folders) touch(r.key, null);
    }
    touch(m.key, null);
    const remaining = records(vault().ops).filter(r => r.value?.kind === 'space' && r.key !== m.key);
    if (!remaining.length) {
      destination = crypto.randomUUID();
      touch(destination, { kind: 'space', name: '日常', order: Date.now(), theme: { ...DEFAULT_THEME } });
    } else if (!destination) destination = remaining.sort((a, b) => (a.value as Space).order - (b.value as Space).order)[0].key;
    for (const [id, key] of Object.entries(local.activeSpaces)) if (key === m.key) local.activeSpaces[Number(id)] = destination;
  }
  else if (m.type === 'open') await bindOpen(m.key, windowId);
  else if(m.type==='remove-many'){for(const key of Array.isArray(m.keys)?m.keys:[]){const current=value(key);if(!current||current.kind==='settings'||current.kind==='space')continue;if(current.kind==='item'){if(current.pinned)touch(key,null);else await closeLocal(key,windowId);continue;}for(const r of records(vault().ops).filter(r=>(r.value?.kind==='item'&&r.value.folder===key)||(r.value?.kind==='folder'&&r.value.parent===key))){if(r.value?.kind==='folder')touch(r.key,{...r.value,parent:current.parent});else if(r.value?.kind==='item')touch(r.key,{...r.value,folder:current.parent});}touch(key,null);}}
  else if (m.type === 'close') await closeLocal(m.key, windowId);
  else if(m.type==='renavigate'){const item=value(m.key);if(item?.kind!=='item')throw new Error('找不到分頁');const url=navigable(m.input);touch(m.key,{...item,url,title:item.manualTitle?item.title:url,pageTitle:url,favicon:undefined});const bound=Object.entries(local.bindings).find(([,b])=>b.key===m.key&&b.windowId===windowId);if(bound)await chrome.tabs.update(Number(bound[0]),{url,active:true});else await bindOpen(m.key,windowId);}
  else if (m.type === 'pin') {
    const item = value(m.key); if (item?.kind !== 'item') throw new Error('找不到分頁');
    if (!item.pinned) touch(m.key, { ...item, pinned: true, localOnly: false, archived: false, archivedAt: undefined });
    else {
      const replacement = crypto.randomUUID();
      touch(m.key, null);
      touch(replacement, { ...item, pinned: false, localOnly: true, archived: false, archivedAt: undefined });
      for (const binding of Object.values(local.bindings)) if (binding.key === m.key) binding.key = replacement;
    }
  }
  else if (m.type === 'save-window-session') {
    const tabs = await chrome.tabs.query({ windowId }); const saved:RestoreTab[]=[];
    for (const tab of tabs) {
      const binding = tab.id ? local.bindings[tab.id] : undefined; const item = binding ? value(binding.key) : undefined;
      const url = tab.pendingUrl || tab.url || item?.kind === 'item' && item.url || '';
      if (!safeSavedUrl(url)) continue;
      saved.push({url,title:tab.title || item?.kind === 'item' && item.title || url,space:item?.kind === 'item'?item.space:active(windowId),folder:item?.kind === 'item'?item.folder:undefined,order:tab.index,pinnedKey:item?.kind === 'item'&&item.pinned?binding?.key:undefined});
    }
    db.restoreTabs=saved;
  }
  else if (m.type === 'restore-window-session') {
    const saved=db.restoreTabs||[];db.restoreTabs=[];
    for (let index=0;index<saved.length;index++) {
      const entry=saved[index];if(!safeSavedUrl(entry.url)||value(entry.space)?.kind!=='space')continue;
      const tab=await chrome.tabs.create({windowId,url:entry.url,active:index===saved.length-1});
      if(!tab.id)continue;
      let key=entry.pinnedKey&&value(entry.pinnedKey)?.kind==='item'?entry.pinnedKey:crypto.randomUUID();
      if(!entry.pinnedKey)touch(key,{kind:'item',title:entry.title,url:entry.url,space:entry.space,folder:value(entry.folder||'')?.kind==='folder'?entry.folder:undefined,order:entry.order,pinned:false,archived:false,localOnly:true});
      local.bindings[tab.id]={key,windowId};local.activeSpaces[windowId]=entry.space;
    }
  }
  else if (m.type === 'navigate') {
    const url = navigable(m.input);
    const [tab] = await chrome.tabs.query({ windowId, active: true });
    if (m.newTab || !tab?.id) await chrome.tabs.create({ windowId, url });
    else await chrome.tabs.update(tab.id, { url });
  }
  else if (m.type === 'navigation') {
    const [tab] = await chrome.tabs.query({ windowId, active: true });
    if (tab?.id) {
      if (m.action === 'back') await chrome.tabs.goBack(tab.id);
      else if (m.action === 'forward') await chrome.tabs.goForward(tab.id);
      else if (m.action === 'reload') await chrome.tabs.reload(tab.id);
    }
  }
  else if (m.type === 'asset') {
    const asset = m.asset as Asset; await verifyAssets({ [asset.hash]: asset }); vault().assets[asset.hash] = asset;
  }
  else if (m.type === 'settings') {
    const current = value('settings');
    const next = { kind: 'settings', addressBar: current?.kind === 'settings' ? current.addressBar : true, ...(current?.kind === 'settings' && current.layout ? { layout: current.layout } : {}),...(current?.kind==='settings'&&current.style?{style:current.style}:{style:structuredClone(DEFAULT_STYLE)}) } as any;
    if (typeof m.addressBar === 'boolean') next.addressBar = m.addressBar;
    if (m.layout) {
      const candidate = { kind: 'settings', addressBar: next.addressBar, layout: m.layout };
      if (!validateEntity(candidate)) throw new Error('側邊欄佈局格式不支援');
      next.layout = candidate.layout;
    }
    if(m.style){const candidate={kind:'settings',addressBar:next.addressBar,layout:next.layout,style:m.style};if(!validateEntity(candidate))throw new Error('通用樣式格式不支援');next.style=m.style;}
    touch('settings', next);
  }
  else if (m.type === 'import-browser') {
    const source = m.profile;
    if (!source || !['Chrome', 'Arc'].includes(source.browser) || typeof source.profile !== 'string' || !Array.isArray(source.folders) || !Array.isArray(source.items)) throw new Error('瀏覽器匯入資料格式不支援');
    const all = [...source.items, ...source.folders.flatMap((f: any) => Array.isArray(f.items) ? f.items : [])];
    if (source.folders.length > 500 || all.length > 10000) throw new Error('匯入項目過多，請分批匯入');
    const space = crypto.randomUUID();
    const name = `${source.browser} · ${String(source.profile).slice(0, 80)}`;
    touch(space, { kind: 'space', name, order: Date.now(), theme: { ...DEFAULT_THEME } });
    let order = Date.now();
    const addItem = (raw: any, folder?: string) => {
      if (!raw || typeof raw.title !== 'string' || typeof raw.url !== 'string' || !safeSavedUrl(raw.url)) return;
      touch(crypto.randomUUID(), { kind: 'item', title: raw.title.slice(0, 500) || raw.url, url: raw.url, space, folder, order: order++, pinned: true, archived: false, localOnly: false });
    };
    for (const raw of source.items) addItem(raw);
    for (const raw of source.folders) {
      if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.items)) continue;
      const folder = crypto.randomUUID();
      touch(folder, { kind: 'folder', name: raw.name.slice(0, 200) || '匯入資料夾', space, order: order++ });
      for (const item of raw.items) addItem(item, folder);
    }
    local.activeSpaces[windowId] = space;
  }
  else if (m.type === 'disconnect') {
    db.active = 'offline'; seed(db.vaults.offline, db.device); await isolateAccountTabs();
    await chrome.identity.clearAllCachedAuthTokens();
  }
  else if (m.type === 'export') return { schema: 1, ops: vault().ops, assets: vault().assets };
  else if (m.type === 'import') {
    if (m.backup?.schema !== 1) throw new Error('備份版本不支援');
    validateGraph(m.backup.ops); await verifyAssets(m.backup.assets);
    const assets = { ...vault().assets, ...m.backup.assets };
    if (referencedAssets(m.backup.ops).some(hash => !assets[hash])) throw new Error('備份缺少圖片');
    vault().ops = mergeOps(vault().ops, m.backup.ops); vault().assets = assets;
  }
  else if (m.type === 'standalone-window') {
    const space = active(windowId);
    const win = await chrome.windows.create({ type: 'normal', url: chrome.runtime.getURL('launch.html'), width: 1200, height: 850 });
    if (win?.id === undefined) throw new Error('無法建立獨立視窗');
    local.activeSpaces[win.id] = space;
    (local.standalone ||= {})[win.id] = true;
  }
  else if (m.type === 'fullscreen-window') await chrome.windows.update(windowId, { state: 'fullscreen' });
  else if (m.type === 'normal-window') await chrome.windows.update(windowId, { state: 'normal' });
  else throw new Error('不支援的操作');
  await persist(); notify();
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  if (message.event) return;
  void (async () => {
    await ready;
    if (message.type === 'connect') {
      if (syncing) throw new Error('同步進行中，請稍後再切換帳號');
      const drive = new Drive(await token(true)); const account = await drive.account();
      await serial(async () => {
        // Do not silently copy offline or previous-account data to a new account.
        db.active = account.id; db.accounts[account.id] = account.name;
        db.vaults[account.id] ||= emptyVault(); await isolateAccountTabs(); await persist();
      });
      await syncNow();
      await serial(async () => { seed(vault(), db.device); await persist(); }); notify();
      return;
    }
    if (message.type === 'sync') { await syncNow(); return; }
    return serial(() => dispatch(message));
  })().then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
function event(fn: () => Promise<void>) { void ready.then(() => serial(async () => { await fn(); await persist(); notify(); })).catch(e => console.warn('Arc Spaces event:', e.message)); }
chrome.tabs.onCreated.addListener(tab => event(async () => { if (!tab.incognito) await reconcile(tab.windowId, tab.id); }));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => event(async () => {
  if (tab.incognito || (!change.url && !change.title && !(change as any).favIconUrl)) return;
  const bound = local.bindings[tabId];
  if (!bound) { await reconcile(tab.windowId); return; }
  const record = records(vault().ops).find(r => r.key === bound.key);
  const item = record?.value;
  if (item?.kind !== 'item' || record!.heads.length > 1) return;
  const url = change.url || item.url;
  const favicon=(change as any).favIconUrl||item.favicon;const pageTitle=change.title||tab.title||item.pageTitle||item.title;const title=item.manualTitle?item.title:pageTitle;
  if (safeSavedUrl(url) && (url !== item.url || title!==item.title||pageTitle!==item.pageTitle||favicon!==item.favicon)) touch(bound.key, { ...item, url, title, pageTitle, favicon });
}));
chrome.tabs.onRemoved.addListener(id => event(async () => { const binding=local.bindings[id];if(binding){const item=value(binding.key);if(item?.kind==='item'&&!item.pinned)touch(binding.key,null);delete local.bindings[id];} }));
chrome.tabs.onAttached.addListener((id, info) => event(async () => { if (local.bindings[id]) local.bindings[id].windowId = info.newWindowId; else await reconcile(info.newWindowId); }));
chrome.tabs.onActivated.addListener(() => { notify(); });
chrome.windows.onRemoved.addListener(id => event(async () => { delete local.activeSpaces[id]; for (const [tab, b] of Object.entries(local.bindings)) if (b.windowId === id) delete local.bindings[tab]; }));
chrome.windows.onBoundsChanged.addListener(() => notify());
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'drive-sync') void syncNow(); });
chrome.commands.onCommand.addListener((command, tab) => {
  // open() must be invoked synchronously from the user gesture before awaits.
  if (command === 'search' && tab?.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
  event(async () => {
    const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused()).id!;
    if (command === 'search') local.searchWindow = windowId;
    if (command === 'next-space') {
      const spaces = records(vault().ops).filter(r => r.value?.kind === 'space').sort((a, b) => (a.value as Space).order - (b.value as Space).order);
      const index = spaces.findIndex(r => r.key === active(windowId)); if (spaces.length) local.activeSpaces[windowId] = spaces[(index + 1) % spaces.length].key;
    }
  });
});
