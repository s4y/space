export default class RTCPeer {
  constructor(options) {
    Object.assign(this, options);
    this.midObservers = {};
    this.init();
  }

  init() {
    this.tracksByMid = {};

    const pc = new RTCPeerConnection(this.config);
    this.close();
    this.pc = pc;

    pc.onnegotiationneeded = e => {
      this.sendToPeer(['renegotiate', null]);
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate)
        return;
      this.sendToPeer(['icecandidate', e.candidate]);
    };

    pc.ontrack = e => {
      const mid = e.transceiver.mid;
      this.tracksByMid[mid] = e.track;
      const obs = this.midObservers[mid];
      if (obs)
        obs(e.track);
    };

    for (const track of this.mediaStream.getTracks())
      this.pc.addTrack(track, this.mediaStream);
    pc.createDataChannel({});
  }

  setMidObserver(mid, observer) {
    this.midObservers[mid] = observer;
    const track = this.tracksByMid[mid];
    if (track)
      observer(track);
  }

  close() {
    if (this.pc)
      this.pc.close();
    this.pc = null;
  }

  setMediaStream(stream) {
    this.mediaStream = stream;
    if (!this.pc)
      return;
    const {pc} = this;
    for (const track of stream.getTracks())
      this.pc.addTrack(track, stream);
  }

  receiveFromPeer([name, value]) {
    const {pc} = this;
    if (name == 'offer') {
      this.pendingOffer = value;
      pc.setRemoteDescription(value)
        .then(() => pc.createAnswer())
        .then(answer => {
          if (this.pendingOffer != value)
            return;
          this.pendingOffer = null;
          pc.setLocalDescription(answer)
            .then(() => {
              this.sendToPeer(['answer', answer]);
            });
        })
        .catch(e => {
          console.log(e);
          this.init();
          this.onerror && this.onerror();
        });
    } else if (name == 'icecandidate') {
      pc.addIceCandidate(value).catch(e => {
        // console.log("lol browsers amiright? https://crbug.com/935898", e);
      });
    } else {
      console.log(this, 'unknown rtc message:', name, value);
    }
  }
}
