/** 功能：Drive 專用資料夾與不可變操作檔同步。用法：背景程式傳入 OAuth token、帳號 Vault；不記錄 token。 */
import { type Vault, type Op, type Asset, mergeOps, validateOps, validateGraph, verifyAssets, referencedAssets, sharedOps } from './model';
const BASE = 'https://www.googleapis.com/drive/v3';
interface DriveFile { id: string; name: string; appProperties?: Record<string, string> }
export class Drive {
  constructor(private token: string) {}
  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${this.token}`);
    const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Google 授權已失效，請重新連線');
      if (response.status === 403) throw new Error('Drive 權限或配額不足，請檢查授權與空間');
      if (response.status === 429) throw new Error('Drive 要求過於頻繁，稍後自動重試');
      throw new Error(`Drive 請求失敗 (${response.status})`);
    }
    return response;
  }
  async account(): Promise<{ id: string; name: string }> {
    const { user } = await (await this.request(`${BASE}/about?fields=user(permissionId,emailAddress,displayName)`)).json();
    if (!user?.permissionId) throw new Error('無法識別 Drive 帳號');
    return { id: user.permissionId, name: user.emailAddress || user.displayName };
  }
  async list(q: string): Promise<DriveFile[]> {
    const files: DriveFile[] = []; let pageToken = '';
    do {
      const query = new URLSearchParams({ q: `${q} and trashed=false`, fields: 'nextPageToken,files(id,name,appProperties)', pageSize: '1000' });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await (await this.request(`${BASE}/files?${query}`)).json();
      files.push(...(page.files || [])); pageToken = page.nextPageToken || '';
    } while (pageToken);
    return files;
  }
  async folders(): Promise<DriveFile[]> {
    let folders = await this.list("mimeType='application/vnd.google-apps.folder' and appProperties has { key='arcSpacesRoot' and value='1' }");
    if (!folders.length) {
      const folder = await (await this.request(`${BASE}/files?fields=id,name`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Custom Browser', mimeType: 'application/vnd.google-apps.folder', appProperties: { arcSpacesRoot: '1' } }) })).json();
      folders = [folder];
    }
    // Simultaneous first connections can create two roots: read all, write to canonical one.
    return folders.sort((a, b) => a.id.localeCompare(b.id));
  }
  async upload(folder: string, name: string, blob: Blob, appProperties: Record<string, string>): Promise<string> {
    const boundary = `arc_${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name, parents: [folder], appProperties });
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`, blob, `\r\n--${boundary}--`]);
    const file = await (await this.request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json();
    return file.id;
  }
  async sync(vault: Vault): Promise<Vault> {
    const result = structuredClone(vault);
    const roots = await this.folders(); result.folderId = roots[0].id;
    const files = (await Promise.all(roots.map(root => this.list(`'${root.id}' in parents`)))).flat();
    const assetFiles: Record<string, string> = {};
    const remoteOps = new Set<string>();
    let incoming: Op[] = [];
    for (const file of files) {
      if (file.appProperties?.assetHash) assetFiles[file.appProperties.assetHash] = file.id;
      const opId = file.appProperties?.opId;
      if (!opId) continue;
      remoteOps.add(opId);
      if (vault.uploaded.includes(opId) && sharedOps(vault.ops).some(o => o.id === opId)) continue;
      const payload = await (await this.request(`${BASE}/files/${encodeURIComponent(file.id)}?alt=media`)).json();
      if (payload.schema !== 1) throw new Error('Drive 資料版本較新，請更新外掛');
      validateOps([payload.op]);
      if (payload.op.id !== opId) throw new Error('Drive 操作檔識別碼不一致');
      incoming = mergeOps(incoming, [payload.op]);
    }
    const combined = mergeOps(vault.ops, incoming);
    const accepted = new Set(sharedOps(combined).map(op => op.key));
    result.ops = mergeOps(vault.ops, incoming.filter(op => accepted.has(op.key)));
    validateGraph(result.ops);
    for (const hash of referencedAssets(result.ops)) {
      if (!result.assets[hash]) {
        if (!assetFiles[hash]) throw new Error('同步圖片尚未到達或已被刪除，稍後重試');
        const response = await this.request(`${BASE}/files/${encodeURIComponent(assetFiles[hash])}?alt=media`);
        const blob = await response.blob();
        if (blob.size > 5 * 1024 * 1024) throw new Error('Drive 圖片超過 5 MB');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        const asset: Asset = { hash, mime: blob.type.split(';')[0], data: `data:${blob.type.split(';')[0]};base64,${btoa(binary)}` };
        await verifyAssets({ [hash]: asset }); result.assets[hash] = asset;
      }
      if (!assetFiles[hash]) {
        const asset = result.assets[hash];
        const blob = await (await fetch(asset.data)).blob();
        assetFiles[hash] = await this.upload(result.folderId, `${hash}.${asset.mime.split('/')[1]}`, blob, { assetHash: hash });
      }
    }
    // Assets are durable before any operation that references them is published.
    for (const op of sharedOps(result.ops)) if (!remoteOps.has(op.id)) {
      await this.upload(result.folderId, `op-${op.id}.json`, new Blob([JSON.stringify({ schema: 1, op })], { type: 'application/json' }), { opId: op.id });
      remoteOps.add(op.id);
    }
    result.uploaded = [...remoteOps]; result.assetFiles = assetFiles; result.lastSync = Date.now(); delete result.error;
    return result;
  }
}
