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
    vec3, dot, vec4, Return, mix
} from "three/tsl";
import {StructuredArray} from "../common/structuredArray.js";
import {conf} from "../conf.js";

export class VerletPhysics {
    renderer = null;

    isBaked = false;

    vertices = [];

    springs = [];

    colliders = [];

    forces = [];

    uniforms = {};

    kernels = {};

    objects = [];

    time = 0;

    timeSinceLastStep = 0;

    frameNum = 0;

    constructor(renderer){
        this.renderer = renderer;
    }

    addObject() {
        const id = this.objects.length;
        const object = {
            id,
            position: new THREE.Vector3(),
            vertexStart: this.vertices.length,
            vertexCount: 0,
            springStart: this.springs.length,
            springCount: 0,
        };
        this.objects.push(object);
        return object;
    }

    addCollider(collider) {
        this.colliders.push(collider);
    }

    addForce(force) {
        this.forces.push(force);
    }

    addVertex(objectId, position, fixed = false) {
        if (this.isBaked) {
            console.error("Can't add any more vertices!");
        }
        const vertex = new THREE.Vector3().copy(position);
        vertex.id = this.vertices.length;
        vertex.springs = [];
        vertex.fixed = fixed;
        this.vertices.push(vertex);
        this.objects[objectId].vertexCount++;
        return vertex;
    }

    addSpring(objectId, vertex0, vertex1) {
        if (this.isBaked) {
            console.error("Can't add any more springs!");
        }
        const id = this.springs.length;
        vertex0.springs.push({ id, sign: 1 });
        vertex1.springs.push({ id, sign: -1 });
        const restLength = vertex0.distanceTo(vertex1);
        this.springs.push({ id, vertex0, vertex1, restLength });
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
        this.uniforms.stiffness = uniform(conf.stiffness);
        this.uniforms.friction = uniform(conf.friction);

        const vertexStruct = {
            position: "vec3",
            isFixed: "uint",
            initialPosition: "vec3",
            springPtr: "uint",
            force: "vec3",
            springCount: "uint",
            smoothedPosition: "vec3",
        };
        this.vertexBuffer = new StructuredArray(vertexStruct, this.vertexCount, "verletVertices");

        const springStruct = {
            restLength: "float",
            vertex0: "uint",
            vertex1: "uint",
            dummy: "float",
        };
        this.springBuffer = new StructuredArray(springStruct, this.springCount, "verletSprings");

        const influencerArray = new Int32Array(this.springCount * 2);
        let influencerPtr = 0;
        this.vertices.forEach((vertex)=> {
            const {id, springs, fixed} = vertex;
            this.vertexBuffer.set(id, "position", vertex.customPos || vertex);
            this.vertexBuffer.set(id, "smoothedPosition", vertex.customPos || vertex);
            this.vertexBuffer.set(id, "initialPosition", vertex);
            this.vertexBuffer.set(id, "isFixed", fixed ? 1 : 0);
            this.vertexBuffer.set(id, "springPtr", influencerPtr);
            if (!fixed) {
                this.vertexBuffer.set(id, "springCount", springs.length);
                springs.forEach((s, index) => {
                    //if (index === 0) {
                        influencerArray[influencerPtr] = (s.id + 1) * s.sign;
                        influencerPtr++;
                    //}
                });
            }
        });

        this.influencerData = instancedArray(influencerArray, "int");

        this.springs.forEach((spring)=>{
            const { id, vertex0, vertex1, restLength } = spring;
            this.springBuffer.set(id, "vertex0", vertex0.id);
            this.springBuffer.set(id, "vertex1", vertex1.id);
            this.springBuffer.set(id, "restLength", restLength);
        });
        this.springForceData = instancedArray(this.springCount, 'vec3');

        const firstVertexIdArray = new Uint32Array(this.objectCount);
        this.objects.forEach((object) => {
           const { id, vertexStart } = object;
           firstVertexIdArray[id] = vertexStart;
        });
        this.firstVertexIdData = instancedArray(firstVertexIdArray, "uint");
        this.objectPositionData = instancedArray(this.objectCount, "vec3");

        this.kernels.computeSpringForces = Fn(()=>{
            const spring = this.springBuffer.element(instanceIndex);
            const v0id = spring.get("vertex0");
            const v1id = spring.get("vertex1");
            const restLength = spring.get("restLength");
            const stiffness = this.uniforms.stiffness; //params.x;
            const v0 = this.vertexBuffer.element(v0id).get("position");
            const v1 = this.vertexBuffer.element(v1id).get("position");
            const delta = (v1 - v0).toVar();
            const dist = delta.length().max(0.000001).toVar();
            const force = (dist - restLength) * stiffness * delta * 0.5 / dist;
            this.springForceData.element(instanceIndex).assign(force);
        })().compute(this.springCount);

        this.kernels.computeVertexForces = Fn(()=>{
            const vertex = this.vertexBuffer.element(instanceIndex);

            If(vertex.get("isFixed").greaterThan(uint(0)), ()=> {
                Return();
            });

            const position = vertex.get("position").toVar();
            const ptrStart = vertex.get("springPtr").toVar();
            const springCount = vertex.get("springCount").toVar();
            const ptrEnd = ptrStart.add(springCount).toVar();

            const force = vertex.get("force").toVar();
            force.mulAssign(this.uniforms.dampening);
            Loop({ start: ptrStart, end: ptrEnd,  type: 'uint', condition: '<' }, ({ i })=>{
                const springPtr = this.influencerData.element(i);
                const springForce = this.springForceData.element(uint(springPtr.abs()) - uint(1));
                const factor = select(springPtr.greaterThan(0), 1.0, -1.0);
                force.addAssign(springForce * factor);
            });

            this.forces.forEach(f => {
               force.addAssign(f(position, this.uniforms.time));
            });

            const projectedPoint = position.add(force).toVar();
            If (projectedPoint.y.lessThan(0), () => {
                force.y.subAssign(projectedPoint.y);
                projectedPoint.y.assign(0);
            });

            const forceMagSquared = dot(force.mul(1.001), force.mul(1.001)).toVar();
            const [closestPoint, closestNormal] = this.colliders[0].findClosestPoint(projectedPoint, forceMagSquared);

            const closestPointDelta = closestPoint.sub(projectedPoint).toVar("closestPointDelta");
            const forceSet = force.toVar();
            If(dot(closestPointDelta, closestNormal).greaterThan(0), () => {
                force.assign(closestPoint.sub(position));
                forceSet.assign(force.mul(this.uniforms.friction.oneMinus()));
            });

            this.vertexBuffer.element(instanceIndex).get("force").assign(forceSet);
            this.vertexBuffer.element(instanceIndex).get("position").addAssign(force);
        })().compute(this.vertexCount);


        this.kernels.smoothPositions = Fn(()=>{
            const vertex = this.vertexBuffer.element(instanceIndex);
            const position = vertex.get("position");
            const smoothedPosition = vertex.get("smoothedPosition");

            const newPos = mix(smoothedPosition, position, 0.25);
            vertex.get("smoothedPosition").assign(newPos);
        })().compute(this.vertexCount);

        this.kernels.readPositions = Fn(()=>{
            const firstVertex = this.firstVertexIdData.element(instanceIndex);
            const position = this.vertexBuffer.element(firstVertex).get("position");
            this.objectPositionData.element(instanceIndex).assign(position);
        })().compute(this.objects.length);

        this.uniforms.resetVertexStart = uniform(0, "uint");
        this.uniforms.resetVertexCount = uniform(0, "uint");
        this.uniforms.resetMatrix = uniform(new THREE.Matrix4());
        this.kernels.resetVertices = Fn(()=>{
            If(instanceIndex.greaterThanEqual(this.uniforms.resetVertexCount), () => {
                Return();
            });
            const vertexId = this.uniforms.resetVertexStart.add(instanceIndex).toVar();
            const vertex = this.vertexBuffer.element(vertexId);
            const initialPosition = vertex.get("initialPosition").toVar();
            const transformedPosition = this.uniforms.resetMatrix.mul(vec4(initialPosition, 1)).xyz.toVar();
            vertex.get("position").assign(transformedPosition);
            vertex.get("smoothedPosition").assign(transformedPosition);
            vertex.get("force").assign(0);
        })().compute(1);
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
        const matrix = new THREE.Matrix4().compose(position, quaternion, scale);
        if (this.isBaked) {
            this.uniforms.resetMatrix.value.copy(matrix);
            this.uniforms.resetVertexStart.value = this.objects[id].vertexStart;
            this.uniforms.resetVertexCount.value = this.objects[id].vertexCount;
            this.kernels.resetVertices.count = this.objects[id].vertexCount;
            this.kernels.resetVertices.updateDispatchCount();
            await this.renderer.computeAsync(this.kernels.resetVertices);
        } else {
            const { vertexStart, vertexCount } = this.objects[id];
            for (let i = vertexStart; i < vertexStart + vertexCount; i++) {
                const pos = this.vertices[i].clone();
                pos.applyMatrix4(matrix);
                this.vertices[i].customPos = pos;
            }
        }
    }

    async update(interval, elapsed) {
        if (!this.isBaked) {
            console.error("Verlet system not yet baked!");
        }

        const { stiffness, friction } = conf;

        this.uniforms.stiffness.value = stiffness;
        this.uniforms.friction.value = friction;

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
        await this.renderer.computeAsync(this.kernels.smoothPositions);
    }
}
