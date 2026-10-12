/**
 * 장치 독립적인 라이더 입력. 물리 엔진은 이것만 본다.
 * 마우스 / 터치(두 엄지) / 웹캠 포즈 추정은 각각 어댑터로 이 형태를 만들어낸다.
 */
export interface RiderInput {
  /**
   * 목표 앞뒤 하중(몸 기준). +1 = 몸이 바라보는 쪽, -1 = 등 쪽.
   * 실제 무게중심은 물리 엔진에서 이 목표를 시간을 두고 따라간다.
   */
  leanForward: number;
  /** 목표 좌우 하중(몸 기준). +1 = 몸의 오른쪽 */
  leanSide: number;
  /** 발로 보드만 비트는 토크(샤빗). -1 ~ 1 */
  yaw: number;
  /** 몸을 돌리는 토크. 보드도 함께 돈다. -1 ~ 1 */
  bodyYaw: number;
  /** 웅크림 정도 0 ~ 1. 떼는 순간 pop 으로 변환된다 */
  crouch: number;
  /** 이번 프레임에 점프를 시도했는지 (crouch 를 놓은 순간) */
  pop: boolean;
}

/** 화면 기준 장치가 몸 기준으로 변환할 때 필요한 라이더 상태 */
export interface InputContext {
  bodyHeading: number;
}

export interface InputSource {
  /** 매 프레임 호출. dt 는 초 단위 */
  read(dt: number, ctx: InputContext): RiderInput;
  dispose(): void;
}

export const neutralInput = (): RiderInput => ({ leanForward: 0, leanSide: 0, yaw: 0, bodyYaw: 0, crouch: 0, pop: false });
