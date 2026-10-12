import type { RiderInput } from '../input/types';
import { SHEET, slopeAngle, type RiderState } from '../physics/rider';

const BOARD_LEN = 1.3;
const BOARD_W = 0.45;

export interface Hud {
  locked: boolean;
  cop: { x: number; y: number };
  input: RiderInput;
  score: number;
  message: string | null;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private flowPhase = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D를 사용할 수 없습니다');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 40;
    this.scale = Math.min((window.innerWidth - pad * 2) / SHEET.WIDTH, (window.innerHeight - pad * 2) / SHEET.LENGTH);
    this.ox = window.innerWidth / 2;
    this.oy = (window.innerHeight + SHEET.LENGTH * this.scale) / 2;
  }

  /** 월드(m) → 화면(px). 크레스트(y=LENGTH)가 화면 위쪽 */
  private sx = (x: number) => this.ox + x * this.scale;
  private sy = (y: number) => this.oy - y * this.scale;

  render(s: RiderState, hud: Hud, dt: number) {
    const { ctx } = this;
    ctx.fillStyle = '#0b1622';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    this.drawSheet(dt);
    this.drawRider(s);
    this.drawHud(hud);
  }

  private drawSheet(dt: number) {
    const { ctx } = this;
    const x0 = this.sx(-SHEET.WIDTH / 2);
    const w = SHEET.WIDTH * this.scale;
    const top = this.sy(SHEET.LENGTH);
    const h = SHEET.LENGTH * this.scale;

    // 경사가 급할수록 진한 파랑
    const grad = ctx.createLinearGradient(0, top + h, 0, top);
    for (let i = 0; i <= 10; i++) {
      const t = slopeAngle((i / 10) * SHEET.LENGTH) / SHEET.MAX_SLOPE;
      grad.addColorStop(i / 10, `hsl(${195 + t * 15}, 75%, ${62 - t * 30}%)`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x0, top, w, h);

    // 흐름 줄무늬: 물이 위로 흐른다
    this.flowPhase = (this.flowPhase + dt * 4) % 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 14; row++) {
      const y = ((row + this.flowPhase) / 14) * SHEET.LENGTH;
      for (let col = 0; col < 9; col++) {
        const x = -SHEET.WIDTH / 2 + ((col + 0.5 + (row % 2) * 0.5) / 9.5) * SHEET.WIDTH;
        ctx.beginPath();
        ctx.moveTo(this.sx(x), this.sy(y));
        ctx.lineTo(this.sx(x), this.sy(y + 0.35));
        ctx.stroke();
      }
    }

    // 크레스트 라인
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x0, top - 4, w, 6);
  }

  private drawRider(s: RiderState) {
    const { ctx } = this;
    const px = this.sx(s.x);
    const py = this.sy(s.y);
    const lift = 1 + s.z * 0.25;

    // 그림자
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-s.heading); // heading+ = 노즈가 +x(화면 오른쪽)로
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, (BOARD_W / 2) * this.scale, (BOARD_LEN / 2) * this.scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 보드 (공중에선 위로 띄워 그림)
    ctx.save();
    ctx.translate(px, py - s.z * this.scale * 0.6);
    ctx.rotate(-s.heading); // heading+ = 노즈가 +x(화면 오른쪽)로
    ctx.scale(lift, lift);
    ctx.fillStyle = s.wipeout ? '#c0392b' : '#ffb347';
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 2;
    const bw = BOARD_W * this.scale;
    const bl = BOARD_LEN * this.scale;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bl / 2, bw, bl, bw / 2);
    ctx.fill();
    ctx.stroke();
    // 노즈 표시 (heading 0 = 화면 아래)
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(0, bl / 2 - bw * 0.35, bw * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawHud(hud: Hud) {
    const { ctx } = this;
    const W = window.innerWidth;
    const H = window.innerHeight;

    // 압력중심 패드 (보드 탑뷰)
    const size = 120;
    const cx = W - size / 2 - 24;
    const cy = H - size / 2 - 24;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
    ctx.beginPath();
    ctx.moveTo(cx, cy - size / 2);
    ctx.lineTo(cx, cy + size / 2);
    ctx.moveTo(cx - size / 2, cy);
    ctx.lineTo(cx + size / 2, cy);
    ctx.stroke();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(cx + hud.cop.x * (size / 2), cy + hud.cop.y * (size / 2), 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('뒷발', cx, cy - size / 2 - 6);
    ctx.fillText('앞발', cx, cy + size / 2 + 14);

    // 웅크림 / 스핀 게이지
    const gx = cx - size / 2 - 22;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(gx, cy - size / 2, 10, size);
    ctx.fillStyle = '#7bed9f';
    ctx.fillRect(gx, cy + size / 2 - hud.input.crouch * size, 10, hud.input.crouch * size);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cx - size / 2, cy - size / 2 - 32, size, 8);
    ctx.fillStyle = '#70a1ff';
    ctx.fillRect(cx, cy - size / 2 - 32, (hud.input.yaw * size) / 2, 8);

    ctx.textAlign = 'left';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`점수 ${hud.score}`, 24, 36);

    if (hud.message) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 32px system-ui, sans-serif';
      ctx.fillText(hud.message, W / 2, H * 0.3);
    }

    if (!hud.locked) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText('클릭해서 시작', W / 2, H / 2 - 60);
      ctx.font = '16px system-ui, sans-serif';
      const lines = [
        '마우스 아래/위: 앞발/뒷발 하중 (내려가기/올라가기)',
        '마우스 좌/우: 힐/토 엣지 (카빙)',
        '좌클릭 누르고 떼기: 웅크렸다 점프',
        '우클릭 드래그 또는 휠: 스핀',
        'ESC: 일시정지',
      ];
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 10 + i * 26));
    }
  }
}
