/** 功能：驗證離線合併、衝突、刪除及匯入資料。用法：npm test；不存取使用者資料。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, edit, mergeOps, records, seed, validateOps, navigable, verifyAssets, sharedOps, type Item } from '../src/model';
const item: Item = { kind: 'item', title: '測試', url: 'https://example.com/', space: 'space-default', order: 1, pinned: false, archived: false };
test('不同裝置修改不同項目可合併且重複同步不新增操作', () => {
  const a = emptyVault(); seed(a, 'a'); const b = structuredClone(a);
  edit(a, 'a', 'one', item); edit(b, 'b', 'two', { ...item, title: '另一個' });
  const merged = mergeOps(a.ops, b.ops);
  assert.equal(records(merged).filter(r => r.value?.kind === 'item').length, 2);
  assert.deepEqual(mergeOps(merged, merged), merged);
});
test('同時修改及刪除保留兩個版本，明確選擇後才解決', () => {
  const a = emptyVault(); edit(a, 'a', 'one', item); const b = structuredClone(a);
  edit(a, 'a', 'one', null); edit(b, 'b', 'one', { ...item, title: '新標題' });
  a.ops = mergeOps(a.ops, b.ops);
  assert.equal(records(a.ops)[0].heads.length, 2);
  assert.throws(() => edit(a, 'a', 'one', item), /衝突/);
  edit(a, 'a', 'one', item, true);
  assert.equal(records(a.ops)[0].heads.length, 1);
  assert.equal(records(a.ops)[0].value?.kind, 'item');
});
test('刪除標記不會因舊裝置重新同步而復活', () => {
  const a = emptyVault(); edit(a, 'a', 'one', item); const stale = structuredClone(a);
  edit(a, 'a', 'one', null); a.ops = mergeOps(a.ops, stale.ops);
  assert.equal(records(a.ops)[0].value, null);
});
test('同步操作只包含 Space 設定與釘選項目', () => {
  const v = emptyVault(); seed(v,'a');edit(v,'a','local',{...item,localOnly:true});edit(v,'a','pinned',{...item,pinned:true,localOnly:false});
  assert(!sharedOps(v.ops).some(op=>op.key==='local'));
  assert(sharedOps(v.ops).some(op=>op.key==='pinned'));
  assert(sharedOps(v.ops).some(op=>op.value?.kind==='space'));
});
test('拒絕執行型網址與不支援的資料', () => {
  assert.throws(() => navigable('javascript:alert(1)'));
  assert.throws(() => navigable('data:text/html,test'));
  assert.equal(navigable('example.com'), 'https://example.com/');
  assert.match(navigable('中文 搜尋'), /google.com\/search/);
  assert.throws(() => validateOps([{ id: 'evil', key: 'one', parents: [], at: 1, device: 'a', value: { ...item, url: 'javascript:alert(1)' } }]));
});
test('圖片雜湊驗證拒絕毀損備份', async () => {
  const hash = '0'.repeat(64);
  await assert.rejects(() => verifyAssets({ [hash]: { hash, mime: 'image/png', data: 'data:image/png;base64,dGVzdA==' } }), /雜湊/);
});
