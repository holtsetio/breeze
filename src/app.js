import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import {conf} from "./conf";
import {Info} from "./info";
import {vec3, smoothstep} from "three/tsl";
import {VerletPhysics} from "./physics/verletPhysics.js";
import {SpringVisualizer} from "./physics/springVisualizer.js";
import {Statue} from "./statue.js";

import ninomaru_teien_4k from "../assets/ninomaru_teien_4k.jpg";
import piazza_martin_lutero_4k from "../assets/piazza_martin_lutero_4k.jpg";
import qwantani_noon_4k from "../assets/qwantani_noon_4k.jpg";

import {LeafGeometry} from "./leafGeometry.js";
import {PetalGeometry} from "./petalGeometry.js";
import {ClothGeometry} from "./clothGeometry.js";
import {GroundedSkybox} from "./GroundedSkybox.js";
import {Lights} from "./lights.js";
import {loadGainmap} from "./common/gainmap.js";
import {triNoise3Dvec} from "./common/noise.js";

const sceneConfigs = {
    cloth: {
        hdri: qwantani_noon_4k,
        skyboxHeight: 7.5,
        exposure: 1.35,
        cameraPosition: new THREE.Vector3(-13, 2.5, -11.5),
        cameraTarget: new THREE.Vector3(0,5.3,0),
        geometryClass: ClothGeometry,
        instanceCount: 1,
        cutoffPosition: 30,
        friction: 0.25,
        positionFunction: (isInitial = false) => { return new THREE.Vector3(-10, 5.0, -0.5 + Math.random() * 1); },
        rotationFunction: () => { return new THREE.Quaternion() },
        force: (position, time) => {
            const force = vec3(0).toVar();
            force.y.subAssign(0.000001);
            const noise = triNoise3Dvec(position.mul(0.01), 0.2, time).sub(vec3(0.0, 0.285, 0.285));
            const chaos = smoothstep(-0.5, 1, position.x).mul(0.0001).toVar();
            force.addAssign(noise.mul(vec3(0.00005, chaos, chaos)).mul(5));

            /*const noise2 = triNoise3Dvec(position.mul(0.2), 0.5, time).sub(vec3(0.285, 0.285, 0.285)).mul(0.0001);
            force.addAssign(noise2);*/
            return force;
        },
    },
    sakura: {
        hdri: ninomaru_teien_4k,
        skyboxHeight: 10,
        exposure: 0.85,
        cameraPosition: new THREE.Vector3(-3.6, 4.6, -4.95),
        cameraTarget: new THREE.Vector3(0,5.3,0),
        geometryClass: PetalGeometry,
        instanceCount: 10000,
        cutoffPosition: 10,
        friction: 0,
        positionFunction: (isInitial = false) => { return new THREE.Vector3((isInitial ? - 2 - 12 * Math.random() : -10), 1.0 + Math.random() * 8, -2.5 + Math.random() * 5); },
        rotationFunction: () => { return new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI)); },
        force: (position, time) => {
            const force = vec3(0).toVar();
            force.y.subAssign(0.000001);
            const noise = triNoise3Dvec(position.mul(0.01), 0.2, time).sub(vec3(0.0, 0.285, 0.285));
            const chaos = smoothstep(-0.5, 1, position.x).mul(0.0001).toVar();
            force.addAssign(noise.mul(vec3(0.00005, chaos, chaos)).mul(2));

            const noise2 = triNoise3Dvec(position.mul(0.2), 0.5, time).sub(vec3(0.285, 0.285, 0.285)).mul(0.0001);
            force.addAssign(noise2);
            return force;
        },
    },
    autumn: {
        hdri: piazza_martin_lutero_4k,
        skyboxHeight: 5,
        exposure: 0.95,
        cameraPosition: new THREE.Vector3(-5, 4.6, -7),
        cameraTarget: new THREE.Vector3(0,5.3,0),
        geometryClass: LeafGeometry,
        instanceCount: 800,
        cutoffPosition: 10,
        friction: 0,
        positionFunction: (isInitial = false) => { return new THREE.Vector3((isInitial ? -2 - 12 * Math.random() : -10), 1.0 + Math.random() * 8, -2.5 + Math.random() * 5); },
        rotationFunction: () => { return new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI)); },
        force: (position, time) => {
            const force = vec3(0).toVar();
            force.y.subAssign(0.000001);
            const noise = triNoise3Dvec(position.mul(0.01), 0.2, time).sub(vec3(0.0, 0.285, 0.285));
            const chaos = smoothstep(-0.5, 1, position.x).mul(0.0001).toVar();
            force.addAssign(noise.mul(vec3(0.00005, chaos, chaos)).mul(2));

            const noise2 = triNoise3Dvec(position.mul(0.2), 0.5, time).sub(vec3(0.285, 0.285, 0.285)).mul(0.0001);
            force.addAssign(noise2);
            return force;
        },
    },
};


class App {
    renderer = null;

    camera = null;

    scene = null;

    controls = null;

    sceneInitialized = false;

    constructor(renderer) {
        this.renderer = renderer;
    }

    async init(progressCallback) {
        conf.init();
        this.info = new Info();

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        await this.setupScene(conf.sceneName, progressCallback);

        await progressCallback(1.0, 100);
    }

    async setupScene(sceneName, progressCallback = () => {}) {
        this.sceneInitialized = false;

        const sceneConfig = sceneConfigs[sceneName];
        if (!sceneConfig) {
            console.error("unknown scene '" + sceneName + "'");
            return;
        }

        this.renderer.toneMappingExposure = sceneConfig.exposure;

        this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 200);
        this.camera.position.copy(sceneConfig.cameraPosition);
        this.camera.updateProjectionMatrix()

        this.scene = new THREE.Scene();

        const hdriTexture = await loadGainmap(sceneConfig.hdri);
        hdriTexture.generateMipmaps = true;

        this.scene.environment = hdriTexture;
        this.scene.environmentRotation.set(0,Math.PI,0);
        this.scene.environmentIntensity = 0.8;

        const skybox = new GroundedSkybox( hdriTexture, sceneConfig.skyboxHeight, 100, 96 );
        skybox.position.y = sceneConfig.skyboxHeight - 0.01;
        skybox.rotation.y = Math.PI;
        this.scene.add( skybox );

        const lights = new Lights();
        this.scene.add(lights.object);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.copy(sceneConfig.cameraTarget);
        this.controls.enableDamping = true;
        this.controls.autoRotate = true;
        this.controls.maxDistance = 25;

        await progressCallback(0.1)

        this.statue = new Statue();
        await this.statue.init();
        this.scene.add(this.statue.object);

        await progressCallback(0.5)

        this.physics = new VerletPhysics(this.renderer);
        this.physics.addForce(sceneConfig.force);
        this.physics.addCollider(this.statue.bvh);

        this.clothObject = new THREE.Object3D();
        this.scene.add(this.clothObject);

        this.cloths = [];
        const clothGeometry = new sceneConfig.geometryClass(this.physics);
        for (let i = 0; i < sceneConfig.instanceCount; i++) {
            const cloth = clothGeometry.addInstance();
            this.cloths.push(cloth);
        }
        await clothGeometry.bake();
        this.clothObject.add(clothGeometry.object);

        for (let i = 0; i < this.cloths.length; i++) {
            const position = sceneConfig.positionFunction(true);
            const quaternion = sceneConfig.rotationFunction();
            await this.physics.resetObject(this.cloths[i].id, position, quaternion);
        }

        await this.physics.bake();

        this.springVisualizer = new SpringVisualizer(this.physics);
        this.scene.add(this.springVisualizer.object);

        conf.friction =  sceneConfig.friction;
        conf.gui.refresh();

        this.sceneConfig = sceneConfig;
        this.sceneName = sceneName;
        this.sceneInitialized = true;
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
    async update(delta, elapsed) {
        if (conf.sceneName !== this.sceneName) {
            this.sceneName = conf.sceneName;
            this.sceneInitialized = false;
            await this.setupScene(this.sceneName);
        }
        if (!this.sceneInitialized) { return; }
        conf.begin();

        this.controls.update(delta);

        this.springVisualizer.object.visible = conf.wireframe;
        this.clothObject.visible = !conf.wireframe;
        this.controls.autoRotate = conf.rotateCamera;

        if (conf.runSimulation) {
            await this.physics.update(delta, elapsed);
        }


        const checksPerFrame = Math.min(100, this.physics.objects.length);
        for (let i = 0; i < checksPerFrame; i++) {
            const object = this.cloths[(this.physics.frameNum * checksPerFrame + i) % this.cloths.length];
            const position = this.physics.objects[object.id].position;
            if (position.x > this.sceneConfig.cutoffPosition) {
                const position = this.sceneConfig.positionFunction();
                const quaternion = this.sceneConfig.rotationFunction()
                await this.physics.resetObject(object.id, position, quaternion)
            }
        }

        await this.renderer.renderAsync(this.scene, this.camera);

        conf.end();
    }
}
export default App;
