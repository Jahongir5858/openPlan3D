(()=>{'use strict';
const VERSION='tg-owner-presence-poc-0.3-stable-ui';
const MODEL_BASE='https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
const FACEAPI_SRC='https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const KEY_OWNER='tgOwnerPresence.owner.v1';
const KEY_PROTECTED='tgOwnerPresence.protected.v1';
const THRESHOLD=.50, LOOP_MS=170, GOOD_FRAMES=2, NO_FACE_MS=320, EYE_OPEN_MIN=.16, MAX_YAW=.38, MAX_TILT=.22, EYE_CLOSE_GRACE=520;

let modelReady=false, stream=null, owner=null, monitoring=false, good=0, noFaceAt=0, eyesClosedAt=0, currentLocked=true;
let protectedRoute=localStorage.getItem(KEY_PROTECTED)||'';

const css=document.createElement('style');
css.textContent=`
#op-fab{position:fixed;right:14px;bottom:18px;z-index:2147483647;width:52px;height:52px;border:0;border-radius:50%;background:#3390ec;color:white;font-size:23px;box-shadow:0 6px 24px #0008}
#op-panel{position:fixed;inset:0;z-index:2147483646;background:#0e1621f5;color:#fff;display:none;overflow:auto;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
#op-panel.open{display:block}.op-card{max-width:460px;margin:18px auto;padding:18px}.op-video{width:100%;aspect-ratio:3/4;max-height:52dvh;object-fit:cover;background:#000;border-radius:18px;transform:scaleX(-1)}
.op-btn{width:100%;border:0;border-radius:13px;padding:13px;margin:7px 0;background:#3390ec;color:#fff;font-weight:700;font-size:15px}.op-btn.secondary{background:#2b3a48}.op-btn.danger{background:#763333}
.op-status{font-size:13px;color:#b8c6d3;margin:8px 0;line-height:1.45}.op-row{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}.op-pill{font-size:11px;background:#ffffff15;border-radius:999px;padding:5px 8px}.op-pill.ok{background:#1f6f4a}.op-pill.bad{background:#6d3333}
.op-chat-overlay{position:absolute!important;inset:0!important;z-index:2147483000!important;background:#101923!important;color:white!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;padding:20px!important}
.op-chat-overlay .box{background:#1f2c38;border-radius:20px;padding:24px;max-width:340px;width:90%;box-shadow:0 10px 30px #0008}.op-chat-overlay .big{font-size:38px}
.op-chat-overlay.hidden{display:none!important}.op-protected-lock>*:not(.op-chat-overlay){visibility:hidden!important}.op-protected-lock>.op-chat-overlay{visibility:visible!important}
`;
document.head.appendChild(css);

const fab=document.createElement('button'); fab.id='op-fab'; fab.textContent='👁'; fab.title='Owner Presence'; document.documentElement.appendChild(fab);
const panel=document.createElement('div'); panel.id='op-panel'; panel.innerHTML=`
<div class="op-card">
  <h2>👁 Telegram Owner Presence</h2>
  <div class="op-status">POC: tanlangan Telegram chat faqat egasi kameraga qarab turganda ko‘rinadi.</div>
  <video id="op-video" class="op-video" playsinline muted></video>
  <div class="op-row">
    <span id="op-face" class="op-pill">🙂 Owner</span>
    <span id="op-eyes" class="op-pill">👁 Ko‘zlar</span>
    <span id="op-look" class="op-pill">🎯 Qarash</span>
  </div>
  <div id="op-status" class="op-status">Model yuklanmoqda…</div>
  <button id="op-camera" class="op-btn">Kamerani yoqish</button>
  <button id="op-enroll" class="op-btn secondary" disabled>Yuzimni ro‘yxatdan o‘tkazish</button>
  <button id="op-protect" class="op-btn secondary">Joriy chatni himoyalash</button>
  <button id="op-unprotect" class="op-btn danger">Himoyani olib tashlash</button>
  <button id="op-close" class="op-btn secondary">Telegramga qaytish</button>
  <div id="op-debug" class="op-status"></div>
</div>`; document.documentElement.appendChild(panel);

function mountOwnerUi(){
  const target=document.body||document.documentElement;
  if(document.head && !document.head.contains(css)) document.head.appendChild(css);
  if(!document.documentElement.contains(fab)) target.appendChild(fab);
  if(!document.documentElement.contains(panel)) target.appendChild(panel);
}
mountOwnerUi();

const $=id=>document.getElementById(id);
const video=$('op-video'), status=$('op-status'), debug=$('op-debug');
const faceP=$('op-face'), eyesP=$('op-eyes'), lookP=$('op-look');
const cameraBtn=$('op-camera'), enrollBtn=$('op-enroll'), protectBtn=$('op-protect'), unprotectBtn=$('op-unprotect');
fab.onclick=()=>{mountOwnerUi();panel.classList.add('open')}; $('op-close').onclick=()=>{panel.classList.remove('open');setTimeout(mountOwnerUi,0)};

function routeKey(){return location.pathname+location.search+location.hash}
function setPill(el,v){el.classList.toggle('ok',v===true);el.classList.toggle('bad',v===false)}
function loadOwner(){try{const x=JSON.parse(localStorage.getItem(KEY_OWNER)||'null');return Array.isArray(x)&&x.length===128?x:null}catch{return null}}
function saveOwner(x){localStorage.setItem(KEY_OWNER,JSON.stringify(x))}
function dist(a,b){let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d}return Math.sqrt(s)}
function avg(samples){const a=new Array(128).fill(0);for(const s of samples)for(let i=0;i<128;i++)a[i]+=s[i];for(let i=0;i<128;i++)a[i]/=samples.length;const n=Math.sqrt(a.reduce((q,x)=>q+x*x,0))||1;return a.map(x=>x/n)}
function pd(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function pc(ps){let x=0,y=0;for(const p of ps){x+=p.x;y+=p.y}return{x:x/ps.length,y:y/ps.length}}
function ear(e){return(pd(e[1],e[5])+pd(e[2],e[4]))/(2*Math.max(1,pd(e[0],e[3])))}
function attention(face){const lm=face.landmarks,l=lm.getLeftEye(),r=lm.getRightEye(),nose=lm.getNose(),lc=pc(l),rc=pc(r),mid={x:(lc.x+rc.x)/2,y:(lc.y+rc.y)/2},inter=Math.max(1,pd(lc,rc)),tip=nose[3]||nose[Math.floor(nose.length/2)],le=ear(l),re=ear(r),yaw=Math.abs(tip.x-mid.x)/inter,tilt=Math.abs(lc.y-rc.y)/inter;return{eyesOpen:le>EYE_OPEN_MIN&&re>EYE_OPEN_MIN,frontal:yaw<MAX_YAW&&tilt<MAX_TILT,le,re,yaw,tilt}}
async function loadFaceApi(){if(window.faceapi)return;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=FACEAPI_SRC;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}
async function loadModels(){try{await loadFaceApi();await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_BASE),faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_BASE),faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE)]);modelReady=true;owner=loadOwner();status.textContent=owner?'Model tayyor · owner mavjud':'Model tayyor · owner hali ro‘yxatdan o‘tmagan';if(stream)enrollBtn.disabled=false}catch(e){status.textContent='Model yuklanmadi: '+(e?.message||e)}}
async function startCamera(){try{if(!window.isSecureContext)throw new Error('HTTPS talab qilinadi');stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480}},audio:false});video.srcObject=stream;await video.play();cameraBtn.disabled=true;enrollBtn.disabled=!modelReady;status.textContent='Old kamera faol';ensureMonitor()}catch(e){status.textContent='Kamera xatosi: '+(e?.name||'Error')+' '+(e?.message||e)}}
async function detect(){if(!modelReady||!stream||video.readyState<2)return[];return faceapi.detectAllFaces(video,new faceapi.TinyFaceDetectorOptions({inputSize:160,scoreThreshold:.55})).withFaceLandmarks().withFaceDescriptors()}
async function enroll(){const samples=[];enrollBtn.disabled=true;status.textContent='Kameraga to‘g‘ri qarang…';for(let tries=0;tries<60&&samples.length<7;tries++){await new Promise(r=>setTimeout(r,300));const f=await detect().catch(()=>[]);if(f.length!==1){status.textContent=f.length?'Kadrda faqat siz bo‘ling':'Yuz topilmadi';continue}const a=attention(f[0]);if(!a.eyesOpen){status.textContent='Ko‘zlaringizni oching';continue}if(!a.frontal){status.textContent='Telefon ekraniga to‘g‘ri qarang';continue}samples.push(Array.from(f[0].descriptor));status.textContent='Owner namunasi '+samples.length+'/7'}if(samples.length<7){status.textContent='Ro‘yxatdan o‘tish tugamadi. Qayta urinib ko‘ring.';enrollBtn.disabled=false;return}owner=avg(samples);saveOwner(owner);status.textContent='Owner ro‘yxatdan o‘tdi';enrollBtn.disabled=false;ensureMonitor()}
cameraBtn.onclick=startCamera; enrollBtn.onclick=enroll;

function activeChat(){const nodes=[...document.querySelectorAll('.chat.tabs-tab,.chat')];const visible=nodes.filter(el=>{const r=el.getBoundingClientRect();const st=getComputedStyle(el);return r.width>120&&r.height>200&&st.display!=='none'&&st.visibility!=='hidden'});return visible[visible.length-1]||null}
function ensureOverlay(chat){let ov=chat.querySelector(':scope > .op-chat-overlay');if(!ov){ov=document.createElement('div');ov.className='op-chat-overlay';ov.innerHTML='<div class="box"><div class="big">🔒</div><h2>Maxfiy chat</h2><div class="op-reason">Yuz + ko‘z + qarash tekshirilmoqda…</div></div>';chat.appendChild(ov)}return ov}
function shouldProtect(){return !!protectedRoute && routeKey()===protectedRoute}
function applyLock(reason){currentLocked=true;const chat=activeChat();if(!chat||!shouldProtect())return;const ov=ensureOverlay(chat);chat.classList.add('op-protected-lock');ov.classList.remove('hidden');const r=ov.querySelector('.op-reason');if(r)r.textContent=reason||'Chat yopiq'}
function applyUnlock(){currentLocked=false;const chat=activeChat();if(!chat||!shouldProtect())return;const ov=ensureOverlay(chat);chat.classList.remove('op-protected-lock');ov.classList.add('hidden')}
function refreshProtection(){const chat=activeChat();document.querySelectorAll('.chat.op-protected-lock').forEach(x=>{if(x!==chat)x.classList.remove('op-protected-lock')});document.querySelectorAll('.op-chat-overlay').forEach(x=>{if(x.parentElement!==chat)x.classList.add('hidden')});if(!shouldProtect())return;if(!owner)applyLock('Owner ro‘yxatdan o‘tmagan');else if(!stream)applyLock('Owner Presence: kamerani yoqing');else if(currentLocked)applyLock('Yuz + ko‘z + qarash tekshirilmoqda…')}

protectBtn.onclick=()=>{const chat=activeChat();if(!chat){status.textContent='Avval Telegramda chatni oching';return}protectedRoute=routeKey();localStorage.setItem(KEY_PROTECTED,protectedRoute);status.textContent='Joriy chat himoyalandi: '+protectedRoute;currentLocked=true;refreshProtection();ensureMonitor()};
unprotectBtn.onclick=()=>{protectedRoute='';localStorage.removeItem(KEY_PROTECTED);document.querySelectorAll('.chat.op-protected-lock').forEach(x=>x.classList.remove('op-protected-lock'));document.querySelectorAll('.op-chat-overlay').forEach(x=>x.remove());status.textContent='Chat himoyasi olib tashlandi'};

async function monitor(){if(monitoring)return;monitoring=true;while(true){const started=performance.now();try{if(!shouldProtect()){good=0;noFaceAt=0}else if(document.hidden){applyLock('Telegram oynasi yashirildi')}else if(!owner){applyLock('Owner ro‘yxatdan o‘tmagan')}else if(!stream||stream.getVideoTracks()[0]?.readyState!=='live'){applyLock('Kamera ishlamayapti')}else{const f=await detect(),now=performance.now();if(!f.length){setPill(faceP,false);setPill(eyesP,false);setPill(lookP,false);good=0;if(!noFaceAt)noFaceAt=now;if(now-noFaceAt>=NO_FACE_MS)applyLock('Yuz ko‘rinmayapti')}else if(f.length>1){noFaceAt=0;good=0;applyLock('Bir nechta yuz aniqlandi')}else{noFaceAt=0;const ownerOk=dist(owner,Array.from(f[0].descriptor))<=THRESHOLD,a=attention(f[0]);setPill(faceP,ownerOk);setPill(eyesP,a.eyesOpen);setPill(lookP,a.frontal);faceP.textContent=ownerOk?'🙂 Owner':'🙂 Boshqa yuz';eyesP.textContent=a.eyesOpen?'👁 Ko‘zlar ochiq':'👁 Ko‘zlar yopiq';lookP.textContent=a.frontal?'🎯 Qarash OK':'🎯 Chetga qarash';if(!ownerOk){eyesClosedAt=0;good=0;applyLock('Boshqa yuz aniqlandi')}else if(!a.eyesOpen){good=0;if(!eyesClosedAt)eyesClosedAt=now;if(now-eyesClosedAt>EYE_CLOSE_GRACE)applyLock('Ko‘zlaringizni oching')}else if(!a.frontal){eyesClosedAt=0;good=0;applyLock('Telefon ekraniga qarang')}else{eyesClosedAt=0;good++;if(good>=GOOD_FRAMES)applyUnlock()}}}}catch(e){applyLock('Face engine xatosi');debug.textContent=String(e?.message||e)}refreshProtection();await new Promise(r=>setTimeout(r,Math.max(30,LOOP_MS-(performance.now()-started))))}}
function ensureMonitor(){monitor()}

let remountQueued=false;
const mo=new MutationObserver(()=>{
  if(remountQueued) return;
  remountQueued=true;
  requestAnimationFrame(()=>{
    remountQueued=false;
    mountOwnerUi();
    refreshProtection();
  });
});
mo.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{good=0;currentLocked=true;setTimeout(refreshProtection,50)});
window.addEventListener('popstate',()=>{good=0;currentLocked=true;setTimeout(refreshProtection,50)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)applyLock('Telegram oynasi yashirildi')});
window.addEventListener('blur',()=>applyLock('Oyna fokusdan chiqdi'));
debug.textContent=VERSION+' · secure='+window.isSecureContext+' · route='+routeKey();
owner=loadOwner(); loadModels(); setInterval(()=>{
  if(!document.documentElement.contains(fab)||!document.documentElement.contains(panel)) mountOwnerUi();
  refreshProtection();
},1000);
})();