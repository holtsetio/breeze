import * as THREE from "three/webgpu";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import Venus from '../assets/venus.obj';
import VenusSimple from '../assets/venus_simple3.obj';
import VenusColorMap from '../assets/VenusDeMilo_t_baseColor.png';
import VenusRoughnessMap from '../assets/VenusDeMilo_t_metallicRoughness.png';
import VenusNormalMap from '../assets/VenusDeMilo_t_normal.png';

import {BVH} from "./bvh.js";
import {normalWorld, vec4} from "three/tsl";


const textureLoader = new THREE.TextureLoader();
const loadTexture = (file) => {
    return new Promise(resolve => {
        textureLoader.load(file, texture => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            resolve(texture);
        });
    });
}

const objLoader = new OBJLoader();
const loadObj = (file) => {
    return new Promise(resolve => {
        objLoader.load(file, object => {
            resolve(object);
        });
    });
}

export class Statue {
    constructor() {

    }

    async init() {
        const obj = await loadObj(Venus);

        const textures = [VenusColorMap, VenusRoughnessMap, VenusNormalMap];
        const [map, roughnessMap, normalMap] = await Promise.all(textures.map(loadTexture));
        const material = new THREE.MeshStandardNodeMaterial({
            map, roughnessMap, normalMap,
        })
        //material.colorNode = vec4(normalWorld, 1);
        const geometry = obj.children[0].geometry;
        geometry.scale(25,25,25);
        geometry.rotateY(Math.PI * -0.5);

        const objSimple = await loadObj(VenusSimple);
        //console.log(obj);
        //console.log(objSimple);
        const geometrySimple = objSimple.children[0].geometry;
        geometrySimple.scale(25,25,25);
        geometrySimple.rotateY(Math.PI * -0.5);


        this.object = new THREE.Mesh(geometry, material);
        this.object.castShadow = true;
        this.object.receiveShadow = true;
        this.bvh = new BVH(geometrySimple);
    }

    update(elapsed) {

    }
}