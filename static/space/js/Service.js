import Observers from './Observers.js';

const registrations = {};

export default {
  get(name, cb) {
    const ret = registrations[name] || (
      registrations[name] = import(`/space/service/${name}.js`)
        .then(mod => new mod.default()));
    if (cb)
      ret.then(cb);
    return ret;
  },
};
