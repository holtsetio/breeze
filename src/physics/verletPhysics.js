import * as THREE from "three/webgpu";
import {
    Fn,
    If,
    Loop,
    select,
    uint,
    instanceIndex,
    uniform,
    instancedArray,
    float,
    distance,
    max,
    time,
    vec3, dot, vec4, Return, smoothstep
} from "three/tsl";
import {triNoise3Dvec} from "../common/noise.js";

export class VerletPhysics {
    renderer = null;

    isBaked = false;

    vertices = [];

    springs = [];

    colliders = [];

    uniforms = {};

    kernels = {};

    objects = [];

    time = 0;

    timeSinceLastStep = 0;

    frameNum = 0;

    friction = 0.5;

    stiffness = 0.25;

    constructor(renderer){
        this.renderer = renderer;
    }

    addObject(object) {
        const id = this.objects.length;
        const objectData = {
            id,
            object,
            position: new THREE.Vector3(),
            vertexStart: this.vertices.length,
            vertexCount: 0,
            springStart: this.springs.length,
            springCount: 0,
        };
        this.objects.push(objectData);
        return id;
    }

    addCollider(collider) {
        this.colliders.push(collider);
    }

    addVertex(objectId, position, fixed = false) {
        if (this.isBaked) {
            console.error("Can't add any more vertices!");
        }
        const { x,y,z } = position;
        const id = this.vertices.length;
        const value = { x, y, z, w: fixed ? 0 : 1 };
        const springs = [];
        const vertex = { id, value, springs, fixed };
        this.vertices.push(vertex);
        this.objects[objectId].vertexCount++;
        return vertex;
    }

    addSpring(objectId, vertex0, vertex1, stiffness, restLengthFactor = 1.0) {
        if (this.isBaked) {
            console.error("Can't add any more springs!");
        }
        const id = this.springs.length;
        vertex0.springs.push({ id, sign: 1 });
        vertex1.springs.push({ id, sign: -1 });
        this.springs.push({ id, vertex0, vertex1, stiffness, restLengthFactor });
        this.objects[objectId].springCount++;
        return id;
    }

    async bake() {
        this.vertexCount = this.vertices.length;
        this.springCount = this.springs.length;
        this.objectCount = this.objects.length;
        console.log(this.vertexCount + " vertices");
        console.log(this.springCount + " springs");

        this.uniforms.dampening = uniform(0.995);
        this.uniforms.time = uniform(0.0);
        this.uniforms.stiffness = uniform(this.stiffness);
        this.uniforms.friction = uniform(this.friction);

        const positionArray = new Float32Array(this.vertexCount * 4);
        const influencerPtrArray = new Uint32Array(this.vertexCount * 2);
        const influencerArray = new Int32Array(this.springCount * 2);
        let influencerPtr = 0;
        this.vertices.forEach((v)=> {
            const {id, value, springs, fixed} = v;
            positionArray[id * 4 + 0] = value.x;
            positionArray[id * 4 + 1] = value.y;
            positionArray[id * 4 + 2] = value.z;
            positionArray[id * 4 + 3] = value.w;
            influencerPtrArray[id * 2 + 0] = influencerPtr;
            if (!fixed) {
                influencerPtrArray[id * 2 + 1] = springs.length;
                springs.forEach(s => {
                    influencerArray[influencerPtr] = (s.id+1) * s.sign;
                    influencerPtr++;
                });
            }
        });
        this.initialPositionData = instancedArray(positionArray, "vec4");
        this.positionData = instancedArray(positionArray, "vec4");
        this.forceData = instancedArray(this.vertexCount, "vec3");
        this.influencerPtrData = instancedArray(influencerPtrArray, "uvec2");
        this.influencerData = instancedArray(influencerArray, "int");

        const springVertexArray = new Uint32Array(this.springCount * 2);
        const springParamsArray = new Float32Array(this.springCount * 3);
        this.springs.forEach((spring)=>{
            const { id, vertex0, vertex1, stiffness, restLengthFactor } = spring;
            springVertexArray[id * 2 + 0] = vertex0.id;
            springVertexArray[id * 2 + 1] = vertex1.id;
            springParamsArray[id * 3 + 0] = stiffness;
            springParamsArray[id * 3 + 1] = 0;
            springParamsArray[id * 3 + 2] = restLengthFactor;
        });
        this.springVertexData = instancedArray(springVertexArray, "uvec2");
        this.springParamsData = instancedArray(springParamsArray, "vec3");
        this.springForceData = instancedArray(this.springCount, 'vec3');

        const firstVertexIdArray = new Uint32Array(this.objectCount);
        this.objects.forEach((object) => {
           const { id, vertexStart } = object;
           firstVertexIdArray[id] = vertexStart;
        });
        this.firstVertexIdData = instancedArray(firstVertexIdArray, "uint");
        this.objectPositionData = instancedArray(this.objectCount, "vec3");

        const initSpringLengths = Fn(()=>{
            const vertices = this.springVertexData.element(instanceIndex);
            const v0 = this.positionData.element(vertices.x).xyz;
            const v1 = this.positionData.element(vertices.y).xyz;
            const params = this.springParamsData.element(instanceIndex);
            const restLengthFactor = params.z;
            const restLength = params.y;
            restLength.assign(distance(v0, v1) * restLengthFactor);
        })().compute(this.springCount);
        await this.renderer.computeAsync(initSpringLengths);

        this.kernels.computeSpringForces = Fn(()=>{
            const vertices = this.springVertexData.element(instanceIndex);
            const v0 = this.positionData.element(vertices.x).toVec3();
            const v1 = this.positionData.element(vertices.y).toVec3();
            const params = this.springParamsData.element(instanceIndex);
            const stiffness = this.uniforms.stiffness; //params.x;
            const restLength = params.y;
            const delta = (v1 - v0).toVar();
            const dist = delta.length().max(0.000001).toVar();
            const force = (dist - restLength) * stiffness * delta * 0.5 / dist;
            this.springForceData.element(instanceIndex).assign(force);
        })().compute(this.springCount);

        this.kernels.computeVertexForces = Fn(()=>{
            const position = this.positionData.element(instanceIndex).toVar();
            If(position.w.greaterThan(0.5), ()=>{
                const influencerPtr = this.influencerPtrData.element(instanceIndex).toVar();
                const ptrStart = influencerPtr.x.toVar();
                const ptrEnd = ptrStart.add(influencerPtr.y).toVar();

                const force = this.forceData.element(instanceIndex).toVar();
                force.mulAssign(this.uniforms.dampening);
                Loop({ start: ptrStart, end: ptrEnd,  type: 'uint', condition: '<' }, ({ i })=>{
                    const springPtr = this.influencerData.element(i);
                    const springForce = this.springForceData.element(uint(springPtr.abs()) - uint(1));
                    const factor = select(springPtr.greaterThan(0), 1.0, -1.0);
                    force.addAssign(springForce * factor);
                });
                force.y.subAssign(0.000001);
                const noise = triNoise3Dvec(position.xyz.mul(0.01), 0.2, this.uniforms.time).sub(vec3(0.0, 0.285, 0.285));
                const chaos = smoothstep(-0.5, 1, position.x).mul(0.0001).toVar();
                force.addAssign(noise.mul(vec3(0.00005, chaos, chaos)).mul(5));

                const projectedPoint = position.xyz.add(force).toVar();
                If (projectedPoint.y.lessThan(0), () => {
                    force.y.subAssign(projectedPoint.y);
                    projectedPoint.y.assign(0);
                });

                const forceMagSquared = dot(force.mul(1.001), force.mul(1.001)).toVar();
                const [closestPoint, closestNormal] = this.colliders[0].findClosestPoint(projectedPoint, forceMagSquared);

                const closestPointDelta = closestPoint.sub(projectedPoint).toVar("closestPointDelta");
                const forceSet = force.toVar();
                If(dot(closestPointDelta, closestNormal).greaterThan(0), () => {
                   force.assign(closestPoint.sub(position.xyz));
                   forceSet.assign(force.mul(this.uniforms.friction.oneMinus()));
                });

                this.forceData.element(instanceIndex).assign(forceSet);
                this.positionData.element(instanceIndex).addAssign(force);

            });
        })().debug().compute(this.vertexCount);

        this.kernels.readPositions = Fn(()=>{
            const firstVertex = this.firstVertexIdData.element(instanceIndex);
            const position = this.positionData.element(firstVertex);
            this.objectPositionData.element(instanceIndex).assign(position);
        })().compute(this.objects.length);
        //await this.renderer.computeAsync(this.kernels.readPositions); //call once to compile

        this.uniforms.resetVertexStart = uniform(0, "uint");
        this.uniforms.resetVertexCount = uniform(0, "uint");
        this.uniforms.resetMatrix = uniform(new THREE.Matrix4());
        this.kernels.resetVertices = Fn(()=>{
            If(instanceIndex.greaterThanEqual(this.uniforms.resetVertexCount), () => {
                Return();
            });
            const vertexId = this.uniforms.resetVertexStart.add(instanceIndex).toVar();
            const initialPosition = this.initialPositionData.element(vertexId).toVar();
            const transformedPosition = this.uniforms.resetMatrix.mul(vec4(initialPosition.xyz, 1)).xyz.toVar();
            this.positionData.element(vertexId).assign(vec4(transformedPosition.xyz, initialPosition.w));
            this.forceData.element(vertexId).assign(0);
        })().compute(1);
        //console.time("resetVertices");
        await this.renderer.computeAsync(this.kernels.resetVertices); //call once to compile

        this.isBaked = true;
    }

    async readPositions() {
        await this.renderer.computeAsync(this.kernels.readPositions);
        const positions = new Float32Array(await this.renderer.getArrayBufferAsync(this.objectPositionData.value));
        this.objects.forEach((o, index) => {
            const x = positions[index*4+0];
            const y = positions[index*4+1];
            const z = positions[index*4+2];
            o.position.set(x,y,z);
        });
    }

    async resetObject(id, position, quaternion = new THREE.Quaternion()) {
        this.objects[id].position.copy(position);
        const scale = new THREE.Vector3(1,1,1);
        this.uniforms.resetMatrix.value.compose(position, quaternion, scale);
        this.uniforms.resetVertexStart.value = this.objects[id].vertexStart;
        this.uniforms.resetVertexCount.value = this.objects[id].vertexCount;
        this.kernels.resetVertices.count = this.objects[id].vertexCount;
        this.kernels.resetVertices.updateDispatchCount();
        await this.renderer.computeAsync(this.kernels.resetVertices);
    }

    async update(interval, elapsed) {
        if (!this.isBaked) {
            console.error("Verlet system not yet baked!");
        }
        this.uniforms.stiffness.value = this.stiffness;
        this.uniforms.friction.value = this.friction;

        this.frameNum++;
        if (this.frameNum % 50 === 0) {
            this.readPositions().then(() => {}); // no await to prevent blocking!
        }

        const stepsPerSecond = 360;
        const timePerStep = 1 / stepsPerSecond;
        interval = Math.max(Math.min(interval, 1/60), 0.0001);
        this.timeSinceLastStep += interval;

        while (this.timeSinceLastStep >= timePerStep) {
            this.time += timePerStep;
            this.uniforms.time.value = this.time;
            this.timeSinceLastStep -= timePerStep;
            await this.renderer.computeAsync(this.kernels.computeSpringForces);
            await this.renderer.computeAsync(this.kernels.computeVertexForces);
        }
    }
}
