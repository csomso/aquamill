import type { RiderInput } from '../input/types';
import { SHEET, slopeAngle, type RiderState } from '../physics/rider';

const BOARD_LEN = 1.3;
const BOARD_W = 0.45;
/** 무게중심 1 이 화면에서 보드 중심으로부터 떨어지는 거리(m) */
const COM_REACH = 0.35;

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
    this.drawHud(s, hud);
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
    ctx.rotate(-s.boardHeading); // heading+ = +x(화면 오른쪽)로 돈다
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, (BOARD_W / 2) * this.scale, (BOARD_LEN / 2) * this.scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 보드 (공중에선 위로 띄워 그림)
    ctx.save();
    ctx.translate(px, py - s.z * this.scale * 0.6);
    ctx.rotate(-s.boardHeading); // heading+ = +x(화면 오른쪽)로 돈다
    ctx.scale(lift, lift);
    // 레일이 물에 파고들수록 빨갛게
    ctx.fillStyle = s.wipeout ? '#c0392b' : `hsl(${34 - s.edgeLoad * 34}, 100%, ${64 - s.edgeLoad * 14}%)`;
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 2;
    const bw = BOARD_W * this.scale;
    const bl = BOARD_LEN * this.scale;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bl / 2, bw, bl, bw / 2);
    ctx.fill();
    ctx.stroke();
    // 트윈팁: 앞뒤 구분 없이 양 끝에 같은 표시
    ctx.fillStyle = 'rgba(27,27,27,0.5)';
    for (const end of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(0, end * (bl / 2 - bw * 0.35), bw * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    this.drawBody(s, px, py - s.z * this.scale * 0.6, lift);
  }

  /**
   * 몸: 옆으로 선 자세. 발은 보드 위(보드 길이 방향 앞뒤), 상체는 실제 무게중심 쪽으로 쏠린다.
   * 로컬 좌표에서 +y 가 가슴 방향, x 축이 어깨선(= 보드 길이 방향).
   */
  private drawBody(s: RiderState, px: number, py: number, lift: number) {
    const { ctx } = this;
    const k = this.scale;

    // 발: 몸 방향 기준으로 어깨선 위 앞뒤
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-s.bodyHeading);
    ctx.scale(lift, lift);
    ctx.fillStyle = '#2f3542';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 0.25 * k, 0, 0.07 * k, 0.12 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 상체: 어깨선 + 머리(가슴 쪽으로 살짝)
    ctx.save();
    ctx.translate(px + s.comSide * COM_REACH * k, py + s.comDown * COM_REACH * k);
    ctx.rotate(-s.bodyHeading);
    ctx.scale(lift, lift);
    ctx.strokeStyle = '#2f3542';
    ctx.lineWidth = 0.14 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.22 * k, 0);
    ctx.lineTo(0.22 * k, 0);
    ctx.stroke();
    ctx.fillStyle = '#f1c27d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0.06 * k, 0.1 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 코: 바라보는 방향 표시
    ctx.fillStyle = '#2f3542';
    ctx.beginPath();
    ctx.arc(0, 0.15 * k, 0.025 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawHud(s: RiderState, hud: Hud) {
    const { ctx } = this;
    const W = window.innerWidth;
    const H = window.innerHeight;

    // 압력중심 패드 (보드 탑뷰)
    const size = 120;
    const cx = W - size / 2 - 44;
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
    // 패드 안의 보드: 실제 보드와 같이 돌아서, 무게가 어느 레일에 실렸는지 보인다
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-s.boardHeading);
    ctx.strokeStyle = `rgba(255,${180 - s.edgeLoad * 180},${120 - s.edgeLoad * 120},0.8)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-size * 0.14, -size * 0.4, size * 0.28, size * 0.8, size * 0.14);
    ctx.stroke();
    ctx.restore();

    // 목표(마우스) = 주황 점, 실제 몸 무게중심 = 흰 고리. 둘 사이의 간격이 몸의 지연
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(cx + hud.cop.x * (size / 2), cy + hud.cop.y * (size / 2), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + s.comSide * (size / 2), cy + s.comDown * (size / 2), 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('경사 위', cx, cy - size / 2 - 6);
    ctx.fillText('경사 아래', cx, cy + size / 2 + 14);

    // 레일 파고듦 게이지
    const ex = cx + size / 2 + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ex, cy - size / 2, 10, size);
    ctx.fillStyle = '#ff4757';
    ctx.fillRect(ex, cy + size / 2 - s.edgeLoad * size, 10, s.edgeLoad * size);

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
    // 몸 회전 게이지
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cx - size / 2, cy - size / 2 - 44, size, 8);
    ctx.fillStyle = '#a29bfe';
    ctx.fillRect(cx, cy - size / 2 - 44, (hud.input.bodyYaw * size) / 2, 8);

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
        '마우스 아래/위: 경사 아래/위로 무게 (내려가기/올라가기)',
        '마우스 좌/우: 좌우로 무게 (카빙) — 몸이 따라오는 데 시간이 걸린다',
        '좌클릭 누르고 떼기: 웅크렸다 점프',
        '우클릭 드래그 또는 휠: 보드만 돌리기 (샤빗)',
        'Shift + 우클릭 드래그 또는 Shift + 휠: 몸 돌리기 (보드도 같이)',
        '보드가 돌 땐 무게를 경사 위에! 아래로 실으면 레일이 걸려 고꾸라짐',
        'ESC: 일시정지',
      ];
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 20 + i * 26));
    }
  }
}
