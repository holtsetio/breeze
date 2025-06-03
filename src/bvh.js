import {
    add,
    array,
    bool,
    clamp,
    Continue,
    cross,
    dot,
    float,
    If,
    int,
    Loop,
    max,
    min,
    select,
    uint,
    vec3,
    vec4
} from "three/tsl";
import {MeshBVH} from "three-mesh-bvh";
import {StructuredArray} from "./common/structuredArray.js";

const BYTES_PER_NODE = 6 * 4 + 4 + 4;
const TRI_INTERSECT_EPSILON = 1e-5;

export class BVH {
    geometry = null;
    bvh = null;
    bvhBuffer = null;
    triangleBuffer = null;
    maxDepth = 0;

    constructor(geometry) {
        this.geometry = geometry;
        this.bvh = new MeshBVH(geometry);
        this.buildBuffers();
        this.buildShaderFunctions();
    }

    buildBuffers() {
        const bvhNodeStruct = {
            boundsMin: "vec3",
            boundsMax: "vec3",
            isLeaf: "uint",
            count: "uint",
            offset: "uint",
            rightIndex: "uint",
            splitAxis: "uint",
        };
        const triangleStruct = {
            a: "vec3",
            b: "vec3",
            c: "vec3",
        };

        const roots = this.bvh._roots;
        if (roots.length !== 1) {
            throw new Error('Multi-root BVHs not supported.');
        }

        const root = roots[0];
        const uint16Array = new Uint16Array(root);
        const uint32Array = new Uint32Array(root);
        const float32Array = new Float32Array(root);
        const nodeCount = root.byteLength / BYTES_PER_NODE;

        const depths = Array(nodeCount).fill(0);
        this.bvhBuffer = new StructuredArray(bvhNodeStruct, nodeCount, "bvhBuffer");

        for (let i = 0; i < nodeCount; i++) {
            depths[i]++;
            this.maxDepth = Math.max(depths[i], this.maxDepth);
            const nodeIndex32 = i * BYTES_PER_NODE / 4;
            const nodeIndex16 = nodeIndex32 * 2;
            for (let b = 0; b < 3; b++) {
                this.bvhBuffer.set(i, "boundsMin", float32Array.slice(nodeIndex32, nodeIndex32 + 3));
                this.bvhBuffer.set(i, "boundsMax", float32Array.slice(nodeIndex32 + 3, nodeIndex32 + 6));
            }

            if (uint16Array[nodeIndex16 + 15] === 0xFFFF) { // IS_LEAF( nodeIndex16, uint16Array )
                this.bvhBuffer.set(i, "isLeaf", 1);
                this.bvhBuffer.set(i, "count", uint16Array[nodeIndex16 + 14]);
                this.bvhBuffer.set(i, "offset", uint32Array[nodeIndex32 + 6]);
            } else {
                const rightIndex = 4 * uint32Array[nodeIndex32 + 6] / BYTES_PER_NODE;
                this.bvhBuffer.set(i, "isLeaf", 0);
                this.bvhBuffer.set(i, "splitAxis", uint32Array[nodeIndex32 + 7]);
                this.bvhBuffer.set(i, "rightIndex", rightIndex);
                depths[i+1] = depths[i];
                depths[rightIndex] = depths[i];
            }
        }

        const triangleCount = this.bvh.geometry.getIndex().count / 3
        const indexArray = this.bvh.geometry.getIndex().array;
        const positionArray = this.bvh.geometry.getAttribute("position").array;

        this.triangleBuffer = new StructuredArray(triangleStruct, triangleCount, "triangleBuffer");
        for (let i = 0; i < triangleCount; i++) {
            const [aIdx, bIdx, cIdx] = indexArray.slice(i * 3, i * 3 + 3);
            this.triangleBuffer.set(i, "a", positionArray.slice(aIdx * 3, aIdx * 3 + 3));
            this.triangleBuffer.set(i, "b", positionArray.slice(bIdx * 3, bIdx * 3 + 3));
            this.triangleBuffer.set(i, "c", positionArray.slice(cIdx * 3, cIdx * 3 + 3));
        }

        //console.log(this.bvhBuffer);
        //console.log(this.triangleBuffer);
        //console.log(this.maxDepth);
    }

    buildShaderFunctions() {
        const intersectBVHNodeBounds = (rayOrigin, rayDirection, bvhNode) => {
            const boundsMin = bvhNode.get("boundsMin");
            const boundsMax = bvhNode.get("boundsMax");
            const invDir = vec3(1).div(rayDirection).toVar("invDir");

            const tMinPlane = boundsMin.sub(rayOrigin).mul(invDir).toVar("tMinPlane");
            const tMaxPlane = boundsMax.sub(rayOrigin).mul(invDir).toVar("tMaxPlane");

            const tMinHit = min(tMinPlane, tMaxPlane).toVar("tMinHit");
            const tMaxHit = max(tMinPlane, tMaxPlane).toVar("tMaxHit");

            const maxHitDistance = max(tMinHit.x, tMinHit.y, tMinHit.z, 0).toVar("boundsHitDistance");
            const minHitDistance = min(tMaxHit.x, tMaxHit.y, tMaxHit.z);

            const isHit = minHitDistance.greaterThan(maxHitDistance);
            return [isHit, maxHitDistance];
        }

        const intersectTriangle = (rayOrigin, rayDirection, a, b, c) => {
            const edge1 = b.sub(a).toVar("edge1");
            const edge2 = c.sub(a).toVar("edge2");
            const norm = cross(edge1, edge2).toVar("norm");
            const det = dot(rayDirection, norm).negate().toVar("det");
            const invDet = float(1).div(det).toVar("invDet");
            const AO = rayOrigin.sub(a).toVar("AO");
            const DAO = cross(AO, rayDirection).toVar("DAO");
            const uvt = vec4(
                dot(edge2, DAO).mul(invDet),
                dot(edge1, DAO).negate().mul(invDet),
                dot(AO, norm).mul(invDet),
                0
            ).toVar("uvt");
            uvt.w.assign(float(1.0).sub(uvt.x).sub(uvt.y));
            const distance = uvt.z.toVar("triangleDistance");
            norm.mulAssign(det.sign());
            //norm.assign(norm.mul(det.sign()).normalize());
            const isHit = uvt.add(TRI_INTERSECT_EPSILON).greaterThanEqual(vec4(0)).all().and(det.greaterThan(0.0));
            return [isHit, distance, norm];
        };

        const intersectTriangles = (rayOrigin, rayDirection, offset, count) => {
            const end = offset.add(count).toVar("end");
            const found = bool(false).toVar("foundTriangle");
            const minDistance = float(1e9).toVar("minTriangleDistance");
            const hitNormal = vec3().toVar("normal");
            Loop({ start: offset, end: end, type: 'uint', name: 'triangleIndex', condition: '<' }, ({triangleIndex}) => {
                const a = this.triangleBuffer.element(triangleIndex).get("a").toVar("a");
                const b = this.triangleBuffer.element(triangleIndex).get("b").toVar("b");
                const c = this.triangleBuffer.element(triangleIndex).get("c").toVar("c");
                const [isHit, triangleDistance, triangleNormal] = intersectTriangle(rayOrigin, rayDirection, a, b, c);
                If(isHit, () => {
                    found.assign(true);
                    If(triangleDistance.lessThanEqual(minDistance), () => {
                        minDistance.assign(triangleDistance);
                        hitNormal.assign(triangleNormal);
                    });
                });
            });
            return [found, minDistance, hitNormal];
        }

        this.intersect = (rayOrigin, rayDirection, maxDistance = float(1e9)) => {
            const ptr = int(0).toVar("ptr");
            const stack = array("uint", this.maxDepth*2).toVar("stack");
            stack.element(0).assign(uint(0));

            const minDistance = maxDistance.toVar("minDistance");
            const found = bool(false).toVar("found");
            const hitNormal = vec3().toVar("hitNormal");
            Loop(ptr.greaterThan(int(-1)).and(ptr.lessThan(int(this.maxDepth*2))), () => {
                const currNodeIndex = stack.element(ptr).toVar("currNodeIndex");
                ptr.subAssign(int(1));
                const bvhNode = this.bvhBuffer.element(currNodeIndex);
                const [isHit, boundsHitDistance] = intersectBVHNodeBounds(rayOrigin, rayDirection, bvhNode);
                If(isHit.not().or(boundsHitDistance.greaterThan(minDistance)), () => {
                    Continue();
                })

                const isLeaf = bvhNode.get("isLeaf");
                If(isLeaf.equal(uint(1)), () => {
                    const offset = bvhNode.get("offset").toVar("offset");
                    const count = bvhNode.get("count").toVar("count");
                    const [isTriangleHit, triangleDistance, triangleNormal] = intersectTriangles(rayOrigin, rayDirection, offset, count);
                    If(isTriangleHit, () => {
                        If(triangleDistance.lessThanEqual(minDistance), () => {
                            found.assign(true);
                            minDistance.assign(triangleDistance);
                            hitNormal.assign(triangleNormal);
                        });
                    });
                }).Else(() => {
                    const leftIndex = currNodeIndex.add(uint(1)).toVar("leftIndex");
                    const splitAxis = bvhNode.get("splitAxis").toVar("splitAxis");
                    const rightIndex = bvhNode.get("rightIndex").toVar("rightIndex");

                    const leftToRight = rayDirection.element(splitAxis).greaterThanEqual(0);
                    const c1 = select(leftToRight, leftIndex, rightIndex).toVar("c1");
                    const c2 = select(leftToRight, rightIndex, leftIndex).toVar("c2");

                    ptr.addAssign(1);
                    stack.element(ptr).assign(c2);
                    ptr.addAssign(1);
                    stack.element(ptr).assign(c1);
                });

            });
            If(found, () => {
                hitNormal.assign(hitNormal.normalize());
            });

            return [found, minDistance, hitNormal];
        }

        const distanceSqToBVHNodeBoundsPoint = (point, bvhNode) => {
            const boundsMin = bvhNode.get("boundsMin");
            const boundsMax = bvhNode.get("boundsMax");
            const clampedPoint = clamp(point, boundsMin, boundsMax);
            const delta = point.sub(clampedPoint).toVar();
            return dot(delta, delta);
        };

        const closestPointToTriangle = (point, v0, v1, v2) => {
            const v10 = v1.sub(v0).toVar("v10");
            const v21 = v2.sub(v1).toVar("v21");
            const v02 = v0.sub(v2).toVar("v02");
            const p0 = point.sub(v0).toVar("p0");
            const p1 = point.sub(v1).toVar("p1");
            const p2 = point.sub(v2).toVar("p2");
            const nor = cross(v10, v02).toVar("nor");
            const q = cross(nor, p0).toVar("q");
            const d = float(1.0).div(dot(nor, nor)).toVar("d");
            const u = dot(q, v02).mul(d).toVar("u");
            const v = dot(q, v10).mul(d).toVar("v");
            const w = float(1.0).sub(u).sub(v).toVar("w");
            If(u.lessThan(0), () => {
                w.assign(clamp(dot(p2, v02).div(dot(v02, v02)), 0, 1));
                u.assign(0);
                v.assign(w.oneMinus());
            }).ElseIf(v.lessThan(0), () => {
                u.assign(clamp(dot(p0, v10).div(dot(v10, v10)), 0, 1));
                v.assign(0);
                w.assign(u.oneMinus());
            }).ElseIf(w.lessThan(0), () => {
                v.assign(clamp(dot(p1, v21).div(dot(v21, v21)), 0, 1));
                w.assign(0);
                u.assign(v.oneMinus());
            })
            return [add(u.mul(v1), v.mul(v2), w.mul(v0)).toVar("closestTrianglePoint"), nor.negate()];
        };

        const distanceToTriangles = (point, offset, count) => {
            const end = offset.add(count).toVar("end");
            const closestTriangleDistanceSquared = float(1e9).toVar("closestTriangleDistanceSquared");
            const outPoint = vec3().toVar("outPoint");
            const outNormal = vec3().toVar("outNormal");
            Loop({ start: offset, end: end, type: 'uint', name: 'triangleIndex', condition: '<' }, ({triangleIndex}) => {
                const a = this.triangleBuffer.element(triangleIndex).get("a").toVar("a");
                const b = this.triangleBuffer.element(triangleIndex).get("b").toVar("b");
                const c = this.triangleBuffer.element(triangleIndex).get("c").toVar("c");
                const [closestPoint, closestNormal] = closestPointToTriangle(point, a, b, c);
                const delta = point.sub(closestPoint).toVar("triangleDelta");
                const sqDist = dot(delta,delta).toVar();
                If(sqDist.lessThan(closestTriangleDistanceSquared), () => {
                    closestTriangleDistanceSquared.assign(sqDist);
                    outPoint.assign(closestPoint);
                    outNormal.assign(closestNormal);
                });
            });
            return [closestTriangleDistanceSquared, outPoint, outNormal];
        };

        this.findClosestPoint = (point, maxDistanceSquared = float(1e12)) => {
            const ptr = int(0).toVar("ptr");
            const stack = array("uint", this.maxDepth*2).toVar("stack");
            stack.element(0).assign(uint(0));

            const closestPoint = vec3().toVar();
            const closestNormal = vec3().toVar();
            const closestDistanceSquared = maxDistanceSquared.toVar("closestDistanceSquared");
            const found = bool(false).toVar("found");
            Loop(ptr.greaterThan(int(-1)).and(ptr.lessThan(int(this.maxDepth*2))), () => {
                const currNodeIndex = stack.element(ptr).toVar("currNodeIndex");
                ptr.subAssign(int(1));
                const bvhNode = this.bvhBuffer.element(currNodeIndex);
                const boundsHitDistance = distanceSqToBVHNodeBoundsPoint(point, bvhNode);
                If(boundsHitDistance.greaterThan(closestDistanceSquared), () => {
                    Continue();
                });

                const isLeaf = bvhNode.get("isLeaf");
                If(isLeaf.equal(uint(1)), () => {
                    const offset = bvhNode.get("offset").toVar("offset");
                    const count = bvhNode.get("count").toVar("count");
                    const [closestTriangleDistance, closestTrianglePoint, closestTriangleNormal] = distanceToTriangles(point, offset, count);
                    If(closestTriangleDistance.lessThanEqual(closestDistanceSquared), () => {
                        found.assign(true);
                        closestDistanceSquared.assign(closestTriangleDistance);
                        closestPoint.assign(closestTrianglePoint);
                        closestNormal.assign(closestTriangleNormal);
                    });
                }).Else(() => {
                    const leftIndex = currNodeIndex.add(uint(1)).toVar("leftIndex");
                    const splitAxis = bvhNode.get("splitAxis").toVar("splitAxis");
                    const rightIndex = bvhNode.get("rightIndex").toVar("rightIndex");
                    const leftNode = this.bvhBuffer.element(leftIndex);
                    const rightNode = this.bvhBuffer.element(rightIndex);
                    const leftDistance = distanceSqToBVHNodeBoundsPoint(point, leftNode);
                    const rightDistance = distanceSqToBVHNodeBoundsPoint(point, rightNode);

                    const leftToRight = leftDistance.lessThan(rightDistance).toVar();
                    const c1 = select(leftToRight, leftIndex, rightIndex).toVar("c1");
                    const c2 = select(leftToRight, rightIndex, leftIndex).toVar("c2");

                    ptr.addAssign(1);
                    stack.element(ptr).assign(c2);
                    ptr.addAssign(1);
                    stack.element(ptr).assign(c1);
                });

            });

            return [closestPoint, closestNormal];
        }



    }
};