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
  const sha256=async text=>Array.from(new Uint8Array(await owner.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(n=>n.toString(16).padStart(2,'0')).join('');
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
