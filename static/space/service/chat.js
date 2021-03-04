import Observers from '../js/Observers.js';
import Service from '../js/Service.js';

class Chat {
  constructor() {
    this.observers = new Observers();
    this.messages = [];
  }

  setWs(ws) {
    this.ws = ws;
    ws.observe('chat', message => {
      this.messages.push(message);
      this.observers.fire('message', message);
    })
  }

  setSelf(whoami) {
    this.whoami = whoami;
  }
}

const chat = new Chat();
Service.get('ws', ws => chat.setWs(ws));
Service.get('room', room => chat.setSelf(room.whoami));

export default class ChatClient {
  constructor(context) {
    this.context = context;
  }

  observe(key, cb) {
    if (key == 'message') {
      for (const message of chat.messages)
        cb(message);
    }
    return chat.observers.add(key, this.context, cb);
  }

  addMessage(message) {
    const selfMessage = {
      from: chat.whoami,
      message
    };
    chat.observers.fire('message', selfMessage);
    chat.messages.push(selfMessage);

    chat.ws.send({
      type: 'chat',
      body: {
        message
      }
    });
  }
}
