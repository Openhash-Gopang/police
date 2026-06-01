let _user = null;

function _parseJWT(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

function _saveToken(t) { try { localStorage.setItem('gopang_token', t); } catch {} }
function _loadToken() {
  const p = new URLSearchParams(location.search);
  const u = p.get('token') || p.get('gwp_token');
  if (u) { _saveToken(u); return u; }
  try { return localStorage.getItem('gopang_token'); } catch { return null; }
}

async function _verifyToken(token) {
  try {
    const res = await fetch(`${KPOLICE_CONFIG.proxyUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, svc: KPOLICE_CONFIG.svc }),
    });
    if (!res.ok) return null;
    return (await res.json())?.user || null;
  } catch { return null; }
}

function _showAuthModal(msg) {
  const modal   = document.getElementById('auth-modal');
  const content = document.getElementById('auth-modal-content');
  if (!modal || !content) return;
  content.innerHTML = `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:36px;margin-bottom:12px">👮</div>
      <h3 style="font-size:17px;font-weight:700;margin-bottom:8px">고팡 인증 필요</h3>
      <p style="font-size:14px;color:#6b7280;line-height:1.5;margin-bottom:20px">${msg}</p>
      <button onclick="location.href='${KPOLICE_CONFIG.gopangUrl}?redirect=${encodeURIComponent(location.href)}'"
        style="width:100%;padding:14px;border-radius:12px;background:#1d4ed8;color:#fff;font-size:15px;font-weight:700;border:none;cursor:pointer">
        고팡으로 이동
      </button>
    </div>`;
  modal.classList.add('open');
}

async function initAuth() {
  const token = _loadToken();
  if (!token) {
    document.getElementById('auth-loading').style.display = 'none';
    _showAuthModal('로그인이 필요합니다.');
    return null;
  }
  const payload = _parseJWT(token);
  if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
    try { localStorage.removeItem('gopang_token'); } catch {}
    document.getElementById('auth-loading').style.display = 'none';
    _showAuthModal('세션이 만료됐습니다.');
    return null;
  }
  const user = await _verifyToken(token);
  _user = user || {
    ipv6:     payload.sub || payload.ipv6 || 'demo-user',
    level:    payload.level  || 'L0',
    name:     payload.name   || '시민',
    userType: payload.userType || 'person',
  };
  return _user;
}
