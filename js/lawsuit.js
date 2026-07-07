/**
 * K-Police Lawsuit Package Generator
 * 형사 사건 접수 → 소송 패키지 자동 생성
 * 국가(검찰청/공소청) vs 피의자
 */

const LawsuitEngine = (() => {

  let _systemPrompt = null;

  async function loadPrompt() {
    if (_systemPrompt) return _systemPrompt;
    try {
      const r = await fetch('/prompts/lawsuit_prompt.txt');
      _systemPrompt = await r.text();
    } catch {
      _systemPrompt = `형사 소송 패키지를 JSON으로 생성하세요. 반드시 JSON만 응답하세요.`;
    }
    return _systemPrompt;
  }

  // ── AI 기반 소송 패키지 생성 ──────────────────────────
  async function generatePackage({ caseNumber, crimeInfo, chatHistory, victimInfo }) {
    const prompt = await loadPrompt();

    const userContent = `
사건번호: ${caseNumber}
범죄 분류: ${JSON.stringify(crimeInfo)}
피해자 정보: ${JSON.stringify(victimInfo || {})}
신고 대화 내용:
${chatHistory.map(m => `[${m.role}] ${m.content}`).join('\n')}

위 정보를 바탕으로 형사 소송 패키지 JSON을 생성하세요.
`;

    const res = await fetch(`${KPOLICE_CONFIG.proxyUrl}/deepseek`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       KPOLICE_CONFIG.model,
        service_id:  'kpolice', // 2026-07-07: worker.js가 UNIVERSAL-INTEGRITY/UNIVERSAL-common 강제 주입
        max_tokens:  1500,
        temperature: 0.2,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user',   content: userContent },
        ],
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content || '{}';

    // JSON 파싱
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return buildFallbackPackage(caseNumber, crimeInfo, chatHistory);
    }
  }

  // ── 규칙 기반 폴백 패키지 ─────────────────────────────
  function buildFallbackPackage(caseNumber, crimeInfo, chatHistory) {
    const userMsgs = chatHistory.filter(m => m.role === 'user').map(m => m.content).join(' ');
    return {
      caseNumber,
      caseType: '형사',
      crimeClassification: {
        primary:   crimeInfo.type || '미분류',
        secondary: [],
        articles:  crimeInfo.article ? [crimeInfo.article] : [],
      },
      parties: {
        plaintiff:  '대한민국 검찰청',
        defendant:  '피의자 미상',
      },
      sixW: {
        who:   '피의자 미상',
        when:  new Date().toLocaleString('ko-KR'),
        where: '신고자 진술 참조',
        what:  crimeInfo.type,
        how:   '수사 중',
        why:   '동기 미상',
      },
      evidence: [
        { type: '피해자 진술', description: '신고 채팅 기록', status: '확보' },
        { type: 'CCTV',       description: '현장 CCTV 영상',  status: '수집중' },
        { type: '디지털 증거', description: '통화·문자 기록',  status: '미확보' },
      ],
      requiredActions: [
        { action: '현장 출동 및 피의자 특정', priority: 1, deadline: '즉시' },
        { action: '증거 수집 및 보존',        priority: 2, deadline: '24시간 내' },
        { action: '피의자 영장 청구 검토',     priority: 3, deadline: '48시간 내' },
      ],
      arrestWarrant: {
        required: crimeInfo.severity === 'CRITICAL',
        basis:    `${crimeInfo.type} 범죄 혐의`,
        urgency:  crimeInfo.severity === 'CRITICAL' ? '긴급체포 가능' : '일반 체포',
      },
      prosecutionReadiness: {
        score:           30,
        maxScore:        100,
        missingElements: ['피의자 신원','물적 증거','목격자 진술'],
        recommendation:  '추가 수사 필요',
      },
      victimStatement: userMsgs.slice(0, 200),
      nextSteps: [
        '현장 출동 후 피해자 정식 진술서 작성',
        '피의자 특정 및 체포 영장 검토',
        '증거 보강 후 검찰청 송치',
      ],
    };
  }

  // ── 소송 패키지 렌더링 (HTML) ─────────────────────────
  function renderPackageHTML(pkg) {
    const readiness = pkg.prosecutionReadiness;
    const barColor  = readiness.score >= 70 ? '#16a34a'
                    : readiness.score >= 40 ? '#ea580c'
                    : '#dc2626';

    return `
<div style="background:#fff;border-radius:16px;padding:20px;border:1px solid #e0e7ff;margin:8px 0;font-size:13px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div>
      <span style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">형사 소송 패키지</span>
      <div style="font-size:16px;font-weight:800;color:#1e3a8a">${pkg.caseNumber}</div>
    </div>
    <span style="background:#fef2f2;color:#dc2626;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700">
      ${pkg.crimeClassification.primary}
    </span>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
    <div style="background:#f0f4ff;border-radius:10px;padding:10px">
      <div style="font-size:10px;color:#6b7280;margin-bottom:4px">원고</div>
      <div style="font-weight:700;color:#1e3a8a">${pkg.parties.plaintiff}</div>
    </div>
    <div style="background:#fff5f5;border-radius:10px;padding:10px">
      <div style="font-size:10px;color:#6b7280;margin-bottom:4px">피의자</div>
      <div style="font-weight:700;color:#dc2626">${pkg.parties.defendant}</div>
    </div>
  </div>

  <div style="margin-bottom:12px">
    <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:6px">📋 적용 법조문</div>
    ${pkg.crimeClassification.articles.map(a =>
      `<span style="background:#e0e7ff;color:#1e3a8a;border-radius:6px;padding:2px 8px;font-size:11px;margin-right:4px;display:inline-block;margin-bottom:3px">${a}</span>`
    ).join('')}
  </div>

  <div style="margin-bottom:12px">
    <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:6px">🔍 긴급 수사 절차</div>
    ${pkg.requiredActions.map((a, i) =>
      `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f3f4f6">
        <span style="background:#1d4ed8;color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${i+1}</span>
        <div><div style="font-weight:600;color:#111">${a.action}</div><div style="color:#6b7280;font-size:11px">⏱ ${a.deadline}</div></div>
      </div>`
    ).join('')}
  </div>

  <div style="margin-bottom:12px">
    <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:6px">📊 기소 준비도</div>
    <div style="background:#f3f4f6;border-radius:8px;height:8px;overflow:hidden">
      <div style="background:${barColor};height:100%;width:${readiness.score}%;transition:width .5s"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:4px">
      <span style="font-size:11px;color:#6b7280">${readiness.recommendation}</span>
      <span style="font-size:11px;font-weight:700;color:${barColor}">${readiness.score}/100</span>
    </div>
  </div>

  ${pkg.arrestWarrant.required ? `
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:700;color:#dc2626">⚠️ 체포 영장 청구 검토 필요</div>
    <div style="font-size:11px;color:#7f1d1d;margin-top:4px">${pkg.arrestWarrant.urgency} — ${pkg.arrestWarrant.basis}</div>
  </div>` : ''}

  <button onclick="LawsuitEngine.copyPackage()" style="width:100%;padding:8px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-top:4px">
    📄 패키지 복사 (검찰 이첩용)
  </button>
</div>`;
  }

  // ── 패키지 클립보드 복사 ─────────────────────────────
  let _lastPackage = null;
  function copyPackage() {
    if (!_lastPackage) return;
    navigator.clipboard.writeText(JSON.stringify(_lastPackage, null, 2))
      .then(() => alert('소송 패키지가 클립보드에 복사됐습니다.'))
      .catch(() => alert('복사 실패 — 수동으로 저장해 주세요.'));
  }

  async function create(params) {
    const pkg = await generatePackage(params);
    _lastPackage = pkg;
    return { pkg, html: renderPackageHTML(pkg) };
  }

  return { create, copyPackage, renderPackageHTML };
})();
