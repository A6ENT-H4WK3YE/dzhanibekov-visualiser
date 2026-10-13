// Three.js scene: the three-arm body and the world-frame angular momentum arrow.
// No physics here: render.js only draws the state it is given.
//
// Frames: the physics world frame is used directly as the Three.js world frame (x, y, z unchanged,
// Three.js y is "up" on screen). The body group's quaternion is the physics q (body -> world),
// which is exactly what Three.js object.quaternion means (local -> world). Only the component
// order differs: physics [w, x, y, z], Three.js (x, y, z, w).

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';

export const AXIS_COLOURS = ['#e15759', '#59a14f', '#4e79a7']; // axis 1, 2, 3
const L_COLOUR = '#f2b134';

// Unit vectors of the three body axes in Three.js coordinates.
const AXIS_DIRS = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 5, 4);
  scene.add(sun);

  // Faint world-frame axes so the fixed frame is visible behind the moving body.
  const worldAxes = new THREE.AxesHelper(1);
  worldAxes.material.transparent = true;
  worldAxes.material.opacity = 0.25;
  scene.add(worldAxes);

  const body = new THREE.Group();
  scene.add(body);

  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, L_COLOUR);
  scene.add(arrow);

  let arrowLength = 1;

  // Build the body: arm k is a cylinder of length a[k] along body axis k, centred on the origin.
  // A sphere marks the + end of each arm. The spheres are visual only (massless): without them
  // a 180 degree flip of this symmetric body would look like nothing happened.
  function setArms(a) {
    body.children.slice().forEach((child) => {
      body.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    });
    const maxA = Math.max(...a);
    const radius = 0.035 * maxA;
    a.forEach((len, k) => {
      const mat = new THREE.MeshStandardMaterial({ color: AXIS_COLOURS[k], roughness: 0.45 });
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 24), mat);
      // CylinderGeometry runs along +y; rotate it onto body axis k.
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), AXIS_DIRS[k]);
      body.add(rod);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.9, 24, 16), mat.clone());
      tip.position.copy(AXIS_DIRS[k]).multiplyScalar(len / 2);
      body.add(tip);
    });
    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.6, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6 }),
    );
    body.add(hub);
    arrowLength = 0.75 * maxA;
    worldAxes.scale.setScalar(0.6 * maxA);
    orbit.radius = 2.6 * maxA;
    updateCamera();
  }

  // q: physics quaternion [w, x, y, z] (body -> world). Lworld: world-frame L (any length).
  function update(q, Lworld) {
    body.quaternion.set(q[1], q[2], q[3], q[0]);
    const L = new THREE.Vector3(Lworld[0], Lworld[1], Lworld[2]);
    const n = L.length();
    if (n > 0) {
      arrow.visible = true;
      arrow.setDirection(L.divideScalar(n));
      arrow.setLength(arrowLength, 0.12 * arrowLength, 0.06 * arrowLength);
    } else {
      arrow.visible = false;
    }
    renderer.render(scene, camera);
  }

  // Minimal orbit camera: drag to rotate about the origin, wheel to zoom.
  const orbit = { theta: 0.9, phi: 1.1, radius: 7 };
  function updateCamera() {
    const { theta, phi, radius } = orbit;
    camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(0, 0, 0);
  }
  let drag = null;
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.theta -= (e.clientX - drag.x) * 0.008;
    orbit.phi = Math.min(Math.PI - 0.05, Math.max(0.05, orbit.phi - (e.clientY - drag.y) * 0.008));
    drag = { x: e.clientX, y: e.clientY };
    updateCamera();
  });
  el.addEventListener('pointerup', () => (drag = null));
  el.addEventListener('pointercancel', () => (drag = null));
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      orbit.radius *= Math.exp(e.deltaY * 0.001);
      updateCamera();
    },
    { passive: false },
  );

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  updateCamera();

  return { setArms, update };
}
