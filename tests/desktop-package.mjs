// 功能：檢查實際封裝 EXE、分頁可見性、剪貼簿、背景驗證、視窗控制與加密儲存。用法：node tests/desktop-package.mjs [exe]；不使用正式個人資料。
import {_electron as electron} from 'playwright';
import {mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),exe=process.argv[2]||path.join(root,'release/win-unpacked/CustomBrowser.exe');
const profile=await mkdtemp(path.join(root,'.desktop-profile-package-'));
const env={...process.env,CUSTOM_BROWSER_DATA:profile,CUSTOM_BROWSER_TEST_HIDDEN:'1',CUSTOM_BROWSER_ISOLATED_INSTANCE:'1',TEMP:path.join(root,'.cache/tmp'),TMP:path.join(root,'.cache/tmp')};delete env.ELECTRON_RUN_AS_NODE;
const launchStarted=Date.now(),application=await electron.launch({executablePath:exe,args:[],env,timeout:3000});const checks=[];
try{
 const page=await application.firstWindow();await page.locator('#space-title').filter({hasText:'日常'}).waitFor();assert(Date.now()-launchStarted<=3000,'封裝版互動介面啟動超過 3 秒');
 checks.push('實際封裝 EXE 啟動');
 assert.equal(await page.locator('#page-title').evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await page.locator('.window-controls').evaluate(e=>getComputedStyle(e).opacity),'1');const control=await page.locator('#window-minimize').boundingBox();assert(control&&control.width>28&&control.height>18);assert.equal(await page.locator('.brand').count(),0);assert.equal(await page.locator('#space-title').evaluate(e=>getComputedStyle(e).userSelect),'none');assert.equal(await page.locator('#address').evaluate(e=>getComputedStyle(e).userSelect),'text');checks.push('固定頂部使用可點擊圓角矩形控制且移除品牌');
 assert.equal((await page.evaluate(()=>desktop.debug('status'))).enabled,false);checks.push('封裝預設偵錯關閉');
 await page.locator('#new-tab').click();const tabInput=page.locator('#items .new-tab-inline .inline-editor');await tabInput.waitFor();await tabInput.fill('about:blank');await tabInput.press('Enter');await page.waitForFunction(()=>document.querySelector('#address')?.value==='about:blank');
 await page.locator('#copy-address').click();assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),'about:blank');checks.push('封裝版複製目前網址至系統剪貼簿');
 const validation=await page.evaluate(()=>desktop.backgroundValidation('run'));assert(validation.last.ok);assert(validation.last.metrics.shellShownMs<=validation.last.metrics.interfaceReadyMs);assert(validation.last.metrics.interfaceReadyMs<=3000);assert(!JSON.stringify(validation).includes('http'));checks.push('封裝版背景驗證、3 秒內介面啟動與無網址內容通過');
 const viewState=await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];return win.contentView.children.filter(v=>v!==win.webContentsView).map(v=>({visible:v.getVisible(),bounds:v.getBounds()}));});
 assert(viewState.some(v=>v.visible&&v.bounds.x>=220&&v.bounds.width>300));checks.push('網頁 WebContentsView 在內容區可見且不遮住側欄');
 const content=await application.evaluate(async({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];const wc=win.contentView.children.find(v=>v!==win.webContentsView&&v.getVisible()).webContents;if(wc.isLoading())await new Promise(r=>wc.once('did-finish-load',r));return (await wc.capturePage()).toPNG().toString('base64');});
 await writeFile('artifacts/desktop-webpage-renderer.png',Buffer.from(content,'base64'));
 await page.evaluate(()=>desktop.control('minimize'));assert(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()));
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].restore());checks.push('最小化與還原');
 await page.evaluate(()=>desktop.control('fullscreen'));await page.waitForFunction(()=>document.querySelector('#window-maximize')?.title==='退出全螢幕');
 await page.locator('#window-maximize').click();await page.waitForFunction(()=>document.querySelector('#window-maximize')?.title!=='退出全螢幕');checks.push('圓角矩形控制列退出全螢幕');
 const secured=await application.evaluate(async({safeStorage})=>{if(!await safeStorage.isAsyncEncryptionAvailable())return false;const encrypted=await safeStorage.encryptStringAsync('test-only-value');return (await safeStorage.decryptStringAsync(encrypted)).result==='test-only-value';});assert(secured);checks.push('Windows 安全儲存加解密往返');
 const result={checks,exe,profile,versions:await application.evaluate(()=>process.versions)};await writeFile('artifacts/desktop-package-test.json',JSON.stringify(result,null,2));console.log({passed:checks.length,checks});
}finally{await application.close();}
