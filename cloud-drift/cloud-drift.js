/*!
 * Cloud Drift (구름 위 드리프트) — 쉬는시간 오락실
 * https://smile-willow.tistory.com
 * 외부 라이브러리 없는 WebGL2 원버튼 드리프트 게임. 블로그 글에 아래처럼 넣으면 됩니다.
 *   <div id="cloud-drift-game"></div>
 *   <script src="https://breaktime-arcade.github.io/cloud-drift/cloud-drift.js"></script>
 * div가 없으면 script 태그 바로 위치에 게임 박스를 만듭니다.
 */
(function(){
'use strict';
var me=document.currentScript;
var CSS=".cdg{--coral:#ff6f61;--coral-d:#d94f45;--ink:#3b3557;--glass:rgba(255,255,255,.8);position:relative;width:100%;max-width:760px;height:min(680px,82vh);min-height:460px;margin:24px auto;overflow:hidden;border-radius:16px;background:#cfe7ff;color:var(--ink);font-family:system-ui,-apple-system,\"Apple SD Gothic Neo\",\"Malgun Gothic\",\"Noto Sans KR\",sans-serif;font-size:16px;line-height:1.4;text-align:left;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;outline:none;box-shadow:0 10px 30px rgba(59,53,87,.15)}\n.cdg *,.cdg *::before,.cdg *::after{box-sizing:border-box}\n\n.cdg.cdg-fs{position:fixed;inset:0;width:100%;max-width:none;height:100%;min-height:0;margin:0;border-radius:0;z-index:2147483000}\n.cdg:fullscreen{width:100%;max-width:none;height:100%;margin:0;border-radius:0}\n.cdg canvas{position:absolute;inset:0;width:100%!important;height:100%!important;max-width:none;display:block;margin:0;padding:0;border:0}\n.cdg .cdg-ui{position:absolute;inset:0;pointer-events:none}\n.cdg .cdg-top{position:absolute;left:0;right:0;top:0;padding:12px 14px 0;display:flex;justify-content:space-between;align-items:center;gap:8px}\n.cdg .cdg-btns{display:flex;gap:8px}\n.cdg .cdg-score-box{position:absolute;left:50%;top:8px;transform:translateX(-50%);text-align:center;transition:opacity .3s}\n.cdg .cdg-score{font-size:clamp(40px,9vmin,72px);font-weight:900;color:#fff;line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 3px 0 rgba(59,53,87,.22),0 8px 22px rgba(59,53,87,.16)}\n.cdg .cdg-best{font-size:13px;font-weight:800;color:rgba(59,53,87,.55);margin-top:4px}\n.cdg.menu .cdg-score-box{opacity:0}\n.cdg .cdg-coinbox{display:flex;align-items:center;gap:7px;background:var(--glass);padding:6px 13px 6px 8px;border-radius:999px;font-weight:900;font-size:16px;font-variant-numeric:tabular-nums;box-shadow:0 4px 14px rgba(59,53,87,.12)}\n.cdg .cdg-coin{display:inline-block;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff6b8,#ffd84a 48%,#e8a91c);box-shadow:inset 0 0 0 2px #e8a91c}\n.cdg .cdg-coinbox.pop{animation:cdgPop .25s ease-out}\n@keyframes cdgPop{50%{transform:scale(1.15)}}\n.cdg .cdg-icon{pointer-events:auto;appearance:none;-webkit-appearance:none;margin:0;padding:0;width:40px;height:40px;border:0;border-radius:50%;background:var(--glass);font-size:17px;line-height:40px;text-align:center;color:var(--ink);cursor:pointer;box-shadow:0 4px 14px rgba(59,53,87,.12)}\n.cdg button:focus-visible{outline:3px solid var(--ink);outline-offset:3px}\n.cdg .cdg-panel{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;opacity:0;visibility:hidden;transition:opacity .35s,visibility .35s}\n.cdg .cdg-panel.show{opacity:1;visibility:visible}\n.cdg .cdg-menu{justify-content:space-between;padding:76px 20px 9%}\n.cdg .cdg-head{display:flex;flex-direction:column;align-items:center;gap:14px}\n.cdg .cdg-title{font-size:clamp(50px,13vmin,100px);font-weight:900;line-height:.86;text-align:center;color:#fff;letter-spacing:-.03em;transform:rotate(-5deg);text-shadow:0 5px 0 var(--coral),0 9px 0 var(--coral-d),0 18px 30px rgba(217,79,69,.3)}\n.cdg .cdg-sub{font-weight:800;font-size:17px;opacity:.75}\n.cdg .cdg-how{background:var(--glass);padding:12px 20px;border-radius:18px;text-align:center;font-weight:700;font-size:15px;line-height:1.65}\n.cdg .cdg-how small{display:block;font-weight:600;opacity:.6;font-size:12.5px}\n.cdg .cdg-tap{font-weight:900;font-size:19px;color:#fff;background:var(--coral);padding:15px 34px;border-radius:999px;box-shadow:0 6px 0 var(--coral-d),0 14px 26px rgba(217,79,69,.3);animation:cdgPulse 1.2s ease-in-out infinite}\n@keyframes cdgPulse{50%{transform:translateY(-3px) scale(1.05)}}\n.cdg .cdg-over{justify-content:center;padding:20px}\n.cdg .cdg-card{background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-radius:28px;padding:22px 34px 24px;text-align:center;box-shadow:0 22px 50px rgba(59,53,87,.2);transform:translateY(24px) scale(.94);transition:transform .45s cubic-bezier(.2,1.5,.4,1);min-width:240px}\n.cdg .cdg-panel.show .cdg-card{transform:none}\n.cdg .ovT{font-weight:900;font-size:20px;opacity:.6}\n.cdg .ovS{font-weight:900;font-size:64px;line-height:1.05;color:var(--coral);font-variant-numeric:tabular-nums}\n.cdg .ovB{font-weight:800;font-size:14px;opacity:.6}\n.cdg .ovN{display:none;margin:8px auto 0;width:max-content;background:#ffd84a;color:#6b4a00;font-weight:900;font-size:13px;padding:4px 12px;border-radius:999px}\n.cdg .ovN.on{display:block;animation:cdgPop .5s ease-out 2}\n.cdg .ovC{margin-top:12px;display:flex;justify-content:center;align-items:center;gap:7px;font-weight:800}\n.cdg .cdg-retry{pointer-events:auto;appearance:none;-webkit-appearance:none;margin:18px 0 0;border:0;font:inherit;font-weight:900;font-size:18px;line-height:1.2;color:#fff;background:var(--coral);padding:14px 34px;border-radius:999px;box-shadow:0 5px 0 var(--coral-d);cursor:pointer}\n.cdg .cdg-retry:active{transform:translateY(3px);box-shadow:0 2px 0 var(--coral-d)}\n.cdg .cdg-hint{margin-top:10px;font-size:12px;font-weight:600;opacity:.5}\n.cdg .cdg-toast{position:absolute;left:50%;top:24%;transform:translateX(-50%);font-weight:900;font-size:clamp(28px,6.5vmin,46px);color:#fff;text-align:center;white-space:nowrap;opacity:0;text-shadow:0 3px 0 #ff8fb6,0 8px 18px rgba(255,111,170,.4)}\n.cdg .cdg-toast small{display:block;font-size:.45em;color:#ff6f9e;text-shadow:none}\n.cdg .cdg-toast.go{animation:cdgToast .95s ease-out}\n@keyframes cdgToast{0%{opacity:0;transform:translate(-50%,12px) scale(.6)}15%{opacity:1;transform:translate(-50%,0) scale(1.15)}30%{transform:translate(-50%,0) scale(1)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-26px)}}\n.cdg .cdg-err{display:none;position:absolute;inset:0;align-items:center;justify-content:center;text-align:center;padding:30px;font-weight:700;line-height:1.6}\n@media (max-width:480px){.cdg{height:min(640px,78vh);border-radius:12px}}\n@media (prefers-reduced-motion:reduce){.cdg .cdg-tap,.cdg .ovN.on,.cdg .cdg-coinbox.pop{animation:none}}";
var HTML="<canvas data-r=\"gl\"></canvas>\n<div class=\"cdg-ui\">\n  <div class=\"cdg-top\">\n    <div class=\"cdg-btns\"><button class=\"cdg-icon\" data-r=\"mute\" aria-label=\"소리 켜기/끄기\">🔊</button><button class=\"cdg-icon\" data-r=\"fs\" aria-label=\"전체화면\">⛶</button></div>\n    <div class=\"cdg-coinbox\" data-r=\"coinBox\"><span class=\"cdg-coin\"></span><span data-r=\"coins\">0</span></div>\n  </div>\n  <div class=\"cdg-score-box\"><div class=\"cdg-score\" data-r=\"score\">0</div><div class=\"cdg-best\" data-r=\"best\">최고 0</div></div>\n  <div class=\"cdg-toast\" data-r=\"toast\"></div>\n  <div class=\"cdg-panel cdg-menu show\" data-r=\"menu\">\n    <div class=\"cdg-head\">\n      <div class=\"cdg-title\">Cloud<br>Drift</div>\n      <div class=\"cdg-sub\">구름 위 드리프트</div>\n      <div class=\"cdg-how\">누르고 있으면 드리프트, 떼면 직진<small>PC 스페이스바·클릭 / 모바일 화면 터치</small></div>\n    </div>\n    <div class=\"cdg-tap\">눌러서 출발</div>\n  </div>\n  <div class=\"cdg-panel cdg-over\" data-r=\"over\">\n    <div class=\"cdg-card\">\n      <div class=\"ovT\">추락했어요</div>\n      <div class=\"ovS\" data-r=\"ovScore\">0</div>\n      <div class=\"ovB\" data-r=\"ovBest\">최고 0</div>\n      <div class=\"ovN\" data-r=\"ovNew\">최고 기록 경신!</div>\n      <div class=\"ovC\"><span class=\"cdg-coin\"></span>이번 주행 +<span data-r=\"ovCoins\">0</span></div>\n      <button class=\"cdg-retry\" data-r=\"retry\">다시 달리기</button>\n      <div class=\"cdg-hint\">스페이스바나 화면을 눌러도 다시 시작해요</div>\n    </div>\n  </div>\n  <div class=\"cdg-err\" data-r=\"err\">이 브라우저는 WebGL2를 지원하지 않아 게임을 실행할 수 없어요.<br>최신 Chrome, Safari, Edge에서 열어 주세요.</div>\n</div>";
function boot(){
  var root=document.getElementById('cloud-drift-game');
  if(root&&root.dataset.cdgReady)return;
  if(!root){root=document.createElement('div');root.id='cloud-drift-game';
    if(me&&me.parentNode)me.parentNode.insertBefore(root,me);else document.body.appendChild(root);}
  root.dataset.cdgReady='1';
  if(!document.getElementById('cdg-style')){var st=document.createElement('style');st.id='cdg-style';st.textContent=CSS;document.head.appendChild(st);}
  root.className='cdg menu';root.tabIndex=0;root.setAttribute('role','application');root.setAttribute('aria-label','Cloud Drift 게임');
  root.innerHTML=HTML;
  game(root);
}
function game(root){

/* ================= 공용 유틸 ================= */
const TAU=Math.PI*2, HALF=Math.PI/2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const hex=h=>{const n=parseInt(h.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
const easeOutBack=k=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(k-1,3)+c1*Math.pow(k-1,2);};

/* ================= 게임 로직 (렌더링과 분리) ================= */
const CFG={
  startW:4.2, minW:2.8, diffDist:1600,      // 트랙 폭과 난이도 도달 거리
  speed0:6.5, speedMax:12.5, speedK:800,    // 속도 곡선
  slabDepth:2.6, riseDist:34, riseTime:0.55, riseFrom:-16,
  assist:0.42, alignRate:2.4,               // 손 뗐을 때 직선 보정
  gripHold:4.5, gripFree:7.5                // 미끄러짐(드리프트) 정도
};
const THEMES=[
  {a:hex('#e3f2ff'),b:hex('#a9d6f7'),s:hex('#7fb8e8')},
  {a:hex('#ffe6f0'),b:hex('#ffb8d2'),s:hex('#ee8fb6')},
  {a:hex('#e4fff4'),b:hex('#a3ebcb'),s:hex('#6dcfa6')},
  {a:hex('#efe8ff'),b:hex('#c6b5f7'),s:hex('#9f8ae0')},
  {a:hex('#fff1de'),b:hex('#ffcc9e'),s:hex('#f0a56e')}
];
const G={
  state:'menu', segs:[], coins:[], cur:0, time:0,
  gen:{x:0,y:-10,dir:0,path:0,count:0,nextW:4.2},
  car:{x:0,y:-6,h:0,theta:0,phi:0,vx:0,vz:0,vy:0,roll:0,pitch:0,spinX:0,spinZ:0},
  holding:false, waitRelease:false, turnDir:1, holdAngle:0, pressSeg:null,
  dist:0, bonus:0, combo:0, perfectT:0, runCoins:0, fallT:0
};
const speedAt=d=>CFG.speed0+(CFG.speedMax-CFG.speed0)*(1-Math.exp(-d/CFG.speedK));
const widthAt=p=>Math.round(lerp(CFG.startW,CFG.minW,Math.min(1,p/CFG.diffDist))*10)/10;
const nearestAxis=th=>th<Math.PI/4?0:HALF;
const inRect=(s,x,y)=>x>=s.x0&&x<=s.x1&&y>=s.y0&&y<=s.y1;
const rectDist=(s,x,y)=>Math.hypot(Math.max(s.x0-x,0,x-s.x1),Math.max(s.y0-y,0,y-s.y1));
const scoreNow=()=>Math.floor(G.dist+G.bonus);

function addSeg(){
  const g=G.gen, first=g.count===0, W=g.nextW, t=Math.min(1,g.path/CFG.diffDist);
  // 최소 길이는 속도에 비례: 직전 코너를 빠져나와 자세를 잡을 시간 확보
  const v=speedAt(g.path*1.05), Lmin=Math.max(W+1.6,v*0.6+1.5,8-4*t);
  const L=first?18:Math.round(rand(Lmin,Lmin+lerp(10,6,t)));
  const Wn=widthAt(g.path+L), sx=g.x, sy=g.y, dir=g.dir;
  const ex=dir===1?sx+L:sx, ey=dir===0?sy+L:sy;
  // 직사각형 영역: 시작 코너 사각형 포함, 끝 코너는 다음 구간 소속(겹침 없음)
  const r=dir===0?{x0:sx-W/2,x1:sx+W/2,y0:sy-W/2,y1:ey-Wn/2}:{x0:sx-W/2,x1:ex-Wn/2,y0:sy-W/2,y1:sy+W/2};
  const seg=Object.assign({sx,sy,ex,ey,dir,L,W,theme:THEMES[Math.floor(g.count/9)%THEMES.length],
    pathStart:g.path,first,yOff:CFG.riseFrom,vy:0,st:'wait',t:0,mesh:null,extra:null},r);
  G.segs.push(seg); hooks.segCreated(seg);
  if(!first&&Math.random()<0.6){
    const n=1+Math.floor(Math.random()*3), off=Math.random()<0.3?rand(-W*0.22,W*0.22):0;
    for(let k=0;k<n;k++){
      const s=W/2+1.4+k*1.4; if(s>L-Wn/2-0.8)break;
      G.coins.push({x:dir===0?sx+off:sx+s,y:dir===0?sy+s:sy+off,seg,taken:false,ph:Math.random()*TAU});
    }
  }
  g.x=ex; g.y=ey; g.dir=1-dir; g.path+=L; g.count++; g.nextW=Wn;
}
function findSeg(x,y){
  const s=G.segs;
  for(let i=Math.max(0,G.cur-1);i<Math.min(s.length,G.cur+4);i++){
    const q=s[i]; if(q.st==='fall'||q.st==='wait')continue;
    if(inRect(q,x,y))return i;
  }
  return -1;
}
function resetLogic(){
  for(const s of G.segs)hooks.segRemoved(s);
  G.segs=[];G.coins=[];G.cur=0;
  Object.assign(G.gen,{x:0,y:-10,dir:0,path:0,count:0,nextW:CFG.startW});
  while(G.gen.path<80)addSeg();
  Object.assign(G.car,{x:0,y:-6,h:0,theta:0,phi:0,vx:0,vz:0,vy:0,roll:0,pitch:0,spinX:0,spinZ:0});
  for(const s of G.segs)if(rectDist(s,0,-6)<CFG.riseDist){s.st='idle';s.yOff=0;}
  Object.assign(G,{holding:false,waitRelease:false,dist:0,bonus:0,combo:0,perfectT:0,runCoins:0,fallT:0,pressSeg:null});
}
function beginHold(){
  const c=G.car, target=nearestAxis(c.theta)===0?HALF:0;
  G.turnDir=target>c.theta?1:-1; G.holding=true; G.holdAngle=0; G.pressSeg=G.segs[G.cur];
}
function endHold(){
  if(!G.holding)return;
  G.holding=false;
  if(G.holdAngle>0.8)G.perfectT=0.32;
}
function evalPerfect(){
  const s=G.segs[G.cur], c=G.car;
  if(!s||s===G.pressSeg){G.combo=0;return;}
  const ax=s.dir===0?0:HALF, lat=s.dir===0?c.x-s.sx:c.y-s.sy;
  if(Math.abs(c.theta-ax)<0.08&&Math.abs(lat)<s.W*0.17){
    G.combo=Math.min(G.combo+1,9); const b=5*G.combo; G.bonus+=b; hooks.perfect(G.combo,b);
  } else G.combo=0;
}
function stepCar(dt){
  const c=G.car, sp=speedAt(G.dist), om=2.0+0.3*sp;
  if(G.holding){c.theta+=G.turnDir*om*dt;G.holdAngle+=om*dt;}
  else{
    const d=nearestAxis(c.theta)-c.theta;
    if(Math.abs(d)<CFG.assist){const m=CFG.alignRate*dt;c.theta+=clamp(d,-m,m);}
  }
  c.phi+=(c.theta-c.phi)*Math.min(1,(G.holding?CFG.gripHold:CFG.gripFree)*dt);
  c.vx=Math.sin(c.phi)*sp; c.vz=Math.cos(c.phi)*sp;
  c.x+=c.vx*dt; c.y+=c.vz*dt; G.dist+=sp*dt;
  const i=findSeg(c.x,c.y);
  if(i<0){startFall();return;}
  if(i!==G.cur){
    G.cur=i;
    for(let j=0;j<i-1;j++){const s=G.segs[j];if(s.st!=='fall'){s.st='fall';s.vy=rand(-2,0);}}
  }
  c.h=G.segs[i].yOff;
  for(const k of G.coins){
    if(k.taken)continue;
    const dx=k.x-c.x, dy=k.y-c.y;
    if(dx*dx+dy*dy<0.8){k.taken=true;G.runCoins++;hooks.coin(k);}
  }
  if(G.perfectT>0){G.perfectT-=dt;if(G.perfectT<=0&&!G.holding)evalPerfect();}
}
function startFall(){
  G.state='falling'; G.holding=false; G.fallT=0;
  const c=G.car, sg=()=>Math.random()<0.5?-1:1;
  c.vy=2.5; c.spinX=rand(2,4)*sg(); c.spinZ=rand(2,5)*sg();
  hooks.fall();
}
function stepFall(dt){
  const c=G.car; G.fallT+=dt;
  c.vy-=30*dt; c.h+=c.vy*dt; c.x+=c.vx*dt*0.9; c.y+=c.vz*dt*0.9;
  c.pitch+=c.spinX*dt; c.roll+=c.spinZ*dt;
  if(G.fallT>1.15&&G.state==='falling')hooks.gameOver();
}
function updateLogic(dt){
  G.time+=dt;
  const c=G.car;
  for(const s of G.segs){
    if(s.st==='wait'){if(rectDist(s,c.x,c.y)<CFG.riseDist){s.st='rise';s.t=0;}}
    else if(s.st==='rise'){s.t+=dt;const k=Math.min(1,s.t/CFG.riseTime);s.yOff=CFG.riseFrom*(1-easeOutBack(k));if(k>=1){s.st='idle';s.yOff=0;}}
    else if(s.st==='fall'){s.vy-=28*dt;s.yOff+=s.vy*dt;}
  }
  while(G.segs.length&&G.segs[0].st==='fall'&&G.segs[0].yOff<-40){
    const s=G.segs.shift(); hooks.segRemoved(s); G.cur--; G.coins=G.coins.filter(k=>k.seg!==s);
  }
  if(G.state==='play')stepCar(dt);
  else if(G.state==='falling')stepFall(dt);
  const cs=G.segs[G.cur];
  if(cs)while(G.gen.path-cs.pathStart<80)addSeg();
}
/* ==LOGIC END== */

/* ================= WebGL2 ================= */
const $=id=>root.querySelector('[data-r="'+id+'"]');
const canvas=$('gl');
const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
const hooks={segCreated(){},segRemoved(){},coin(){},perfect(){},fall(){},gameOver(){}};
if(!gl){$('err').style.display='flex';$('menu').classList.remove('show');}
else main();

function main(){
/* ---- 행렬 ---- */
function m4(){const m=new Float32Array(16);m[0]=m[5]=m[10]=m[15]=1;return m;}
function mmul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function mT(x,y,z){const m=m4();m[12]=x;m[13]=y;m[14]=z;return m;}
function mRY(a){const m=m4(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}
function mRX(a){const m=m4(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;}
function mRZ(a){const m=m4(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;}
function mS(x,y=x,z=x){const m=m4();m[0]=x;m[5]=y;m[10]=z;return m;}
function model(x,y,z,yaw=0,pitch=0,roll=0,s=1){let m=mT(x,y,z);if(yaw)m=mmul(m,mRY(yaw));if(pitch)m=mmul(m,mRX(pitch));if(roll)m=mmul(m,mRZ(roll));if(s!==1)m=mmul(m,mS(s));return m;}
function ortho(l,r,b,t,n,f){const m=new Float32Array(16);m[0]=2/(r-l);m[5]=2/(t-b);m[10]=-2/(f-n);m[12]=-(r+l)/(r-l);m[13]=-(t+b)/(t-b);m[14]=-(f+n)/(f-n);m[15]=1;return m;}
function lookAt(e,t,u){
  let z=[e[0]-t[0],e[1]-t[1],e[2]-t[2]],l=Math.hypot(...z);z=z.map(v=>v/l);
  let x=[u[1]*z[2]-u[2]*z[1],u[2]*z[0]-u[0]*z[2],u[0]*z[1]-u[1]*z[0]];l=Math.hypot(...x);x=x.map(v=>v/l);
  const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]],m=new Float32Array(16);
  m[0]=x[0];m[4]=x[1];m[8]=x[2];m[1]=y[0];m[5]=y[1];m[9]=y[2];m[2]=z[0];m[6]=z[1];m[10]=z[2];
  m[12]=-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]);m[13]=-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]);m[14]=-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]);m[15]=1;return m;
}
const I4=m4();

/* ---- 셰이더 ---- */
const SKY=`vec3 sky(float t){
  vec3 c=mix(vec3(1.0,0.87,0.93),vec3(0.80,0.91,1.0),smoothstep(0.0,0.55,t));
  return mix(c,vec3(0.53,0.79,0.96),smoothstep(0.5,1.0,t));}`;
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function program(vs,fs){
  const p=gl.createProgram();
  gl.attachShader(p,compile(gl.VERTEX_SHADER,'#version 300 es\n'+vs));
  gl.attachShader(p,compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;\n'+fs));
  gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name]=gl.getUniformLocation(p,a.name);}
  return{p,u};
}
const skyP=program(
`void main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);gl_Position=vec4(p,0.,1.);}`,
`uniform vec2 uRes;out vec4 o;${SKY}
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 c=sky(uv.y);
float d=length((uv-vec2(0.82,0.86))*vec2(uRes.x/uRes.y,1.));
c+=vec3(1.,.93,.84)*(exp(-d*d*10.)*.16+exp(-d*d*120.)*.14);
c+=(h(gl_FragCoord.xy)-.5)/255.;o=vec4(c,1.);}`);
const litP=program(
`layout(location=0)in vec3 aP;layout(location=1)in vec3 aN;layout(location=2)in vec3 aA;layout(location=3)in vec3 aB;
uniform mat4 uVP,uM;out vec3 vW,vN,vA,vB;
void main(){vec4 w=uM*vec4(aP,1.);vW=w.xyz;vN=mat3(uM)*aN;vA=aA;vB=aB;gl_Position=uVP*w;}`,
`in vec3 vW,vN,vA,vB;out vec4 o;
uniform vec3 uL;uniform vec2 uRes;uniform float uCell,uRim,uYOff,uEmis,uFogD;${SKY}
void main(){vec3 n=normalize(vN);vec3 base=vA;
if(uCell>0.){
  if(n.y>.5){vec2 g=floor(vW.xz/uCell);base=mix(vA,vB,mod(g.x+g.y,2.));}
  else if(uRim>0.&&vW.y>uYOff-uRim)base=mix(base,vec3(1.),.72);
}
float d=max(dot(n,uL),0.);
vec3 hemi=mix(vec3(.74,.70,.86),vec3(1.),n.y*.5+.5);
vec3 c=base*(hemi*.62+d*.55);c=mix(c,base,uEmis);
float f=smoothstep(0.,1.,clamp(-vW.y/uFogD,0.,1.));
c=mix(c,sky(gl_FragCoord.y/uRes.y),f);o=vec4(c,1.);}`);
const decalP=program(
`layout(location=0)in vec3 aP;layout(location=1)in vec2 aD;uniform mat4 uVP,uM;uniform float uTime,uLife;out float vA;
void main(){vA=uLife>0.?aD.x*clamp(1.-(uTime-aD.y)/uLife,0.,1.):aD.x;gl_Position=uVP*uM*vec4(aP,1.);}`,
`in float vA;uniform vec3 uColor;out vec4 o;void main(){o=vec4(uColor,vA);}`);
const partP=program(
`layout(location=0)in vec3 aP;layout(location=1)in float aS;layout(location=2)in vec4 aC;uniform mat4 uVP;uniform float uPx;out vec4 vC;
void main(){gl_Position=uVP*vec4(aP,1.);gl_PointSize=aS*uPx;vC=aC;}`,
`in vec4 vC;out vec4 o;void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;o=vec4(vC.rgb,vC.a*(1.-smoothstep(.25,1.,r)));}`);

/* ---- 메쉬 빌더 ---- */
class MB{
  constructor(){this.d=[];}
  v(p,n,a,b){this.d.push(p[0],p[1],p[2],n[0],n[1],n[2],a[0],a[1],a[2],b[0],b[1],b[2]);}
  triN(p0,p1,p2,n,a,b=a){this.v(p0,n,a,b);this.v(p1,n,a,b);this.v(p2,n,a,b);}
  quadN(p0,p1,p2,p3,n,a,b=a){this.triN(p0,p1,p2,n,a,b);this.triN(p0,p2,p3,n,a,b);}
  tri(p0,p1,p2,col,ctr){
    const u=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]],w=[p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]];
    let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];const l=Math.hypot(...n);if(l<1e-9)return;
    n=n.map(v=>v/l);const cx=(p0[0]+p1[0]+p2[0])/3-ctr[0],cy=(p0[1]+p1[1]+p2[1])/3-ctr[1],cz=(p0[2]+p1[2]+p2[2])/3-ctr[2];
    if(n[0]*cx+n[1]*cy+n[2]*cz<0)n=n.map(v=>-v);this.triN(p0,p1,p2,n,col);
  }
  box(cx,cy,cz,sx,sy,sz,side,ta=side,tb=ta){
    const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
    this.quadN([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],[0,1,0],ta,tb);
    this.quadN([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0],side);
    this.quadN([x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1],[-1,0,0],side);
    this.quadN([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],side);
    this.quadN([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1],side);
  }
  ellip(cx,cy,cz,rx,ry,rz,col,lat=5,lon=9){
    const P=(i,j)=>{const t=i/lat*Math.PI,p=j/lon*TAU;return[cx+rx*Math.sin(t)*Math.cos(p),cy+ry*Math.cos(t),cz+rz*Math.sin(t)*Math.sin(p)];};
    const c=[cx,cy,cz];
    for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){const a=P(i,j),b=P(i+1,j),d=P(i+1,j+1),e=P(i,j+1);this.tri(a,b,d,col,c);this.tri(a,d,e,col,c);}
  }
  disc(r,h,n,cap,side){
    for(let k=0;k<n;k++){
      const a0=k/n*TAU,a1=(k+1)/n*TAU,x0=Math.cos(a0)*r,y0=Math.sin(a0)*r,x1=Math.cos(a1)*r,y1=Math.sin(a1)*r,am=(a0+a1)/2;
      this.triN([0,0,h],[x0,y0,h],[x1,y1,h],[0,0,1],cap);
      this.triN([0,0,-h],[x1,y1,-h],[x0,y0,-h],[0,0,-1],cap);
      this.quadN([x0,y0,-h],[x1,y1,-h],[x1,y1,h],[x0,y0,h],[Math.cos(am),Math.sin(am),0],side);
    }
  }
  build(){return makeMesh(new Float32Array(this.d));}
}
function makeMesh(arr){
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);
  for(let i=0;i<4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,48,i*12);}
  gl.bindVertexArray(null);return{vao,buf,n:arr.length/12};
}
function freeMesh(m){gl.deleteBuffer(m.buf);gl.deleteVertexArray(m.vao);}
function dynVAO(sizes,bytes,usage){
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,bytes,usage);
  const stride=sizes.reduce((a,b)=>a+b,0)*4;let off=0;
  sizes.forEach((s,i)=>{gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,s,gl.FLOAT,false,stride,off);off+=s*4;});
  gl.bindVertexArray(null);return{vao,buf};
}

/* ---- 모델 ---- */
const C={body:hex('#ff6f61'),dark:hex('#c9453c'),glass:hex('#c4ebff'),white:hex('#ffffff'),tire:hex('#2e2b3a'),
  rim:hex('#dcdcec'),light:hex('#fff3b0'),tail:hex('#ff2f5a'),line:hex('#34304c'),gold:hex('#ffd84a'),goldD:hex('#e8a91c'),goldL:hex('#fff3a8'),cloud:hex('#ffffff')};
const carMesh=(()=>{const m=new MB();
  m.box(0,0.36,0,0.92,0.30,1.72,C.body);
  m.box(0,0.62,-0.12,0.76,0.24,0.92,C.glass);
  m.box(0,0.77,-0.14,0.82,0.07,0.86,C.body);
  m.box(0,0.516,0.5,0.22,0.014,0.66,C.white);
  m.box(0,0.25,0.87,0.96,0.14,0.08,C.white);
  m.box(0,0.25,-0.87,0.96,0.14,0.08,C.white);
  for(const s of[-1,1]){
    m.box(s*0.3,0.42,0.865,0.18,0.09,0.04,C.light);
    m.box(s*0.3,0.42,-0.865,0.18,0.08,0.04,C.tail);
    m.box(s*0.3,0.57,-0.8,0.05,0.14,0.05,C.dark);
    for(const z of[-1,1]){m.box(s*0.44,0.17,z*0.55,0.2,0.34,0.36,C.tire);m.box(s*0.545,0.17,z*0.55,0.02,0.14,0.14,C.rim);}
  }
  m.box(0,0.66,-0.8,0.88,0.04,0.17,C.dark);
  return m.build();})();
const coinMesh=(()=>{const m=new MB();m.disc(0.34,0.06,18,C.gold,C.goldD);m.disc(0.2,0.085,18,C.goldL,C.gold);return m.build();})();
const cloudMeshes=[
  [[0,0,0,2.2,1.1,1.6],[1.8,-0.2,0.3,1.5,0.9,1.2],[-1.7,-0.25,-0.2,1.4,0.8,1.1],[0.4,0.6,-0.3,1.3,0.9,1.0]],
  [[0,0,0,1.8,0.9,1.4],[1.4,-0.15,-0.4,1.2,0.75,1.0],[-0.9,0.35,0.3,1.1,0.8,0.9]],
  [[0,0,0,2.6,1.0,1.8],[-2.0,-0.2,0.2,1.5,0.8,1.2],[2.1,-0.1,-0.1,1.6,0.85,1.2],[0.6,0.55,0.2,1.4,0.9,1.1],[-0.8,0.5,-0.3,1.2,0.7,1.0]]
].map(parts=>{const m=new MB();for(const p of parts)m.ellip(...p,C.cloud);return m.build();});
const shadowMesh=(()=>{const d=[],N=24,P=(a,r,al)=>[Math.sin(a)*0.74*r,0,Math.cos(a)*1.18*r,al,0];
  for(let i=0;i<N;i++){const a0=i/N*TAU,a1=(i+1)/N*TAU,c=[0,0,0,0.42,0],i0=P(a0,0.7,0.34),i1=P(a1,0.7,0.34),o0=P(a0,1,0),o1=P(a1,1,0);
    d.push(...c,...i0,...i1,...i0,...o0,...o1,...i0,...o1,...i1);}
  const v=dynVAO([3,2],new Float32Array(d),gl.STATIC_DRAW);v.n=N*9;return v;})();
const SKMAX=1500, skData=new Float32Array(SKMAX*30), skid=dynVAO([3,2],skData.byteLength,gl.DYNAMIC_DRAW);
let skHead=0, skCount=0;
const PMAX=900, pData=new Float32Array(PMAX*8), pVAO=dynVAO([3,1,4],pData.byteLength,gl.DYNAMIC_DRAW);
const emptyVAO=gl.createVertexArray();

hooks.segCreated=s=>{
  const m=new MB();
  m.box((s.x0+s.x1)/2,-CFG.slabDepth/2,(s.y0+s.y1)/2,s.x1-s.x0,CFG.slabDepth,s.y1-s.y0,s.theme.s,s.theme.a,s.theme.b);
  s.mesh=m.build();
  if(s.first){const e=new MB();e.box(0,0.012,-3.6,s.W,0.024,1.0,C.line,C.line,C.white);s.extra=e.build();}
};
hooks.segRemoved=s=>{if(s.mesh)freeMesh(s.mesh);if(s.extra)freeMesh(s.extra);s.mesh=s.extra=null;};

/* ---- 파티클 / 스키드 ---- */
const parts=[];
function spawn(x,y,z,vx,vy,vz,life,s0,s1,col,a,grav=0){
  if(parts.length>=PMAX)parts[Math.floor(Math.random()*PMAX)]=parts.pop();
  parts.push({x,y,z,vx,vy,vz,life,max:life,s0,s1,r:col[0],g:col[1],b:col[2],a,grav});
}
function addSkid(ax,az,bx,bz,h){
  const dx=bx-ax,dz=bz-az,l=Math.hypot(dx,dz);if(l<1e-3)return;
  const nx=-dz/l*0.1,nz=dx/l*0.1,v=[[ax+nx,az+nz],[ax-nx,az-nz],[bx-nx,bz-nz],[bx+nx,bz+nz]],o=skHead*30;
  [0,1,2,0,2,3].forEach((q,i)=>{const p=v[q];skData[o+i*5]=p[0];skData[o+i*5+1]=h;skData[o+i*5+2]=p[1];skData[o+i*5+3]=0.42;skData[o+i*5+4]=G.time;});
  gl.bindBuffer(gl.ARRAY_BUFFER,skid.buf);gl.bufferSubData(gl.ARRAY_BUFFER,o*4,skData,o,30);
  skHead=(skHead+1)%SKMAX;skCount=Math.min(skCount+1,SKMAX);
}
function clearFx(){parts.length=0;skData.fill(0);gl.bindBuffer(gl.ARRAY_BUFFER,skid.buf);gl.bufferSubData(gl.ARRAY_BUFFER,0,skData);skHead=skCount=0;prevW=null;}
let prevW=null;

/* ---- 사운드 (Web Audio 합성) ---- */
const Snd={ctx:null,master:null,muted:store.get('cd_mute',false),
  init(){
    if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume();return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    try{
      const c=this.ctx=new AC();this.master=c.createGain();this.master.gain.value=this.muted?0:0.7;this.master.connect(c.destination);
      const o=c.createOscillator();o.type='sawtooth';o.frequency.value=50;
      const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=420;
      const g=c.createGain();g.gain.value=0;o.connect(f);f.connect(g);g.connect(this.master);o.start();this.eng={o,g};
      const b=c.createBuffer(1,c.sampleRate,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
      const n=c.createBufferSource();n.buffer=b;n.loop=true;
      const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=1800;bp.Q.value=1.2;
      const sg=c.createGain();sg.gain.value=0;n.connect(bp);bp.connect(sg);sg.connect(this.master);n.start();this.skid=sg;
    }catch(e){this.ctx=null;}
  },
  drive(sp,slip,on){
    if(!this.ctx)return;const t=this.ctx.currentTime;
    this.eng.o.frequency.setTargetAtTime(on?48+sp*5.5+slip*30:40,t,0.08);
    this.eng.g.gain.setTargetAtTime(on?0.05:0,t,0.12);
    this.skid.gain.setTargetAtTime(on?Math.min(1,slip*4)*0.09:0,t,0.05);
  },
  tone(f,dur,type='sine',vol=0.1,delay=0,to=0){
    if(!this.ctx)return;const c=this.ctx,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+dur);
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+0.05);
  },
  coin(){this.tone(1319,0.08,'square',0.045);this.tone(1976,0.16,'square',0.045,0.07);},
  perfect(n){const k=Math.pow(2,Math.min(n-1,7)/12);[784,988,1175,1568].forEach((f,i)=>this.tone(f*k,0.18,'triangle',0.09,i*0.055));},
  start(){this.tone(523,0.12,'triangle',0.1);this.tone(784,0.2,'triangle',0.1,0.1);},
  fall(){this.tone(700,0.9,'sine',0.14,0,90);},
  over(){this.tone(392,0.22,'triangle',0.09);this.tone(294,0.4,'triangle',0.09,0.18);},
  setMute(m){this.muted=m;store.set('cd_mute',m);if(this.master)this.master.gain.setTargetAtTime(m?0:0.7,this.ctx.currentTime,0.02);}
};

/* ---- UI ---- */
const ui={score:$('score'),best:$('best'),coins:$('coins'),coinBox:$('coinBox'),toast:$('toast'),menu:$('menu'),over:$('over'),
  ovScore:$('ovScore'),ovBest:$('ovBest'),ovNew:$('ovNew'),ovCoins:$('ovCoins'),mute:$('mute'),retry:$('retry'),fs:$('fs')};
let best=store.get('cd_best',0), bank=store.get('cd_coins',0), lastScore=-1, overAt=0, shake=0;
ui.best.textContent='최고 '+best;ui.coins.textContent=bank;
ui.mute.textContent=Snd.muted?'🔇':'🔊';

hooks.coin=k=>{
  const y=k.seg.yOff+0.62;
  for(let i=0;i<14;i++){const a=Math.random()*TAU,s=rand(1.5,3.5);spawn(k.x,y,k.y,Math.cos(a)*s,rand(1.5,4),Math.sin(a)*s,rand(0.35,0.6),0.26,0.02,C.gold,1,6);}
  Snd.coin();ui.coins.textContent=bank+G.runCoins;
  ui.coinBox.classList.remove('pop');void ui.coinBox.offsetWidth;ui.coinBox.classList.add('pop');
};
hooks.perfect=(n,b)=>{
  ui.toast.innerHTML=(n>1?'PERFECT ×'+n:'PERFECT')+'<small>+'+b+'</small>';
  ui.toast.classList.remove('go');void ui.toast.offsetWidth;ui.toast.classList.add('go');
  const c=G.car,pal=[hex('#ff8fb6'),hex('#7fd3ff'),hex('#ffd84a'),hex('#9ee8c8'),hex('#c6b5f7')];
  for(let i=0;i<10+n*4;i++){const a=Math.random()*TAU,s=rand(1,3.5);spawn(c.x,c.h+0.8,c.y,Math.cos(a)*s,rand(4,8),Math.sin(a)*s,rand(0.7,1.1),0.22,0.12,pal[i%5],1,12);}
  Snd.perfect(n);
};
hooks.fall=()=>{Snd.fall();shake=0.35;prevW=null;};
hooks.gameOver=()=>{
  G.state='over';overAt=performance.now();
  const sc=scoreNow(),nb=sc>best;
  if(nb){best=sc;store.set('cd_best',best);}
  bank+=G.runCoins;store.set('cd_coins',bank);
  ui.ovScore.textContent=sc;ui.ovBest.textContent='최고 '+best;ui.ovCoins.textContent=G.runCoins;
  ui.ovNew.classList.toggle('on',nb);ui.best.textContent='최고 '+best;
  ui.over.classList.add('show');Snd.over();
};

/* ---- 구름 ---- */
const LAT=[-Math.SQRT1_2,0,Math.SQRT1_2], FWD=[Math.SQRT1_2,0,Math.SQRT1_2];
const clouds=[];
function placeCloud(cl,tx,tz,fRel){
  const l=rand(-26,26);cl.x=tx+FWD[0]*fRel+LAT[0]*l;cl.z=tz+FWD[2]*fRel+LAT[2]*l;
  cl.y=rand(-11,-5);cl.s=rand(0.6,1.4);cl.rot=rand(0,TAU);cl.v=rand(0.15,0.5);cl.m=Math.floor(Math.random()*3);
}
for(let i=0;i<18;i++){const c={};placeCloud(c,0,-6,rand(-35,50));clouds.push(c);}

/* ---- 게임 흐름 ---- */
let camX=0,camZ=-6;
function newRun(){resetLogic();clearFx();camX=G.car.x;camZ=G.car.y;lastScore=-1;}
// wait=true: 누른 손가락/키가 아직 눌려 있는 상태로 시작 → 뗄 때까지 드리프트 무시
// 버튼 click은 이미 손을 뗀 뒤 발생하므로 wait=false로 시작해야 첫 입력이 먹힘
function startGame(wait=true){
  G.state='play';G.waitRelease=wait;root.classList.remove('menu');
  ui.menu.classList.remove('show');ui.over.classList.remove('show');ui.coins.textContent=bank;Snd.start();
}
function restart(wait=true){newRun();startGame(wait);}
function press(){
  Snd.init();
  if(G.state==='menu'){startGame();return;}
  if(G.state==='over'){if(performance.now()-overAt>650)restart();return;}
  if(G.state==='play'&&!G.waitRelease&&!G.holding)beginHold();
}
function release(){G.waitRelease=false;if(G.holding)endHold();}
const isUI=e=>e.target&&e.target.closest&&e.target.closest('button');
root.addEventListener('pointerdown',e=>{if(isUI(e))return;if(e.button!==undefined&&e.button>0)return;e.preventDefault();try{root.focus({preventScroll:true});}catch(_){}press();},{passive:false});
addEventListener('pointerup',release);addEventListener('pointercancel',release);addEventListener('blur',release);
root.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','KeyW','Enter'].includes(e.code)){
    if(e.code==='Enter'&&isUI(e))return;
    e.preventDefault();if(!e.repeat)press();
  }
});
root.addEventListener('keyup',e=>{if(['Space','ArrowUp','KeyW','Enter'].includes(e.code))release();});
root.addEventListener('contextmenu',e=>e.preventDefault());
ui.mute.addEventListener('click',()=>{Snd.init();Snd.setMute(!Snd.muted);ui.mute.textContent=Snd.muted?'🔇':'🔊';ui.mute.blur();});
const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
function toggleFs(){
  if(fsEl()===root){(document.exitFullscreen||document.webkitExitFullscreen).call(document);return;}
  if(root.classList.contains('cdg-fs')){root.classList.remove('cdg-fs');document.documentElement.style.overflow=prevOverflow;return;}
  const req=root.requestFullscreen||root.webkitRequestFullscreen;
  const fallback=()=>{prevOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';root.classList.add('cdg-fs');};
  if(req){try{const p=req.call(root);if(p&&p.catch)p.catch(fallback);}catch(_){fallback();}}else fallback();
}
let prevOverflow='';
ui.fs.addEventListener('click',()=>{toggleFs();ui.fs.blur();try{root.focus({preventScroll:true});}catch(_){}});
root.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('cdg-fs')){root.classList.remove('cdg-fs');document.documentElement.style.overflow=prevOverflow;}});
ui.retry.addEventListener('click',()=>{Snd.init();if(G.state==='over'){restart(false);ui.retry.blur();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){release();if(Snd.ctx)Snd.ctx.suspend();}else if(Snd.ctx)Snd.ctx.resume();});

/* ---- 업데이트 ---- */
const STEP=1/120;
function rearWheels(c){
  const cs=Math.cos(c.theta),sn=Math.sin(c.theta),lz=-0.55;
  return[[c.x+(-0.44)*cs+lz*sn,c.y-(-0.44)*sn+lz*cs],[c.x+0.44*cs+lz*sn,c.y-0.44*sn+lz*cs]];
}
function update(dt){
  updateLogic(dt);
  const c=G.car;
  if(G.state==='play'){
    const slip=Math.abs(c.theta-c.phi), drifting=G.holding||slip>0.07;
    c.roll=lerp(c.roll,G.holding?G.turnDir*0.07:0,1-Math.exp(-10*dt));
    const w=rearWheels(c);
    if(drifting){
      if(prevW){addSkid(prevW[0][0],prevW[0][1],w[0][0],w[0][1],c.h+0.02);addSkid(prevW[1][0],prevW[1][1],w[1][0],w[1][1],c.h+0.02);}
      prevW=w;
      for(const p of w)if(Math.random()<0.45)spawn(p[0],c.h+0.12,p[1],rand(-0.4,0.4)-c.vx*0.08,rand(0.4,1),rand(-0.4,0.4)-c.vz*0.08,rand(0.4,0.7),0.3,0.9,[0.98,0.97,1],0.38,-0.4);
    } else prevW=null;
    const k=1-Math.exp(-5*dt);camX=lerp(camX,c.x,k);camZ=lerp(camZ,c.y,k);
    Snd.drive(speedAt(G.dist),slip,true);
  } else Snd.drive(0,0,false);
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i];p.life-=dt;
    if(p.life<=0){parts[i]=parts[parts.length-1];parts.pop();continue;}
    p.vy-=p.grav*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vx*=0.985;p.vz*=0.985;
  }
  for(const cl of clouds){
    cl.x+=LAT[0]*cl.v*dt;cl.z+=LAT[2]*cl.v*dt;
    const fRel=(cl.x-camX)*FWD[0]+(cl.z-camZ)*FWD[2];
    if(fRel<-38)placeCloud(cl,camX,camZ,rand(46,58));
  }
  shake=Math.max(0,shake-dt);
}

/* ---- 렌더 ---- */
let cw=0,ch=0;
const LDIR=(()=>{const v=[-0.5,1,-0.3],l=Math.hypot(...v);return v.map(x=>x/l);})();
function drawLit(mesh,M,cell=0,rim=0,yOff=0,emis=0,fogD=3){
  const u=litP.u;gl.uniformMatrix4fv(u.uM,false,M);gl.uniform1f(u.uCell,cell);gl.uniform1f(u.uRim,rim);
  gl.uniform1f(u.uYOff,yOff);gl.uniform1f(u.uEmis,emis);gl.uniform1f(u.uFogD,fogD);
  gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.n);
}
function render(){
  const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
  if(w!==cw||h!==ch){cw=canvas.width=w;ch=canvas.height=h;}
  gl.viewport(0,0,cw,ch);
  const aspect=cw/ch,halfH=Math.max(7.8,6.2/aspect),halfW=halfH*aspect,ahead=0.40*halfH;
  const sx=shake>0?(Math.random()-0.5)*shake*1.2:0,sz=shake>0?(Math.random()-0.5)*shake*1.2:0;
  const t=[camX+FWD[0]*ahead+sx,0,camZ+FWD[2]*ahead+sz],e=[t[0]-60,t[1]+72,t[2]-60];
  const VP=mmul(ortho(-halfW,halfW,-halfH,halfH,1,400),lookAt(e,t,[0,1,0])),pxPerUnit=ch/(2*halfH);

  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(true);
  gl.useProgram(skyP.p);gl.uniform2f(skyP.u.uRes,cw,ch);gl.bindVertexArray(emptyVAO);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);

  gl.useProgram(litP.p);
  gl.uniformMatrix4fv(litP.u.uVP,false,VP);gl.uniform3fv(litP.u.uL,LDIR);gl.uniform2f(litP.u.uRes,cw,ch);
  for(const cl of clouds)drawLit(cloudMeshes[cl.m],model(cl.x,cl.y,cl.z,cl.rot,0,0,cl.s),0,0,0,0.5,34);
  for(const s of G.segs){
    if(s.st==='wait'||!s.mesh)continue;
    const M=mT(0,s.yOff,0);drawLit(s.mesh,M,1,0.16,s.yOff,0,3.2);
    if(s.extra)drawLit(s.extra,M,0.5,0,s.yOff,0.1,3.2);
  }
  for(const k of G.coins){
    if(k.taken||k.seg.st==='wait')continue;
    drawLit(coinMesh,model(k.x,k.seg.yOff+0.62+Math.sin(G.time*3+k.ph)*0.08,k.y,G.time*2.6+k.ph),0,0,0,0.3,3);
  }
  const c=G.car;
  drawLit(carMesh,model(c.x,c.h,c.y,c.theta,c.pitch,c.roll),0,0,0,0.04,6);

  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-1,-4);
  gl.useProgram(decalP.p);gl.uniformMatrix4fv(decalP.u.uVP,false,VP);gl.uniform3f(decalP.u.uColor,0.23,0.2,0.35);
  if(G.state==='menu'||G.state==='play'){
    gl.uniformMatrix4fv(decalP.u.uM,false,model(c.x,c.h+0.015,c.y,c.phi));gl.uniform1f(decalP.u.uLife,0);
    gl.bindVertexArray(shadowMesh.vao);gl.drawArrays(gl.TRIANGLES,0,shadowMesh.n);
  }
  if(skCount){
    gl.uniformMatrix4fv(decalP.u.uM,false,I4);gl.uniform1f(decalP.u.uLife,1.8);gl.uniform1f(decalP.u.uTime,G.time);
    gl.bindVertexArray(skid.vao);gl.drawArrays(gl.TRIANGLES,0,skCount*6);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);

  if(parts.length){
    let n=0;
    for(const p of parts){const k=1-p.life/p.max,o=n*8;
      pData[o]=p.x;pData[o+1]=p.y;pData[o+2]=p.z;pData[o+3]=lerp(p.s0,p.s1,k);
      pData[o+4]=p.r;pData[o+5]=p.g;pData[o+6]=p.b;pData[o+7]=p.a*(1-k*k);n++;}
    gl.useProgram(partP.p);gl.uniformMatrix4fv(partP.u.uVP,false,VP);gl.uniform1f(partP.u.uPx,pxPerUnit);
    gl.bindBuffer(gl.ARRAY_BUFFER,pVAO.buf);gl.bufferSubData(gl.ARRAY_BUFFER,0,pData,0,n*8);
    gl.bindVertexArray(pVAO.vao);gl.drawArrays(gl.POINTS,0,n);
  }
  gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);

  const sc=scoreNow();if(sc!==lastScore){lastScore=sc;ui.score.textContent=sc;}
}

/* ---- 루프 ---- */
let acc=0,last=performance.now();
let visible=true,running=false;
function frame(now){
  if(!visible||document.hidden){running=false;return;}
  let dt=(now-last)/1000;last=now;if(dt>0.1)dt=0.1;acc+=dt;
  while(acc>=STEP){update(STEP);acc-=STEP;}
  render();requestAnimationFrame(frame);
}
function kick(){if(running||!visible||document.hidden)return;running=true;last=performance.now();acc=0;requestAnimationFrame(frame);}
if('IntersectionObserver' in window){
  new IntersectionObserver(es=>{visible=es[es.length-1].isIntersecting;if(!visible)release();kick();},{threshold:0.05}).observe(root);
}
document.addEventListener('visibilitychange',kick);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('err').textContent='그래픽 컨텍스트가 초기화됐어요. 페이지를 새로고침해 주세요.';$('err').style.display='flex';});
newRun();kick();
}

}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
