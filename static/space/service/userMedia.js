import Service from '/space/js/Service.js';
import Observers from '/space/js/Observers.js';

const defaultConstraints = {
  video: { width: { max: 512 } },
  audio: {},
};

const userMedia = {
  activeConstraints: null,
  pendingConstraints: { ...defaultConstraints },
  videoMuted: sessionStorage.videoMuted == 'true',
  audioMuted: sessionStorage.audioMuted == 'true',
  requiredVideoMute: false,
  requiredAudioMute: false,
  stream: new MediaStream(),
  devices: null,
  observers: new Observers(),
  async restart() {
    const newConstraints = {};
    if (this.audioMuted || this.requiredAudioMute) {
      this.setTrack(null, 'audio');
      if (this.activeConstraints)
        delete this.activeConstraints.audio;
    } else if (this.pendingConstraints.audio != (this.activeConstraints && this.activeConstraints.audio)) {
      newConstraints.audio = this.pendingConstraints.audio;
    }
    if (this.videoMuted || this.requiredVideoMute) {
      this.setTrack(null, 'video');
      if (this.activeConstraints)
        delete this.activeConstraints.video;
    } else if (this.pendingConstraints.video != (this.activeConstraints && this.activeConstraints.video)) {
      newConstraints.video = this.pendingConstraints.video;
    }
    if (newConstraints.audio || newConstraints.video) {
      if (!this.activeConstraints)
        this.activeConstraints = {};
      Object.assign(this.activeConstraints, newConstraints);
      const stream = await navigator.mediaDevices.getUserMedia(newConstraints);
      for (const track of stream.getTracks())
        this.setTrack(track, track.kind);
      if (!this.devices)
        this.refreshDevices();
    }
  },
  start() {
    if (this.activeConstraints)
      return;
    if (!navigator.mediaDevices)
      return;
    this.restart();
    navigator.mediaDevices.addEventListener('devicechange', () => this.refreshDevices());
  },
  setTrack(newTrack, kind) {
    for (const track of this.stream.getTracks()) {
      if (track == newTrack)
        return;
      else if (track.kind == kind) {
        track.stop();
        this.stream.removeTrack(track);
      }
    }
    if (newTrack)
      this.stream.addTrack(newTrack);
    this.observers.fire('stream', this.stream);
  },
  async refreshDevices() {
    this.devices = await navigator.mediaDevices.enumerateDevices();
    this.observers.fire('devices', this.devices);
  },
}

export default class UserMediaClient {
  get defaultConstraints() {
    return defaultConstraints;
  }
  start() {
    userMedia.start();
  }
  observe(key, cb) {
    if (key == 'videoMuted') {
      cb(userMedia.videoMuted);
    } else if (key == 'audioMuted') {
      cb(userMedia.audioMuted);
    } else if (key == 'stream') {
      if (userMedia.stream)
        cb(userMedia.stream);
    } else if (key == 'devices') {
      if (userMedia.devices)
        cb(userMedia.devices);
    }
    return userMedia.observers.add(key, window, cb);
  }
  debugRestart() {
    userMedia.restart();
  }
  setRequiredVideoMute(on) {
    if (on == userMedia.requiredVideoMute)
      return;
    userMedia.requiredVideoMute = on;
    userMedia.restart();
  }
  setRequiredAudioMute(on) {
    if (on == userMedia.requiredAudioMute)
      return;
    userMedia.requiredAudioMute = on;
    userMedia.restart();
   }
   toggleVideoMuted() {
    sessionStorage.videoMuted = userMedia.videoMuted = !userMedia.videoMuted;
    userMedia.restart();
    userMedia.observers.fire('videoMuted', userMedia.videoMuted);
  }
  toggleAudioMuted() {
    sessionStorage.audioMuted = userMedia.audioMuted = !userMedia.audioMuted;
    userMedia.restart();
    userMedia.observers.fire('audioMuted', userMedia.audioMuted);
  }
  applyConstraints(newConstraints) {
    Object.assign(userMedia.pendingConstraints, newConstraints);
    if (userMedia.activeConstraints)
      userMedia.restart();
  }
}
