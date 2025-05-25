import {float, floor, Fn, If, trunc, vec3, int} from "three/tsl";

export const hsvtorgb = /*@__PURE__*/ Fn( ( [ hsv ] ) => {

    const s = hsv.y;
    const v = hsv.z;

    const result = vec3().toVar();
    let h = hsv.x;
    h = h.sub( floor( h ) ).mul( 6.0 ).toConst(); // TODO: check what .toVar() is needed in node system cache
    const hi = int( trunc( h ) ).toConst();
    const f = h.sub( float( hi ) ).toConst();
    const p = v.mul( s.oneMinus() ).toConst();
    const q = v.mul( s.mul( f ).oneMinus() ).toConst();
    const t = v.mul( s.mul( f.oneMinus() ).oneMinus() ).toConst();

    If( s.lessThan( 0.0001 ), () => {

        result.assign( vec3( v, v, v ) );

    } ).ElseIf( hi.equal( int( 0 ) ), () => {

        result.assign( vec3( v, t, p ) );

    } ).ElseIf( hi.equal( int( 1 ) ), () => {

        result.assign( vec3( q, v, p ) );

    } ).ElseIf( hi.equal( int( 2 ) ), () => {

        result.assign( vec3( p, v, t ) );

    } ).ElseIf( hi.equal( int( 3 ) ), () => {

        result.assign( vec3( p, q, v ) );

    } ).ElseIf( hi.equal( int( 4 ) ), () => {

        result.assign( vec3( t, p, v ) );

    } ).Else( () => {

        result.assign( vec3( v, p, q ) );

    } );

    return result;

} ).setLayout( {
    name: 'hsvtorgb',
    type: 'vec3',
    inputs: [
        { name: 'hsv', type: 'vec3' }
    ]
} );