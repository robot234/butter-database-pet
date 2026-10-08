// 自有适配代码；模型和官方 Spine 运行库从固定版本的上游加载。
async function createButterRuntime(env) {
  'use strict';
  const { host: H, owner, signal, sha256, fetchText, notify, legacyHashes } = env;
  const VERSION = '2.3.3';
  const MODEL = 'https://raw.githubusercontent.com/tenebo/Trickcal-Desktop/1b7e15bf5d520ac2908f3cf7b7cf226f5aae6907/Assets/spine/butter/';
  const LIB = 'https://cdn.jsdelivr.net/npm/@esotericsoftware/spine-webgl@4.2.109/dist/iife/spine-webgl.js';
  const LIB_HASH = 'ed59374359cf9217a87723124f5e87665492b06dae04a7b5e83af0fd18b12db2';
  const doc = H.document;
  let dead = false, active = false, raf = 0, panel = null, root = null, target = null;
  let gesture = null, phase = 'idle', clip = 'Idle_1', elapsed = 0, queue = [], rebounding = null;
  let pose = '', mode = '', task = '', focused = true, lastFrame = 0, lastRandom = '', nextRandom = 0;
  const history = [], disposers = [];
  let hitAreas = null, interaction = '', tapIndex = 0, knockCount = 0, lastKnock = 0, forwarding = false;
  let walkDistance = 0, walkX = null, walking = false, feet, footPose=[];
  let hoverPoint=null;
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
  let skeleton, state, data, base, head, controls, viewBounds, poseBounds;
  function selectedBounds(pattern) {
    const hidden = [];
    for (const slot of skeleton.slots) if (slot.attachment && !pattern.test(slot.data.name)) { hidden.push([slot,slot.attachment]); slot.attachment=null; }
    try { return skeleton.getBoundsRect(); }
    finally { for (const [slot,attachment] of hidden) slot.attachment=attachment; }
  }
  function disposeGraphics() {
    for (const dispose of [()=>assets.dispose(),()=>renderer.dispose(),()=>context.gl.getExtension('WEBGL_lose_context')?.loseContext()]) try { dispose(); } catch (_) {}
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
    for (const name of ['Idle_1','Pat_Idle','Pat_End','Touch_Idle','Touch_End','Tickle_Idle_1','Tickle_Idle_2','Tickle_End','Proud_1','Dizzy_1','Taunt_1']) {
      if (!data.findAnimation(name)) throw new Error('模型缺少动作：' + name);
    }
    for (const name of ['Character_Ball_Move','Character_Pat']) if (!skeleton.findBone(name)) throw new Error('模型缺少互动骨骼：' + name);
    controls = ['Character_Ball_Move','Character_Pat'].map(name=>skeleton.findBone(name));
    feet = ['S1_Leg_IK_R','S1_Leg_IK_L'].map(name=>skeleton.findBone(name));
    if (feet.some(b=>!b)) throw new Error('模型缺少迈步控制骨骼。');
    state.setAnimation(0, 'Idle_1', true); state.apply(skeleton); skeleton.updateWorldTransform(S.Physics.update);
    base = skeleton.getBoundsRect();
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
  function rest() { queue = []; rebounding = null; mode = ''; interaction = ''; play('Idle_1', true, 'idle'); planRandom(); }
  function sequence(names) { queue = names.slice(1); play(names[0], false, 'result'); }
  const randomClips = ['Smell_1','Taunt_1','Taunt_2','Taunt_3','Taunt_4','Happy_1','Happy_2','Happy_3','Happy_4','Happy_5','Proud_1','Proud_2','Eat_1','Eat_2'];
  const poses = { idle:'Idle_1', blink:'Close_1','look-left':'Serious_1','look-right':'Serious_2','walk-a':'Idle_1','walk-b':'Idle_1',roll:'Dizzy_1','eat-a':'Eat_1','eat-b':'Eat_2',yawn:'Close_1',snore:'Close_1','sit-snore':'Close_1',working:'Proud_1',struggle:'Panic_1',shy:'Panic_2',angry:'Angry_1',happy:'Happy_1',dizzy:'Dizzy_1',surprised:'Surprise_1',wave:'Happy_3',huff:'Angry_2',pound:'Smash_End_1',knockdown:'Smash_End_2' };
  const taskClips = { working:'Proud_1', error:'Dizzy_1', success:'Taunt_1' };
  function taskState(p) {
    if (p === 'working') return 'working';
    if (root?.classList.contains('is-dragging')) return '';
    const bubble = root?.closest('.acu-desk-pet-layer')?.querySelector('.acu-notice-bubble') || doc.querySelector('.acu-notice-bubble');
    if (bubble?.classList.contains('acu-notice-bubble--error')) return 'error';
    if (bubble?.classList.contains('acu-notice-bubble--success')) return 'success';
    return '';
  }
  function unmount() { target?.removeAttribute('data-butter-v2-mounted'); target = null; canvas.remove(); }
  function restoreHint(node) {
    const saved=node?.__butterPetHint;if(!saved||saved.owner!==controller)return;
    for(const name of ['title','aria-label'])if(node.getAttribute(name)===saved.applied[name]){const value=saved.before[name];if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}
    delete node.__butterPetHint;
  }
  function updateHint(peek,p) {
    const states={working:'正在执行任务：得意',error:'任务失败：晕晕',success:'任务成功：吐舌头'};
    let text=peek?'黄油：躲在边上偷看（悬停或点击唤出）':states[task]?'黄油：'+states[task]:'';
    if(!text){
      const labels={Pat:'摸头',Touch:phase==='rebound'?'薅脸回弹':'薅脸',Tickle:'挠痒',Smash:'敲头',Happy:'高兴',Angry:'生气',Proud:'得意',Dizzy:'晕晕',Taunt:'吐舌头',Eat:'嚼嚼',Smell:'嗅嗅',Panic:'小反应',Surprise:'惊讶',Close:'闭眼',Serious:'张望'};
      const reactions={Touch_End:'哭哭',Panic_2:'尴尬',Panic_3:'尴尬',Surprise_1:'惊讶',Taunt_2:'歪头'};
      const state=walking?'散步':['snore','sit-snore'].includes(p)?'睡觉':reactions[clip]||labels[clip.split('_')[0]]||'待机';
      const inside=hoverPoint&&root.getBoundingClientRect();
      const kind=inside&&hoverPoint.clientX>=inside.left&&hoverPoint.clientX<=inside.right&&hoverPoint.clientY>=inside.top&&hoverPoint.clientY<=inside.bottom?hitKind(hoverPoint):'';
      const tips={pat:'短点敲头；长按或滑动摸头，松手收尾',face:'短点切换反应；长按或拖动薅脸，松手回弹后哭哭',belly:'单击挠痒；长按或轻揉持续挠痒，松手收尾；大幅拖动可移动'};
      text='黄油：'+state+'（'+(['finishing','rebound','result'].includes(phase)&&interaction!=='tap'?'互动收尾播放中':tips[kind]||'头顶摸头或敲头，脸部薅脸，肚子挠痒；拖动腿部或外围移动')+'）';
    }
    let saved=root.__butterPetHint;
    if(!saved)saved=root.__butterPetHint={owner:controller,before:{},applied:{}};
    saved.owner=controller;
    for(const name of ['title','aria-label']){const value=root.getAttribute(name);if(value!==saved.applied[name])saved.before[name]=value;if(value!==text)root.setAttribute(name,text);saved.applied[name]=text;}
  }
  function attach() {
    const nextRoot = doc.querySelector('.acu-desk-pet');
    if (root !== nextRoot) { restoreHint(root);hoverPoint=null;gesture = null; rest(); root = nextRoot; pose = ''; unmount(); }
    const next = root?.querySelector('.acu-desk-pet__peek') || root?.querySelector('.acu-desk-pet__body');
    if (target !== next) { unmount(); target = next; if (target) target.append(canvas); }
    if (target && !target.hasAttribute('data-butter-v2-mounted')) target.setAttribute('data-butter-v2-mounted','');
    return !!target && root.getBoundingClientRect().width > 0 && H.getComputedStyle(root).visibility !== 'hidden';
  }
  function nativePose() { return root?.querySelector('.acu-desk-pet__img')?.className.match(/\bpose-([\w-]+)/)?.[1] || 'idle'; }
  function held(kind) {
    interaction = kind;
    play(kind === 'pat' ? 'Pat_Idle' : kind === 'belly' ? 'Tickle_Idle_1' : 'Touch_Idle', true, 'holding');
  }
  function knock() {
    const now = H.performance.now(); knockCount = now-lastKnock < 1800 ? knockCount+1 : 1; lastKnock = now;
    if (interaction === 'knock' && phase === 'result') {
      if (knockCount >= 3 && !queue.includes('Angry_1') && !clip.startsWith('Angry_')) queue.push('Angry_1','Angry_2','Angry_3');
      return;
    }
    interaction = 'knock'; sequence(['Smash_End_1','Smash_End_2']);
  }
  function release(cancelled = false) {
    if (!gesture) return;
    const g = gesture; gesture = null;
    if (g.started) {
      if (g.kind === 'face') { phase = 'rebound'; elapsed = 0; rebounding = { dx: g.dx, dy: g.dy }; }
      else if (g.kind === 'belly') {
        interaction = 'belly'; sequence(clip === 'Tickle_Idle_1' ? ['Tickle_Idle_2','Tickle_End'] : ['Tickle_End']);
      } else {
        // 松手先完成持续段本轮，再进入模型结果段。
        const entry = state.getCurrent(0); entry.loop = false; entry.trackTime %= entry.animation.duration;
        elapsed = entry.trackTime; phase = 'finishing'; queue = ['Pat_End'];
        const duration = H.performance.now()-g.since;
        if (duration >= 4500) queue.push('Happy_3','Happy_4','Happy_5');
        else if (duration >= 1800 || g.stroke >= .65) queue.push('Happy_1','Happy_2');
      }
    } else if (!cancelled) {
      if (g.kind === 'pat') knock();
      else if (g.kind === 'belly') { interaction = 'belly'; sequence(['Tickle_Idle_1','Tickle_Idle_2','Tickle_End']); }
      else { interaction = 'tap'; sequence([['Panic_2','Surprise_1','Panic_3','Taunt_2'][tapIndex++ % 4]]); }
    }
    else rest();
  }
  function hitKind(e) {
    if (!hitAreas || !viewBounds) return '';
    const r=canvas.getBoundingClientRect();
    let nx=(e.clientX-r.x)/r.width; if (canvas.style.transform) nx=1-nx;
    const point={x:viewBounds.x+nx*viewBounds.width,y:viewBounds.y+(1-(e.clientY-r.y)/r.height)*viewBounds.height};
    for (const kind of ['pat','face','belly']) {
      const b=hitAreas[kind];
      if (point.x>=b.x && point.x<=b.x+b.width && point.y>=b.y && point.y<=b.y+b.height) return kind;
    }
    return '';
  }
  function down(e) {
    if (forwarding || !active || e.button !== 0 || e.isPrimary === false || !root?.contains(e.target) || target?.classList.contains('acu-desk-pet__peek')) return;
    const r = root.getBoundingClientRect(), kind = hitKind(e);
    if (phase === 'result' || phase === 'finishing' || phase === 'rebound') {
      if (phase === 'result' && interaction === 'tap' && kind === 'face') rest();
      else if (kind) { if (kind === 'pat' && interaction === 'knock') knock(); e.stopImmediatePropagation(); e.preventDefault(); return; }
      else rest();
    }
    if (!kind) { if (phase === 'random') rest(); return; }
    e.preventDefault(); e.stopImmediatePropagation(); rest();
    gesture = { id:e.pointerId, kind, x:e.clientX, y:e.clientY, dx:0, dy:0, stroke:0, since:H.performance.now(), started:false, width:r.width, pointerType:e.pointerType };
    try { root.setPointerCapture(e.pointerId); } catch (_) {}
    phase = 'pressed';
  }
  function move(e) {
    if(e.pointerType!=='touch')hoverPoint=root?.contains(e.target)?{clientX:e.clientX,clientY:e.clientY}:null;
    if (forwarding) return;
    if (!gesture || gesture.id !== e.pointerId) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const g = gesture, old=g.dx; g.dx = (e.clientX-g.x)/g.width * (canvas.style.transform ? -1 : 1); g.dy = (e.clientY-g.y)/g.width; g.stroke+=Math.abs(g.dx-old);
    if (g.kind === 'belly' && !g.started && Math.hypot(g.dx,g.dy) > .12) {
      // 肚子大幅单向拖动交回原生移动；轻揉/按住则挠痒。只转交这一条已捕获的指针。
      gesture=null;rest();forwarding=true;
      try {
        const init={bubbles:true,cancelable:true,pointerId:g.id,pointerType:g.pointerType,isPrimary:true,button:0,buttons:1};
        root.dispatchEvent(new H.PointerEvent('pointerdown',{...init,clientX:g.x,clientY:g.y}));
        root.dispatchEvent(new H.PointerEvent('pointermove',{...init,clientX:e.clientX,clientY:e.clientY}));
      } finally { forwarding=false; }
      return;
    }
    if (!g.started && (g.kind === 'belly' ? g.stroke > .08 && Math.abs(g.dx) < g.stroke*.65 : Math.hypot(g.dx,g.dy) > .035)) { g.started = true; held(g.kind); }
  }
  function up(e) { if (!forwarding && gesture?.id === e.pointerId) { e.preventDefault(); e.stopImmediatePropagation(); release(e.type !== 'pointerup'); } }
  function stride() {
    const angle=walkDistance*Math.PI*8;
    for (let i=0;i<feet.length;i++) {
      const b=feet[i],t=angle+i*Math.PI,point=new S.Vector2(b.worldX+Math.sin(t)*base.width*.025,b.worldY+Math.max(0,Math.cos(t))*base.height*.025);
      b.parent.worldToLocal(point);b.x=point.x;b.y=point.y;
    }
    skeleton.updateWorldTransform(S.Physics.pose);
  }
  function manipulate(dx, dy, name) {
    const bone = skeleton.findBone(name);
    const limit = name === 'Character_Ball_Move' ? .22 : .12;
    let mx = dx/limit, my = dy/limit, length = Math.hypot(mx,my); if (length > 1) { mx/=length; my/=length; }
    const point = new S.Vector2(bone.worldX + mx*base.width*.12, bone.worldY - my*base.height*.05);
    bone.parent?.worldToLocal(point); bone.x = point.x; bone.y = point.y;
    skeleton.updateWorldTransform(S.Physics.pose);
  }
  function render(dt, now) {
    if (!attach()) return;
    const peek = target.classList.contains('acu-desk-pet__peek'), p = nativePose();
    task = peek ? '' : taskState(p);
    const blocked = !focused || doc.hidden || peek || root.classList.contains('is-dragging') || ['working','snore','sit-snore','yawn','struggle'].includes(p);
    if (blocked && ['pressed','holding','random','rebound','finishing','result'].includes(phase)) { gesture = null; rest(); }
    const m = api()?.getAppearance().motion;
    if (!m?.enabled && phase === 'random') rest();
    if (task && phase === 'random') { rest(); mode = ''; }
    const isWalk = !peek && !task && /^walk-[ab]$/.test(p);
    const currentMode = peek ? 'peek:' + (target.querySelector('img')?.src || '') : task ? 'task:'+task : isWalk ? 'walk' : p;
    if (mode !== currentMode) {
      mode = currentMode;
      if (phase === 'idle' || phase === 'native' || phase === 'task') {
        if (task) play(taskClips[task], true, 'task');
        else if (p === 'tickle' && !peek) sequence(['Tickle_Idle_1','Tickle_Idle_2','Tickle_End']);
        else play(peek ? (/sleepy/.test(currentMode) ? 'Close_1' : 'Idle_1') : (poses[p] || 'Idle_1'), true, p === 'idle' ? 'idle' : 'native');
      }
    }
    pose = p;
    if (gesture && !gesture.started && now-gesture.since >= 550) { gesture.started = true; held(gesture.kind); }
    if (phase === 'idle' && !task && !blocked && !gesture && m?.enabled && !H.matchMedia('(prefers-reduced-motion: reduce)').matches && now >= nextRandom) {
      const choices = randomClips.filter(x => x !== lastRandom); lastRandom = choices[Math.floor(Math.random()*choices.length)]; play(lastRandom, true, 'random');
    }
    // 互动目标骨骼没有每帧归位的动画轨道；先复位，再应用当前动画，防止手势偏移逐帧累积。
    for (const bone of [...controls,...feet]) bone.setToSetupPose();
    state.update(dt); state.apply(skeleton); skeleton.update(dt); skeleton.updateWorldTransform(S.Physics.update); elapsed += dt;
    footPose=feet.map(b=>({x:b.x,y:b.y}));
    const position=root.getBoundingClientRect();walking=isWalk && phase === 'native' && focused && !doc.hidden;
    if (walking) { if (walkX!==null) walkDistance+=Math.abs(position.x-walkX)/position.width; stride(); }
    else walkDistance=0;
    walkX=walking ? position.x : null;
    if (phase === 'random' && elapsed >= Math.max(1.5,data.findAnimation(clip).duration)) rest();
    if ((phase === 'result' || phase === 'finishing') && elapsed >= data.findAnimation(clip).duration) {
      if (queue.length) play(queue.shift(), false, 'result'); else { rest(); mode = ''; }
    }
    if (gesture?.started && gesture.kind !== 'belly') manipulate(gesture.dx,gesture.dy,gesture.kind === 'face' ? 'Character_Ball_Move' : 'Character_Pat');
    if (gesture?.started && gesture.kind === 'belly' && clip === 'Tickle_Idle_1' && elapsed >= data.findAnimation(clip).duration) play('Tickle_Idle_2',true,'holding');
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
    const hidden = [];
    if (peek) for (const slot of skeleton.slots) {
      if (slot.attachment && !/Hair|Ear|Face|Ball|F_|Headband/.test(slot.data.name)) { hidden.push([slot,slot.attachment]); slot.attachment=null; }
    }
    try {
      if (peek) {
        const wholeHead = skeleton.getBoundsRect(), face = selectedBounds(/Faceline/);
        // 每帧按实际头部和下巴定界；下巴贴屏幕边，长发沿边裁齐，不留悬空的透明垫片。
        head = { x:wholeHead.x, y:face.y-4, width:wholeHead.width, height:wholeHead.y+wholeHead.height-face.y+4 };
      }
      poseBounds = skeleton.getBoundsRect();
      const full = { x:Math.min(base.x,poseBounds.x), y:Math.min(base.y,poseBounds.y) };
      full.width = Math.max(base.x+base.width,poseBounds.x+poseBounds.width)-full.x;
      full.height = Math.max(base.y+base.height,poseBounds.y+poseBounds.height)-full.y;
      const bounds = peek ? head : full, rotated = peek && (edge === 'left' || edge === 'right');
      const margin = peek ? 1.04 : 1.12;
      const scale = Math.max((rotated ? bounds.height : bounds.width)/w,(rotated ? bounds.width : bounds.height)/h)*margin;
      renderer.camera.setViewport(w*scale,h*scale);
      renderer.camera.position.set(bounds.x+bounds.width/2,peek ? bounds.y+(rotated ? w : h)*scale/2 : bounds.y+bounds.height/2,0);
      renderer.camera.up.set(edge==='left' ? -1 : edge==='right' ? 1 : 0,edge==='top' ? -1 : (edge==='bottom' ? 1 : 0),0); renderer.camera.update();
      viewBounds = { x:renderer.camera.position.x-w*scale/2, y:renderer.camera.position.y-h*scale/2, width:w*scale, height:h*scale };
      if (!peek) {
        const face=selectedBounds(/S1_Faceline/),body=selectedBounds(/^S1_Body$/),hair=selectedBounds(/^S1_Hair_[1-7]$/),split=face.y+face.height*.66;
        hitAreas={pat:{x:face.x,y:split,width:face.width,height:Math.max(face.y+face.height,hair.y+hair.height)-split},face:{x:face.x,y:face.y,width:face.width,height:split-face.y},belly:{x:body.x,y:body.y,width:body.width,height:Math.max(0,Math.min(body.y+body.height,face.y)-body.y)}};
      } else hitAreas=null;
      updateHint(peek,p);
      renderer.begin(); renderer.drawSkeleton(skeleton, false); renderer.end();
    }
    finally { for (const [slot,attachment] of hidden) slot.attachment=attachment; }
  }
  function tick(now) {
    if (dead || !active) return;
    try { render(Math.min(.05,(now-(lastFrame||now))/1000),now); } catch (error) { notify('显示出错，已恢复数据库原画面：'+error.message,'error'); controller.destroy(); return; }
    lastFrame = now; raf = H.requestAnimationFrame(tick);
  }
  function listen(node,type,fn,options) { node.addEventListener(type,fn,options); disposers.push(()=>node.removeEventListener(type,fn,options)); }
  const sizeKey='butter-database-pet:original-size:v2',sizeKeys=['wide','narrow'];
  let sizeRestored=false;
  const validSize=n=>Number.isInteger(n)&&n>=32&&n<=256;
  function sizeBackup() {
    const raw=H.localStorage.getItem(sizeKey);if(raw===null)return null;
    let saved;try{saved=JSON.parse(raw);}catch(_){throw new Error('原大小恢复记录损坏，未修改大小。');}
    const fields=(v,nullable=false)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(v).every(([k,n])=>sizeKeys.includes(k)&&(validSize(n)||(nullable&&n===null)));
    if(!saved||saved.version!==2||!fields(saved.before)||!fields(saved.overrides,true)||!fields(saved.last)||!fields(saved.pending)||sizeKeys.some(k=>!validSize(saved.before[k])||!(k in saved.overrides)))throw new Error('原大小恢复记录不兼容，未修改大小。');
    return saved;
  }
  function setSize(patch) {
    if (!patch || typeof patch!=='object' || Array.isArray(patch) || Object.entries(patch).some(([k,n])=>!sizeKeys.includes(k)||!validSize(n))) throw new Error('大小请输入32～256的整数。');
    const pet=api(),current=pet.getAppearance().size,changed=Object.fromEntries(Object.entries(patch).filter(([k,n])=>current[k]!==n));
    if(!Object.keys(changed).length)return current;
    const overrides=pet.getOverrides().size||{},before=Object.fromEntries(sizeKeys.map(k=>[k,k in overrides?overrides[k]:null]));
    const saved=sizeBackup()||{version:2,before:Object.fromEntries(sizeKeys.map(k=>[k,current[k]])),overrides:before,last:{},pending:{}};
    for(const k of sizeKeys){if(current[k]===saved.pending[k])saved.last[k]=current[k];if(k in changed&&current[k]!==saved.last[k]&&current[k]!==saved.pending[k]){saved.before[k]=current[k];saved.overrides[k]=before[k];}}
    saved.pending=changed;
    try{H.localStorage.setItem(sizeKey,JSON.stringify(saved));}catch(_){throw new Error('无法保存原大小恢复记录，未修改大小。');}
    pet.updateAppearance({size:changed});sizeRestored=false;return pet.getAppearance().size;
  }
  function restoreSize({fallback=true}={}) {
    const pet=api(),saved=sizeBackup(),current=pet.getAppearance().size,patch={};
    if(saved){for(const k of sizeKeys)if(current[k]===saved.last[k]||current[k]===saved.pending[k])patch[k]=saved.overrides[k];}
    else if(fallback){patch.wide=null;patch.narrow=null;}
    // 数据库写入是同步保存；停用/iframe移除时在当前清理调用内完成，不依赖iframe后续任务。
    if(Object.keys(patch).length)pet.updateAppearance({size:patch});
    if(saved)H.localStorage.removeItem(sizeKey);
    sizeRestored=true;
    return pet.getAppearance().size;
  }
  function showSizePanel() {
    if (panel) return; const node=doc.createElement('dialog'); node.className='butter-v2-panel';
    node.style.boxSizing='border-box';node.style.maxHeight='calc(100vh - 90px)';node.style.overflow='auto';
    const title=doc.createElement('strong'); title.textContent='黄油大小（两端统一，32～256px）'; node.append(title);
    const message=doc.createElement('p');message.setAttribute('role','status');
    const row=doc.createElement('label');row.textContent='大小（像素）';
    const input=doc.createElement('input');input.type='range';input.min='32';input.max='256';input.style.width='100%';
    const number=doc.createElement('input');number.type='number';number.min='32';number.max='256';number.style.width='62px';
    input.setAttribute('aria-label','桌宠大小');number.setAttribute('aria-label','桌宠大小数值');
    const sync=value=>{input.value=String(value);number.value=String(value);};
    sync(Math.round(root?.getBoundingClientRect().width)||api().getAppearance().size.wide);
    const change=value=>{try{sync(setSize({wide:value,narrow:value}).wide);message.textContent='已保存：电脑和手机均为'+value+'px。';}catch(e){sync(api().getAppearance().size.wide);message.textContent=e.message;notify(e.message,'error');}};
    input.oninput=()=>{number.value=input.value;};input.onchange=()=>change(Number(input.value));number.onchange=()=>change(Number(number.value));
    row.append(input,number,doc.createTextNode(' px'));node.append(row);
    const shortcuts=doc.createElement('div');shortcuts.dataset.sizeUnified='';shortcuts.style.display='flex';shortcuts.style.flexWrap='wrap';
    for(const value of [64,88,128,160,200,256]){const b=doc.createElement('button');b.type='button';b.textContent=value+'px';b.onclick=()=>change(value);shortcuts.append(b);}node.append(shortcuts);
    const note=doc.createElement('p');note.textContent='选定大小同时用于电脑和手机。关闭脚本或恢复原图时还原调整前大小；在线更新保留当前大小。';node.append(note,message);
    const reset=doc.createElement('button');reset.type='button';reset.textContent='恢复默认大小';reset.onclick=()=>{const value=api()?.getDefaults?.().size?.wide;if(!validSize(value)){message.textContent='无法读取数据库默认大小。';return;}change(value);};node.append(reset);
    const close=doc.createElement('button');close.textContent='完成';close.onclick=()=>{node.remove();panel=null;};node.append(close);node.oncancel=()=>{panel=null;node.remove();};doc.body.append(node);node.show();panel=node;
  }
  const controller = {
    version:VERSION, migrateLegacy, setSize, showSizePanel, restoreSize,
    busy:()=>!!gesture || ['rebound','result','finishing','holding','pressed'].includes(phase),
    status:()=>({version:VERSION,applied:active && !!target,clip,phase,pose,task,interaction,hitAreas,walking,walkDistance,feet:feet.map((b,i)=>({x:b.x,y:b.y,animationX:footPose[i]?.x,animationY:footPose[i]?.y})),history:[...history],size:api()?.getAppearance().size,animations:data.animations.map(x=>({name:x.name,duration:x.duration})),bone:controls[0].x,control:{x:controls[0].x,y:controls[0].y,setupX:controls[0].data.x,setupY:controls[0].data.y},viewBounds,poseBounds}),
    activate() {
      ensureLive(); active=true; doc.head.append(css); planRandom();
      // 现有2.2入口的按钮动态调用restore；补充尺寸恢复，无需再次导入入口。
      const loader=H.__BUTTER_DATABASE_PET_V2__;
      if(typeof loader?.restore==='function'){
        const original=loader.restore.butterSizeBase||loader.restore;
        const restore=async()=>{try{await restoreSize();return original.call(loader);}catch(e){notify('恢复失败，保留当前画面和尺寸恢复记录，可重试：'+e.message,'error');}};
        restore.butterSizeBase=original;loader.restore=restore;disposers.push(()=>{if(loader.restore===restore)loader.restore=original;});
      }
      listen(doc,'pointerdown',down,true);listen(doc,'pointermove',move,true);listen(doc,'pointerup',up,true);listen(doc,'pointercancel',up,true);
      listen(H,'blur',()=>{focused=false;gesture=null;rest();});listen(H,'focus',()=>{focused=true;planRandom();});
      listen(doc,'visibilitychange',()=>{if(doc.hidden){gesture=null;rest();}else planRandom();});
      listen(canvas,'webglcontextlost',e=>{e.preventDefault();notify('绘图上下文已丢失，请重新应用黄油。','warning');controller.destroy();});
      H.ButterDatabasePet=controller; raf=H.requestAnimationFrame(tick);
    },
    destroy() {
      if(dead)return;
      const ownsDisplay=active&&H.ButterDatabasePet===controller;
      dead=true;active=false;
      // 新版本已接管时旧实例只清理自己；真正停用时恢复仍属于本脚本的尺寸。
      if(ownsDisplay&&!sizeRestored)try{restoreSize({fallback:false});}catch(e){notify('已恢复原图，但尺寸还原失败，恢复记录已保留：'+e.message,'error');}
      H.cancelAnimationFrame(raf);gesture=null;queue=[];disposers.splice(0).forEach(fn=>fn());restoreHint(root);hoverPoint=null;unmount();css.remove();panel?.remove();panel=null;signal.removeEventListener('abort',abortLoad);disposeGraphics();
      if(H.ButterDatabasePet===controller)delete H.ButterDatabasePet;
    }
  };
  signal.addEventListener('abort',()=>controller.destroy(),{once:true});
  return controller;
}
