/**
 * 탭탭! 30초 미션 — Google Sheets 카운터 웹훅
 *
 * 시트 레이아웃 (요약만):
 *   A1 = 완료횟수        B1 = 숫자
 *   A2 = 다시하기 횟수   B2 = 숫자
 *
 * POST JSON: { "type": "complete" } 또는 { "type": "retry" }
 *
 * 설정: 확장 프로그램 → Apps Script → 이 파일 붙여넣기 → 배포 → 웹 앱
 *   실행 주체: 나 / 액세스: 모든 사용자
 * 스크립트를 수정한 뒤에는 반드시 「배포 관리 → 수정 → 새 버전 → 배포」하세요.
 * (LockService 동시성 수정 포함 — 붙여넣은 뒤 재배포 필수)
 */

var LABEL_COMPLETE = '완료횟수';
var LABEL_RETRY = '다시하기 횟수';

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
    return json_({ ok: false, error: 'invalid type' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService
    .createTextOutput('카운터 웹훅 OK. POST { "type": "complete" } 또는 { "type": "retry" }')
    .setMimeType(ContentService.MimeType.TEXT);
}

/** A1/A2 라벨 + B1/B2 숫자 초기화 (없으면 만듦). */
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

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
