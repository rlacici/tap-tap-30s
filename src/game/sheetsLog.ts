/**
 * 탭탭! 30초 미션 — Google Sheets 카운터 + 익명 TOP3 웹훅
 *
 * 시트 레이아웃 (요약만):
 *   A1 = 완료횟수        B1 = 숫자
 *   A2 = 다시하기 횟수   B2 = 숫자
 *   A4 = 도전! 기록 TOP 3  (제목 라벨)
 *   A5 = 1위             B5 = 점수 (마리)
 *   A6 = 2위             B6 = 점수
 *   A7 = 3위             B7 = 점수
 *   A9 = 시즌(선택)      B9 = 메모 텍스트 (수동 관리 OK)
 *
 * POST JSON:
 *   { "type": "complete" }
 *   { "type": "retry" }
 *   { "type": "score", "value": 12 }   → 완료 카운트와 별도로 TOP3 갱신
 *   { "type": "top3" }                 → { ok, top3: [s1,s2,s3] }
 *
 * GET:
 *   ?type=top3  → { ok, top3: [s1,s2,s3] }
 *
 * 설정: 확장 프로그램 → Apps Script → 이 파일 붙여넣기 → 배포 → 웹 앱
 *   실행 주체: 나 / 액세스: 모든 사용자
 * 스크립트를 수정한 뒤에는 반드시 「배포 관리 → 수정 → 새 버전 → 배포」하세요.
 * (LockService 동시성 — 붙여넣은 뒤 재배포 필수)
 *
 * TOP3 초기화: Apps Script 편집기에서 resetTop3() 를 한 번 실행하거나
 * 시트 B5:B7 을 0으로 지운 뒤 저장하세요. (주간 자동 리셋은 넣지 않음 — 단순 셀 우선)
 */

var LABEL_COMPLETE = '완료횟수';
var LABEL_RETRY = '다시하기 횟수';
var LABEL_TOP3_TITLE = '도전! 기록 TOP 3';
var LABEL_RANK_1 = '1위';
var LABEL_RANK_2 = '2위';
var LABEL_RANK_3 = '3위';
var LABEL_SEASON = '시즌(선택)';

var TOP3_START_ROW = 5; // B5..B7

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    ensureSummary_(sheet);

    var raw = (e && e.postData && e.postData.contents) || '{}';
    var data = JSON.parse(raw);
    var type = String(data.type || data.event || '');

    if (type === 'complete') {
      bump_(sheet, 1);
      return json_({ ok: true, type: 'complete' });
    }
    if (type === 'retry') {
      bump_(sheet, 2);
      return json_({ ok: true, type: 'retry' });
    }
    if (type === 'score') {
      var value = Number(data.value);
      if (isNaN(value) || value < 0) value = 0;
      value = Math.floor(value);
      var top3 = submitScore_(sheet, value);
      return json_({ ok: true, type: 'score', top3: top3 });
    }
    if (type === 'top3') {
      return json_({ ok: true, type: 'top3', top3: readTop3_(sheet) });
    }
    return json_({ ok: false, error: 'invalid type' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    var type = '';
    if (e && e.parameter && e.parameter.type) {
      type = String(e.parameter.type);
    }
    if (type === 'top3') {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      ensureSummary_(sheet);
      return json_({ ok: true, type: 'top3', top3: readTop3_(sheet) });
    }
    return ContentService
      .createTextOutput(
        '카운터·TOP3 웹훅 OK. POST complete/retry/score 또는 GET/POST type=top3',
      )
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** A1/A2 카운터 + A4–A7 TOP3 + 선택 시즌 행 초기화. */
function ensureSummary_(sheet) {
  var a1 = sheet.getRange('A1').getValue();
  var a2 = sheet.getRange('A2').getValue();
  if (a1 !== LABEL_COMPLETE) {
    sheet.getRange('A1').setValue(LABEL_COMPLETE);
  }
  if (a2 !== LABEL_RETRY) {
    sheet.getRange('A2').setValue(LABEL_RETRY);
  }
  if (sheet.getRange('B1').getValue() === '' || sheet.getRange('B1').getValue() === null) {
    sheet.getRange('B1').setValue(0);
  }
  if (sheet.getRange('B2').getValue() === '' || sheet.getRange('B2').getValue() === null) {
    sheet.getRange('B2').setValue(0);
  }

  if (sheet.getRange('A4').getValue() !== LABEL_TOP3_TITLE) {
    sheet.getRange('A4').setValue(LABEL_TOP3_TITLE);
  }
  if (sheet.getRange('A5').getValue() !== LABEL_RANK_1) {
    sheet.getRange('A5').setValue(LABEL_RANK_1);
  }
  if (sheet.getRange('A6').getValue() !== LABEL_RANK_2) {
    sheet.getRange('A6').setValue(LABEL_RANK_2);
  }
  if (sheet.getRange('A7').getValue() !== LABEL_RANK_3) {
    sheet.getRange('A7').setValue(LABEL_RANK_3);
  }
  for (var r = TOP3_START_ROW; r <= TOP3_START_ROW + 2; r++) {
    var cell = sheet.getRange(r, 2);
    var v = cell.getValue();
    if (v === '' || v === null) {
      cell.setValue(0);
    }
  }

  if (sheet.getRange('A9').getValue() === '' || sheet.getRange('A9').getValue() === null) {
    sheet.getRange('A9').setValue(LABEL_SEASON);
  }
}

/** Atomically +1 a counter cell (concurrent complete/retry safe). */
function bump_(sheet, row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cell = sheet.getRange(row, 2);
    var current = Number(cell.getValue());
    if (isNaN(current)) current = 0;
    cell.setValue(current + 1);
  } finally {
    lock.releaseLock();
  }
}

/** Read TOP3 without lock (UI fetch). */
function readTop3_(sheet) {
  var scores = [];
  for (var r = TOP3_START_ROW; r <= TOP3_START_ROW + 2; r++) {
    var n = Number(sheet.getRange(r, 2).getValue());
    if (isNaN(n) || n < 0) n = 0;
    scores.push(Math.floor(n));
  }
  return scores;
}

/**
 * Insert score into TOP3 (descending, keep 3). No names / PII.
 * Zeros are empty slots only — they are not kept as "scores" when merging.
 * Returns the updated [s1,s2,s3] (padded with 0).
 */
function submitScore_(sheet, value) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existing = readTop3_(sheet).filter(function (n) {
      return n > 0;
    });
    if (value > 0) {
      existing.push(value);
      existing.sort(function (a, b) {
        return b - a;
      });
      existing = existing.slice(0, 3);
    }
    while (existing.length < 3) existing.push(0);
    for (var i = 0; i < 3; i++) {
      sheet.getRange(TOP3_START_ROW + i, 2).setValue(existing[i]);
    }
    return existing;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manual helper: Apps Script 편집기에서 선택 → 실행.
 * B5:B7 을 0으로 리셋합니다. (주간 자동 리셋 없음)
 */
function resetTop3() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  ensureSummary_(sheet);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheet.getRange('B5:B7').setValues([[0], [0], [0]]);
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
