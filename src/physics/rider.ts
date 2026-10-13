import type { RiderInput } from '../input/types';

/**
 * 시트 웨이브 위 보드의 단순화된 2.5D 모델.
 * 좌표: x = 폭 방향(m, 0이 중앙), y = 경사면을 따라 올라가는 거리(m, 0 = 바닥, LENGTH = 크레스트), z = 공중 높이.
 * 물은 +y 로 흐르며 보드를 위로 밀고, 중력은 경사가 급해질수록 아래로 끌어내린다.
 * 방향(heading) 0 = 경사 아래(-y)를 향함. 양수면 +x 쪽으로 돈다.
 *
 * 보드는 앞뒤 대칭(트윈팁)이라 boardHeading 과 boardHeading+π 는 같은 자세다.
 * 라이더는 보드 위에 옆으로 선다: 어깨선이 보드 길이 방향, 가슴은 토 쪽(폭 방향)을 본다.
 * bodyHeading 은 가슴이 향하는 방향이고, 레귤러는 화면 왼쪽(-x)을 본다. 몸이 180 돌면 앞발이 바뀌어 페이키가 된다.
 * 바닥에서는 발이 보드에 붙어 있어 몸과 보드가 함께만 돈다(stance 고정). 보드만 도는 샤빗은 공중에서만 가능하고,
 * 착지할 때 발이 보드 위에 옆으로 설 수 있는 각도여야 한다.
 *
 * 입력 하중은 몸 기준 "목표"다. 실제 몸 무게중심(com, 월드 기준)이 스프링처럼 그 목표를 따라가고,
 * 보드에는 실제 무게중심만 전달된다. 그래서 무게를 실어도 바로 그쪽으로 가지 않는다.
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
/** 한 발에 체중을 싣고 반대쪽 끝을 밀 때의 회전 속도 */
const STEER_RATE = 6;
/** 양발에 고르게 싣고 좌우로 실었을 때 옆으로 평행 이동하는 힘 */
const LATERAL_FORCE = 6;
/**
 * 점프 순간 발로 보드를 차서 주는 최대 회전 속도(rad/s, yaw 1·최대로 웅크림 기준). 공중에선 이 각속도가 그대로 유지된다.
 * 깊이 웅크렸다 뛸수록 세게 찰 수 있어서, 360 은 높은 점프에서만 되고 540 은 안 된다.
 */
const SHOVE_IMPULSE = 6;
/**
 * 점프 순간 앞발로 보드 모서리를 차서 주는 최대 플립 속도(rad/s, flip 1·최대로 웅크림 기준).
 * 보통 점프로 킥플립 한 바퀴, 더블은 거의 불가능.
 */
const FLIP_IMPULSE = 11;
/** 플립은 착지할 때 발로 보드를 잡아 세울 수 있어 허용 각도가 더 넓다 */
const FLIP_LAND_TOLERANCE = (55 * Math.PI) / 180;
const BODY_SPIN_RATE = 7;
const WEATHERVANE = 2;
/** 레귤러 스탠스의 몸 방향: 가슴이 화면 왼쪽(-x) */
export const REGULAR_BODY_HEADING = -Math.PI / 2;

export const BOARD_HALF_LENGTH = 0.65;

/**
 * 발 위치. 보드 중심에서 보드 길이 방향으로 잰 거리를 반길이(BOARD_HALF_LENGTH) 단위로 나타낸다.
 * + = 앞발 쪽(레귤러로 탈 때 경사 아래), -1 = 테일 끝.
 */
export interface FootSetup {
  front: number;
  back: number;
}

/** 실제 플로우보드: 앞발은 중심 또는 살짝 앞, 뒷발은 테일 끝 */
export const DEFAULT_FEET: FootSetup = { front: 0.1, back: -0.9 };

/**
 * 하중 지점이 여기(뒷발 쪽으로 치우친 곳)에 있으면 보드가 수평을 유지한다.
 * 기본 발 위치에서 두 발에 고르게 실었을 때 중립이 되도록 정했다.
 */
const BOARD_BALANCE = -0.4;
/** 균형점에서 하중 지점이 이만큼 벗어나면 예전 하중 1 과 같은 힘 */
const LEVER_NORM = 0.5;
/** 하중 지점이 균형점보다 뒤로 갈수록(노즈가 들릴수록) 회전이 빨라지는 정도 */
const NOSE_LIFT_TURN_BOOST = 0.5;
const POP_BASE = 2.5;
const POP_CROUCH = 3;
const LAND_TOLERANCE = (35 * Math.PI) / 180;
/** 착지 충격을 받아내려면 무게중심이 이 안쪽이어야 한다(평소 한계 BALANCE_LIMIT 보다 좁다) */
const LAND_BALANCE_LIMIT = 0.7;
/** 아래쪽 레일에 이 정도 하중까지는 버틴다 */
const RAIL_LOAD_TOLERANCE = 0.2;
/** 레일이 물을 파고드는 속도. edgeLoad 가 1 이 되면 고꾸라진다 */
const RAIL_DIG_RATE = 7;
const RAIL_RECOVER_RATE = 1.5;

/** 몸 무게중심 스프링. 고유진동수 ≈ √STIFFNESS rad/s, 감쇠비 ≈ DAMPING / (2√STIFFNESS) */
const BODY_STIFFNESS = 30;
const BODY_DAMPING = 6;
/** 무게중심이 이 이상 밀려나면(목표는 최대 1) 균형을 잃는다 */
const BALANCE_LIMIT = 1.2;
/** 엣지가 물에 박히는 속도 (물에 대한 상대 속도 1 당) */
const EDGE_ENGAGE_RATE = 4;
/** 스핀 입력 없이 보드 회전 속도가 따라붙는 속도 (상대 속도 1 당) */
const TURN_RESPONSE = 3;

export type WipeoutReason = 'over-the-top' | 'bad-landing' | 'edge-catch' | 'off-balance';

export interface RiderState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  boardHeading: number;
  boardSpin: number;
  bodyHeading: number;
  bodySpin: number;
  /** 점프 순간 보드를 차서(샤빗) 발에서 떨어졌는지. 아니면 공중에서도 발에 붙어 몸과 같이 돈다 */
  boardKicked: boolean;
  /** 보드가 길이 방향 축으로 뒤집힌 각도(rad). 0 = 바로 섬. + = 킥플립 방향 */
  flip: number;
  flipSpin: number;
  /** 바닥에서 보드 대비 몸 방향(±π/2). 착지할 때마다 다시 정해진다 */
  stance: number;
  /** 실제 몸 무게중심(월드 기준, 정규화). down + = 경사 아래, side + = 화면 오른쪽 */
  comDown: number;
  comSide: number;
  comVDown: number;
  comVSide: number;
  /** 물에 박힌 엣지(보드 폭 방향 하중). -1 ~ 1 */
  edge: number;
  /** 이번 점프/바닥 회전에서 누적 회전(rad). 보드가 다시 정렬되면 집계 */
  boardRotation: number;
  bodyRotation: number;
  /** 0 ~ 1. 아래쪽 레일이 물에 파고든 정도 */
  edgeLoad: number;
  wipeout: WipeoutReason | null;
}

export interface Rotation {
  /** 몸 회전 수 (0.5 단위) */
  body: number;
  /** 몸과 별개로 보드만 돈 회전 수 (0.5 단위) = 샤빗 */
  shove: number;
  /** 플립 수. + = 킥플립, - = 힐플립 */
  flips: number;
  /** 몸이 레귤러 반대쪽(화면 오른쪽)을 보고 있음 = 앞발이 바뀜 */
  fakie: boolean;
}

export type RiderEvent =
  | ({ type: 'land' } & Rotation)
  | ({ type: 'surface-spin' } & Rotation)
  | { type: 'wipeout'; reason: WipeoutReason; details?: string[] };

export const slopeAngle = (y: number) => SHEET.MAX_SLOPE * Math.pow(Math.max(0, y) / SHEET.LENGTH, 1.5);

export const createRider = (): RiderState => ({
  x: 0,
  y: SHEET.LENGTH * 0.6,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  boardHeading: 0,
  boardSpin: 0,
  bodyHeading: REGULAR_BODY_HEADING,
  stance: REGULAR_BODY_HEADING,
  boardKicked: false,
  flip: 0,
  flipSpin: 0,
  bodySpin: 0,
  comDown: 0,
  comSide: 0,
  comVDown: 0,
  comVSide: 0,
  edge: 0,
  boardRotation: 0,
  bodyRotation: 0,
  edgeLoad: 0,
  wipeout: null,
});

/** 보드가 흐름 축(0 또는 π)에서 벗어난 각도 */
const offAxis = (heading: number) => {
  const a = Math.abs(Math.atan2(Math.sin(heading), Math.cos(heading)));
  return Math.min(a, Math.PI - a);
};

const deg = (rad: number) => Math.round((rad * 180) / Math.PI);

const halfTurns = (rad: number) => Math.round(Math.abs(rad) / Math.PI) / 2;
const completedHalfTurns = (rad: number) => Math.floor((Math.abs(rad) + LAND_TOLERANCE) / Math.PI) / 2;

/** 몸 기준 하중 → 월드 기준 (down + = 경사 아래, side + = 화면 오른쪽) */
export const bodyToWorld = (bodyHeading: number, forward: number, side: number) => {
  const c = Math.cos(bodyHeading);
  const s = Math.sin(bodyHeading);
  return { down: forward * c - side * s, side: forward * s + side * c };
};

/** 월드 기준 → 몸 기준. 화면 방향으로 조작하는 장치(마우스)가 쓴다 */
export const worldToBody = (bodyHeading: number, down: number, side: number) => {
  const c = Math.cos(bodyHeading);
  const s = Math.sin(bodyHeading);
  return { forward: down * c + side * s, side: side * c - down * s };
};

/**
 * 물을 정면으로 맞는(경사 아래쪽) 레일에 실린 하중.
 * 보드가 옆으로 설수록 레일이 흐름에 노출되고, 그 레일 쪽으로 무게를 실으면 파고든다.
 * 반대로 위쪽 레일에 무게를 두면(뒤로 버티면) 음수가 되어 안전하다.
 */
export const downhillRailLoad = (boardHeading: number, comDown: number, comSide: number) => {
  const s = Math.sin(boardHeading);
  const c = Math.cos(boardHeading);
  // 보드 수직축 t = (cos, sin) 중 경사 아래(-y)를 향하는 쪽에 실린 하중
  const load = comDown * Math.abs(s) - comSide * c * Math.sign(s);
  return Math.abs(s) * load;
};

const rotationSummary = (s: RiderState): Rotation => ({
  body: halfTurns(s.bodyRotation),
  shove: halfTurns(s.boardRotation - s.bodyRotation),
  flips: Math.round(s.flip / (2 * Math.PI)),
  fakie: Math.sin(s.bodyHeading) > 0,
});

/** 앞발 방향 단위벡터(월드, x 오른쪽 / y 경사 위). 레귤러면 경사 아래를 향한다 */
const frontFootAxis = (bodyHeading: number) => ({ x: Math.cos(bodyHeading), y: Math.sin(bodyHeading) });

/**
 * 하중 지점: 몸 무게중심이 두 발 사이 어디에 실렸는지에 따라 보드를 누르는 위치(반길이 단위, 앞발 방향 +).
 * 무게중심을 앞발 쪽으로 옮길수록 앞발 위치에, 뒤로 옮길수록 뒷발 위치에 가까워진다.
 */
/** 앞발에 실린 체중 비율 0 ~ 1 (0.5 = 양발에 고르게) */
const frontShare = (s: RiderState) => {
  const axis = frontFootAxis(s.bodyHeading);
  const toward = s.comSide * axis.x - s.comDown * axis.y;
  return Math.max(0, Math.min(1, (1 + toward) / 2));
};

export const pressurePoint = (s: RiderState, feet: FootSetup) => feet.back + (feet.front - feet.back) * frontShare(s);

/** 보드 폭 방향(앞발 방향을 반시계로 90°) 하중. + 면 그쪽으로 보드를 민다 */
const acrossLean = (s: RiderState) => {
  const axis = frontFootAxis(s.bodyHeading);
  return s.comSide * -axis.y + -s.comDown * axis.x;
};

export function stepRider(s: RiderState, input: RiderInput, dt: number, feet: FootSetup = DEFAULT_FEET): RiderEvent[] {
  if (s.wipeout) return [];
  const events: RiderEvent[] = [];
  let landingFailures: string[] | undefined;
  const airborne = s.z > 0 || s.vz > 0;

  // 몸: 목표 하중을 스프링·감쇠로 따라간다
  const target = bodyToWorld(s.bodyHeading, input.leanForward, input.leanSide);
  s.comVDown += (BODY_STIFFNESS * (target.down - s.comDown) - BODY_DAMPING * s.comVDown) * dt;
  s.comVSide += (BODY_STIFFNESS * (target.side - s.comSide) - BODY_DAMPING * s.comVSide) * dt;
  s.comDown += s.comVDown * dt;
  s.comSide += s.comVSide * dt;
  // 몸 회전은 공중에서만 보드와 따로 논다. 바닥에서는 아래에서 보드에 묶인다
  if (airborne) s.bodySpin += (input.bodyYaw * BODY_SPIN_RATE - s.bodySpin) * Math.min(1, 6 * dt);

  // 물에 대한 상대 속도: 내려갈수록 물을 세게 받아 보드 반응이 빨라진다
  const flowSpeed = 1 + Math.max(0, -s.vy);
  const broadside = Math.abs(Math.sin(s.boardHeading));

  // 경사가 급한 위쪽일수록 하중 이동이 크게 먹힌다: 위에서 앞으로 실으면 확 떨어지며 가속하고, 평평한 바닥에선 둔하다
  const steepness = slopeAngle(s.y) / SHEET.MAX_SLOPE;
  const pitchGain = 0.4 + 1.6 * steepness;
  const push = FLOW_PUSH + BROADSIDE_PUSH * broadside;
  // 지렛대: 하중 지점이 균형점보다 앞이면 노즈가 눌려 내려가고, 뒤면 노즈가 들려 올라간다.
  // 그 방향을 경사에 투영한 만큼만 경사 방향 힘이 된다 (스위치로 타면 반대)
  const axis = frontFootAxis(s.bodyHeading);
  const trim = pressurePoint(s, feet) - BOARD_BALANCE;
  const drive = (trim / LEVER_NORM) * -axis.y;
  const ay = push - G * Math.sin(slopeAngle(s.y)) - PITCH_FORCE * pitchGain * drive - DAMP_Y * s.vy;
  s.vy += ay * dt;
  s.y += s.vy * dt;
  if (s.y < 0) {
    s.y = 0;
    s.vy = Math.max(0, s.vy);
  }

  if (airborne) {
    // 찬 보드는 발에서 떨어져 점프 순간 받은 각속도 그대로 돈다 (공중에서 바꿀 수 없음).
    // 차지 않았으면 발이 보드를 누르고 있어 몸과 같이 돈다
    if (!s.boardKicked) s.boardSpin = s.bodySpin;
    s.flip += s.flipSpin * dt;
    s.vx -= DAMP_X * 0.2 * s.vx * dt;
  } else {
    // 보드 폭 방향 하중(엣지)은 물에 서서히 박힌다
    s.edge += (acrossLean(s) - s.edge) * Math.min(1, EDGE_ENGAGE_RATE * flowSpeed * dt);
    // 앞뒤 체중 배분: -1 = 뒷발에만, 0 = 고르게, +1 = 앞발에만
    const along = 2 * frontShare(s) - 1;
    const across = frontFootAxis(s.bodyHeading);

    // 양발에 고르게 실으면 엣지 방향으로 보드 방향 그대로 평행 이동한다
    const carveBoost = 1 + CARVE_SPEED_BOOST * Math.max(0, -s.vy);
    const lateral = LATERAL_FORCE * carveBoost * s.edge * (1 - Math.abs(along));
    s.vx += lateral * -across.y * dt;
    s.vy += lateral * across.x * dt;

    // 회전은 한 발에 체중이 쏠렸을 때만: 체중 실린 발이 축이 되고(아래 피벗), 빠진 쪽 끝이 엣지 방향으로 밀린다.
    // 뒷발에 싣고 밀면 노즈가, 앞발에 싣고 밀면 테일이 그쪽으로 간다
    // 뒤에 실어 노즈가 들리면 물에 잠긴 면이 줄어 더 잘 돈다
    const noseLift = Math.max(0, Math.min(1, -trim / LEVER_NORM));
    const steer = STEER_RATE * s.edge * -along * (1 + NOSE_LIFT_TURN_BOOST * noseLift);
    // 스핀 입력이 없으면 물살이 보드를 가까운 흐름 축(0 또는 π)으로 되돌린다. 트윈팁이라 sin(2θ)
    // 발이 붙어 있으니 보드만 돌리는 입력(yaw)은 먹히지 않고, 몸을 돌려야(bodyYaw) 보드째 돈다
    const twisting = Math.min(1, Math.abs(input.bodyYaw));
    const realign = WEATHERVANE * Math.sin(2 * s.boardHeading) / 2;
    const targetSpin = steer + input.bodyYaw * BODY_SPIN_RATE - realign * (1 - twisting);
    // 몸으로 비트는 스핀은 즉각적이고, 엣지로 도는 회전은 속도가 붙어야 빨라진다
    const response = twisting > 0.1 ? 8 : TURN_RESPONSE * flowSpeed;
    s.boardSpin += (targetSpin - s.boardSpin) * Math.min(1, response * dt);
    // 보드가 틀어져 있으면 자기 축을 따라 미끄러진다. 축은 heading 과 heading+π 가 같으므로 sin·cos(주기 π)
    // 내려오며 얻은 속도는 옆으로 치고 나가는 힘이 된다
    s.vx += (CARVE_FORCE * carveBoost * Math.sin(s.boardHeading) * Math.cos(s.boardHeading) - DAMP_X * s.vx) * dt;
  }
  // 바닥에서는 보드가 하중 지점을 축으로 돈다: 뒷발에 실으면 테일 피벗, 앞발에 실으면 중심 근처에서 돈다
  if (!airborne) {
    const pivot = pressurePoint(s, feet) * BOARD_HALF_LENGTH;
    const before = frontFootAxis(s.bodyHeading);
    const after = frontFootAxis(s.bodyHeading + s.boardSpin * dt);
    s.x += pivot * (before.x - after.x);
    s.y += pivot * (before.y - after.y);
  }
  s.boardHeading += s.boardSpin * dt;
  if (airborne) {
    s.bodyHeading += s.bodySpin * dt;
  } else {
    // 발이 보드에 붙어 있다
    s.bodySpin = s.boardSpin;
    s.bodyHeading = s.boardHeading + s.stance;
  }
  s.boardRotation += s.boardSpin * dt;
  s.bodyRotation += s.bodySpin * dt;

  s.x += s.vx * dt;
  const halfW = SHEET.WIDTH / 2;
  if (Math.abs(s.x) > halfW) {
    s.x = Math.sign(s.x) * halfW;
    s.vx *= -0.3;
  }

  // 점프
  if (!airborne && input.pop) {
    s.vz = POP_BASE + POP_CROUCH * input.crouch;
    // 샤빗: 뛰어오르는 순간 발로 보드를 차서 준 토크만큼만 보드가 돈다
    // 킥플립: 같은 순간 보드 모서리를 차서 준 토크만큼만 뒤집힌다. 깊이 웅크렸을수록 세게 찬다
    const kick = 0.5 + 0.5 * input.crouch;
    s.boardKicked = Math.abs(input.yaw) > 0.05 || Math.abs(input.flip) > 0.05;
    s.boardSpin += input.yaw * SHOVE_IMPULSE * kick;
    s.flipSpin = input.flip * FLIP_IMPULSE * kick;
    s.flip = 0;
    // 바닥에서 돌던 게 마감되기 전에 뛰어도 서피스 회전은 인정한다.
    // 아직 정렬 전이라 반올림 대신, 거의 다 돈(LAND_TOLERANCE 이내로 모자란) 180 만 센다
    const body = completedHalfTurns(s.bodyRotation);
    const shove = completedHalfTurns(s.boardRotation - s.bodyRotation);
    if (body >= 0.5 || shove >= 0.5) events.push({ type: 'surface-spin', ...rotationSummary(s), body, shove, flips: 0 });
    s.boardRotation = 0;
    s.bodyRotation = 0;
  }
  if (s.z > 0 || s.vz > 0) {
    s.vz -= G * dt;
    s.z += s.vz * dt;
    if (s.z <= 0) {
      s.z = 0;
      s.vz = 0;
      // 보드가 흐름에 비스듬해도 괜찮다. 발이 보드 위에 옆으로 설 수 있는 각도이고 무게중심이 가운데 가까우면 선다.
      // 비스듬히 선 뒤 아래쪽 레일에 무게가 실리면 레일 파고듦(edge-catch)이 이어받는다
      const rel = Math.atan2(Math.sin(s.bodyHeading - s.boardHeading), Math.cos(s.bodyHeading - s.boardHeading));
      const footError = Math.abs(Math.abs(rel) - Math.PI / 2);
      // 보드가 다시 바로 서 있어야 한다 (뒤집혔거나 옆으로 섰으면 실패)
      const flipError = Math.abs(Math.atan2(Math.sin(s.flip), Math.cos(s.flip)));
      const offCenter = Math.hypot(s.comDown, s.comSide);
      const failures: string[] = [];
      if (footError > LAND_TOLERANCE) failures.push(`발이 보드와 ${deg(footError)}° 어긋남 (허용 ${deg(LAND_TOLERANCE)}°)`);
      if (flipError > FLIP_LAND_TOLERANCE) failures.push(`보드가 ${deg(flipError)}° 기울어 있음 (허용 ${deg(FLIP_LAND_TOLERANCE)}°)`);
      if (offCenter > LAND_BALANCE_LIMIT) {
        const dir =
          Math.abs(s.comDown) >= Math.abs(s.comSide) ? (s.comDown > 0 ? '경사 아래' : '경사 위') : s.comSide > 0 ? '오른' : '왼';
        failures.push(`무게중심이 ${dir}쪽으로 치우침 ${offCenter.toFixed(2)} (허용 ${LAND_BALANCE_LIMIT})`);
      }
      if (failures.length > 0) {
        s.wipeout = 'bad-landing';
        landingFailures = failures;
      } else {
        s.stance = Math.sign(rel) * (Math.PI / 2);
        s.boardKicked = false;
        s.bodyHeading = s.boardHeading + s.stance;
        s.bodySpin = 0;
        events.push({ type: 'land', ...rotationSummary(s) });
        s.flip = 0;
        s.flipSpin = 0;
        s.boardSpin = 0;
        s.boardRotation = 0;
        s.bodyRotation = 0;
      }
    }
  } else {
    // 레일 파고듦: 아래쪽 레일에 실린 실제 하중이 허용치를 넘으면 쌓이고, 아니면 회복
    const excess = downhillRailLoad(s.boardHeading, s.comDown, s.comSide) - RAIL_LOAD_TOLERANCE;
    s.edgeLoad = Math.max(0, s.edgeLoad + (excess > 0 ? excess * RAIL_DIG_RATE : -RAIL_RECOVER_RATE) * dt);
    if (s.edgeLoad >= 1) s.wipeout = 'edge-catch';

    // 바닥 회전 집계: 보드가 흐름 방향으로 다시 정렬되고 몸도 멈추면 마감
    if (offAxis(s.boardHeading) < 0.25 && Math.abs(s.boardSpin) < 1.5 && Math.abs(s.bodySpin) < 0.5) {
      const r = rotationSummary(s);
      if (r.body >= 0.5 || r.shove >= 0.5) events.push({ type: 'surface-spin', ...r });
      s.boardRotation = 0;
      s.bodyRotation = 0;
    }
  }

  if (Math.hypot(s.comDown, s.comSide) > BALANCE_LIMIT) s.wipeout = 'off-balance';
  if (s.y > SHEET.LENGTH) s.wipeout = 'over-the-top';

  if (s.wipeout) events.push({ type: 'wipeout', reason: s.wipeout, details: landingFailures });
  return events;
}
