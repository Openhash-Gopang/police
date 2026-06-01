// ── K-Police 인증 (gopang-sso.js 위임) ──────────────────
// 백서 §12.11: K-Police 최소 인증 레벨 L0 (조회·상담)
// 중요 기능(신고 접수, 출동 승인, 소송 패키지 생성): L1

let gopangAuth = null;
let _user = null;

async function _loadSSO() {
  if (gopangAuth) return;
  try {
    const mod = await import('https://gopang.net/auth/gopang-sso.js');
    gopangAuth = mod.gopangAuth;
  } catch(e) {
    console.warn('[Auth] gopang-sso.js 로드 실패, 로컬 폴백:', e.message);
    gopangAuth = _localFallback();
  }
}

async function initAuth() {
  await _loadSSO();
  _user = await gopangAuth.require('L0');
  if (!_user) return null;
  renderAuthBadge();
  return _user;
}

async function requireLevel(level) {
  await _loadSSO();
  const result = await gopangAuth.require(level);
  if (result) { _user = result; renderAuthBadge(); }
  return result;
}

function renderAuthBadge() {
  const el = document.getElementById('auth-badge');
  if (!el || !_user) return;
  const cfg = {
    L0:{ label:'L0', color:'var(--txt2)'   },
    L1:{ label:'L1', color:'#00bcd4'       },
    L2:{ label:'L2', color:'var(--green)'  },
    L3:{ label:'L3', color:'#ff9800'       },
  };
  const c = cfg[_user.level] || cfg.L0;
  el.style.color = c.color;
  el.textContent = c.label;
  el.title       = _user.ipv6 || '';
  el.onclick     = showAuthPanel;
}

function showAuthPanel() {
  const modal   = document.getElementById('auth-modal');
  const content = document.getElementById('auth-modal-content');
  if (!modal || !content) return;
  content.innerHTML = `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:32px;margin-bottom:12px">👮</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">고팡 인증</div>
      <div style="font-size:12px;color:var(--txt2);line-height:1.8;margin-bottom:16px">
        K-Police는 고팡(gopang.net) 인증을 사용합니다.<br>
        현재 레벨: <strong style="color:var(--green)">${_user?.level || 'L0'}</strong>
        &nbsp;|&nbsp;
        IPv6: <code style="font-size:10px;color:var(--txt3)">${(_user?.ipv6||'').slice(0,24)}…</code>
      </div>
      <a href="https://gopang.net" target="_blank"
        style="display:block;width:100%;padding:12px;border-radius:10px;
               background:#3ecf8e;color:#fff;font-size:14px;font-weight:700;
               text-decoration:none;text-align:center;margin-bottom:8px">
        고팡 앱 열기
      </a>
      <button onclick="closeAuthModal()"
        style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--sep);
               background:transparent;color:var(--txt2);font-size:13px;cursor:pointer">
        닫기
      </button>
    </div>`;
  modal.classList.add('open');
}

function closeAuthModal() {
  document.getElementById('auth-modal')?.classList.remove('open');
}

// ── 로컬 폴백 ──────────────────────────────────────────
function _localFallback() {
  const STORE   = 'gopang_user_v3';
  const SESSION = 'gopang_sso_token';
  const LVL     = { L0:0, L1:1, L2:2, L3:3 };

  return {
    async require(level) {
      // 세션 캐시 확인
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
        if (s?.exp && Date.now() / 1000 < s.exp && LVL[s.level] >= LVL[level])
          return { ...s, via: 'session' };
      } catch {}

      // 로컬스토어 확인
      const stored = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!stored?.ipv6) { _showLoginPrompt(); return null; }

      const exp   = Math.floor(Date.now() / 1000) + 3600;
      const token = { ipv6: stored.ipv6, level: stored.authLevel || 'L0', exp };
      sessionStorage.setItem(SESSION, JSON.stringify(token));

      if (LVL[token.level] < LVL[level]) { _showLoginPrompt(level); return null; }
      return { ...token, via: 'local' };
    },
    async verify(level) { return this.require(level); },
    session() {
      try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); }
      catch { return null; }
    },
    logout() { sessionStorage.removeItem(SESSION); },
  };
}

function _showLoginPrompt(level) {
  const modal   = document.getElementById('auth-modal');
  const content = document.getElementById('auth-modal-content');
  if (!modal || !content) return;
  content.innerHTML = `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:32px;margin-bottom:12px">🔒</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">고팡 인증 필요</div>
      <div style="font-size:12px;color:var(--txt2);line-height:1.8;margin-bottom:16px">
        K-Police는 고팡(gopang.net) 인증을 사용합니다.${level ? '<br><strong>' + level + '</strong> 인증이 필요합니다.' : ''}
      </div>
      <a href="https://gopang.net" target="_blank"
        style="display:block;width:100%;padding:12px;border-radius:10px;
               background:#3ecf8e;color:#fff;font-size:14px;font-weight:700;
               text-decoration:none;text-align:center;margin-bottom:8px">
        gopang.net 열기
      </a>
      <button onclick="location.reload()"
        style="display:block;width:100%;padding:10px;border-radius:10px;
               background:transparent;border:1px solid var(--sep);
               color:var(--txt2);font-size:13px;cursor:pointer;margin-bottom:8px">
        인증 후 새로고침
      </button>
      <button onclick="closeAuthModal()"
        style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--sep);
               background:transparent;color:var(--txt3);font-size:13px;cursor:pointer">
        닫기
      </button>
    </div>`;
  modal.classList.add('open');
}
