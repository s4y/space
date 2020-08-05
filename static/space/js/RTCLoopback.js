const tweakSDP = sdp =>
  sdp.replace('useinbandfec=1', 'useinbandfec=1; stereo=1');

export default class RTCLoopback {
  constructor(cb) {
    const pc1 = this.pc1 = new RTCPeerConnection();
    const pc2 = this.pc2 = new RTCPeerConnection();

    this.outputStream = new MediaStream();
    this.gotAnyTrack = false;

    pc2.ontrack = e => {
      const track = e.track;
      this.outputStream.addTrack(track);
      e.track.addEventListener('ended', e => {
        this.outputStream.removeTrack(track);
      });
      if (!this.gotAnyTrack) {
        cb(this.outputStream);
        pc1.createDataChannel({});
        this.gotAnyTrack = true;
      }
    }

    pc1.onnegotiationneeded = e => {
      pc1.createOffer()
        .then(offer => pc1.setLocalDescription(offer))
        .then(() => pc2.setRemoteDescription(pc1.localDescription))
        .then(() => pc2.createAnswer())
        .then(answer => {
          answer.sdp = tweakSDP(answer.sdp);
          return pc2.setLocalDescription(answer);
        })
        .then(() => pc1.setRemoteDescription(pc2.localDescription))
      ;
    };
  }

  setInputStream(stream) { 
    const { pc1 } = this;
    for (const sender of pc1.getSenders())
      pc1.removeTrack(sender);
    for (const track of stream.getTracks())
      pc1.addTrack(track, stream);
  }
}
