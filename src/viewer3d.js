// 3D náhled stroje: parametrické modely z data/hw/machineModels.js (tvoje modely ze Silicon Logic Studia).
// Načítá se až na vyžádání, three.js tak nezdržuje start hry.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MACHINE_MODELS, buildMachine } from '../data/hw/machineModels.js';

export const has3D = (kind) => kind in MACHINE_MODELS;

/** Vloží do prvku plátno s otočným modelem; vrací { modules, dispose }. */
export function mount(el, kind) {
  const w = el.clientWidth || 320, h = 220;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(w, h);
  el.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x2a1f16, 1.15));
  for (const [x, y, z, i] of [[4, 8, 6, 1.6], [-6, 5, -3, 0.7], [0, 3, -8, 0.5]]) { const l = new THREE.DirectionalLight(0xffffff, i); l.position.set(x, y, z); scene.add(l); }
  const mods = buildMachine(kind), root = new THREE.Group(), anims = [];
  for (const m of mods) {
    const nm = m.name ?? '';
    const spin = /Otočný stůl|Leštící|Navíjecí|Vodicí válce/.test(nm), pan = /Robot/.test(nm);
    const bob = /Hlava|Bondovací|Kapilára|Termokompresní|Tažná|Lodička/.test(nm), slide = /Portál|Jeřábový|Šablona/.test(nm);
    if (spin || pan) {
      const box = new THREE.Box3().setFromObject(m.obj), center = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const piv = new THREE.Group(); piv.position.copy(center); m.obj.position.sub(center); piv.add(m.obj); root.add(piv);
      anims.push({ obj: piv, kind: pan ? 'pan' : /Otočný stůl|Leštící/.test(nm) ? 'spinY' : sz.x > sz.z ? 'spinX' : 'spinZ', bx: center.x, by: center.y, bz: center.z });
    } else {
      root.add(m.obj);
      if (bob || slide) anims.push({ obj: m.obj, kind: bob ? 'bob' : 'slide', bx: m.obj.position.x, by: m.obj.position.y, bz: m.obj.position.z });
    }
  }
  scene.add(root);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  const grid = new THREE.GridHelper(Math.ceil(span * 2), Math.ceil(span * 2), 0x6b5435, 0x3a2c1f); // čtverec mřížky = 1 m
  grid.position.set(mid.x, 0, mid.z); scene.add(grid);
  const cam = new THREE.PerspectiveCamera(32, w / h, 0.05, span * 40);
  cam.position.set(mid.x + span * 1.0, mid.y + span * 0.8, mid.z - span * 1.25);
  const ctl = new OrbitControls(cam, renderer.domElement);
  ctl.target.copy(mid); ctl.enableDamping = true; ctl.dampingFactor = 0.15; ctl.autoRotate = true; ctl.autoRotateSpeed = 1.2;
  ctl.addEventListener('start', () => { ctl.autoRotate = false; });
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = performance.now() / 1000;
    for (let i = 0; i < anims.length; i++) {
      const a = anims[i], ph = t + i * 0.7;
      if (a.kind === 'spinY') a.obj.rotation.y = t * 1.4;
      else if (a.kind === 'spinX') a.obj.rotation.x = t * 1.8;
      else if (a.kind === 'spinZ') a.obj.rotation.z = t * 1.8;
      else if (a.kind === 'pan') a.obj.rotation.y = Math.sin(ph * 1.2) * 0.25;
      else if (a.kind === 'bob') a.obj.position.y = a.by + Math.sin(ph * 3.2) * span * 0.015;
      else if (a.kind === 'slide') a.obj.position.x = a.bx + Math.sin(ph * 1.6) * span * 0.03;
    }
    ctl.update(); renderer.render(scene, cam);
  };
  loop();
  return {
    modules: mods.map((m) => ({ name: m.name, system: m.system })),
    size: [size.x, size.z, size.y],
    dispose() {
      cancelAnimationFrame(raf); ctl.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) for (const m of [o.material].flat()) m.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
