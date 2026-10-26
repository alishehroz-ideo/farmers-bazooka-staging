'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),query=new URLSearchParams(location.search);
let game,state=null,manifest=null,muted=query.has('silent')||localStorage.getItem('FarmersBazookaSoundV1')==='off',drag=null,origin=0,lastEvent=-1,noticeUntil=0,pausedForHelp=false,recorder=null,recordChunks=[],recordSent=false,resultShown=false,lastRockWarnings=0,lastSkillPoints=0,lastDamageHits=0,lastAnimalLosses=0,lastGiantBreaks=0;

const qa=query.get('qa');if(/^\d{3}x\d{3}$/.test(qa||'')&&!matchMedia('(pointer:coarse)').matches&&innerWidth>900){const [w,h]=qa.split('x');document.body.classList.add('qa');document.documentElement.style.setProperty('--qa-width',w+'px');document.documentElement.style.setProperty('--qa-height',h+'px');}
function send(method,value){if(!game)return;value===undefined?game.SendMessage('FarmRun',method):game.SendMessage('FarmRun',method,String(value));}
function setSteer(value){send('SetSteer',Math.max(-1,Math.min(1,value)).toFixed(3));}
function readyTitle(){if(game&&state?.ready&&state.quality!==visualQuality)send('SetVisualQuality',visualQuality);if(game&&state?.ready&&!state.running&&!state.ended){$('loading').hidden=true;$('title').hidden=false;}}
function notify(text,seconds=2.2){$('notice').textContent=text;$('notice').classList.add('visible');noticeUntil=performance.now()+seconds*1000;}
function start(){visualMetrics.restartRequest=performance.now();rescueGoal.reset();$('rescue-warning').hidden=true;unlockRescueAudio();lastGiantBreaks=0;drag=null;lastAnimalLosses=0;lastDamageHits=0;setSteer(0);lastRockWarnings=0;lastSkillPoints=0;lastEvent=-1;noticeUntil=0;resultShown=false;$('notice').textContent='';$('notice').classList.remove('visible');$('title').hidden=$('result').hidden=$('paused').hidden=true;$('hud').hidden=$('play-ui').hidden=false;send('StartRun');send('SetMuted',muted?1:0);canvas.focus({preventScroll:true});if(query.has('record')&&!recorder)beginRecording();}
function stopFire(){send('SetBazookaHeld',0);}
function pause(value){if(value){stopRescueSound();$('rescue-warning').hidden=true;}else unlockRescueAudio();drag=null;stopFire();if(!state?.running)return;send('SetPaused',value?1:0);setSteer(0);$('paused').hidden=!value;if(value&&recorder?.state==='recording')recorder.pause();else if(!value&&recorder?.state==='paused')recorder.resume();}
$('start').onclick=()=>{const requested=Number(query.get('stage'));send('SelectStage',requested>=1&&requested<=50?Math.floor(requested)-1:Math.floor(Math.random()*50));start();};$('retry').onclick=$('restart').onclick=start;$('home').onclick=()=>location.reload();$('reload').onclick=()=>location.reload();$('pause').onclick=()=>pause(true);$('resume').onclick=()=>pause(false);
function syncSoundButtons(){
 $('sound').textContent=muted?'音声 OFF':'音声 ON';$('sound').setAttribute('aria-pressed',String(!muted));
 $('mute').setAttribute('aria-pressed',String(muted));$('mute').setAttribute('aria-label',muted?'ミュート解除':'ミュート');$('mute').title=muted?'音声 OFF — タップで解除':'音声 ON — タップでミュート';
}
function toggleSound(){muted=!muted;if(muted)stopRescueSound();else unlockRescueAudio();localStorage.setItem('FarmersBazookaSoundV1',muted?'off':'on');send('SetMuted',muted?1:0);syncSoundButtons();}
$('sound').onclick=toggleSound;$('mute').onclick=toggleSound;syncSoundButtons();

function help(){pausedForHelp=!!state?.running&&!state.paused;if(pausedForHelp)pause(true);$('instructions').showModal();}
$('help').onclick=$('title-help').onclick=help;$('close-help').onclick=()=>$('instructions').close();$('instructions').addEventListener('close',()=>{if(pausedForHelp)pause(false);pausedForHelp=false;canvas.focus({preventScroll:true});});
$('missile').addEventListener('pointerdown',e=>{e.preventDefault();$('missile').setPointerCapture(e.pointerId);send('SetBazookaHeld',1);send('Missile');});for(const kind of ['pointerup','pointercancel','lostpointercapture'])$('missile').addEventListener(kind,()=>send('SetBazookaHeld',0));$('missile').onclick=()=>{canvas.focus({preventScroll:true});};

canvas.addEventListener('pointerdown',event=>{if(!state?.running||state.paused||state.finishing||drag!==null)return;origin=event.clientX;drag=event.pointerId;canvas.setPointerCapture(drag);});
canvas.addEventListener('pointermove',event=>{if(event.pointerId!==drag)return;const reach=canvas.getBoundingClientRect().width*steeringSensitivity;const offset=Math.max(-reach,Math.min(reach,event.clientX-origin));origin=event.clientX-offset;setSteer(offset/reach);});
for(const kind of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(kind,event=>{if(event.pointerId!==drag)return;drag=null;setSteer(0);});
window.addEventListener('blur',()=>{stopFire();setSteer(0);if(state?.running&&!state.paused)pause(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state?.running&&!state.paused)pause(true);});
window.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();if(event.code==='Escape'&&!$('instructions').open)pause(!state?.paused);});
function goalDistanceText(s){return '農場への道のり '+Math.round(Math.max(0,Math.min(1,Number(s.progress)||0))*100)+'%';}
function heartMarkup(health,maxHealth=3){return Array.from({length:maxHealth},(_,i)=>i).map(i=>`<svg viewBox="0 0 28 26" aria-hidden="true"><path d="M14 24C10 20 1 14 1 8C1 0 10-1 14 5C18-1 27 0 27 8C27 14 18 20 14 24Z" fill="${i<health?'#d95745':'#597262'}" stroke="${i<health?'#923c32':'#476050'}" stroke-width="1.3"/><path d="M5 8Q6 3 10 5" fill="none" stroke="#fff3d9" opacity="${i<health?'.65':'.12'}" stroke-width="2.1" stroke-linecap="round"/></svg>`).join('');}
function flash(kind){$('screen-fx').className='';requestAnimationFrame(()=>$('screen-fx').className=kind);}
function skillPopup(text){$('skill-pop').textContent=text;$('skill-pop').classList.remove('show');requestAnimationFrame(()=>$('skill-pop').classList.add('show'));}
function eventFX(s){
 if(s.eventId===lastEvent)return;lastEvent=s.eventId;
 if(s.eventName==='expedition-clear'){skillPopup('NICE! ＋200');}else if(s.eventName==='expedition-chain'){skillPopup('CHAIN BREAK!');}else if(s.eventName==='dam-burst'){notify('ダム決壊！ 左の高い道が安全',1.5);}else if(s.eventName==='flood-log-break'){skillPopup('流木を突破！');}else if(s.eventName==='truck-approach'){notify('運搬トラックの右側に並んで救出！',1.8);}else if(s.eventName?.startsWith('truck-rescue-')){skillPopup('受け止めた！ ＋1匹');}else if(s.eventName?.startsWith('hay-chain-')){skillPopup('HAY CHAIN ×'+s.eventName.substring(10));}else if(s.eventName==='bridge-escape'){skillPopup('BRIDGE JUMP!');}else if(s.eventName==='bird-down'){skillPopup('撃墜 ＋100');}else if(s.eventName==='bird-hit'){notify('鳥が激突！ ライフ −1',.8);flash('damage');}else if(s.eventName==='herd-jump'){skillPopup('HERD JUMP ＋500');}else if(s.eventName==='hard-land'){notify('強い着地！ ハンドルを小さく当てて立て直そう',1.3);}else if(s.eventName==='ammo-pickup'){skillPopup('BAZOOKA ＋10');notify('弾薬を補給！ 金色の箱を集めよう',1.6);}
 else if(s.eventName==='rescue'||s.eventName==='rescue-hard'){$('pickup').textContent=(s.eventName==='rescue-hard'?'＋500':'＋250')+' ×'+(s.multiplier||1);$('pickup').classList.remove('pop');requestAnimationFrame(()=>$('pickup').classList.add('pop'));}
 else if(s.eventName?.startsWith('giant-hit-')){notify('巨大岩に命中！ あと'+s.eventName.substring("giant-hit-".length)+'発',1.4);skillPopup('BOULDER HIT!');flash('blast');}else if(s.eventName==='giant-warning'){notify('巨大岩！ ミサイル8発で粉砕！',3.2);flash('warning');}else if(s.eventName==='giant-break'){skillPopup('GIANT BREAK!');flash('blast');}else if(s.eventName==='crest-jump'){notify('頂上から飛び出した！ 着地に備えよう',2); }else if(s.eventName==='festival'){skillPopup('CLIFF CHECKPOINT!');}else if(s.eventName==='near-miss')skillPopup('NEAR MISS ＋75 ×'+s.multiplier);else if(s.eventName==='clean-land')skillPopup('CLEAN LAND ＋100 ×'+s.multiplier);else if(s.eventName==='overheat')notify('銃が過熱！ 回避して冷却',1.6);else if(s.eventName==='rocket-blast'){skillPopup('ROCKET BLAST!');flash('blast');}else if(s.eventName==='missile'){skillPopup('BAZOOKA!');flash('blast');}else if(s.eventName==='traffic-warning'){notify('⚠ 対向車！ 空いた側へ！',3);flash('warning');}else if(s.eventName?.startsWith('train-hit-')){notify('列車に命中！ あと'+s.eventName.substring('train-hit-'.length)+'発',1);flash('blast');}else if(s.eventName==='train-break'){skillPopup('TRAIN BREAK!');flash('blast');}else if(s.eventName==='train-warning'){notify('⚠ 踏切！ 列車の通過に注意！',3.5);flash('warning');}else if(s.eventName==='rock-warning'){notify('⚠ 落石！ 回避かバズーカ！',1.0);flash('warning');}else if(s.eventName==='destroy'){skillPopup('BREAK! ×'+s.multiplier);flash('blast');}else if(s.eventName==='hit'){notify(`衝突！ 耐久 ${s.health}/${s.maxHealth||3}`);flash('damage');}else if(s.eventName==='boost')notify('急斜面からジャンプ！');else if(s.eventName==='crash'){notify('大破！',3);flash('blast');}else if(s.eventName==='abyss-fall'){notify('転落！',1.2);flash('damage');}else if(s.eventName==='fall-recover'){notify('転落 −1 ♥ 道路へ復帰！',2.5);flash('damage');}else if(s.eventName==='fall')notify('転落！ 再挑戦できます',2);
}
window.onFarmersPortraitState=s=>{
 s.stageHint=s.stageHint?.replace('巨大岩を3発','巨大岩を8発');state=s;if(s.running&&visualMetrics.restartRequest){visualMetrics.restartMs=performance.now()-visualMetrics.restartRequest;visualMetrics.restartRequest=0;}$('frame').dataset.weather=s.climate===1?'rain':s.climate===2?'snow':s.climate===5?'night':s.climate===4?'sunset':'';if(s.running)$('title').hidden=true;$('stage-label').textContent=s.floodStarted&&s.z>=1640&&s.z<=2020?(s.floodWet>.1?'濁流で横流れ！ 左側の高い道へ':'高い道を走行中') : s.truckActive?(s.truckSaved>=4?'トラックの動物を全員救出！':s.truckAlongside?'受け止め中 '+s.truckSaved+'/4匹 · 並走 ＋'+s.truckBonus:'トラックの右側に並んで救出 '+s.truckSaved+'/4匹'):'STAGE '+s.stage+' / '+s.stageCount+' · '+s.stageName;$('stage-select').value=String(s.stage-1);$('stage-description').textContent=!s.running&&!s.ended?'STARTで50種類のコースからランダムに出発':s.stageHint;for(const [key,value] of Object.entries(s))$('telemetry').dataset[key]=String(value);readyTitle();
 if($('hearts').dataset.value!==String(s.health)){$('hearts').innerHTML=heartMarkup(s.health,s.maxHealth||3);$('hearts').dataset.value=s.health;$('hearts').setAttribute('aria-label',`耐久力${s.health}/${s.maxHealth||3}`);}
 if((s.animalLosses||0)>lastAnimalLosses){const count=s.animalLosses-lastAnimalLosses;notify('動物に誤射！ −'+(count*300)+'点・コンボ解除',2.5);skillPopup('ANIMAL HIT −'+(count*300));flash('damage');}lastAnimalLosses=s.animalLosses||0;
 const delivering=s.finishing&&(s.outcome==='clear'||s.outcome==='shortage');document.body.classList.toggle('delivery-scene',delivering);$('delivery-banner').hidden=!delivering;$('delivery-banner').textContent=delivering?'おかえりなさい！ '+(s.delivered||0)+' / '+s.animals+'匹が農場へ':'';$('animal-count').textContent=delivering?(s.delivered||0):s.animals;$('rescue-label').textContent=delivering?'匹が帰宅':'';updateRescueGoal(s,delivering);const percent=s.progress*100;document.querySelector('.progress').setAttribute('aria-valuenow',Math.round(percent));$('progress-fill').style.width=percent+'%';$('progress-dot').style.left=`calc(${percent}% - 5px)`;
 $('aim-reticle').classList.toggle('locked',!!s.aimLocked);$('weapon-status').hidden=!s.weaponName||delivering;$('weapon-status').textContent=s.weaponName?'⚡ '+s.weaponName+' '+Math.ceil(s.weaponSeconds)+'秒':'';
 $('speed').textContent=Math.round(s.speed*3.6);$('downhill-distance').textContent=goalDistanceText(s);$('combo').textContent=s.combo>1?`${s.combo} COMBO`:'';$('hint').hidden=s.elapsed>6;$('boost').hidden=!(s.eventName==='boost'&&s.airborne);
 $('destroy-count').textContent=s.rocketAmmo>0?'BAZOOKA ×'+s.rocketAmmo:'弾切れ！ 金色の弾薬箱を拾おう';$('missile').disabled=s.paused||s.finishing;$('missile').classList.toggle('cooling',s.rocketAmmo<=0);$('missile').querySelector('span').textContent='×'+s.rocketAmmo;
 $('live-score').textContent=s.score.toLocaleString();$('live-score').style.fontSize=Math.min(30,140/Math.max(4,String(s.score.toLocaleString()).length))+'px';$('live-best').textContent='BEST '+s.best.toLocaleString();$('title-best').textContent='このブラウザ BEST '+s.best.toLocaleString();$('combo').textContent='×'+(s.multiplier||1)+' COMBO';$('aim-reticle').style.left=s.aimX+'%';$('aim-reticle').style.top=s.aimY+'%';
 eventFX(s);if((s.rockWarnings||0)>lastRockWarnings){lastRockWarnings=s.rockWarnings;notify(s.eventName==='giant-warning'?'巨大岩！ ミサイル8発で粉砕！':'⚠ 落石！ 回避かバズーカ！',s.eventName==='giant-warning'?3.2:1.0);flash('warning');}if((s.giantBreaks||0)>lastGiantBreaks){skillPopup('GIANT BREAK!');notify('巨大岩を粉砕！',2);flash('blast');}lastGiantBreaks=s.giantBreaks||0;if(s.hits>lastDamageHits){lastDamageHits=s.hits;notify('激突！ 耐久 '+s.health+'/'+(s.maxHealth||3),1.6);skillPopup('CRASH! −1 ♥');flash('damage');canvas.classList.remove('impact-hit');void canvas.offsetWidth;canvas.classList.add('impact-hit');}if(performance.now()>noticeUntil)$('notice').classList.remove('visible');
 if(s.ended){$('hud').hidden=$('play-ui').hidden=$('paused').hidden=true;$('result').hidden=false;if(!resultShown){resultShown=true;showResult(s);}if(recorder?.state==='recording')recorder.stop();}
 if(recorder?.state==='recording'&&s.elapsed>=Math.min(60,Number(query.get('record'))||40))recorder.stop();
};
function loadRanks(){try{return JSON.parse(localStorage.getItem('farmers-festival-v14')||'[]').filter(r=>Number.isFinite(r.score)&&r.score>=0).slice(0,5);}catch{return [];}}
function showResult(s){
 $('next-stage').hidden=!(s.outcome==='clear');$('retry').textContent='同じステージに再挑戦';const clear=s.outcome==='clear',prior=loadRanks(),record={score:s.score,animals:s.animals,hits:s.hits,elapsed:s.elapsed,clear,at:Date.now()};const ranks=[...prior,record].sort((a,b)=>b.score-a.score||b.animals-a.animals||a.hits-b.hits||a.elapsed-b.elapsed).slice(0,5);localStorage.setItem('farmers-festival-v14',JSON.stringify(ranks));
 const pb=s.score>(prior[0]?.score||0);$('result-tag').textContent=pb?'NEW BEST / SCORE ATTACK':clear?'DELIVERY COMPLETE':'SCORE ATTACK';$('result-title').textContent=clear?(s.stage===50?'全50ステージの最終コースをクリア！':'STAGE '+s.stage+' 救出成功！'):s.outcome==='shortage'?'救出数が足りなかった。':s.outcome==='storm'?(s.charAmount>0?'落雷で感電・大破！':'竜巻に巻き上げられて大破！'):s.outcome==='crash'?'大破！ 次は記録更新へ。':s.outcome==='fall'?'転落！ 次こそ牧場へ。':s.outcome==='missed'?'牧場の入口を通り過ぎた！':'RUN FINISHED';
 $('result-message').textContent=clear?(s.delivered||s.animals)+'匹が農場に戻りました！ 配達ボーナスを獲得！':s.outcome==='shortage'?(s.delivered||s.animals)+'匹を農場に届けました。目標まであと'+Math.max(0,s.required-s.animals)+'匹です。':'救出・回避・着地の得点を記録しました。';$('result-count').textContent=s.score.toLocaleString();$('score-grade').textContent=(s.score>=8000?'S':s.score>=5000?'A':s.score>=2500?'B':'C')+' RANK';
 const rows=[['救出した仲間',s.animals+' 匹'],['救出＋コンボ',s.rescuePoints.toLocaleString()],['回避＋着地',s.skillPoints.toLocaleString()],['破壊・連鎖',s.breakPoints.toLocaleString()],['走行距離ボーナス',(s.distancePoints||0).toLocaleString()],['衝突の減点','−'+s.penaltyPoints.toLocaleString()],['動物への誤射',(s.animalLosses||0)+' 匹'],['誤射の減点','−'+(s.animalPenalty||0).toLocaleString()],['ギリギリ回避',s.nearMisses+' 回'],['走行時間',s.elapsed.toFixed(1)+' 秒']];$('stats').replaceChildren(...rows.flatMap(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;return[dt,dd];}));
 const title=document.createElement('strong');title.textContent='このブラウザ TOP 5';$('local-ranking').replaceChildren(title,...ranks.map((r,i)=>{const row=document.createElement('div');row.className='leader-row';const rank=document.createElement('span'),points=document.createElement('b'),info=document.createElement('span');rank.textContent=String(i+1);points.textContent=r.score.toLocaleString();info.textContent=r.animals+'匹'+(r.at===record.at?' · 今回':'');row.append(rank,points,info);return row;}));localStorage.setItem('farmers-portrait-last',JSON.stringify(s));window.dispatchEvent(new CustomEvent('farmers:score',{detail:{score:s.score,mode:'portrait',rules:'festival-v14',animals:s.animals,complete:clear}}));
}
function beginRecording(){
 if(!canvas.captureStream||!window.MediaRecorder)return;
 try{const options=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2600000}:{mimeType:'video/webm',videoBitsPerSecond:2600000};recorder=new MediaRecorder(canvas.captureStream(30),options);recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data);};recorder.onstop=async()=>{if(recordSent)return;recordSent=true;const blob=new Blob(recordChunks,{type:'video/webm'});$('record-status').hidden=false;$('record-status').textContent='実プレイ録画を保存中';try{const response=await fetch('/__qa/recording',{method:'POST',headers:{'Content-Type':'video/webm'},body:blob});if(!response.ok)throw Error(response.status);$('record-status').textContent='実プレイ録画を保存しました';}catch(error){$('record-status').textContent='録画の保存先を利用できません';}};recorder.start(1000);}
 catch(error){console.warn('Recording unavailable',String(error));}
}
const visualMetrics={readyMs:null,restartMs:null,restartRequest:0,drawCalls:0,triangles:0};
let visualQuality='normal';try{visualQuality=localStorage.getItem('farmers-visual-quality')==='low'?'low':'normal';}catch{}
$('visual-quality').value=visualQuality;
function visualViewport(){if(!game)return;const b=canvas.getBoundingClientRect(),ratio=visualQuality==='low'?1:Math.min(Math.max(devicePixelRatio,1.25),1.5);send('SetVisualViewport',Math.round(b.width*ratio)+','+Math.round(b.height*ratio));}
function applyVisualQuality(){visualQuality=$('visual-quality').value;try{localStorage.setItem('farmers-visual-quality',visualQuality);}catch{}if(state?.ready)send('SetVisualQuality',visualQuality);visualViewport();}
$('visual-quality').onchange=applyVisualQuality;new ResizeObserver(visualViewport).observe(canvas);
const originalContext=canvas.getContext.bind(canvas);let drawCount=0,triangleCount=0,measuredFrame=false;
canvas.getContext=function(...args){const gl=originalContext(...args);if(gl&&String(args[0]).startsWith('webgl')&&!gl.__farmMeasured){gl.__farmMeasured=true;for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){if(!gl[name])continue;const original=gl[name].bind(gl);gl[name]=function(...a){drawCount++;const count=name.startsWith('drawElements')?a[1]:a[2],instances=name.endsWith('Instanced')?a[a.length-1]:1;if(a[0]===gl.TRIANGLES)triangleCount+=count/3*instances;else if(a[0]===gl.TRIANGLE_STRIP)triangleCount+=Math.max(0,count-2)*instances;measuredFrame=true;return original(...a);};}}return gl;};
function collectVisualFrame(){if(measuredFrame){visualMetrics.drawCalls=drawCount;visualMetrics.triangles=Math.round(triangleCount);drawCount=triangleCount=0;measuredFrame=false;}requestAnimationFrame(collectVisualFrame);}requestAnimationFrame(collectVisualFrame);
setInterval(()=>{const resources=performance.getEntriesByType('resource');$('render-metrics').textContent=JSON.stringify({...visualMetrics,quality:visualQuality,encodedBytes:resources.reduce((n,r)=>n+r.encodedBodySize,0),transferBytes:resources.reduce((n,r)=>n+r.transferSize,0),jsHeapBytes:performance.memory?.usedJSHeapSize??null,canvas:[canvas.width,canvas.height],fps:state?.fps,frameP95:state?.frameP95,unityAllocatedBytes:state?.unityAllocatedBytes,managedBytes:state?.managedBytes});},1000);
async function boot(){
 try{manifest=await(await fetch('build-config.json',{cache:'no-store'})).json();$('build-label').textContent=`${manifest.version} · ${manifest.buildId}`;
 const loader=document.createElement('script');loader.src=manifest.loader;await new Promise((resolve,reject)=>{loader.onload=resolve;loader.onerror=reject;document.body.append(loader);});
 const {loader:unused,version,buildId,...config}=manifest;config.devicePixelRatio=1;config.matchWebGLToCanvasSize=false;config.cacheControl=()=> 'no-store';
 game=await createUnityInstance(canvas,config,p=>$('load-progress').value=p);send('SetMuted',muted?1:0);applyVisualQuality();visualMetrics.readyMs=performance.now();readyTitle();canvas.focus({preventScroll:true});
 }catch(error){$('load-label').textContent='読み込みを完了できませんでした';$('error').textContent=String(error);$('reload').hidden=false;console.error(error);}
}
let steeringSensitivity=.24;
try{const saved=JSON.parse(localStorage.getItem('farmers-touch-settings')||'{}');if(['0.32','0.24','0.17'].includes(String(saved.sensitivity))){steeringSensitivity=Number(saved.sensitivity);$('steering-sensitivity').value=String(saved.sensitivity);}if(saved.hand==='left')$('fire-hand').value='left';}catch{}
function touchSettings(){steeringSensitivity=Number($('steering-sensitivity').value);document.body.classList.toggle('left-fire',$('fire-hand').value==='left');try{localStorage.setItem('farmers-touch-settings',JSON.stringify({sensitivity:steeringSensitivity,hand:$('fire-hand').value}));}catch{}}
$('steering-sensitivity').onchange=$('fire-hand').onchange=touchSettings;touchSettings();
function releaseSteering(){drag=null;setSteer(0);}
let layoutWidth=innerWidth,layoutHeight=innerHeight;
window.addEventListener('resize',()=>{const rotated=Math.abs(innerWidth-layoutWidth)>20||Math.abs(innerHeight-layoutHeight)>160;layoutWidth=innerWidth;layoutHeight=innerHeight;if(!rotated)return;releaseSteering();stopFire();if(state?.running&&!state.paused)pause(true);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());$('missile').addEventListener('contextmenu',e=>e.preventDefault());
if(document.documentElement.requestFullscreen){$('fullscreen').hidden=false;$('fullscreen').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{notify('このブラウザでは全画面にできません');}};}
const stageNames=['草原の収穫ラリー','巨木の連続ヘアピン','赤岩採石場の砲撃戦','雨の渓流ブリッジ','夕焼けの丸太運搬道','氷結スラローム','汽笛の鉄道ジャンクション','強風の風車尾根','夜の岩門レスキュー','天空の着地チャレンジ',"オレンジ果樹園","ひまわりの迷路","段々畑の大落下","巨大かぼちゃ祭り","水車の小麦農場","サトウキビ搬出路","コーヒー農園の急坂","赤土の牧場街道","凍った湖への下り道","雪崩の山小屋","氷柱の洞窟","解け始めた雪道","オーロラの峠","霜の針葉樹林","砂丘の波乗り","砂嵐の交易路","赤岩の採石場","間欠泉の谷","火山灰の農場","岩塩鉱山の滑り台","マングローブの水路","滝裏の山道","潮が満ちる海岸坂","港町の荷揚げ坂","流氷の河口","大雨の棚田","巨大キノコの森","竹林の連続カーブ","巨木の根の山道","紅葉の落ち葉坂","ホタルの湿地","花びら舞う山里","廃鉱山のトロッコ道","山腹の工事現場","風力発電の丘","製材所の丸太水路","おもちゃ農場","巨大納屋の大脱走","気球まつりの丘","空中農場への帰還"];
for(const [i,name] of stageNames.entries()){const option=document.createElement('option');option.value=String(i);option.textContent=(i+1)+'. '+name;$('stage-select').append(option);}
$('stage-select').onchange=()=>send('SelectStage',$('stage-select').value);
$('choose-course').onclick=()=>$('course-menu').showModal();$('course-close').onclick=()=>{send('SelectStage',$('stage-select').value);$('course-menu').close();start();};$('course-random').onclick=()=>{$('course-menu').close();send('SelectStage',Math.floor(Math.random()*50));start();};
$('next-stage').onclick=()=>{send('SelectStage',((state.stage-1)+1+Math.floor(Math.random()*49))%50);start();};
boot();










function fitTitlePoster(){const img=$('title-image'),frame=$('frame');if(!img.naturalWidth)return;const scale=Math.min(frame.clientWidth/img.naturalWidth,frame.clientHeight/img.naturalHeight);$('title-poster').style.width=img.naturalWidth*scale+'px';$('title-poster').style.height=img.naturalHeight*scale+'px';}
$('title-image').addEventListener('load',fitTitlePoster);new ResizeObserver(fitTitlePoster).observe($('frame'));fitTitlePoster();
const rescueGoal=new RescueGoal();let rescueAudio=null,rescueTones=[];
function unlockRescueAudio(){
 if(muted)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;rescueAudio??=new Audio();if(rescueAudio.state==='suspended')rescueAudio.resume().catch(()=>{});}catch{}
}
function stopRescueSound(){for(const tone of rescueTones){try{tone.stop();}catch{}}rescueTones=[];}
function rescueChime(){
 if(muted||state?.paused||!rescueAudio||rescueAudio.state!=='running')return;
 stopRescueSound();
 for(const [i,hz] of [660,880,1046].entries()){
  const tone=rescueAudio.createOscillator(),gain=rescueAudio.createGain(),at=rescueAudio.currentTime+i*.14;
  tone.type='triangle';tone.frequency.value=hz;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.13,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.19);
  tone.connect(gain);gain.connect(rescueAudio.destination);tone.onended=()=>{tone.disconnect();gain.disconnect();};tone.start(at);tone.stop(at+.2);rescueTones.push(tone);
 }
}
function updateRescueGoal(s,delivering){
 const goal=rescueGoal.update(s);$('goal-number').textContent=s.required;
 if(!delivering)$('rescue-label').textContent=goal.remaining?'あと'+goal.remaining+'匹':'目標達成！';
 document.querySelector('.rescue').classList.toggle('goal-urgent',goal.urgent);
 document.querySelector('.rescue').classList.toggle('goal-complete',goal.remaining===0);
 $('rescue-needed').textContent=goal.remaining;$('rescue-warning').hidden=!goal.popup;
 if(goal.warn){$('rescue-warning').classList.remove('pop-in');void $('rescue-warning').offsetWidth;$('rescue-warning').classList.add('pop-in');rescueChime();}
 if(!goal.remaining||s.ended||s.finishing||s.paused)stopRescueSound();
 $('telemetry').dataset.rescueRemaining=goal.remaining;$('telemetry').dataset.rescueEta=Number.isFinite(goal.eta)?goal.eta.toFixed(1):'';$('telemetry').dataset.rescueWarning=String(goal.popup);
}

