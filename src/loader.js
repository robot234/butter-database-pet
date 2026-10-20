(() => {
  'use strict';
  const CONFIG = /*__ONLINE_CONFIG__*/null;
  const owner=window, TH=window.TavernHelper;
  if(!TH){console.warn('[嘟嘟脸] 未检测到酒馆助手');return;}
  let H=window;try{for(let i=0;i<12&&H.parent!==H;i++){if(!H.parent.document)break;H=H.parent;}}catch(_){}
  const KEY='__BUTTER_DATABASE_PET_V2__';H[KEY]?.destroy();
  let stopped=false,suspended=false,epoch=0,current=null,staged=null,loading=null,loadAbort=null,frameObserver=null,controlPanel=null,renderControlPanel=null;
  const CACHE_DB='butter-database-pet:browser-cache:v1',ACTIVE_KEY=(CONFIG.localPreview?'preview-active:':'active:')+CONFIG.base,CATALOG_KEY=(CONFIG.localPreview?'preview-characters:':'characters:')+CONFIG.base,CHARACTER_KEY='butter-database-pet:selected-character:'+(CONFIG.localPreview?'preview:v1':'v1');
  let characters=checkCharacters(CONFIG.characters),catalogManifest=checkManifest(CONFIG.initial),catalogReady=null,catalogLoading=null,catalogAbort=null,activeRecord=null,cacheClearing=null;
  const defaultCharacter=list=>CONFIG.localPreview&&list.some(p=>p.id==='youngchun')?'youngchun':list[0].id;
  let selectedCharacter=defaultCharacter(characters),savedCharacter=null,currentManifest=null;
  try{savedCharacter=H.localStorage.getItem(CHARACTER_KEY);}catch(_){}
  let cacheDb=null,cacheOpen=null,cacheWarning=false,loadSource='network';
  const abort=new AbortController(),buttonStops=[];
  const notify=(text,kind='info')=>{const toast=H.toastr||window.toastr;if(toast?.[kind])toast[kind](text,'嘟嘟脸桌宠');else console.log('[嘟嘟脸] '+text);};
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
  const sha256=async value=>{const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);return owner.crypto?.subtle?Array.from(new Uint8Array(await owner.crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''):sha256Fallback(bytes);};
  function warnCache(){if(!cacheWarning&&!stopped){cacheWarning=true;notify('浏览器缓存无法保存或读取，本次仍可联网使用；下次可能需要重新下载。','warning');}}
  function openCache(){
    if(cacheOpen)return cacheOpen;
    cacheOpen=new Promise(resolve=>{
      let request,finished=false;
      const finish=db=>{if(finished){db?.close();return;}finished=true;H.clearTimeout(timer);if(stopped){db?.close();db=null;}cacheDb=db;resolve(db);};
      const timer=H.setTimeout(()=>{warnCache();finish(null);},4000);
      try{
        request=H.indexedDB.open(CACHE_DB,1);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('entries'))request.result.createObjectStore('entries');};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();if(cacheDb===db){cacheDb=null;cacheOpen=null;}};finish(db);};
        request.onerror=request.onblocked=()=>{warnCache();finish(null);};
      }catch(_){warnCache();finish(null);}
    });return cacheOpen;
  }
  async function cacheOp(mode,action,generation=epoch){
    const db=await openCache();if(!db||mode==='readwrite'&&(generation!==epoch||cacheClearing||stopped))return null;
    return new Promise(resolve=>{
      let tx,request,finished=false;
      const finish=value=>{if(finished)return;finished=true;H.clearTimeout(timer);resolve(value);};
      const fail=()=>{warnCache();finish(null);};
      const timer=H.setTimeout(()=>{try{tx?.abort();}catch(_){}fail();},4000);
      try{tx=db.transaction('entries',mode);request=action(tx.objectStore('entries'));tx.oncomplete=()=>finish(request?.result??null);tx.onabort=tx.onerror=fail;}catch(_){fail();}
    });
  }
  async function clearDownloadStore(){
    const db=await openCache();if(!db)throw new Error('浏览器缓存不可用，未能完成清理。');
    return new Promise((resolve,reject)=>{
      let tx,finished=false;
      const finish=error=>{if(finished)return;finished=true;H.clearTimeout(timer);error?reject(error):resolve();};
      const timer=H.setTimeout(()=>{try{tx?.abort();}catch(_){}finish(new Error('清理缓存超时，请稍后重试。'));},4000);
      try{tx=db.transaction('entries','readwrite');tx.oncomplete=()=>finish();tx.onerror=tx.onabort=()=>finish(new Error('清理缓存失败，请稍后重试。'));tx.objectStore('entries').clear();}
      catch(error){try{tx?.abort();}catch(_){}finish(error);}
    });
  }
  function clearCache(){
    if(stopped)return Promise.resolve(false);
    if(cacheClearing)return cacheClearing;
    const pending=[loading,catalogLoading,catalogReady].filter(Boolean);
    cacheClearing=Promise.resolve().then(async()=>{
      epoch++;catalogAbort?.abort();loadAbort?.abort();staged?.destroy();staged=null;
      notify('正在清除桌宠下载缓存，当前人物和设置保留。');
      try{
        await Promise.allSettled(pending);if(stopped)return false;
        await clearDownloadStore();if(stopped)return false;
        activeRecord=null;catalogReady=Promise.resolve();cacheWarning=false;
        notify('桌宠缓存已清除；当前人物继续显示，下次重新加载或切换人物时按需下载。','success');return true;
      }catch(error){if(!stopped)notify('桌宠缓存未清除：'+error.message,'error');return false;}
      finally{cacheClearing=null;renderControlPanel?.();}
    });renderControlPanel?.();return cacheClearing;
  }
  async function fetchBytes(url,signal){
    const stop=new AbortController(),cancel=()=>stop.abort();signal.addEventListener('abort',cancel,{once:true});
    const timer=H.setTimeout(cancel,25000);
    try{if(signal.aborted)throw new DOMException('已停止','AbortError');const res=await owner.fetch(url,{cache:'no-store',signal:stop.signal,credentials:'omit'});if(!res.ok)throw new Error('HTTP '+res.status+'：'+url);const bytes=await res.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw new Error('资源过大：'+url);return bytes;}
    finally{H.clearTimeout(timer);signal.removeEventListener('abort',cancel);}
  }
  async function resource(url,signal,expected){
    if(signal.aborted)throw new DOMException('已停止','AbortError');
    const record=await cacheOp('readonly',store=>store.get(url));
    if(record){
      if(record.schema===1&&Object.prototype.toString.call(record.bytes)==='[object ArrayBuffer]'&&record.bytes.byteLength<=8*1024*1024&&/^[a-f0-9]{64}$/.test(record.sha256)&&(!expected||record.sha256===expected)&&await sha256(record.bytes)===record.sha256)return record.bytes;
      await cacheOp('readwrite',store=>store.delete(url));
    }
    // 导入包自带本版自有代码，未发布或离线时也能启动；模型仍从固定上游按需下载。
    const bundled=url===CONFIG.base+CONFIG.initial.path&&expected===CONFIG.initial.sha256&&typeof CONFIG.initialRuntime==='string';
    const local=CONFIG.bundledResources?.[url];
    let bytes;
    if(bundled)bytes=new TextEncoder().encode(CONFIG.initialRuntime).buffer;
    else if(local){
      if(local.sha256!==expected||typeof local.base64!=='string'||local.base64.length>12*1024*1024)throw new Error('本地资源清单不兼容：'+url);
      const decoded=owner.atob(local.base64);bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0)).buffer;
    }else bytes=await fetchBytes(url,signal);
    const digest=await sha256(bytes);
    if(expected&&digest!==expected)throw new Error('资源摘要不一致：'+url);
    if(signal.aborted)throw new DOMException('已停止','AbortError');
    await cacheOp('readwrite',store=>store.put({schema:1,bytes,sha256:digest},url));return bytes;
  }
  async function fetchText(url,signal,expected){return new TextDecoder().decode(expected?await resource(url,signal,expected):await fetchBytes(url,signal));}
  async function fetchAsset(url,signal,expected){
    const bytes=await resource(url,signal,expected),type=url.endsWith('.png')?'image/png':url.endsWith('.atlas')?'text/plain':'application/octet-stream';
    if(signal.aborted)throw new DOMException('已停止','AbortError');
    return new Promise((resolve,reject)=>{
      const reader=new owner.FileReader(),cancel=()=>reader.abort(),clean=()=>signal.removeEventListener('abort',cancel);
      reader.onload=()=>{clean();resolve(reader.result);};reader.onerror=()=>{clean();reject(reader.error);};reader.onabort=()=>{clean();reject(new DOMException('已停止','AbortError'));};
      signal.addEventListener('abort',cancel,{once:true});reader.readAsDataURL(new owner.Blob([bytes],{type}));
    });
  }
  function checkManifest(m){
    if(!m||m.schema!==1||!/^\d+\.\d+\.\d+$/.test(m.version)||!/^releases\/\d+\.\d+\.\d+\/runtime\.js$/.test(m.path)||m.path!==`releases/${m.version}/runtime.js`||! /^[a-f0-9]{64}$/.test(m.sha256))throw new Error('在线更新清单不兼容');
    return {schema:1,version:m.version,path:m.path,sha256:m.sha256};
  }
  function newer(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
  function checkCharacters(list){
    if(!Array.isArray(list)||!list.length||list.length>128)throw new Error('人物名单为空或格式不兼容');
    const ids=new Set();return list.map(p=>{
      if(!p||typeof p.id!=='string'||! /^[a-z0-9][a-z0-9_-]{0,63}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||/[\u0000-\u001f\u007f]/.test(p.name))throw new Error('人物名单包含无效或重复的人物');
      ids.add(p.id);return {id:p.id,name:p.name};
    });
  }
  function acceptCatalog(m,list){
    if(newer(catalogManifest.version,m.version))return false;
    if(m.version===catalogManifest.version&&m.sha256!==catalogManifest.sha256)throw new Error('同版本人物代码发生变化，保留原名单');
    characters=checkCharacters(list);catalogManifest=m;renderControlPanel?.();return true;
  }
  function hydrateCharacters(){
    if(!catalogReady)catalogReady=(async()=>{
      // 人物名单与已启用版本分别保存；仅刷新名单不会覆盖上一次成功运行的版本。
      const records=await Promise.all([cacheOp('readonly',s=>s.get(ACTIVE_KEY)),cacheOp('readonly',s=>s.get(CATALOG_KEY))]);
      for(let i=0;i<records.length;i++)try{
        const record=records[i];if(record?.schema!==1)continue;
        const m=checkManifest(record.manifest);if(CONFIG.localPreview?m.version!==CONFIG.initial.version||m.sha256!==CONFIG.initial.sha256:newer(CONFIG.initial.version,m.version))continue;
        const list=checkCharacters(record.characters||CONFIG.characters);
        if(i===0)activeRecord={schema:1,manifest:m,characters:list};
        acceptCatalog(m,list);
      }catch(_){}
      if(stopped)return;
      selectedCharacter=characters.some(p=>p.id===savedCharacter)?savedCharacter:defaultCharacter(characters);
      renderControlPanel?.();
    })();return catalogReady;
  }
  async function readRuntime(m,signal){
    const text=await fetchText(CONFIG.base+m.path,signal,m.sha256);
    if(await sha256(text)!==m.sha256)throw new Error('脚本摘要不一致，保留当前版本');
    const factory=owner.Function(text+'\nreturn createButterRuntime;')(),description=factory.describe?.();
    if(description?.version!==m.version)throw new Error('人物名单与脚本版本不兼容');
    const list=checkCharacters(description.characters);
    if(m.version===catalogManifest.version&&m.sha256!==catalogManifest.sha256)throw new Error('同版本人物代码发生变化，保留原名单');
    return {factory,characters:list};
  }
  function refreshCharacters(){
    if(stopped||cacheClearing)return Promise.resolve(false);
    if(CONFIG.localPreview){notify('本地包使用自带人物名单；在线新增人物请使用在线版。');return Promise.resolve(false);}
    if(catalogLoading)return catalogLoading;
    const request=new AbortController(),generation=epoch;catalogAbort=request;
    catalogLoading=Promise.resolve().then(async()=>{
      try{
        await hydrateCharacters();
        const m=checkManifest(JSON.parse(await fetchText(CONFIG.base+'manifest.json',request.signal)));
        if(newer(catalogManifest.version,m.version)){notify('在线版本较旧，保留现有人物名单和当前画面。');return true;}
        const next=await readRuntime(m,request.signal);if(stopped||generation!==epoch)return false;
        await cacheOp('readwrite',s=>s.put({schema:1,manifest:m,characters:next.characters},CATALOG_KEY),generation);
        if(stopped||generation!==epoch)return false;acceptCatalog(m,next.characters);return true;
      }catch(e){if(!stopped&&generation===epoch)notify('在线人物读取失败，保留原名单和当前画面：'+e.message,'warning');return false;}
      finally{catalogLoading=null;if(catalogAbort===request)catalogAbort=null;}
    });return catalogLoading;
  }
  function closeControlPanel(){controlPanel?.remove();controlPanel=null;renderControlPanel=null;}
  function showCharacterPanel(){
    if(stopped||controlPanel)return;
    const doc=H.document,node=doc.createElement('dialog');node.className='butter-v2-panel';node.setAttribute('aria-label','选择桌宠角色');
    // 面板由入口持有；恢复原图、首次加载失败或暂时没有画布时仍能选择并启用角色。
    Object.assign(node.style,{position:'fixed',inset:'64px 12px auto auto',margin:'0',padding:'18px',width:'330px',maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100vh - 90px)',overflow:'auto',boxSizing:'border-box',zIndex:'9500',border:'1px solid #bd9452',borderRadius:'12px',background:'#fffaf0',color:'#49371e',font:'14px/1.6 "Microsoft YaHei",sans-serif'});
    const title=doc.createElement('strong');title.textContent='选择桌宠角色';node.append(title);
    const note=doc.createElement('p');note.textContent=CONFIG.localPreview?'本地预览已自带咏春；黄油、柯米首次下载需要联网，缓存后可离线切换。':suspended||!current?.status().applied?'选择角色即可启用；首次下载需要联网，下载过的角色可离线使用。':'选择后自动切换；下载过的角色可离线使用。';node.append(note);
    const list=doc.createElement('div');node.append(list);
    const message=doc.createElement('p');message.setAttribute('role','status');let panelBusy=false;
    const applied=id=>!suspended&&current?.character===id&&current.status().applied;
    const refresh=doc.createElement('button');refresh.type='button';refresh.textContent='刷新在线人物';refresh.style.margin='8px 8px 0 0';refresh.hidden=!!CONFIG.localPreview;
    const clear=doc.createElement('button');clear.type='button';clear.textContent='清除桌宠缓存';clear.style.margin='8px 8px 0 0';clear.title='清除本桌宠的下载缓存；保留当前画面、角色选择和大小，下次重新加载时下载。';
    renderControlPanel=()=>{
      if(controlPanel!==node)return;list.replaceChildren();const busy=panelBusy||!!cacheClearing;refresh.disabled=busy;clear.disabled=busy;
      for(const {id,name}of characters){
        const button=doc.createElement('button');button.type='button';button.textContent=name+(applied(id)?'（当前）':'');button.disabled=busy||!!applied(id);button.style.margin='8px 8px 0 0';
        button.onclick=async()=>{panelBusy=true;renderControlPanel?.();message.textContent='正在准备'+name+'，已有互动会完整播放后再切换。';
          try{if(await controller.selectCharacter(id)){if(controlPanel===node)closeControlPanel();}else if(controlPanel===node)message.textContent='暂未启用，请查看提示后重试；当前画面保留。';}
          catch(error){if(controlPanel===node)message.textContent='启用失败：'+error.message;}
          finally{panelBusy=false;if(controlPanel===node)renderControlPanel?.();}
        };list.append(button);
      }
    };
    refresh.onclick=async()=>{panelBusy=true;renderControlPanel?.();message.textContent='正在读取在线人物，当前角色继续运行。';
      const ok=await refreshCharacters();panelBusy=false;if(controlPanel===node){message.textContent=ok?'人物名单已就绪，选择角色即可切换。':'读取失败，原名单和当前画面已保留，可稍后重试。';renderControlPanel?.();}
    };
    clear.onclick=async()=>{message.textContent='正在清除桌宠下载缓存，当前画面与设置保留。';const ok=await clearCache();if(controlPanel===node)message.textContent=ok?'缓存已清除；下次重新加载或切换人物时按需下载。':'未完成清理，请查看提示后重试。';};
    node.append(message,refresh,clear);const close=doc.createElement('button');close.type='button';close.textContent='关闭';close.style.margin='8px 8px 0 0';close.onclick=closeControlPanel;node.oncancel=closeControlPanel;node.append(close);doc.body.append(node);controlPanel=node;renderControlPanel();node.show();
    hydrateCharacters().then(()=>{if(controlPanel===node)renderControlPanel?.();});
  }
  function pause(ms){return new Promise(resolve=>{const finish=()=>{H.clearTimeout(timer);abort.signal.removeEventListener('abort',finish);resolve();};const timer=H.setTimeout(finish,ms);abort.signal.addEventListener('abort',finish,{once:true});if(abort.signal.aborted)finish();});}
  async function waitApi(signal){const start=Date.now();while(!stopped&&!signal.aborted&&!H.AutoCardUpdaterAPI?.deskPet){if(Date.now()-start>20000)throw new Error('未找到数据库桌宠接口，请加载数据库后从“选择桌宠角色”重试。');await pause(250);}if(stopped||signal.aborted)throw new DOMException('已停止','AbortError');}
  async function load(m,character){
    const request=new AbortController();loadAbort=request;
    const {factory,characters:nextCharacters}=await readRuntime(m,request.signal);
    if(!nextCharacters.some(p=>p.id===character))throw new Error('该版本不支持所选人物，请刷新人物名单后重试');
    const prepared=await factory({host:H,owner,signal:request.signal,sha256,fetchText,fetchAsset,notify,legacyHashes:CONFIG.legacyHashes,character,selectCharacter:id=>controller.selectCharacter(id),showCharacterPanel});staged=prepared;
    if(prepared.version!==m.version){prepared.destroy();throw new Error('清单与脚本版本不一致');}
    await waitApi(request.signal);
    if(!current){H.__BUTTER_DATABASE_PET_V1__?.destroy();await prepared.migrateLegacy();}
    // 当前操作播完再切版本；长时间按住时延后到下一次检查。
    const start=Date.now();while(current?.busy()&&!stopped&&!request.signal.aborted){if(Date.now()-start>30000){prepared.destroy();staged=null;notify('当前互动尚未结束，请松手后重新切换或检查更新。','warning');return false;}await pause(100);}
    if(stopped||request.signal.aborted||suspended){prepared.destroy();return false;}
    const previous=current;
    try{prepared.activate();}catch(e){prepared.destroy();throw e;}
    current=prepared;currentManifest=m;selectedCharacter=prepared.character||character;staged=null;previous?.destroy();
    if(loadAbort===request)loadAbort=null;
    try{H.localStorage.setItem(CHARACTER_KEY,selectedCharacter);}catch(_){notify('角色已切换，但浏览器未能记住选择；下次启动可能回到默认角色。','warning');}
    // 只有新实例完整加载并接管成功，才更新下次启动使用的版本；坏更新不会污染已用版本。
    activeRecord={schema:1,manifest:m,characters:nextCharacters};const accepted=acceptCatalog(m,nextCharacters);
    await cacheOp('readwrite',store=>{const saved=store.put(activeRecord,ACTIVE_KEY);return accepted?store.put(activeRecord,CATALOG_KEY):saved;});return true;
  }
  async function run(force=false,character){
    if(cacheClearing)return false;
    if(force&&CONFIG.localPreview){notify('这是咏春本地预览版，尚未发布在线更新。','info');return false;}
    if(suspended){if(force)notify('当前显示数据库原图，从“选择桌宠角色”可重新启用。');return false;}
    if(stopped||loading)return loading;
    const generation=epoch;
    // 先登记任务，再执行正文；同步返回也必须在登记后释放，避免留下已结束的Promise。
    loading=Promise.resolve().then(async()=>{
      try{
        await hydrateCharacters();character??=selectedCharacter;
        let m;loadSource='network';
        if(!force){
          if(current){if((current.character||selectedCharacter)===character&&current.isActive?.()!==false)return true;m=currentManifest;}
          const supported=current?.status().characters||activeRecord?.characters;
          if(supported&&!supported.some(p=>p.id===character))m=catalogManifest;
          else if(!m&&activeRecord){m=activeRecord.manifest;loadSource='cache';}
          if(!m)m=catalogManifest;
        }
        if(force){if(!await refreshCharacters())return false;m=catalogManifest;}
        if(stopped||suspended||generation!==epoch)return;
        if(!current&&newer(CONFIG.initial.version,m.version))m=checkManifest(CONFIG.initial);
        if(current&&!newer(m.version,current.version)&&(current.character||selectedCharacter)===character&&current.isActive?.()!==false){if(force)notify('当前已是 '+current.version,'success');return true;}
        if(await load(m,character)&&!stopped&&!suspended&&generation===epoch){notify((current.characterName||'桌宠')+' '+m.version+' 已加载'+(loadSource==='cache'?'（浏览器缓存）':'')+'；关闭脚本会恢复数据库原图。','success');return true;}
        return false;
      }catch(e){staged?.destroy();staged=null;if(!stopped&&!suspended&&generation===epoch)notify('加载失败'+(current?'，当前角色继续运行':'，数据库原图仍保留')+'：'+e.message,'error');return false;}
      finally{loading=null;}
    });return loading;
  }
  const controller={showCharacterPanel,refreshCharacters,clearCache,checkUpdate:()=>run(true),async apply(){if(stopped||cacheClearing)return;const generation=epoch;suspended=false;if(loading)await loading;if(!stopped&&!suspended&&generation===epoch)return run();},restore(){if(stopped)return;closeControlPanel();suspended=true;epoch++;loadAbort?.abort();staged?.destroy();current?.destroy();staged=null;current=null;notify('已恢复数据库原图；可从角色菜单重新启用。','success');},status:()=>({...current?.status()||{applied:false,loading:!!loading,suspended},characters:characters.map(p=>({...p})),selectedCharacter,characterCatalogVersion:catalogManifest.version,catalogRefreshing:!!catalogLoading,cacheClearing:!!cacheClearing,cacheSource:loadSource,cacheAvailable:!!cacheDb&&!cacheWarning}),destroy(){if(stopped)return;closeControlPanel();stopped=true;epoch++;abort.abort();catalogAbort?.abort();loadAbort?.abort();staged?.destroy();current?.destroy();staged=null;current=null;cacheDb?.close();cacheDb=null;frameObserver?.disconnect();buttonStops.splice(0).forEach(fn=>fn());owner.removeEventListener('pagehide',pagehide);if(H[KEY]===controller)delete H[KEY];}};
  controller.selectCharacter=async id=>{if(stopped||cacheClearing)return false;const generation=epoch;await hydrateCharacters();if(catalogLoading)await catalogLoading;while(loading){const pending=loading;await pending;if(loading===pending)loading=null;}if(stopped||cacheClearing||generation!==epoch)return false;if(!characters.some(p=>p.id===id)){notify('不支持的桌宠角色，请先刷新在线人物。','error');return false;}suspended=false;return run(false,id);};
  const pagehide=()=>controller.destroy();owner.addEventListener('pagehide',pagehide);
  H[KEY]=controller;
  const ownFrame=owner.frameElement;
  if(ownFrame){frameObserver=new H.MutationObserver(()=>{if(!ownFrame.isConnected)controller.destroy();});frameObserver.observe(H.document,{childList:true,subtree:true});}
  const event=typeof getButtonEvent==='function'?getButtonEvent:TH.getButtonEvent;
  const on=typeof eventOn==='function'?eventOn:TH.eventOn;
  const off=typeof eventRemoveListener==='function'?eventRemoveListener:TH.eventRemoveListener;
  if(event&&on)for(const [name,fn]of [['选择桌宠角色',showCharacterPanel],['检查在线更新',()=>run(true)],['恢复数据库原图',()=>controller.restore()],['调整桌宠大小',()=>current?.showSizePanel()],['清除桌宠缓存',clearCache]]){const nameEvent=event(name),sub=on(nameEvent,fn);if(sub?.stop)buttonStops.push(()=>sub.stop());else if(off)buttonStops.push(()=>off(nameEvent,fn));}
  // 缓存命中时启动/再次应用不访问网络；只在手动检查更新或缓存缺失时下载。
  run();
})();
