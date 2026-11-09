import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=['/','/index.html','/style.css','/content.js','/studio-data.js','/studio-long-stories.js','/studio-story-collection.js','/studio.js','/app.js','/pwa.js','/manifest.webmanifest',...readdirSync(path.join(root,'dist/icons')).sort().map(f=>'/icons/'+f)];
const template=readFileSync(path.join(root,'scripts/sw-template.js'),'utf8');
const hash=createHash('sha256').update(template);
const hashes={};
for(const file of required){const bytes=readFileSync(path.join(root,'dist',file==='/'?'index.html':file));hash.update(file).update(bytes);hashes[file]=createHash('sha256').update(bytes).digest('hex');}
const version='tabi-offline-'+hash.digest('hex').slice(0,16);
writeFileSync(path.join(root,'dist/sw.js'),template.replace('__CACHE_NAME__',version).replace('__PRECACHE__',JSON.stringify(required)).replace('__ASSET_HASHES__',JSON.stringify(hashes)));
console.log(`Prepared ${required.length} offline files (${version}).`);
