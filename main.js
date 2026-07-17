import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x00ff00);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(0, 1.5, 5);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 10, 5);
scene.add(sun);

const clock = new THREE.Clock();

let dragon = null;
let mixer = null;

const loader = new GLTFLoader();

loader.load(

'https://github.com/jsanch3192002/DragonProject/releases/download/V1.0/chinese_dragon.glb',

(gltf)=>{

    dragon = gltf.scene;

    dragon.scale.set(1,1,1);
    dragon.position.set(0,0,0);

    scene.add(dragon);

    if(gltf.animations.length){

        mixer = new THREE.AnimationMixer(dragon);

        gltf.animations.forEach((clip)=>{

            mixer.clipAction(clip).play();

        });

    }

    console.log("Dragon loaded!");

},

(xhr)=>{

    console.log(
        (xhr.loaded / xhr.total * 100).toFixed(0) + "% loaded"
    );

},

(error)=>{

    console.error(error);

    alert("Dragon failed to load.");

}

);

function animate(){

    requestAnimationFrame(animate);

    const dt = clock.getDelta();

    if(mixer) mixer.update(dt);

    if(dragon){

        dragon.rotation.y += 0.003;

        dragon.position.y =
            Math.sin(clock.elapsedTime * 1.5) * 0.15;

        camera.lookAt(dragon.position);

    }

    renderer.render(scene,camera);

}

animate();

window.addEventListener("resize",()=>{

    camera.aspect =
        window.innerWidth /
        window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

});