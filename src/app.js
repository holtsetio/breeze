import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import {conf} from "./conf";
import {Info} from "./info";
import {attribute, cameraPosition, Fn, If, uniform, vec3, vec4, pass} from "three/tsl";
import {VerletPhysics} from "./physics/verletPhysics.js";
import {SpringVisualizer} from "./physics/springVisualizer.js";
import {Statue} from "./statue.js";

import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import hdri from "../assets/ninomaru_teien_1k.hdr";
import {Cloth} from "./cloth.js";
import {GroundedSkybox} from "./GroundedSkybox.js";
import {Leaf} from "./leaf.js";
import {Lights} from "./lights.js";
import {Petal} from "./petal.js";

const loadHdr = async (file) => {
    const texture = await new Promise(resolve => {
        new RGBELoader().load(file, result => {
            result.mapping = THREE.EquirectangularReflectionMapping;
            result.colo
            resolve(result);
        });
    });
    return texture;
}



class App {
    renderer = null;

    camera = null;

    scene = null;

    controls = null;

    cloths = [];

    constructor(renderer) {
        this.renderer = renderer;
    }

    async init(progressCallback) {
        conf.init();
        this.info = new Info();

        this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 2000);
        //this.camera.position.set(32,32, -64);
        this.camera.position.set(-3.6, 4.6, -4.95);
        this.camera.updateProjectionMatrix()

        this.scene = new THREE.Scene();

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.85;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const hdriTexture = await loadHdr(hdri);

        this.scene.environment = hdriTexture;
        //this.scene.background = hdriTexture;
        //this.scene.backgroundRotation.set(0,Math.PI,0);
        this.scene.environmentRotation.set(0,Math.PI,0);
        this.scene.environmentIntensity = 0.8;


        const lights = new Lights();
        this.scene.add(lights.object);

        const skybox = new GroundedSkybox( hdriTexture, 10, 1000, 128, lights );
        skybox.position.y = 10 - 0.01;
        skybox.rotation.y = Math.PI;
        this.scene.add( skybox );


        //const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1,2), new THREE.MeshBasicNodeMaterial({color: "#ffffff"}));
        //this.scene.add(ball);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0,5.3,0);
        this.controls.enableDamping = true;
        this.controls.autoRotate = true;

        await progressCallback(0.1)

        this.statue = new Statue();
        await this.statue.init();
        this.scene.add(this.statue.object);

        this.rayDirectionUniform = uniform(new THREE.Vector3()).label("rayDirection");
        const ballMaterial = new THREE.MeshBasicMaterial({ color: 0});
        ballMaterial.positionNode = Fn(() => {
            const position = vec3(0).toVar();
            const rayOrigin = cameraPosition.xyz;
            const rayDirection = this.rayDirectionUniform.xyz;
            const [isHit, distance] = this.statue.bvh.intersect(rayOrigin, rayDirection);
            If(isHit, () => {
                position.assign(rayOrigin.add(rayDirection.mul(distance)));
            });

            return attribute("position").add(position);
        })().debug();
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.01,2), ballMaterial);
        ball.frustumCulled = false;
        this.scene.add(ball);

        await progressCallback(0.5)

        this.physics = new VerletPhysics(this.renderer);
        this.physics.addCollider(this.statue.bvh);
        conf.settings.addBinding( this.physics, 'stiffness', { min: 0.05, max: 0.5, step: 0.01 });
        conf.settings.addBinding( this.physics, 'friction', { min: 0.0, max: 1.0, step: 0.01 });

        await Cloth.createMaterial(this.physics);
        /*await Leaf.createMaterial(this.physics);
        for (let i = 0; i < 800; i++) {
            const cloth = new Leaf(this.physics, 12, 12);
            this.cloths.push(cloth);
            //this.scene.add(cloth.object);
        }
        Leaf.createInstances();
        this.scene.add(Leaf.object);*/

        await Petal.createMaterial(this.physics);
        for (let i = 0; i < 30000; i++) {
            const cloth = new Petal(this.physics, 4, 4);
            this.cloths.push(cloth);
            //this.scene.add(cloth.object);
        }
        Petal.createInstances();
        this.scene.add(Petal.object);

        await this.physics.bake();

        for (let i = 0; i < this.cloths.length; i++) {
            const position = new THREE.Vector3(-8 - 20 * Math.random(), 1.0 + Math.random() * 8, -2.5 + Math.random() * 5);
            const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI));
            await this.physics.resetObject(this.cloths[i].id, position, quaternion);
        }

        this.springVisualizer = new SpringVisualizer(this.physics);
        this.scene.add(this.springVisualizer.object);


        /*
        const effectController = {
            focus: uniform( 10.0 ),
            aperture: uniform( 5 ),
            maxblur: uniform( 0.01 )
        };
        // post processing
        this.postProcessing = new THREE.PostProcessing( this.renderer );
        const scenePass = pass( this.scene, this.camera );
        const scenePassColor = scenePass.getTextureNode();
        const scenePassViewZ = scenePass.getViewZNode();
        const dofPass = dof( scenePassColor, scenePassViewZ, effectController.focus, effectController.aperture.mul( 0.00001 ), effectController.maxblur );
        this.postProcessing.outputNode = dofPass;
        conf.gui.addBinding( effectController.focus, 'value', {min: 1.0, max: 50.0, step: 0.1 } );
        conf.gui.addBinding( effectController.aperture, 'value', { min: 0, max: 10, step: 0.1 });
        conf.gui.addBinding( effectController.maxblur, 'value', { min: 0.0, max: 0.01, step: 0.001 });*/

        this.raycaster = new THREE.Raycaster();
        this.renderer.domElement.addEventListener("pointermove", (event) => { this.onMouseMove(event); });

        await progressCallback(1.0, 100);
    }

    onMouseMove(event) {
        const pointer = new THREE.Vector2();
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(pointer, this.camera);
        this.rayDirectionUniform.value.copy(this.raycaster.ray.direction);
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
    async update(delta, elapsed) {
        conf.begin();

        this.controls.update(delta);

        this.springVisualizer.object.visible = conf.wireframe;
        Petal.object.visible = !conf.wireframe;
        this.controls.autoRotate = conf.rotateCamera;

        if (conf.runSimulation) {
            await this.physics.update(delta, elapsed);
        }


        const checksPerFrame = 100;
        for (let i = 0; i < checksPerFrame; i++) {
            const object = this.cloths[(this.physics.frameNum * checksPerFrame + i) % this.cloths.length];
            const position = this.physics.objects[object.id].position;
            if (position.x > 10) {
                const position = new THREE.Vector3(-8, 1.0 + Math.random() * 8, -2.5 + Math.random() * 5);
                const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI));
                await this.physics.resetObject(object.id, position, quaternion)
            }
        }

        await this.renderer.renderAsync(this.scene, this.camera);
        //await this.postProcessing.renderAsync();

        conf.end();
    }
}
export default App;
