/* CyberArena · props (v154) — acessórios que aparecem só durante os clipes que os usam:
   lâmina de energia (clipes "Sword …") e arco de energia (clipes "Bow …"). Ficam presos aos ossos da mão. */
const COL = { nexus: 0x45b8ff, atlas: 0xb878ff, cyber: 0xff5fd2 };

export function makeProps(THREE, by, id, k, wrap) {
  const out = { sword: null, bow: null, vis: { sword: 0, bow: 0 } };
  const col = COL[id] || 0x66ccff;
  const frameOf = side => {
    const hand = by[side + 'Hand'], i = by[side + 'HandIndex1'], p = by[side + 'HandPinky1'], m = by[side + 'HandMiddle1'];
    if (!hand || !i || !p || !m) return null;
    const g = i.position.clone().sub(p.position).normalize();                       // eixo da empunhadura (por onde passa a lâmina/arco)
    const f = m.position.clone().normalize();                                        // direção dos dedos
    const c = i.position.clone().add(p.position).multiplyScalar(.5);                 // centro do punho
    return { hand, g, f, c };
  };
  const glowMat = (a) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: a, depthWrite: false, blending: THREE.AdditiveBlending });
  // ---- espada
  const R = frameOf('Right');
  if (R) {
    const grp = new THREE.Group(), blade = new THREE.Mesh(new THREE.CylinderGeometry(.011, .015, .62, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    blade.position.y = .31 + .02; const halo = new THREE.Mesh(new THREE.CylinderGeometry(.03, .034, .66, 10), glowMat(.38)); halo.position.y = .33;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.11, .016, .03), new THREE.MeshBasicMaterial({ color: col })); guard.position.y = .01;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .1, 8), new THREE.MeshBasicMaterial({ color: 0x20243a })); hilt.position.y = -.05;
    grp.add(blade, halo, guard, hilt); grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), R.g); grp.position.copy(R.c).addScaledVector(R.f, .005);
    grp.visible = false; R.hand.add(grp); out.sword = grp;
  }
  // ---- arco (Atlas)
  const Lf = frameOf('Left');
  if (Lf && id === 'atlas') {
    const grp = new THREE.Group(), arc = new THREE.Mesh(new THREE.TorusGeometry(.28, .011, 6, 28, Math.PI * .85), new THREE.MeshBasicMaterial({ color: col }));
    arc.rotation.z = Math.PI / 2 - Math.PI * .425; arc.position.z = -.22;
    const hh = Math.sin(Math.PI * .425) * .28, str = new THREE.Mesh(new THREE.CylinderGeometry(.003, .003, hh * 2, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); str.position.z = -.22 + .28 * Math.cos(Math.PI * .425) * 0 + .0;
    const glow = new THREE.Mesh(new THREE.TorusGeometry(.28, .03, 6, 28, Math.PI * .85), glowMat(.28)); glow.rotation.z = arc.rotation.z; glow.position.z = arc.position.z;
    grp.add(arc, glow, str);
    const nrm = new THREE.Vector3().crossVectors(Lf.g, Lf.f).normalize(), mx = new THREE.Matrix4().makeBasis(nrm.clone().cross(Lf.g).normalize(), Lf.g, nrm);
    grp.quaternion.setFromRotationMatrix(mx); grp.position.copy(Lf.c); grp.visible = false; Lf.hand.add(grp); out.bow = grp;
  }
  // ---- banquinho holográfico: aparece embaixo do personagem quando ele senta numa "cadeira" (clipes Sitting Idle, assento a 0,238 da altura)
  if (wrap) {
    const g = new THREE.Group(), top = new THREE.Mesh(new THREE.CylinderGeometry(.16, .15, .022, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .55 }));
    top.position.y = .227; const rim = new THREE.Mesh(new THREE.TorusGeometry(.16, .006, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffffff })); rim.rotation.x = Math.PI / 2; rim.position.y = .238;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.018, .03, .22, 10), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .4 })); pole.position.y = .11;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .008, 20), glowMat(.5)); disc.position.y = .004;
    g.add(top, rim, pole, disc); g.position.set(0, 0, -.141); g.visible = false; wrap.add(g); out.seat = g; out.seatV = 0;
  }
  /* mostra a espada/arco enquanto o clipe atual for de espada/arco (ou o clipe que está entrando) */
  out.update = (dt, ctl) => {
    const n = ctl && ctl.cur ? ctl.cur.n : '';
    const want = { sword: false, bow: /^Bow/.test(n) };   // a lâmina de energia foi removida de todos os poderes e animações
    for (const key of ['sword', 'bow']) {
      const o = out[key]; if (!o) continue;
      out.vis[key] += ((want[key] ? 1 : 0) - out.vis[key]) * Math.min(1, dt * 14);
      o.visible = out.vis[key] > .08; if (o.visible) o.scale.setScalar(.35 + .65 * Math.min(1, out.vis[key]));
    }
  };
  const upd0 = out.update;
  out.update = (dt, ctl) => { upd0(dt, ctl); if (out.seat) { const on = !!(ctl && ctl.sitting && ctl.sitting.mode === 'chair'); out.seatV += ((on ? 1 : 0) - out.seatV) * Math.min(1, dt * 6); out.seat.visible = out.seatV > .05; out.seat.scale.set(1, .2 + .8 * out.seatV, 1); } };
  out.show = () => { }; out.forAction = () => { };
  return out;
}
