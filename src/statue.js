import * as THREE from "three/webgpu";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import Venus from '../assets/venus_de_milo.glb';
import VenusSimple from '../assets/venus_simple2.obj';

import {BVH} from "./bvh.js";

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

const gltfLoader = new GLTFLoader();
const loadGltf = (file) => {
    return new Promise(resolve => {
        gltfLoader.load(file, object => {
            resolve(object);
        });
    });
}

const getMesh = (gltf) => {
  let lastChild = gltf.scene;
  while (lastChild.children.length > 0) {
      lastChild = lastChild.children[0];
  }
  return lastChild;
};

export class Statue {
    constructor() {

    }

    async init() {
        /*const obj = await loadObj(Venus);

        const textures = [VenusColorMap, VenusRoughnessMap, VenusNormalMap];
        const [map, roughnessMap, normalMap] = await Promise.all(textures.map(loadTexture));
        const material = new THREE.MeshStandardNodeMaterial({
            map, roughnessMap, normalMap,
        })
        //material.colorNode = vec4(normalWorld, 1);
        const geometry = obj.children[0].geometry;
        geometry.scale(25,25,25);
        geometry.rotateY(Math.PI * -0.5);*/
        const objSimple = await loadObj(VenusSimple);

        this.object = getMesh(await loadGltf(Venus));
        //this.object.geometry = objSimple.children[0].geometry;
        this.object.castShadow = true;
        this.object.receiveShadow = true;
        this.object.scale.set(0.25,0.25,0.25);
        //this.object.scale.set(1,1,1);
        this.object.rotation.set(0, Math.PI * -0.5, 0);



        //console.log(obj);
        //console.log(objSimple);
        const geometrySimple = objSimple.children[0].geometry;
        geometrySimple.scale(25,25,25);
        geometrySimple.rotateY(Math.PI * -0.5);

        //this.object = new THREE.Mesh(geometry, material);
        //this.object.castShadow = true;
        //this.object.receiveShadow = true;
        this.bvh = new BVH(geometrySimple);
    }

    update(elapsed) {

    }
}