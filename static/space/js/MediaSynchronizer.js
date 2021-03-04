// reserve:hot_reload

export default class MediaSynchronizer {
  constructor(timeSource, mediaEl, sensitivity) {
    this.timeSource = timeSource;
    this.mediaEl = mediaEl;
    this.sensitivity = sensitivity || 0.01

    this.mediaEl.addEventListener('timeupdate', e => {
      this.sync();
    });
  }
  sync() {
    const now = this.timeSource.now() / 1000;
    // console.log('sync now is', now);
    if (now == null)
      return;
    const { timeSource, mediaEl } = this;
    const targetTime = now % mediaEl.duration;
    const diff = Math.abs(mediaEl.currentTime - targetTime);
    if (mediaEl.currentTime < .5)
      return;
    if (diff > 0.5) {
      mediaEl.currentTime = targetTime;
    } else if (diff > this.sensitivity) {
      const rate = 1 + (targetTime - mediaEl.currentTime);
      // console.log('[MediaSynchronizer]', diff, rate);
      mediaEl.playbackRate = rate;
    } else if (diff < 0.01 && mediaEl.playbackRate != 1) {
      mediaEl.playbackRate = 1;
      // console.log('[MediaSynchronizer] locked!');
      // mediaEl.muted = false;
    }
  }
}
