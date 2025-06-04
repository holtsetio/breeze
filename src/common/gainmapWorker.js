import { WebGLRenderer } from 'three';
import { HDRJPGLoader } from '@monogrid/gainmap-js'

self.onmessage = async (message) => {
    await loadGainmap(message.data);
};

async function loadGainmap(file) {
    const canvas = new OffscreenCanvas(1,1);
    const renderer = new WebGLRenderer({ canvas });
    const loader = new HDRJPGLoader(renderer)
    const result = await loader.loadAsync(file);
    const renderTarget = result.renderTarget;
    const { width, height } = renderTarget;
    const buffer = new Float16Array(width * height * 4);
    await renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, width, height, buffer);
    self.postMessage({ width, height, buffer});
}