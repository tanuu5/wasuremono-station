// 確認台のアダプター：トモ（作品の RobotModel / RobotAnimator をそのまま使う）
import { RobotModel, RobotAnimator } from '../../src/game/robot.js';

export default {
  title: 'Tomo',
  create({ THREE }) {
    const m = new RobotModel();
    const a = new RobotAnimator(m);
    const root = new THREE.Group();
    root.add(m.root);
    root.add(m.lantern);
    let yaw = 0;
    return {
      root,
      update(dt, ctx) {
        const P = ctx.params;
        for (const k of ['sit', 'sitUp', 'crouch', 'hold', 'lookUp', 'wave', 'bow', 'reach', 'raise', 'tilt']) a.setLayer(k, P.pose === k ? 1 : 0, 6);
        if (P.eyes) a.express(P.eyes, 0.5);
        a.update(dt, { speed: P.speed || 0, grounded: !P.air, vy: P.vy || 0, yaw, landT: 0 });
        m.root.updateMatrixWorld(true);
        a.updateLantern(dt, yaw);
      },
    };
  },
  modes: {
    idle: { speed: 0 },
    walk: { speed: 2.6 },
    run: { speed: 4.6 },
    jump: { air: true, vy: 3 },
    sit: { pose: 'sit', eyes: 'closed' },
    sitUp: { pose: 'sitUp' },
    crouch: { pose: 'crouch' },
    hold: { pose: 'hold', eyes: 'happy' },
    wave: { pose: 'wave', eyes: 'happy' },
    bow: { pose: 'bow' },
    lookUp: { pose: 'lookUp', eyes: 'wide' },
  },
  views: {
    ref: { pos: [0.95, 1.25, -2.3], target: [0.05, 0.52, 0], fov: 25 },
    face: { pos: [0, 0.9, 1.3], target: [0, 0.86, 0], fov: 25 },
  },
  refs: { ref: '/dev/ref/tomo-back.png' },
  background: '#6d7378',
};
