import * as THREE from '/deps/three/build/three.module.js'
import {loadMesh} from '/hmlt/three-utils/modelLoader.js'




let module_name = "SPACE_LOADER"

const say = (text) => {

    

    console.log(`${module_name} : ${text}`)

}

const setTransform = (object, transform_data) => {

    let [rx,ry,rz,rw] = transform_data.rotation;
    let [sx, sy, sz] = transform_data.scale;
    let {x,y,z} = transform_data.position;
    
    object.rotation.setFromQuaternion(new THREE.Quaternion(rx,ry,rz,rw));
    object.scale.copy(new THREE.Vector3(sx,sy,sz));
    object.position.copy(new THREE.Vector3(x,y,z));


}
export const loadSet = (object, config, callback) => {


    say('LOADING MODELS...')
    console.log(config.models)
    const promises = config.models.map(model => {

        return loadMesh(model).then(mesh => {
            object.add(mesh)
        })
    })

    Promise.all(promises).then(() => {

        say('MODELS LOADED.  Creating Light Targets')
        config.targets.forEach(target_data => {


            let new_target = new THREE.Object3D()
            new_target.userData = 
            {
                isTarget : true,
                targetOf : target_data.targetOf
            }
            new_target.name = target_data.name
            setTransform(new_target, target_data.transform)
            object.add(new_target);
        })

        say('TARGETS CREATED. ADDING LIGHTS')
        console.log(config.lights)
        config.lights.forEach(light_data => {

            // we need to set these light properties manually
            let dispatch = 
            {
                "PointLight" : (light_props) => { 
                    let new_light = new THREE.PointLight(new THREE.Color(light_props.color))
                    new_light.power = light_props.power
                    return new_light 
                     },
                    
                "SpotLight" : (light_props)  => {
                    let new_spot = new THREE.SpotLight(new THREE.Color(light_props.color));
                    new_spot.power = light_props.power;
                    new_spot.angle = light_props.angle;
                    new_spot.penumbra = light_props.penumbra;
                    new_spot.target = object.getChildByName(light_props.targetName)
                    return new_spot

                    }
            }

            let props = {}
            let new_light = dispatch[light_data.type](light_data)
            new_light.name = light_data.name
            
            setTransform(new_light, light_data.transform)

            object.add(new_light)

            


            


        })
        if (callback)
            callback(object, config)

    })

}
