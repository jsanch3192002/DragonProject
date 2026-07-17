
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x00ff00);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth/window.innerHeight,
    0.1,
    1000
);

camera.position.set(0,1.5,5);

const renderer = new THREE.WebGLRenderer({
    antialias:true
});

renderer.setSize(window.innerWidth,window.innerHeight);
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff,0x444444,2.5);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff,2);
dir.position.set(5,10,5);
scene.add(dir);

const clock = new THREE.Clock();

let mixer=null;
let dragon=null;
let path=[];

fetch("dragon_path.json")
.then(r=>r.json())
.then(data=>{
    path=data;
});

const loader=new GLTFLoader();

loader.load(loader.load('https://drive.google.com/uc?export=download&id=1xGwjeeXavnMlFOHKl5YWj7e07MBwdnwT', ...
    

    (gltf)=>{

        dragon=gltf.scene;

        dragon.scale.set(1,1,1);

        scene.add(dragon);


        dragon.traverse(obj=>{
          if(obj.isMesh && obj.material){
            const mats=Array.isArray(obj.material)?obj.material:[obj.material];
            mats.forEach(m=>{
              if(m.emissive){
                m.emissive.setRGB(0.2,0.2,0.8);
                m.emissiveIntensity=1.2;
              }
            });
          }
        });

        mixer=new THREE.AnimationMixer(dragon);

        gltf.animations.forEach(clip=>{
            mixer.clipAction(clip).play();
        });

    }
);

function animate(){

    requestAnimationFrame(animate);

    const dt=clock.getDelta();

    if(mixer)
        mixer.update(dt);

    if(dragon && path.length){

        const t=(clock.elapsedTime)%path[path.length-1].time;

        let p=path[0];

        for(let i=1;i<path.length;i++){

            if(path[i].time>=t){

                p=path[i];
                break;

            }

        }

        dragon.position.set(
            p.x,
            p.y,
            p.z
        );

        camera.lookAt(dragon.position);

    }


    if(dragon){
      const h=(clock.elapsedTime*0.08)%1;
      dragon.traverse(o=>{
        if(o.isMesh && o.material){
          const mats=Array.isArray(o.material)?o.material:[o.material];
          mats.forEach(m=>{
            if(m.emissive){
              m.emissive.setHSL(h,1,0.5);
              m.emissiveIntensity=1.4;
            }
          });
        }
      });
    }

    renderer.render(scene,camera);

}

animate();

window.addEventListener("resize",()=>{

    camera.aspect=window.innerWidth/window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth,window.innerHeight);

});
