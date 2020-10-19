import * as THREE from '/deps/three/build/three.module.js'
import {GUI} from '/deps/three/examples/jsm/libs/dat.gui.module.js'
import Service from '/space/js/Service.js'

import {loadSet} from '/hmlt/spaceLoader.js'
import { createActor } from './three-utils/actorCast.js'


var camera, hmlt_root , renderer,clock, controls, transform_controls, panel, lighting_panel
let setStreamFunctions, id_lookup;

let active_model_name = ""



const models = {
    beachsand : {},
    statue : {},

}


    
export var initBuilder = (scene, k_camera, renderer, gesture_wrangler, audio_listener) => {
    panel = new GUI({width : 310})
    lighting_panel = new GUI({width: 300})


    hmlt_root = new THREE.Scene();

    clock = new THREE.Clock();

    camera = k_camera

    setStreamFunctions = new Map()
    id_lookup = new Map()


    

    
    

    fetch('https://hamlet-gl-assets.s3.amazonaws.com/config/beachConfig.js')
        .then(
        response => response.json())
        .then(data =>  {

                loadSet(hmlt_root, data, (hmlt_root,data) => {

                // load the actors and set stream functions
                if(data.actors) 
                {

                    console.log("creating actors")
                    console.log(data.actors)
                    data.actors.forEach(actor_data => {
                        let {x,y,z} = actor_data.transform.position;
                        let [sx,sy,sz] = actor_data.transform.scale;
                        let [qx,qy,qz,qw] = actor_data.transform.rotation
                        let [actor, setStream, getStream] = createActor(hmlt_root, {  name : actor_data.name, 
                                                                                      listener : audio_listener, 
                                                                                      position : new THREE.Vector3(x,y,z),
                                                                                      gestureWrangler : gesture_wrangler})
                                    
                                                    
                        setStreamFunctions.set(actor.name, {setStream : setStream, id: undefined})
                        

                })}

                scene.add(hmlt_root)
                Service.get('knobs', knobs => {
                    knobs.observe('hmlt_build', msg => {

                        if(msg === undefined) return; 

                        switch(msg.cmd) {
                        case "transform_update" :
                        {

                            let active_obj = hmlt_root.getObjectByName(msg.obj)
                            if(active_obj === undefined) 
                            {
                                return
                            }

                            let dispatch = {
                                "translate" : () => {
                                                let {x,y,z} = msg.data
                                                active_obj.position.copy(new THREE.Vector3(x,y,z))
                                                },
                               "scale" : () => {
                                                let {x,y,z} = msg.data
                                                active_obj.scale.copy(new THREE.Vector3(x,y,z))
                                                },
                               "rotate" : () => {
                                                let {_x,_y,_z,_w} = msg.data
                                                active_obj.quaternion.copy(new THREE.Quaternion(_x,_y,_z,_w))
                                                }
                               
 
                            }

                        

                            if(!Object.keys(dispatch).includes(msg.mode))
                                return
                            dispatch[msg.mode]()
                            break


                        }
                        case "light-update" : 
                        {
                            let active_obj = hmlt_root.getObjectByName(msg.obj)
                            active_obj[msg.prop] = msg.data
                            // we need to do a little more here in the case of
                            // spotlights
                            if(msg.prop === "name" && active_obj.type === "SpotLight") 
                            {
                                active_obj.target.name = `${msg.data} - target`
                                active_obj.target.userData.targetOf = msg.data

                            }
                            break

                        }

                        case "name-update" :
                                let active_obj = hmlt_root.getObjectByName(msg.obj)
                                active_obj.name = msg.data
                                break
                                
                        case "scene-update" : 
                        {
                            let {x,y,z} = msg.data
                            hmlt_root.position.copy(new THREE.Vector3(x,y,z))
                            break
                        }

                        case "duplicate-obj" :
                            {
                                duplicateSelectedObject(hmlt_root, msg.obj)
                                break
                            }
                        case "add-point" :
                            {
                                addPointLight(hmlt_root);
                                break
                            }
                        case "add-spot" :
                            {
                                addSpotLight(hmlt_root)
                            }
                        
                        case "add-actor" :
                            {
                                console.log("creating actor") 
                                
                                let [actor, setStream, getStream] = createActor(hmlt_root, {name : msg.data.name, 
                                                                                           listener : audio_listener, 
                                                                                            gestureWrangler : gesture_wrangler})
                                    
                                                    
                                setStreamFunctions.set(actor.name, {setStream : setStream, id: undefined})
                                break

                                
                                
                            }


                        case "delete-obj" :
                            {
                            let active_obj = hmlt_root.getObjectByName(msg.obj)
                            if(!active_obj)
                                return
                            hmlt_root.remove(active_obj)
                            }

                        }
                        



                    })

            })


                 }
            )
                })


                const hasId = (id) => {
                    console.log(id)
                    console.log(id_lookup.has(id))
                    return id_lookup.has(id)
                }
                const setActorId = (actor_name, id) => {
                    if(!setStreamFunctions.has(actor_name))
                    {
                        return
                    }
                    setStreamFunctions.set(actor_name, {...setStreamFunctions.get(actor_name), id : id })
                    id_lookup.set(id, actor_name)
                }

                const updateMediaStream = (id,t) => {

                    if(!id_lookup.has(id)) {
                        return
                    }
                    setStreamFunctions.get(id_lookup.get(id)).setStream(t)
                }

                return { 
                    setActorId : setActorId, 
                    setStream : updateMediaStream,
                    hasActorWithId : hasId
                }


                
            }


   

   

   const addPointLight = (hmlt_root) => {
        var plight = new THREE.PointLight( 0xff0000, 1, 100, 2 );
        if(hmlt_root.getObjectByName("pointlight")) 
        {

            let suf = hmlt_root.children.filter(child => child.name.includes("pointlight")).length
            plight.name = `pointlight.00${suf}`

        }else {
            plight.name = "pointlight"
        }
        hmlt_root.add(plight)
        buildGui(hmlt_root)
   }

   

   const addSpotLight = (hmlt_root) => {

    var slight = new THREE.SpotLight(0xff00ff, 1)
    if(hmlt_root.getObjectByName("spotlight")) 
        {

            let suf = hmlt_root.children.filter(child => child.name.includes("spotlight")).length
            slight.name = `spotlight.00${suf}`

        }else {
            slight.name = "spotlight"
        }

        let light_target = new THREE.Object3D();

        light_target.name = `${slight.name} - target`
        light_target.userData = 
        {
            isTarget : true,
            targetOf : slight.name
        }
            
        slight.target = light_target

        hmlt_root.add(slight)
        hmlt_root.add(light_target)
        
   }

  const duplicateSelectedObject = (hmlt_root, obj_name) => {
    
    let parent_obj = hmlt_root.getObjectByName(obj_name) 
    if(parent_obj) 
    {
        // check to see if we're cloning a duplicate
        if(parent_obj.userData.isClone) 
        {
            // if we're cloning a duplicate set the parent to the master
            parent_obj = hmlt_root.getObjectByName(parent_obj.userData.master)
        }

        // clone the object
        let new_object = parent_obj.clone();

        // we should make a sane name for our new object
        let object_name = parent_obj.name

        // how many objects are duplicates of this object?
        let num_dups = hmlt_root.children.filter((child) => {return child.userData.isClone && child.userData.master === parent_obj.name}).length

        object_name = `${object_name}.00${num_dups + 1}`;
        new_object.name = object_name

        
        // set userdata to make reduplications easier
        new_object.userData = 
        {
            isClone : true,
            master : parent_obj.name
        }

        hmlt_root.add(new_object)

    }


   } 








