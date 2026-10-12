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
const trickName = (r: Rotation) => {
  const parts = [];
  if (r.body >= 0.5) parts.push(`${r.body * 360}`);
  if (r.shove >= 0.5) parts.push(`샤빗 ${r.shove * 360}`);
  return `${r.fakie ? '페이키 ' : ''}${parts.join(' + ')}`;
};
const trickValue = (r: Rotation) => Math.round(r.body * 2) * 25 + Math.round(r.shove * 2) * 20;

const FIXED_DT = 1 / 120;

let rider = createRider();
let score = 0;
let message: string | null = null;
let messageTimer = 0;
let resetTimer = 0;
let accumulator = 0;
let last = performance.now();

const flash = (text: string, seconds = 1.2) => {
  message = text;
  messageTimer = seconds;
};

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
          flash(WIPEOUT_TEXT[ev.reason], 1.5);
          resetTimer = 1.5;
        }
      }
      accumulator -= FIXED_DT;
    }
  }

  if (resetTimer > 0) {
    resetTimer -= dt;
    if (resetTimer <= 0) {
      rider = createRider();
      score = 0;
    }
  }
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) message = null;
  }

  renderer.render(rider, { locked: input.locked, cop: input.centerOfPressure, input: rawInput, score, message, feet }, dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
