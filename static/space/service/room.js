import Service from '/space/js/Service.js';
import Observers from '/space/js/Observers.js';
import RTCPeer from '/space/js/RTCPeer.js'

class Player {
  constructor(onchange, state = { position: [], look: [], }) {
    this.onchange = onchange;
    this.position = [Math.random() * 20 - 10, Math.random() * 20 - 10, 0];
    this.data = {};
    this.gravityEnabled = true;

    // Gingerly unpack the saved position from sessionStorage. If anything
    // isn't a reasonable value, use the default.
    for (let i = 0; i < this.position.length; i++)
      this.position[i] = state.position[i] || this.position[i];
    this.look = [0, -0.1];
    for (let i = 0; i < this.look.length; i++)
      this.look[i] = state.look[i] || this.look[i];
    this.velocity = [0, 0, 0];
  }
  toJSON() {
    return {
      position: this.position,
      look: this.look,
      role: this.role || '',
      ...this.data,
    };
  }
  get look() {
    return this._look;
  }
  set look(look) {
    this._look = look;
    this.onchange();
  }
  get position() {
    return this._position;
  }
  set position(position) {
    this._position = position;
    this.onchange();
  }
  applyAcceleration(acceleration) {
    const apply = (v, a) => {
      const vOut = v + a;
      return Math.abs(vOut) > 0.001 ? vOut : 0;
    };
    const { velocity } = this;
    // console.log('apply', acceleration);
    velocity[0] = apply(velocity[0], acceleration[0] * 0.01);
    velocity[1] = apply(velocity[1], acceleration[1] * 0.01);
    velocity[2] = apply(velocity[2], acceleration[2] * 0.01);
  }
  stepPhysics() {
    const now = performance.now();
    const scale = 1;
    const delta = Math.min(500, this.lastPhysicsStep ? now - this.lastPhysicsStep : 0) * (60/1000);
    this.lastPhysicsStep = now;
    const { position, velocity } = this;
    // velocity[0] *= 0.9;
    // velocity[1] *= 0.9;
    // velocity[2] *= 0.9;
    position[0] += velocity[0] * delta * scale;
    position[1] += velocity[1] * delta * scale;
    position[2] += velocity[2] * delta * 0.5 * scale;
    let floorHeight = this.floorHeightAt
    ? this.floorHeightAt(position[0], -position[1])
    : 0;

    if (position[2] <= floorHeight || (position[2] <= floorHeight + 0.2 && velocity[2] == 0)) {
      velocity[0] *= 0.9;
      velocity[1] *= 0.9;
      velocity[2] = Math.max(velocity[2] * 0.9, 0);
      position[2] = floorHeight;
    } else {
      velocity[0] *= 0.99;
      velocity[1] *= 0.99;
      if (this.gravityEnabled)
        velocity[2] -= 0.005;
      else
        velocity[2] *= 0.9;
      if (velocity[2] > 0)
        velocity[2] = Math.max(0, velocity[2] - 0.001 * position[2]);
    }
    if (this.adjustForCollision)
      this.adjustForCollision(position, velocity);
    for (let i = 0; i < velocity.length; i++) {
      if (Math.abs(velocity[i]) < 0.001)
        velocity[i] = 0;
    }
    const velocityMagnitude = Math.sqrt(velocity.slice(0, 2).reduce((acc, x) => acc + x * x, 0));
    if (velocityMagnitude > 1)
      velocity.slice(0, 2).forEach((x, i) => velocity[i] = x / velocityMagnitude);
    this.onchange();
  }
}

class Room {
  constructor() {
    this.observers = new Observers();
    this.mediaStream = new MediaStream();
    this.guests = {};
    this.isJoined = false;

    const onchange = () => {
      this.setNeedsUpdate();
    };

    if (sessionStorage.playerState) {
      try {
        this.player = new Player(onchange, JSON.parse(sessionStorage.playerState));
      } catch (e) {
        console.warn("Failed to restore player position:", e);
        sessionStorage.playerState = null;
      }
    }
    if (!this.player)
      this.player = new Player(onchange);
    this.updateGuest('self', this.player);
  }
  get ac() {
    if (!this._ac) {
      this.ac = new (window.AudioContext || window.webkitAudioContext)({
        // All of our media is 48k, and this reduces crackling on Safari
        sampleRate: 48000,
      });
      Service.get('gestureWrangler', gestureWrangler => {
        gestureWrangler.playAudioContext(this.ac);
      });
    }
    return this._ac;
  }
  join() {
    if (this.isJoined)
      return;
    this.isJoined = true;
    Service.get('ws', ws => this.setWs(ws));
  }
  setNeedsUpdate() {
    if (this.needsUpdate)
      return;
    this.needsUpdate = true;
    setTimeout(() => {
      this.needsUpdate = false;
      this.sendAndSaveStateIfChanged();
    }, 50);
  }
  setWs(ws) {
    this.ws = ws;
    ws.observe('open', () => {
      ws.send({
        type: "join",
        body: this.player,
      });
    });
    ws.observe('close', () => {
      this.disconnectRTC();
      this.clearGuests();
    });
    ws.observe('hello', body => {
      this.whoami = body;
      this.observers.fire('whoami', body);
    });
    ws.observe('guestUpdate', body => {
      this.updateGuest(body.id, body.state);
    });
    ws.observe('guestLeaving', body => {
      this.removeGuest(body.id);
    });
    ws.observe('rtc', body => {
      if (!this.rtcPeer)
        this.connectRTC()
      this.handleRTC(body.from, body.message);
    });
    ws.observe('mapTrack', body => {
      if (!this.rtcPeer)
        this.connectRTC()
      this.mapTrack(body);
    });
    ws.observe('kick', body => {
      delete sessionStorage.inParty;
      if (body.kind && body.kind == 'softBan')
        sessionStorage.softBanned = true;
      window.top.location.reload();
    });
  }
  getOrCreateGuest(id) {
    return this.guests[id] || (this.guests[id] = {
      videoTrack: null,
      audioTrack: null,
      mids: [],
    });
  }
  updateGuest(id, state) {
    const guest = this.getOrCreateGuest(id);
    guest.state = state;
    this.observers.fire('update', id, guest);
  }
  removeGuest(id) {
    delete this.guests[id];
    this.observers.fire('update', id, null);
  }
  clearGuests() {
    this.guests = {};
    this.observers.fire('clear');
  }
  mapTrack({ mid, id }) {
    this.rtcPeer.setMidObserver(mid, track => {
      const guest = this.guests[id];
      guest[track.kind == 'video' ? 'videoTrack' : 'audioTrack'] = track;
      this.observers.fire('updateMedia', id, guest);
    });
  }
  handleRTC(from, message) {
    if (this.rtcPeer)
      this.rtcPeer.receiveFromPeer(message).catch(e => {
        this.ws && this.ws.bounce();
      });
  }
  setWhoami(whoami) {
    this.whoami = whoami;
    this.observers.fire('whoami', whoami);
  }
  sendAndSaveStateIfChanged() {
    const oldStateJSON = sessionStorage.playerState;
    const newStateJSON = JSON.stringify(this.player);
    if (oldStateJSON == newStateJSON)
      return;
    sessionStorage.playerState = newStateJSON;
    this.updateGuest('self', this.player);
    if (this.ws && this.ws.open) {
      this.ws.send({
        type: "state",
        body: this.player,
      });
    }
  }
  connectRTC() {
    this.disconnectRTC();
    this.rtcPeer = new RTCPeer({
      sendToPeer: message => {
        this.ws.send({
          type: "rtc",
          body: { to: 0, message },
        });
      },
      mediaStream: this.mediaStream,
      onerror() {
        this.ws && this.ws.bounce();
      }
    });
  }
  disconnectRTC() {
    if (this.rtcPeer)
      this.rtcPeer.close();
    this.rtcPeer = null;
  }
  setVisible(visible) {
    // console.log('setVisible:', visible, this.mediaStream.getTracks());
    // for (const track of this.mediaStream.getTracks())
    //   track.enabled = visible;
  }
}

const room = new Room();

const onVisibilityChange = (e) => {
  room.setVisible(window.top.document.visibilityState == 'visible');
};

window.top.addEventListener('visibilitychange', onVisibilityChange);

window.addEventListener('unload', () => {
  window.top.removeEventListener('visibilitychange', onVisibilityChange);
  room.disconnectRTC();
});

onVisibilityChange();

Service.get('userMedia', userMedia => {
  userMedia.observe('stream', stream => {
    for (const track of room.mediaStream.getTracks())
      room.mediaStream.removeTrack(track);
    for (const track of stream.getTracks())
      room.mediaStream.addTrack(track);
    if (room.rtcPeer)
      room.rtcPeer.updateTracks();
    const self = room.getOrCreateGuest('self');
    self.videoTrack = stream.getVideoTracks()[0];
    room.observers.fire('updateMedia', 'self', self);
  });
});

Service.get('docent', docent => {
  docent.observe('reconnect', what => {
    if (what == 'webrtc')
      if (room.rtcPeer) room.connectRTC()
  });
});

export default class RoomClient {
  join() {
    return room.join();
  }
  observe(key, cb) {
    return room.observers.add(key, window, cb);
  }
  get ac() {
    return room.ac;
  }
  get player() {
    return room.player;
  }
  get guests() {
    return room.guests;
  }
  updateImmediately() {
    room.sendAndSaveStateIfChanged();
  }
};
