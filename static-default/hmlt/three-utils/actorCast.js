import * as THREE from '/deps/three/build/three.module.js'


let defaults = {
    width : 16,
    height : 9,
    position : new THREE.Vector3(0,0,0),
    rotation : new THREE.Quaternion(0,0,0,1),
    scale : new THREE.Vector3(1,1,1),
    stream : null
}
let module_name = "aCTOR"

const say = (text) => {

    console.log(`${module_name} : ${text}`)

}
const createChromaKeyMaterial = () => {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      map: { type: 't' },
      t: { value: 0 },
      aspect: { value: 1 },
      slop: { value: 0.1 },
      crop: { value: 0 },
      edgeCorrection: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 p;
      uniform float aspect;
      uniform float crop;

      void main() {
        p = uv*2.-1.;
        p *= 1. - crop;
        // norm = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position * vec3(aspect, 1., 1.), 1.0 );
      }
    `,

    fragmentShader: `
      #include <common>

      uniform float slop;
      uniform float edgeCorrection;

      varying vec2 p;
      uniform sampler2D map;

      void main() {
        vec2 uv = p;
        uv = uv/2.+.5;
        vec4 tex = texture2D(map, uv);

        tex *= pow(1.-clamp(tex.g - max(tex.r, tex.b) - slop, 0., 1.), 50.);
        tex.g = min(tex.g, max(tex.r, tex.b) + edgeCorrection);
        gl_FragColor = tex;
      }
    `,
  });
}


export const createActor = (object, parameters) => {



    // refactor party.html actor functions

    let options = {...defaults, ...parameters}

    if(!options.listener || !options.name || !options.gestureWrangler) {

        say("CAN\'T INITIALIZE ACTOR PANEL. Need a listener and a name") 
        return

    }

    const actor_element = document.createElement('video')
    actor_element.playsInline = true;
    actor_element.muted = true;

    const videoTexture = new THREE.VideoTexture(actor_element);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBFormat

    const chromaMat = createChromaKeyMaterial();


    // const mesh = new THREE.Mesh(
    //     new THREE.PlaneBufferGeometry(options.width, options.height),
    //     new THREE.MeshBasicMaterial({
    //         color : 0xFFFFFF,
    //         side : THREE.DoubleSide,
    //         map : videoTexture
    //     }))

    const mesh = new THREE.Mesh(
         new THREE.PlaneBufferGeometry(options.width, options.height),
         chromaMat
    )

    mesh.material.uniforms.map.value = videoTexture;
    mesh.material.uniforms.slop.value = 0.05;
    mesh.material.uniforms.edgeCorrection.value = 0.2;


    let sound =  new THREE.Audio(options.listener)

    mesh.add(sound);


    const setStream = (stream) => {
        actor_element.srcObject = stream;
        options.gestureWrangler.playVideo(actor_element);
        sound.setMediaStreamSource(stream);


    }

    const getStream = () => {
        return options.stream
    }
    mesh.userData.isActor = true




    mesh.name = options.name
    object.add(mesh)
    mesh.rotation.setFromQuaternion(options.rotation)

    mesh.scale.copy(options.scale)

    mesh.position.copy(options.position)
    return [mesh, setStream, getStream]
}