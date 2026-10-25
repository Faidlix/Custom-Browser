// 功能：以隱藏且隔離的 Electron Profile 執行 20 輪使用者操作模擬，驗證啟動、Space、資料夾、分頁、導覽與 Chrome 同步外掛導入。用法：node tests/desktop-soak.mjs [輪數，預設20] [封裝EXE路徑，可省略]。
import {_electron as electron} from 'playwright';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),rounds=Math.max(1,Number(process.argv[2]||20)),exe=process.argv[3];
await mkdir(path.join(root,'.cache','tmp'),{recursive:true});await mkdir(path.join(root,'artifacts'),{recursive:true});
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<title>${req.url==='/b'?'第二頁':'第一頁'}</title><a href="/b" target="_blank">背景分頁</a><input value="草稿">`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('測試伺服器啟動失敗');const base=`http://127.0.0.1:${address.port}`;
const results=[];
try{
  for(let round=1;round<=rounds;round++){
    const profile=await mkdtemp(path.join(root,'.desktop-profile-soak-')),chromeRoot=path.join(profile,'fake-chrome'),chromeProfile=path.join(chromeRoot,'Default'),extension=path.join(chromeProfile,'Extensions','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','1.0.0_0');
    await mkdir(extension,{recursive:true});await writeFile(path.join(chromeProfile,'Preferences'),JSON.stringify({profile:{name:`模擬帳號 ${round}`},account_info:[{email:`round-${round}@example.invalid`}]}));await writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:`模擬外掛 ${round}`,version:'1.0.0'}));
    const env={...process.env,CUSTOM_BROWSER_DATA:profile,CUSTOM_BROWSER_CHROME_DATA:chromeRoot,CUSTOM_BROWSER_TEST_HIDDEN:'1',CUSTOM_BROWSER_ISOLATED_INSTANCE:'1',TEMP:path.join(root,'.cache','tmp'),TMP:path.join(root,'.cache','tmp')};delete env.ELECTRON_RUN_AS_NODE;
    const started=Date.now(),application=exe?await electron.launch({executablePath:path.resolve(exe),env,timeout:15000}):await electron.launch({args:[path.join(root,'desktop-dist')],env,timeout:15000});
    try{
      const page=await application.firstWindow();await page.locator('#space-title').filter({hasText:'日常'}).waitFor({timeout:10000});const readyMs=Date.now()-started;if(exe)assert(readyMs<=3000,`第 ${round} 輪封裝版啟動 ${readyMs} ms，超過 3 秒`);const validation=await page.evaluate(()=>desktop.backgroundValidation('run'));assert(validation.last.metrics.interfaceReadyMs<=3000,`第 ${round} 輪介面初始化 ${validation.last.metrics.interfaceReadyMs} ms，超過 3 秒`);
      await page.locator('#extensions-open').click();await page.locator('#chrome-extension-profile').selectOption('Default');await page.evaluate(()=>{window.confirm=()=>true;});await page.locator('#extension-chrome-import').click();await page.locator('#extensions-list').getByText(`模擬外掛 ${round}`,{exact:true}).waitFor();await page.locator('[data-close="extensions-dialog"]').click();
      await page.getByTitle('新增 Space',{exact:true}).click();const space=page.locator('#spaces .inline-editor');await space.fill(`工作 ${round}`);await space.press('Enter');await page.locator('#space-title').filter({hasText:`工作 ${round}`}).waitFor();
      await page.locator('#add-menu').click();const folder=page.locator('#items .inline-editor');await folder.fill(`資料夾 ${round}`);await folder.press('Enter');await page.getByText(`資料夾 ${round}`,{exact:true}).waitFor();
      await page.locator('#new-tab').click();let editor=page.locator('#items .new-tab-inline .inline-editor');await editor.fill(`${base}/a?round=${round}`);await editor.press('Enter');await page.locator('#address').waitFor();await page.waitForFunction(value=>document.querySelector('#address')?.value.includes(value),`round=${round}`);
      const addressInput=page.locator('#address');await addressInput.click();assert.equal(await addressInput.evaluate(input=>(input).selectionStart),0);await addressInput.fill(`${base}/b`);await addressInput.press('Enter');await page.waitForFunction(value=>document.querySelector('#address')?.value===value,`${base}/b`);
      await page.locator('#new-tab').click();editor=page.locator('#items .new-tab-inline .inline-editor');await editor.fill(`${base}/a`);await editor.press('Enter');await page.locator('#items .item').filter({hasText:'第一頁'}).waitFor();const rows=page.locator('#items .item');assert((await rows.count())>=2);await rows.last().click({button:'middle'});
      await page.locator('#settings-open').click();await page.locator('[data-close="settings-dialog"]').click();assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
      results.push({round,readyMs,ok:true});
    }finally{await application.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
await writeFile(path.join(root,'artifacts','desktop-soak-20.json'),JSON.stringify({rounds,passed:results.length,results},null,2));console.log(JSON.stringify({rounds,passed:results.length,maxReadyMs:Math.max(...results.map(item=>item.readyMs)),averageReadyMs:Math.round(results.reduce((sum,item)=>sum+item.readyMs,0)/results.length)}));
