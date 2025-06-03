import * as THREE from "three/webgpu";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import {BufferAttribute, Vector2} from "three/webgpu";
import {attribute, cross, Discard, Fn, If, instanceIndex, texture, transformNormalToView, vec3, vec4} from "three/tsl";

import mapFile from "../assets/sakuraPetal.png";

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

const clothWidth = 0.0;
const segmentSize = 0.04;

export class Petal {
    id = 0;
    physics = null;
    widthSegments = 0;
    heightSegments = 0;
    verletVertices = [];

    constructor(physics, widthSegments, heightSegments) {
        Petal.objects.push(this);
        this.physics = physics;
        this.id = this.physics.addObject(this);
        this.widthSegments = widthSegments;
        this.heightSegments = heightSegments;
        this.buildVerletGeometry();
        if (this.id > 0) { return; }
        this.buildGeometry();
    }

    buildGeometry() {
        const boxGeometry = new THREE.BoxGeometry(1,1,1, this.widthSegments-1, this.heightSegments-1, 2);
        boxGeometry.clearGroups();
        boxGeometry.deleteAttribute("uv");
        boxGeometry.deleteAttribute("normal");
        console.log(boxGeometry);

        const geometry = BufferGeometryUtils.mergeVertices(boxGeometry);

        const vertexCount = geometry.attributes.position.count;
        const positionArray = geometry.attributes.position.array;

        const vertexIdsArray = new Uint32Array(4 * vertexCount);
        const sideArray = new Float32Array(3 * vertexCount);
        const uvArray = new Float32Array(2 * vertexCount);

        const uvScale = 1.0 / (this.widthSegments - 1);
        for (let i=0; i<vertexCount; i++) {
            const px = positionArray[i * 3 + 0];
            const py = positionArray[i * 3 + 1];
            const pz = positionArray[i * 3 + 2];

            const xi = Math.round((px + 0.5) * (this.widthSegments - 1));
            const yi = Math.round((py + 0.5) * (this.heightSegments - 1));
            let uvx = xi * uvScale;
            let uvy = yi * uvScale;

            vertexIdsArray[i*4+0] =  this.verletVertices[yi][xi].id;
            vertexIdsArray[i*4+1] =  this.verletVertices[yi][xi+1].id;
            vertexIdsArray[i*4+2] =  this.verletVertices[yi+1][xi].id;
            vertexIdsArray[i*4+3] =  this.verletVertices[yi+1][xi+1].id;
            if (Math.abs(pz) < 0.001) {
                if (Math.abs(px) - Math.abs(py) > 0.001) {
                    sideArray[i * 3 + 0] = Math.sign(px);
                    uvx += (clothWidth / segmentSize) * uvScale * Math.sign(px);
                } else if (Math.abs(py) - Math.abs(px) > 0.001) {
                    sideArray[i * 3 + 1] = Math.sign(py);
                    uvy += (clothWidth / segmentSize) * uvScale * Math.sign(py);
                } else {
                    sideArray[i * 3 + 0] = Math.sign(px) / Math.sqrt(2);
                    sideArray[i * 3 + 1] = Math.sign(py) / Math.sqrt(2);
                }
            } else {
                sideArray[i * 3 + 2] = Math.sign(pz);
            }
            uvArray[i*2+0] = uvx;
            uvArray[i*2+1] = uvy;
        }
        const vertexIdsBuffer = new BufferAttribute(vertexIdsArray, 4, false);
        const sideBuffer = new BufferAttribute(sideArray, 3, false);
        const uvBuffer = new BufferAttribute(uvArray, 2, false);
        geometry.setAttribute("vertexIds", vertexIdsBuffer);
        geometry.setAttribute("side", sideBuffer);
        geometry.setAttribute("uv", uvBuffer);

        this.geometry = geometry;
        return;
        this.object = new THREE.Mesh(geometry, Petal.material);
        this.object.frustumCulled = false;
        this.object.castShadow = true;
        this.object.receiveShadow = true;

        console.log(geometry);
    }

    buildVerletGeometry() {
        const stiffness = 0.25;
        for (let y = 0; y <= this.heightSegments; y++) {
            const row = [];
            this.verletVertices.push(row);
            for (let x = 0; x <= this.widthSegments; x++) {
                const jitterx = (Math.random()*2-1) * segmentSize*0.2;
                const jittery = (Math.random()*2-1) * segmentSize*0.2;
                const vertexPos = new THREE.Vector3(0, (x - this.widthSegments * 0.5) * segmentSize + jitterx, (y - this.heightSegments * 0.5) * segmentSize + jittery);

                const vertex = this.physics.addVertex(this.id, vertexPos);
                row.push(vertex);
                if (x > 0) { this.physics.addSpring(this.id, vertex, this.verletVertices[y][x-1], stiffness); }
                if (y > 0) { this.physics.addSpring(this.id, vertex, this.verletVertices[y-1][x], stiffness); }
                if (x > 0 && y > 0) { this.physics.addSpring(this.id, vertex, this.verletVertices[y-1][x-1], stiffness); }
                if (y > 0 && x < this.widthSegments) { this.physics.addSpring(this.id, vertex, this.verletVertices[y-1][x+1], stiffness); }
                if (x > 1) { this.physics.addSpring(this.id, vertex, this.verletVertices[y][x-2], stiffness); }
                if (y > 1) { this.physics.addSpring(this.id, vertex, this.verletVertices[y-2][x], stiffness); }

                /*for (let i = 3; i<=7; i *= 2) {
                    if (x > i-1) {
                        this.physics.addSpring(this.id, vertex, this.verletVertices[y][x - i], stiffness);
                    }
                    if (y > i-1) {
                        this.physics.addSpring(this.id, vertex, this.verletVertices[y - i][x], stiffness);
                    }
                }*/

                //if (x > 1 && y > 1) { this.physics.addSpring(this.id, vertex, this.verletVertices[y-2][x-2], stiffness); }
                //if (y > 1 && x < this.widthSegments - 1) { this.physics.addSpring(this.id, vertex, this.verletVertices[y-2][x+2], stiffness); }

                //if (x > 2 && y > 2) { this.physics.addSpring(this.id, vertex, this.verletVertices[y-3][x-3], stiffness); }
                //if (y > 2 && x < this.widthSegments - 2) { this.physics.addSpring(this.id, vertex, this.verletVertices[y-3][x+3], stiffness); }
            }
        }
    }

    static objects = [];

    static async createInstances() {
        const geometry = new THREE.InstancedBufferGeometry().copy(Petal.objects[0].geometry);
        const vertexOffsetArray = new Uint32Array(Petal.objects.length);
        for (let i = 0; i < Petal.objects.length; i++) {
            vertexOffsetArray[i] = Petal.objects[i].verletVertices[0][0].id;
        }
        const vertexOffsetBuffer = new THREE.InstancedBufferAttribute(vertexOffsetArray, 1, false);
        console.log(vertexOffsetArray);
        geometry.setAttribute("vertexOffset", vertexOffsetBuffer);
        geometry.instanceCount = Petal.objects.length;
        Petal.object = new THREE.Mesh(geometry, Petal.material);
        //Petal.object.count = Petal.objects.length;
        Petal.object.frustumCulled = false;
        Petal.object.castShadow = true;
        Petal.object.receiveShadow = true;
        console.log(Petal.object);
    }

    static createGeometry() {

    }

    static async createMaterial(physics) {
        const map = await loadTexture(mapFile);
        map.wrapS = THREE.ClampToEdgeWrapping;
        map.wrapT = THREE.ClampToEdgeWrapping;

        const material = new THREE.MeshPhysicalNodeMaterial({
            transparent: true, roughness: 0.8,
            roughness: 1.0,
            //map,
            //alphaMap: map,
        });
        material.colorNode = Fn(() => {
            const color = texture(map);
            If(color.a.lessThan(0.9), () => {
               Discard();
            });
            return color.mul(vec4(vec3(0.7), 1));
        })();
        material.castShadowNode = Fn(() => {
            const color = texture(map);
            If(color.a.lessThan(0.9), () => {
                Discard();
            });
            return texture(map).a.oneMinus();
        })();
        //material.opacityNode = texture(alphaMap).r.mul(0.25).add(0.75);

        const vNormal = vec3().toVarying("vNormal");
        material.positionNode = Fn( ( { } ) => {
            const side = attribute( 'side' );
            const vertexIds = attribute( 'vertexIds' );
            const vertexOffset = attribute( 'vertexOffset' );
            const v0 = physics.vertexBuffer.element( vertexIds.x.add(vertexOffset) ).get("position").toVar();
            const v1 = physics.vertexBuffer.element( vertexIds.y.add(vertexOffset) ).get("position").toVar();
            const v2 = physics.vertexBuffer.element( vertexIds.z.add(vertexOffset) ).get("position").toVar();
            const v3 = physics.vertexBuffer.element( vertexIds.w.add(vertexOffset) ).get("position").toVar();

            const top = v0.add( v1 );
            const right = v1.add( v3 );
            const bottom = v2.add( v3 );
            const left = v0.add( v2 );

            const tangent = right.sub( left ).normalize().toVar();
            const bitangent = bottom.sub( top ).normalize().toVar();
            const n = cross( tangent, bitangent );
            //const n = cross(v1.sub(v0),v3.sub(v1)).add(cross(v3.sub(v1),v2.sub(v3))).add(cross(v2.sub(v3),v0.sub(v2))).add(cross(v0.sub(v2),v1.sub(v0))).normalize();

            const normal = tangent.mul(side.x).add(bitangent.mul(side.y)).add(n.mul(side.z)).normalize().toVar();

            // send the normalView from the vertex shader to the fragment shader
            //material.normalNode = transformNormalToView( normal ).toVarying().normalize().debug();
            vNormal.assign(transformNormalToView(normal));

            return v0.add( v1 ).add( v2 ).add( v3 ).mul( 0.25 ).add(normal.mul(clothWidth));
        } )();
        material.normalNode = vNormal.normalize().debug();

        Petal.material = material;

    }

}