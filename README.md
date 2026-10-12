# Aquamill

웹 기반 실내서핑(시트 웨이브 / 플로우보딩) 프로토타입.

```bash
npm install
npm run dev
```

## 조작 (마우스 = 무게중심, 화면 기준)

| 입력 | 동작 |
|---|---|
| 마우스 아래/위 | 앞/뒤 하중 — 경사 아래로 내려가기 / 위로 올라가기 |
| 마우스 좌/우 | 좌우 하중 — 카빙 |
| 좌클릭 누르고 떼기 | 웅크렸다 점프 (오래 누를수록 높게) |
| 우클릭 드래그 / 휠 | 스핀 |

하중은 보드가 아닌 화면(월드) 기준이다. 서피스 360 중에도 상체는 경사 아래를 바라보기 때문.

- 뒤로 너무 실으면 크레스트 너머로 넘어간다.
- 보드가 돌아간 상태에서 무게를 앞(경사 아래)에 실으면 물을 맞는 레일이 파고들어 고꾸라진다 (HUD 빨간 게이지).
  무게를 중앙~뒤에 두면 물살이 보드를 다시 정렬시켜 서피스 360 으로 마무리된다.

## 구조

```
src/input/types.ts    RiderInput — 장치 독립 입력 계약 (leanForward, leanSide, yaw, crouch, pop)
src/input/mouse.ts    마우스 어댑터 (Pointer Lock, 중앙 복원 스프링)
src/physics/rider.ts  시트 웨이브 위 보드 물리 (고정 스텝 120Hz)
src/render/canvas.ts  Canvas 2D 탑뷰 렌더러 + HUD
src/main.ts           게임 루프
```

물리 엔진은 `RiderInput`만 본다. 새 입력 장치는 `InputSource`를 구현하는 어댑터만 추가하면 된다.

- 모바일: 두 엄지 = 두 발. 같은 방향으로 밀면 roll, 반대 방향이면 yaw
- 웹캠: MediaPipe Pose로 골반·어깨 중심을 압력중심으로, 무릎 굽힘을 crouch로
