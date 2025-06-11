import * as THREE from "three/webgpu";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import {BufferAttribute, Vector2} from "three/webgpu";
import {
    attribute,
    cross,
    Discard, float,
    Fn,
    If,
    instanceIndex,
    smoothstep,
    texture,
    transformNormalToView,
    vec3,
    vec4
} from "three/tsl";

import colorMapFile from "../assets/Fabric_Lace_038_basecolor.png";
import normalMapFile from "../assets/Fabric_Lace_038_normal.png";
import opacityMapFile from "../assets/Fabric_Lace_038_opacity.png";
import roughnessMapFile from "../assets/Fabric_Lace_038_roughness.png";

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

const clothWidth = 0.05;
const segmentSize = 0.1;

export class ClothGeometry {
    id = 0;
    physics = null;
    widthSegments = 0;
    heightSegments = 0;

    vertexRows = [];
    vertices = [];
    springs = [];
    instances = [];

    material = null;
    object = null;

    constructor(physics, widthSegments = 80, heightSegments = 80) {
        this.physics = physics;
        this.widthSegments = widthSegments;
        this.heightSegments = heightSegments;
        this.buildVerletGeometry();
        //this.buildGeometry();
    }

    async bake() {
        await this.createMaterial();
        this.buildGeometry();
    }

    addInstance() {
        const instance = this.physics.addObject();
        const verletVertices = new Array(this.vertices.length);
        this.vertices.forEach((vertex, index) => {
            const { position, fixed } = vertex;
            verletVertices[index] = this.physics.addVertex(instance.id, position, fixed);
        });
        this.springs.forEach((spring, index) => {
            const vertex0 = verletVertices[spring.vertex0.id];
            const vertex1 = verletVertices[spring.vertex1.id];
            this.physics.addSpring(instance.id, vertex0, vertex1);
        })
        this.instances.push(instance);
        return instance;
    }

    buildGeometry() {
        const boxGeometry = new THREE.BoxGeometry(1,1,1, this.widthSegments-1, this.heightSegments-1, 2);
        boxGeometry.clearGroups();
        boxGeometry.deleteAttribute("uv");
        boxGeometry.deleteAttribute("normal");

        const geometry = new THREE.InstancedBufferGeometry().copy(BufferGeometryUtils.mergeVertices(boxGeometry));

        const vertexCount = geometry.attributes.position.count;
        const positionArray = geometry.attributes.position.array;

        const vertexIdsArray = new Uint32Array(4 * vertexCount);
        const sideArray = new Float32Array(3 * vertexCount);
        const uvArray = new Float32Array(2 * vertexCount);

        const uvScale = 3.0 / (this.widthSegments - 1);
        for (let i=0; i<vertexCount; i++) {
            const px = positionArray[i * 3 + 0];
            const py = positionArray[i * 3 + 1];
            const pz = positionArray[i * 3 + 2];

            const xi = Math.round((px + 0.5) * (this.widthSegments - 1));
            const yi = Math.round((py + 0.5) * (this.heightSegments - 1));
            let uvx = xi * uvScale;
            let uvy = yi * uvScale;

            vertexIdsArray[i*4+0] =  this.vertexRows[yi][xi].id;
            vertexIdsArray[i*4+1] =  this.vertexRows[yi][xi+1].id;
            vertexIdsArray[i*4+2] =  this.vertexRows[yi+1][xi].id;
            vertexIdsArray[i*4+3] =  this.vertexRows[yi+1][xi+1].id;
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

        const vertexOffsetArray = new Uint32Array(this.instances.length);
        for (let i = 0; i < this.instances.length; i++) {
            vertexOffsetArray[i] = this.instances[i].vertexStart;
        }
        const vertexOffsetBuffer = new THREE.InstancedBufferAttribute(vertexOffsetArray, 1, false);
        geometry.setAttribute("vertexOffset", vertexOffsetBuffer);

        geometry.instanceCount = this.instances.length;

        this.geometry = geometry;
        this.object = new THREE.Mesh(this.geometry, this.material);
        this.object.frustumCulled = false;
        this.object.castShadow = true;
        this.object.receiveShadow = true;
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

    buildVerletGeometry() {
        for (let y = 0; y <= this.heightSegments; y++) {
            const row = [];
            this.vertexRows.push(row);
            for (let x = 0; x <= this.widthSegments; x++) {
                const jitterx = (Math.random() * 2 - 1) * segmentSize * 0.2;
                const jittery = (Math.random() * 2 - 1) * segmentSize * 0.2;
                const vertexPos = new THREE.Vector3(0, (x - this.widthSegments * 0.5) * segmentSize + jitterx, (y - this.heightSegments * 0.5) * segmentSize + jittery);

                const vertex = this.addVertex(vertexPos);
                row.push(vertex);
            }
        }
        for (let y = 0; y <= this.heightSegments; y++) {
            for (let x = 0; x <= this.widthSegments; x++) {
                const vertex = this.vertexRows[y][x];
                if (x > 0) { this.addSpring(vertex, this.vertexRows[y][x-1]); }
                if (y > 0) { this.addSpring(vertex, this.vertexRows[y-1][x]); }
                if (x > 0 && y > 0) { this.addSpring(vertex, this.vertexRows[y-1][x-1]); }
                if (y > 0 && x < this.widthSegments) { this.addSpring(vertex, this.vertexRows[y-1][x+1]); }
                if (x > 1) { this.addSpring(vertex, this.vertexRows[y][x-2]); }
                if (y > 1) { this.addSpring(vertex, this.vertexRows[y-2][x]); }
                if (x > 1 && y > 1) { this.addSpring(vertex, this.vertexRows[y-2][x-2]); }
                if (y > 1 && x < this.widthSegments - 1) { this.addSpring(vertex, this.vertexRows[y-2][x+2]); }

                /*for (let i = 3; i<=7; i *= 2) {
                    if (x > i-1) {
                        this.addSpring(vertex, this.vertexRows[y][x - i]);
                    }
                    if (y > i-1) {
                        this.addSpring(vertex, this.vertexRows[y - i][x]);
                    }
                }*/

                //if (x > 1 && y > 1) { this.addSpring(vertex, this.vertexRows[y-2][x-2]); }
                //if (y > 1 && x < this.widthSegments - 1) { this.addSpring(vertex, this.vertexRows[y-2][x+2]); }

                //if (x > 2 && y > 2) { this.addSpring(vertex, this.vertexRows[y-3][x-3]); }
                //if (y > 2 && x < this.widthSegments - 2) { this.addSpring(vertex, this.vertexRows[y-3][x+3]); }
            }
        }
    }

    async createMaterial() {
        const files = [colorMapFile, normalMapFile, roughnessMapFile, opacityMapFile];
        const [ colorMap, normalMap, roughnessMap, alphaMap] = await Promise.all(files.map(loadTexture));

        const material = new THREE.MeshPhysicalNodeMaterial({
            transparent: true,
            map: colorMap,
            normalMap,
            roughnessMap,
            //alphaMap,
            sheen: 1.0,
            sheenColor: "#FF0000",
            sheenRoughness: 0,
            color: "#ff8888",
            normalScale: new Vector2(0.5,-0.5),
        });

        const vNormal = vec3().toVarying("v_normalView");
        const vOpacity = float(0).toVarying("vOpacity");
        material.positionNode = Fn( ( { } ) => {
            const side = attribute( 'side' );
            const vertexIds = attribute( 'vertexIds' );
            const vertexOffset = attribute( 'vertexOffset' );
            const v0 = this.physics.vertexBuffer.element( vertexIds.x.add(vertexOffset) ).get("smoothedPosition").toVar();
            const v1 = this.physics.vertexBuffer.element( vertexIds.y.add(vertexOffset) ).get("smoothedPosition").toVar();
            const v2 = this.physics.vertexBuffer.element( vertexIds.z.add(vertexOffset) ).get("smoothedPosition").toVar();
            const v3 = this.physics.vertexBuffer.element( vertexIds.w.add(vertexOffset) ).get("smoothedPosition").toVar();

            const top = v0.add( v1 );
            const right = v1.add( v3 );
            const bottom = v2.add( v3 );
            const left = v0.add( v2 );

            const tangent = right.sub( left ).normalize().toVar();
            const bitangent = bottom.sub( top ).normalize().toVar();
            const n = cross( tangent, bitangent );

            const normal = tangent.mul(side.x).add(bitangent.mul(side.y)).add(n.mul(side.z)).normalize().toVar();
            vNormal.assign(transformNormalToView(normal));

            const position = v0.add( v1 ).add( v2 ).add( v3 ).mul( 0.25 ).add(normal.mul(clothWidth)).toVar();
            vOpacity.assign(smoothstep(20, 24, position.x).oneMinus());
            vOpacity.mulAssign(smoothstep(-10, -8, position.x));

            return position;
        } )();

        material.opacityNode = Fn(() => {
            return texture(alphaMap).r.mul(0.25).add(0.75).mul(vOpacity);
        })();

        this.material = material;

    }
}