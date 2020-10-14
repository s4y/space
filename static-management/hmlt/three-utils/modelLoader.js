import * as THREE from '/deps/three/build/three.module.js'
import {GLTFLoader} from '/deps/three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from '/deps/three/examples/jsm/loaders/DRACOLoader.js';


let defaults = {
    useDraco : false,
    textureKeys : ['map', 'normalMap', 'aoMap', 'roughnessMap']
}


export const loadMesh = (model, parameters)  => {

    let options = {...defaults, ...parameters}

    const loadTexture = (texture_uri) => 
    {

        return new Promise(resolve => {
            new THREE.TextureLoader()
             .setPath(model.texture_path)
             .load(texture_uri, resolve)

        })

    }
    const loadGeometry = (geo_config) => 
    {
        return new Promise(resolve => {

            var loader = new GLTFLoader()
            loader.setPath(model.glb_path)

            if(options.useDraco) 
            {
                var dracoLoader = new DRACOLoader();
                dracoLoader.setDecoderPath(options.decoderPath);
                loader.setDRACOLoader(dracoLoader)
            }
            loader.load(geo_config.uri, resolve)

        })
    }
    const loadMaterial = (model) => {

        let params = {}
        const promises = Object.keys(model).map(key => {

            if(options.textureKeys.indexOf(key) !== -1 ) {
                return loadTexture(model[key]).then(texture => {
                    params[key] = texture;
                })
            }else {
                params[key] = model[key]
            }


        })

        return Promise.all(promises).then(() => {
            
            params = {...params, normalScale : new THREE.Vector2(1, -1)}

            return new THREE.MeshStandardMaterial(params)

        })
        
    }
    const promises = [
        loadGeometry(model.geometry),
        loadMaterial(model.material)
    ]
    
    return Promise.all(promises).then((result) => {

        //need to do some geometry things here.
        let gltf = result[0];
        console.log(gltf)
        if(Object.keys(gltf).indexOf("scene") !== -1) 
        {
            let mesh = gltf.scene.getObjectByName(model.geometry.name)
            if(mesh) {
                 let geometry = mesh.geometry;
                geometry.attributes.uv2 = geometry.attributes.uv;
                geometry.center()
                let final = new THREE.Mesh(geometry, result[1])
                let [ rx,ry,rz,rw] = model.transform.rotation
                let [sx, sy, sz] = model.transform.scale
                let {x,y,z} = model.transform.position;
                

                final.rotation.setFromQuaternion(new THREE.Quaternion(rx,ry,rz,rw))
                final.scale.copy(new THREE.Vector3(sx,sy,sz))
                final.position.copy(new THREE.Vector3(x,y,z))
                final.name = model.geometry.name
                return final 

            }

        }



    });


    


    

    


}

