import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color($('#bgColor').value);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .01, 100);
camera.position.set(0, 0, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
$('#stage').appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.3, .65, .03);
composer.addPass(bloom);

scene.add(new THREE.HemisphereLight(0xffffff, 0x191928, 2.1));
const key = new THREE.DirectionalLight(0xffffff, 4.5);
key.position.set(4, 5, 6);
scene.add(key);
const rim = new THREE.PointLight(0x00ffff, 18, 25);
rim.position.set(-4, 1, 4);
scene.add(rim);

const root = new THREE.Group();
scene.add(root);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;

let dragon = null;
let bodyMaterials = [];
let eyeMaterials = [];
const eyeProxies = [];
const clock = new THREE.Clock();

const values = ['scale','zoom','x','y','speed','rgbSpeed','bodyGlow','eyeGlow'];
const number = id => parseFloat($(id).value);
function updateOutputs(){
  for(const id of values){
    const out = $(id+'Out');
    if(out) out.textContent = Number($(id).value).toFixed(2);
  }
}
values.forEach(id => $(id).addEventListener('input', updateOutputs));
updateOutputs();

function makeEyeProxy(parent, x){
  const mat = new THREE.MeshBasicMaterial({ color: $('#eyeColor').value });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(.055, 20, 12), mat);
  mesh.position.set(x, .16, .5);
  parent.add(mesh);
  eyeProxies.push({mesh, mat});
}

function prepareModel(obj){
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  obj.scale.setScalar(3.5 / (Math.max(size.x,size.y,size.z) || 1));

  bodyMaterials = [];
  eyeMaterials = [];

  obj.traverse(node => {
    if(!node.isMesh) return;
    const src = node.material || {};
    const eyeLike = /eye|pupil|iris/i.test(`${node.name||''} ${src.name||''}`);
    const mat = new THREE.MeshStandardMaterial({
      map: src.map || null,
      color: eyeLike ? $('#eyeColor').value : 0xffffff,
      emissive: eyeLike ? $('#eyeColor').value : 0xffffff,
      emissiveIntensity: eyeLike ? number('eyeGlow') : number('bodyGlow'),
      metalness: eyeLike ? .05 : .25,
      roughness: eyeLike ? .18 : .42
    });
    node.material = mat;
    (eyeLike ? eyeMaterials : bodyMaterials).push(mat);
  });

  dragon = obj;
  root.add(dragon);

  // If the GLB does not label eye meshes, add two small independent glowing eye proxies.
  if(eyeMaterials.length === 0){
    makeEyeProxy(dragon, -.10);
    makeEyeProxy(dragon, .10);
    $('#status').textContent = 'Dragon loaded. Added separate glowing eye markers.';
  } else {
    $('#status').textContent = `Dragon loaded. Found ${eyeMaterials.length} eye material(s).`;
  }
}

new GLTFLoader().load(
  './dragon.glb',
  gltf => prepareModel(gltf.scene),
  undefined,
  err => {
    console.error(err);
    $('#status').textContent = 'Could not load dragon.glb. Keep it beside index.html.';
  }
);

$('#bgColor').addEventListener('input', e => scene.background.set(e.target.value));
$('#reset').onclick = () => location.reload();
$('#toggleUI').onclick = () => $('#panel').classList.toggle('hidden');

function animate(){
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const preset = $('#preset').value;
  const paused = $('#pause').checked;

  camera.position.z = number('zoom');
  root.scale.setScalar(number('scale'));
  root.position.set(number('x'), number('y'), 0);

  if(dragon && !paused){
    const sp = number('speed');
    if(preset === 'sweep'){
      const phase = (t * sp * .18) % 1;
      root.position.x += (phase * 2 - 1) * 3.2;
      root.position.y += Math.sin(phase * Math.PI * 2) * .28;
      root.scale.multiplyScalar(.84 + .22 * Math.sin(Math.PI * phase));
    }else if(preset === 'float'){
      root.position.y += Math.sin(t * sp * 1.25) * .45;
      root.position.x += Math.sin(t * sp * .65) * .25;
    }
  }

  const bodyColor = $('#bodyRGB').checked
    ? new THREE.Color().setHSL((t * number('rgbSpeed') * .12) % 1, 1, .55)
    : new THREE.Color(0xffffff);

  bodyMaterials.forEach(mat => {
    mat.color.copy(bodyColor);
    mat.emissive.copy(bodyColor);
    mat.emissiveIntensity = number('bodyGlow');
  });
  rim.color.copy(bodyColor);

  const eyeColor = $('#eyeRGB').checked
    ? new THREE.Color().setHSL((t * .25) % 1, 1, .55)
    : new THREE.Color($('#eyeColor').value);
  const eyePulse = $('#eyePulse').checked ? .65 + .35 * Math.sin(t * 5.2) : 1;

  eyeMaterials.forEach(mat => {
    mat.color.copy(eyeColor);
    mat.emissive.copy(eyeColor);
    mat.emissiveIntensity = number('eyeGlow') * eyePulse;
  });
  eyeProxies.forEach(({mat}) => mat.color.copy(eyeColor));

  bloom.strength = 1.2 + number('bodyGlow') * .25 + number('eyeGlow') * .04;
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
