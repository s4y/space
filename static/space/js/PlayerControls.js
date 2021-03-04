// reserve:hot_reload

function spow(x, e) {
  return Math.abs(Math.pow(x, e)) * (x > 0 ? 1 : -1);
}

const keyAcceleration = {
  ArrowUp: {
    linear: [0, 1, 0],
    angular: [0, 0, 0],
  },
  ArrowDown: {
    linear: [0, -1, 0],
    angular: [0, 0, 0],
  },
  ArrowLeft: {
    linear: [0, 0, 0],
    angular: [-1, 0, 0],
  },
  ArrowRight: {
    linear: [0, 0, 0],
    angular: [1, 0, 0],
  },
  KeyW: {
    linear: [0, 1, 0],
    angular: [0, 0, 0],
  },
  KeyS: {
    linear: [0, -1, 0],
    angular: [0, 0, 0],
  },
  KeyA: {
    linear: [-1, 0, 0],
    angular: [0, 0, 0],
  },
  KeyD: {
    linear: [1, 0, 0],
    angular: [0, 0, 0],
  },
  Space: {
    linear: [0, 0, 3],
    angular: [0, 0, 0],
  },
};

export default class PlayerControls {
  constructor() {
    this.player = null;
    this.gravityEnabled = true;
    this.cancelEventListeners = () => {};
    this.init();
  }
  addEventListenerTo(target, ...args) {
    target.addEventListener(...args);
    const last = this.cancelEventListeners;
    this.cancelEventListeners = () => {
      last();
      target.removeEventListener(...args);
    };
  }

  init() {
    const setPointerTargetFromMouse = e => {
      if (!e.target.clientWidth)
        return;
      if (!e.target.clientWidth)
        return;
      this.currentPointerTarget = [
        e.pageX / e.target.clientWidth * 2 - 1,
        e.pageY / e.target.clientHeight * 2 - 1,
        0.5,
      ];
    }

    const handleMouseMove = e => {
      setPointerTargetFromMouse(e);
    };
    const cancelMouse = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      this.currentPointerTarget = null;
    };

    const handleTouch = e => {
      this.currentPointerTarget = [
        e.targetTouches[0].pageX / e.target.clientWidth * 2 - 1,
        e.targetTouches[0].pageY / e.target.clientHeight * 2 - 1,
        0.5,
      ];
    };

    this.addEventListenerTo(window, 'touchstart', handleTouch);
    this.addEventListenerTo(window, 'touchmove', handleTouch);
    this.addEventListenerTo(window, 'touchend', e => {
      this.currentPointerTarget = null;
    });
    this.addEventListenerTo(window, 'mouseup', cancelMouse);
    this.angularVelocity = [0, 0, 0];
    this.mouseDampening = 0;
    this.keysDown = {};
    this.addEventListenerTo(window, 'mousedown', e => {
      if (e.target != document.documentElement)
        return;
      document.activeElement.blur();
      document.body.focus();
      e.preventDefault();
      setPointerTargetFromMouse(e);
      this.addEventListenerTo(window, 'mousemove', handleMouseMove);
    });
    this.addEventListenerTo(window, 'keydown', e => {
      if (e.target != document.body)
        return;
      if (!(e.code in keyAcceleration))
        return;
      if (e.shiftKey || e.metaKey)
        return;
      this.keysDown[e.code] = true;
      this.mouseDampening = 2;
      e.preventDefault();
    });
    this.addEventListenerTo(window, 'keyup', e => {
      delete this.keysDown[e.code];
    });
    this.addEventListenerTo(window, 'blur', e => {
      this.keysDown = {};
      cancelMouse();
    });
  }

  get linearVelocity() {
    return this.player.velocity;
  }

  adjustAccelerationForLook(x, z, y) {
    const { look } = this.player;
    return [
      x * Math.cos(look[0]) + z * Math.sin(look[0]),
      z * Math.cos(-look[0]) + x * Math.sin(-look[0]),
      y,
    ];
  }

  applyAcceleration() {
    const apply = (v, a) => {
      const vOut = v + a;
      return Math.abs(vOut) > 0.001 ? vOut : 0;
    };
    const { velocity } = this.player;
    velocity[0] = apply(velocity[0], this.acceleration[0] * 0.02);
    velocity[1] = apply(velocity[1], this.acceleration[1] * 0.02);
    velocity[2] = apply(velocity[2], this.acceleration[2] * 0.02);
  }

  step() {
    for (let i = 0; i < this.angularVelocity.length; i++)
      this.angularVelocity[i] *= 0.9;
    // for (let i = 0; i < this.linearVelocity.length; i++)
    //   this.linearVelocity[i] *= 0.95;
    if (this.currentPointerTarget) {
      const vec = [...this.currentPointerTarget];
      for (let i = 0; i < 2; i++)
        vec[i] = Math.max(0, Math.abs(vec[i]) - 0.5) * 2 * (vec[i] > 0 ? 1 : -1);

      const len = Math.sqrt(vec.reduce((a, n) => a + Math.pow(n, 2), 0));
      const norm = vec.map(n => n / len);
      for (let i = 0; i < this.angularVelocity.length; i++)
        this.angularVelocity[i] += spow(norm[i] * 0.2, 2.) * 0.02;
      const accel = this.adjustAccelerationForLook(...[0, norm[2] * 0.01, 0]);
      for (let i = 0; i < this.linearVelocity.length; i++)
        this.linearVelocity[i] += accel[i] * Math.max(0, 1-this.mouseDampening);
      this.mouseDampening *= 0.99;
    }
    for (const k in this.keysDown) {
      const accel = { ...keyAcceleration[k] };
      if (!accel)
        continue;
      accel.linear = this.adjustAccelerationForLook(...accel.linear);
      for (let i = 0; i < this.angularVelocity.length; i++)
        this.angularVelocity[i] += accel.angular[i] * 0.001;
      for (let i = 0; i < this.linearVelocity.length; i++)
        this.linearVelocity[i] += accel.linear[i] * 0.01;
    }

    const apply = (v, a) => {
      const vOut = v + a;
      return Math.abs(vOut) > 0.001 ? vOut : 0;
    };


    const { look } = this.player;
    look[0] += this.angularVelocity[0];
    look[1] += this.angularVelocity[1];
    look[1] *= 0.995;
    look[0] = look[0] % (Math.PI * 2);
    look[1] = Math.min(Math.PI, look[1]);
    look[1] = Math.max(-Math.PI, look[1]);
    // this.player.velocity = this.adjustAccelerationForLook(...this.linearVelocity);
    // this.player.position = this.player.position.map((x, i) => x + this.linearVelocity[i]);
    // this.player.position = [this.player.position[0], this.player.position[2], -this.player.position[1]];

  }

  adopt() {
    this.cancelEventListeners();
    this.init();
  }
};

