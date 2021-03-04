import * as THREE from '/deps/three/build/three.module.js'

class GLTFPool {
  constructor() {
    this.loaders = {};
  }
  get(url) {
    return this.loaders[url] || (this.loaders[url] = new GLTFLoader().load(url));
  }
}

class TexturePool {
  constructor() {
    this.loaders = {};
  }
  get(url) {
    return this.loaders[url] || (this.loaders[url] = new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin(true);
      loader.load(url, resolve, null, reject);
    }));
  }
}

class ImagePool {
  constructor() {
    this.promises = {};
  }
  get(url) {
    return this.promises[url] || (this.promises[url] = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = true;
      img.onload = () => { resolve(img); };
      img.onerror = reject;
      img.src = url;
    }));
  }
}

export default class World {
  constructor(configPath, globals) {
    this.configURL = new URL(configPath, location);
    this.globals = {
      gltfPool: new GLTFPool(),
      texturePool: new TexturePool(),
      imagePool: new ImagePool(),
      ...globals,
    };
    this.worldConfig = null;
    this.world = {};
    this.moduleURLs = {};
    this.modules = {};
    this.observersByType = {};
    this.externalObjs = [];
    this.group = new THREE.Group();

    this.frustum = new THREE.Frustum();
    this.frustumMatrix = new THREE.Matrix4();
    this.boundingBox = new THREE.Box3();

    window.addEventListener('sourcechange', async e => {
      if (e.detail == this.configURL.href) {
        e.preventDefault();
        this.refresh();
      } else if (e.detail in this.moduleURLs) {
        e.preventDefault();
        const changedModule = this.moduleURLs[e.detail];
        const mod = await this.refreshModule(changedModule);
        this.refresh(changedModule);
        const observers = this.observersByType[changedModule];
        if (!observers)
          return;
        for (const observer of observers)
          observer(mod.default);
      }
    });
    this.ready = this.refresh();
  } 
  update(camera, renderer) {
    if (this.updatesSuspended)
      return;
    this.frustum.setFromProjectionMatrix(this.frustumMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse));
    const objs = [];
    for (const k in this.world) {
      const obj = this.world[k];
      for (const sceneObj of obj.scene) {
        if (!sceneObj)
          continue;
        objs.push({ parent: obj, obj: sceneObj });
      }
    }
    for (const obj of this.externalObjs)
      objs.push({ obj });
    for (const obj of objs) {
      const { parent, obj: sceneObj } = obj;
      if (!sceneObj.update)
        continue;
      if (sceneObj.boundingBox) {
        this.boundingBox.copy(sceneObj.boundingBox);
        sceneObj.group.updateMatrix();
        this.boundingBox.applyMatrix4(sceneObj.group.matrixWorld);
        if (!this.frustum.intersectsBox(this.boundingBox))
          continue;
      }
      try {
        sceneObj.update(camera, renderer, parent, this.world, this);
      } catch(e) {
        console.log(sceneObj, 'error in update', e);
      }
    }
  }
  register(obj) {
    this.externalObjs.push(obj);
  }
  unregister(obj) {
    this.externalObjs.splice(this.externalObjs.indexOf(obj), 1);
  }
  getModule(name) {
    return this.modules[name] || this.refreshModule(name);
  }
  refreshModule(name) {
    const base = `/types/${name}.js`;
    const url = new URL(base, location.href).href;
    const isReload = this.moduleURLs[url] ? true : false;
    this.moduleURLs[url] = name;
    return this.modules[name] = import(isReload ? `${url}?bust=${Date.now()}` : url);
  }
  addTypeObserver(type, cb) {
    const observers = this.observersByType[type] || (this.observersByType[type] = []);
    observers.push(cb);
    this.getModule(type).then(mod => cb(mod.default));
  }
  removeTypeObserver(type, cb) {
    const observers = this.observersByType[type];
    observers.splice(observers.indexOf(cb), 1);
  }
  async refresh(changedModule) {
    const applyPlacement = (obj, placement) => {
      if (!placement)
        return;
      if (placement.scale)
        obj.scale.set(...placement.scale);
      if (placement.position)
        obj.position.set(...placement.position);
      if (placement.rotation)
        // obj.rotation.set(...placement.rotation.map(radians => radians * (180/Math.PI)));
        obj.rotation.set(...placement.rotation);
    };

    const newWorldSource = await fetch(this.configURL).then(w => w.text());
    const newWorld = new Function(newWorldSource)();
    const oldKeys = new Set(Object.keys(this.world));
    for (const obj of newWorld) {
      const oldObj = this.world[obj.id];
      let needRefresh = false;
      for (const sceneObj of obj.scene) {
        if (sceneObj.type == changedModule) {
          needRefresh = true;
          break;
        }
      }
      if (needRefresh)
        continue;
      if (oldObj && JSON.stringify(oldObj.config) == JSON.stringify(obj))
        oldKeys.delete(obj.id);
    }
    const oldWorld = {};
    for (const k of oldKeys) {
      oldWorld[k] = this.world[k];
      delete this.world[k];
    }
    this.worldConfig = newWorld;
    const modLoads = [];
    const loadCbs = [];
    for (const objConfig of this.worldConfig) {
      if (objConfig.id in this.world)
        continue;
      if (objConfig.enabled == false)
        continue;
      const oldObj = oldWorld[objConfig.id];
      const obj = this.world[objConfig.id] = {
        config: objConfig,
        scene: [],
        group: new THREE.Group(),
      };
      this.group.add(obj.group);
      applyPlacement(obj.group, objConfig.placement);
      for (const sceneObjConfig of objConfig.scene) {
        if (sceneObjConfig.enabled == false)
          continue;
        const idx = obj.scene.push(null)-1;
        modLoads.push(this.getModule(sceneObjConfig.type).then(mod => {
          const Type = mod.default;
          const args = [sceneObjConfig.params || {}, this.globals, this.world, oldObj && oldObj.scene[idx] && oldObj.scene[idx].constructor.name == Type.name && oldObj.scene[idx]];
          const instance = obj.scene[idx] = new Type(...args);
          if (instance.load) {
            // Give each instance a `loaded` promise right away, but don't kick off
            // any loads until all instances have one.
            instance.loaded = new Promise((resolve, reject) => {
              loadCbs.push(() => instance.load(...args).then(resolve).catch(reject));
            });
          }
          obj.group.add(instance.group);
          applyPlacement(instance.group, sceneObjConfig.placement);
        }).catch(e => {
          console.log(e, e.stack);
          obj.scene.splice(idx, 1);
        }));
      }
    }
    this.updatesSuspended = true;
    await Promise.all(modLoads);
    await Promise.all(loadCbs.map(cb => cb()));
    this.updatesSuspended = false;
    for (const k in oldWorld) {
      const obj = oldWorld[k];
      this.group.remove(obj.group);
      obj.group.traverse(obj => {
        if (obj.dispose)
          obj.dispose();
      });
      for (const sceneObj of obj.scene) {
        if (sceneObj && sceneObj.dispose)
          sceneObj.dispose();
      }
    }
  }
  collide(position, velocity) {
    const objs = [];
    for (const k in this.world) {
      const obj = this.world[k];
      for (const sceneObj of obj.scene) {
        if (!sceneObj)
          continue;
        if (!sceneObj.collide)
          continue;
        sceneObj.collide(position, velocity);
      }
    }
  }
}

