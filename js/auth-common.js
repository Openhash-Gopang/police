/**
 * Gopang Subsystem Auth v2.0
 * ─────────────────────────────────────────────────────────
 * 모든 고팡 서브시스템이 공유하는 범용 인증 모듈.
 * 사용법:
 *   1. SVC_ID를 서비스 식별자로 교체 (police, school, klaw …)
 *   2. GOPANG_URL은 그대로 유지
 *   3. initAuth() 호출 → _user 전역 설정
 *
 * 인증 흐름:
 *   서브시스템 → hondi.net/auth.html?svc=SVC_ID&redirect=현재URL
 *     → (등록/로그인) → 현재URL?token=ipv6
 *       → initAuth()가 token 파싱 → _user 설정 → 앱 시작
 */

// ── 서비스 설정 (서브시스템마다 이 두 값만 변경) ──────────
const _AUTH_SVC_ID   = typeof SVC_ID   !== 'undefined' ? SVC_ID   : 'gopang';
const _AUTH_GOPANG   = typeof GOPANG_URL!== 'undefined' ? GOPANG_URL: 'https://hondi.net';

// ── 전역 사용자 객체 ──────────────────────────────────────
let _user = null;

// ── 유틸 ──────────────────────────────────────────────────
function _loadToken() {
  // 1순위: URL ?token=
  const p = new URLSearchParams(location.search);
  const t = p.get('token') || p.get('gwp_token');
  if (t) {
    try { localStorage.setItem('gopang_token_' + _AUTH_SVC_ID, t); } catch {}
    return t;
  }
  // 2순위: 서비스별 localStorage
  try { return localStorage.getItem('gopang_token_' + _AUTH_SVC_ID) || null; } catch { return null; }
}

function _loadStoredUser() {
  // gopang_user_v3: gopang 웹앱이 남긴 사용자 정보 (같은 브라우저면 공유됨)
  try {
    return JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
  } catch { return null; }
}

function _redirectToAuth(msg) {
  // auth.html 범용 게이트웨이로 이동
  const authUrl = new URL(_AUTH_GOPANG + '/auth.html');
  authUrl.searchParams.set('svc',      _AUTH_SVC_ID);
  authUrl.searchParams.set('redirect', location.href);
  if (msg) authUrl.searchParams.set('reason', msg);
  location.replace(authUrl.toString());
}

function _showAuthModal(msg) {
  const modal   = document.getElementById('auth-modal');
  const content = document.getElementById('auth-modal-content');
  if (!modal || !content) {
    // 모달 없는 환경 → 바로 auth.html로 이동
    _redirectToAuth(msg);
    return;
  }
  content.innerHTML = `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:36px;margin-bottom:12px">🔐</div>
      <h3 style="font-size:17px;font-weight:700;margin-bottom:8px">고팡 인증 필요</h3>
      <p style="font-size:14px;color:#6b7280;line-height:1.5;margin-bottom:20px">
        ${msg || '이 서비스를 이용하려면 고팡 계정이 필요합니다.'}
      </p>
      <button onclick="location.replace('${_AUTH_GOPANG}/auth.html?svc=${_AUTH_SVC_ID}&redirect=${encodeURIComponent(location.href)}')"
        style="width:100%;padding:14px;border-radius:12px;
               background:#3ecf8e;color:#fff;
               font-size:15px;font-weight:700;border:none;cursor:pointer;">
        고팡으로 로그인
      </button>
    </div>`;
  modal.classList.add('open');
}

// ── 서버 검증 (gopang-proxy) ──────────────────────────────
async function _verifyToken(token) {
  // gopang_user_v3가 있으면 서버 검증 없이 로컬 정보 사용
  // (고팡의 인증은 기기 핑거프린트 기반이므로 JWT 검증 불필요)
  const stored = _loadStoredUser();
  if (stored?.ipv6 && stored.ipv6 === token) return stored;

  // 서버 검증 폴백 (gopang-proxy 구현 시 활성화)
  try {
    const proxyUrl = typeof KPOLICE_CONFIG !== 'undefined' ? KPOLICE_CONFIG.proxyUrl
                   : typeof CFG           !== 'undefined' ? CFG.proxyUrl
                   : 'https://hondi-proxy.tensor-city.workers.dev';
    const res = await fetch(proxyUrl + '/auth/verify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token, svc: _AUTH_SVC_ID }),
    });
    if (!res.ok) return null;
    return (await res.json())?.user || null;
  } catch { return null; }
}

// ── 메인 진입 ─────────────────────────────────────────────
async function initAuth() {
  // 1) URL 토큰 또는 localStorage 토큰 로드
  const token = _loadToken();

  // 2) 토큰 없음 → auth.html로
  if (!token) {
    const loading = document.getElementById('auth-loading');
    if (loading) loading.style.display = 'none';
    _showAuthModal('로그인이 필요합니다.');
    return null;
  }

  // 3) gopang_user_v3 직접 확인 (같은 브라우저라면 이미 있음)
  const stored = _loadStoredUser();
  if (stored?.ipv6) {
    _user = {
      ipv6:      stored.ipv6,
      level:     stored.authLevel || 'L0',
      name:      stored.name      || '시민',
      userType:  stored.userType  || 'person',
      faceVec:   stored.faceVec   || null,
    };
    // URL에서 파라미터 정리
    _cleanUrl();
    return _user;
  }

  // 4) 서버 검증
  const verified = await _verifyToken(token);
  if (!verified) {
    try { localStorage.removeItem('gopang_token_' + _AUTH_SVC_ID); } catch {}
    const loading = document.getElementById('auth-loading');
    if (loading) loading.style.display = 'none';
    _showAuthModal('세션이 만료됐습니다. 다시 로그인해 주세요.');
    return null;
  }

  _user = {
    ipv6:     verified.ipv6     || token,
    level:    verified.authLevel || verified.level || 'L0',
    name:     verified.name     || '시민',
    userType: verified.userType || 'person',
  };

  _cleanUrl();
  return _user;
}

function _cleanUrl() {
  try {
    const url = new URL(location.href);
    ['token','gwp_token','gwp','ctx','origin','redirect','svc','reason']
      .forEach(k => url.searchParams.delete(k));
    history.replaceState({}, '', url.toString());
  } catch {}
}

function closeAuthModal() {
  document.getElementById('auth-modal')?.classList.remove('open');
}
