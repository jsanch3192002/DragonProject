import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const MODEL_URL = './chinese_dragon.glb';

const STORAGE_KEY = 'galaxyDragonSettingsV1';

const defaults = {
  galaxyEnabled: true,
  colorSpeed: 0.22,
  bodyGlow: 2.7,
  starDensity: 520,
  particleSize: 0.026,
  eyeRgb: true,
  eyeGlow: 8.5,
  eyeColor: '#6ff7ff',
  autoFlight: true,
  flightSpeed: 0.55,
  floatAmount: 0.45,
  dragonScale: 1.15,
  cameraDistance: 4.8,
  bloom: 1.45,
  exposure: 1.1,
  background: '#00ff00'
};

let settings = loadSettings();
let dragon = null;
let dragonBaseScale = 1;
let dragonMaterials = [];
let eyeMaterials = [];
let animationMixer = null;
let particles = null;
let particleGeometry = null;
let paused = false;
let modelRadius = 1.5;
let userInteractingUntil = 0;

const loading = document.getElementById('loading');
const errorBox = document.getElementById('error');
const statusEl = document.getElementById('status');

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function showError(message) {
  errorBox.style.display = 'block';
  errorBox.textContent = message;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(settings.background);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.01,
  250
);
camera.position.set(0, 0.7, settings.cameraDistance);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = settings.exposure;
renderer.domElement.setAttribute('aria-label', 'Interactive Galaxy Dragon');
document.body.insertBefore(renderer.domElement, document.body.firstChild);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
composer.setSize(window.innerWidth, window.innerHeight);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  settings.bloom,
  0.65,
  0.08
);
composer.addPass(bloomPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.minDistance = 0.3;
controls.maxDistance = 30;
controls.target.set(0, 0, 0);
controls.addEventListener('start', () => {
  userInteractingUntil = performance.now() + 7000;
});
controls.addEventListener('change', () => {
  userInteractingUntil = performance.now() + 7000;
});

const ambient = new THREE.HemisphereLight(0xbac9ff, 0x25153f, 2.2);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 4.0);
keyLight.position.set(4, 7, 6);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x7c4dff, 16, 30, 2);
rimLight.position.set(-4, 2, -3);
scene.add(rimLight);

const cyanLight = new THREE.PointLight(0x20e9ff, 11, 25, 2);
cyanLight.position.set(4, -1, 2);
scene.add(cyanLight);

const loader = new GLTFLoader();
statusEl.textContent = 'Downloading dragon model…';

loader.load(
  MODEL_URL,
  (gltf) => {
    dragon = gltf.scene;
    scene.add(dragon);

    prepareDragonMaterials(dragon);
    frameDragon(dragon);

    if (gltf.animations?.length) {
      animationMixer = new THREE.AnimationMixer(dragon);
      for (const clip of gltf.animations) {
        animationMixer.clipAction(clip).play();
      }
    }

    rebuildParticles();
    loading.classList.add('hidden');
    statusEl.textContent = eyeMaterials.length
      ? `Ready • ${eyeMaterials.length} eye material${eyeMaterials.length === 1 ? '' : 's'} detected`
      : 'Ready • no separately named eye mesh detected';
  },
  (event) => {
    if (event.total) {
      const pct = Math.round((event.loaded / event.total) * 100);
      statusEl.textContent = `Loading model ${pct}%`;
    } else {
      statusEl.textContent = `Loading model ${Math.round(event.loaded / 1048576)} MB`;
    }
  },
  (error) => {
    console.error(error);
    loading.classList.add('hidden');
    statusEl.textContent = 'Model failed to load';
    showError(
      'The dragon model could not be loaded. Check that the Dropbox link still works and allows direct access. Open the browser console for technical details.'
    );
  }
);

function prepareDragonMaterials(root) {
  const seen = new Set();

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    obj.frustumCulled = false;

    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    const cloned = materials.map((mat) => {
      const clone = mat.clone();
      clone.transparent = mat.transparent;
      clone.depthWrite = mat.depthWrite;
      clone.side = mat.side;
      clone.needsUpdate = true;

      if (!clone.emissive) clone.emissive = new THREE.Color(0x000000);
      if (clone.emissiveIntensity === undefined) clone.emissiveIntensity = 1;

      if (!seen.has(clone.uuid)) {
        seen.add(clone.uuid);
        dragonMaterials.push({
          material: clone,
          baseColor: clone.color ? clone.color.clone() : new THREE.Color(0xffffff),
          baseEmissive: clone.emissive.clone(),
          baseEmissiveIntensity: clone.emissiveIntensity
        });
      }

      const searchable = `${obj.name} ${mat.name || ''}`.toLowerCase();
      if (/(^|[^a-z])(eye|eyes|eyeball|pupil|iris|cornea)([^a-z]|$)/.test(searchable)) {
        eyeMaterials.push(clone);
      }

      return clone;
    });

    obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
  });
}

function frameDragon(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.sub(center);

  modelRadius = Math.max(size.x, size.y, size.z) * 0.5 || 1.5;
  dragonBaseScale = 2.6 / Math.max(size.x, size.y, size.z, 0.001);
  applyDragonScale();

  controls.target.set(0, 0, 0);
  resetCamera();
}

function applyDragonScale() {
  if (!dragon) return;
  const s = dragonBaseScale * settings.dragonScale;
  dragon.scale.setScalar(s);
}

function resetCamera() {
  const distance = settings.cameraDistance;
  camera.position.set(0, 0.45, distance);
  controls.target.set(0, 0, 0);
  controls.update();
}

function rebuildParticles() {
  if (particles) {
    dragon?.remove(particles);
    particleGeometry?.dispose();
    particles.material.dispose();
  }

  if (!dragon) return;

  const count = Math.round(settings.starDensity);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  const radius = 1.45;
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.35 + Math.pow(Math.random(), 0.65) * 0.8);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.72;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    color.setHSL((0.55 + Math.random() * 0.28) % 1, 1, 0.68);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    scales[i] = 0.5 + Math.random() * 1.5;
  }

  particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  const material = new THREE.PointsMaterial({
    size: settings.particleSize,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  particles = new THREE.Points(particleGeometry, material);
  particles.name = 'GalaxyParticles';
  dragon.add(particles);
}

function updateGalaxyMaterials(t) {
  const enabled = settings.galaxyEnabled;
  const speed = settings.colorSpeed;
  const bodyHue = (0.62 + t * speed * 0.08) % 1;
  const bodyColor = new THREE.Color().setHSL(bodyHue, 0.92, 0.55);
  const secondary = new THREE.Color().setHSL((bodyHue + 0.17) % 1, 1, 0.58);

  for (let i = 0; i < dragonMaterials.length; i++) {
    const entry = dragonMaterials[i];
    const mat = entry.material;

    if (!enabled) {
      if (mat.color) mat.color.copy(entry.baseColor);
      mat.emissive.copy(entry.baseEmissive);
      mat.emissiveIntensity = entry.baseEmissiveIntensity;
      continue;
    }

    const wave = 0.5 + 0.5 * Math.sin(t * 1.15 + i * 0.73);
    const blended = bodyColor.clone().lerp(secondary, wave * 0.65);

    if (mat.color) {
      mat.color.copy(entry.baseColor).lerp(blended, 0.28);
    }
    mat.emissive.copy(blended);
    mat.emissiveIntensity = settings.bodyGlow * (0.78 + wave * 0.38);
  }

  if (eyeMaterials.length) {
    const eyeColor = settings.eyeRgb
      ? new THREE.Color().setHSL((t * 0.22 + 0.47) % 1, 1, 0.65)
      : new THREE.Color(settings.eyeColor);

    const pulse = 0.8 + 0.2 * Math.sin(t * 4.5);
    for (const mat of eyeMaterials) {
      if (mat.color) mat.color.copy(eyeColor);
      mat.emissive.copy(eyeColor);
      mat.emissiveIntensity = settings.eyeGlow * pulse;
    }
  }

  if (particles) {
    particles.visible = enabled;
    particles.material.size = settings.particleSize;
    particles.rotation.y = t * 0.08;
    particles.rotation.x = Math.sin(t * 0.19) * 0.13;
    particles.material.opacity = 0.67 + Math.sin(t * 2.2) * 0.18;
  }

  rimLight.color.setHSL((bodyHue + 0.08) % 1, 0.95, 0.6);
  cyanLight.color.setHSL((bodyHue + 0.43) % 1, 0.95, 0.62);
}

function updateCinematicMotion(t) {
  if (!dragon) return;

  if (settings.autoFlight && !paused) {
    const speed = settings.flightSpeed;
    const f = settings.floatAmount;

    dragon.position.x = Math.sin(t * 0.22 * speed) * 0.42;
    dragon.position.y = Math.sin(t * 0.58 * speed) * f;
    dragon.position.z = Math.sin(t * 0.31 * speed) * 0.18;

    dragon.rotation.y = Math.sin(t * 0.24 * speed) * 0.28;
    dragon.rotation.z = Math.sin(t * 0.48 * speed) * 0.07;
    dragon.rotation.x = Math.sin(t * 0.36 * speed) * 0.05;

    if (performance.now() > userInteractingUntil) {
      const distance = settings.cameraDistance;
      const targetX = Math.sin(t * 0.12 * speed) * 0.62;
      const targetY = 0.34 + Math.sin(t * 0.19 * speed) * 0.20;
      const targetZ = distance + Math.sin(t * 0.15 * speed) * 0.35;

      camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.018);
      controls.target.lerp(dragon.position.clone().multiplyScalar(0.22), 0.03);
    }
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!paused && animationMixer) animationMixer.update(dt);

  updateCinematicMotion(t);
  updateGalaxyMaterials(t);

  controls.update();
  composer.render();
}

animate();

function bindRange(id, key, formatter = (v) => Number(v).toFixed(2), onChange = null) {
  const input = document.getElementById(id);
  const value = document.getElementById(`${id}Value`);
  input.value = settings[key];
  value.textContent = formatter(settings[key]);

  input.addEventListener('input', () => {
    settings[key] = Number(input.value);
    value.textContent = formatter(settings[key]);
    onChange?.();
    saveSettings();
  });
}

function bindCheckbox(id, key, onChange = null) {
  const input = document.getElementById(id);
  input.checked = Boolean(settings[key]);
  input.addEventListener('change', () => {
    settings[key] = input.checked;
    onChange?.();
    saveSettings();
  });
}

function bindColor(id, key, onChange = null) {
  const input = document.getElementById(id);
  input.value = settings[key];
  input.addEventListener('input', () => {
    settings[key] = input.value;
    onChange?.();
    saveSettings();
  });
}

function initUI() {
  bindCheckbox('galaxyEnabled', 'galaxyEnabled');
  bindRange('colorSpeed', 'colorSpeed');
  bindRange('bodyGlow', 'bodyGlow');
  bindRange('starDensity', 'starDensity', (v) => String(Math.round(v)), rebuildParticles);
  bindRange('particleSize', 'particleSize', (v) => Number(v).toFixed(3));

  bindCheckbox('eyeRgb', 'eyeRgb');
  bindRange('eyeGlow', 'eyeGlow');
  bindColor('eyeColor', 'eyeColor');

  bindCheckbox('autoFlight', 'autoFlight');
  bindRange('flightSpeed', 'flightSpeed');
  bindRange('floatAmount', 'floatAmount');
  bindRange('dragonScale', 'dragonScale', (v) => Number(v).toFixed(2), applyDragonScale);

  bindRange('cameraDistance', 'cameraDistance', (v) => Number(v).toFixed(2), resetCamera);
  bindRange('bloom', 'bloom', (v) => Number(v).toFixed(2), () => {
    bloomPass.strength = settings.bloom;
  });
  bindRange('exposure', 'exposure', (v) => Number(v).toFixed(2), () => {
    renderer.toneMappingExposure = settings.exposure;
  });
  bindColor('background', 'background', () => {
    scene.background.set(settings.background);
    document.body.style.background = settings.background;
  });

  document.getElementById('hideUi').addEventListener('click', () => {
    document.body.classList.add('ui-hidden');
  });

  document.getElementById('showUi').addEventListener('click', () => {
    document.body.classList.remove('ui-hidden');
  });

  document.getElementById('resetCamera').addEventListener('click', resetCamera);

  document.getElementById('pause').addEventListener('click', (event) => {
    paused = !paused;
    event.currentTarget.textContent = paused ? 'Resume' : 'Pause';
  });

  document.getElementById('fullscreen').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (error) {
      console.warn('Fullscreen unavailable:', error);
    }
  });

  document.getElementById('resetAll').addEventListener('click', () => {
    settings = { ...defaults };
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  renderer.domElement.addEventListener('dblclick', () => {
    document.body.classList.toggle('ui-hidden');
  });
}

initUI();

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
});

window.addEventListener('error', (event) => {
  console.error(event.error || event.message);
});
