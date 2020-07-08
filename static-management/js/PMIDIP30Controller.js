export default class PMIDIP30Controller {
  constructor(input, onchange) {
    this.onchange = onchange;
    this.state = { encoder: 0 };
    let lastEncoderVal = null;
    const pushButtons = {
      1: 'buttonA',
      2: 'buttonB',
      44: 'buttonRecord',
      45: 'buttonPlay',
      46: 'buttonStop',
      47: 'buttonRev',
      48: 'buttonFwd',
      49: 'buttonRepeat',
      64: 'buttonR',
      67: 'buttonL',
    };
    input.onmidimessage = e => {
      // window.dispatchEvent(new CustomEvent('sendbroadcast', { detail: {
      //   type: "midi",
      //   value: e.data
      // }}))
      const [channel, button, value] = e.data;
      if (button in pushButtons) {
        this.set(pushButtons[button], value?1:0);
      } else if (button === 9) {
        this.setAnalog("crossfader", value);
      } else if (button === 10) {
        if (lastEncoderVal !== null) {
          if (value === lastEncoderVal) {
            if (value === 0)
              this.set("encoder", this.state.encoder - 1);
            else if (value == 127)
              this.set("encoder", this.state.encoder + 1);
          } else {
            this.set("encoder", this.state.encoder + (value - lastEncoderVal));
          }
        }
        lastEncoderVal = value;
      } else if (button >= 14 && button <= 22) {
        this.setAnalog(`knob${button-13}`, value);
      } else if (button >= 23 && button <= 31) {
        this.setAnalog(`fader${button-22}`, value);
      } else if (button >= 32 && button <= 40) {
        this.set(`faderButton${button-22}`, !!value);
      } else {
        console.log(e.data);
      }
    }
    input.open();
  }


  setAnalog(k, v) {
    // Dead zone
    this.set(k, Math.min(1, Math.max(0, (v-1)/124)));
  }

  set(k, v) {
    if (v === this.state[k])
      return;
    this.state[k] = v;
    this.onchange(k, v);
  }
}
