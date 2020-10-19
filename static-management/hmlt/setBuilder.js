import * as THREE from '/deps/three/build/three.module.js'
import {TransformControls} from '/deps/three/examples/jsm/controls/TransformControls.js'
import {OrbitControls} from '/deps/three/examples/jsm/controls/OrbitControls.js'
import {GUI} from '/deps/three/examples/jsm/libs/dat.gui.module.js'

import {loadSet} from '/hmlt/spaceLoader.js'
import {createActor} from '/hmlt/three-utils/actorPlace.js'

var camera, hmlt_root , renderer,clock, controls, transform_controls, panel, lighting_panel, actor_panel

var scene_position
let active_model_name = ""
let conn;
let config ;


export var init = ( kconn, config_uri) => {

    conn = kconn

    scene_position = new THREE.Vector3(0,0,0)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.01, 400);


    camera.position.set( 0,40, 100 );
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    hmlt_root = new THREE.Scene();
    clock = new THREE.Clock();
    renderer = new THREE.WebGLRenderer({antialias : true})
    renderer.setSize( window.innerWidth, window.innerHeight )
      renderer.physicallyCorrectLights = true;

     const DPR = (window.devicePixelRatio) ? window.devicePixelRatio : 1;
    renderer.setPixelRatio(DPR);

    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    initBuilder(hmlt_root,config_uri, camera, renderer)
   window.addEventListener('resize', (evt) => {


        let newWidth = window.innerWidth;
        let newHeight = window.innerHeight;

        camera.aspect =  newWidth / newHeight
        camera.updateProjectionMatrix();


        renderer.setSize(newWidth, newHeight)

        
   })
}
    
export var initBuilder = (scene,config_uri, k_camera, renderer) => {
    panel = new GUI({width : 310})
    lighting_panel = new GUI({width: 300})
    actor_panel = new GUI({width: 300})


    hmlt_root = new THREE.Scene();

    clock = new THREE.Clock();

    camera = k_camera

    console.log(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement);
    transform_controls = new TransformControls(camera, renderer.domElement);
    transform_controls.addEventListener( 'change', (event) => {

            }
        );
    transform_controls.addEventListener('objectChange', (event) => {

        let mode = transform_controls.getMode()
        let which_data = {
            "translate" : hmlt_root.getObjectByName(active_model_name).position,
            "scale" : hmlt_root.getObjectByName(active_model_name).scale,
            "rotate" : hmlt_root.getObjectByName(active_model_name).quaternion,
        }
        conn && conn.send('setKnob', {name : "hmlt_build", value : {
            obj: active_model_name, 
            cmd : "transform_update",
            mode : mode,
            data : which_data[mode]}}
          )
        console.log(mode)

        

    })
    transform_controls.addEventListener( 'dragging-changed', function ( event ) 
                {
					controls.enabled = ! event.value;
				} );

     const DPR = (window.devicePixelRatio) ? window.devicePixelRatio : 1;


    hmlt_root.add(transform_controls)

    

    
    

    fetch(`https://hamlet-gl-assets.s3.amazonaws.com/config/${config_uri}`)
        .then(
        response => response.json())
        .then(data =>  {

                config = data 
                loadSet(hmlt_root, data, (hmlt_root,data) => {
                buildGui(hmlt_root)
                buildActorGui(hmlt_root)
                scene.add(hmlt_root)
                animate()

            })


                 }
            )


   

   window.top.addEventListener('keyup', (event) => {

        
        switch(event.key) {
            case 't' :
                transform_controls.setMode('translate')
                break;

            case 's' :
                transform_controls.setMode('scale')
                break
            case 'r' :
                transform_controls.setMode('rotate')
                break

            case 'p' : 
                addPointLight(hmlt_root)
                break

            case 'o' : 
                addSpotLight(hmlt_root)
                break


            case 'x' :
                deleteSelectedObject(hmlt_root)
                break

            case 'd' : 
                duplicateSelectedObject(hmlt_root)
                break


        }

   })

   var scene_file = null;
   const createFile = (json_obj) => 
   {

        var data = new Blob([JSON.stringify(json_obj,null,2)], {type: 'text/plain'});

        if (scene_file !== null) {

            window.URL.revokeObjectURL(scene_file)
        }
        scene_file = window.URL.createObjectURL(data)
        return scene_file

    }


    
   const deleteSelectedObject = (scene) => {

    if(active_model_name === "") return 

        let obj = hmlt_root.getObjectByName(active_model_name)
        hmlt_root.remove(obj)
        transform_controls.detach()
         conn && conn.send('setKnob', {name : "hmlt_build", value : {
            obj: active_model_name, 
            cmd : "delete-obj"
            }}
          )

        buildGui(hmlt_root)


   }

   const duplicateSelectedObject = (hmlt_root) => {

    if(active_model_name === "")
    {
        return
    }
    let parent_obj = hmlt_root.getObjectByName(active_model_name) 
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
        conn && conn.send('setKnob', {name : "hmlt_build", value : {
            obj: active_model_name, 
            cmd : "duplicate-obj"
            }}
          )
        buildGui(hmlt_root)

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
        
        buildGui(hmlt_root)
   }

   const exportTransform = (export_data , o) => {

            let model_export = export_data

            // if we don't have a transform object already(lights. duplicates) create it.
            if(model_export.transform === undefined) 
            {
                model_export.transform = {}
                model_export.transform.position = {}
            }
            
            model_export.transform.position.x = o.position.x
            model_export.transform.position.y = o.position.y
            model_export.transform.position.z = o.position.z

            model_export.transform.scale = o.scale.toArray()
            model_export.transform.rotation = o.quaternion.toArray()
            return model_export


   }
   const getSceneData = (scene) => {

        let export_data = {}
        export_data.models = []

        // first we get the updated transforms for the loaded models
        config.models.forEach(model_data => {

            let o = scene.getObjectByName(model_data.name)

            // bail early if the object has been deleted
            if(o === undefined) return

            // copy the model data from the config. this insures all materials and settings are maintined
            let model_export = model_data
            
            //update the transform
            model_export =  exportTransform(model_data, o)

            
            export_data.models.push(model_export)

        })


        // now we need the added lighting 
        let validLights = ["DirectionalLight", "PointLight", "SpotLight"] 
        let light_data = hmlt_root.children.filter(
                                        child =>  {return validLights.indexOf(child.type) !== -1 && !child.userData.isClone})
                                          .map(light_obj => {

                                            
                                            let light_data = {}
                                            light_data.name = light_obj.name;
                                            light_data.type = light_obj.type;
                                            light_data.distance = light_obj.distance
                                            light_data.color = light_obj.color.getStyle()
                                            light_data.power = light_obj.power; 
                                            if(light_obj.type === "SpotLight") 
                                            {
                                                 light_data.angle = light_obj.angle
                                                 light_data.penumbra = light_obj.penumbra
                                                 light_data.targetName = light_obj.target.name

                                            }
                                            

                                            light_data = exportTransform(light_data, light_obj)

                                            return light_data

                                          })
        

        export_data.lights = light_data


        // we need all the duplicates. this helps cut down on loading time
        let duplicate_data =hmlt_root.children.filter( child => {return child.userData.isClone})
                                            .map(dup_obj => {

                                                let dup_data = {}
                                                dup_data.name = dup_obj.name
                                                dup_data.master = dup_obj.userData.master
                                                return dup_data

                                            })
                                            


        export_data.duplicates = duplicate_data


        // target data. 
        let targets_data =hmlt_root.children.filter( child => {return child.userData.isTarget})
                                            .map(target_obj => {

                                                let target_data = {}
                                                target_data.name = target_obj.name

                                                Object.keys(target_obj.userData).forEach( (key) => {

                                                    target_data[key] = target_obj.userData[key]

                                                })

                                                target_data= exportTransform(target_data, target_obj)
                                                return target_data 

                                            })
         

        export_data.targets = targets_data



        // actor data
        let actors_data = hmlt_root.children.filter(child =>  {return child.userData.isActor})
                                                  .map(actor_obj => {
                                                      let actor_data = {}
                                                      actor_data.name = actor_obj.name;
                                                      actor_data = exportTransform(actor_data, actor_obj)
                                                      return actor_data
                                                  })
        

        export_data.actors = actors_data
        // export the overall position of the scene

        export_data.scene_position = scene_position


        return export_data


   }

   const sendNameUpdate = (obj, new_name) => 
   {
        conn && conn.send('setKnob', {name : "hmlt_build", value : {
            obj: active_model_name, 
            cmd : "name-update",
            obj : obj,
            data : new_name}}
          )

   }

   

   const buildLightGui = (root) => {

        let validLights = ["DirectionalLight", "PointLight", "SpotLight"] 
        // bail if we have no objects
        if(active_model_name === "") return;
        let selected_obj = hmlt_root.getObjectByName(active_model_name);

        if(!validLights.includes(selected_obj.type)) return


        if(Object.keys(lighting_panel.__folders).includes('Active Light')) {
+
              // remove all child folders
              Object.keys(lighting_panel.__folders).forEach((folder_name)=> {
                  let folder = lighting_panel.__folders[folder_name]
                  lighting_panel.removeFolder(folder)


              })
              
        }
        var active_light_folder = lighting_panel.addFolder('Active Light')
        let light_settings;
        let default_settings = {
                    'light name' : selected_obj.name,
                    'light color' : selected_obj.color.getHex(),
                    power : selected_obj.power,
                    distance : selected_obj.distance,
                    decay : selected_obj.decay
                }

        const sendLightInfo  = (prop, val) => {
            conn && conn.send('setKnob', {name : "hmlt_build", value : {
            obj: active_model_name, 
            cmd : "light-update",
            prop : prop,
            data : val}}
          )
        }
        const addDefaults = () => 
        {
                active_light_folder.add(default_settings, 'light name').onChange(
                    (new_name) => {

                        if(selected_obj.type === "SpotLight") 
                        {

                            let new_target_name = `${new_name} - target`
                            sendNameUpdate(selected_obj.target.name, new_target_name)
                            selected_obj.target.name = new_target_name
                            selected_obj.target.userData.targetOf = new_name

                        }
                        sendNameUpdate(selected_obj.name, new_name)
                        selected_obj.name= new_name
                        
                        buildGui(hmlt_root)

                    })
                    active_light_folder.addColor(default_settings, 'light color').onChange(
                        (val) => {
                            selected_obj.color.setHex(val); 
                            render()
                    })

                    active_light_folder.add(default_settings, 'power', 0, 2000).onChange(
                        (val) => {
                            selected_obj.power= val
                            sendLightInfo("power", val)
                            render()
                        }
                    )

                    active_light_folder.add(default_settings, 'distance',0, 2000).onChange(
                        (val) => {
                            selected_obj.distance= val
                            sendLightInfo("distance", val)
                            render()
                        }
                    )
        }
        switch(selected_obj.type) 
        {

            case "PointLight" :
                light_settings = default_settings
                addDefaults()
                break;

            case "SpotLight" :
                let spotlight_settings = 
                {

                    angle : selected_obj.angle,
                    penumbra : selected_obj.penumbra,


                }
                light_settings = {...default_settings , ...spotlight_settings }
                addDefaults();
                active_light_folder.add(light_settings, 'angle',0, Math.PI /3).onChange(
                    (val)=> {
                        selected_obj.angle = val
                        render()
                })

                active_light_folder.add(light_settings, 'penumbra', 0 , 1.0).onChange(
                    (val)=> {
                        selected_obj.penumbra= val
                        render()
                })




                
        }

        active_light_folder.open()

        
   }

   const buildActorGui = (hmlt_root) => {

        let selected_actor_name = "hmlt"
        let actor_create_folder = actor_panel.addFolder('Create Actor')
        let actorController = {
            name :selected_actor_name ,
            add : () => {

                console.log(`adding an actor named : ${selected_actor_name}`)
                createActor(hmlt_root, {name : selected_actor_name})
                conn && conn.send('setKnob', {name : "hmlt_build", value : {
                                              cmd : "add-actor",
                                              data : {name : selected_actor_name}}}
                )
                buildGui(hmlt_root)
            }
        }

        actor_create_folder.add(actorController, 'name').onChange(
            (val) => {
                selected_actor_name = val
            }
        )

        actor_create_folder.add(actorController, 'add')

        actor_create_folder.open()

       

   }


    const buildGui = (hmlt_root) => {
        let validObject = ["Mesh"]
        let panelSettings = {}

        let selectModelControls = []
         if(Object.keys(panel.__folders).includes('Models')) {
+
+             panel.removeFolder(panel.__folders['Models'])
        }

        var model_folder = panel.addFolder('Models')

        let model_names=hmlt_root.children.filter(
                                        child =>  {return child.type === "Mesh"})

                                        .map(child => { return child.name})

        model_names.forEach(name => {

                panelSettings[name] = () => {
                    active_model_name = name
                    let obj =hmlt_root.getObjectByName(active_model_name) 
                    if(obj)
                    {

                        if(transform_controls.object !== undefined) {
                            transform_controls.detach()
                        }
                        transform_controls.attach(obj)
                    }
                        
                }
            selectModelControls.push(model_folder.add(panelSettings, name))

        })

        model_folder.open()

    

         let validLights = ["DirectionalLight", "PointLight", "SpotLight"] 
         let selectLightControls = []
         if(Object.keys(panel.__folders).includes('Lights')) 
         {
+
+             panel.removeFolder(panel.__folders['Lights'])
         }

         var  light_folder = panel.addFolder('Lights')
         
          let light_names =hmlt_root.children.filter(
                                        child =>  {return validLights.indexOf(child.type) !== -1})

                                        .map(child => { return child.name})



        light_names.forEach(name => {

                panelSettings[name] = () => {
                    active_model_name = name
                    let obj =hmlt_root.getObjectByName(active_model_name) 
                    if(obj)
                    {

                        if(transform_controls.object !== undefined) {
                            transform_controls.detach()
                        }

                        transform_controls.attach(obj)
                        buildLightGui(hmlt_root)
                    }
                        
                }
            selectLightControls.push(light_folder.add(panelSettings, name))

        })

        
        
        light_folder.open()


        let lightTargetControls = []
            if(Object.keys(panel.__folders).includes('Light Targets')) 
            {
                panel.removeFolder(panel.__folders['Light Targets']) 

            }

        let targets_folder = panel.addFolder('Light Targets') 
        let target_names =hmlt_root.children.filter(
                            child => {return child.userData.isTarget}
                            )
                            .map(targ_obj => {return targ_obj.name})
                            .forEach(name => {
                                panelSettings[name] = () => {

                                    active_model_name = name
                                    let obj =hmlt_root.getObjectByName(active_model_name) 
                                    if(obj)
                                    {

                                        if(transform_controls.object !== undefined) {
                                            transform_controls.detach()
                                        }

                                        transform_controls.attach(obj)
                

                                }}
                                
                                lightTargetControls.push(targets_folder.add(panelSettings, name))
                            })

        


        


       if(Object.keys(panel.__folders).includes('Scene')) {
            panel.removeFolder(panel.__folders['Scene'])
        } 
        let scene_controller = {
            x : 0,
            y : 0,
            z : 0
        }

        const sendSceneData = (dim, val) => {
            conn && conn.send('setKnob', {name : "hmlt_build", value : {
            obj: active_model_name, 
            cmd : "scene-update",
            data : scene_position}}
          )
        }


        let scene_folder = panel.addFolder('Scene')
        Object.keys(scene_controller).forEach( dim => {
            scene_folder.add(scene_controller, dim, -1000, 1000).onChange(val => {
                scene_position[dim] = val
                sendSceneData()
            })
            }
        )
        


        if(Object.keys(panel.__folders).includes('File')) {
            panel.removeFolder(panel.__folders['File'])
        }
        
        let export_folder = panel.addFolder('File')


        // build download link
        panelSettings["export"] = () => {

            var link = document.createElement('a')
            link.setAttribute('download', 'config.js');
            link.href = createFile(getSceneData(hmlt_root))
            document.body.appendChild(link)
            window.requestAnimationFrame(() => {

                var event = new MouseEvent('click')
                link.dispatchEvent(event)
                document.body.removeChild(link)

            });

        }

        export_folder.add(panelSettings, "export")


    }

}


var render = () => {

        renderer.render(hmlt_root,camera)
}



var animate = () => {

        render()
        requestAnimationFrame(animate)

    }







