/**
 * K-Police Risk Engine
 * 텍스트·위치·시간·패턴을 종합한 위험 수준 분석
 */

const RiskEngine = (() => {

  // ── 키워드 사전 ───────────────────────────────────────
  const KEYWORDS = {
    CRITICAL: ['살인','납치','감금','총격','폭발','인질','칼부림','방화','강간','강도'],
    HIGH:     ['폭행','협박','스토킹','성추행','가정폭력','해킹','랜섬웨어','사기','실종','절도'],
    MEDIUM:   ['의심','수상','불안','무섭','따라와','몰카','불법촬영','위협','괴롭힘'],
    LOCATION: ['골목','주차장','야산','해변','공사장','폐건물'], // 위험 장소
  };

  // ── 야간 시간대 ───────────────────────────────────────
  function isNightTime(hour) {
    return hour >= 22 || hour < 6;
  }

  // ── 텍스트 위험도 ─────────────────────────────────────
  function analyzeText(text) {
    const t = text;
    if (KEYWORDS.CRITICAL.some(k => t.includes(k))) return { level: 'CRITICAL', score: 100 };
    if (KEYWORDS.HIGH.some(k => t.includes(k)))     return { level: 'HIGH',     score: 70  };
    if (KEYWORDS.MEDIUM.some(k => t.includes(k)))   return { level: 'MEDIUM',   score: 40  };
    return { level: 'LOW', score: 10 };
  }

  // ── 상황 복합 분석 ────────────────────────────────────
  function analyzeContext({ text = '', hour = new Date().getHours(), isAlone = false, isUnknownPerson = false }) {
    let { level, score } = analyzeText(text);

    // 야간 + 단독 + 낯선 사람 → 상향
    if (isNightTime(hour)) score += 15;
    if (isAlone)           score += 10;
    if (isUnknownPerson)   score += 10;
    if (KEYWORDS.LOCATION.some(k => text.includes(k))) score += 15;

    // 점수 → 레벨 재분류
    if (score >= 90) level = 'CRITICAL';
    else if (score >= 60) level = 'HIGH';
    else if (score >= 35) level = 'MEDIUM';
    else level = 'LOW';

    return { level, score: Math.min(score, 100) };
  }

  // ── 사전 위험 예보 ────────────────────────────────────
  // 사용자의 계획된 활동에서 위험 감지
  function forecastRisk(plan) {
    // plan: { time, location, alone, transport, description }
    const hour = plan.hour || 0;
    const warnings = [];

    if (isNightTime(hour) && plan.alone) {
      warnings.push({ type: 'NIGHT_ALONE', msg: `${hour}시 혼자 이동 — 야간 단독 이동은 위험할 수 있습니다.` });
    }
    if (plan.transport === 'unknown_vehicle') {
      warnings.push({ type: 'UNKNOWN_VEHICLE', msg: '낯선 차량 탑승 전 번호판을 저와 공유하고 실시간 위치를 켜주세요.' });
    }
    if (plan.isAbroad && isNightTime(hour)) {
      warnings.push({ type: 'ABROAD_NIGHT', msg: '해외 야간 단독 이동 — 현지 우범 구역 데이터를 확인하세요.' });
    }

    const level = warnings.length >= 3 ? 'HIGH'
                : warnings.length >= 1 ? 'MEDIUM'
                : 'LOW';

    return { level, warnings };
  }

  // ── 범죄 유형 분류 ────────────────────────────────────
  const CRIME_MAP = [
    { keywords:['살인','사망','시신'],            type:'살인',      article:'형법 제250조', severity:'CRITICAL' },
    { keywords:['강도','금품','흉기 들고'],        type:'강도',      article:'형법 제333조', severity:'CRITICAL' },
    { keywords:['납치','감금','데려가'],           type:'납치·감금', article:'형법 제276조', severity:'CRITICAL' },
    { keywords:['폭행','때렸','맞았','다쳤'],      type:'폭행·상해', article:'형법 제260조', severity:'HIGH'     },
    { keywords:['성추행','성폭행','강제추행'],      type:'성범죄',    article:'성폭력처벌법', severity:'HIGH'     },
    { keywords:['스토킹','따라다','계속 연락'],     type:'스토킹',    article:'스토킹처벌법', severity:'HIGH'     },
    { keywords:['가정폭력','남편','아내','배우자'], type:'가정폭력',  article:'가정폭력처벌법',severity:'HIGH'    },
    { keywords:['해킹','랜섬웨어','개인정보 유출'],'type':'사이버범죄', article:'정보통신망법', severity:'HIGH'  },
    { keywords:['사기','보이스피싱','돈 보냈'],     type:'사기',      article:'형법 제347조', severity:'HIGH'     },
    { keywords:['절도','도둑','훔쳤'],             type:'절도',      article:'형법 제329조', severity:'MEDIUM'   },
    { keywords:['협박','위협','죽이겠'],            type:'협박',      article:'형법 제283조', severity:'HIGH'     },
    { keywords:['몰카','불법촬영','도촬'],          type:'불법촬영',  article:'성폭력처벌법 제14조', severity:'HIGH' },
  ];

  function classifyCrime(text) {
    for (const entry of CRIME_MAP) {
      if (entry.keywords.some(k => text.includes(k))) {
        return {
          type:     entry.type,
          article:  entry.article,
          severity: entry.severity,
          isCriminal: true,
        };
      }
    }
    return { type: '미분류', article: null, severity: 'LOW', isCriminal: false };
  }

  // ── 사건번호 생성 ─────────────────────────────────────
  function generateCaseNumber() {
    const d   = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    return `KP-${ymd}-${seq}`;
  }

  return { analyzeText, analyzeContext, forecastRisk, classifyCrime, generateCaseNumber };
})();
