// Engine Atlas: what only this atlas does. The rest is the shared atlas engine (../atlas-engine/atlas.js), which the
// page starts with `extend: machine`. The engine hands this file what it may use (api) and calls the functions returned
// at the bottom at fixed points: when it makes a piece, draws a frame, is about to show a part, gets a key or a voice
// phrase it doesn't know, and so on.
//
// Two things live here: taking the engine apart (in three stages, each part travelling in a straight line), and running
// it (the crank turns; pistons, rods, valves, springs, cams, chain and pulleys follow; gas columns and stroke labels).
// Both need the camera to fit a box rather than a sphere (the opened engine is tall and narrow), so the three functions
// that frame a view are here too.

export function machine(api) {
  const { $, BONE, DATA, THREE, UNIT, VIEW_DIRS, applyVisibility, bones, callout, camera, closeViewSheetOnPhone, controls, flyTo, inScope, inView, layout, narrow, occ, projectPx, renderPrompt, resize, scene, setCallout, setGlow, setView, state, store, studyPick, t, toast, voiceStatus, zoomDir, zoomed } = api;
  // (these change while the atlas runs, so they are read through api each time: pendingConfirm, study)

  const PAL = DATA.palette;   // the materials the parts are made of: colour, roughness, metalness

  /* ---------------- taking the engine apart ---------------- */
  // state.explode is where the engine is heading (0 assembled, 1 covers and bolt-on parts off, 2 head and timing chain off,
  // 3 everything apart); explodeNow follows it. Within a stage each piece slides along its own straight line, the ones
  // with furthest to go setting off first.
  const STAGGER = 0.32;
  let explodeNow = 0, explodeTween = null, piecesDirty = true;
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  function stageK(E, m) {
    const k = clamp01((clamp01(E - (m.s - 1)) - m.d) / (1 - STAGGER));
    return k * k * (3 - 2 * k);
  }
  function offsetAt(rec, E, out) {
    out.set(0, 0, 0);
    for (const m of rec.moves) out.addScaledVector(m.v, stageK(E, m));
    return out;
  }
  function setExplode(level, opts = {}) {
    level = Math.max(0, Math.min(3, level));
    if (level > 0 && state.run) setRun(false);
    state.explode = level;
    if (opts.byHand) state.explodeFloor = level;
    if (opts.instant) { explodeTween = null; explodeNow = level; }
    else if (level !== explodeNow) explodeTween = { from: explodeNow, to: level, t0: performance.now(), dur: 520 + 620 * Math.abs(level - explodeNow) };
    piecesDirty = true; occ.key = '';
    renderExplode();
  }
  // Showing a part opens the engine as far as that part needs, and closes it again for a part on the outside, unless a
  // level was picked by hand: then it never closes past that.
  function exposeFor(stage, keepOpen = false) {
    const want = Math.max(stage, state.explodeFloor, keepOpen ? Math.ceil(state.explode) : 0);
    if (want !== state.explode) setExplode(want);
  }
  function stageOf(ids) { let s = 0; for (const id of ids) if (BONE[id]) s = Math.max(s, BONE[id].layer); return s; }
  function renderExplode() {
    const near = Math.round(state.explode);
    $('explodeGrid').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === near && Math.abs(state.explode - near) < 0.02)));
    if (document.activeElement !== $('explodeRange')) $('explodeRange').value = String(explodeNow);
  }

  /* ---------------- the engine running ---------------- */
  // theta is the crankshaft's angle in degrees, 0 to 720: one full four-stroke cycle is two turns. The model is built at
  // theta = 0 (cylinder 1 at the top, about to fire); every moving piece is placed from there.
  const KIN = DATA.kin;
  let theta = 0;
  const rad = (d) => d * Math.PI / 180;
  function pinY(cyl, th) {   // height of a piston's pin above the crankshaft
    const a = rad(th + KIN.phase[cyl]);
    return KIN.cr * Math.cos(a) + Math.sqrt(KIN.rod * KIN.rod - (KIN.cr * Math.sin(a)) ** 2);
  }
  function cyclePos(cyl, th) { return (((th - KIN.fireAt[cyl]) % 720) + 720) % 720; }   // degrees since this cylinder fired
  function valveLift(kind, cyl, th) {
    const [a, b] = kind === 'in' ? KIN.inOpen : KIN.exOpen;
    const p = cyclePos(cyl, th);
    for (const q of [p, p + 720, p - 720]) if (q >= a && q <= b) return KIN.lift * Math.sin(Math.PI * (q - a) / (b - a)) ** 2;
    return 0;
  }
  const STROKES = ['power', 'exhaust', 'intake', 'compression'];
  function strokeOf(cyl, th) { return STROKES[Math.floor(cyclePos(cyl, th) / 180) % 4]; }
  const mRot = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4();
  function rotAbout(out, y, z, ang) {   // turn about a line parallel to the crankshaft through (y, z)
    return out.makeTranslation(0, y, z).multiply(mRot.makeRotationX(ang)).multiply(mA.makeTranslation(0, -y, -z));
  }
  function kinMatrix(rec, out) {
    const k = rec.data.kin;
    if (!k || theta === 0) return out.identity();
    switch (k.t) {
      case 'crank': return out.makeRotationX(rad(theta));
      case 'cam': return rotAbout(out, KIN.camY, k.kind === 'in' ? KIN.camZ : -KIN.camZ, rad(theta / 2));
      case 'spin': return rotAbout(out, k.axis[0], k.axis[1], rad(theta * k.ratio));
      case 'piston': return out.makeTranslation(0, pinY(k.cyl, theta) - pinY(k.cyl, 0), 0);
      case 'rod': {   // the small end follows the piston, the big end the crank pin
        const a = rad(theta + KIN.phase[k.cyl]), yp = pinY(k.cyl, theta);
        const phi = Math.atan2(KIN.cr * Math.sin(a), KIN.cr * Math.cos(a) - yp) - Math.PI;
        return out.makeTranslation(0, yp, 0).multiply(mRot.makeRotationX(phi)).multiply(mA.makeTranslation(0, -pinY(k.cyl, 0), 0));
      }
      case 'valve': {
        const dl = valveLift(k.kind, k.cyl, theta) - valveLift(k.kind, k.cyl, 0), d = KIN.axis[k.kind];
        return out.makeTranslation(0, -d[1] * dl, -d[2] * dl);
      }
      case 'spring': {   // squeezed along the valve's axis, its bottom staying on the seat
        const d = KIN.axis[k.kind], s = (k.free - valveLift(k.kind, k.cyl, theta)) / (k.free - valveLift(k.kind, k.cyl, 0)) - 1;
        const dot = d[0] * k.seat[0] + d[1] * k.seat[1] + d[2] * k.seat[2];
        return out.set(
          1 + s * d[0] * d[0], s * d[0] * d[1], s * d[0] * d[2], -s * d[0] * dot,
          s * d[1] * d[0], 1 + s * d[1] * d[1], s * d[1] * d[2], -s * d[1] * dot,
          s * d[2] * d[0], s * d[2] * d[1], 1 + s * d[2] * d[2], -s * d[2] * dot,
          0, 0, 0, 1);
      }
    }
    return out.identity();
  }
  // Puts every piece where it belongs for the current explode level and crank angle.
  function updatePieces() {
    for (const r of bones.values()) {
      offsetAt(r, explodeNow, r.off);
      r.holder.matrix.makeTranslation(r.off.x, r.off.y, r.off.z).multiply(kinMatrix(r, mB));
      r.holder.matrixWorldNeedsUpdate = true;
      r.center.copy(r.center0).applyMatrix4(r.holder.matrix);
      r.anchor.copy(r.anchor0).applyMatrix4(r.holder.matrix);
    }
    if (modelRoot) modelRoot.updateMatrixWorld(true);
    piecesDirty = false;
  }

  // How far back the camera must be, looking along dir, for a box to fill the uncovered part of the screen. The exploded
  // engine is tall and narrow, so this fits its width and height separately instead of a sphere round it.
  const fitR = new THREE.Vector3(), fitU = new THREE.Vector3(), fitD = new THREE.Vector3(), fitC = new THREE.Vector3(), fitV = new THREE.Vector3();
  function fitBoxDistance(box, dir) {
    fitD.copy(dir).normalize();
    fitR.crossVectors(fitD, camera.up).normalize(); if (fitR.lengthSq() < 1e-6) fitR.set(1, 0, 0);
    fitU.crossVectors(fitR, fitD).normalize();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = t * layout.freeW / layout.fullH, tanV = t * layout.freeH / layout.fullH;
    box.getCenter(fitC);
    let hx = 0, hy = 0, hz = 0;
    for (let i = 0; i < 8; i++) {
      fitV.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(fitC);
      hx = Math.max(hx, Math.abs(fitV.dot(fitR))); hy = Math.max(hy, Math.abs(fitV.dot(fitU))); hz = Math.max(hz, Math.abs(fitV.dot(fitD)));
    }
    // the corners of a box overstate what is really there, so the fit is left a little tight
    return Math.max(hx / tanH, hy / tanV) * 0.94 + hz * 0.2;
  }

  const tmpBox = new THREE.Box3(), tmpOff = new THREE.Vector3();
  // The box round some pieces where they will be once the engine has reached the chosen explode level (so the camera
  // can set off for the right place while the parts are still moving).
  function boxOf(recs, level = state.explode) {
    const box = new THREE.Box3();
    for (const r of recs) box.union(tmpBox.copy(r.box0).translate(offsetAt(r, level, tmpOff)));
    return box;
  }
  function scopeBox(key = state.view) {
    let recs = [...bones.values()].filter(r => inScope(r.data) && inView(r.data, key));
    if (!recs.length) recs = [...bones.values()];
    return boxOf(recs);
  }
  function scopeSphere(key = state.view) { return scopeBox(key).getBoundingSphere(new THREE.Sphere()); }

  function frameSection(dir) {
    const box = scopeBox(), d = dir || zoomDir();
    flyTo(box.getCenter(new THREE.Vector3()), fitBoxDistance(box, d), d);
  }

  /* Every part has a side it is best seen from (build/engine_def.py: `view`). Showing a part (a study step, a practice
     reveal, a search result) flies the camera to that side and frames the part with some of the engine round it, at the
     place the part will be once the engine has finished opening or closing. */
  function showBones(members, focus) {
    if (!members.length) return;
    const u = UNIT[(focus || members[0]).data.unit];
    const box = boxOf(members), d = VIEW_DIRS[u.view] || VIEW_DIRS.fi;
    const s = box.getBoundingSphere(new THREE.Sphere());
    // room round the part, but never closer than a fifth of the engine, and never further than the whole of it
    const whole = scopeBox('all');
    const radius = Math.max(s.radius * 2.1, 0.17);
    box.expandByScalar(radius - s.radius);
    flyTo(s.center, Math.min(fitBoxDistance(whole, d), fitBoxDistance(box, d)), d);
  }

  $('explodeGrid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    setExplode(Number(b.dataset.v), { byHand: true }); frameAfterExplode();
  });
  $('explodeRange').addEventListener('input', (e) => setExplode(Number(e.target.value), { byHand: true, instant: true }));
  $('explodeRange').addEventListener('change', () => frameAfterExplode());
  // after the engine opens or closes by hand: bring the whole of it (or the part being shown) back into the picture
  function frameAfterExplode() {
    if (callout.item && callout.rec) showBones([...callout.item.accept].map(id => bones.get(id)).filter(Boolean), callout.rec);
    else frameSection(camera.position.clone().sub(controls.target));
  }
  function stepExplode(d) {
    const cur = Math.abs(state.explode - Math.round(state.explode)) < 0.02 ? Math.round(state.explode) : (d > 0 ? Math.floor(state.explode) : Math.ceil(state.explode));
    const next = Math.max(0, Math.min(3, cur + d));
    setExplode(next, { byHand: true }); frameAfterExplode();
    if (state.clean || narrow()) toast(t('ex_' + next));
  }

  const VOICE_ACTIONS = {
    ex0: ['assembled', 'put it back together', 'back together', 'assemble', 'assemble it', 'close it', 'close it up', 'whole'],
    ex1: ['covers off', 'take the covers off', 'open it', 'open it up', 'stage one'],
    ex2: ['head off', 'take the head off', 'stage two'],
    ex3: ['take it apart', 'all apart', 'apart', 'explode', 'exploded view', 'explode it', 'blow it up', 'take apart', 'stage three', 'strip it down'],
    run: ['run', 'run the engine', 'start', 'start the engine', 'start it', 'run it', 'go'],
    stop: ['stop', 'stop the engine', 'stop it'],
  };

  const VOICE_ACTION_LOOKUP = new Map();
  for (const [k, list] of Object.entries(VOICE_ACTIONS)) for (const a of list) VOICE_ACTION_LOOKUP.set(a.replace(/[^a-z]/g, ''), k);

  /* ---------------- run mode: the four-stroke cycle in slow motion ---------------- */
  const RUN_SPEED = { slow: 70, medium: 260, fast: 1100 };   // crankshaft degrees per second
  const STROKE_COL = { intake: 0x62b8ee, compression: 0xa88cf2, power: 0xffa13d, exhaust: 0x8f979d };
  const gas = [];   // per cylinder: a see-through column of gas above the piston, coloured by stroke, and the spark
  function makeGas() {
    const geo = new THREE.CylinderGeometry(KIN.bore / 2 - 0.0008, KIN.bore / 2 - 0.0008, 1, 36);
    geo.translate(0, 0.5, 0);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: STROKE_COL.intake, transparent: true, opacity: 0.3, depthWrite: false }));
      mesh.position.set(KIN.cylX[i], 0, 0); mesh.visible = false; mesh.renderOrder = 1; mesh.raycast = () => {};
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.009, 14, 10), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.95, depthTest: false }));
      spark.position.set(KIN.cylX[i], KIN.plugY, 0); spark.visible = false; spark.renderOrder = 12; spark.raycast = () => {};
      scene.add(mesh, spark);
      const chip = document.createElement('div'); chip.className = 'stroke';
      chip.innerHTML = '<b></b><i></i><span></span>';
      chip.querySelector('b').textContent = String(i + 1);
      $('strokes').append(chip);
      gas.push({ mesh, spark, chip, stroke: '' });
    }
  }
  const gasCol = new THREE.Color(), gasCol2 = new THREE.Color();
  function updateGas() {
    for (let i = 0; i < 4; i++) {
      const g = gas[i], p = cyclePos(i, theta), st = strokeOf(i, theta), k = (p % 180) / 180;
      const crown = pinY(i, theta) + KIN.ch;
      g.mesh.visible = state.run;
      g.mesh.position.y = crown; g.mesh.scale.y = Math.max(0.0005, KIN.deck + KIN.roof - crown);
      let op = 0.3;
      if (st === 'power') { gasCol.setHex(0xfff0b0).lerp(gasCol2.setHex(0xe2592a), Math.min(1, k * 1.5)); op = 0.62 - 0.3 * k; }
      else if (st === 'exhaust') { gasCol.setHex(0xb4674a).lerp(gasCol2.setHex(STROKE_COL.exhaust), Math.min(1, k * 3)); op = 0.3; }
      else if (st === 'intake') { gasCol.setHex(STROKE_COL.intake); op = 0.12 + 0.2 * k; }
      else { gasCol.setHex(STROKE_COL.intake).lerp(gasCol2.setHex(STROKE_COL.compression), k); op = 0.32 + 0.22 * k; }
      g.mesh.material.color.copy(gasCol); g.mesh.material.opacity = op;
      // the spark jumps a few degrees before the top of the compression stroke
      const sparking = state.run && (p > 708 || p < 16);
      g.spark.visible = sparking;
      if (sparking) g.spark.scale.setScalar(0.7 + 0.9 * Math.abs(Math.sin((p + 12) * 0.5)));
      if (g.stroke !== st) {
        g.stroke = st;
        g.chip.querySelector('span').textContent = t('stroke_' + st);
        g.chip.querySelector('i').style.background = '#' + STROKE_COL[st].toString(16).padStart(6, '0');
        g.chip.dataset.stroke = st;
      }
    }
  }
  const chipPos = new THREE.Vector3();
  function placeStrokeChips() {
    // each label over its own cylinder, pushed apart where the view puts the cylinders close together
    const pts = [];
    for (let i = 0; i < 4; i++) {
      chipPos.set(KIN.cylX[i], KIN.chipY, 0);
      const p = projectPx(chipPos);
      pts.push({ i, x: p.x, y: p.y, w: gas[i].chip.offsetWidth + 6, behind: p.behind });
    }
    pts.sort((a, b) => a.x - b.x);
    for (let k = 1; k < pts.length; k++) pts[k].x = Math.max(pts[k].x, pts[k - 1].x + (pts[k - 1].w + pts[k].w) / 2);
    for (let k = pts.length - 2; k >= 0; k--) pts[k].x = Math.min(pts[k].x, pts[k + 1].x - (pts[k + 1].w + pts[k].w) / 2);
    for (const p of pts) {
      const chip = gas[p.i].chip;
      chip.hidden = p.behind;
      // kept inside the uncovered part of the screen, under the prompt and above the dock
      const y = Math.max(layout.top + 30, Math.min(layout.h - layout.bottom - 6, p.y));
      chip.style.transform = `translate(${p.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
  // The timing chain as it runs: its links are placed along the chain's path and moved on with the crankshaft, so they
  // stay meshed with the sprockets' teeth. (Standing still, the chain is the ordinary piece of the model.)
  const chainRun = { rollers: null, plates: null, cum: null, total: 0 };
  function makeChainRun() {
    const C = KIN.chain, n = C.path.length;
    const cum = new Float32Array(n + 1);
    for (let i = 0; i < n; i++) { const a = C.path[i], b = C.path[(i + 1) % n]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
    chainRun.cum = cum; chainRun.total = cum[n];
    const mat = new THREE.MeshStandardMaterial({ color: PAL.chain.c, roughness: PAL.chain.r, metalness: PAL.chain.m });
    const rg = new THREE.CylinderGeometry(0.0026, 0.0026, 0.0066, 8); rg.rotateZ(Math.PI / 2);   // rollers lie across the chain
    chainRun.rollers = new THREE.InstancedMesh(rg, mat, C.n);
    chainRun.plates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0015, 0.0066, C.pitch + 0.006), mat, C.n * 2);
    for (const m of [chainRun.rollers, chainRun.plates]) { m.visible = false; m.frustumCulled = false; m.raycast = () => {}; scene.add(m); }
  }
  function chainPoint(s, out) {   // the point a distance s along the chain's path, as (y, z)
    const C = KIN.chain, cum = chainRun.cum, n = C.path.length;
    s = ((s % chainRun.total) + chainRun.total) % chainRun.total;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const a = C.path[lo], b = C.path[(lo + 1) % n], f = (s - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo]);
    out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f;
    return out;
  }
  const chM = new THREE.Matrix4(), chQ = new THREE.Quaternion(), chP = new THREE.Vector3(), chS = new THREE.Vector3(1, 1, 1), chX = new THREE.Vector3(1, 0, 0);
  function updateChainRun() {
    const C = KIN.chain, on = state.run && inView(BONE.chain) && inScope(BONE.chain) && !state.hidden.has('chain');
    chainRun.rollers.visible = chainRun.plates.visible = on;
    if (!on) return;
    // the crank's sprocket pulls the chain down the intake side: the opposite way to the order the path's points run
    const step = chainRun.total / C.n, shift = -C.rCrank * rad(theta);
    const pts = [];
    for (let i = 0; i < C.n; i++) pts.push(chainPoint(i * step + shift, [0, 0]));
    for (let i = 0; i < C.n; i++) {
      const a = pts[i], b = pts[(i + 1) % C.n];
      chainRun.rollers.setMatrixAt(i, chM.makeTranslation(C.x, a[0], a[1]));
      chQ.setFromAxisAngle(chX, Math.atan2(-(b[0] - a[0]), b[1] - a[1]));   // turn the plate's long side (z) along the link
      const off = i % 2 === 0 ? 0.0041 : 0.0056;
      for (const s of [1, -1]) {
        chP.set(C.x + s * off, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        chainRun.plates.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), chM.compose(chP, chQ, chS));
      }
    }
    chainRun.rollers.instanceMatrix.needsUpdate = true; chainRun.plates.instanceMatrix.needsUpdate = true;
  }
  function setRun(on) {
    if (on === state.run) return;
    if (on && state.mode !== 'study') { toast(t('run_study_only')); return; }
    state.run = on;
    if (on) {
      state.explodeFloor = 0;
      if (state.explode !== 0) setExplode(0);
      if (api.study) { api.study.peek = null; api.study.cleared = true; }
      setGlow([]); setCallout(null);
      if (zoomed()) setView('all', false);
      const box = scopeBox('all'); flyTo(box.getCenter(new THREE.Vector3()), fitBoxDistance(box, VIEW_DIRS.run) * 0.92, VIEW_DIRS.run);
    }
    document.body.classList.toggle('running', on);
    $('runBtn').setAttribute('aria-pressed', String(on));
    $('runBox').hidden = !on; $('strokes').hidden = !on;
    occ.key = ''; piecesDirty = true;
    applyVisibility(); renderRunSpeed(); renderPrompt(); resize();
  }
  function renderRunSpeed() {
    $('runSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.runSpeed)));
  }
  $('runBtn').addEventListener('click', () => { setRun(!state.run); closeViewSheetOnPhone(); });
  $('runSeg').addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.v; if (!v) return;
    state.runSpeed = v; store.set('runSpeed', v); renderRunSpeed();
  });

  function renderRunPrompt() {
    $('pEyebrow').textContent = t('run_eyebrow');
    $('pName').textContent = t('run_name');
    $('pMeta').textContent = t('run_meta');
    const el = $('pTip'); el.hidden = false;
    const parts = [];
    ['intake', 'compression', 'power', 'exhaust'].forEach((k, i) => {
      const b = document.createElement('b'); b.textContent = t('stroke_' + k) + ': ';
      parts.push(b, document.createTextNode(t('stroke_' + k + '_text') + ' '));
      if (i < 3) parts.push(document.createElement('br'));
    });
    el.replaceChildren(...parts);
    $('pBar').style.width = '0%';
  }

  /* ---------------- where the shared code calls in ---------------- */
  state.explode = 0;          // how far apart the engine is: 0 assembled … 3 everything apart (see setExplode)
  state.explodeFloor = 0;     // the level picked by hand; stepping through parts never closes the engine past it
  state.run = false; state.runSpeed = store.get('runSpeed', 'slow');
  if (!['slow', 'medium', 'fast'].includes(state.runSpeed)) state.runSpeed = 'slow';
  let modelRoot = null, lastTick = 0;
  return {
    // each piece sits in a holder, which is what moves it (apart, or round with the crank)
    wrap(mesh) {
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false;
      mesh.parent.add(holder); holder.add(mesh);
      mesh.geometry.computeBoundingBox();
    },
    record(rec) {
      rec.holder = rec.mesh.parent;
      rec.box0 = rec.mesh.geometry.boundingBox.clone().applyMatrix4(rec.mesh.matrixWorld);
      rec.moves = rec.data.ex.map(([s, x, y, z]) => ({ s, v: new THREE.Vector3(x, y, z), d: 0 }));
      rec.off = new THREE.Vector3(); rec.center0 = rec.center.clone(); rec.anchor0 = rec.anchor.clone();
    },
    pick(r, pk) { r.holder.add(pk); pk.add(r.overlay); return true; },   // a piece's click mesh and glow move with it
    model(root) {
      modelRoot = root;
      // within a stage the parts that travel furthest leave first, so the engine opens like a flower instead of all at once
      const far = [0, 0, 0, 0];
      for (const r of bones.values()) for (const m of r.moves) far[m.s] = Math.max(far[m.s], m.v.length());
      for (const r of bones.values()) for (const m of r.moves) m.d = STAGGER * (1 - m.v.length() / far[m.s]);
      makeGas(); makeChainRun();
      updatePieces();
    },
    ready() { renderExplode(); renderRunSpeed(); $('runBtn').disabled = state.mode !== 'study'; },
    // running: the housings turn to glass, and the moving chain is drawn instead of the still one (which stays clickable)
    piece(r) {
      return { hidden: state.run && r.id === 'chain', stillLive: r.id === 'chain', ghost: state.run && !r.data.run ? (r.data.shell ? 0.16 : 0.045) : null };
    },
    stop() { if (!state.run) return false; setRun(false); return true; },
    expose(ids, keepOpen) { exposeFor(stageOf(ids), keepOpen); },   // open the engine as far as these parts need
    scopeSphere, frameSection, showBones,
    resetView: frameAfterExplode,
    searchPick(u, recs) {
      if (state.run) setRun(false);
      exposeFor(stageOf(u.members));
      studyPick(recs[0]);
      callout.anchorId = null;   // point at whichever of the set is best placed
      showBones(recs);
    },
    key(k) {
      if (k === 'g') setRun(!state.run);
      else if (k === ']' || k === 'e') stepExplode(1);
      else if (k === '[' || k === 'q') stepExplode(-1);
      else return false;
      return true;
    },
    voiceParse(w) { const act = VOICE_ACTION_LOOKUP.get(w.join('')); return act ? { act } : null; },
    voiceDo(cmd, text) {
      if (!cmd.act) return false;   // not one of ours: an area to zoom to
      if (cmd.act === 'run') setRun(true);
      else if (cmd.act === 'stop') setRun(false);
      else { setExplode(Number(cmd.act.slice(2)), { byHand: true }); frameAfterExplode(); }
      const said = cmd.act === 'run' ? t('run_btn') : cmd.act === 'stop' ? t('run_stop') : t('ex_' + cmd.act.slice(2));
      voiceStatus(t('voice_did', { text, view: said }), 'ok');
      if (state.clean || narrow()) toast(said);
      return true;
    },
    prompt() { if (!state.run) return false; renderRunPrompt(); return true; },
    modeChanging(m) { if (state.run && m !== 'study') setRun(false); },
    modeChanged(m) { $('runBtn').disabled = m !== 'study'; },
    language() { for (const g of gas) g.stroke = ''; },   // the stroke labels are redrawn in the new language
    // every frame: the engine opening or closing, and running
    tick(now) {
      const dt = Math.min(0.1, (now - (lastTick || now)) / 1000); lastTick = now;
      if (explodeTween) {
        const k = Math.min(1, (now - explodeTween.t0) / explodeTween.dur);
        explodeNow = explodeTween.from + (explodeTween.to - explodeTween.from) * k;
        if (k >= 1) explodeTween = null;
        piecesDirty = true;
        if (document.activeElement !== $('explodeRange')) $('explodeRange').value = String(explodeNow);
      }
      if (state.run && !api.pendingConfirm) { theta = (theta + RUN_SPEED[state.runSpeed] * dt) % 720; piecesDirty = true; }
      if (piecesDirty && bones.size) { updatePieces(); if (gas.length) { updateGas(); updateChainRun(); } }
    },
    frame() { if (state.run) placeStrokeChips(); },
    occKey: () => explodeTween ? null : explodeNow.toFixed(2) + '|',
    // the tests: finish any opening or closing at once, and reach in
    flyNow() {
      if (explodeTween) { explodeNow = explodeTween.to; explodeTween = null; }
      updatePieces(); if (gas.length) { updateGas(); updateChainRun(); }
    },
    handles: { setExplode, setRun, exposeFor, stepExplode, getExplode: () => explodeNow, getTheta: () => theta, setTheta: (v) => { theta = v; piecesDirty = true; }, updatePieces },
  };
}
