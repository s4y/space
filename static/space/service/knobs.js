import Service from '/space/js/Service.js';
import Observers from '/space/js/Observers.js';

const knobs = {
  state: {},
  observers: new Observers(),
  setWs(ws) {
    ws.observe('open', () => {
      ws.send({
        type: "getKnobs",
      });
    });
    ws.observe('knob', ({name, value}) => {
      this.set(name, value);
    });
  },
  observe(key, win, cb, def) {
    this.observers.add(key, win, cb);
    cb(this.get(key, def));
  },
  get(key, def) {
    return (key in this.state) ? this.state[key] : def;
  },
  set(key, val) {
    const oldValue = this.state[key];
    this.state[key] = val;
    this.observers.fire(key, val, oldValue);
  },
}

export default class KnobsClient {
  constructor(context) {
    this.context = context;
  }
  get knobs() { return knobs.state; }
  observe(key, ...args) {
    knobs.observe(key, this.context, ...args);
  }
  get(...args) {
    return knobs.get(...args);
  }
  set(...args) {
    return knobs.set(...args);
  }
}

Service.get('ws', ws => knobs.setWs(ws));
