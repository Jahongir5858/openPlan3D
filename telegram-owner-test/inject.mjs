import fs from 'node:fs';
const file=process.argv[2]||'index.html';
let html=fs.readFileSync(file,'utf8');
html=html.replace(/<script defer src="\/owner-presence\.js"><\/script>\s*/g,'');
const tag='<script defer src="./owner-presence.js"></script>';
if(!html.includes(tag)){
  if(html.includes('</body>')) html=html.replace('</body>',tag+'\n</body>');
  else html+=tag;
}
fs.writeFileSync(file,html);