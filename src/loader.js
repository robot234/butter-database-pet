(() => {
  'use strict';
  const CONFIG = /*__ONLINE_CONFIG__*/null;
  const owner=window, TH=window.TavernHelper;
  if(!TH){console.warn('[黄油] 未检测到酒馆助手');return;}
  let H=window;try{for(let i=0;i<12&&H.parent!==H;i++){if(!H.parent.document)break;H=H.parent;}}catch(_){}
  const KEY='__BUTTER_DATABASE_PET_V2__';H[KEY]?.destroy();
  let stopped=false,suspended=false,epoch=0,current=null,staged=null,loading=null,loadAbort=null,updateTimer=null,frameObserver=null;
  const abort=new AbortController(),buttonStops=[];
  const notify=(text,kind='info')=>{const toast=H.toastr||window.toastr;if(toast?.[kind])toast[kind](text,'黄油桌宠');else console.log('[黄油] '+text);};
  // 普通HTTP页面没有crypto.subtle；使用同一SHA-256算法，不跳过完整性校验。
  function sha256Fallback(bytes) {
    const constants=new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]);
    const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64),view=new DataView(padded.buffer);
    padded.set(bytes);padded[bytes.length]=0x80;
    view.setUint32(padded.length-8,Math.floor(bytes.length/0x20000000));view.setUint32(padded.length-4,(bytes.length*8)>>>0);
    const hash=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),words=new Uint32Array(64);
    const rotate=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let offset=0;offset<padded.length;offset+=64){
      for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++){const x=words[i-15],y=words[i-2];words[i]=(words[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10)))>>>0;}
      let [a,b,c,d,e,f,g,h]=hash;
      for(let i=0;i<64;i++){const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+constants[i]+words[i])>>>0,second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+first)>>>0;d=c;c=b;b=a;a=(first+second)>>>0;}
      [a,b,c,d,e,f,g,h].forEach((value,i)=>{hash[i]=(hash[i]+value)>>>0;});
    }
    return Array.from(hash,n=>n.toString(16).padStart(8,'0')).join('');
  }
  const sha256=async text=>{const bytes=new TextEncoder().encode(text);return owner.crypto?.subtle?Array.from(new Uint8Array(await owner.crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''):sha256Fallback(bytes);};
  async function fetchText(url,signal){
    const stop=new AbortController(),cancel=()=>stop.abort();signal.addEventListener('abort',cancel,{once:true});
    const timer=H.setTimeout(cancel,25000);
    try{if(signal.aborted)throw new DOMException('已停止','AbortError');const res=await owner.fetch(url,{cache:'no-store',signal:stop.signal,credentials:'omit'});if(!res.ok)throw new Error('HTTP '+res.status+'：'+url);return await res.text();}
    finally{H.clearTimeout(timer);signal.removeEventListener('abort',cancel);}
  }
  function checkManifest(m){
    if(!m||m.schema!==1||!/^\d+\.\d+\.\d+$/.test(m.version)||!/^releases\/\d+\.\d+\.\d+\/runtime\.js$/.test(m.path)||m.path!==`releases/${m.version}/runtime.js`||! /^[a-f0-9]{64}$/.test(m.sha256))throw new Error('在线更新清单不兼容');
    return m;
  }
  function newer(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
  function pause(ms){return new Promise(resolve=>{const finish=()=>{H.clearTimeout(timer);abort.signal.removeEventListener('abort',finish);resolve();};const timer=H.setTimeout(finish,ms);abort.signal.addEventListener('abort',finish,{once:true});if(abort.signal.aborted)finish();});}
  async function waitApi(signal){const start=Date.now();while(!stopped&&!signal.aborted&&!H.AutoCardUpdaterAPI?.deskPet){if(Date.now()-start>20000)throw new Error('未找到数据库桌宠接口，请加载数据库后点“应用黄油桌宠”。');await pause(250);}if(stopped||signal.aborted)throw new DOMException('已停止','AbortError');}
  async function load(m){
    const request=new AbortController();loadAbort=request;
    const text=await fetchText(CONFIG.base+m.path,request.signal);
    if(await sha256(text)!==m.sha256)throw new Error('脚本摘要不一致，保留当前版本');
    const factory=owner.Function(text+'\nreturn createButterRuntime;')();
    const prepared=await factory({host:H,owner,signal:request.signal,sha256,fetchText,notify,legacyHashes:CONFIG.legacyHashes});staged=prepared;
    if(prepared.version!==m.version){prepared.destroy();throw new Error('清单与脚本版本不一致');}
    await waitApi(request.signal);
    if(!current){H.__BUTTER_DATABASE_PET_V1__?.destroy();await prepared.migrateLegacy();}
    // 当前操作播完再切版本；长时间按住时延后到下一次检查。
    const start=Date.now();while(current?.busy()&&!stopped&&!request.signal.aborted){if(Date.now()-start>30000){prepared.destroy();staged=null;return false;}await pause(100);}
    if(stopped||request.signal.aborted||suspended){prepared.destroy();return false;}
    const previous=current;
    try{prepared.activate();}catch(e){prepared.destroy();throw e;}
    current=prepared;staged=null;previous?.destroy();return true;
  }
  async function run(force=false){
    if(suspended){if(force)notify('当前显示数据库原图，点“应用黄油桌宠”可重新启用。');return;}
    if(stopped||loading)return loading;
    const generation=epoch;
    loading=(async()=>{
      try{
        let m;
        try{m=checkManifest(JSON.parse(await fetchText(CONFIG.base+'manifest.json',abort.signal)));}
        catch(e){if(current){if(force)notify('更新检查失败，继续使用 '+current.version+'：'+e.message,'warning');return;}m=CONFIG.initial;}
        if(stopped||suspended||generation!==epoch)return;
        if(current&&!newer(m.version,current.version)){if(force)notify('当前已是 '+current.version,'success');return;}
        if(await load(m))notify('黄油 '+m.version+' 已加载；关闭脚本会恢复数据库原图。','success');
      }catch(e){staged?.destroy();staged=null;if(!stopped&&!suspended&&generation===epoch)notify('加载失败'+(current?'，当前版本继续运行':'，数据库原图仍保留')+'：'+e.message,'error');}
      finally{loading=null;}
    })();return loading;
  }
  const controller={checkUpdate:()=>run(true),async apply(){if(stopped)return;suspended=false;if(loading)await loading;if(!stopped&&!suspended)return run(true);},restore(){if(stopped)return;suspended=true;epoch++;loadAbort?.abort();staged?.destroy();current?.destroy();staged=null;current=null;notify('已恢复数据库原图；可随时再次应用黄油。','success');},status:()=>current?.status()||{applied:false,loading:!!loading,suspended},destroy(){if(stopped)return;stopped=true;epoch++;abort.abort();loadAbort?.abort();staged?.destroy();current?.destroy();staged=null;current=null;H.clearInterval(updateTimer);frameObserver?.disconnect();buttonStops.splice(0).forEach(fn=>fn());owner.removeEventListener('pagehide',pagehide);if(H[KEY]===controller)delete H[KEY];}};
  const pagehide=()=>controller.destroy();owner.addEventListener('pagehide',pagehide);
  H[KEY]=controller;
  const ownFrame=owner.frameElement;
  if(ownFrame){frameObserver=new H.MutationObserver(()=>{if(!ownFrame.isConnected)controller.destroy();});frameObserver.observe(H.document,{childList:true,subtree:true});}
  const event=typeof getButtonEvent==='function'?getButtonEvent:TH.getButtonEvent;
  const on=typeof eventOn==='function'?eventOn:TH.eventOn;
  const off=typeof eventRemoveListener==='function'?eventRemoveListener:TH.eventRemoveListener;
  if(event&&on)for(const [name,fn]of [['应用黄油桌宠',()=>controller.apply()],['检查在线更新',()=>run(true)],['恢复数据库原图',()=>controller.restore()],['调整桌宠大小',()=>current?.showSizePanel()]]){const nameEvent=event(name),sub=on(nameEvent,fn);if(sub?.stop)buttonStops.push(()=>sub.stop());else if(off)buttonStops.push(()=>off(nameEvent,fn));}
  updateTimer=H.setInterval(()=>run(),30*60*1000);run();
})();
