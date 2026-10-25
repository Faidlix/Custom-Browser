// 功能：隔離驗證 Chrome popup 的原生側欄與多分頁限制；用法：HEADED=1 node tests/window-probe.mjs，CHROMIUM_PATH 指定測試瀏覽器；headless 不代表原生側欄驗收。
import { chromium } from 'playwright';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const context=await chromium.launchPersistentContext(await mkdtemp(path.join(root,'.browser-profile-probe-')), {viewport:null,headless:process.env.HEADED!=='1',channel:'chromium',executablePath:process.env.CHROMIUM_PATH,args:[`--disable-extensions-except=${root}/dist`,`--load-extension=${root}/dist`]});
try {
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const result=await worker.evaluate(async()=>{
  const win=await chrome.windows.create({type:'popup',url:'https://example.com/'});
  const results={windowId:win.id,type:win.type};
  try { const tab=await chrome.tabs.create({windowId:win.id,url:'https://example.org/'}); results.secondTab={id:tab.id,windowId:tab.windowId}; }catch(e){results.tabsError=e.message;}
  return results;
 });
 const panel=await context.newPage(); await panel.goto(worker.url().replace('background.js','sidepanel.html'));
 result.sidePanel=await panel.evaluate(async id=>{try{await chrome.sidePanel.open({windowId:id});return 'opened';}catch(e){return e.message;}},result.windowId);
 result.tabs=await worker.evaluate(async id=>(await chrome.tabs.query({windowId:id})).map(t=>({id:t.id,url:t.pendingUrl||t.url})),result.windowId);
 const normal=await worker.evaluate(async()=>{const w=await chrome.windows.create({type:'normal',url:'https://example.com/'});await chrome.windows.update(w.id,{state:'fullscreen'});const t=await chrome.tabs.create({windowId:w.id,url:'https://example.org/'});return {windowId:w.id,secondWindowId:t.windowId};});
 normal.sidePanel=await panel.evaluate(async id=>{try{await chrome.sidePanel.open({windowId:id});return 'opened';}catch(e){return e.message;}},normal.windowId);
 for(let i=0;i<20;i++){ normal.contexts=await worker.evaluate(async()=>chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}));if(normal.contexts.length)break;await new Promise(r=>setTimeout(r,100));}
 normal.window=await worker.evaluate(async id=>chrome.windows.get(id),normal.windowId); result.normal=normal;
 await writeFile('artifacts/window-probe.json',JSON.stringify(result,null,2)); console.log(result);
} finally {await context.close();}
