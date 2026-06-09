# HANDOVER — police.gopang.net 인증 · PDV 테스트

**작성일:** 2026-06-04  
**저장소:** https://github.com/Openhash-Gopang/police  
**대상 파일:** `webapp.html`, `desktop.html`, `ops.html` (존재하는 파일 기준)  
**Worker:** `gopang-proxy.tensor-city.workers.dev` (v4.3)  
**Supabase:** `ebbecjfrwaswbdybbgiu.supabase.co`

---

## 1. 핵심 원칙

```
하위 시스템 인증 = HTML 파일당 한 줄 추가
PDV 기록        = sendPDV() 함수 + _onGopangAuth 콜백
svc ID          = 'kpolice'  (Worker SVC_ALIAS: kpolice → police)
```

---

## 2. 한 줄 추가 — 인증 모듈 삽입

각 HTML 파일의 `</body>` 직전에 아래 한 줄을 추가합니다.

```html
<script type="module" src="https://gopang.net/auth/subsystem-auth.js"></script>
```

**적용 대상 파일:**
- `webapp.html`
- `desktop.html`
- `ops.html`

---

## 3. SSO 콜백 + PDV 구현

각 파일의 `<script>` 블록(subsystem-auth.js 삽입 전)에 아래 코드를 추가합니다.

```javascript
const PROXY_BASE = 'https://gopang-proxy.tensor-city.workers.dev';

// ── 고팡 SSO 인증 콜백 ───────────────────────────────────────
window._onGopangAuth = async function(user) {
  console.log('[POLICE] _onGopangAuth:', JSON.stringify(user));

  const guid = user?.ipv6 || user?.guid || null;
  if (!guid) {
    console.log('[POLICE] 게스트 접속');
    return;
  }

  console.log('[POLICE] 인증 완료:', guid.slice(0, 16) + '…', '레벨:', user.level);

  // 인증 후 UI 초기화 (필요 시 구현)
  // await loadHomeData(guid);

  // PDV 기록
  await sendPolicePDV(guid, user);
};

// ── PDV 전송 ────────────────────────────────────────────────
async function sendPolicePDV(ipv6, user, reportOverride = null) {
  try {
    const now    = new Date().toISOString();
    const report = reportOverride || {
      svc:  'kpolice',                      // Worker SVC_ALIAS: kpolice → police
      type: 'event',
      who: {
        ipv6:       ipv6,
        role:       'user',
        level:      user?.level || 'L0',
        recipients: ['gopang-pdv'],
      },
      when:  { period_start: now, period_end: now },
      where: { svc_url: 'https://police.gopang.net/webapp.html' },
      what:  { summary: 'K-Police 접속 — 치안 서비스 이용' },
      how:   { method: '고팡 SSO 자동 인증 (경로: ' + (user?.via || 'session') + ')' },
      why:   { goal: '치안 서비스 접속 및 이용' },
    };

    const res = await fetch(PROXY_BASE + '/pdv/report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ report }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[POLICE PDV] HTTP', res.status, errText);
      return;
    }

    const data = await res.json();
    console.log('[POLICE PDV]', data.pdv_entry, data.message);
    return data.pdv_entry;
  } catch(e) {
    console.warn('[POLICE PDV] 전송 실패:', e.message);
  }
}
```

---

## 4. 주의사항

| 항목 | 내용 |
|---|---|
| **GUID** | `user.ipv6` 사용 (`user.guid` 아님) |
| **role** | 반드시 `'user'` (`'admin'` 미지원) |
| **svc_url** | `gwp-registry.js`에 등록된 URL과 동일해야 함 |
| **svc ID** | `'kpolice'` — Worker가 `police`로 자동 변환 |
| **ops.html** | `svc_url`을 `ops.html`로 변경하거나 별도 PDV 함수 작성 |

---

## 5. 테스트 시나리오 (T1~T6)

| 단계 | 확인 항목 | 성공 기준 |
|---|---|---|
| **T1** | 코드 삽입 확인 | `_onGopangAuth`, `sendPolicePDV`, `subsystem-auth.js` 존재 |
| **T2** | GitHub Pages 배포 | `police.gopang.net` 접속 정상 |
| **T3** | SSO 인증 | Console: `[POLICE] 인증 완료: 2601:db80:…` |
| **T4** | user.ipv6 수신 | Console: IPv6 형식 GUID 출력 |
| **T5** | PDV 전송 | Console: `[POLICE PDV] PDV-… PDV 기록 완료. police (Level 3)` |
| **T6** | Supabase 저장 | SQL: `SELECT * FROM pdv_log WHERE source='police' ORDER BY created_at DESC LIMIT 5;` |

---

## 6. 빠른 브라우저 테스트 (T5 직접 확인)

배포 후 `police.gopang.net` 접속 → F12 콘솔:

```javascript
// PDV 직접 전송 테스트
fetch('https://gopang-proxy.tensor-city.workers.dev/pdv/report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ report: {
    svc: 'kpolice', type: 'event',
    who:   { ipv6: '테스트GUID', role: 'user', level: 'L0', recipients: ['gopang-pdv'] },
    when:  { period_start: new Date().toISOString(), period_end: new Date().toISOString() },
    where: { svc_url: 'https://police.gopang.net/webapp.html' },
    what:  { summary: 'K-Police PDV 테스트' },
    how:   { method: '수동 테스트' },
    why:   { goal: '연동 확인' },
  }})
}).then(r=>r.json()).then(console.log);
```

**기대 응답:**
```json
{
  "ok": true,
  "pdv_entry": "PDV-…-…",
  "message": "PDV 기록 완료. police (Level 3)",
  "svc_level": 3
}
```

---

## 7. 실패 시 체크리스트

```
403 PDV_NOT_ALLOWED
  → svc: 'kpolice' 인지 확인 (kpolice → police 변환은 Worker v4.3에서 자동)

빈 user 객체
  → _onGopangAuth가 정의되기 전에 subsystem-auth.js가 로드됐는지 확인
  → subsystem-auth.js 삽입 위치: </body> 직전, _onGopangAuth 정의 이후

user.ipv6 undefined
  → user?.ipv6 || user?.guid 패턴 사용 (이미 적용됨)
```

---

*이 문서는 tax.gopang.net 인증 (T1~T7 전체 통과) 경험을 기반으로 작성됨.*  
*Worker v4.3 SVC_ALIAS 참고: `Openhash-Gopang/gopang_v2/worker.js`*
