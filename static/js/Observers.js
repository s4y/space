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

    // sweep
    for (let i = 0; i < observers.length; i++) {
      const obs = observers[i];
      if (obs.win.closed)
        observers.splice(i--, 1);
    }

    observers.push({ win, cb });
  }
  fire(key, ...args) {
    for (const { win, cb } of this.getObserverList(key)) {
      if (win.closed)
        continue;
      cb(...args);
    }
  }
}
