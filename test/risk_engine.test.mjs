import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// risk-engine.js는 ES module이 아니라 IIFE + 전역 RiskEngine 노출 방식이라
// vm으로 로드한다.
const code = fs.readFileSync(new URL('../js/risk-engine.js', import.meta.url), 'utf-8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
// vm 컨텍스트에서 top-level const는 컨텍스트 객체의 프로퍼티로 붙지 않는다
// (PocketBase Goja의 top-level 선언 무시 이슈와 유사) — 같은 컨텍스트 안에서
// 한 번 더 평가해서 꺼낸다.
const RiskEngine = vm.runInContext('RiskEngine', sandbox);

describe('risk-engine.js — analyzeText', () => {
  test('CRITICAL 키워드 즉시 최고 점수', () => {
    const r = RiskEngine.analyzeText('살인을 목격했어요');
    assert.equal(r.level, 'CRITICAL');
    assert.equal(r.score, 100);
  });
  test('아무 키워드 없으면 LOW', () => {
    const r = RiskEngine.analyzeText('오늘 날씨가 좋네요');
    assert.equal(r.level, 'LOW');
  });
  test('BUG CHECK: classifyCrime()이 부정문도 오탐 — "안 죽이겠다고 약속했어요"(안심시키는 말)가 협박 범죄로 분류됨', () => {
    // classifyCrime의 '협박' 키워드 목록에 '죽이겠'이 있어 부정("안 ~하겠다")이든
    // 긍정이든 구분 없이 단순 substring 매칭만으로 범죄로 분류한다.
    const r = RiskEngine.classifyCrime('그 사람이 절대 안 죽이겠다고 약속했어요');
    assert.equal(r.isCriminal, true,
      '부정문(안심시키는 발언)인데도 "죽이겠" substring만으로 협박 범죄(HIGH)로 오분류됨 — 부정어 처리가 없음');
    assert.equal(r.type, '협박');
  });
});

describe('risk-engine.js — analyzeContext', () => {
  test('BUG CHECK: 한국어 어미 변화로 키워드가 매칭되지 않음 — "무섭" 키워드가 활용형 "무서워요"와 매칭 안 됨', () => {
    // KEYWORDS.MEDIUM에 '무섭'이 있지만 실제 발화는 "무서워요"(활용형)로 오는 게 자연스러운데
    // 단순 substring 매칭이라 "무섭"이 "무서워요" 안에 없어(무섭≠무서+워요) 전혀 매칭되지 않는다.
    const direct = RiskEngine.analyzeText('무섭');
    const inflected = RiskEngine.analyzeText('무서워요');
    assert.equal(direct.level, 'MEDIUM');
    assert.equal(inflected.level, 'LOW',
      '어간(무섭)은 매칭되지만 실제 대화체 활용형(무서워요)은 매칭되지 않음 — 키워드 사전이 어간 기준이라 자연어 신고 문구를 놓칠 수 있음');
  });
  test('야간+단독+낯선사람+위험장소가 겹치면 키워드 매칭 없이도 HIGH까지 상향된다', () => {
    const r = RiskEngine.analyzeContext({ text: '골목에서 좀 무서워요', hour: 23, isAlone: true, isUnknownPerson: true });
    // 키워드 자체는 안 잡히지만(위 BUG CHECK) 정황 가중치만으로 LOW(10)+15+10+10+15=60 -> HIGH
    assert.equal(r.level, 'HIGH');
  });
  test('점수는 100을 넘지 않게 클램핑된다', () => {
    const r = RiskEngine.analyzeContext({ text: '납치당할 것 같아요 골목에서', hour: 23, isAlone: true, isUnknownPerson: true });
    assert.ok(r.score <= 100);
  });
});

describe('risk-engine.js — classifyCrime vs analyzeText 심각도 불일치', () => {
  test('BUG CHECK: "몰카"가 analyzeText에서는 MEDIUM(40점)인데 classifyCrime에서는 HIGH로 판정 — 같은 키워드에 두 시스템의 심각도가 다름', () => {
    const textResult  = RiskEngine.analyzeText('몰카 찍힌 것 같아요');
    const crimeResult = RiskEngine.classifyCrime('몰카 찍힌 것 같아요');
    assert.equal(textResult.level, 'MEDIUM');
    assert.equal(crimeResult.severity, 'HIGH');
    assert.notEqual(textResult.level, crimeResult.severity,
      '동일 신고 문구에 대해 실시간 위험도(MEDIUM)와 범죄 심각도(HIGH) 판정이 어긋남 — 대응 우선순위 산정 시 혼선 가능');
  });
});

describe('risk-engine.js — forecastRisk / generateCaseNumber', () => {
  test('경고 3개 이상이면 HIGH', () => {
    const r = RiskEngine.forecastRisk({ hour: 23, alone: true, transport: 'unknown_vehicle', isAbroad: true });
    assert.equal(r.warnings.length, 3);
    assert.equal(r.level, 'HIGH');
  });
  test('사건번호 형식 KP-YYYYMMDD-NNNN', () => {
    const c = RiskEngine.generateCaseNumber();
    assert.match(c, /^KP-\d{8}-\d{4}$/);
  });
});
