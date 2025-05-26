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
import hdri from "../assets/qwantani_noon_2k.hdr";
import {Cloth} from "./cloth.js";
import {GroundedSkybox} from "./GroundedSkybox.js";

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
        this.camera.position.set(0, 10.0, -20);
        this.camera.updateProjectionMatrix()

        this.scene = new THREE.Scene();

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;

        const hdriTexture = await loadHdr(hdri);

        this.scene.environment = hdriTexture;
        //this.scene.background = hdriTexture;
        //this.scene.backgroundRotation.set(0,Math.PI,0);
        this.scene.environmentRotation.set(0,Math.PI,0);

        const skybox = new GroundedSkybox( hdriTexture, 10, 1000 );
        skybox.position.y = 10 - 0.01;
        skybox.rotation.y = Math.PI;
        this.scene.add( skybox );

        //const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1,2), new THREE.MeshBasicNodeMaterial({color: "#ffffff"}));
        //this.scene.add(ball);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0,1,0);
        this.controls.enableDamping = true;

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

        /*const stiffness = 0.2;
        const rows = [];
        const w = 120;
        const h = 120;
        for (let y = 0; y < h; y++) {
            const row = [];
            rows.push(row);
            for (let x = 0; x < w; x++) {
                const position = new THREE.Vector3(-3, x / 60 - 0.05, y / 60 - 1);
                const vertex = this.physics.addVertex(position);
                row.push(vertex);
                if (x > 0) { this.physics.addSpring(vertex, rows[y][x-1], stiffness); }
                //if (x > 1) { this.physics.addSpring(vertex, rows[y][x-2], stiffness); }
                if (y > 0) { this.physics.addSpring(vertex, rows[y-1][x], stiffness); }
                //if (y > 1) { this.physics.addSpring(vertex, rows[y-2][x], stiffness); }
                if (x > 0 && y > 0) { this.physics.addSpring(vertex, rows[y-1][x-1], stiffness); }
                if (x > 0 && y > 0) { this.physics.addSpring(vertex, rows[y-1][x-1], stiffness); }
                if (y > 0 && x < w-1) { this.physics.addSpring(vertex, rows[y-1][x+1], stiffness); }
            }
        }*/
        await Cloth.createMaterial(this.physics);
        for (let i = 0; i < 1; i++) {
            const cloth = new Cloth(this.physics, 80, 80);
            this.cloths.push(cloth);
            this.scene.add(cloth.object);
        }

        await this.physics.bake();

        for (let i = 0; i < this.cloths.length; i++) {
            const position = new THREE.Vector3(-2 - 1 * i, 4.0 + Math.random() * 3, -1.5 + Math.random() * 3);
            const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 2 * Math.PI, 0, 0));
            await this.physics.resetObject(this.cloths[i].id, position);
        }

        this.springVisualizer = new SpringVisualizer(this.physics);
        //this.scene.add(this.springVisualizer.object);


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

        await this.physics.update(delta, elapsed);

        const object = this.cloths[this.physics.frameNum % this.cloths.length];
        const position = this.physics.objects[object.id].position;
        if (position.x > 30) {
            const position = new THREE.Vector3(-2 - 6 * Math.random(), 4.0 + Math.random() * 3, -1.5 + Math.random() * 3);
            const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 2 * Math.PI, 0, 0));
            await this.physics.resetObject(object.id, position)
        }

        await this.renderer.renderAsync(this.scene, this.camera);
        //await this.postProcessing.renderAsync();

        conf.end();
    }
}
export default App;
