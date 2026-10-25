/** 功能：跨平台桌面瀏覽器、沙箱分頁及既有同步背景程式的主程序介接。用法：npm run desktop；CUSTOM_BROWSER_DATA 可指定獨立測試資料夾。 */
import { app, BrowserWindow, WebContentsView, ipcMain, protocol, net, session, dialog, Menu, screen, clipboard, type WebContents } from 'electron';
import { readFile, writeFile, rename, mkdir, access, stat, unlink, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { UI_URL, RPC_TYPES, browsingURL, validateMessage } from './security';
import { loadOAuth, configureOAuth, oauthConfigured, getToken, clearTokens, invalidateAccess } from './oauth';
import {loadDebug,debugAction,recordDebug,backgroundValidationStatus,setBackgroundValidation,storeValidationResult,type ValidationResult} from './debug';

app.setName('Custom Browser');
if(process.env.CUSTOM_BROWSER_DATA) app.setPath('userData',path.resolve(process.env.CUSTOM_BROWSER_DATA));
protocol.registerSchemesAsPrivileged([{scheme:'custom-browser',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
class Signal {listeners: Array<(...args:any[])=>any>=[];addListener(fn:(...args:any[])=>any){this.listeners.push(fn);}emit(...args:any[]){for(const fn of this.listeners)fn(...args);}}
interface Tab {id:number;windowId:number;view:WebContentsView;url:string;pendingUrl?:string;title:string;favIconUrl?:string;active:boolean;index:number;incognito:false;status:string;error?:string}
type Dock = 'left'|'right'|'top'|'bottom';
interface WindowEntry {win:BrowserWindow;size:number;dock:Dock;collapsed:boolean;expanded:boolean;overlay:boolean;titlebarExpanded:boolean;pageFullscreen:boolean;closing:boolean;restoreStarted:boolean;uiLoadStarted:boolean;tabs:Map<number,Tab>;active?:number}
const windows=new Map<number,WindowEntry>();
const onMessage=new Signal(),onCreated=new Signal(),onUpdated=new Signal(),onRemoved=new Signal(),onActivated=new Signal(),onWindowRemoved=new Signal(),onBoundsChanged=new Signal(),onCommand=new Signal(),onAlarm=new Signal();
let stored:Record<string,any>={};let ephemeral:Record<string,any>={};let writing=Promise.resolve();let quitting=false;let initialized=false;let secondInstanceRequested=false;let startupNotice='';let oauthReady:Promise<void>=Promise.resolve();
interface SavedExtension {folder:string;name:string;version:string;enabled:boolean;id?:string;warning?:string}
let installedExtensions:SavedExtension[]=[];
const startupStarted=performance.now();const startupMetrics:{shellShownMs?:number;interfaceReadyMs?:number}={};
async function renameWithRetry(source:string,target:string){for(let attempt=0;;attempt++){try{await rename(source,target);return;}catch(error:any){if(!['EPERM','EBUSY','EACCES'].includes(error?.code)||attempt>=4)throw error;await new Promise(resolve=>setTimeout(resolve,40*(attempt+1)));}}}
const UI_FILES=new Set(['index.html','panel.css','panel.js','panel.js.map','desktop.css','newtab.html']);
function meta(t:Tab){return {id:t.id,windowId:t.windowId,url:t.url,pendingUrl:t.pendingUrl,title:t.title,favIconUrl:t.favIconUrl,active:t.active,index:t.index,incognito:false,status:t.status};}
function getEntry(id:number){const e=windows.get(id);if(!e||e.win.isDestroyed())throw new Error('視窗已關閉');return e;}
function getTab(id:number){for(const e of windows.values()){const t=e.tabs.get(id);if(t)return t;}throw new Error('分頁已關閉');}
function winMeta(e:WindowEntry){return {id:e.win.id,type:'normal',incognito:false,state:e.win.isFullScreen()?'fullscreen':e.win.isMinimized()?'minimized':e.win.isMaximized()?'maximized':'normal',...e.win.getBounds()};}
function revealWindow(win:BrowserWindow){
  if(win.isDestroyed())return;if(win.isMinimized())win.restore();
  const bounds=win.getBounds();const visible=screen.getAllDisplays().some(display=>{const area=display.workArea;return bounds.x<area.x+area.width&&bounds.x+bounds.width>area.x&&bounds.y<area.y+area.height&&bounds.y+bounds.height>area.y;});
  if(!visible)win.center();win.setSkipTaskbar(false);win.show();win.moveTop();win.focus();
}
function notify(){for(const e of windows.values())if(!e.win.isDestroyed())e.win.webContents.send('browser:changed',{event:'changed'});}
function layout(e:WindowEntry){
  if(e.win.isDestroyed())return;
  const [width,height]=e.win.getContentSize();
  const maximum=e.dock==='left'||e.dock==='right'?width-320:height-220;
  const minimum=e.dock==='left'||e.dock==='right'?240:160,sidebar=Math.max(34,Math.min(e.collapsed&&!e.expanded?34:Math.max(minimum,e.size),maximum));
  const gap=8,top=30,bottom=8,outer=8;
  let bounds={x:outer,y:top,width:Math.max(200,width-outer*2),height:Math.max(100,height-top-bottom)};
  if(e.pageFullscreen)bounds={x:0,y:0,width,height};
  else if(e.dock==='left')bounds={x:sidebar+gap,y:top,width:Math.max(200,width-sidebar-gap-outer),height:Math.max(100,height-top-bottom)};
  else if(e.dock==='right')bounds={x:outer,y:top,width:Math.max(200,width-sidebar-gap-outer),height:Math.max(100,height-top-bottom)};
  else if(e.dock==='top')bounds={x:outer,y:sidebar+gap,width:Math.max(200,width-outer*2),height:Math.max(100,height-sidebar-gap-bottom)};
  else bounds={x:outer,y:top,width:Math.max(200,width-outer*2),height:Math.max(100,height-top-sidebar-gap)};
  if(!e.pageFullscreen)bounds={x:bounds.x+2,y:bounds.y+2,width:Math.max(196,bounds.width-4),height:Math.max(96,bounds.height-4)};
  for(const t of e.tabs.values()){
    t.view.setVisible(t.active&&!e.overlay);
    if(t.active){t.view.setBorderRadius(e.pageFullscreen?0:19);t.view.setBounds(bounds);}
  }
  const tab=e.active?e.tabs.get(e.active):undefined;
  e.win.webContents.send('browser:state',{title:tab?.title||'Custom Browser',url:tab?.url||'',loading:tab?.status==='loading',error:tab?.error,hasTab:!!tab,maximized:e.win.isMaximized(),fullscreen:e.win.isFullScreen(),pageFullscreen:e.pageFullscreen,startupNotice});
}
function selectTab(t:Tab){const e=getEntry(t.windowId);for(const tab of e.tabs.values())tab.active=tab.id===t.id;e.active=t.id;layout(e);onActivated.emit({tabId:t.id,windowId:t.windowId});}
function updateTab(t:Tab,change:any){Object.assign(t,change);onUpdated.emit(t.id,change,meta(t));layout(getEntry(t.windowId));}
function shortcut(wc:WebContents,windowId:number){wc.on('before-input-event',(event,input)=>{
  if(input.type!=='keyDown')return;const key=input.key.toLowerCase();const command=input.control||input.meta;
  const ui=getEntry(windowId).win.webContents;
  if(command&&['k','l','t','w','n'].includes(key)){event.preventDefault();
    if(key==='k'||key==='l'){getEntry(windowId).win.focus();ui.focus();ui.send('browser:command',key==='k'?'search':'address');}
    if(key==='t'){getEntry(windowId).win.focus();ui.focus();ui.send('browser:command','new-tab');}
    if(key==='w'){const e=getEntry(windowId);if(e.active)void closeTab(e.active).catch(()=>notify());}
    if(key==='n')createWindow();
  }else if(key==='f11'){event.preventDefault();const win=getEntry(windowId).win;win.setFullScreen(!win.isFullScreen());}
  else if(command&&input.shift&&key==='s'){event.preventDefault();const e=getEntry(windowId);onCommand.emit('next-space',e.active?meta(getTab(e.active)):{windowId});}
  else if(command&&key==='tab'){event.preventDefault();const e=getEntry(windowId),tabs=[...e.tabs.values()];if(tabs.length){const index=tabs.findIndex(t=>t.active);selectTab(tabs[(index+(input.shift?-1:1)+tabs.length)%tabs.length]);}}
});}
function closeTab(id:number):Promise<void>{const wc=getTab(id).view.webContents;return new Promise((resolve,reject)=>{
  const done=()=>{wc.removeListener('will-prevent-unload',cancel);resolve();};
  const cancel=(event:Electron.Event)=>{if(!event.defaultPrevented){wc.removeListener('destroyed',done);wc.removeListener('will-prevent-unload',cancel);reject(new Error('已保留尚未儲存的分頁'));}};
  wc.once('destroyed',done);wc.on('will-prevent-unload',cancel);wc.close({waitForBeforeUnload:true});
});}
function allowNavigation(event:Electron.Event,url:string){try{browsingURL(url);}catch{event.preventDefault();}}
function createTab(windowId:number,input:string,active=true){
  const e=getEntry(windowId),url=browsingURL(input);
  const view=new WebContentsView({webPreferences:{partition:'persist:browsing',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false}});
  const wc=view.webContents;
  const tab:Tab={id:wc.id,windowId,view,url,pendingUrl:url,title:url==='about:blank'?'新分頁':url,active:false,index:e.tabs.size,incognito:false,status:'loading'};
  e.tabs.set(tab.id,tab);e.win.contentView.addChildView(view);
  wc.on('will-navigate',(event,url)=>allowNavigation(event,url));
  wc.on('will-redirect',(event,url)=>allowNavigation(event,url));
  wc.on('will-frame-navigate',details=>allowNavigation(details,details.url));
  wc.setWindowOpenHandler(({url,disposition})=>{try{const safe=browsingURL(url);if(disposition==='new-window'){const target=createWindow();createTab(target.id,safe,true);}else createTab(windowId,safe,disposition!=='background-tab');}catch{}return {action:'deny'};});
  wc.on('context-menu',(_event,params)=>{const template:Electron.MenuItemConstructorOptions[]=[];let link='';try{if(params.linkURL)link=browsingURL(params.linkURL);}catch{}
    if(link)template.push({label:'在新分頁中開啟連結',click:()=>createTab(windowId,link,false)},{label:'在新視窗中開啟連結',click:()=>{const target=createWindow();createTab(target.id,link,true);}},{label:'複製連結網址',click:()=>clipboard.writeText(link)},{type:'separator'});
    template.push({label:'上一頁',enabled:wc.navigationHistory.canGoBack(),click:()=>wc.navigationHistory.goBack()},{label:'下一頁',enabled:wc.navigationHistory.canGoForward(),click:()=>wc.navigationHistory.goForward()},{label:'重新載入',click:()=>wc.reload()},{type:'separator'},{role:'copy',label:'複製'},{role:'selectAll',label:'全選'});Menu.buildFromTemplate(template).popup({window:e.win});
  });
  wc.on('did-navigate',(_event,url)=>{updateTab(tab,{url:url.startsWith('file:')?'about:blank':url,pendingUrl:undefined});});
  wc.on('did-navigate-in-page',(_event,url,isMain)=>{if(isMain)updateTab(tab,{url});});
  wc.on('page-title-updated',(_event,title)=>updateTab(tab,{title}));
  wc.on('page-favicon-updated',(_event,favicons)=>{const favicon=favicons.find(url=>/^https?:|^data:/.test(url));if(favicon)updateTab(tab,{favIconUrl:favicon});});
  wc.on('enter-html-full-screen',()=>{e.pageFullscreen=true;layout(e);});wc.on('leave-html-full-screen',()=>{e.pageFullscreen=false;layout(e);});
  wc.on('did-start-loading',()=>{tab.status='loading';tab.error=undefined;layout(e);});
  wc.on('did-stop-loading',()=>{tab.status='complete';layout(e);notify();});
  wc.on('did-fail-load',(_event,code,description,_url,isMain)=>{if(isMain&&code!==-3){recordDebug('page-load-failed',code);tab.error=`無法載入網頁（${code}）：${description}`;tab.status='complete';layout(e);}});
  wc.on('render-process-gone',()=>{tab.error='此分頁已停止回應，請按重新整理';layout(e);});
  wc.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(e.win,{type:'question',buttons:['留在頁面','離開頁面'],defaultId:0,cancelId:0,message:'頁面可能有尚未儲存的內容。仍要離開？'});if(choice===1)event.preventDefault();else e.closing=false;});
  wc.on('destroyed',()=>{e.tabs.delete(tab.id);try{e.win.contentView.removeChildView(view);}catch{}onRemoved.emit(tab.id,{windowId});
    if(e.active===tab.id){e.active=undefined;const next=[...e.tabs.values()].at(-1);if(next)selectTab(next);}
    if(!e.win.isDestroyed()){layout(e);if(e.closing&&!e.tabs.size)e.win.destroy();}
  });
  shortcut(wc,windowId);if(active||!e.active)selectTab(tab);else layout(e);
  onCreated.emit(meta(tab));
  void (url==='about:blank'?wc.loadFile(path.join(__dirname,'newtab.html')):wc.loadURL(url)).catch(()=>undefined);
  return meta(tab);
}
function installDownloadHandler(s:Electron.Session){
  s.setPermissionCheckHandler((_wc,permission)=>permission==='fullscreen');
  s.setPermissionRequestHandler(async(wc,permission,callback,details)=>{
    if(permission==='fullscreen'){callback(true);return;}
    const tab=[...windows.values()].flatMap(e=>[...e.tabs.values()]).find(t=>t.view.webContents===wc);
    if(!tab||!['media','geolocation','notifications','pointerLock','clipboard-sanitized-write'].includes(permission)){callback(false);return;}
    let origin='';try{origin=new URL(details.requestingUrl||wc.getURL()).origin;}catch{callback(false);return;}
    const result=await dialog.showMessageBox(getEntry(tab.windowId).win,{type:'question',buttons:['拒絕','允許此次'],defaultId:0,cancelId:0,message:`${origin} 要求 ${permission} 權限`,detail:'只對這次要求生效。'});callback(result.response===1);
  });
  s.on('will-download',(_event,item,wc)=>{
    const owner=[...windows.values()].find(e=>e.win.webContents===wc||[...e.tabs.values()].some(t=>t.view.webContents===wc));
    item.setSaveDialogOptions({title:'儲存下載檔案',defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))});
    item.once('done',(_e,state)=>{if(owner&&!owner.win.isDestroyed())owner.win.webContents.send('browser:command',state==='completed'?'download-complete':'download-cancelled');});
  });
}
function loadWindowUI(e:WindowEntry){
  if(e.uiLoadStarted||e.win.isDestroyed())return;e.uiLoadStarted=true;const win=e.win;
  win.webContents.on('did-finish-load',()=>{startupMetrics.interfaceReadyMs??=Math.round(performance.now()-startupStarted);layout(e);if(!e.restoreStarted){e.restoreStarted=true;void invoke(win.id,{type:'restore-window-session'}).catch(()=>recordDebug('window-session-restore-failed'));}});
  void win.loadURL(UI_URL).catch(error=>{recordDebug('ui-load-failed');dialog.showErrorBox('Custom Browser 介面載入失敗',(error as Error).message);if(!win.isDestroyed())win.destroy();});
}
function createWindow(deferUI=false){
  const hiddenTest=process.env.CUSTOM_BROWSER_TEST_HIDDEN==='1';
  const win=new BrowserWindow({width:1320,height:880,minWidth:800,minHeight:560,frame:false,show:!hiddenTest,backgroundColor:'#222838',title:'Custom Browser',webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:!hiddenTest}});
  const e:WindowEntry={win,size:260,dock:'left',collapsed:false,expanded:false,overlay:false,titlebarExpanded:false,pageFullscreen:false,closing:false,restoreStarted:false,uiLoadStarted:false,tabs:new Map()};windows.set(win.id,e);startupMetrics.shellShownMs??=Math.round(performance.now()-startupStarted);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==UI_URL)event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  shortcut(win.webContents,win.id);
  win.on('resize',()=>{layout(e);onBoundsChanged.emit();});
  const boundsChanged=()=>{layout(e);onBoundsChanged.emit();};
  win.on('enter-full-screen',boundsChanged);win.on('leave-full-screen',boundsChanged);win.on('maximize',boundsChanged);win.on('unmaximize',boundsChanged);win.on('restore',boundsChanged);
  win.on('close',event=>{if(e.tabs.size&&!e.closing){event.preventDefault();e.closing=true;void invoke(win.id,{type:'save-window-session'}).then(()=>Promise.all([...e.tabs.values()].map(t=>closeTab(t.id)))).catch(error=>{e.closing=false;recordDebug('window-session-save-failed');dialog.showErrorBox('無法保存視窗工作階段',(error as Error).message);});}});
  win.on('closed',()=>{windows.delete(win.id);onWindowRemoved.emit(win.id);});
  revealWindow(win);if(!deferUI)loadWindowUI(e);return winMeta(e);
}
function authorized(event:Electron.IpcMainInvokeEvent){
  const entry=[...windows.values()].find(e=>e.win.webContents.id===event.sender.id);
  if(!entry||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==UI_URL)throw new Error('拒絕未授權的介面請求');
  return entry;
}
interface ImportedLink {title:string;url:string;pinned?:boolean}
interface ImportedFolder {name:string;items:ImportedLink[]}
function importedLink(raw:any):ImportedLink|undefined{
  if(!raw||typeof raw.url!=='string')return;
  try{const url=new URL(raw.url);if(!['http:','https:'].includes(url.protocol))return;return {title:String(raw.name||raw.title||url.hostname).slice(0,500),url:url.href,pinned:!!raw.pinned};}catch{return;}
}
async function readJsonLimited(file:string,max=50*1024*1024):Promise<any>{
  const info=await stat(file);if(!info.isFile()||info.size>max)throw new Error('設定檔超過 50 MB 或格式不支援');
  return JSON.parse(await readFile(file,'utf8'));
}
function chromiumBookmarks(data:any){
  const folders=new Map<string,ImportedLink[]>(),items:ImportedLink[]=[];
  const walk=(node:any,trail:string[])=>{
    if(!node||typeof node!=='object')return;
    const link=importedLink(node);if(link){if(trail.length){const name=trail.join(' › ').slice(0,200);folders.set(name,[...(folders.get(name)||[]),link]);}else items.push(link);return;}
    if(Array.isArray(node.children)){const next=node.name&&trail.length<5?[...trail,String(node.name).slice(0,80)]:trail;for(const child of node.children)walk(child,next);}
  };
  for(const root of Object.values(data?.roots||{}))walk(root,[]);
  return {folders:[...folders].map(([name,links])=>({name,items:links})),items};
}
function collectArcLinks(value:any,out:ImportedLink[],seen:Set<string>,depth=0){
  if(depth>18||out.length>=10000||!value)return;
  if(Array.isArray(value)){for(const child of value)collectArcLinks(child,out,seen,depth+1);return;}
  if(typeof value!=='object')return;
  const link=importedLink(value);if(link&&!seen.has(link.url)){seen.add(link.url);out.push(link);}
  for(const child of Object.values(value))if(typeof child==='object')collectArcLinks(child,out,seen,depth+1);
}
async function importBrowserProfile(win:BrowserWindow,browser:'Chrome'|'Arc'){
  const local=process.env.LOCALAPPDATA||'';
  const defaultRoot=process.platform==='darwin'
    ? path.join(os.homedir(),'Library','Application Support',browser==='Chrome'?'Google/Chrome':'Arc/User Data')
    : browser==='Chrome'?path.join(local,'Google','Chrome','User Data'):path.join(local,'Packages','TheBrowserCompany.Arc_ttt1ap7aakyb4','LocalCache','Local','Arc','User Data');
  let defaultPath=os.homedir();try{await access(defaultRoot);defaultPath=defaultRoot;}catch{}
  const selected=await dialog.showOpenDialog(win,{title:`選取 ${browser} 設定檔資料夾（Default 或 Profile）`,defaultPath,properties:['openDirectory']});
  if(selected.canceled)return null;
  let profile=selected.filePaths[0];
  try{await access(path.join(profile,'Bookmarks'));}catch{
    const candidate=path.join(profile,'Default');try{await access(path.join(candidate,'Bookmarks'));profile=candidate;}catch{if(browser==='Chrome')throw new Error('所選資料夾不是 Chrome 設定檔；請選擇含 Bookmarks 的 Default 或 Profile 資料夾');}
  }
  let folders:ImportedFolder[]=[],items:ImportedLink[]=[];
  try{const parsed=chromiumBookmarks(await readJsonLimited(path.join(profile,'Bookmarks')));folders=parsed.folders;items=parsed.items;}catch(error:any){if(browser==='Chrome'||error?.code!=='ENOENT')throw error;}
  try{
    const preferences=await readJsonLimited(path.join(profile,'Preferences'),10*1024*1024);
    const urls=[preferences?.homepage,...(Array.isArray(preferences?.session?.startup_urls)?preferences.session.startup_urls:[])];
    for(const url of urls){const link=importedLink({url,title:'首頁',pinned:true});if(link&&!items.some(i=>i.url===link.url))items.push(link);}
  }catch(error:any){if(error?.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  if(browser==='Arc'){
    const candidates=[path.join(profile,'StorableSidebar.json'),path.join(profile,'..','StorableSidebar.json'),path.join(profile,'..','..','StorableSidebar.json')];
    for(const candidate of candidates){try{const arc:any[]=[];collectArcLinks(await readJsonLimited(candidate),arc,new Set(items.map(i=>i.url)));if(arc.length)folders.push({name:'Arc 側邊欄',items:arc});break;}catch(error:any){if(error?.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}}
  }
  const count=items.length+folders.reduce((sum,f)=>sum+f.items.length,0);
  if(!count)throw new Error(`此 ${browser} 設定檔沒有可匯入的 HTTP／HTTPS 書籤或側邊欄網址`);
  return {browser,profile:path.basename(profile),folders,items,count};
}
async function invoke(windowId:number,message:any):Promise<any>{
  validateMessage(message);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('操作逾時，資料仍保留在本機')),240000);
    const respond=(response:any)=>{clearTimeout(timer);resolve(response);};
    onMessage.emit({...message,windowId},{id:'desktop',url:UI_URL},respond);
  });
}
let validationRunning:Promise<ReturnType<typeof backgroundValidationStatus>>|undefined;
function runBackgroundValidation(){
  if(validationRunning)return validationRunning;
  validationRunning=(async()=>{
    const checks:ValidationResult['checks']=[];
    const check=(name:string,ok:boolean)=>checks.push({name,ok});
    const probe=path.join(app.getPath('userData'),'.background-validation.tmp');
    try{await writeFile(probe,'ok',{mode:0o600});await unlink(probe);check('本機儲存',true);}catch{check('本機儲存',false);await unlink(probe).catch(()=>undefined);}
    const entries=[...windows.values()];
    check('視窗容器',entries.length>0&&entries.every(e=>!e.win.isDestroyed()));
    check('介面程序',entries.every(e=>!e.win.webContents.isDestroyed()&&!e.win.webContents.isCrashed()));
    check('分頁容器',entries.every(e=>[...e.tabs.values()].every(t=>!t.view.webContents.isDestroyed()&&!t.view.webContents.isCrashed())));
    try{const first=entries[0];const response=first?await invoke(first.win.id,{type:'snapshot'}):undefined;check('資料與同步程序',!!response?.ok&&response.data?.sync?.status!=='error');}catch{check('資料與同步程序',false);}
    const result:ValidationResult={at:new Date().toISOString(),ok:checks.every(c=>c.ok),checks,metrics:{...startupMetrics}};
    const status=await storeValidationResult(result);
    for(const e of windows.values())if(!e.win.isDestroyed())e.win.webContents.send('browser:command','background-validation-changed');
    return status;
  })().finally(()=>{validationRunning=undefined;});
  return validationRunning;
}
function extensionsFile(){return path.join(app.getPath('userData'),'extensions.json');}
async function saveExtensions(){await writeFile(extensionsFile(),JSON.stringify(installedExtensions,null,2),{mode:0o600});}
async function loadOneExtension(item:SavedExtension){
  const directory=path.join(app.getPath('userData'),'extensions',item.folder);
  try{const extension=await session.fromPartition('persist:browsing').extensions.loadExtension(directory);item.id=extension.id;item.name=extension.name||item.name;item.version=extension.version||item.version;delete item.warning;}
  catch(error){item.warning=(error as Error).message;throw error;}
}
async function loadSavedExtensions(){
  try{installedExtensions=JSON.parse(await readFile(extensionsFile(),'utf8'));if(!Array.isArray(installedExtensions))installedExtensions=[];}catch(error:any){if(error?.code!=='ENOENT')throw error;installedExtensions=[];}
  for(const item of installedExtensions.filter(x=>x.enabled)){try{await loadOneExtension(item);}catch{} }
  await saveExtensions();
}
async function importExtension(win:BrowserWindow){
  const selected=await dialog.showOpenDialog(win,{title:'選取已解壓縮的 Chrome 擴充功能資料夾',properties:['openDirectory']});if(selected.canceled)return installedExtensions;
  const source=selected.filePaths[0];const manifest=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'));
  if(!manifest||typeof manifest.name!=='string'||typeof manifest.version!=='string'||![2,3].includes(manifest.manifest_version))throw new Error('所選資料夾不是支援的 Chrome 擴充功能');
  const folder=crypto.randomUUID();const root=path.join(app.getPath('userData'),'extensions');await mkdir(root,{recursive:true});await cp(source,path.join(root,folder),{recursive:true,errorOnExist:true});
  const item:SavedExtension={folder,name:manifest.name.slice(0,200),version:manifest.version.slice(0,60),enabled:true};installedExtensions.push(item);
  try{await loadOneExtension(item);await saveExtensions();}catch(error){item.enabled=false;await saveExtensions();throw new Error(`擴充功能已匯入但不相容：${(error as Error).message}`);}return installedExtensions;
}
async function initialize(){
  await mkdir(app.getPath('userData'),{recursive:true});
  protocol.handle('custom-browser',request=>{const url=new URL(request.url);const file=url.pathname.slice(1);if(url.hostname!=='ui'||!UI_FILES.has(file))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(path.join(__dirname,file)).href);});
  const bootstrapWindowId=createWindow(true).id;
  const debugReady=loadDebug();
  oauthReady=loadOAuth().catch(()=>{startupNotice=startupNotice||'Google OAuth 設定載入失敗；本機瀏覽功能仍可使用';});
  const storageFile=path.join(app.getPath('userData'),'storage.json');
  try{stored=JSON.parse(await readFile(storageFile,'utf8'));}catch(e:any){
    if(e.code!=='ENOENT'){
      try{stored=JSON.parse(await readFile(storageFile+'.tmp','utf8'));startupNotice='已從未完成寫入的本機資料復原';}
      catch{
        const preserved=`${storageFile}.corrupt-${Date.now()}.json`;
        await rename(storageFile,preserved).catch(()=>undefined);stored={};startupNotice=`損壞的本機設定已保留為 ${path.basename(preserved)}，瀏覽器已用空白資料啟動`;
      }
    }
  }
  await debugReady;
  installDownloadHandler(session.fromPartition('persist:browsing'));installDownloadHandler(session.defaultSession);
  const bridge:any={
    runtime:{id:'desktop',getURL:(file:string)=>`custom-browser://ui/${file}`,getManifest:()=>({oauth2:oauthConfigured()?{client_id:'desktop-configured'}:undefined}),onMessage,sendMessage:async()=>notify()},
    storage:{
      local:{get:async(key:string)=>structuredClone({[key]:stored[key]}),set:async(value:any)=>{const copy=structuredClone(value);writing=writing.catch(()=>undefined).then(async()=>{Object.assign(stored,copy);const file=path.join(app.getPath('userData'),'storage.json');await writeFile(file+'.tmp',JSON.stringify(stored),{mode:0o600});await renameWithRetry(file+'.tmp',file);});await writing;}},
      session:{get:async(key:string)=>structuredClone({[key]:ephemeral[key]}),set:async(value:any)=>{Object.assign(ephemeral,structuredClone(value));}}
    },
    tabs:{
      query:async(filter:any)=>[...windows.values()].flatMap(e=>[...e.tabs.values()]).filter(t=>(filter.windowId===undefined||t.windowId===filter.windowId)&&(filter.active===undefined||t.active===filter.active)).map(meta),
      create:async(options:any)=>createTab(options.windowId,options.url||'about:blank',options.active!==false),
      update:async(id:number,changes:any)=>{const t=getTab(id);if(changes.active)selectTab(t);if(changes.url){const url=browsingURL(changes.url);t.pendingUrl=url;t.error=undefined;void(url==='about:blank'?t.view.webContents.loadFile(path.join(__dirname,'newtab.html')):t.view.webContents.loadURL(url)).catch(()=>undefined);}return meta(t);},
      remove:async(id:number)=>closeTab(id),
      goBack:async(id:number)=>{const wc=getTab(id).view.webContents;if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();},
      goForward:async(id:number)=>{const wc=getTab(id).view.webContents;if(wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();},
      reload:async(id:number)=>getTab(id).view.webContents.reload(),
      onCreated,onUpdated,onRemoved,onActivated,onAttached:new Signal()
    },
    windows:{get:async(id:number)=>winMeta(getEntry(id)),getLastFocused:async()=>winMeta(getEntry(BrowserWindow.getFocusedWindow()?.id||[...windows.keys()][0])),create:async()=>createWindow(),update:async(id:number,options:any)=>{const win=getEntry(id).win;if(options.state==='fullscreen')win.setFullScreen(true);else if(options.state==='normal'){win.setFullScreen(false);win.unmaximize();win.restore();}return winMeta(getEntry(id));},onRemoved:onWindowRemoved,onBoundsChanged},
    sidePanel:{setPanelBehavior:async()=>{},open:async()=>{}},
    alarms:{create:async(name:string,options:any)=>{setInterval(()=>onAlarm.emit({name}),options.periodInMinutes*60000).unref();},onAlarm},
    commands:{onCommand},
    identity:{getAuthToken:async(options:any)=>{await oauthReady;return {token:await getToken(options.interactive)};},clearAllCachedAuthTokens:clearTokens,removeCachedAuthToken:async()=>invalidateAccess()}
  };
  (globalThis as any).chrome=bridge;
  require('./background.cjs');
  ipcMain.handle('browser:window',event=>winMeta(authorized(event)));
  ipcMain.handle('browser:clipboard-write',(event,value)=>{authorized(event);if(typeof value!=='string'||value.length>32768)throw new Error('無效的剪貼簿內容');clipboard.writeText(value);});
  ipcMain.handle('browser:debug',async(event,options)=>{const e=authorized(event);if(typeof options?.action!=='string')throw new Error('無效偵錯操作');const result=await debugAction(e.win,e.active?getTab(e.active).view.webContents:undefined,options.action,options.value,{windows:windows.size,tabs:[...windows.values()].reduce((n,w)=>n+w.tabs.size,0)});if(options.action==='set')for(const w of windows.values())w.win.webContents.send('browser:command','debug-changed');return result;});
  ipcMain.handle('browser:background-validation',async(event,options)=>{authorized(event);if(!['status','set','run'].includes(options?.action))throw new Error('無效背景驗證操作');if(options.action==='status')return backgroundValidationStatus();if(options.action==='set'){if(typeof options.value!=='boolean')throw new Error('背景驗證開關格式不正確');const status=await setBackgroundValidation(options.value);return options.value?runBackgroundValidation():status;}return runBackgroundValidation();});
  ipcMain.handle('browser:rpc',async(event,message)=>{try{return await invoke(authorized(event).win.id,message);}catch(error){return {ok:false,error:(error as Error).message};}});
  ipcMain.handle('browser:control',(event,action)=>{const e=authorized(event),win=e.win;
    if(action==='minimize')win.minimize();else if(action==='maximize'){if(win.isFullScreen())win.setFullScreen(false);else if(win.isMaximized())win.unmaximize();else win.maximize();}
    else if(action==='close')win.close();else if(action==='fullscreen')win.setFullScreen(!win.isFullScreen());else if(action==='new-window')createWindow();else throw new Error('不支援的視窗操作');
  });
  ipcMain.handle('browser:controls-menu',(event,options)=>{const e=authorized(event);if(!['left','right'].includes(options?.side)||!Number.isFinite(options?.x)||!Number.isFinite(options?.y))throw new Error('無效的視窗控制選單');return new Promise<'left'|'right'|null>(resolve=>{let picked:'left'|'right'|null=null;const menu=Menu.buildFromTemplate([{label:'靠左',type:'radio',checked:options.side==='left',click:()=>{picked='left';}},{label:'靠右',type:'radio',checked:options.side==='right',click:()=>{picked='right';}}]);menu.popup({window:e.win,x:Math.round(options.x),y:Math.round(options.y),callback:()=>resolve(picked)});});});
  ipcMain.handle('browser:cursor-position',event=>{const win=authorized(event).win,point=screen.getCursorScreenPoint(),bounds=win.getContentBounds();return {x:point.x-bounds.x,y:point.y-bounds.y};});
  ipcMain.handle('browser:layout',(event,options)=>{const e=authorized(event);if(!Number.isFinite(options?.size)||!['left','right','top','bottom'].includes(options?.dock)||typeof options.collapsed!=='boolean'||typeof options.expanded!=='boolean'||typeof options.overlay!=='boolean'||typeof options.titlebarExpanded!=='boolean')throw new Error('無效布局');const horizontal=options.dock==='top'||options.dock==='bottom';e.size=Math.max(horizontal?160:240,Math.min(horizontal?280:480,options.size));e.dock=options.dock;e.collapsed=options.collapsed;e.expanded=options.expanded;e.overlay=options.overlay;e.titlebarExpanded=options.titlebarExpanded;layout(e);});
  ipcMain.handle('browser:layout-sync',(event,sidebar)=>invoke(authorized(event).win.id,{type:'settings',layout:sidebar}));
  ipcMain.handle('browser:profile-import',async(event,browser)=>{const e=authorized(event);if(!['Chrome','Arc'].includes(browser))throw new Error('不支援的瀏覽器');return importBrowserProfile(e.win,browser);});
  ipcMain.handle('browser:oauth-config',async event=>{const e=authorized(event);const selected=await dialog.showOpenDialog(e.win,{title:'選取 Google Desktop OAuth JSON',filters:[{name:'JSON',extensions:['json']}],properties:['openFile']});if(selected.canceled)return false;const data=await readFile(selected.filePaths[0],'utf8');if(data.length>64000)throw new Error('設定檔過大');await configureOAuth(JSON.parse(data));notify();return true;});
  ipcMain.handle('browser:extensions',async(event,options)=>{const e=authorized(event);const action=options?.action;
    if(action==='list')return installedExtensions;
    if(action==='store'){createTab(e.win.id,'https://chromewebstore.google.com/',true);return installedExtensions;}
    if(action==='install')return importExtension(e.win);
    const folder=typeof options?.folder==='string'?options.folder:'';const item=installedExtensions.find(x=>x.folder===folder);if(!item)throw new Error('找不到擴充功能');
    if(action==='toggle'){item.enabled=!!options.enabled;if(item.enabled)await loadOneExtension(item);else if(item.id)session.fromPartition('persist:browsing').extensions.removeExtension(item.id);await saveExtensions();return installedExtensions;}
    if(action==='remove'){if(item.id)session.fromPartition('persist:browsing').extensions.removeExtension(item.id);const root=path.join(app.getPath('userData'),'extensions');const target=path.resolve(root,item.folder);if(!target.startsWith(path.resolve(root)+path.sep))throw new Error('擴充功能路徑無效');installedExtensions=installedExtensions.filter(x=>x!==item);await saveExtensions();await rm(target,{recursive:true,force:true});return installedExtensions;}
    throw new Error('不支援的擴充功能操作');
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{label:'Custom Browser',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{type:'separator'},{role:'quit'}]} as any]:[]),
    {label:'檔案',submenu:[{label:'新增視窗',click:()=>createWindow()},{role:'close'},{role:'quit'}]},
    {label:'編輯',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'檢視',submenu:[{role:'togglefullscreen'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]}
  ]));
  initialized=true;const bootstrap=windows.get(bootstrapWindowId);if(bootstrap&&!bootstrap.win.isDestroyed())loadWindowUI(bootstrap);else createWindow();secondInstanceRequested=false;
  // 擴充功能不在啟動關鍵路徑，也不廣播資料更新，避免清除使用者剛開啟的行內編輯器。
  void loadSavedExtensions().catch(error=>{startupNotice=startupNotice||`部分擴充功能載入失敗：${(error as Error).message}`;});
  void oauthReady.then(()=>notify());
  setInterval(()=>{if(backgroundValidationStatus().enabled)void runBackgroundValidation();},5*60*1000).unref();
  if(backgroundValidationStatus().enabled)setTimeout(()=>void runBackgroundValidation(),3000).unref();
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{const win=[...windows.values()][0]?.win;if(win)revealWindow(win);else if(initialized)createWindow();else secondInstanceRequested=true;});
  void app.whenReady().then(initialize).catch(error=>{const detail=error instanceof Error?`${error.message}\n${error.stack||''}`:String(error);console.error('Custom Browser startup:',detail);void writeFile(path.join(app.getPath('userData'),'startup-error.log'),`${new Date().toISOString()}\n${detail}\n`,{mode:0o600}).catch(()=>undefined);dialog.showErrorBox('Custom Browser 無法啟動',error instanceof Error?error.message:String(error));app.quit();});
  app.on('activate',()=>{if(!windows.size)createWindow();});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin'||quitting)app.quit();});
  app.on('before-quit',()=>{quitting=true;});
}
