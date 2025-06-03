import * as THREE from "three/webgpu";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import {BufferAttribute, Vector2} from "three/webgpu";
import {attribute, cross, Discard, Fn, If, instanceIndex, texture, transformNormalToView, vec3, vec4} from "three/tsl";

import mapFile from "../assets/sakuraPetal.png";

export class VerletGeometry {
    physics = null;
    vertices = [];
    springs = [];
    instances = [];
    widthSegments = 0;
    heightSegments = 0;

    constructor(physics, widthSegments, heightSegments) {
        this.physics = physics;
        this.widthSegments = widthSegments;
        this.heightSegments = heightSegments;
    }

    addVertex(position, fixed) {
        const id = this.vertices.length;
        const vertex = { id, position, fixed };
        this.vertices.push(vertex);
        return vertex;
    }

    addSpring(vertex0, vertex1) {
        const id = this.springs.length;
        this.springs.push({ id, vertex0, vertex1 });
        return id;
    }

    addInstance() {
        const objectId = this.physics.addObject();
        const verletVertices = new Array(this.vertices.length);
        this.vertices.forEach((vertex, index) => {
            const { position, fixed } = vertex;
            verletVertices[index] = this.physics.addVertex(objectId, position, fixed);
        });
        this.springs.forEach((spring, index) => {
            const vertex0 = verletVertices[spring.vertex0.id];
            const vertex1 = verletVertices[spring.vertex1.id];
            this.physics.addSpring(objectId, vertex0, vertex1);
        })
    }

}