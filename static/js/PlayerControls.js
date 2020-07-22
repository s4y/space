export default class PlayerControls {
  constructor() {
    this.player = null;
    this.acceleration = [0, 0, 0];
    const direction = {
      87: [0, 1, 0],
      83: [0, -1, 0],
      65: [-1, 0, 0],
      68: [1, 0, 0],
      32: [0, 0, 1],
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
        x += direction[k][0];
        z += direction[k][1];
        y += direction[k][2];
      }
      const accel = [
        x * Math.cos(look[0]) + z * Math.sin(look[0]),
        z * Math.cos(-look[0]) + x * Math.sin(-look[0]),
        y,
      ];
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
      }
    };

    window.top.addEventListener('keydown', handleKey(true));
    window.top.addEventListener('keyup', handleKey(false));

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
    }

    const topDoc = window.top.document;
    let isMoving = false;
    let mouseDownTime;
    const cancel = () => {
      if (!isMoving)
        return;
      topDoc.body.removeEventListener('mousemove', moveListener);
      if (topDoc.pointerLockElement)
        window.top.topDoc.exitPointerLock();
    }
    window.addEventListener('mousedown', e => {
      e.preventDefault();
      topDoc.body.addEventListener('mousemove', moveListener);
      topDoc.body.requestPointerLock();
      isMoving = true;
      mouseDownTime = performance.now();
    });
    window.addEventListener('mouseup', e => {
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
};

