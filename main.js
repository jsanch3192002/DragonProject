import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {GLTFLoader} from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x00ff00);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.1,1000);
camera.position.set(0,1.5,5);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x444444,3));
const d=new THREE.DirectionalLight(0xffffff,3);d.position.set(5,10,5);scene.add(d);
const clock=new THREE.Clock();
let mixer,dragon;
new GLTFLoader().load('./chinese_dragon.glb',g=>{
 dragon=g.scene;scene.add(dragon);
 if(g.animations.length){mixer=new THREE.AnimationMixer(dragon);g.animations.forEach(c=>mixer.clipAction(c).play());}
},undefined,e=>console.error(e));
function anim(){requestAnimationFrame(anim);if(mixer)mixer.update(clock.getDelta());
if(dragon){dragon.rotation.y+=0.002;dragon.position.y=Math.sin(clock.elapsedTime*1.5)*0.15;camera.lookAt(dragon.position);}
renderer.render(scene,camera);}
anim();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
