// 自有适配代码；模型和官方 Spine 运行库从固定版本的上游加载。
async function createButterRuntime(env) {
  'use strict';
  const { host: H, owner, signal, sha256, fetchText, notify, legacyHashes } = env;
  const VERSION = '2.0.0';
  const MODEL = 'https://raw.githubusercontent.com/tenebo/Trickcal-Desktop/1b7e15bf5d520ac2908f3cf7b7cf226f5aae6907/Assets/spine/butter/';
  const LIB = 'https://cdn.jsdelivr.net/npm/@esotericsoftware/spine-webgl@4.2.109/dist/iife/spine-webgl.js';
  const LIB_HASH = 'ed59374359cf9217a87723124f5e87665492b06dae04a7b5e83af0fd18b12db2';
  const doc = H.document;
  let dead = false, active = false, raf = 0, panel = null, root = null, target = null;
  let gesture = null, phase = 'idle', clip = 'Idle_1', elapsed = 0, queue = [], rebounding = null;
  let pose = '', mode = '', focused = true, lastFrame = 0, lastRandom = '', nextRandom = 0;
  const history = [], disposers = [];
  const canvas = doc.createElement('canvas'); canvas.className = 'butter-v2-canvas'; canvas.setAttribute('aria-hidden', 'true');
  const css = doc.createElement('style');
  css.textContent = '[data-butter-v2-mounted] .acu-desk-pet__img,[data-butter-v2-mounted]>.acu-desk-pet__peek-img{visibility:hidden!important}.acu-desk-pet__body[data-butter-v2-mounted]{animation:none!important}.butter-v2-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.butter-v2-panel{position:fixed;inset:64px 12px auto auto;margin:0;padding:18px;width:330px;max-width:calc(100vw - 24px);z-index:9500;border:1px solid #bd9452;border-radius:12px;background:#fffaf0;color:#49371e;font:14px/1.6 "Microsoft YaHei",sans-serif}.butter-v2-panel label{display:block;margin:12px 0}.butter-v2-panel input[type=range]{width:220px}.butter-v2-panel button{margin:8px 8px 0 0}';
  const api = () => H.AutoCardUpdaterAPI?.deskPet;
  function ensureLive() { if (dead || signal.aborted) throw new DOMException('已停止加载', 'AbortError'); }
  const libText = await fetchText(LIB, signal);
  if (await sha256(libText) !== LIB_HASH) throw new Error('Spine 运行库摘要不一致，未执行。');
  ensureLive();
  // 私有命名空间，不覆盖宿主可能已加载的 spine。
  const S = owner.Function(libText + '\nreturn spine;')();
  const context = new S.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  const renderer = new S.SceneRenderer(canvas, context);
  const assets = new S.AssetManager(context, MODEL);
  let skeleton, state, data, base, head;
  function disposeGraphics() {
    try { assets.dispose(); renderer.dispose(); context.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
  }
  const abortLoad = () => { if (!active) disposeGraphics(); };
  signal.addEventListener('abort', abortLoad, { once: true });
  try {
    const loaded = Promise.all([assets.loadBinaryAsync('Butter.skel'), assets.loadTextureAtlasAsync('Butter.atlas')]);
    let timer;
    const timeout = new Promise((_, reject) => { timer = H.setTimeout(() => reject(new Error('模型加载超时，请重试。')), 30000); });
    const cancelled = new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('已停止加载', 'AbortError')), { once: true }));
    let binary, atlas;
    try { [binary, atlas] = await Promise.race([loaded, timeout, cancelled]); } finally { H.clearTimeout(timer); }
    ensureLive();
    data = new S.SkeletonBinary(new S.AtlasAttachmentLoader(atlas)).readSkeletonData(binary);
    skeleton = new S.Skeleton(data); skeleton.setSkinByName('Normal'); skeleton.setSlotsToSetupPose();
    state = new S.AnimationState(new S.AnimationStateData(data)); state.data.defaultMix = 0.12;
    for (const name of ['Idle_1','Pat_Idle','Pat_End','Touch_Idle','Touch_End','Tickle_Idle_1','Tickle_Idle_2','Tickle_End']) {
      if (!data.findAnimation(name)) throw new Error('模型缺少动作：' + name);
    }
    for (const name of ['Character_Ball_Move','Character_Pat']) if (!skeleton.findBone(name)) throw new Error('模型缺少互动骨骼：' + name);
    state.setAnimation(0, 'Idle_1', true); state.apply(skeleton); skeleton.updateWorldTransform(S.Physics.update);
    base = skeleton.getBoundsRect();
    // 头部显示保留呆毛；裁切只去掉躯干，使用与全身同一骨骼而非低分辨率截图。
    head = { x: base.x + base.width*.22, y: base.y + base.height * .58, width: base.width*.78, height: base.height * .42 };
  } catch (error) { signal.removeEventListener('abort', abortLoad); disposeGraphics(); throw error; }
  const hashCache = new Map();
  async function migrateLegacy() {
    const pet = api(); if (!pet?.getAppearance || !pet.updateAppearance) throw new Error('数据库桌宠外观接口不可用。');
    const imageKey = 'butter-database-pet:original-images:v1', sizeKey = 'butter-database-pet:original-size:v1';
    const imageRaw = H.localStorage.getItem(imageKey), sizeRaw = H.localStorage.getItem(sizeKey);
    const parse = raw => { try { return raw ? JSON.parse(raw) : null; } catch (_) { throw new Error('旧版恢复记录损坏，请先用旧版恢复。'); } };
    const images = parse(imageRaw), sizes = parse(sizeRaw), current = pet.getAppearance(), patch = {};
    if (images) {
      if (images.version !== 1 || !images.images || Object.keys(legacyHashes).some(k => images.images[k] !== null && typeof images.images[k] !== 'string')) throw new Error('旧版图片恢复记录不兼容。');
      const restore = {};
      for (const [key, hashes] of Object.entries(legacyHashes)) {
        const url = current.images[key];
        if (typeof url !== 'string') continue;
        if (!hashCache.has(url)) hashCache.set(url, await sha256(url));
        if (hashes.includes(hashCache.get(url))) restore[key] = images.images[key];
      }
      if (Object.keys(restore).length) patch.images = restore;
    }
    if (sizes) {
      const valid = n => Number.isInteger(n) && n >= 32 && n <= 256;
      if (sizes.version !== 1 || !sizes.last || !sizes.pending || !sizes.overrides || !sizes.before || ['wide','narrow'].some(k => !valid(sizes.before[k]) || (sizes.overrides[k] !== null && !valid(sizes.overrides[k])) || (k in sizes.last && !valid(sizes.last[k])) || (k in sizes.pending && !valid(sizes.pending[k])))) throw new Error('旧版大小恢复记录不兼容。');
      const restore = {};
      for (const k of ['wide','narrow']) if (current.size[k] === sizes.last[k] || current.size[k] === sizes.pending[k]) restore[k] = sizes.overrides[k];
      if (Object.keys(restore).length) patch.size = restore;
    }
    ensureLive();
    if (Object.keys(patch).length) await pet.updateAppearance(patch);
    if (imageRaw) H.localStorage.removeItem(imageKey);
    if (sizeRaw) H.localStorage.removeItem(sizeKey);
  }
  function play(name, loop = false, kind = 'native') {
    if (!data.findAnimation(name)) name = 'Idle_1';
    skeleton.setBonesToSetupPose(); state.setAnimation(0, name, loop);
    clip = name; phase = kind; elapsed = 0;
    history.push(name); if (history.length > 80) history.shift();
  }
  function planRandom() {
    const m = api()?.getAppearance().motion;
    nextRandom = H.performance.now() + (m?.idleActionMinMs ?? 15000) + Math.random() * (m?.idleActionSpreadMs ?? 5000);
  }
  function rest() { queue = []; rebounding = null; play('Idle_1', true, 'idle'); planRandom(); }
  function sequence(names) { queue = names.slice(1); play(names[0], false, 'result'); }
  const randomClips = ['Smell_1','Taunt_1','Taunt_2','Taunt_3','Taunt_4','Happy_1','Happy_2','Happy_3','Happy_4','Happy_5','Proud_1','Proud_2','Eat_1','Eat_2'];
  const poses = { idle:'Idle_1', blink:'Close_1','look-left':'Serious_1','look-right':'Serious_2','walk-a':'Taunt_1','walk-b':'Taunt_2',roll:'Dizzy_1','eat-a':'Eat_1','eat-b':'Eat_2',yawn:'Close_1',snore:'Close_1','sit-snore':'Close_1',working:'Serious_1',struggle:'Panic_1',shy:'Panic_2',angry:'Angry_1',happy:'Happy_1',dizzy:'Dizzy_1',surprised:'Surprise_1',wave:'Happy_3',huff:'Angry_2',pound:'Smash_End_1',knockdown:'Smash_End_2' };
  function unmount() { target?.removeAttribute('data-butter-v2-mounted'); target = null; canvas.remove(); }
  function attach() {
    const nextRoot = doc.querySelector('.acu-desk-pet');
    if (root !== nextRoot) { gesture = null; rest(); root = nextRoot; pose = ''; unmount(); }
    const next = root?.querySelector('.acu-desk-pet__peek') || root?.querySelector('.acu-desk-pet__body');
    if (target !== next) { unmount(); target = next; if (target) target.append(canvas); }
    if (target && !target.hasAttribute('data-butter-v2-mounted')) target.setAttribute('data-butter-v2-mounted','');
    return !!target && root.getBoundingClientRect().width > 0 && H.getComputedStyle(root).visibility !== 'hidden';
  }
  function nativePose() { return root?.querySelector('.acu-desk-pet__img')?.className.match(/\bpose-([\w-]+)/)?.[1] || 'idle'; }
  function held(kind) { play(kind === 'pat' ? 'Pat_Idle' : 'Touch_Idle', true, 'holding'); }
  function release(cancelled = false) {
    if (!gesture) return;
    const g = gesture; gesture = null;
    if (g.started) {
      if (g.kind === 'face') { phase = 'rebound'; elapsed = 0; rebounding = { dx: g.dx, dy: g.dy }; }
      else {
        // 松手先完成持续段本轮，再进入模型结果段。
        const entry = state.getCurrent(0); entry.loop = false; entry.trackTime %= entry.animation.duration;
        elapsed = entry.trackTime; phase = 'finishing'; queue = ['Pat_End'];
      }
    } else if (!cancelled) sequence(g.kind === 'pat' ? ['Smash_End_1','Smash_End_2'] : ['Panic_2','Panic_3']);
    else rest();
  }
  function down(e) {
    if (!active || e.button !== 0 || e.isPrimary === false || !root?.contains(e.target) || target?.classList.contains('acu-desk-pet__peek')) return;
    const r = root.getBoundingClientRect(), x = (e.clientX-r.x)/r.width, y = (e.clientY-r.y)/r.height;
    if (phase === 'result' || phase === 'finishing' || phase === 'rebound') {
      if (y <= .59) { e.stopImmediatePropagation(); e.preventDefault(); return; }
      rest();
    }
    if (x < .12 || x > .88 || y > .59) { if (phase === 'random') rest(); return; }
    e.preventDefault(); e.stopImmediatePropagation(); rest();
    gesture = { id:e.pointerId, kind:y < .28 ? 'pat' : 'face', x:e.clientX, y:e.clientY, dx:0, dy:0, since:H.performance.now(), started:false, width:r.width };
    try { root.setPointerCapture(e.pointerId); } catch (_) {}
    phase = 'pressed';
  }
  function move(e) {
    if (!gesture || gesture.id !== e.pointerId) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const g = gesture; g.dx = (e.clientX-g.x)/g.width * (root.querySelector('.is-flipped') ? -1 : 1); g.dy = (e.clientY-g.y)/g.width;
    if (!g.started && Math.hypot(g.dx,g.dy) > .035) { g.started = true; held(g.kind); }
  }
  function up(e) { if (gesture?.id === e.pointerId) { e.preventDefault(); e.stopImmediatePropagation(); release(e.type !== 'pointerup'); } }
  function manipulate(dx, dy, name) {
    const bone = skeleton.findBone(name);
    const limit = name === 'Character_Ball_Move' ? .22 : .12;
    let mx = dx/limit, my = dy/limit, length = Math.hypot(mx,my); if (length > 1) { mx/=length; my/=length; }
    const point = new S.Vector2(bone.worldX + mx*base.width*.24, bone.worldY - my*base.height*.10);
    bone.parent?.worldToLocal(point); bone.x = point.x; bone.y = point.y;
    skeleton.updateWorldTransform(S.Physics.pose);
  }
  function render(dt, now) {
    if (!attach()) return;
    const peek = target.classList.contains('acu-desk-pet__peek'), p = nativePose();
    const blocked = !focused || doc.hidden || peek || root.classList.contains('is-dragging') || ['working','snore','sit-snore','yawn','struggle'].includes(p);
    if (blocked && ['pressed','holding','random','rebound','finishing','result'].includes(phase)) { gesture = null; rest(); }
    const m = api()?.getAppearance().motion;
    if (!m?.enabled && phase === 'random') rest();
    const currentMode = peek ? 'peek:' + (target.querySelector('img')?.src || '') : p;
    if (mode !== currentMode) {
      mode = currentMode;
      if (phase === 'idle' || phase === 'native') {
        if (p === 'tickle' && !peek) sequence(['Tickle_Idle_1','Tickle_Idle_2','Tickle_End']);
        else play(peek ? (/sleepy/.test(currentMode) ? 'Close_1' : 'Idle_1') : (poses[p] || 'Idle_1'), true, p === 'idle' ? 'idle' : 'native');
      }
    }
    pose = p;
    if (gesture && !gesture.started && now-gesture.since >= 550) { gesture.started = true; held(gesture.kind); }
    if (phase === 'idle' && !blocked && !gesture && m?.enabled && !H.matchMedia('(prefers-reduced-motion: reduce)').matches && now >= nextRandom) {
      const choices = randomClips.filter(x => x !== lastRandom); lastRandom = choices[Math.floor(Math.random()*choices.length)]; play(lastRandom, true, 'random');
    }
    state.update(dt); state.apply(skeleton); skeleton.update(dt); skeleton.updateWorldTransform(S.Physics.update); elapsed += dt;
    if (phase === 'random' && elapsed >= Math.max(1.5,data.findAnimation(clip).duration)) rest();
    if ((phase === 'result' || phase === 'finishing') && elapsed >= data.findAnimation(clip).duration) {
      if (queue.length) play(queue.shift(), false, 'result'); else { rest(); mode = ''; }
    }
    if (gesture?.started) manipulate(gesture.dx,gesture.dy,gesture.kind === 'face' ? 'Character_Ball_Move' : 'Character_Pat');
    if (rebounding) {
      const t = Math.min(1,elapsed/.32), amount = Math.exp(-5*t)*Math.cos(t*Math.PI*3)*(1-t);
      manipulate(rebounding.dx*amount,rebounding.dy*amount,'Character_Ball_Move');
      if (t >= 1) { rebounding = null; sequence(['Touch_End']); }
    }
    const dpr = Math.min(H.devicePixelRatio || 1,3);
    const w = Math.max(1,Math.round(target.clientWidth*dpr)), h = Math.max(1,Math.round(target.clientHeight*dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
    const gl = context.gl; gl.viewport(0,0,w,h); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    const edge = peek ? ['bottom','top','left','right'].find(x=>target.classList.contains('is-'+x)) || 'bottom' : 'bottom';
    canvas.style.transform = !peek && root.querySelector('.is-flipped') ? 'scaleX(-1)' : '';
    const bounds = peek ? head : base;
    const rotated = peek && (edge === 'left' || edge === 'right');
    const viewW = (rotated ? bounds.height : bounds.width)*1.12, viewH = (rotated ? bounds.width : bounds.height)*1.12;
    const scale = Math.max(viewW/w,viewH/h);
    renderer.camera.setViewport(w*scale,h*scale); renderer.camera.position.set(bounds.x+bounds.width/2,bounds.y+bounds.height/2,0);
    renderer.camera.up.set(edge==='left' ? -1 : edge==='right' ? 1 : 0,edge==='top' ? -1 : (edge==='bottom' ? 1 : 0),0); renderer.camera.update();
    const hidden = [];
    if (peek) for (const slot of skeleton.slots) {
      if (slot.attachment && !/Hair|Ear|Face|Ball|F_|Headband/.test(slot.data.name)) { hidden.push([slot,slot.attachment]); slot.attachment=null; }
    }
    try { renderer.begin(); renderer.drawSkeleton(skeleton, false); renderer.end(); }
    finally { for (const [slot,attachment] of hidden) slot.attachment=attachment; }
  }
  function tick(now) {
    if (dead || !active) return;
    try { render(Math.min(.05,(now-(lastFrame||now))/1000),now); } catch (error) { notify('显示出错，已恢复数据库原画面：'+error.message,'error'); controller.destroy(); return; }
    lastFrame = now; raf = H.requestAnimationFrame(tick);
  }
  function listen(node,type,fn,options) { node.addEventListener(type,fn,options); disposers.push(()=>node.removeEventListener(type,fn,options)); }
  function setSize(patch) {
    if (!patch || Object.keys(patch).some(k=>!['wide','narrow'].includes(k) || !Number.isInteger(patch[k]) || patch[k]<32 || patch[k]>256)) throw new Error('大小请输入32～256的整数。');
    api().updateAppearance({size:patch}); return api().getAppearance().size;
  }
  function showSizePanel() {
    if (panel) return; const node=doc.createElement('dialog'); node.className='butter-v2-panel';
    const title=doc.createElement('strong'); title.textContent='黄油大小（32～256px）'; node.append(title);
    for (const [key,label] of [['wide','电脑'],['narrow','手机']]) {
      const row=doc.createElement('label'); row.textContent=label+' '; const input=doc.createElement('input'); input.type='range'; input.min='32';input.max='256'; input.value=api().getAppearance().size[key];
      const number=doc.createElement('input'); number.type='number';number.min='32';number.max='256';number.value=input.value;number.style.width='62px';
      input.oninput=()=>{number.value=input.value;};input.onchange=()=>{try{setSize({[key]:Number(input.value)});}catch(e){notify(e.message,'error');}};
      number.onchange=()=>{try{setSize({[key]:Number(number.value)});input.value=number.value;}catch(e){notify(e.message,'error');}};row.append(input,number);node.append(row);
    }
    const note=doc.createElement('p');note.textContent='大小保存在数据库；关闭脚本会恢复原图，保留你选择的大小。';node.append(note);
    const close=doc.createElement('button');close.textContent='完成';close.onclick=()=>{node.remove();panel=null;};node.append(close);node.oncancel=()=>{panel=null;node.remove();};doc.body.append(node);node.show();panel=node;
  }
  const controller = {
    version:VERSION, migrateLegacy, setSize, showSizePanel,
    busy:()=>!!gesture || ['rebound','result','finishing','holding','pressed'].includes(phase),
    status:()=>({version:VERSION,applied:active && !!target,clip,phase,pose,history:[...history],size:api()?.getAppearance().size,animations:data.animations.map(x=>({name:x.name,duration:x.duration})),bone:skeleton.findBone('Character_Ball_Move')?.x}),
    activate() {
      ensureLive(); active=true; doc.head.append(css); planRandom();
      listen(doc,'pointerdown',down,true);listen(doc,'pointermove',move,true);listen(doc,'pointerup',up,true);listen(doc,'pointercancel',up,true);
      listen(H,'blur',()=>{focused=false;gesture=null;rest();});listen(H,'focus',()=>{focused=true;planRandom();});
      listen(doc,'visibilitychange',()=>{if(doc.hidden){gesture=null;rest();}else planRandom();});
      listen(canvas,'webglcontextlost',e=>{e.preventDefault();notify('绘图上下文已丢失，请重新应用黄油。','warning');controller.destroy();});
      H.ButterDatabasePet=controller; raf=H.requestAnimationFrame(tick);
    },
    destroy() {
      if(dead)return;dead=true;active=false;H.cancelAnimationFrame(raf);gesture=null;queue=[];disposers.splice(0).forEach(fn=>fn());unmount();css.remove();panel?.remove();panel=null;signal.removeEventListener('abort',abortLoad);disposeGraphics();
      if(H.ButterDatabasePet===controller)delete H.ButterDatabasePet;
    }
  };
  signal.addEventListener('abort',()=>controller.destroy(),{once:true});
  return controller;
}
