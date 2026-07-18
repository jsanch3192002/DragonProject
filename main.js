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
  colorSpeed: 0.42,
  bodyGlow: 1.45,
  starDensity: 520,
  particleSize: 0.026,
  eyeRgb: true,
  eyeGlow: 5.5,
  eyeColor: '#6ff7ff',
  autoFlight: true,
  flightSpeed: 0.72,
  floatAmount: 0.55,
  dragonScale: 1.28,
  cameraDistance: 3.35,
  bloom: 0.82,
  exposure: 0.82,
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
    const detail = error?.message || error?.target?.statusText || 'Unknown loading error';
    showError(
      `The dragon model could not be loaded. ${detail}`
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
    opacity: 0.68,
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
      mat.color.copy(entry.baseColor).lerp(blended, 0.72);
    }
    mat.emissive.copy(blended);
    mat.emissiveIntensity = settings.bodyGlow * (0.55 + wave * 0.30);
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
    particles.rotation.y = t * 0.11;
    particles.position.y = Math.sin(t * 0.9) * 0.05;
    particles.rotation.x = Math.sin(t * 0.19) * 0.13;
    particles.material.opacity = 0.48 + Math.sin(t * 2.2) * 0.12;
  }

  rimLight.color.setHSL((bodyHue + 0.08) % 1, 0.95, 0.6);
  cyanLight.color.setHSL((bodyHue + 0.43) % 1, 0.95, 0.62);
}


const flightPath = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(-2.2, 0.2, 1.4),
    new THREE.Vector3(-1.1, 1.1, 0.5),
    new THREE.Vector3(0.2, 0.4, -0.8),
    new THREE.Vector3(1.8, -0.4, -0.2),
    new THREE.Vector3(2.4, 0.7, 1.6),
    new THREE.Vector3(0.7, 1.4, 2.2),
    new THREE.Vector3(-1.4, 0.8, 1.8),
    new THREE.Vector3(-2.2, 0.2, 1.4)
  ],
  true,
  'catmullrom',
  0.5
);

const flightLookAhead = new THREE.Vector3();
const flightPosition = new THREE.Vector3();
const flightDirection = new THREE.Vector3();
const desiredQuaternion = new THREE.Quaternion();
const cameraTargetPosition = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
let lastFlightPhase = 0;

function smoothstep(edge0, edge1, x) {
  const v = THREE.MathUtils.clamp((x - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return v * v * (3 - 2 * v);
}

function updateCinematicMotion(t) {
  if (!dragon) return;

  if (!settings.autoFlight || paused) {
    return;
  }

  const speed = Math.max(settings.flightSpeed, 0.05);
  const phase = (t * 0.025 * speed) % 1;
  const lookAheadPhase = (phase + 0.012 + 0.008 * speed) % 1;

  flightPath.getPointAt(phase, flightPosition);
  flightPath.getPointAt(lookAheadPhase, flightLookAhead);
  flightDirection.subVectors(flightLookAhead, flightPosition).normalize();

  // Add layered, non-repeating-looking motion over the looping spline.
  const floatAmount = settings.floatAmount;
  const bodyWave =
    Math.sin(t * 1.35 * speed) * 0.18 +
    Math.sin(t * 0.53 * speed + 1.8) * 0.10;

  flightPosition.y += bodyWave * floatAmount;
  flightPosition.x += Math.sin(t * 0.41 * speed) * 0.12;
  flightPosition.z += Math.cos(t * 0.29 * speed) * 0.10;

  dragon.position.lerp(flightPosition, 0.055);

  // Orient the dragon along the flight path, then add cinematic banking.
  const yaw = Math.atan2(flightDirection.x, flightDirection.z);
  const pitch = -Math.asin(THREE.MathUtils.clamp(flightDirection.y, -1, 1));
  const phaseDelta = Math.sin((phase - lastFlightPhase) * Math.PI * 120);
  const bank =
    -Math.sin(t * 0.55 * speed) * 0.18 -
    flightDirection.x * 0.22 -
    phaseDelta * 0.05;

  const targetEuler = new THREE.Euler(
    pitch + Math.sin(t * 0.34 * speed) * 0.04,
    yaw,
    bank,
    'YXZ'
  );
  desiredQuaternion.setFromEuler(targetEuler);
  dragon.quaternion.slerp(desiredQuaternion, 0.07);

  // Small "breathing" scale pulse helps the energy-dragon feeling.
  const pulse = 1 + Math.sin(t * 2.1) * 0.012;
  const s = dragonBaseScale * settings.dragonScale * pulse;
  dragon.scale.setScalar(s);

  // Cinematic camera shots: follow, side pass, close-up, and wide orbit.
  if (performance.now() > userInteractingUntil) {
    const shotPhase = (phase * 4) % 4;
    const distance = settings.cameraDistance;

    if (shotPhase < 1) {
      // Rear three-quarter follow
      cameraTargetPosition.copy(dragon.position)
        .addScaledVector(flightDirection, -distance * 0.78)
        .add(new THREE.Vector3(0.7, 0.55, 0.55));
    } else if (shotPhase < 2) {
      // Side fly-by
      const side = new THREE.Vector3().crossVectors(worldUp, flightDirection).normalize();
      cameraTargetPosition.copy(dragon.position)
        .addScaledVector(side, distance * 0.62)
        .addScaledVector(flightDirection, -distance * 0.18)
        .add(new THREE.Vector3(0, 0.25, 0));
    } else if (shotPhase < 3.35) {
      // Long dramatic face close-up. The camera approaches from slightly
      // above and to the side so the head remains visible instead of clipping.
      const closeBlend =
        smoothstep(2.0, 2.42, shotPhase) *
        (1 - smoothstep(3.05, 3.35, shotPhase));

      const side = new THREE.Vector3()
        .crossVectors(worldUp, flightDirection)
        .normalize();

      cameraTargetPosition.copy(dragon.position)
        .addScaledVector(flightDirection, distance * (0.34 - closeBlend * 0.22))
        .addScaledVector(side, 0.22)
        .add(new THREE.Vector3(0, 0.26, 0));
    } else {
      // Wide orbit / pull-away
      const angle = t * 0.18 * speed;
      cameraTargetPosition.copy(dragon.position).add(
        new THREE.Vector3(
          Math.cos(angle) * distance * 0.85,
          0.65 + Math.sin(angle * 0.7) * 0.35,
          Math.sin(angle) * distance * 0.85
        )
      );
    }

    camera.position.lerp(cameraTargetPosition, 0.022);

    cameraLookTarget.copy(dragon.position)
      .addScaledVector(flightDirection, 0.68)
      .add(new THREE.Vector3(0, 0.08, 0));

    controls.target.lerp(cameraLookTarget, 0.045);
  }

  lastFlightPhase = phase;
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
    const root = document.documentElement;
    const request =
      root.requestFullscreen ||
      root.webkitRequestFullscreen ||
      root.webkitEnterFullscreen;

    const exit =
      document.exitFullscreen ||
      document.webkitExitFullscreen;

    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement && request) {
        await request.call(root);
        document.body.classList.add('ui-hidden');
      } else if (exit) {
        await exit.call(document);
      } else {
        // iPhone Safari often blocks true webpage fullscreen.
        // This fallback hides the interface and uses the full browser viewport.
        document.body.classList.toggle('ui-hidden');
        window.scrollTo(0, 1);
      }
    } catch (error) {
      console.warn('Fullscreen unavailable:', error);
      document.body.classList.toggle('ui-hidden');
      window.scrollTo(0, 1);
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
