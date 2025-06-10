import * as THREE from "three/webgpu";

export class Lights {
    lights = [];

    constructor() {
        this.object = new THREE.Object3D();
        const light = new THREE.SpotLight(0xffffff, 5, 150, Math.PI * 0.02, 1, 0);
        const lightTarget = new THREE.Object3D();
        light.position.set(-54., 35, -40);
        lightTarget.position.set(0,4,0);
        light.target = lightTarget;

        this.object.add(light);
        this.object.add(lightTarget);
        //this.object.add(new THREE.SpotLightHelper(light, 0));

        light.castShadow = true; // default false
        light.shadow.mapSize.width = 512*4; // default
        light.shadow.mapSize.height = 512*4; // default
        light.shadow.bias = -0.000001;
        light.shadow.camera.near = 0.5; // default
        light.shadow.camera.far = 150;

        this.light = light;

    }

    update(elapsed) {

    }
}