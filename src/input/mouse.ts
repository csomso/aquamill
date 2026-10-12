import type { InputSource, RiderInput } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 마우스 = 보드 위 압력중심(Center of Pressure).
 * - 이동: 위 = 앞발(pitch+), 좌우 = 힐/토(roll)
 * - 우클릭 드래그 좌우 / 휠: 스핀(yaw)
 * - 좌클릭 누름: 웅크림, 뗌: pop
 * 입력이 없으면 압력중심이 중앙으로 스프링처럼 돌아온다.
 */
export class MouseInput implements InputSource {
  private cop = { x: 0, y: 0 };
  private yaw = 0;
  private crouch = 0;
  private crouching = false;
  private popQueued = false;
  private spinning = false;

  /** 픽셀 → 정규화 감도 */
  sensitivity = 0.006;
  /** 초당 중앙 복원 비율 */
  springRate = 2.5;
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

  read(dt: number): RiderInput {
    const k = Math.exp(-this.springRate * dt);
    this.cop.x *= k;
    this.cop.y *= k;
    this.yaw *= Math.exp(-this.yawDecay * dt);

    if (this.crouching) this.crouch = Math.min(1, this.crouch + dt * 2.5);

    const pop = this.popQueued;
    const crouch = this.crouch;
    if (pop) {
      this.popQueued = false;
      this.crouch = 0;
    }

    return { pitch: -this.cop.y, roll: this.cop.x, yaw: this.yaw, crouch, pop };
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
      this.yaw = clamp(this.yaw + e.movementX * this.sensitivity * 1.5, -1, 1);
      return;
    }
    this.cop.x = clamp(this.cop.x + e.movementX * this.sensitivity, -1, 1);
    this.cop.y = clamp(this.cop.y + e.movementY * this.sensitivity, -1, 1);
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
    this.yaw = clamp(this.yaw + Math.sign(e.deltaY) * 0.35, -1, 1);
  };
}
