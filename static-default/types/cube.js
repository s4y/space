import * as THREE from '/deps/three/build/three.module.js'

export default class CubeV4 {
  constructor(params, globals) {
    this.group = new THREE.Group();

    this.analyser = globals.ac.createAnalyser();
    this.analyser.smoothingTimeConstant = 0.2;
    this.freqData = new Uint8Array(1024);
    this.dataTex = new THREE.DataTexture(this.freqData, this.freqData.length, 1, THREE.LuminanceFormat);

    this.spinnyV = 0;
    this.spinny = 0;

    globals.musicGain.connect(this.analyser);
    // globals.listener.gain.connect(this.analyser);

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry( 120, 120 ),
      new THREE.ShaderMaterial( {
        transparent: true,
        uniforms: {
          t: { value: 0, },
          spinny: { value: 0 },
          sf_t: { value: this.dataTex, },
          viewport: { value: new THREE.Vector4(), },
          rotation: { value: new THREE.Matrix4() },
        },
        vertexShader: `
        void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }
              `,
        fragmentShader: `
          uniform vec4 viewport;
          uniform float t;
          uniform float spinny;
          uniform mat4 modelViewMatrix;
          uniform mat4 projectionMatrix;
          uniform mat4 rotation;
          uniform sampler2D sf_t;

          const float PI = asin(1.0) * 2.;

          ${globals.renderer.capabilities.isWebGL2 ? '' : `
          mat4 transpose(in highp mat4 inMatrix) {
              highp vec4 i0 = inMatrix[0];
              highp vec4 i1 = inMatrix[1];
              highp vec4 i2 = inMatrix[2];
              highp vec4 i3 = inMatrix[3];

              highp mat4 outMatrix = mat4(
                           vec4(i0.x, i1.x, i2.x, i3.x),
                           vec4(i0.y, i1.y, i2.y, i3.y),
                           vec4(i0.z, i1.z, i2.z, i3.z),
                           vec4(i0.w, i1.w, i2.w, i3.w)
                           );

              return outMatrix;
          }

          mat4 inverse(mat4 m) {
            float
                a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
                a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
                a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
                a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

                b00 = a00 * a11 - a01 * a10,
                b01 = a00 * a12 - a02 * a10,
                b02 = a00 * a13 - a03 * a10,
                b03 = a01 * a12 - a02 * a11,
                b04 = a01 * a13 - a03 * a11,
                b05 = a02 * a13 - a03 * a12,
                b06 = a20 * a31 - a21 * a30,
                b07 = a20 * a32 - a22 * a30,
                b08 = a20 * a33 - a23 * a30,
                b09 = a21 * a32 - a22 * a31,
                b10 = a21 * a33 - a23 * a31,
                b11 = a22 * a33 - a23 * a32,

                det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

            return mat4(
                a11 * b11 - a12 * b10 + a13 * b09,
                a02 * b10 - a01 * b11 - a03 * b09,
                a31 * b05 - a32 * b04 + a33 * b03,
                a22 * b04 - a21 * b05 - a23 * b03,
                a12 * b08 - a10 * b11 - a13 * b07,
                a00 * b11 - a02 * b08 + a03 * b07,
                a32 * b02 - a30 * b05 - a33 * b01,
                a20 * b05 - a22 * b02 + a23 * b01,
                a10 * b10 - a11 * b08 + a13 * b06,
                a01 * b08 - a00 * b10 - a03 * b06,
                a30 * b04 - a31 * b02 + a33 * b00,
                a21 * b02 - a20 * b04 - a23 * b00,
                a11 * b07 - a10 * b09 - a12 * b06,
                a00 * b09 - a01 * b07 + a02 * b06,
                a31 * b01 - a30 * b03 - a32 * b00,
                a20 * b03 - a21 * b01 + a22 * b00) / det;
          }

          bool isnan(float x){
            return !(x <= 0.0 || 0.0 <= x);
          }
          `}

          

          const mat4 kIdentityTransform = mat4(
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0
          );

          mat4 scale(float x, float y, float z) {
            return mat4(
              x, 0.0, 0.0, 0.0,
              0.0, y, 0.0, 0.0,
              0.0, 0.0, z, 0.0,
              0.0, 0.0, 0.0, 1.0
            );
          }

          mat4 rotX(float angle) {
            return mat4(
              1.0, 0.0, 0.0, 0.0,
              0.0, cos(angle), -sin(angle), 0.0,
              0.0, sin(angle), cos(angle), 0.0,
              0.0, 0.0, 0.0, 1.0
            );
          }

          mat4 rotY(float angle) {
            return mat4(
              cos(angle), 0.0, sin(angle), 0.0,
              0.0, 1.0, 0.0, 0.0,
              -sin(angle), 0.0, cos(angle), 0.0,
              0.0, 0.0, 0.0, 1.0
            );
          }

          mat4 rotZ(float angle) {
            return mat4(
              cos(angle), -sin(angle), 0.0, 0.0,
              sin(angle), cos(angle), 0.0, 0.0,
              0.0, 0.0, 1.0, 0.0,
              0.0, 0.0, 0.0, 1.0
            );
          }

          mat4 translate(float x, float y, float z) {
            return mat4(
              1.0, 0.0, 0.0, x,
              0.0, 1.0, 0.0, y,
              0.0, 0.0, 1.0, z,
              0.0, 0.0, 0.0, 1.0
            );
          }

          mat4 translateX(float x) {
            return translate(x, 0.0, 0.0);
          }

          mat4 translateY(float y) {
            return translate(0.0, y, 0.0);
          }

          mat4 translateZ(float z) {
            return translate(0.0, 0.0, z);
          }

          vec3 applyTransform(mat4 t, vec3 p) {
            vec4 p4 = transpose(t) * vec4(p, 1.0);
            return p4.xyz / p4.w;
          }

          float sdBox(vec3 p, vec3 b) {
            vec3 d = abs(p) - b;
            return length(max(d,0.0)) + min(max(d.x,max(d.y,d.z)),0.0);
          }

          const int kSteps = 120;
          const float kEpsilon = 1./512.;

          struct Hit {
            float dist;
            vec3 boxP;
          };

          Hit sceneSDF(vec3 boxP) {
            // boxP.z += sin(t) * 1.;
            // boxP.x += sin(t * 1.5) * .1;
            // boxP = mod(boxP + 5., 10.) - 5.;
            boxP.y -= 40.;

            boxP.z += 1.;

            boxP = applyTransform(rotY(spinny), boxP);
            boxP = applyTransform(rotZ(PI/5.1) * rotX(PI/4.), boxP);
            // boxP *= 1. - texture2D(sf_t, vec2(0))[0] * 0.4;

            // boxP.y += texture2D(sf_t, vec2(abs(boxP.x/480.), 0))[0] * 10.;

            float contort = sin(min(max(boxP.x * boxP.y, -1000.), 1000.) * .011 + mod(t, 2. * 3.1415)) * 10.;

            return Hit(
              sdBox(boxP, vec3(15.)) + contort * pow(texture2D(sf_t, vec2(0.1, 0))[0] + 0.5, 5.) * 0.3,
              boxP / 20.
            );
          }

          // http://jamie-wong.com/2016/07/15/ray-marching-signed-distance-functions/
          vec3 estimateNormal(vec3 p) {
              const float EPSILON = kEpsilon;
              return normalize(vec3(
                  sceneSDF(vec3(p.x + EPSILON, p.y, p.z)).dist - sceneSDF(vec3(p.x - EPSILON, p.y, p.z)).dist,
                  sceneSDF(vec3(p.x, p.y + EPSILON, p.z)).dist - sceneSDF(vec3(p.x, p.y - EPSILON, p.z)).dist,
                  sceneSDF(vec3(p.x, p.y, p.z  + EPSILON)).dist - sceneSDF(vec3(p.x, p.y, p.z - EPSILON)).dist
              ));
          }

          vec4 bg(vec3 norm, vec3 p) {
            vec3 tp = 10. * norm - p * .1;
            return vec4(1., 0., 1., 1.) * pow((sin(distance(tp.xz, vec2(0))) + sin(distance(tp.xy, vec2(0))))/2.+1., 5.) * 0.4;
          }

          vec3 phongalate(vec3 pos, vec3 norm, vec3 lightPos, float shiny, vec3 specColor, vec3 diffColor) {
              return vec3(0)
                + specColor * pow(max(dot(norm, normalize(lightPos - pos)), 0.), 1000.)
                + diffColor * pow(max(0., dot(norm, normalize(lightPos - pos))), 10.);
              ;
          }

          vec4 colorAt(vec3 norm, vec3 boxP, vec3 hitP, vec3 ray) {
            vec3 ap = abs(boxP);
            float edge = pow(clamp(max(
              max(min(ap.x, ap.z), min(ap.y, ap.z)), min(ap.x, ap.y)), 0., 1.) + 0.01, 100.);
            float outl = pow(clamp(max(
              max(min(ap.x, ap.z), min(ap.y, ap.z)), min(ap.x, ap.y)), 0., 1.), 20.);
            outl *= pow(texture2D(sf_t, vec2(0.2, 0))[0] + 0.2, 4.);
            vec3 lighted = vec3(0);
            // lighted += max(vec3(0), vec3(0.5,0,0) * dot(normalize(vec3(0.2,1,0.6)), norm));
            lighted += phongalate(boxP, norm, vec3(0,-20,0), 1., vec3(1), vec3(0.045, 0.2, 1));// * texture2D(sf_t, vec2(0.0, 0))[0];

            // float pat = sin(boxP.x * boxP.z * 40. + t * 0.1);

            return bg(abs(norm * ray), hitP) + vec4(0,1,1,1) * outl + vec4(clamp(lighted, 0., 1.), 1.);
          }

          void main() {
            vec4 tp = vec4((gl_FragCoord.xy - viewport.xy) / viewport.zw * 2. - 1.0, 1., 1.);
            tp = rotation * inverse(modelViewMatrix) * inverse(projectionMatrix) * tp;
            vec3 ray = normalize(tp.xyz);
            vec3 pp = cameraPosition.xyz;

            float surfaceDist = 0.;
            float dist = 0.;
            Hit hit;
            for (int i = 0; i < kSteps; i++) {
              hit = sceneSDF(pp + ray * dist);
              surfaceDist = hit.dist;
              dist += surfaceDist;

              if (surfaceDist < kEpsilon)
                break;
            }

            if (dist > 1e8)
              discard;
            if (isnan(dist))
              discard;
            // if (surfaceDist > kEpsilon)
            //   discard;

            vec3 hitP = pp + ray * dist;
            vec3 norm = estimateNormal(hitP);

            gl_FragColor = colorAt(norm, hit.boxP, hitP, ray) * step(surfaceDist, kEpsilon);
          }
              `,
      }));
    this.mesh.position.y += 50;
    this.group.add(this.mesh);

    const light = new THREE.PointLight(0x0400ff, 1000);
    this.light = light;
    light.position.y += 10.;
    this.group.add(light);

    this.mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      material.uniforms.rotation.value.makeRotationFromEuler(this.mesh.rotation);
      material.uniforms.t.value = (Date.now()/1000) % (1 << 15) - (1 << 14);
      renderer.getCurrentViewport(material.uniforms.viewport.value);
    }

    window.top.cubeMesh = this.mesh;
  }
  update(camera, renderer) {

    this.analyser.getByteFrequencyData(this.freqData);
    this.light.intensity = this.freqData[0] * 10;

    this.spinnyV *= 0.5;
    this.spinnyV += Math.pow(this.freqData[1] / 255, 2) / 30;
    this.spinny += this.spinnyV;
    this.mesh.material.uniforms.spinny.value = this.spinny;

    this.dataTex.needsUpdate = true;
    this.mesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  }
  dispose() {
  }
}
