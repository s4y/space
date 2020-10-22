import * as THREE from '/deps/three/build/three.module.js'
import {loadSet} from '/hmlt/spaceLoader.js'

var camera, scene_root, renderer, clock


let config_uri;

export var init = (actor_name, k_config_uri) => {

    conn = kconn

    scene_position = new THREE.Vector3(0,0,0)

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.01, 400);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    hmlt_root = new THREE.Scene();
    window.addEventListener('resize', (evt) => {


        let newWidth = window.innerWidth;
        let newHeight = window.innerHeight;

        camera.aspect =  newWidth / newHeight
        camera.updateProjectionMatrix();


        renderer.setSize(newWidth, newHeight)

        
   })

   reload()
   
}



const buildRenderer = () => {
    renderer = new THREE.WebGLRenderer({antialias : true})
    renderer.setSize( window.innerWidth, window.innerHeight )
      renderer.physicallyCorrectLights = true;

     const DPR = (window.devicePixelRatio) ? window.devicePixelRatio : 1;
    renderer.setPixelRatio(DPR);

    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

}



const Reload = () => {

        fetch(`https://hamlet-gl-assets.s3.amazonaws.com/config/${config_uri}`)
        .then( 

            response => response.json())
        .then(data => {
            loadSet(hmlt_root, data, (completed_scene, data) => {

            })


        }
        )
        


}