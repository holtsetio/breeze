import * as THREE from "three/webgpu";
import {Fn, select, storage, instanceIndex, mrt} from "three/tsl";

export class SpringVisualizer {
    physics = null;
    object = null;
    count = 0;
    material = null;
    constructor(physics){
        this.physics = physics;
        this.count = physics.springCount;

        this.positionBuffer = new THREE.BufferAttribute(new Float32Array([0,0,0,1,0,0]), 3, false);
        this.vertexIndexBuffer = new THREE.StorageBufferAttribute(new Uint32Array([0,1]), 1, Uint32Array);
        this.vertexIndexAttribute = storage(this.vertexIndexBuffer, "int", 2).toAttribute();

        this.material = new THREE.LineBasicNodeMaterial({ color: 0 });
        this.material.positionNode = Fn( () => {
            const spring = this.physics.springBuffer.element(instanceIndex);
            const v0id = spring.get("vertex0");
            const v1id = spring.get("vertex1");
            const ptr = select(this.vertexIndexAttribute.equal(0), v0id, v1id);
            return this.physics.vertexBuffer.element(ptr).get("position");
        } )();

        this.geometry = new THREE.InstancedBufferGeometry();
        this.geometry.setAttribute("position", this.positionBuffer);
        this.geometry.instanceCount = this.count;

        this.object = new THREE.Line(this.geometry, this.material);
        this.object.frustumCulled = false;
    }
    update(interval, elapsed) {}
}