import { worldToBody } from '../physics/rider';
import type { InputContext, InputSource, RiderInput } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 마우스 = 목표 무게중심. 화면 방향 그대로다(아래 = 경사 아래, 위 = 경사 위, 좌우 = 좌우).
 * 몸이 돌아가도 화면 기준이 유지되도록 read() 에서 몸 기준으로 변환해 넘긴다.
 * - 웅크린 채 우클릭 드래그 좌우 / 휠: 샤빗 토크 감기(yaw). 웅크리는 동안은 줄지 않고, 점프하는 순간 보드에 실린다
 * - 웅크린 채 우클릭 드래그 위/아래: 플립 토크 감기(flip). 위 = 킥플립, 아래 = 힐플립. 대각선이면 샤빗과 같이(배리얼)
 *   한 축으로 크게 끌면 그동안 다른 축 역치가 올라가 살짝 흔들린 건 무시된다
 * - Shift + 우클릭 드래그 / Shift + 휠: 몸 돌리기(bodyYaw, 보드도 같이)
 * - 좌클릭 누름: 웅크림, 뗌: pop
 * 입력이 없으면 목표 무게중심이 중앙으로 천천히 돌아온다.
 */
export class MouseInput implements InputSource {
  private cop = { x: 0, y: 0 };
  private yaw = 0;
  private flip = 0;
  private bodyYaw = 0;
  private crouch = 0;
  private crouching = false;
  private popQueued = false;
  private spinning = false;
  /** 감기 드래그의 축별 최근 이동량(px). 시간이 지나면 줄어든다 */
  private burst = { x: 0, y: 0 };
  private lastMoveTime = 0;

  /** 픽셀 → 정규화 감도 */
  sensitivity = 0.006;
  /** 초당 중앙 복원 비율 */
  springRate = 0.35;
  yawDecay = 6;
  /** 샤빗 토크 감기 감도. 끝까지 감으려면 약 330px 끌어야 한다 */
  windupSensitivity = 0.003;
  windupPerWheel = 0.15;
  /** 최근 이동량이 줄어드는 시간 상수(초) */
  burstTau = 0.12;
  /** 한 축의 최근 이동량이 이보다 크면 '크게 찼다'로 보고 다른 축 역치를 올린다(px) */
  burstStart = 30;
  /** 큰 이동량 중 이 비율만큼 다른 축 역치가 올라간다 */
  crossThreshold = 0.35;
  /**
   * 감아둔 전체 양 기준으로, 작은 축이 큰 축의 이 비율보다 작으면 0으로 친다.
   * 넘는 부분은 다시 늘려서 정확한 대각선(배리얼)은 그대로 다 들어간다
   */
  crossDeadzone = 0.2;

  constructor(private readonly target: HTMLElement) {
    target.addEventListener('click', this.onClick);
    target.addEventListener('contextmenu', this.preventDefault);
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mousedown', this.onDown);
    document.addEventListener('mouseup', this.onUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  /** HUD 표시용 */
  get centerOfPressure(): Readonly<{ x: number; y: number }> {
    return this.cop;
  }

  read(dt: number, ctx: InputContext): RiderInput {
    const k = Math.exp(-this.springRate * dt);
    this.cop.x *= k;
    this.cop.y *= k;
    // 웅크리는 동안 감아둔 샤빗 토크는 점프할 때까지 유지
    if (!this.crouching) {
      this.yaw *= Math.exp(-this.yawDecay * dt);
      this.flip *= Math.exp(-this.yawDecay * dt);
    }
    this.bodyYaw *= Math.exp(-this.yawDecay * dt);

    if (this.crouching) this.crouch = Math.min(1, this.crouch + dt * 2.5);

    const pop = this.popQueued;
    const crouch = this.crouch;
    const yaw = this.suppressMinor(this.yaw, this.flip);
    const flip = this.suppressMinor(this.flip, this.yaw);
    if (pop) {
      this.popQueued = false;
      this.crouch = 0;
      this.yaw = 0;
      this.flip = 0;
    }

    const lean = worldToBody(ctx.bodyHeading, this.cop.y, this.cop.x);
    return { leanForward: lean.forward, leanSide: lean.side, yaw, flip, bodyYaw: this.bodyYaw, crouch, pop };
  }

  /** 천천히 끌기 시작할 때 섞여 들어간 작은 흔들림까지 걸러낸다 */
  private suppressMinor(v: number, other: number): number {
    const dz = this.crossDeadzone * Math.abs(other);
    if (Math.abs(v) <= dz) return 0;
    if (Math.abs(v) >= Math.abs(other)) return v;
    return Math.sign(v) * ((Math.abs(v) - dz) / (Math.abs(other) - dz)) * Math.abs(other);
  }

  dispose(): void {
    this.target.removeEventListener('click', this.onClick);
    this.target.removeEventListener('contextmenu', this.preventDefault);
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mousedown', this.onDown);
    document.removeEventListener('mouseup', this.onUp);
    document.removeEventListener('wheel', this.onWheel);
  }

  private onClick = () => {
    if (!this.locked) this.target.requestPointerLock();
  };

  private preventDefault = (e: Event) => e.preventDefault();

  private onMove = (e: MouseEvent) => {
    if (!this.locked) return;
    if (this.spinning) {
      if (e.shiftKey) this.bodyYaw = clamp(this.bodyYaw + e.movementX * this.sensitivity * 1.5, -1, 1);
      else {
        // 한 축으로 크게 차는 중에 다른 축이 조금 흔들린 건 버린다. 대각선으로 같이 크게 끌면 둘 다 들어간다(배리얼)
        const decay = Math.exp(-Math.max(0, e.timeStamp - this.lastMoveTime) / 1000 / this.burstTau);
        this.lastMoveTime = e.timeStamp;
        this.burst.x = this.burst.x * decay + Math.abs(e.movementX);
        this.burst.y = this.burst.y * decay + Math.abs(e.movementY);
        const thresholdX = this.crossThreshold * Math.max(0, this.burst.y - this.burstStart);
        const thresholdY = this.crossThreshold * Math.max(0, this.burst.x - this.burstStart);
        if (this.burst.x > thresholdX) this.yaw = clamp(this.yaw + e.movementX * this.windupSensitivity, -1, 1);
        if (this.burst.y > thresholdY) this.flip = clamp(this.flip - e.movementY * this.windupSensitivity, -1, 1);
      }
      return;
    }
    this.cop.x += e.movementX * this.sensitivity;
    this.cop.y += e.movementY * this.sensitivity;
    // 원 안으로 제한: 대각선이라고 더 멀리 실리지 않게
    const r = Math.hypot(this.cop.x, this.cop.y);
    if (r > 1) {
      this.cop.x /= r;
      this.cop.y /= r;
    }
  };

  private onDown = (e: MouseEvent) => {
    if (!this.locked) return;
    if (e.button === 0) this.crouching = true;
    if (e.button === 2) {
      this.spinning = true;
      this.burst.x = 0;
      this.burst.y = 0;
    }
  };

  private onUp = (e: MouseEvent) => {
    if (e.button === 0 && this.crouching) {
      this.crouching = false;
      this.popQueued = this.crouch > 0.15;
      if (!this.popQueued) this.crouch = 0;
    }
    if (e.button === 2) this.spinning = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    const dir = Math.sign(e.deltaY);
    if (e.shiftKey) this.bodyYaw = clamp(this.bodyYaw + dir * 0.35, -1, 1);
    else this.yaw = clamp(this.yaw + dir * this.windupPerWheel, -1, 1);
  };
}
