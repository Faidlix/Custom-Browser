/** 功能：本機偵錯、背景健康驗證、開發工具與無敏感資料診斷。入口：可信任設定頁；不開遠端連接埠、不記錄 token 或網址。 */
import {app,dialog,type BrowserWindow,type WebContents} from 'electron';
import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
let enabled=false;
let backgroundValidation=false;
export interface ValidationResult {at:string;ok:boolean;checks:Array<{name:string;ok:boolean}>;metrics?:{shellShownMs?:number;interfaceReadyMs?:number}}
let lastValidation:ValidationResult|undefined;
const events:Array<{at:string;kind:string;code?:number}>=[];
const inspected=new Set<WebContents>();
let writes=Promise.resolve();
const file=()=>path.join(app.getPath('userData'),'desktop-preferences.json');
function preferences(){return {debug:enabled,backgroundValidation,lastValidation};}
async function persist(){writes=writes.catch(()=>{}).then(async()=>{await writeFile(file()+'.tmp',JSON.stringify(preferences()),{mode:0o600});await rename(file()+'.tmp',file());});await writes;}
export async function loadDebug(){try{const value=JSON.parse(await readFile(file(),'utf8'));enabled=value.debug===true;backgroundValidation=value.backgroundValidation===true;if(value.lastValidation&&typeof value.lastValidation.at==='string'&&typeof value.lastValidation.ok==='boolean'&&Array.isArray(value.lastValidation.checks))lastValidation=value.lastValidation;}catch(e:any){enabled=false;backgroundValidation=false;lastValidation=undefined;if(e.code!=='ENOENT')recordDebug('debug-preferences-invalid');}}
export function backgroundValidationStatus(){return {enabled:backgroundValidation,last:lastValidation};}
export async function setBackgroundValidation(value:boolean){backgroundValidation=value;await persist();return backgroundValidationStatus();}
export async function storeValidationResult(value:ValidationResult){lastValidation=value;await persist();return backgroundValidationStatus();}
export function recordDebug(kind:string,code?:number){if(!enabled)return;events.push({at:new Date().toISOString(),kind,code});if(events.length>200)events.shift();}
export function diagnosticReport(windowCount:number,tabCount:number){return {schema:1,createdAt:new Date().toISOString(),debug:enabled,version:app.getVersion(),electron:process.versions.electron,chromium:process.versions.chrome,node:process.versions.node,platform:process.platform,arch:process.arch,windows:windowCount,tabs:tabCount,events:[...events]};}
export async function debugAction(win:BrowserWindow,current:WebContents|undefined,action:string,value:unknown,counts:{windows:number;tabs:number}){
  if(action==='status')return {enabled};
  if(action==='set'){
    if(typeof value!=='boolean')throw new Error('偵錯開關格式不正確');
    // Serialize changes so two windows cannot race the local preference file.
    enabled=value;if(!enabled){for(const wc of inspected)if(!wc.isDestroyed())wc.closeDevTools();inspected.clear();events.length=0;}await persist();return {enabled};
  }
  if(!enabled)throw new Error('請先開啟偵錯模式');
  if(action==='ui'||action==='page'){
    const wc=action==='ui'?win.webContents:current;if(!wc)throw new Error('目前沒有已開啟的網頁');
    inspected.add(wc);wc.once('destroyed',()=>inspected.delete(wc));wc.openDevTools({mode:'detach',activate:true});return {enabled};
  }
  if(action==='report')return diagnosticReport(counts.windows,counts.tabs);
  if(action==='export'){
    const result=await dialog.showSaveDialog(win,{title:'匯出診斷資料（不含網址、帳號或 token）',defaultPath:`Custom-Browser-diagnostics-${Date.now()}.json`,filters:[{name:'JSON',extensions:['json']}]});
    if(result.canceled||!result.filePath)return {cancelled:true};await writeFile(result.filePath,JSON.stringify(diagnosticReport(counts.windows,counts.tabs),null,2));return {saved:true};
  }
  throw new Error('不支援的偵錯操作');
}
