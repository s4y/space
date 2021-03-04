import Service from '/space/js/Service.js';

const gestureWrangler = {
  waitingForGesture: [],
  setPromptEl(promptEl, button) {
    this.promptEl = promptEl;
    this.hidePrompt();

    button.addEventListener('click', e => {
      e.preventDefault();
      this.onGesture();
    });
  },
  showPrompt() {
    if (this.promptEl)
      this.promptEl.style.display = '';
  },
  hidePrompt() {
    if (this.promptEl)
      this.promptEl.style.display = 'none';
  },
  onGesture() {
    while (this.waitingForGesture.length)
      this.waitingForGesture.shift()();
    this.hidePrompt();
  },
  doTry(tryFn) {
    return tryFn().catch(e => {
      if (e.name == 'AbortError') {
        return;
      } else if (e.name == 'NotAllowedError') {
        this.waitingForGesture.push(tryFn);
        this.showPrompt();
      } else {
        throw(e);
      }
    });
  },
  playVideo(video) {
    if (video.currentTime > 0
      && !video.paused
      && !video.ended
      && video.readyState > 2)
      return;
    return this.doTry(() => video.play());
  },
  playAudioContext(ac) {
    if (ac.state === 'running')
      return;
    const cb = () => ac.resume();
    ac.addEventListener('statechange', e => {
      const idx = this.waitingForGesture.indexOf(cb);
      if (idx == -1)
        return;
      this.waitingForGesture.splice(idx, 1);
      if (!this.waitingForGesture.length)
        this.hidePrompt();
    }, { once: true});
    this.waitingForGesture.push(cb);
    this.showPrompt();
  },
};

window.addEventListener('touchstart', () => {
  gestureWrangler.onGesture();
}, { once: true });

window.addEventListener('mousedown', () => {
  gestureWrangler.onGesture();
}, { once: true });

window.addEventListener('keydown', () => {
  gestureWrangler.onGesture();
}, { once: true });

export default function() {
  return gestureWrangler;
}
