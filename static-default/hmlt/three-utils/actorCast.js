import * as THREE from '/deps/three/build/three.module.js'


let defaults = {
    width : 16,
    height : 9,
    position : new THREE.Vector3(0,0,0),
    stream : null
}
let module_name = "aCTOR"

const say = (text) => {

    console.log(`${module_name} : ${text}`)

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

    const mesh = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(width, height),
        new THREE.MeshBasicMaterial({
            color : 0xFFFFFF,
            side : THREE.DoubleSide,
            map : videoTexture
        }))


    const posSound = new THREE.PositionalAudio(options.listener);
    posSound.setRefDistance(10);
    posSound.setRolloffFactor(1.5);
    posSound.setDistanceModel('exponential');
    posSound.setDirectionalCone(120, 230, 0.2);
    posSound.rotation.y = Math.PI;
    mesh.add(posSound);

    const setStream = (stream) => {
        videoEl.srcObject = stream;
        options.gestureWrangler.playVideo(videoEl);
        posSound.setMediaStreamSource(stream);
        posSound.source.connect(musicAnalyser);


    }

    const getStream = () => {
        return options.stream
    }
    mesh.userData.isActor = true




    mesh.name = options.name
    object.add(mesh)

    mesh.position.copy(options.position)
    return [mesh, setStream, getStream]
}