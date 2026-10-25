/** 功能：Custom Browser 側欄介面。入口：sidepanel.html；所有資料修改經 service worker，動態文字使用 textContent。 */
import { type Entity, type Item, type Space, type Folder, type Asset, type RecordView, type Theme, type VisualStyle, DEFAULT_STYLE } from './model';
const browserAPI: typeof chrome = (window as any).browserBridge || chrome;
interface Snapshot { records: RecordView[]; assets: Record<string, Asset>; activeSpace: string; bindings: Record<string, { key: string; windowId: number }>; windowId: number; activeTab: { id: number; url: string; title: string } | null; account: string | null; configured: boolean; sync: { running: boolean; pending: number; lastSync?: number; error?: string; folderId?: string }; searchRequested: boolean; standalone: boolean; windowState: string }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const dialog = (id: string) => $<HTMLDialogElement>(id);
let state: Snapshot;
let windowId: number;
let movingKey = '';
let editingTheme: Theme;
let appearanceKey = '';
let appearanceHeads: string[] = [];
let appearanceInitialTheme: Theme;
let appearanceInitialName = '';
let appearanceDirty = false;
let appearanceSavePromise: Promise<void> | undefined;
let appearanceFrame = 0;
let deletingSpaceKey = '';
let nameAction: (name: string) => Promise<void>;
let refreshTimer: ReturnType<typeof setTimeout>;
let toastTimer: ReturnType<typeof setTimeout>;
let requestIndex = 0;
let searchPurpose: 'command' | 'new-tab' = 'command';
const collapsed = new Set<string>();
const selected = new Set<string>();
let selectionAnchor = '';
let inlineEditor:HTMLElement|undefined;
const linkedRadius=(value:number)=>({linked:true,all:value,topLeft:value,topRight:value,bottomRight:value,bottomLeft:value});
async function rpc(type: string, args: Record<string, unknown> = {}): Promise<any> {
  const result = await browserAPI.runtime.sendMessage({ type, windowId, ...args });
  if (!result?.ok) throw new Error(result?.error || '背景程式未回應，請重新載入外掛');
  return result.data;
}
function toast(message: string) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6000); }
async function act(type: string, args: Record<string, unknown> = {}) { try { await rpc(type, args); await refresh(); } catch (e) { toast((e as Error).message); throw e; } }
function run(action: () => Promise<unknown>) { void action().catch(e => toast((e as Error).message)); }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = cls; node.textContent = text; return node; }
function button(text: string, title: string, action: () => void, cls = '') { const b = el('button', cls, text); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.onclick = action; return b; }
function entities(kind: Entity['kind']) { return state.records.filter(r => r.value?.kind === kind).sort((a, b) => ('order' in a.value! ? a.value.order : 0) - ('order' in b.value! ? b.value.order : 0)); }
function currentSpace(): Space { return state.records.find(r => r.key === state.activeSpace)!.value as Space; }
function record(key: string) { return state.records.find(r => r.key === key); }
function rgba(hex: string, opacity: number) { return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${opacity})`; }
function applyVisualStyle(style:VisualStyle){const radius=(value:any)=>`${value?.linked!==false?value?.all??0:value?.topLeft??0}px ${value?.linked!==false?value?.all??0:value?.topRight??0}px ${value?.linked!==false?value?.all??0:value?.bottomRight??0}px ${value?.linked!==false?value?.all??0:value?.bottomLeft??0}px`;const root=document.documentElement.style;root.setProperty('--ui-font',style.fontFamily);root.setProperty('--ui-weight',String(style.fontWeight));root.setProperty('--ui-size',`${style.fontSize}px`);root.setProperty('--ui-text',style.textColor);root.setProperty('--tab-radius',radius(style.tabRadius));root.setProperty('--favicon-radius',radius(style.faviconRadius));root.setProperty('--address-radius',radius(style.addressRadius));root.setProperty('--space-radius',radius(style.spaceRadius));}
function applyTheme(theme: Theme) {
  $('shell').style.setProperty('--space-gradient', `linear-gradient(${theme.angle}deg,${rgba(theme.start, theme.opacity)},${rgba(theme.end, theme.opacity)})`);
  const asset = theme.background && state.assets[theme.background];
  $('shell').style.setProperty('--space-image', asset ? `url("${asset.data}")` : 'none');
  if (document.body.classList.contains('desktop')) {
    document.body.style.setProperty('--space-gradient', $('shell').style.getPropertyValue('--space-gradient'));
    document.body.style.setProperty('--space-image', $('shell').style.getPropertyValue('--space-image'));
  }
  const settings=entities('settings')[0]?.value;const globalStyle=settings?.kind==='settings'&&settings.style?settings.style:DEFAULT_STYLE;const style={...globalStyle,...(theme.useCustomStyle?theme.style||{}:{})} as VisualStyle;
  applyVisualStyle(style);
}
async function refresh() {
  const request = ++requestIndex;
  const next = await rpc('snapshot') as Snapshot;
  if (request !== requestIndex) return;
  state = next; render();
  window.dispatchEvent(new CustomEvent('browser-snapshot', { detail: next }));
  $('window-return').hidden = state.windowState !== 'fullscreen';
  $('focus-toggle').title = state.windowState === 'fullscreen' ? '返回標準視窗' : '進入全螢幕';
  $('focus-toggle').setAttribute('aria-label', $('focus-toggle').title);
  if (state.searchRequested) { openSearch(); await rpc('search-seen'); }
}
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => run(refresh), 80); }
function isOpen(key: string) { return Object.entries(state.bindings).some(([, b]) => b.key === key && b.windowId === windowId); }
const pointerDropTargets = new WeakMap<HTMLElement, (key: string) => void>();
let pointerDrag: { key: string; x: number; y: number; started: boolean } | undefined;
let highlightedDrop: HTMLElement | undefined;
document.addEventListener('pointermove', e => {
  if (!pointerDrag) return;
  if (Math.hypot(e.clientX - pointerDrag.x, e.clientY - pointerDrag.y) > 6) pointerDrag.started = true;
  if (!pointerDrag.started) return;
  highlightedDrop?.classList.remove('drop-target'); highlightedDrop = undefined;
  let target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  while (target && !pointerDropTargets.has(target)) target = target.parentElement;
  if (target) { highlightedDrop = target; target.classList.add('drop-target'); }
});
document.addEventListener('pointerup', () => {
  const drag = pointerDrag; pointerDrag = undefined;
  if (drag?.started) {
    const cancelClick = (e: MouseEvent) => { e.preventDefault(); e.stopImmediatePropagation(); };
    document.addEventListener('click', cancelClick, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', cancelClick, true), 0);
    if (highlightedDrop) pointerDropTargets.get(highlightedDrop)?.(drag.key);
  }
  highlightedDrop?.classList.remove('drop-target'); highlightedDrop = undefined;
});
document.addEventListener('pointercancel', () => { pointerDrag = undefined; highlightedDrop?.classList.remove('drop-target'); });
function drag(node: HTMLElement, key: string) {
  node.draggable = true;
  node.classList.add('draggable');
  node.ondragstart = e => { document.body.classList.add('item-dragging');e.dataTransfer!.setData('text/custom-browser', key); e.dataTransfer!.effectAllowed = 'move'; };
  node.ondragend=()=>document.body.classList.remove('item-dragging');
  if (document.body.classList.contains('desktop')) {
    node.onpointerdown = e => { if (e.button === 0 && !(e.target as HTMLElement).closest('.more,.close-tab')) pointerDrag = { key, x: e.clientX, y: e.clientY, started: false }; };
  }
}
function drop(node: HTMLElement, handler: (key: string) => void) {
  pointerDropTargets.set(node, handler);
  node.ondragover = e => { if (e.dataTransfer?.types.includes('text/custom-browser')) { e.preventDefault(); e.stopPropagation(); node.classList.add('drop-target'); } };
  node.ondragleave = () => node.classList.remove('drop-target');
  node.ondrop = e => { e.preventDefault(); e.stopPropagation(); node.classList.remove('drop-target'); const key = e.dataTransfer?.getData('text/custom-browser'); if (key) handler(key); };
}
function move(key: string, space: string, folder?: string, order = Date.now()) { run(() => act('move', { key, space, folder, order })); }
function inlineInput(host:HTMLElement,placeholder:string,initial:string,commit:(value:string)=>void){
  inlineEditor?.remove();const editor=el('input','inline-editor') as HTMLInputElement;inlineEditor=editor;editor.placeholder=placeholder;editor.value=initial;host.append(editor);editor.focus();editor.select();let done=false;
  const finish=(save:boolean)=>{if(done)return;done=true;const value=editor.value.trim();editor.remove();if(inlineEditor===editor)inlineEditor=undefined;if(save&&value)commit(value);};
  editor.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}};editor.onblur=()=>finish(false);editor.onclick=e=>e.stopPropagation();return editor;
}
function inlineTextInput(label:HTMLElement,placeholder:string,initial:string,commit:(value:string)=>void){
  inlineEditor?.dispatchEvent(new FocusEvent('blur'));const editor=el('input','inline-editor inline-text-editor') as HTMLInputElement;inlineEditor=editor;editor.placeholder=placeholder;editor.value=initial;label.hidden=true;label.insertAdjacentElement('afterend',editor);editor.focus();editor.select();let done=false;
  const finish=(save:boolean)=>{if(done)return;done=true;const value=editor.value.trim();editor.remove();label.hidden=false;if(inlineEditor===editor)inlineEditor=undefined;if(save&&value)commit(value);};
  editor.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}};editor.onblur=()=>finish(false);editor.onclick=e=>e.stopPropagation();editor.onpointerdown=e=>e.stopPropagation();return editor;
}
function startNewFolder(){const host=$('items');const wrap=el('div','inline-create');host.prepend(wrap);inlineInput(wrap,'新增資料夾','',name=>run(async()=>{await act('create-folder',{name,items:[...selected]});selected.clear();}));}
function startNewTab(){const host=$('items');const wrap=el('div','inline-create new-tab-inline');host.append(wrap);inlineInput(wrap,'輸入網址或搜尋','',value=>run(()=>act('navigate',{input:value,newTab:true})));}
function startNewSpace(){const host=$('spaces');const wrap=el('div','inline-create inline-space');host.append(wrap);inlineInput(wrap,'新增 Space','',name=>run(()=>act('create-space',{name})));}
function renameRecord(r:RecordView){const value=r.value;if(!value||value.kind==='settings')return;const host=document.querySelector<HTMLElement>(`[data-key="${CSS.escape(r.key)}"]`);const label=host?.querySelector<HTMLElement>(value.kind==='item'?'.item-title':value.kind==='folder'?'.folder-name':'.space-name');if(!label)return;inlineTextInput(label,'重新命名','name'in value?value.name:value.title,name=>run(()=>act('update',{key:r.key,baseHeads:r.heads.map(h=>h.id),value:{...value,...('name'in value?{name}:{title:name,manualTitle:true})}})));}
function selectRecord(e:MouseEvent,key:string){
  const ordered=[...document.querySelectorAll<HTMLElement>('[data-key]')].map(n=>n.dataset.key!).filter(Boolean);
  if(e.shiftKey&&selectionAnchor){const a=ordered.indexOf(selectionAnchor),b=ordered.indexOf(key);if(a>=0&&b>=0)for(const k of ordered.slice(Math.min(a,b),Math.max(a,b)+1))selected.add(k);}else{selected.clear();selected.add(key);selectionAnchor=key;}
}
function paintSelection(){document.querySelectorAll<HTMLElement>('[data-key]').forEach(node=>node.classList.toggle('selected-item',selected.has(node.dataset.key||'')));}
function row(r: RecordView) {
  const item = r.value as Item;
  const open = isOpen(r.key);
  const node = el('div', 'item'); node.dataset.key = r.key;node.tabIndex=0;node.classList.toggle('selected-item',selected.has(r.key));
  node.classList.toggle('is-open', open);
  if (Object.entries(state.bindings).some(([id, b]) => b.key === r.key && Number(id) === state.activeTab?.id)) node.classList.add('active');
  const main = button('', item.pageTitle || item.title || item.url, () => undefined, 'open-item');let openTimer=0;
  main.onclick=e=>{selectRecord(e,r.key);paintSelection();if(e.shiftKey)return;clearTimeout(openTimer);openTimer=window.setTimeout(()=>run(()=>act('open',{key:r.key})),230);};
  let host = ''; try { host = new URL(item.url).hostname; } catch { host = ''; }
  const favicon=el('span','favicon');if(item.favicon){const img=el('img');img.src=item.favicon;img.alt='';img.onerror=()=>img.remove();favicon.append(img);}else favicon.textContent=(host.replace(/^www\./,'').match(/[a-z]/i)?.[0]||'↗').toUpperCase();main.append(favicon);
  const text = el('span', 'item-text');const title=el('span', 'item-title', item.title || host || item.url);text.append(title);main.ondblclick=e=>{e.preventDefault();e.stopPropagation();clearTimeout(openTimer);inlineTextInput(title,'輸入網址或搜尋',item.url,value=>run(()=>act('renavigate',{key:r.key,input:value})));};
  main.append(text); node.append(main);
  if (open) node.append(button('×', `關閉本機分頁：${item.title}`, () => run(() => act('close', { key: r.key })), 'close-tab'));
  node.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();itemMenu(r);};
  node.onauxclick=e=>{if(e.button===1){e.preventDefault();e.stopPropagation();run(()=>act('close',{key:r.key}));}};
  drag(node, r.key);
  drop(node, key => {
    const source = record(key)?.value;
    if (source?.kind !== 'item' || key === r.key) return;
    const peers = entities('item').filter(p => (p.value as Item).space === item.space && (p.value as Item).folder === item.folder && (p.value as Item).pinned === item.pinned);
    const at = peers.findIndex(p => p.key === r.key); const previous = at > 0 ? (peers[at - 1].value as Item).order : item.order - 2;
    move(key, item.space, item.folder, (previous + item.order) / 2);
  });
  return node;
}
function render() {
  // 背景工作完成時可能送出資料更新；行內輸入期間保留目前 DOM，直到 Enter、Esc 或失焦結束編輯。
  if(inlineEditor?.isConnected)return;
  const space = currentSpace(); if (!space) return;
  if (!dialog('space-settings-dialog')?.open || appearanceKey !== state.activeSpace) applyTheme(space.theme);
  $('space-title').textContent = space.name;
  $('space-settings').style.background = `linear-gradient(135deg,${space.theme.start},${space.theme.end})`;
  const settings = entities('settings')[0]?.value;
  $('address-section').hidden = settings?.kind === 'settings' && !settings.addressBar;
  if (document.activeElement !== input('address')) input('address').value = state.activeTab?.url || '';
  const allItems = entities('item').filter(r => (r.value as Item).space === state.activeSpace);
  const list = $('items'); list.replaceChildren();
  const visible = allItems;
  list.classList.remove('few-tabs','medium-tabs','many-tabs');
  list.classList.add(visible.length <= 8 ? 'few-tabs' : visible.length <= 16 ? 'medium-tabs' : 'many-tabs');
  {
    const pinned = visible.filter(r => (r.value as Item).pinned);
    const pinnedZone=el('section','pinned-zone');pinnedZone.dataset.layoutBlock='pinned';
    const grid = el('div', 'pinned-grid'); pinned.forEach(r => grid.append(row(r)));
    if(!pinned.length)grid.append(el('div','pinned-empty'));
    pinnedZone.append(grid);list.append(pinnedZone);
    const folders = entities('folder').filter(r => (r.value as Folder).space === state.activeSpace);const foldersZone=el('section','folders-zone');foldersZone.dataset.layoutBlock='folders';
    const renderFolder=(f:RecordView):HTMLElement=>{const folder=f.value as Folder;const details=el('details');details.dataset.key=f.key;details.open=!collapsed.has(f.key);details.classList.toggle('selected-item',selected.has(f.key));
      const summary=el('summary');const toggle=button(details.open?'▾':'▸',`${details.open?'收合':'展開'}資料夾`,()=>{details.open=!details.open;},'folder-toggle');
      const icon=el('span','folder-icon');if(folder.icon&&state.assets[folder.icon]){const img=el('img');img.src=state.assets[folder.icon].data;img.alt='';icon.append(img);}else icon.textContent='▱';
      const name=el('span','folder-name',folder.name);name.onclick=e=>e.stopPropagation();name.ondblclick=e=>{e.preventDefault();e.stopPropagation();renameRecord(f);};summary.append(toggle,icon,name,button('⋯',`資料夾操作：${folder.name}`,()=>folderMenu(f),'more'));
      summary.onclick=e=>{if((e.target as HTMLElement).closest('button'))return;selectRecord(e,f.key);render();};details.ontoggle=()=>{toggle.textContent=details.open?'▾':'▸';if(details.open)collapsed.delete(f.key);else collapsed.add(f.key);};
      const body=el('div','folder-content');for(const child of folders.filter(r=>(r.value as Folder).parent===f.key))body.append(renderFolder(child));visible.filter(r=>!(r.value as Item).pinned&&(r.value as Item).folder===f.key).forEach(r=>body.append(row(r)));details.append(summary,body);drag(summary,f.key);
      drop(details,key=>{const source=record(key)?.value;if(source?.kind==='item'||source?.kind==='folder')move(key,state.activeSpace,f.key);});return details;};
    for(const f of folders.filter(r=>!(r.value as Folder).parent||!folders.some(x=>x.key===(r.value as Folder).parent)))foldersZone.append(renderFolder(f));list.append(foldersZone);
    const loose = visible.filter(r => !(r.value as Item).pinned && (!(r.value as Item).folder || !folders.some(f => f.key === (r.value as Item).folder)));
    const tabsZone=el('section','tabs-zone');tabsZone.dataset.layoutBlock='tabs';const heading = el('div', 'section-title'); tabsZone.append(heading); drop(heading, key => { if (record(key)?.value?.kind === 'item') move(key, state.activeSpace); });
    loose.forEach(r => tabsZone.append(row(r)));list.append(tabsZone);
  }
  if (!visible.length && !entities('folder').some(r => (r.value as Folder).space === state.activeSpace)) list.append(el('div', 'empty'));
  const spaces = $('spaces'); spaces.replaceChildren();
  for (const r of entities('space')) {
    const s = r.value as Space; const b = button('', `切換 Space：${s.name}`, () => undefined, r.key === state.activeSpace ? 'selected' : '');b.onclick=e=>{selectRecord(e,r.key);run(()=>act('space',{key:r.key}));};
    if (s.theme.icon && state.assets[s.theme.icon]) { const img = el('img', 'space-icon'); img.src = state.assets[s.theme.icon].data; img.alt = ''; b.append(img); } else b.append(el('span', 'space-icon-fallback', '◒'));
    const spaceName=el('span','space-name',s.name);spaceName.onclick=e=>e.stopPropagation();spaceName.ondblclick=e=>{e.preventDefault();e.stopPropagation();renameRecord(r);};b.append(spaceName);b.dataset.key=r.key;drag(b, r.key);
    const icon=b.querySelector<HTMLElement>('.space-icon,.space-icon-fallback');if(icon){icon.onclick=e=>e.stopPropagation();icon.ondblclick=e=>{e.preventDefault();e.stopPropagation();openAppearance(r.key);setTimeout(()=>input('icon-file').click());};}
    b.oncontextmenu = e => { e.preventDefault(); spaceMenu(r,b); };
    drop(b, key => {
      if (key === r.key) return;
      if (record(key)?.value?.kind === 'space') {
        const arr = entities('space'); const at = arr.findIndex(x => x.key === r.key); const prev = at > 0 ? (arr[at - 1].value as Space).order : s.order - 2;
        move(key, r.key, undefined, (prev + s.order) / 2);
      } else move(key, r.key);
    }); spaces.append(b);
  }
  const conflicts = state.records.filter(r => r.heads.length > 1);
  $('conflict-banner').hidden = !conflicts.length; $('conflict-open').textContent = `⚠ ${conflicts.length} 個項目需要選擇同步版本`;
  const status = !state.account ? '● 本機模式' : state.sync.running ? '◌ 正在同步…' : state.sync.error ? '⚠ 同步失敗' : state.sync.pending ? `● ${state.sync.pending} 筆待同步` : '● 已同步至 Drive';
  $('sync-status').textContent = status; $('sync-status').title = state.sync.error || status;
  $<HTMLButtonElement>('sync-now').disabled = !state.account || state.sync.running;
  updateSync();
}
function showMenu(title: string, actions: Array<[string, () => void]>,anchor?:HTMLElement) {
  $('menu-title').textContent = title; $('menu-actions').replaceChildren();
  for (const [label, action] of actions) $('menu-actions').append(button(label, label, () => { dialog('menu-dialog').close(); action(); }));
  const menu=dialog('menu-dialog');if(menu.open)menu.close();menu.showModal();menu.onclick=e=>{if(e.target===menu)menu.close();};const rect=anchor?.getBoundingClientRect(),shellRect=$('shell').getBoundingClientRect();if(rect){menu.style.position='fixed';menu.style.margin='0';const width=Math.max(180,Math.min(260,shellRect.width-16));menu.style.width=`${width}px`;menu.style.maxHeight=`${Math.max(120,shellRect.height-16)}px`;menu.style.overflow='auto';menu.style.left=`${Math.max(shellRect.left+8,Math.min(rect.left,shellRect.right-width-8))}px`;const estimated=Math.min(actions.length*48+64,shellRect.height-16),below=rect.bottom+6;menu.style.top=`${Math.max(shellRect.top+8,Math.min(below,shellRect.bottom-estimated-8))}px`;}
}
function itemMenu(r: RecordView) {
  const item = r.value as Item;
  showMenu(item.title || '分頁', [
    [item.pinned ? '取消置頂' : '置頂網站', () => run(() => act('pin', { key: r.key }))],
    ['重新命名', () => renameRecord(r)],
    ['移至其他 Space／資料夾', () => openMove(r.key)],
    [item.pinned ? '取消同步並移出清單（保留已開啟網頁）' : '從本機清單移除（保留已開啟網頁）', () => { if (confirm(item.pinned ? '將此釘選項目移出所有裝置的同步清單？已開啟的網頁不會關閉。' : '將此分頁從本機清單移除？已開啟的網頁不會關閉。')) run(() => act('remove', { key: r.key })); }]
  ],document.querySelector(`[data-key="${CSS.escape(r.key)}"]`) as HTMLElement);
}
function changeFolderIcon(r:RecordView){const picker=el('input') as HTMLInputElement;picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.onchange=()=>run(async()=>{const file=picker.files?.[0];if(!file)return;const asset=await readImage(file);await rpc('asset',{asset});const folder=r.value as Folder;await act('update',{key:r.key,baseHeads:r.heads.map(h=>h.id),value:{...folder,icon:asset.hash}});});picker.click();}
function folderMenu(r: RecordView) { const f = r.value as Folder; showMenu(f.name, [
  ['更換圖示',()=>changeFolderIcon(r)],
  ['重新命名', () => renameRecord(r)],
  ['移至其他 Space', () => openMove(r.key)],
  ['刪除資料夾（分頁移回 Space）', () => { if (confirm('刪除資料夾？分頁會保留在原 Space。')) run(() => act('remove', { key: r.key })); }]
],document.querySelector(`[data-key="${CSS.escape(r.key)}"]`) as HTMLElement); }
function spaceMenu(r: RecordView,anchor?:HTMLElement) {
  const space = r.value as Space;
  const ordered = entities('space');
  showMenu(space.name, [
    ['樣式', () => openAppearance(r.key)],
    ['重新命名', () => renameRecord(r)],
    ['移至最前面', () => run(() => act('move', { key: r.key, order: Math.min(...ordered.map(x => (x.value as Space).order)) - 1 }))],
    ['移至最後面', () => run(() => act('move', { key: r.key, order: Math.max(...ordered.map(x => (x.value as Space).order)) + 1 }))],
    ['刪除', () => openDeleteSpace(r.key)]
  ],anchor);
}
function openDeleteSpace(key: string) {
  const current = record(key)?.value;
  if (current?.kind !== 'space') return;
  deletingSpaceKey = key;
  const select = $<HTMLSelectElement>('delete-space-target'); select.replaceChildren();
  for (const r of entities('space').filter(r => r.key !== key)) { const option = el('option', '', (r.value as Space).name); option.value = r.key; select.append(option); }
  $('delete-space-target-row').hidden = !select.options.length;
  $('delete-space-move').hidden = !select.options.length;
  dialog('delete-space-dialog').showModal();
}
function askName(title: string, name: string, action: (name: string) => Promise<void>) { nameAction = action; input('name-input').placeholder = title; input('name-input').ariaLabel = title; input('name-input').value = name; dialog('name-dialog').showModal(); input('name-input').focus(); input('name-input').select(); }
function openMove(key: string) { movingKey = key; const v = record(key)!.value!; const select = $<HTMLSelectElement>('move-space'); select.replaceChildren(); for (const s of entities('space')) { const option = el('option', '', (s.value as Space).name); option.value = s.key; select.append(option); } select.value = 'space' in v ? v.space : state.activeSpace; fillMoveFolders(); dialog('move-dialog').showModal(); }
function fillMoveFolders() { const select = $<HTMLSelectElement>('move-folder'); select.replaceChildren(); const root = el('option', '', 'Space 根目錄'); root.value = ''; select.append(root); for (const f of entities('folder').filter(r => (r.value as Folder).space === $<HTMLSelectElement>('move-space').value)) { const opt = el('option', '', (f.value as Folder).name); opt.value = f.key; select.append(opt); } select.disabled = record(movingKey)?.value?.kind !== 'item'; }
function openSearch(purpose: 'command' | 'new-tab' = 'command') {
  searchPurpose = purpose;
  input('search').placeholder = purpose === 'new-tab' ? '新增分頁：輸入網址或搜尋' : '搜尋與指令';
  input('search').ariaLabel = input('search').placeholder;
  dialog('search-dialog').classList.toggle('new-tab-entry', purpose === 'new-tab');
  if (!dialog('search-dialog').open) dialog('search-dialog').showModal();
  input('search').value = ''; searchResults(); input('search').focus();
}
function searchResults() {
  const query = input('search').value.trim().toLocaleLowerCase(); const out = $('search-results'); out.replaceChildren();
  if (searchPurpose === 'new-tab') return;
  const add = (title: string, detail: string, action: () => void) => { const b = button(title, title, () => { dialog('search-dialog').close(); action(); }, 'search-result'); b.append(el('small', '', detail)); out.append(b); };
  for (const r of entities('item').filter(r => { const i = r.value as Item; return !query || `${i.title} ${i.url}`.toLocaleLowerCase().includes(query); }).slice(0, 100)) { const i = r.value as Item; const space = record(i.space)?.value as Space | undefined; add(i.title || i.url, `${space?.name || '未分類'} · ${i.pinned ? '釘選同步' : '本機分頁'} · ${i.url}`, () => run(() => act('open', { key: r.key }))); }
  if (query) add(`搜尋／前往：${input('search').value}`, '確認後才建立新分頁', () => run(() => act('navigate', { input: input('search').value, newTab: true })));
  if (searchPurpose === 'command') {
    if (!query || '新增分頁'.includes(query)) add('＋ 新增分頁', '先開啟搜尋小窗', () => openSearch('new-tab'));
    for (const s of entities('space')) if (!query || (s.value as Space).name.toLocaleLowerCase().includes(query)) add(`切換 Space：${(s.value as Space).name}`, '指令', () => run(() => act('space', { key: s.key })));
    if (!query || '立即同步'.includes(query)) add('立即同步 Google Drive', state.account || '尚未連線', () => run(() => act('sync')));
  }
}
function addressResults() {
  const out = $('address-suggestions'); if (!out) return;
  const query = input('address').value.trim().toLocaleLowerCase(); out.replaceChildren();
  const add = (title: string, detail: string, action: () => void) => { const b = button(title, title, () => { out.hidden = true; action(); }, 'address-result'); b.append(el('small', '', detail)); out.append(b); };
  for (const r of entities('item').filter(r => { const item=r.value as Item; return query&&`${item.title} ${item.url}`.toLocaleLowerCase().includes(query); }).slice(0,6)) { const item=r.value as Item; add(item.title||item.url,item.url,()=>run(()=>act('open',{key:r.key}))); }
  for (const r of entities('space').filter(r => query&&(r.value as Space).name.toLocaleLowerCase().includes(query)).slice(0,4)) add(`切換 Space：${(r.value as Space).name}`,'Space',()=>run(()=>act('space',{key:r.key})));
  if (query) add(`前往或搜尋：${input('address').value}`,'Enter',()=>run(()=>act('navigate',{input:input('address').value})));
  add('新增分頁','指令',()=>openSearch('new-tab'));
  out.hidden=false;
}
function updateSync() {
  $('account').textContent = state.account || '尚未連線 · 資料保存在本機';
  $('sync-detail').textContent = !state.configured ? '尚未設定 OAuth Client ID。請參閱專案 README，設定後重新建置。' : state.sync.error || `待同步 ${state.sync.pending} 筆；最後成功：${state.sync.lastSync ? new Date(state.sync.lastSync).toLocaleString('zh-TW') : '尚未同步'}`;
  $<HTMLButtonElement>('connect').disabled = !state.configured || state.sync.running; $<HTMLButtonElement>('disconnect').disabled = !state.account || state.sync.running;
  $('drive-folder').hidden = !state.sync.folderId;
}
function openSettings() {
  const settings = entities('settings')[0]?.value; input('show-address').checked = settings?.kind !== 'settings' || settings.addressBar;
  const style=settings?.kind==='settings'&&settings.style?settings.style:DEFAULT_STYLE;writeStyleInputs('global',style);
  updateSync(); dialog('settings-dialog').showModal();
}
const radiusEditors=new Map<string,{unlink:HTMLInputElement;corners:HTMLInputElement[]}>();
function prepareRadiusControls(prefix:string){for(const id of ['tab-radius','favicon-radius','address-radius','space-radius']){const slider=input(`${prefix}-${id}`);if(radiusEditors.has(`${prefix}-${id}`))continue;const unlink=el('input') as HTMLInputElement;unlink.type='checkbox';const toggle=el('label','corner-toggle');toggle.append(unlink,document.createTextNode(' 各別四角'));const detail=el('div','corner-grid');const corners=['左上','右上','右下','左下'].map(label=>{const field=el('input') as HTMLInputElement;field.type='range';field.min='0';field.max='80';const wrap=el('label','',label);wrap.append(field);detail.append(wrap);return field;});slider.parentElement!.append(toggle,detail);const refresh=()=>{detail.hidden=!unlink.checked;};unlink.onchange=()=>{for(const field of corners)field.value=slider.value;refresh();slider.dispatchEvent(new Event('input'));};for(const field of corners)field.oninput=()=>slider.dispatchEvent(new Event('input'));refresh();radiusEditors.set(`${prefix}-${id}`,{unlink,corners});}}
function writeStyleInputs(prefix:string,style:VisualStyle){input(`${prefix}-font`).value=style.fontFamily;input(`${prefix}-weight`).value=String(style.fontWeight);input(`${prefix}-size`).value=String(style.fontSize);input(`${prefix}-text-color`).value=style.textColor;for(const [id,key] of [['tab-radius','tabRadius'],['favicon-radius','faviconRadius'],['address-radius','addressRadius'],['space-radius','spaceRadius']] as const){const value=style[key];input(`${prefix}-${id}`).value=String(value.all);const editor=radiusEditors.get(`${prefix}-${id}`);if(editor){editor.unlink.checked=!value.linked;[value.topLeft,value.topRight,value.bottomRight,value.bottomLeft].forEach((v,i)=>editor.corners[i].value=String(v));editor.corners[0].parentElement!.parentElement!.hidden=value.linked;}}}
function readRadius(prefix:string,id:string){const slider=input(`${prefix}-${id}`),editor=radiusEditors.get(`${prefix}-${id}`);if(!editor?.unlink.checked)return linkedRadius(Number(slider.value));const [topLeft,topRight,bottomRight,bottomLeft]=editor.corners.map(x=>Number(x.value));return {linked:false,all:Number(slider.value),topLeft,topRight,bottomRight,bottomLeft};}
function readStyleInputs(prefix:string):VisualStyle{return {fontFamily:input(`${prefix}-font`).value.trim()||DEFAULT_STYLE.fontFamily,fontWeight:Number(input(`${prefix}-weight`).value),fontSize:Number(input(`${prefix}-size`).value),textColor:input(`${prefix}-text-color`).value,tabRadius:readRadius(prefix,'tab-radius'),faviconRadius:readRadius(prefix,'favicon-radius'),addressRadius:readRadius(prefix,'address-radius'),spaceRadius:readRadius(prefix,'space-radius')};}
async function refreshExtensions(){const api=(window as any).desktop;if(!api?.extensions)return;const items=await api.extensions('list');const out=$('extensions-list');out.replaceChildren();for(const item of items){const card=el('div','extension-card');const info=el('div');info.append(el('strong','',item.name),el('small','',` ${item.version}`));if(item.warning)info.append(el('p','extension-warning',item.warning));const toggle=el('input') as HTMLInputElement;toggle.type='checkbox';toggle.checked=item.enabled;toggle.onchange=()=>run(async()=>{await api.extensions('toggle',{folder:item.folder,enabled:toggle.checked});await refreshExtensions();});const remove=button('移除',`移除 ${item.name}`,()=>run(async()=>{if(confirm(`移除 ${item.name}？`)){await api.extensions('remove',{folder:item.folder});await refreshExtensions();}}),'danger');card.append(info,toggle,remove);out.append(card);}if(!items.length)out.append(el('div','hint','尚未安裝擴充功能'));}
function openExtensions(){const settings=dialog('settings-dialog');if(settings.open)settings.close();const target=dialog('extensions-dialog');if(!target.open)target.showModal();run(refreshExtensions);}
function openAppearance(key = state.activeSpace) {
  const entry = record(key); if (entry?.value?.kind !== 'space') return;
  appearanceKey = key; appearanceHeads = entry.heads.map(h => h.id); const s = entry.value; editingTheme = { ...s.theme }; input('space-name').value = s.name;
  input('color-start').value = s.theme.start; input('color-end').value = s.theme.end; input('angle').value = String(s.theme.angle); input('opacity').value = String(s.theme.opacity * 100);
  input('background-file').value = ''; input('icon-file').value = '';
  const settings=entities('settings')[0]?.value;const base=settings?.kind==='settings'&&settings.style?settings.style:DEFAULT_STYLE;input('space-custom-style').checked=!!s.theme.useCustomStyle;writeStyleInputs('space',{...base,...(s.theme.style||{})} as VisualStyle);$('space-style').toggleAttribute('inert',!s.theme.useCustomStyle);
  appearanceInitialTheme={...s.theme};appearanceInitialName=s.name;appearanceDirty=false;
  previewTheme(); dialog('space-settings-dialog').showModal();
}
function previewTheme() {
  editingTheme = { ...editingTheme, start: input('color-start').value, end: input('color-end').value, angle: Number(input('angle').value), opacity: Number(input('opacity').value) / 100,useCustomStyle:input('space-custom-style').checked,style:input('space-custom-style').checked?readStyleInputs('space'):undefined };
  $('angle-value').textContent = `${editingTheme.angle}°`; $('opacity-value').textContent = `${Math.round(editingTheme.opacity * 100)}%`;
  cancelAnimationFrame(appearanceFrame); appearanceFrame=requestAnimationFrame(()=>applyTheme(editingTheme));
  if(appearanceInitialTheme)appearanceDirty=input('space-name').value!==appearanceInitialName||JSON.stringify(editingTheme)!==JSON.stringify(appearanceInitialTheme);
}
async function saveAppearance(){
  const existing=record(appearanceKey)?.value;if(existing?.kind!=='space')throw new Error('Space 已變更，請重新開啟設定');
  const savedTheme={...editingTheme},savedName=input('space-name').value.trim()||existing.name;
  await rpc('update',{key:appearanceKey,baseHeads:appearanceHeads,value:{...existing,name:savedName,theme:savedTheme}});
  await refresh();const persisted=record(appearanceKey);if(persisted?.value?.kind!=='space')throw new Error('Space 外觀儲存失敗');
  appearanceHeads=persisted.heads.map(h=>h.id);appearanceInitialTheme={...persisted.value.theme};editingTheme={...persisted.value.theme};appearanceInitialName=persisted.value.name;input('space-name').value=persisted.value.name;appearanceDirty=false;applyTheme(persisted.value.theme);
}
function discardAppearance(){editingTheme={...appearanceInitialTheme};input('space-name').value=appearanceInitialName;$('space-title').textContent=appearanceInitialName;applyTheme(appearanceInitialTheme);appearanceDirty=false;}
function requestAppearanceClose(){if(appearanceSavePromise){void appearanceSavePromise.then(()=>dialog('space-settings-dialog').close()).catch(()=>undefined);return;}if(!appearanceDirty){dialog('space-settings-dialog').close();return;}const confirmDialog=document.getElementById('appearance-confirm') as HTMLDialogElement|null;if(confirmDialog&&!confirmDialog.open)confirmDialog.showModal();}
async function readImage(file: File): Promise<Asset> {
  if (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('請使用 5 MB 以下的 PNG、JPEG 或 WebP 圖片');
  const bytes = await file.arrayBuffer(); const bitmap = await createImageBitmap(file); bitmap.close();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('讀取圖片失敗')); reader.readAsDataURL(file); });
  return { hash, mime: file.type, data };
}
function openConflicts() {
  const out = $('conflicts'); out.replaceChildren();
  for (const r of state.records.filter(r => r.heads.length > 1)) {
    const card = el('div', 'conflict-card'); card.append(el('h3', '', r.value && ('name' in r.value ? r.value.name : 'title' in r.value ? r.value.title : '介面設定') || '已刪除項目'));
    for (const head of r.heads) { const version = el('div', 'conflict-version'); version.append(el('small', '', `${new Date(head.at).toLocaleString('zh-TW')} · 裝置 ${head.device.slice(0, 8)}`), el('p', '', head.value === null ? '刪除此項目' : JSON.stringify(head.value, null, 2)), button('保留這個版本', '保留這個版本', () => run(async () => { await act('resolve', { key: r.key, head: head.id }); dialog('conflict-dialog').close(); if (state.records.some(x => x.heads.length > 1)) openConflicts(); }))); card.append(version); }
    out.append(card);
  }
  dialog('conflict-dialog').showModal();
}
async function init() {
  windowId = (await browserAPI.windows.getCurrent()).id!;
  prepareRadiusControls('global');prepareRadiusControls('space');
  document.querySelectorAll<HTMLElement>('[data-close]').forEach(b => b.onclick = () => b.dataset.close==='space-settings-dialog'?requestAppearanceClose():dialog(b.dataset.close!).close());
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(b => b.onclick = () => run(() => act('navigation', { action: b.dataset.nav })));
  $('address-form').onsubmit = e => { e.preventDefault(); $('address-suggestions') && ($('address-suggestions').hidden=true); run(() => act('navigate', { input: input('address').value })); };
  if($('address-suggestions')){input('address').onfocus=()=>{input('address').select();addressResults();};input('address').onclick=()=>input('address').select();input('address').oninput=addressResults;input('address').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('address-suggestions').hidden=true;run(()=>act('navigate',{input:input('address').value}));}else if(e.key==='ArrowDown'){e.preventDefault();$('address-suggestions').querySelector('button')?.focus();}else if(e.key==='Escape')$('address-suggestions').hidden=true;};$('address-suggestions').onkeydown=e=>{const buttons=[...$('address-suggestions').querySelectorAll('button')];const at=buttons.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};}
  $('copy-address').onclick = () => run(async () => {
    const url = state.activeTab?.url || input('address').value.trim();
    if (!url) throw new Error('目前沒有可複製的網址');
    const desktop = (window as any).desktop;
    if (desktop?.copyText) await desktop.copyText(url);
    else await navigator.clipboard.writeText(url);
    toast('已複製網址');
  });
  $('search-open').onclick = () => openSearch('command'); $('search').oninput = searchResults;
  $('search').onkeydown = e => { if (e.key === 'ArrowDown' && searchPurpose === 'command') { e.preventDefault(); $('search-results').querySelector('button')?.focus(); } if (e.key === 'Enter') { e.preventDefault(); if (searchPurpose === 'new-tab') { const value = input('search').value.trim(); if (value) { dialog('search-dialog').close(); run(() => act('navigate', { input: value, newTab: true })); } } else $('search-results').querySelector('button')?.click(); } };
  $('search-results').onkeydown = e => { const buttons = [...$('search-results').querySelectorAll('button')]; const at = buttons.indexOf(document.activeElement as HTMLButtonElement); if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); } };
  $('new-tab').onclick = startNewTab;
  $('add-menu').onclick = startNewFolder;
  $('space-add-fixed').onclick = startNewSpace;
  $('name-form').onsubmit = e => { e.preventDefault(); const name = input('name-input').value.trim(); if (name) run(async () => { await nameAction(name); dialog('name-dialog').close(); }); };
  $('move-space').onchange = fillMoveFolders;
  $('move-form').onsubmit = e => { e.preventDefault(); run(async () => { await act('move', { key: movingKey, space: $<HTMLSelectElement>('move-space').value, folder: $<HTMLSelectElement>('move-folder').value || undefined, order: Date.now() }); dialog('move-dialog').close(); }); };
  $('settings-open').onclick = openSettings; $('space-settings').onclick = () => openAppearance(); $('sync-status').onclick = openSettings;
  dialog('space-settings-dialog').onclose = () => {if(appearanceDirty)discardAppearance();else applyTheme(currentSpace().theme);};
  dialog('space-settings-dialog').oncancel=e=>{e.preventDefault();requestAppearanceClose();};
  for (const id of ['color-start', 'color-end', 'angle', 'opacity']) $(id).oninput = previewTheme;
  input('space-custom-style').onchange=()=>{$('space-style').toggleAttribute('inert',!input('space-custom-style').checked);previewTheme();};for(const id of ['space-font','space-weight','space-size','space-text-color','space-tab-radius','space-favicon-radius','space-address-radius','space-space-radius'])$(id).oninput=previewTheme;
  input('space-name').oninput=()=>{$('space-title').textContent=input('space-name').value||appearanceInitialName;previewTheme();};
  for (const [id, field] of [['background-file', 'background'], ['icon-file', 'icon']] as const) $(id).onchange = () => run(async () => { const file = input(id).files?.[0]; if (!file) return; const asset = await readImage(file); await rpc('asset', { asset }); state.assets[asset.hash] = asset; editingTheme[field] = asset.hash; previewTheme(); toast('圖片已讀取並即時預覽'); });
  $('clear-background').onclick = () => { delete editingTheme.background; previewTheme(); }; $('clear-icon').onclick = () => { delete editingTheme.icon; previewTheme(); };
  $('appearance-form').onsubmit = e => { e.preventDefault(); const pending=saveAppearance();appearanceSavePromise=pending;run(async()=>{try{await pending;toast('外觀已套用');}finally{if(appearanceSavePromise===pending)appearanceSavePromise=undefined;}}); };
  $('show-address').onchange = () => run(() => act('settings', { addressBar: input('show-address').checked }));
  for(const id of ['global-font','global-weight','global-size','global-text-color','global-tab-radius','global-favicon-radius','global-address-radius','global-space-radius']){$(id).oninput=()=>applyVisualStyle(readStyleInputs('global'));$(id).onchange=()=>run(()=>act('settings',{style:readStyleInputs('global')}));}
  $('connect').onclick = () => run(async () => { toast('正在連線 Google…'); await act('connect'); dialog('settings-dialog').close(); toast('帳號已連線，請查看同步狀態'); });
  $('disconnect').onclick = () => run(async () => { await act('disconnect'); dialog('settings-dialog').close(); });
  $('sync-now').onclick = () => run(() => act('sync'));
  $('drive-folder').onclick = () => run(() => act('navigate', { input: `https://drive.google.com/drive/folders/${state.sync.folderId}`, newTab: true }));
  $('shortcuts').onclick = () => run(() => act('navigate', { input: 'chrome://extensions/shortcuts', newTab: true }));
  $('normal-window').onclick = () => run(() => act('normal-window'));
  $('window-return').onclick = () => run(() => act('normal-window'));
  $('extensions-open').onclick = openExtensions;
  $('extensions-settings').onclick = openExtensions;
  $('extension-install').onclick=()=>run(async()=>{await (window as any).desktop.extensions('install');await refreshExtensions();});
  $('extension-store').onclick=()=>run(async()=>{await (window as any).desktop.extensions('store');dialog('extensions-dialog').close();});
  $('focus-toggle').onclick = () => run(() => act(state.windowState === 'fullscreen' ? 'normal-window' : 'fullscreen-window'));
  $('fullscreen-settings').onclick = () => run(async () => { await act('fullscreen-window'); dialog('settings-dialog').close(); });
  $('export').onclick = () => run(async () => { const backup = await rpc('export'); const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = `Custom-Browser-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); });
  $('import').onchange = () => run(async () => { const file = input('import').files?.[0]; if (!file) return; if (file.size > 50 * 1024 * 1024) throw new Error('備份不可超過 50 MB'); if (!confirm('將此備份合併到目前帳號？連線 Drive 後會同步其中的網址與圖片。')) return; const backup = JSON.parse(await file.text()); await act('import', { backup }); toast('備份已合併'); input('import').value = ''; });
  $('delete-space-move').onclick = () => run(async () => { await act('delete-space', { key: deletingSpaceKey, strategy: 'move', target: $<HTMLSelectElement>('delete-space-target').value }); dialog('delete-space-dialog').close(); });
  $('delete-space-all').onclick = () => run(async () => { await act('delete-space', { key: deletingSpaceKey, strategy: 'remove' }); dialog('delete-space-dialog').close(); });
  $('conflict-open').onclick = openConflicts;
  browserAPI.runtime.onMessage.addListener(message => { if (message.event === 'changed') scheduleRefresh(); });
  window.addEventListener('new-tab-request', () => openSearch('new-tab'));
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d=>d.addEventListener('pointerdown',e=>{if(e.target!==d)return;if(d.id==='space-settings-dialog')requestAppearanceClose();else if(d.id!=='appearance-confirm')d.close();}));
  document.addEventListener('pointerdown',e=>{if(inlineEditor?.isConnected&&e.target!==inlineEditor)inlineEditor.blur();if($('address-suggestions')&&!$('address-section').contains(e.target as Node))$('address-suggestions').hidden=true;const menu=dialog('menu-dialog');if(menu.open&&!menu.contains(e.target as Node))menu.close();},true);
  const appearanceConfirm=document.getElementById('appearance-confirm') as HTMLDialogElement|null;if(appearanceConfirm){$('appearance-apply').onclick=()=>run(async()=>{await saveAppearance();appearanceConfirm.close();dialog('space-settings-dialog').close();});$('appearance-discard').onclick=()=>{discardAppearance();appearanceConfirm.close();dialog('space-settings-dialog').close();};$('appearance-cancel').onclick=()=>appearanceConfirm.close();appearanceConfirm.oncancel=e=>{e.preventDefault();appearanceConfirm.close();};}
  $('spaces').addEventListener('wheel',e=>{const node=$('spaces');if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){node.scrollLeft+=e.deltaY;e.preventDefault();}},{passive:false});
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault();const address=input('address');address.focus();address.select();addressResults();return;}
    if((e.target as HTMLElement).matches('input,textarea,[contenteditable=true]'))return;
    if(e.key==='F2'&&selected.size===1){e.preventDefault();const r=record([...selected][0]);if(r)renameRecord(r);}
    if(e.key==='Delete'&&selected.size){e.preventDefault();const spaces=[...selected].filter(k=>record(k)?.value?.kind==='space');if(spaces.length){openDeleteSpace(spaces[0]);return;}if(confirm(`移除選取的 ${selected.size} 個項目？`))run(async()=>{await act('remove-many',{keys:[...selected]});selected.clear();});}
  });
  await refresh();
  window.dispatchEvent(new Event('panel-ready'));
}
run(init);
