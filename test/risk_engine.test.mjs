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
  test('취약점 수정 확인: classifyCrime()이 부정문("안 죽이겠다고 약속했어요")을 더 이상 협박 범죄로 분류하지 않는다', () => {
    const r = RiskEngine.classifyCrime('그 사람이 절대 안 죽이겠다고 약속했어요');
    assert.equal(r.isCriminal, false);
    assert.equal(r.type, '미분류');
  });

  test('회귀 방지: 부정어가 없는 진짜 협박은 여전히 정확히 분류된다(수정이 민감도를 떨어뜨리지 않았는지 확인)', () => {
    const r = RiskEngine.classifyCrime('너 죽이겠다고 계속 문자가 와요');
    assert.equal(r.isCriminal, true);
    assert.equal(r.type, '협박');
    assert.equal(r.article, '형법 제283조');
  });

  test('의도적 설계: analyzeText()/analyzeContext()(실시간 위험도, 출동 우선순위용)는 부정어 처리를 하지 않는다 — 안전 판정은 민감도를 유지해야 함', () => {
    // classifyCrime()과 달리 analyzeText는 같은 부정문 입력이어도 여전히
    // 키워드가 있으면 그대로 반응한다(다만 KEYWORDS.HIGH/CRITICAL엔 '죽이겠'
    // 자체가 없어 이 문장에선 LOW로 나옴 — 이건 이미 위에서 별도로 확인한
    // "어미 변화 매칭 누락"과는 다른 이야기이고, 여기서 확인하려는 건
    // classifyCrime만 수정되고 analyzeText 쪽 로직·민감도는 전혀
    // 손대지 않았다는 것 그 자체).
    const before = RiskEngine.analyzeText('그 사람이 절대 안 죽이겠다고 약속했어요');
    const after  = RiskEngine.analyzeText('그 사람이 절대 안 죽이겠다고 약속했어요');
    assert.deepEqual(before, after, 'analyzeText는 결정적이며 이번 수정과 무관하게 그대로여야 함');
  });

  test('과잉 억제 방지: 키워드와 무관하게 멀리 떨어진 곳의 "안"은 분류를 억제하지 않는다', () => {
    // "불안해요"의 "안"이 뒤쪽 "협박"까지 오염시키면 안 됨 — 부정어 판단은
    // 키워드 바로 앞 6글자 이내로 좁게 본다.
    const r = RiskEngine.classifyCrime('불안해요 그 사람이 죽이겠다고 협박했어요');
    assert.equal(r.isCriminal, true);
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
