 import * as THREE from '/deps/three/build/three.module.js'
import {GLTFLoader} from '/deps/three/examples/jsm/loaders/GLTFLoader'
import {RGBELoader} from '/deps/three/examples/jsm/loaders/RGBELoader'

export const loadGLTF = (scene, renderer , options = {name : "", texturePath: undefined, modelPath: undefined, onLoad : undefined}) => {

    let {texturePath, modelPath, name} = options

    if(texturePath == undefined || modelPath == undefined) {
        return
    }
    let pr_gen = new THREE.PMREMGenerator(renderer)
    pr_gen.compileEquirectangularShader()

    console.log(`loading from : ${modelPath} `)
    new RGBELoader()
        .setDataType(THREE.UnsignedByteType)
        .load(texturePath, (texture) => {

            let envMap = pr_gen.fromEquirectangular(texture).texture

            scene.environment = envMap

            texture.dispose()
            pr_gen.dispose()


                let loader = new GLTFLoader()
                loader.crossOrigin = ''
                loader.load(modelPath, (gltf) => {
                    gltf.scene.name = name
                    scene.add(gltf.scene)
                    if(options.onLoad != undefined) {
                        options.onLoad(gltf.scene)
                    }
                }) 


        })

}