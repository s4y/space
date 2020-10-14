
const config = {
    scenes : [

        {
            name : "beach",

            models : 
            [
                {
                    name : "beachsand",
                    geometry : 
                    {
                        uri : "sand.glb",
                        name : "beachsand"
                    },
                    glb_path : "/assets/beach/models/",
                    texture_path :"/assets/beach/textures/",
                    material :  
                    {
                        
                        map : "tbjibefn_2K_Albedo.jpg",
                        metalness : 0.0,
                        roughness : 1.0,
                        normalMap : "tbjibefn_2K_Normal.jpg",
                        roughnessMap : "tbjibefn_2K_Roughness.jpg",
                        aoMap : "tbjibefn_2K_AO.jpg",
                        aoMapIntensity: 1

                    },
                    
                    transform : {
                        position : {
                            x : 0.0,
                            y : 0.0,
                            z : 0.0
                        },
                        scale : [

                            1.0,
                            1.0,
                            1.0

                        ],
                        rotation : [
                            1.0,
                            0.0,
                            0.0,
                            0.0
                        ]
                    }

                },
                {
                    name : "statue",
                    geometry : 
                    {
                        uri : "statue.glb",
                        name : "statue"
                    },
                    glb_path : "/assets/beach/models/",
                    texture_path :"/assets/beach/textures/",
                    material :  
                    {
                        
                        map : "ubiibiiew_2K_Albedo.jpg",
                        metalness : 0.0,
                        roughness : 0.0,
                        normalMap : "ubiibiiew_2K_Normal.jpg",
                        roughnessMap : "ubiibiiew_2K_Roughness.jpg",
                        aoMap : "ubiibiiew_2K_AO.jpg",
                        aoMapIntensity: 1

                    },
                    
                    transform : {
                        position : {
                            x : 0.0,
                            y : 0.0,
                            z : 0.0
                        },
                        scale : 
                            [ 1.512409,
                             0.512409,
                             0.512409]
                        ,
                        rotation : 
                            [1.0,
                             0.0,
                             0.0,
                             0.0]
                        
                    }

                }
            ]
            


        }
    ]

}
module.exports = {
    config : config
}