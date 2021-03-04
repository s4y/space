import Service from '/space/js/Service.js';
import ServerClock from '/lib/ServerClock.js';

export default class Clock {
  constructor() {
    this.init();
  }
  async init() {
    const ws = await Service.get('ws');
    let onPong;
    ws.observe('pong', msg => {
      if (onPong)
        onPong(msg);
      onPong = null;
    });
    this.sc = new ServerClock(now => new Promise(resolve => {
      onPong = resolve;
      ws.send({
        type: 'ping',
        body: now,
      });
    }));
  }
  now() {
    return this.sc.now();
  }
}
