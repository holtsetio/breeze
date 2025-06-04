import * as THREE from "three";
import {WebGLRenderer} from "three";
import {HDRJPGLoader} from "@monogrid/gainmap-js";

/*export const loadGainmap = async (file) => {
    return new Promise((resolve, reject) => {
        const worker = new GainmapWorker();
        worker.onmessage = (event) => {
            const { width, height, buffer } = event.data;
            const texture = new THREE.DataTexture( buffer, width, height, THREE.RGBAFormat, THREE.HalfFloatType, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.LinearFilter, THREE.LinearFilter, 1, "srgb-linear");
            texture.needsUpdate = true;
            resolve(texture);
        };
        worker.onerror = (error) => {
            console.log(`Worker error: ${error.message}`);
            throw error;
        };
        worker.postMessage(file);
    });
};*/

export const loadGainmap = async (file) => {
    const renderer = new WebGLRenderer();
    const loader = new HDRJPGLoader(renderer)
    const result = await loader.loadAsync(file);
    const renderTarget = result.renderTarget;
    const { width, height } = renderTarget;
    const buffer = new Float16Array(width * height * 4);
    await renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, width, height, buffer);

    const texture = new THREE.DataTexture(buffer, width, height, THREE.RGBAFormat, THREE.HalfFloatType, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.LinearFilter, THREE.LinearFilter, 1, "srgb-linear");
    texture.needsUpdate = true;
    return texture;
};