import { Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import { Fn, texture, shadow, lights, vec3, uv, uniform } from 'three/tsl';
import {conf} from "./conf.js";

/**
 * A ground-projected skybox.
 *
 * By default the object is centered at the camera, so it is often helpful to set
 * `skybox.position.y = height` to put the ground at the origin.
 *
 * ```js
 * const height = 15, radius = 100;
 *
 * const skybox = new GroundedSkybox( envMap, height, radius );
 * skybox.position.y = height;
 * scene.add( skybox );
 * ```
 *
 * @augments Mesh
 * @three_import import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
 */
export class GroundedSkybox extends Mesh {

    /**
     * Constructs a new ground-projected skybox.
     *
     * @param {Texture} map - The environment map to use.
     * @param {number} height - The height is how far the camera that took the photo was above the ground.
     * A larger value will magnify the downward part of the image.
     * @param {number} radius - The radius of the skybox. Must be large enough to ensure the scene's camera stays inside.
     * @param {number} [resolution=128] - The geometry resolution of the skybox.
     */
    constructor( map, height, radius, resolution = 128 ) {

        if ( height <= 0 || radius <= 0 || resolution <= 0 ) {

            throw new Error( 'GroundedSkybox height, radius, and resolution must be positive.' );

        }

        const geometry = new SphereGeometry( radius, 2 * resolution, resolution );
        geometry.scale( 1, 1, - 1 );

        const pos = geometry.getAttribute( 'position' );
        const tmp = new Vector3();

        for ( let i = 0; i < pos.count; ++ i ) {

            tmp.fromBufferAttribute( pos, i );
            if ( tmp.y < 0 ) {

                // Smooth out the transition from flat floor to sphere:
                const y1 = - height * 3 / 2;
                const f =
                    tmp.y < y1 ? - height / tmp.y : ( 1 - tmp.y * tmp.y / ( 3 * y1 * y1 ) );
                tmp.multiplyScalar( f );
                tmp.toArray( pos.array, 3 * i );

            }

        }

        pos.needsUpdate = true;

        const material = new MeshBasicNodeMaterial({map});
        /*const tLevel = uniform(0, "float");
        material.colorNode = Fn(() => {
            return texture(map, uv(), tLevel);
        })();
        conf.settings.addBinding(tLevel, "value", { min: 0, max: 10, step: 0.01 });*/
        /*material.fragmentNode = Fn(() => {
            return texture(map).mul(shadow(lightsObject.light, lightsObject.light.shadow));
        })();*/
        //material.lightsNode = lights([]);
        //material.envNode = vec3(1);

        super( geometry, material );

    }

}