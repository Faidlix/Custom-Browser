/** 功能：版本化資料與可保留衝突的操作圖。用法：由背景程式、同步器與測試匯入；不存 Chrome 分頁 ID。 */
export interface CornerRadii { linked: boolean; all: number; topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }
export interface VisualStyle {
  fontFamily: string; fontWeight: number; fontSize: number; textColor: string;
  tabRadius: CornerRadii; faviconRadius: CornerRadii; addressRadius: CornerRadii; spaceRadius: CornerRadii;
}
export interface Theme { start: string; end: string; angle: number; opacity: number; background?: string; icon?: string; useCustomStyle?: boolean; style?: Partial<VisualStyle> }
export interface Space { kind: 'space'; name: string; order: number; theme: Theme }
export interface Folder { kind: 'folder'; name: string; space: string; order: number; parent?: string; icon?: string }
export interface Item { kind: 'item'; title: string; url: string; space: string; folder?: string; order: number; pinned: boolean; archived: boolean; archivedAt?: number; localOnly?: boolean; favicon?: string; manualTitle?: boolean; pageTitle?: string }
export type LayoutBlock = 'navigation'|'address'|'pinned'|'folders'|'tabs'|'spaces';
export interface SidebarLayout { dock: 'left' | 'right' | 'top' | 'bottom'; size: number; collapsed: boolean; hoverExpand: boolean; blocks?: LayoutBlock[]; sizes?: Partial<Record<'left'|'right'|'top'|'bottom',number>> }
export interface Settings { kind: 'settings'; addressBar: boolean; layout?: SidebarLayout; style?: VisualStyle }
export type Entity = Space | Folder | Item | Settings;
export interface Op { id: string; key: string; parents: string[]; value: Entity | null; at: number; device: string }
export interface Asset { hash: string; mime: string; data: string }
export interface Vault { schema: 1; ops: Op[]; assets: Record<string, Asset>; uploaded: string[]; assetFiles: Record<string, string>; folderId?: string; lastSync?: number; error?: string }
export interface RecordView { key: string; heads: Op[]; value: Entity | null }
export const DEFAULT_THEME: Theme = { start: '#273753', end: '#754c69', angle: 145, opacity: .94 };
const radius=(all:number):CornerRadii=>({linked:true,all,topLeft:all,topRight:all,bottomRight:all,bottomLeft:all});
export const DEFAULT_STYLE:VisualStyle={fontFamily:'Inter, "Segoe UI", "Microsoft JhengHei", sans-serif',fontWeight:400,fontSize:13,textColor:'#f6f4fa',tabRadius:radius(9),faviconRadius:radius(6),addressRadius:radius(12),spaceRadius:radius(9)};
export const DEFAULT_BLOCKS:LayoutBlock[]=['navigation','address','pinned','folders','tabs','spaces'];
export function emptyVault(): Vault { return { schema: 1, ops: [], assets: {}, uploaded: [], assetFiles: {} }; }
export function mergeOps(a: Op[], b: Op[]): Op[] {
  const map = new Map(a.map(o => [o.id, o]));
  for (const op of b) {
    const old = map.get(op.id);
    if (old && JSON.stringify(old) !== JSON.stringify(op)) throw new Error('操作識別碼碰撞；已停止合併以保護資料');
    map.set(op.id, op);
  }
  return [...map.values()].sort((x, y) => x.id.localeCompare(y.id));
}
export function records(ops: Op[]): RecordView[] {
  const superseded = new Set(ops.flatMap(o => o.parents.map(p => `${o.key}:${p}`)));
  const byKey = new Map<string, Op[]>();
  for (const op of ops) if (!superseded.has(`${op.key}:${op.id}`)) byKey.set(op.key, [...(byKey.get(op.key) || []), op]);
  return [...byKey].map(([key, heads]) => {
    heads.sort((a, b) => a.id.localeCompare(b.id));
    // Conflicting versions remain visible; this deterministic preview is not a resolution.
    return { key, heads, value: heads[heads.length - 1].value };
  });
}
export function edit(vault: Vault, device: string, key: string, value: Entity | null, resolve = false): Op {
  const record = records(vault.ops).find(r => r.key === key);
  if (record && record.heads.length > 1 && !resolve) throw new Error('此項目有同步衝突，請先選擇要保留的版本');
  const op: Op = { id: crypto.randomUUID(), key, parents: record?.heads.map(o => o.id) || [], value, at: Date.now(), device };
  vault.ops.push(op);
  return op;
}
export function seed(vault: Vault, device: string): void {
  if (vault.ops.length) return;
  edit(vault, device, 'space-default', { kind: 'space', name: '日常', order: 0, theme: { ...DEFAULT_THEME } });
  edit(vault, device, 'settings', { kind: 'settings', addressBar: true, style: structuredClone(DEFAULT_STYLE) });
}
export function navigable(input: string): string {
  const s = input.trim();
  if (!s) throw new Error('請輸入網址或搜尋文字');
  if (/^(https?:\/\/|chrome:\/\/|about:blank$)/i.test(s)) {
    const url = new URL(s);
    return url.href;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(s)) throw new Error('不支援此網址協定');
  if (!/\s/.test(s) && /^(localhost|[^/]+\.[^/]+)([:/]|$)/i.test(s)) return new URL(`https://${s}`).href;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}
export function safeSavedUrl(url: string): boolean { try { return ['https:', 'http:', 'chrome:', 'about:'].includes(new URL(url).protocol); } catch { return false; } }
export function validateEntity(v: unknown): v is Entity {
  if (!v || typeof v !== 'object') return false;
  const e = v as Entity;
  if (e.kind === 'settings') {
    const layout = e.layout;
    return typeof e.addressBar === 'boolean' && (e.style===undefined||validStyle(e.style)) && (layout === undefined || (
      ['left', 'right', 'top', 'bottom'].includes(layout.dock) &&
      Number.isFinite(layout.size) && layout.size >= 120 && layout.size <= 500 &&
      typeof layout.collapsed === 'boolean' && typeof layout.hoverExpand === 'boolean' &&
      (layout.sizes===undefined||(!!layout.sizes&&typeof layout.sizes==='object'&&Object.entries(layout.sizes).every(([dock,size])=>['left','right','top','bottom'].includes(dock)&&Number.isFinite(size)&&Number(size)>=120&&Number(size)<=500))) &&
      (layout.blocks===undefined||(Array.isArray(layout.blocks)&&layout.blocks.length===6&&new Set(layout.blocks).size===6&&layout.blocks.every(x=>DEFAULT_BLOCKS.includes(x))))
    ));
  }
  if (!('order' in e) || !Number.isFinite(e.order)) return false;
  if (e.kind === 'space') return typeof e.name === 'string' && e.name.length <= 200 && !!e.theme && /^#[\da-f]{6}$/i.test(e.theme.start) && /^#[\da-f]{6}$/i.test(e.theme.end) && Number.isFinite(e.theme.angle) && e.theme.opacity >= 0 && e.theme.opacity <= 1 && [e.theme.background, e.theme.icon].every(h => h === undefined || /^[\da-f]{64}$/.test(h)) && (e.theme.style===undefined||validPartialStyle(e.theme.style));
  if (e.kind === 'folder') return typeof e.name === 'string' && typeof e.space === 'string' && (e.parent===undefined||typeof e.parent==='string') && (e.icon===undefined||/^[\da-f]{64}$/.test(e.icon));
  return e.kind === 'item' && typeof e.title === 'string' && typeof e.space === 'string' && (e.folder === undefined || typeof e.folder === 'string') && typeof e.pinned === 'boolean' && typeof e.archived === 'boolean' && (e.localOnly === undefined || typeof e.localOnly === 'boolean') && (e.favicon===undefined||typeof e.favicon==='string') && (e.manualTitle===undefined||typeof e.manualTitle==='boolean') && (e.pageTitle===undefined||(typeof e.pageTitle==='string'&&e.pageTitle.length<=1000)) && typeof e.url === 'string' && safeSavedUrl(e.url);
}
function validRadius(v:any):v is CornerRadii{return !!v&&typeof v.linked==='boolean'&&['all','topLeft','topRight','bottomRight','bottomLeft'].every(k=>Number.isFinite(v[k])&&v[k]>=0&&v[k]<=80);}
function validStyle(v:any):v is VisualStyle{return !!v&&typeof v.fontFamily==='string'&&v.fontFamily.length<=300&&Number.isFinite(v.fontWeight)&&v.fontWeight>=100&&v.fontWeight<=900&&Number.isFinite(v.fontSize)&&v.fontSize>=9&&v.fontSize<=32&&/^#[\da-f]{6}$/i.test(v.textColor)&&['tabRadius','faviconRadius','addressRadius','spaceRadius'].every(k=>validRadius(v[k]));}
function validPartialStyle(v:any){if(!v||typeof v!=='object')return false;const full={...DEFAULT_STYLE,...v};return validStyle(full);}
export function validateOps(input: unknown): asserts input is Op[] {
  if (!Array.isArray(input) || input.length > 100000) throw new Error('操作資料格式或筆數不支援');
  for (const o of input) if (!o || typeof o.id !== 'string' || !/^[\w-]{1,100}$/.test(o.id) || typeof o.key !== 'string' || !/^[\w-]{1,100}$/.test(o.key) || !Array.isArray(o.parents) || !o.parents.every((p: unknown) => typeof p === 'string' && p !== o.id) || !Number.isFinite(o.at) || typeof o.device !== 'string' || (o.value !== null && !validateEntity(o.value))) throw new Error('操作資料損壞或版本不支援');
}
export function validateGraph(ops: Op[]): void {
  validateOps(ops);
  const byId = new Map(ops.map(o => [o.id, o]));
  const done = new Set<string>(); const visiting = new Set<string>();
  function visit(id: string): void {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error('操作資料含循環參照');
    const op = byId.get(id)!; visiting.add(id);
    for (const parent of op.parents) {
      const prior = byId.get(parent);
      if (!prior || prior.key !== op.key) throw new Error('操作資料缺少前版或含跨項目參照');
      visit(parent);
    }
    visiting.delete(id); done.add(id);
  }
  for (const op of ops) visit(op.id);
}
export async function verifyAssets(assets: Record<string, Asset>): Promise<void> {
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('圖片資料格式錯誤');
  for (const [hash, asset] of Object.entries(assets)) {
    if (!/^[\da-f]{64}$/.test(hash) || asset.hash !== hash || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime) || !asset.data.startsWith(`data:${asset.mime};base64,`)) throw new Error('圖片資料不支援');
    const bytes = await (await fetch(asset.data)).arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('單張圖片不可超過 5 MB');
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (digest !== hash) throw new Error('圖片雜湊驗證失敗');
  }
}
export function referencedAssets(ops: Op[]): string[] {
  return [...new Set(ops.flatMap(o => o.value?.kind === 'space' ? [o.value.theme.background, o.value.theme.icon].filter((s): s is string => !!s) : o.value?.kind==='folder'?[o.value.icon].filter((s):s is string=>!!s):[]))];
}
export function sharedOps(ops: Op[]): Op[] {
  const views = records(ops); const shared = new Set<string>();
  for (const view of views) {
    if (view.value?.kind !== 'item' && view.value !== null) shared.add(view.key);
    else if (view.value?.kind === 'item' && view.value.pinned && !view.value.localOnly) shared.add(view.key);
    else if (view.value === null && ops.some(op => op.key === view.key && op.value?.kind === 'item' && op.value.pinned && !op.value.localOnly)) shared.add(view.key);
  }
  return ops.filter(op => shared.has(op.key));
}
