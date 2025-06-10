import * as THREE from "three/webgpu";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import {BufferAttribute, Vector2} from "three/webgpu";
import {attribute, cross, Fn, texture, transformNormalToView, vec3} from "three/tsl";

import aoMapFile3 from "../assets/Fabric_Lace_038_ambientOcclusion.png";
import colorMapFile3 from "../assets/Fabric_Lace_038_basecolor.png";
import normalMapFile3 from "../assets/Fabric_Lace_038_normal.png";
import opacityMapFile3 from "../assets/Fabric_Lace_038_opacity.png";
import roughnessMapFile3 from "../assets/Fabric_Lace_038_roughness.png";

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

export class Cloth {
    id = 0;
    physics = null;
    widthSegments = 0;
    heightSegments = 0;
    verletVertices = [];

    constructor(physics, widthSegments, heightSegments) {
        this.physics = physics;
        this.id = this.physics.addObject(this);
        this.widthSegments = widthSegments;
        this.heightSegments = heightSegments;
        this.buildVerletGeometry();
        this.buildGeometry();
    }

    buildGeometry() {
        const boxGeometry = new THREE.BoxGeometry(1,1,1, this.widthSegments-1, this.heightSegments-1, 2);
        boxGeometry.clearGroups();
        boxGeometry.deleteAttribute("uv");
        boxGeometry.deleteAttribute("normal");

        const geometry = BufferGeometryUtils.mergeVertices(boxGeometry);

        const vertexCount = geometry.attributes.position.count;
        const positionArray = geometry.attributes.position.array;

        const vertexIdsArray = new Uint32Array(4 * vertexCount);
        const sideArray = new Float32Array(3 * vertexCount);
        const uvArray = new Float32Array(2 * vertexCount);

        const uvScale = 0.08;
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


        this.object = new THREE.Mesh(geometry, Cloth.material);
        this.object.frustumCulled = false;
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

    static async createMaterial(physics) {
        /*const files = [aoMapFile0, colorMapFile0, normalMapFile0];
        const [aoMap, colorMap, normalMap] = await Promise.all(files.map(loadTexture));
        const roughnessMap = null*/

        /*const files = [aoMapFile1, normalMapFile1, roughnessMapFile1];
        const [aoMap,  normalMap, roughnessMap] = await Promise.all(files.map(loadTexture));
        const colorMap = null;*/

        /*const files = [aoMapFile2, colorMapFile2, normalMapFile2, roughnessMapFile2];
        const [aoMap, colorMap, normalMap, roughnessMap] = await Promise.all(files.map(loadTexture));*/

        const files = [aoMapFile3, colorMapFile3, normalMapFile3, roughnessMapFile3, opacityMapFile3];
        const [aoMap, colorMap, normalMap, roughnessMap, alphaMap] = await Promise.all(files.map(loadTexture));

        const material = new THREE.MeshPhysicalNodeMaterial({
            transparent: true, roughness: 0.8, sheen: 1.0, sheenColor: "#FF0000", sheenRoughness: 0,
            aoMap, map: colorMap, normalMap, roughnessMap, color: "#ff8888", //alphaMap
            normalScale: new Vector2(8,-8),
        });
        material.opacityNode = texture(alphaMap).r.mul(0.25).add(0.75);

        const vNormal = vec3().toVarying("vNormal");
        material.positionNode = Fn( ( { } ) => {
            const side = attribute( 'side' );
            const vertexIds = attribute( 'vertexIds' );
            const v0 = physics.vertexBuffer.element( vertexIds.x ).get("position").toVar();
            const v1 = physics.vertexBuffer.element( vertexIds.y ).get("position").toVar();
            const v2 = physics.vertexBuffer.element( vertexIds.z ).get("position").toVar();
            const v3 = physics.vertexBuffer.element( vertexIds.w ).get("position").toVar();

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

        Cloth.material = material;

    }

}