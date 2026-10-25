/** 功能：桌面導覽與 IPC 邊界回歸測試。用法：npm test；不啟動瀏覽器或存取真實帳號。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {browsingURL,validateMessage} from '../desktop/security';
test('桌面導覽拒絕本機檔案、程式協定、內部 Chrome 頁與夾帶帳密',()=>{
  for(const url of ['file:///C:/secret.txt','javascript:alert(1)','data:text/html,test','custom-browser://ui/index.html','chrome://settings/','https://user:password@example.com/'])assert.throws(()=>browsingURL(url));
  assert.equal(browsingURL('https://example.com'),'https://example.com/');
  assert.equal(browsingURL('chrome://newtab/'),'about:blank');
});
test('桌面 IPC 僅接受列出的業務操作',()=>{
  assert.throws(()=>validateMessage({type:'execute-shell',command:'anything'}));assert.throws(()=>validateMessage(null));
  assert.doesNotThrow(()=>validateMessage({type:'snapshot'}));
});
