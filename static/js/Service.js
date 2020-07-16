import Observers from '/js/Observers.js'; 

const findIn = window => {
  if (window._serviceManager)
    return window._serviceManager;
  if (window.parent != window)
    return findIn(window.parent);
};

const serviceManager = findIn(window) || {
  serviceFrames: {},
  registrations: {},
  observers: new Observers(),
  hostElement: null,
  setHost(el) {
    if (this.hostElement)
      throw new Error('Service.js: setHost should only be called once.');
    this.hostElement = el;
    const hostWindow = el.ownerDocument.defaultView;
    hostWindow._serviceManager = this;
  },
  register(name, service) {
    if (this.registrations[name])
      console.log('ℹ️ Service reloaded:', name);
    this.registrations[name] = service;
    this.observers.fire(name, service);
  },
  ensureLoaded(name) {
    if (this.serviceFrames[name])
      return;
    const frame = document.createElement('iframe');
    this.serviceFrames[name] = frame;
    frame.src = `/services/${name}.html`;
    this.hostElement.appendChild(frame);
  },
  get(context, name, cb) {
    this.ensureLoaded(name);
    this.observers.add(name, context, reg => cb(reg(context)));
    const reg = this.registrations[name];
    if (reg)
      cb(reg(context));
  }
};

export default {
  setHost(el) {
    serviceManager.setHost(el);
  },
  register(name, service) {
    serviceManager.register(name, service);
  },
  get(name, cb) {
    serviceManager.get(window, name, cb);
  },
};
