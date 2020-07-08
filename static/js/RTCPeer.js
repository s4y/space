export default class RTCPeer {
  constructor(options) {
    Object.assign(this, options);

    this.tracksByMid = {};
    this.midObservers = {};

    const pc = new RTCPeerConnection(this.config);
    this.pc = pc;

    pc.onnegotiationneeded = e => this.negotiate();

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

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks())
        this.pc.addTrack(track, this.mediaStream);
    } else {
      pc.addTransceiver('audio');
      pc.addTransceiver('video');
    }
  }

  setMidObserver(mid, observer) {
    this.midObservers[mid] = observer;
    const track = this.tracksByMid[mid];
    if (track)
      observer(track);
  }

  negotiate() {
    if (this.pendingNegotiations++)
      return;
    const {pc} = this;
    pc.createOffer()
      .then(offer => {
        pc.setLocalDescription(offer)
        this.sendToPeer(['offer', offer]);
      });
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
    for (const sender of pc.getSenders())
      pc.removeTrack(sender);
    for (const track of stream.getTracks())
      this.pc.addTrack(track, stream);
  }

  receiveFromPeer([name, value]) {
    // console.log('recv', name, value);
    const {pc} = this;
    if (name == 'answer') {
      pc.setRemoteDescription(value)
      const needRenegotiation = this.pendingNegotiations > 1;
      this.pendingNegotiations = 0;
      if (needRenegotiation)
        this.negotiate();
    } else if (name == 'icecandidate') {
      pc.addIceCandidate(value).catch(e => {
        // console.log("lol browsers amiright? https://crbug.com/935898", e);
      });
    } else if (name == 'addtransceiver') {
      pc.addTransceiver(value);
    } else if (name == 'renegotiate') {
      this.negotiate();
    } else {
      console.log(this, 'unknown rtc message:', name, value);
    }
  }
}
