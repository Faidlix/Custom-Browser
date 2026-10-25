// 功能：以專用設定檔啟動本機偵錯版，不共用正式登入或遠端偵錯連接埠。用法：npm run debug:desktop；先 build:desktop，關閉應用程式即可結束。
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import electron from 'electron';
const profile=path.resolve('.desktop-profile-debug');await mkdir(profile,{recursive:true});
await writeFile(path.join(profile,'desktop-preferences.json'),JSON.stringify({debug:true}));
const env={...process.env,CUSTOM_BROWSER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,[path.resolve('desktop-dist')],{env,stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));child.on('error',error=>{console.error(error.message);process.exit(1);});
