import { MouseInput } from './input/mouse';
import { neutralInput } from './input/types';
import { createRider, stepRider, type Rotation, type WipeoutReason } from './physics/rider';
import { CanvasRenderer } from './render/canvas';
import { createFeetPanel } from './ui/feetPanel';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas);
const input = new MouseInput(canvas);
const feet = createFeetPanel();

const WIPEOUT_TEXT: Record<WipeoutReason, string> = {
  'over-the-top': '크레스트 너머로 넘어감!',
  'bad-landing': '착지 실패!',
  'edge-catch': '엣지 걸림!',
  'off-balance': '균형 잃음!',
};

/** 예: "180", "샤빗 360", "180 + 샤빗 180", 앞에 "페이키" */
/** 플립 이름: 킥플립 / 힐플립 / 더블 킥플립, 샤빗과 합치면 배리얼·트레 플립 */
const flipName = (r: Rotation) => {
  const n = Math.abs(r.flips);
  const base = r.flips > 0 ? '킥플립' : '힐플립';
  const count = n === 2 ? '더블 ' : n >= 3 ? `${n}× ` : '';
  if (n === 1 && r.shove === 0.5) return `배리얼 ${base}`;
  if (n === 1 && r.shove === 1 && r.flips > 0) return '트레 플립';
  return `${count}${base}`;
};
const trickName = (r: Rotation) => {
  const parts = [];
  if (r.body >= 0.5) parts.push(`${r.body * 360}`);
  // 배리얼/트레 플립은 이름에 샤빗이 들어 있다
  const named = Math.abs(r.flips) === 1 && (r.shove === 0.5 || (r.shove === 1 && r.flips > 0));
  if (r.shove >= 0.5 && !named) parts.push(`샤빗 ${r.shove * 360}`);
  if (r.flips !== 0) parts.push(flipName(r));
  return `${r.fakie ? '페이키 ' : ''}${parts.join(' + ')}`;
};
const trickValue = (r: Rotation) => Math.round(r.body * 2) * 25 + Math.round(r.shove * 2) * 20 + Math.abs(r.flips) * 30;

const FIXED_DT = 1 / 120;

let rider = createRider();
let score = 0;
let message: string | null = null;
let messageTimer = 0;
let resetTimer = 0;
/** 넘어진 뒤 이 시간이 지나면 클릭으로 바로 다시 시작할 수 있다(넘어지는 순간의 클릭이 스킵되지 않게) */
const SKIP_DELAY = 0.3;
let resetDuration = 0;
let accumulator = 0;
let last = performance.now();

const flash = (text: string, seconds = 1.2) => {
  message = text;
  messageTimer = seconds;
};

const restart = () => {
  rider = createRider();
  score = 0;
  resetTimer = 0;
  message = null;
  messageTimer = 0;
  input.reset();
};

// MouseInput 의 mousedown 보다 뒤에 등록되므로, 이 클릭으로 시작된 웅크림은 reset() 이 지운다
document.addEventListener('mousedown', () => {
  if (input.locked && resetTimer > 0 && resetDuration - resetTimer >= SKIP_DELAY) restart();
});

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const rawInput = input.locked ? input.read(dt, { bodyHeading: rider.bodyHeading }) : neutralInput();

  if (input.locked) {
    accumulator += dt;
    let popConsumed = false;
    while (accumulator >= FIXED_DT) {
      const stepInput = popConsumed ? { ...rawInput, pop: false } : rawInput;
      popConsumed ||= rawInput.pop;
      for (const ev of stepRider(rider, stepInput, FIXED_DT, feet)) {
        if (ev.type === 'land') {
          const gained = 10 + trickValue(ev);
          score += gained;
          flash(`${trickName(ev)} 착지 +${gained}`.trim());
        } else if (ev.type === 'surface-spin') {
          const gained = trickValue(ev);
          score += gained;
          flash(`서피스 ${trickName(ev)} +${gained}`);
        } else {
          const text = [WIPEOUT_TEXT[ev.reason], ...(ev.details ?? [])].join('\n');
          const seconds = ev.details ? 3 : 1.5;
          flash(text, seconds);
          resetTimer = seconds;
          resetDuration = seconds;
        }
      }
      accumulator -= FIXED_DT;
    }
  }

  if (resetTimer > 0) {
    resetTimer -= dt;
    if (resetTimer <= 0) restart();
  }
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) message = null;
  }

  renderer.render(rider, { locked: input.locked, cop: input.centerOfPressure, input: rawInput, score, message, feet }, dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
