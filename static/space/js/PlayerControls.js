import Service from './Service.js'

export default class PlayerControls {
  constructor() {
    this.player = null;
    this.acceleration = [0, 0, 0];
    this.jumpStrength = 1;
    const direction = {
      87: () => [0, 1, 0], // up - w 
      38: () => [0, 1, 0], // up - up arrow
      83: () => [0, -1, 0], // down - s
      40: () => [0, -1, 0], // down - down arrow
      65: () => [-1, 0, 0], // left - a
      37: () => [-1, 0, 0], // left - left arrow
      68: () => [1, 0, 0], // right - d
      39: () => [1, 0, 0], // right - right arrow
      32: () => [0, 0, this.jumpStrength],
    };
    const keysDown = {};
    const updateAcceleration = () => {
      const { look } = this.player;
      let x = 0;
      let z = 0;
      let y = 0;
      for (const k in keysDown) {
        if (!keysDown[k])
          continue;
        const dir = direction[k]();
        x += dir[0];
        z += dir[1];
        y += dir[2];
      }
      const accel = this.adjustAccelerationForLook(x, z, y);
      const mag = Math.sqrt(Math.pow(accel[0], 2) + Math.pow(accel[1], 2));
      this.acceleration[0] = accel[0] / mag || 0;
      this.acceleration[1] = accel[1] / mag || 0;
      this.acceleration[2] = accel[2];
    };
    let handleKey = down => e => {
      if (e.keyCode in direction) {
        keysDown[e.keyCode] = down;
        updateAcceleration();
        e.preventDefault();
      } else if (e.keyCode == 16) {
        this.player.gravityEnabled = !down;
      }
    };

    window.top.addEventListener('keydown', handleKey(true));
    window.top.addEventListener('keyup', handleKey(false));

    // TODO: Way to unsubscribe
    Service.get('knobs', knobs => {
      knobs.observe('physics.jumpStrength', jumpStrength => {
        this.jumpStrength = jumpStrength;
      }, 20);
    });

    const moveListener = e => {
      const { look } = this.player;
      if (e.movementX != null) {
        look[0] += (e.movementX / document.body.clientWidth * 2) * 0.5;
        look[1] += (e.movementY / document.body.clientWidth * 2) * 0.5;
      } else {
        look[0] = (e.clientX / document.body.clientWidth * 2 - 1) * 0.5;
        look[1] = (e.clientY / document.body.clientHeight * 2 - 1) * 0.5;
      }
      look[0] = look[0] % (Math.PI * 2);
      look[1] = Math.min(Math.PI / 2, look[1]);
      look[1] = Math.max(-Math.PI / 2, look[1]);
      updateAcceleration();
    }

    const topDoc = window.top.document;
    let isMoving = false;
    let mouseDownTime;
    const cancel = () => {
      if (!isMoving)
        return;
      topDoc.body.removeEventListener('mousemove', moveListener);
      if (topDoc.pointerLockElement)
        topDoc.exitPointerLock();
      for (const k in keysDown)
        keysDown[k] = false;
      updateAcceleration();
    }
    window.addEventListener('mousedown', e => {
      if (e.target != document.body && !('clickThrough' in e.target.dataset))
        return;
      window.top.focus();
      e.preventDefault();
      topDoc.body.addEventListener('mousemove', moveListener);
      topDoc.body.requestPointerLock();
      isMoving = true;
      mouseDownTime = performance.now();
    });
    topDoc.addEventListener('mousedown', e => {
      cancel();
    });
    document.body.addEventListener('touchstart', e => {
      e.preventDefault();
      const { look } = this.player;
      const touch = e.targetTouches[0];
      let lastX = touch.pageX;
      let lastY = touch.pageY;
      const touchListener = e => {
        e.preventDefault();
        const touch = e.targetTouches[0];
        look[0] += ((lastX - touch.pageX) / document.body.clientWidth) * 1
        look[1] += ((lastY - touch.pageY) / document.body.clientHeight) * 1;
        lastX = touch.pageX;
        lastY = touch.pageY;
      };
      document.body.addEventListener('touchmove', touchListener)
      document.body.addEventListener('touchend', e => {
        document.body.removeEventListener('touchmove', touchListener, { passive: false });
      }, { once: true });
    });
    topDoc.addEventListener('mouseup', e => {
      if (performance.now() - mouseDownTime > 250)
        cancel();
    });
    topDoc.addEventListener('pointerlockchange', e => {
      if (!topDoc.pointerLockElement)
        cancel();
    });
    if (topDoc.pointerLockElement)
      topDoc.body.addEventListener('mousemove', moveListener);
  }

  adjustAccelerationForLook(x, z, y) {
    const { look } = this.player;
    return [
      x * Math.cos(look[0]) + z * Math.sin(look[0]),
      z * Math.cos(-look[0]) + x * Math.sin(-look[0]),
      y,
    ];
  }
};

