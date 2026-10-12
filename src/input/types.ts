/**
 * 장치 독립적인 라이더 입력. 물리 엔진은 이것만 본다.
 * 마우스 / 터치(두 엄지) / 웹캠 포즈 추정은 각각 어댑터로 이 형태를 만들어낸다.
 */
export interface RiderInput {
  /**
   * 경사 방향 하중(월드 기준). +1 = 경사 아래(라이더가 바라보는 쪽), -1 = 경사 위.
   * 보드가 돌아가도 기준은 그대로다. 서피스 360 중에도 상체는 아래를 바라보므로.
   */
  leanForward: number;
  /** 좌우 하중(월드 기준). +1 = 화면 오른쪽 */
  leanSide: number;
  /** 비틀림 토크(스핀). -1 ~ 1 */
  yaw: number;
  /** 웅크림 정도 0 ~ 1. 떼는 순간 pop 으로 변환된다 */
  crouch: number;
  /** 이번 프레임에 점프를 시도했는지 (crouch 를 놓은 순간) */
  pop: boolean;
}

export interface InputSource {
  /** 매 프레임 호출. dt 는 초 단위 */
  read(dt: number): RiderInput;
  dispose(): void;
}

export const neutralInput = (): RiderInput => ({ leanForward: 0, leanSide: 0, yaw: 0, crouch: 0, pop: false });
