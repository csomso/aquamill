import { MouseInput } from './input/mouse';
import { neutralInput } from './input/types';
import { createRider, stepRider, type WipeoutReason } from './physics/rider';
import { CanvasRenderer } from './render/canvas';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas);
const input = new MouseInput(canvas);

const WIPEOUT_TEXT: Record<WipeoutReason, string> = {
  'over-the-top': '크레스트 너머로 넘어감!',
  'bad-landing': '착지 실패!',
  'edge-catch': '엣지 걸림!',
};

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

  const rawInput = input.locked ? input.read(dt) : neutralInput();

  if (input.locked) {
    accumulator += dt;
    let popConsumed = false;
    while (accumulator >= FIXED_DT) {
      const stepInput = popConsumed ? { ...rawInput, pop: false } : rawInput;
      popConsumed ||= rawInput.pop;
      for (const ev of stepRider(rider, stepInput, FIXED_DT)) {
        if (ev.type === 'land') {
          const spin = ev.rotations >= 0.5 ? `${ev.rotations * 360} ` : '';
          const gained = 10 + Math.round(ev.rotations * 2) * 25;
          score += gained;
          flash(`${spin}${ev.fakie ? '페이키 ' : ''}착지 +${gained}`);
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

  renderer.render(rider, { locked: input.locked, cop: input.centerOfPressure, input: rawInput, score, message }, dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
