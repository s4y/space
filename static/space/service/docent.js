import Service from '/space/js/Service.js';
import Observers from '/space/js/Observers.js';

export default class DocentClient {
  constructor() {
    this.observers = new Observers();
    Service.get('ws', ws => {
      ws.observe('reload', what => {
        if (location.pathname == what)
          location.reload(true);
      });
      ws.observe('reconnect', what => {
        this.observers.fire('reconnect', what);
      });
    });
  }
  observe(key, cb) {
    return this.observers.add(key, window, cb);
  }
}
