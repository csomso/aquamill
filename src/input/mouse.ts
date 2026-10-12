import { worldToBody } from '../physics/rider';
import type { InputContext, InputSource, RiderInput } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 마우스 = 목표 무게중심. 화면 방향 그대로다(아래 = 경사 아래, 위 = 경사 위, 좌우 = 좌우).
 * 몸이 돌아가도 화면 기준이 유지되도록 read() 에서 몸 기준으로 변환해 넘긴다.
 * - 웅크린 채 우클릭 드래그 좌우 / 휠: 샤빗 토크 감기(yaw). 웅크리는 동안은 줄지 않고, 점프하는 순간 보드에 실린다
 * - Shift + 우클릭 드래그 / Shift + 휠: 몸 돌리기(bodyYaw, 보드도 같이)
 * - 좌클릭 누름: 웅크림, 뗌: pop
 * 입력이 없으면 목표 무게중심이 중앙으로 천천히 돌아온다.
 */
export class MouseInput implements InputSource {
  private cop = { x: 0, y: 0 };
  private yaw = 0;
  private bodyYaw = 0;
  private crouch = 0;
  private crouching = false;
  private popQueued = false;
  private spinning = false;

  /** 픽셀 → 정규화 감도 */
  sensitivity = 0.006;
  /** 초당 중앙 복원 비율 */
  springRate = 0.35;
  yawDecay = 6;

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
    if (!this.crouching) this.yaw *= Math.exp(-this.yawDecay * dt);
    this.bodyYaw *= Math.exp(-this.yawDecay * dt);

    if (this.crouching) this.crouch = Math.min(1, this.crouch + dt * 2.5);

    const pop = this.popQueued;
    const crouch = this.crouch;
    const yaw = this.yaw;
    if (pop) {
      this.popQueued = false;
      this.crouch = 0;
      this.yaw = 0;
    }

    const lean = worldToBody(ctx.bodyHeading, this.cop.y, this.cop.x);
    return { leanForward: lean.forward, leanSide: lean.side, yaw, bodyYaw: this.bodyYaw, crouch, pop };
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
      const torque = e.movementX * this.sensitivity * 1.5;
      if (e.shiftKey) this.bodyYaw = clamp(this.bodyYaw + torque, -1, 1);
      else this.yaw = clamp(this.yaw + torque, -1, 1);
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
    if (e.button === 2) this.spinning = true;
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
    const torque = Math.sign(e.deltaY) * 0.35;
    if (e.shiftKey) this.bodyYaw = clamp(this.bodyYaw + torque, -1, 1);
    else this.yaw = clamp(this.yaw + torque, -1, 1);
  };
}
