import { BOARD_HALF_LENGTH, DEFAULT_FEET, type FootSetup } from '../physics/rider';

/** 두 발 사이 최소 간격(반길이 단위, ≈ 20cm) */
const MIN_GAP = 0.3;

const cm = (u: number) => Math.round(u * BOARD_HALF_LENGTH * 100);
const describe = (u: number) => {
  const d = cm(u);
  if (Math.abs(d) <= 2) return '중심';
  if (u <= -0.95 || u >= 0.95) return `${d > 0 ? '노즈' : '테일'} 끝 (${Math.abs(d)}cm)`;
  return `중심에서 ${d > 0 ? '앞' : '뒤'} ${Math.abs(d)}cm`;
};

/**
 * 발 위치 설정 패널. 반환한 객체를 바로 고치므로 물리·렌더러가 같은 객체를 보면 즉시 반영된다.
 * 포인터가 잠겨 있으면 조작할 수 없으니 ESC 로 잠금을 풀고 바꾼다.
 */
export function createFeetPanel(): FootSetup {
  const feet: FootSetup = { ...DEFAULT_FEET };

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <h2>발 위치</h2>
    <label>앞발 <output data-for="front"></output>
      <input type="range" data-key="front" min="-0.3" max="0.9" step="0.05">
    </label>
    <label>뒷발 <output data-for="back"></output>
      <input type="range" data-key="back" min="-1" max="0" step="0.05">
    </label>
    <p class="hint">스탠스 너비 <output data-for="width"></output></p>
    <button type="button">실제 플로우보드 기본값</button>
    <p class="hint">ESC 로 잠금을 풀고 조절</p>
  `;
  document.body.appendChild(panel);

  const inputs = panel.querySelectorAll<HTMLInputElement>('input[type=range]');
  const sync = () => {
    inputs.forEach((el) => (el.value = String(feet[el.dataset.key as keyof FootSetup])));
    panel.querySelector('output[data-for=front]')!.textContent = describe(feet.front);
    panel.querySelector('output[data-for=back]')!.textContent = describe(feet.back);
    panel.querySelector('output[data-for=width]')!.textContent = `${cm(feet.front - feet.back)}cm`;
  };

  inputs.forEach((el) =>
    el.addEventListener('input', () => {
      const key = el.dataset.key as keyof FootSetup;
      const v = Number(el.value);
      // 두 발이 겹치거나 뒤집히지 않게, 움직인 쪽을 멈춘다
      feet[key] = key === 'front' ? Math.max(v, feet.back + MIN_GAP) : Math.min(v, feet.front - MIN_GAP);
      sync();
    }),
  );
  panel.querySelector('button')!.addEventListener('click', () => {
    Object.assign(feet, DEFAULT_FEET);
    sync();
  });

  sync();
  return feet;
}
