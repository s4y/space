export default class Observers {
  constructor() {
    this.observers = {};
  }
  getObserverList(name) {
    return this.observers[name] || (this.observers[name] = []);
  }
  add(key, win, cb) {
    if (!cb)
      throw new Error("wrong number of arguments passed to Observers.add");
    const observers = this.getObserverList(key);
    observers.push(cb);

    const unloadListener = () => {
      observers.splice(observers.indexOf(cb), 1);
      win.removeEventListener('unload', unloadListener);
    };
    win.addEventListener('unload', unloadListener);
  }
  fire(key, ...args) {
    for (const cb of this.getObserverList(key))
      cb(...args);
  }
}
