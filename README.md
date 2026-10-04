# 충치균 탭! (Cavity Tap)

Smartphone portrait web mini-game: tap mischievous cavity germs on teeth before time runs out. Built with Vite + vanilla TypeScript for GitHub Pages.

## How to play

1. Tap **시작하기**.
2. Germs appear and retreat on their own (whack-a-mole) — tap them for points.
3. Each catch shows a squash → pop → **+1**.
4. Occasionally a sparkling **toothbrush** appears (not part of the germ cap). Tap it to sweep the play area and clear germs along the brush path.
5. After 30 seconds, see your score and press **다시 도전하기**.

## Develop locally

```bash
npm install
cp .env.example .env   # optional: set VITE_SHEETS_WEBHOOK_URL
npm run dev
```

Dev server: `http://127.0.0.1:4731` (bound to `0.0.0.0:4731`).

```bash
npm run build    # output in dist/
npm run preview  # http://127.0.0.1:4732
```

## Project layout

```
public/assets/           # germ, mouth, toothbrush.webp, HUD mark
sheets/Code.gs           # Google Apps Script webhook (paste into the sheet)
src/game/config.ts       # timer, WAM + toothbrush sweep tunables, ASSETS
src/game/mouth.ts        # mouth / teeth background
src/game/germ.ts         # tap → squash → pop feel (+ sweep forceCatch)
src/game/toothbrush.ts   # bonus item spawn / retreat
src/game/game.ts         # loop, HUD, sweep AOE, result screen
src/game/sheetsLog.ts    # complete / retry → Sheets counters
src/style.css            # layout + animations
.env.example             # VITE_SHEETS_WEBHOOK_URL template
```

Spawn positions live in `SPAWN_ANCHORS` inside `src/game/config.ts`. Toothbrush frequency, dwell, and sweep duration are all under `GAME` in the same file. Point `ASSETS.toothbrush` at a new image to swap the bonus art.

## Google Sheets 카운터 연동 (클릭 단계)

목표 시트: [결과 기록용 스프레드시트](https://docs.google.com/spreadsheets/d/1iZ_kPWJzuhD8d-hdhUToCV9peeva-q8qW6A9dimfnd8/edit?usp=sharing)

게임은 Sheets에 직접 쓰지 않습니다. **Apps Script 웹앱**이 두 숫자만 올리고, 게임이 `{ "type": "complete" }` / `{ "type": "retry" }` 를 POST합니다.

### 시트에 보이는 것 (요약만)

| 셀 | 내용 |
| --- | --- |
| A1 | `완료횟수` |
| B1 | 미션 완료 누적 횟수 |
| A2 | `다시하기 횟수` |
| B2 | **다시 도전하기** 누적 횟수 |

타임스탬프·점수·UA·이벤트 로그 행은 쓰지 않습니다.

### 1) Apps Script 붙여넣기 (또는 갱신)

1. 위 시트를 엽니다.
2. **확장 프로그램** → **Apps Script**
3. `Code.gs` 내용을 저장소 [`sheets/Code.gs`](sheets/Code.gs) 전체로 **교체**한 뒤 저장합니다.

### 2) 웹앱 배포 / **재배포 (필수)**

**처음 배포**

1. **배포** → **새 배포** → 유형 **웹 앱**
2. **실행 주체**: **나** / **액세스 권한**: **모든 사용자**
3. **배포** → 권한 허용 → **웹 앱 URL** 복사

**이미 배포한 뒤 스크립트를 바꾼 경우 (지금처럼 카운터로 바꾼 뒤)**

1. Apps Script에서 **배포** → **배포 관리**
2. 연필(수정) 아이콘 클릭
3. **버전**: **새 버전**
4. **배포** 클릭

> 저장만 하고 재배포하지 않으면 예전(이벤트 로그) 코드가 그대로 동작합니다. URL은 보통 그대로여도 됩니다.

### 3) 게임에 웹훅 URL

- **로컬:** `.env`에 `VITE_SHEETS_WEBHOOK_URL=...` (gitignored) → `npm run dev` 재시작
- **프로덕션:** 커밋된 [`.env.production`](.env.production) 사용 → `npm run build`
- URL이 없으면 게임은 정상 동작, 카운터만 건너뜁니다

## Deploy to GitHub Pages

1. Build with your repo name as the base path:

   ```bash
   VITE_BASE=/YOUR_REPO_NAME/ npm run build
   ```

   For a user/org root site (`username.github.io`), use `VITE_BASE=/`.

2. Publish the `dist/` folder (Actions `peaceiris/actions-gh-pages`, or drag-drop the `dist` contents onto the `gh-pages` branch).

3. Ensure Pages is set to serve from the branch/folder that contains the built files.

`vite.config.ts` already reads `process.env.VITE_BASE`.

## Out of scope (v1)

Toothbrush items, area attacks, education copy, accounts, and levels are intentionally omitted from this prototype. Sheets logging is opt-in via the webhook URL above.
