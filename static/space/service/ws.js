import Service from '/space/js/Service.js';
import Observers from '/space/js/Observers.js';

const ws = {
  open: false,
  observers: new Observers,
  observe(key, win, cb) {
    this.observers.add(key, win, cb);
    if (key == 'open' && this.open)
      cb();
  },
  send(json) {
    this.ws.send(JSON.stringify(json));
  },
  didClose() {
    this.open = false;
    this.observers.fire('close');
  },
  connect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.didClose();
    }
    const ws = new WebSocket(`${location.protocol == 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = e => {
      this.open = true;
      this.observers.fire('open');
    };
    ws.onclose = e => {
      this.didClose();
      setTimeout(() => { this.connect(); }, 1000);
    };
    ws.onmessage = e => {
      const message = JSON.parse(e.data);
      const {type, body} = message;
      this.observers.fire(type, body);
    };
  },
};

ws.connect();

Service.get('docent', docent => {
  docent.observe('reconnect', what => {
    if (what == 'websocket')
      ws.open && ws.connect();
  })
});

export default class WsClient {
  get open() { return ws.open; }
  observe(key, cb) {
    if (key == 'open' && ws.open)
      cb();
    return ws.observers.add(key, window, cb);
  }
  send(message) {
    return ws.send(message);
  }
  bounce() {
      ws.open && ws.connect();
  }
}
