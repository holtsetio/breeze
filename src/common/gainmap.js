import * as THREE from "three/webgpu";
import {WebGLRenderer} from "three";
import {HDRJPGLoader} from "@monogrid/gainmap-js";

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