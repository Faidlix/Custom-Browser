/** 功能：Google Desktop OAuth PKCE、回環回呼與加密 token 快取。入口：主程序；設定來自 oauth-desktop.json 或使用者選取的 Google Desktop JSON。 */
import { app, safeStorage, shell } from 'electron';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
export interface OAuthConfig { clientId: string; clientSecret?: string }
interface Tokens { access_token: string; refresh_token?: string; expiry: number }
let config: OAuthConfig = {clientId:''};
let tokens: Tokens | undefined;
let connecting = false;
const tokenFile = () => path.join(app.getPath('userData'),'google-token.enc');
export function oauthConfigured() { return !!config.clientId; }
export async function configureOAuth(value: any): Promise<void> {
  const installed = value.installed;
  const next = installed ? {clientId:installed.client_id,clientSecret:installed.client_secret} : value;
  if (value.web || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(next.clientId || '')) throw new Error('請選取 Google Cloud「桌面應用程式」OAuth JSON');
  if (next.clientSecret !== undefined && typeof next.clientSecret !== 'string') throw new Error('OAuth 設定格式錯誤');
  await clearTokens();
  config={clientId:next.clientId,clientSecret:next.clientSecret};
  await writeFile(path.join(app.getPath('userData'),'oauth-desktop.json'),JSON.stringify(config),{mode:0o600});
}
export async function loadOAuth(): Promise<void> {
  for (const file of [path.join(app.getPath('userData'),'oauth-desktop.json'),path.join(__dirname,'oauth-desktop.json')]) {
    try {const value=JSON.parse(await readFile(file,'utf8')); if(value.clientId){config=value;break;}} catch(e:any){if(e.code!=='ENOENT')throw e;}
  }
  if(await safeStorage.isAsyncEncryptionAvailable()) {
    try { tokens=JSON.parse((await safeStorage.decryptStringAsync(await readFile(tokenFile()))).result); } catch(e:any){if(e.code!=='ENOENT')tokens=undefined;}
  }
}
async function saveTokens(): Promise<void> {
  if(!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('系統安全儲存不可用；無法保存 Google 授權');
  const temporary=tokenFile()+'.tmp';
  await writeFile(temporary,await safeStorage.encryptStringAsync(JSON.stringify(tokens)),{mode:0o600}); await rename(temporary,tokenFile());
}
async function exchange(body: Record<string,string>): Promise<Tokens> {
  const form = new URLSearchParams({...body,client_id:config.clientId});
  if(config.clientSecret) form.set('client_secret',config.clientSecret);
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(response.status===400?'Google 授權已失效，請重新連線':'Google 授權服務暫時無法使用');
  const next=await response.json() as any;
  if(!next.access_token)throw new Error('Google 未回傳存取授權');
  return {...next,refresh_token:next.refresh_token||tokens?.refresh_token,expiry:Date.now()+Number(next.expires_in||3600)*1000};
}
export async function clearTokens(): Promise<void> {tokens=undefined;await unlink(tokenFile()).catch((e:any)=>{if(e.code!=='ENOENT')throw e;});}
export function invalidateAccess(): void {if(tokens)tokens.expiry=0;}
export async function getToken(interactive: boolean): Promise<string> {
  if(!config.clientId)throw new Error('請先匯入 Google Desktop OAuth 設定');
  if(!interactive && tokens && tokens.expiry>Date.now()+60000)return tokens.access_token;
  if(!interactive){if(!tokens?.refresh_token)throw new Error('尚未授權 Google Drive，請按連線');tokens=await exchange({grant_type:'refresh_token',refresh_token:tokens.refresh_token});await saveTokens();return tokens.access_token;}
  if(connecting)throw new Error('Google 登入視窗已開啟，請完成登入');
  if(!await safeStorage.isAsyncEncryptionAvailable())throw new Error('系統安全儲存不可用');
  connecting=true;
  const verifier=randomBytes(32).toString('base64url');const state=randomBytes(32).toString('base64url');
  const server=createServer();
  try {
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const address=server.address();if(!address||typeof address==='string')throw new Error('無法建立登入回呼');
    const redirect=`http://127.0.0.1:${address.port}/oauth/callback`;
    const codePromise=new Promise<string>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Google 登入逾時，請重試')),180000);
      server.on('request',(req,res)=>{
        const url=new URL(req.url||'/',redirect);
        if(url.pathname!=='/oauth/callback'){res.writeHead(404).end();return;}
        const received=Buffer.from(url.searchParams.get('state')||'');const expected=Buffer.from(state);
        if(received.length!==expected.length||!timingSafeEqual(received,expected)){res.writeHead(400).end('Invalid state');return;}
        clearTimeout(timeout);res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');
        const code=url.searchParams.get('code');
        if(!code||url.searchParams.has('error')){res.end('未完成授權。可以關閉此頁。');reject(new Error('Google 授權已取消'));return;}
        res.end('已收到授權回應，請返回 Custom Browser。可關閉此頁。');resolve(code);
      });
      server.once('close',()=>clearTimeout(timeout));
    });
    // Register rejection before opening the external browser to avoid an unhandled rejection on launch failure.
    void codePromise.catch(()=>undefined);
    const query=new URLSearchParams({client_id:config.clientId,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    await shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
    const code=await codePromise;
    // Do not carry a refresh token from a different account into a new interactive login.
    const previous=tokens;tokens=undefined;
    try {tokens=await exchange({grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier});await saveTokens();}catch(e){tokens=previous;throw e;}
    return tokens!.access_token;
  } finally {server.close();connecting=false;}
}
