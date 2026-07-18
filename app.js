import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color($('#bgColor').value);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 5000);
camera.position.set(0, 0, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
$('#stage').appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.25, 0.7, 0.03);
composer.addPass(bloom);

scene.add(new THREE.HemisphereLight(0xffffff, 0x151526, 2.5));
const key = new THREE.DirectionalLight(0xffffff, 4.2);
key.position.set(5, 7, 8);
scene.add(key);
const rim = new THREE.PointLight(0x00ffff, 24, 50);
rim.position.set(-5, 1, 5);
scene.add(rim);

const root = new THREE.Group();
scene.add(root);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;

let dragon = null;
let bodyMaterials = [];
let eyeMaterials = [];
let animations = [];
let mixer = null;
let baseCameraDistance = 8;
let modelRadius = 1;
const clock = new THREE.Clock();

function num(id){ return parseFloat($(id).value); }

['size','zoom','x','y','motion','rgb','bodyGlow','eyeGlow'].forEach(id => {
  const out = $(id + 'Out');
  const sync = () => out.textContent = Number($(id).value).toFixed(2);
  $(id).addEventListener('input', sync);
  sync();
});

function fitCamera(object){
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  modelRadius = Math.max(sphere.radius, 0.001);

  const center = sphere.center.clone();
  object.position.sub(center);

  // Normalize every GLB to a predictable world size.
  const targetRadius = 2.2;
  const uniform = targetRadius / modelRadius;
  object.scale.setScalar(uniform);

  const fov = THREE.MathUtils.degToRad(camera.fov);
  baseCameraDistance = targetRadius / Math.tan(fov / 2) * 1.22;
  camera.position.set(0, 0, baseCameraDistance);
  camera.near = 0.01;
  camera.far = 1000;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

function cloneTextureSafe(tex){
  return tex || null;
}

new GLTFLoader().load(
  './dragon.glb',
  gltf => {
    dragon = gltf.scene;
    animations = gltf.animations || [];
    fitCamera(dragon);

    dragon.traverse(node => {
      if(!node.isMesh) return;

      const source = node.material || {};
      const label = `${node.name || ''} ${source.name || ''}`.toLowerCase();
      const isEye = label.includes('eye') || label.includes('iris') || label.includes('pupil');

      const mat = new THREE.MeshStandardMaterial({
        map: cloneTextureSafe(source.map),
        normalMap: cloneTextureSafe(source.normalMap),
        roughnessMap: cloneTextureSafe(source.roughnessMap),
        metalnessMap: cloneTextureSafe(source.metalnessMap),
        alphaMap: cloneTextureSafe(source.alphaMap),
        transparent: !!source.transparent,
        opacity: source.opacity ?? 1,
        side: THREE.DoubleSide,
        color: isEye ? $('#eyeColor').value : 0xffffff,
        emissive: isEye ? $('#eyeColor').value : 0xffffff,
        emissiveIntensity: isEye ? num('eyeGlow') : num('bodyGlow'),
        roughness: isEye ? 0.18 : 0.42,
        metalness: isEye ? 0.05 : 0.28
      });

      node.material = mat;
      (isEye ? eyeMaterials : bodyMaterials).push(mat);
    });

    root.add(dragon);

    if(animations.length){
      mixer = new THREE.AnimationMixer(dragon);
      animations.forEach(clip => mixer.clipAction(clip).play());
    }

    $('#status').textContent =
      `Loaded. Body materials: ${bodyMaterials.length}. Eye materials: ${eyeMaterials.length}.`;
  },
  progress => {
    if(progress.total){
      const pct = Math.round(progress.loaded / progress.total * 100);
      $('#status').textContent = `Loading dragon… ${pct}%`;
    }
  },
  err => {
    console.error(err);
    $('#status').textContent = 'Could not load dragon.glb. Keep it in the same folder as index.html.';
  }
);

$('#uiToggle').onclick = () => $('#panel').classList.toggle('hidden');
$('#resetBtn').onclick = () => location.reload();
$('#bgColor').addEventListener('input', e => scene.background.set(e.target.value));

function animate(){
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  if(mixer && !$('#pause').checked) mixer.update(dt);

  camera.position.z = baseCameraDistance / num('zoom');

  root.scale.setScalar(num('size'));
  root.position.set(num('x'), num('y'), 0);
  root.rotation.set(0, 0, 0);

  if(dragon && !$('#pause').checked){
    const speed = num('motion');
    const preset = $('#preset').value;

    if(preset === 'sweep'){
      const p = (t * speed * 0.16) % 1;
      root.position.x += (p * 2 - 1) * 3.3;
      root.position.y += Math.sin(p * Math.PI * 2) * 0.35;
    }else if(preset === 'float'){
      root.position.y += Math.sin(t * speed * 1.4) * 0.45;
      root.position.x += Math.sin(t * speed * 0.65) * 0.22;
    }else if(preset === 'orbit'){
      root.rotation.y = t * speed * 0.65;
    }
  }

  const bodyColor = $('#rgbBody').checked
    ? new THREE.Color().setHSL((t * num('rgb') * 0.12) % 1, 1, 0.55)
    : new THREE.Color(0xffffff);

  bodyMaterials.forEach(mat => {
    mat.color.copy(bodyColor);
    mat.emissive.copy(bodyColor);
    mat.emissiveIntensity = num('bodyGlow');
  });

  const eyeColor = $('#rgbEyes').checked
    ? new THREE.Color().setHSL((t * 0.25) % 1, 1, 0.55)
    : new THREE.Color($('#eyeColor').value);

  const pulse = $('#pulseEyes').checked ? 0.68 + 0.32 * Math.sin(t * 5.2) : 1;

  eyeMaterials.forEach(mat => {
    mat.color.copy(eyeColor);
    mat.emissive.copy(eyeColor);
    mat.emissiveIntensity = num('eyeGlow') * pulse;
  });

  rim.color.copy(bodyColor);
  bloom.strength = 1.0 + num('bodyGlow') * 0.28 + num('eyeGlow') * 0.035;

  controls.update();
  composer.render();
}

animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
