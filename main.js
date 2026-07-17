import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const msg=document.getElementById('msg');
const scene=new THREE.Scene();scene.background=new THREE.Color(0x00ff00);
const cam=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,1000);
cam.position.set(0,2,5);
const r=new THREE.WebGLRenderer({antialias:true});r.setSize(innerWidth,innerHeight);document.body.appendChild(r.domElement);
const c=new OrbitControls(cam,r.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x444444,2));
const d=new THREE.DirectionalLight(0xffffff,3);d.position.set(5,5,5);scene.add(d);
let mixer;const clock=new THREE.Clock();
new GLTFLoader().load('./models/chinese_dragon.glb',g=>{
 msg.textContent='Loaded';
 scene.add(g.scene);
 const box=new THREE.Box3().setFromObject(g.scene);
 const ctr=box.getCenter(new THREE.Vector3());
 const size=box.getSize(new THREE.Vector3()).length();
 g.scene.position.sub(ctr);
 cam.position.set(size*.7,size*.4,size);
 c.target.set(0,0,0);c.update();
 if(g.animations.length){mixer=new THREE.AnimationMixer(g.scene);g.animations.forEach(a=>mixer.clipAction(a).play());}
},xhr=>{if(xhr.total)msg.textContent='Loading '+Math.round(xhr.loaded/xhr.total*100)+'%';},e=>msg.textContent='Error '+e);
addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();r.setSize(innerWidth,innerHeight);});
(function anim(){requestAnimationFrame(anim);if(mixer)mixer.update(clock.getDelta());c.update();r.render(scene,cam);})();