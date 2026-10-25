/** 功能：以兩個獨立 Vault 與記憶體 Drive 驗證同步器，非真實 Google OAuth 驗收。用法：npm test。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Drive } from '../src/drive';
import { emptyVault, edit, seed, records, DEFAULT_THEME, type Item, type Op } from '../src/model';
interface Stored { id: string; name: string; appProperties: Record<string,string>; blob: Blob }
class MemoryDrive extends Drive {
  files: Stored[]=[]; fail = false; uploads: string[]=[];
  constructor() { super('test-only-token'); }
  override async folders() { return [{id:'root',name:'Custom Browser'}]; }
  override async list(_q:string) { return this.files.map(({blob,...rest})=>rest); }
  override async upload(_folder:string,name:string,blob:Blob,props:Record<string,string>) {
    if(this.fail) throw new Error('模擬離線');
    const id=crypto.randomUUID(); this.files.push({id,name,blob,appProperties:props}); this.uploads.push(name); return id;
  }
  override async request(url:string) {
    if(this.fail) throw new Error('模擬離線');
    const id = url.split('/files/')[1].split('?')[0]; const f=this.files.find(x=>x.id===id)!;
    return new Response(f.blob,{headers:{'Content-Type':f.blob.type}});
  }
}
const item:Item={kind:'item',title:'測試釘選',url:'https://example.com/',space:'space-default',order:1,pinned:true,archived:false,localOnly:false};
test('兩裝置同步、離線重試、同時修改與刪除衝突',async()=>{
  const drive=new MemoryDrive(); let a=emptyVault(); seed(a,'device-a'); edit(a,'device-a','tab-one',item);
  a=await drive.sync(a); let b=await drive.sync(emptyVault());
  assert.equal(records(b.ops).find(r=>r.key==='tab-one')?.value?.kind,'item');
  edit(a,'device-a','tab-one',{...item,title:'裝置 A'}); edit(b,'device-b','tab-one',null);
  drive.fail=true; await assert.rejects(()=>drive.sync(a),/離線/); assert(a.ops.some(o=>o.value?.kind==='item' && o.value.title==='裝置 A'));
  drive.fail=false; a=await drive.sync(a); b=await drive.sync(b); a=await drive.sync(a);
  assert.equal(records(a.ops).find(r=>r.key==='tab-one')?.heads.length,2);
  edit(b,'device-b','tab-one',item,true); b=await drive.sync(b); a=await drive.sync(a);
  assert.equal(records(a.ops).find(r=>r.key==='tab-one')?.heads.length,1);
  const count=drive.files.length; await drive.sync(a); assert.equal(drive.files.length,count);
});
test('一般分頁僅留本機，只有釘選項目上傳',async()=>{
  const drive=new MemoryDrive();const vault=emptyVault();seed(vault,'a');
  edit(vault,'a','local-tab',{...item,title:'本機分頁',pinned:false,localOnly:true});
  edit(vault,'a','pinned-tab',{...item,title:'同步釘選'});
  const synced=await drive.sync(vault);const remote=await drive.sync(emptyVault());
  assert.equal(records(synced.ops).find(r=>r.key==='local-tab')?.value?.kind,'item');
  assert.equal(records(remote.ops).find(r=>r.key==='local-tab'),undefined);
  assert.equal((records(remote.ops).find(r=>r.key==='pinned-tab')?.value as Item).pinned,true);
});
test('圖片先上傳、以雜湊重用，第二裝置可驗證與下載',async()=>{
  const drive=new MemoryDrive(); const a=emptyVault();
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  a.assets[hash]={hash,mime:'image/png',data:`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`};
  edit(a,'device-a','space-default',{kind:'space',name:'圖片測試',order:0,theme:{...DEFAULT_THEME,background:hash,icon:hash}});
  await drive.sync(a); assert(drive.uploads[0].startsWith(hash)); assert.equal(drive.files.filter(f=>f.appProperties.assetHash).length,1);
  const b=await drive.sync(emptyVault()); assert.deepEqual(b.assets,a.assets);
});
test('未知資料版本不覆蓋本機快取',async()=>{
  const drive=new MemoryDrive(); drive.files.push({id:'unknown',name:'op.json',appProperties:{opId:'unknown'},blob:new Blob([JSON.stringify({schema:2,op:{}})],{type:'application/json'})});
  const a=emptyVault(); seed(a,'a'); const before=structuredClone(a);
  await assert.rejects(()=>drive.sync(a),/版本/); assert.deepEqual(a,before);
});
test('Drive 401 / 403 / 429 顯示可理解的狀態',async()=>{
  const original=globalThis.fetch;
  try { for(const [status,message] of [[401,'授權'],[403,'權限'],[429,'頻繁']] as const) {
    globalThis.fetch=async()=>new Response('',{status});
    await assert.rejects(()=>new Drive('test-only').account(),new RegExp(message));
  }} finally {globalThis.fetch=original;}
});
