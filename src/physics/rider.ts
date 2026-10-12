import type { RiderInput } from '../input/types';

/**
 * 시트 웨이브 위 보드의 단순화된 2.5D 모델.
 * 좌표: x = 폭 방향(m, 0이 중앙), y = 경사면을 따라 올라가는 거리(m, 0 = 바닥, LENGTH = 크레스트), z = 공중 높이.
 * 물은 +y 로 흐르며 보드를 위로 밀고, 중력은 경사가 급해질수록 아래로 끌어내린다.
 * heading 0 = 노즈가 경사 아래(-y)를 향함. 양수면 노즈가 +x 쪽으로 돈다.
 *
 * 하중(lean)은 월드 기준이다. 서피스 360 동안 보드는 발밑에서 돌지만 상체는 경사 아래를 계속 바라보기 때문.
 */
export const SHEET = {
  WIDTH: 8,
  LENGTH: 10,
  MAX_SLOPE: (35 * Math.PI) / 180,
} as const;

const G = 9.8;
const FLOW_PUSH = 3;
/** 보드가 옆으로 설수록 물을 정면으로 받아 더 밀려 올라간다 */
const BROADSIDE_PUSH = 1;
const PITCH_FORCE = 3.5;
const DAMP_Y = 0.8;
const CARVE_FORCE = 8;
/** 내려가는 속도 1m/s 당 카빙 힘 증가율 */
const CARVE_SPEED_BOOST = 0.3;
const DAMP_X = 1.2;
const TURN_RATE = 1.8;
const SPIN_RATE = 9;
const WEATHERVANE = 2;
const POP_BASE = 2.5;
const POP_CROUCH = 3;
const LAND_TOLERANCE = (35 * Math.PI) / 180;
/** 아래쪽 레일에 이 정도 하중까지는 버틴다 */
const RAIL_LOAD_TOLERANCE = 0.2;
/** 레일이 물을 파고드는 속도. edgeLoad 가 1 이 되면 고꾸라진다 */
const RAIL_DIG_RATE = 6;
const RAIL_RECOVER_RATE = 1.5;

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
  /** 바닥에서 누적 회전(rad). 보드가 다시 정렬되면 서피스 스핀으로 집계 */
  groundRotation: number;
  /** 0 ~ 1. 아래쪽 레일이 물에 파고든 정도 */
  edgeLoad: number;
  wipeout: WipeoutReason | null;
}

export type RiderEvent =
  | { type: 'land'; rotations: number; fakie: boolean }
  | { type: 'surface-spin'; rotations: number; fakie: boolean }
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
  groundRotation: 0,
  edgeLoad: 0,
  wipeout: null,
});

/** 노즈 방향이 흐름 축(0 또는 π)에서 벗어난 각도 */
const offAxis = (heading: number) => {
  const a = Math.abs(Math.atan2(Math.sin(heading), Math.cos(heading)));
  return Math.min(a, Math.PI - a);
};

/**
 * 물을 정면으로 맞는(경사 아래쪽) 레일에 실린 하중.
 * 보드가 옆으로 설수록 레일이 흐름에 노출되고, 그 레일 쪽으로 무게를 실으면 파고든다.
 * 반대로 위쪽 레일에 무게를 두면(뒤로 버티면) 음수가 되어 안전하다.
 */
export const downhillRailLoad = (heading: number, input: RiderInput) => {
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  // 보드 수직축 t = (cos, sin) 중 경사 아래(-y)를 향하는 쪽에 실린 하중
  const load = input.leanForward * Math.abs(s) - input.leanSide * c * Math.sign(s);
  return Math.abs(s) * load;
};

export function stepRider(s: RiderState, input: RiderInput, dt: number): RiderEvent[] {
  if (s.wipeout) return [];
  const events: RiderEvent[] = [];
  const airborne = s.z > 0 || s.vz > 0;
  const broadside = Math.abs(Math.sin(s.heading));

  // 경사가 급한 위쪽일수록 하중 이동이 크게 먹힌다: 위에서 앞으로 실으면 확 떨어지며 가속하고, 평평한 바닥에선 둔하다
  const steepness = slopeAngle(s.y) / SHEET.MAX_SLOPE;
  const pitchGain = 0.4 + 1.6 * steepness;
  const push = FLOW_PUSH + BROADSIDE_PUSH * broadside;
  const ay = push - G * Math.sin(slopeAngle(s.y)) - PITCH_FORCE * pitchGain * input.leanForward - DAMP_Y * s.vy;
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
    // 옆으로 실으면 경사 아래쪽 끝(레귤러면 노즈, 페이키면 테일)이 그쪽으로 돈다. 보드가 옆으로 설수록 카빙은 안 먹힌다
    // 스핀 입력이 없으면 물살이 보드를 흐름 방향으로 되돌린다 (180 에서 놓으면 360 으로 마무리됨)
    const carve = input.leanSide * TURN_RATE * Math.abs(Math.cos(s.heading));
    const targetSpin = carve + input.yaw * SPIN_RATE - WEATHERVANE * Math.sin(s.heading) * (1 - Math.abs(input.yaw));
    s.spin += (targetSpin - s.spin) * Math.min(1, 8 * dt);
    // 보드는 자기 축을 따라 미끄러진다. 축은 heading 과 heading+π 가 같으므로 sin·cos(주기 π)
    // 내려오며 얻은 속도는 옆으로 치고 나가는 힘이 된다
    const carveBoost = 1 + CARVE_SPEED_BOOST * Math.max(0, -s.vy);
    s.vx += (CARVE_FORCE * carveBoost * Math.sin(s.heading) * Math.cos(s.heading) - DAMP_X * s.vx) * dt;
  }
  s.heading += s.spin * dt;
  if (airborne) s.airRotation += s.spin * dt;
  else s.groundRotation += s.spin * dt;

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
    s.groundRotation = 0;
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
        s.groundRotation = 0;
      }
    }
  } else {
    // 레일 파고듦: 아래쪽 레일에 실린 하중이 허용치를 넘으면 쌓이고, 아니면 회복
    const excess = downhillRailLoad(s.heading, input) - RAIL_LOAD_TOLERANCE;
    s.edgeLoad = Math.max(0, s.edgeLoad + (excess > 0 ? excess * RAIL_DIG_RATE : -RAIL_RECOVER_RATE) * dt);
    if (s.edgeLoad >= 1) s.wipeout = 'edge-catch';

    // 서피스 스핀 집계: 보드가 흐름 방향으로 다시 정렬되어 안정되면 마감
    if (offAxis(s.heading) < 0.25 && Math.abs(s.spin) < 1.5) {
      const rotations = Math.round(Math.abs(s.groundRotation) / Math.PI) / 2;
      if (rotations >= 0.5) events.push({ type: 'surface-spin', rotations, fakie: Math.cos(s.heading) < 0 });
      s.groundRotation = 0;
    }
  }

  if (s.y > SHEET.LENGTH) s.wipeout = 'over-the-top';

  if (s.wipeout) events.push({ type: 'wipeout', reason: s.wipeout });
  return events;
}
