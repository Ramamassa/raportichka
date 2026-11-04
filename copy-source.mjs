import { cp, access } from 'node:fs/promises';
const source = new URL('../Рапортичка сайт/', import.meta.url);
const files = ['app.js','app.css','index.html','model.js','roster.js','navigation.js','excel.js','icon.svg','manifest.webmanifest','sw.js','package.json','package-lock.json','.gitignore','designs','scripts','test','Readme.md'];
for (const file of files) {
  const target = new URL(file, import.meta.url);
  try { await access(target); throw new Error('Target already exists: '+file); } catch(e) { if(e.code!=='ENOENT')throw e; }
  await cp(new URL(file,source),target,{recursive:true,errorOnExist:true,force:false});
}
console.log('Copied application sources only; no credentials, runtime settings or user data copied.');
