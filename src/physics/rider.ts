import type { RiderInput } from '../input/types';

/**
 * 시트 웨이브 위 보드의 단순화된 2.5D 모델.
 * 좌표: x = 폭 방향(m, 0이 중앙), y = 경사면을 따라 올라가는 거리(m, 0 = 바닥, LENGTH = 크레스트), z = 공중 높이.
 * 물은 +y 로 흐르며 보드를 위로 밀고, 중력은 경사가 급해질수록 아래로 끌어내린다.
 * heading 0 = 노즈가 경사 아래(-y)를 향함. 양수면 노즈가 +x 쪽으로 돈다.
 */
export const SHEET = {
  WIDTH: 8,
  LENGTH: 10,
  MAX_SLOPE: (35 * Math.PI) / 180,
} as const;

const G = 9.8;
const FLOW_PUSH = 3;
const PITCH_FORCE = 3;
const DAMP_Y = 1.5;
const CARVE_FORCE = 8;
const DAMP_X = 1.2;
const TURN_RATE = 1.8;
const SPIN_RATE = 9;
const WEATHERVANE = 1.2;
const POP_BASE = 2.5;
const POP_CROUCH = 3;
const LAND_TOLERANCE = (35 * Math.PI) / 180;
const EDGE_CATCH_ANGLE = (70 * Math.PI) / 180;

export type WipeoutReason = 'over-the-top' | 'bad-landing' | 'edge-catch';

export interface RiderState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  spin: number;
  /** 이번 점프에서 누적 회전(rad) */
  airRotation: number;
  wipeout: WipeoutReason | null;
}

export type RiderEvent =
  | { type: 'land'; rotations: number; fakie: boolean }
  | { type: 'wipeout'; reason: WipeoutReason };

export const slopeAngle = (y: number) => SHEET.MAX_SLOPE * Math.pow(Math.max(0, y) / SHEET.LENGTH, 1.5);

export const createRider = (): RiderState => ({
  x: 0,
  y: SHEET.LENGTH * 0.6,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  heading: 0,
  spin: 0,
  airRotation: 0,
  wipeout: null,
});

/** 노즈 방향이 흐름 축(0 또는 π)에서 벗어난 각도 */
const offAxis = (heading: number) => {
  const a = Math.abs(Math.atan2(Math.sin(heading), Math.cos(heading)));
  return Math.min(a, Math.PI - a);
};

export function stepRider(s: RiderState, input: RiderInput, dt: number): RiderEvent[] {
  if (s.wipeout) return [];
  const events: RiderEvent[] = [];
  const airborne = s.z > 0 || s.vz > 0;

  // 경사 방향: 물에 밀려 올라가고, 중력·앞발 하중으로 내려온다
  const ay = FLOW_PUSH - G * Math.sin(slopeAngle(s.y)) - PITCH_FORCE * input.pitch - DAMP_Y * s.vy;
  s.vy += ay * dt;
  s.y += s.vy * dt;
  if (s.y < 0) {
    s.y = 0;
    s.vy = Math.max(0, s.vy);
  }

  if (airborne) {
    // 공중 회전은 입력을 따라가고, 놓으면 멈춘다 (착지 각도를 플레이어가 맞출 수 있게)
    s.spin += (input.yaw * SPIN_RATE - s.spin) * Math.min(1, 4 * dt);
    s.vx -= DAMP_X * 0.2 * s.vx * dt;
  } else {
    // 엣지로 회전, 스핀 입력으로 비틀기, 손을 놓으면 흐름 방향으로 정렬
    const targetSpin = input.roll * TURN_RATE + input.yaw * SPIN_RATE - WEATHERVANE * Math.sin(s.heading) * (1 - Math.abs(input.yaw));
    s.spin += (targetSpin - s.spin) * Math.min(1, 8 * dt);
    // 보드는 자기 축을 따라 미끄러진다. 축은 heading 과 heading+π 가 같으므로 sin·cos(주기 π)
    s.vx += (CARVE_FORCE * Math.sin(s.heading) * Math.cos(s.heading) - DAMP_X * s.vx) * dt;
  }
  s.heading += s.spin * dt;
  if (airborne) s.airRotation += s.spin * dt;

  s.x += s.vx * dt;
  const halfW = SHEET.WIDTH / 2;
  if (Math.abs(s.x) > halfW) {
    s.x = Math.sign(s.x) * halfW;
    s.vx *= -0.3;
  }

  // 점프
  if (!airborne && input.pop) {
    s.vz = POP_BASE + POP_CROUCH * input.crouch;
    s.airRotation = 0;
  }
  if (s.z > 0 || s.vz > 0) {
    s.vz -= G * dt;
    s.z += s.vz * dt;
    if (s.z <= 0) {
      s.z = 0;
      s.vz = 0;
      if (offAxis(s.heading) > LAND_TOLERANCE) {
        s.wipeout = 'bad-landing';
      } else {
        const fakie = Math.cos(s.heading) < 0;
        events.push({ type: 'land', rotations: Math.round(Math.abs(s.airRotation) / Math.PI) / 2, fakie });
        s.spin = 0;
      }
    }
  } else if (offAxis(s.heading) > EDGE_CATCH_ANGLE && Math.abs(s.spin) < 3) {
    s.wipeout = 'edge-catch';
  }

  if (s.y > SHEET.LENGTH) s.wipeout = 'over-the-top';

  if (s.wipeout) events.push({ type: 'wipeout', reason: s.wipeout });
  return events;
}
