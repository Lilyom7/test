(function () {
  'use strict';

  const API  = 'https://kspzaxywgpkuhvqqsfyq.supabase.co/functions/v1/miniphone-api';
  const TAG  = 'yuan330';
  const KEY  = 'ephone_auth';
  const ACCT = 'ephone_auth_account';
  const DID  = 'ephone_device_id';

  // ── DOM ───────────────────────────────────────────────
  const $intro = document.getElementById('intro-screen');
  const $auth  = document.getElementById('ephone-auth-screen');
  const $phone = document.getElementById('phone-screen');
  const $acct  = document.getElementById('ephone-account');
  const $pwd   = document.getElementById('ephone-password');
  const $btn   = document.getElementById('ephone-login-btn');
  const $err   = document.getElementById('ephone-auth-error');
  const $form  = $acct.parentElement;

  // ── 动态注入激活码输入框 ──────────────────────────────
  const $code = document.createElement('input');
  $code.type = 'text';
  $code.placeholder = 'Activation Code (XXXX-XXXX-XXXX)';
  $code.autocomplete = 'off';
  $code.style.display = 'none';
  $form.insertBefore($code, $acct);

  const $toggle = document.createElement('p');
  $toggle.style.cssText = 'text-align:center;font-size:12px;margin-top:8px;color:#aaa;cursor:pointer;';
  $toggle.innerHTML = 'New user? <u>Activate with code</u>';
  $form.appendChild($toggle);

  let isActivate = false;
  $toggle.addEventListener('click', () => {
    isActivate = !isActivate;
    $code.style.display = isActivate ? 'block' : 'none';
    $btn.textContent    = isActivate ? 'Activate!' : 'Unlock!';
    $toggle.innerHTML   = isActivate
      ? 'Already have an account? <u>Login</u>'
      : 'New user? <u>Activate with code</u>';
    $err.textContent = '';
  });

  // ── 设备指纹（计算并缓存）────────────────────────────
  async function getDeviceId() {
    const cached = localStorage.getItem(DID);
    if (cached) return cached;
    const cv = document.createElement('canvas');
    cv.getContext('2d').fillText('fp', 2, 2);
    const raw = [
      navigator.userAgent, navigator.language,
      screen.width + 'x' + screen.height,
      cv.toDataURL()
    ].join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const id  = Array.from(new Uint8Array(buf))
      .map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 32);
    localStorage.setItem(DID, id);
    return id;
  }

  // ── API 请求 ──────────────────────────────────────────
  async function callApi(action, body) {
    const res = await fetch(`${API}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, phoneTag: TAG })
    });
    return res.json();
  }

  // ── 核弹级清理并强制登出 ──────────────────────────────
  function forceLogout(reason) {
    document.body.innerHTML = `
      <div style="background:#0a0a0a;color:#fff;height:100vh;
        display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:12px;font-family:monospace;">
        <div style="font-size:22px;letter-spacing:4px;">DISCONNECTED</div>
        <div style="font-size:13px;color:#888;">${reason || 'Session ended'}</div>
      </div>`;

    localStorage.clear();
    sessionStorage.clear();

    const tryDel = name => { try { indexedDB.deleteDatabase(name); } catch (_) {} };
    if (window.indexedDB) {
      if (indexedDB.databases) {
        indexedDB.databases()
          .then(dbs => dbs.forEach(db => tryDel(db.name)))
          .catch(() => ['GeminiChatDB', 'EPhoneDB', 'ephone_db'].forEach(tryDel));
      } else {
        ['GeminiChatDB', 'EPhoneDB', 'ephone_db'].forEach(tryDel);
      }
    }

    setTimeout(() => {
      window.location.replace(window.location.pathname + '?_t=' + Date.now());
    }, 600);
  }

  // ── 心跳检测 ──────────────────────────────────────────
  // ★ 修复：deviceId 不依赖缓存是否存在，总是能拿到
  async function checkHeartbeat() {
    const account = localStorage.getItem(ACCT);
    if (!account) return;

    try {
      // getDeviceId() 内部有缓存，拿不到就现算，不会再 return 了
      const deviceId = await getDeviceId();
      const data = await callApi('check_status', { account, deviceId });
      if (!data.success) {
        const reason = data.message === 'kicked_banned'
          ? 'Account has been banned'
          : 'Device unbound by admin';
        forceLogout(reason);
      }
    } catch (_) {}
  }

  function startHeartbeat() {
    // 每5分钟定时检测
    setInterval(checkHeartbeat, 5 * 60 * 1000);

    // 切回前台立即检测（手机切 App 再回来）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkHeartbeat();
    });

    // iOS Safari 缓存恢复时检测
    window.addEventListener('pageshow', e => {
      if (e.persisted) checkHeartbeat();
    });

    // 进入主界面 3 秒后立刻查一次
    setTimeout(checkHeartbeat, 3000);
  }

  // ── 登录 / 激活 ───────────────────────────────────────
  async function handleSubmit() {
    const account  = $acct.value.trim();
    const password = $pwd.value.trim();
    $err.textContent = '';

    if (!account || !password)             { setErr('Please enter account and password'); return; }
    if (isActivate && !$code.value.trim()) { setErr('Please enter activation code'); return; }

    $btn.disabled    = true;
    $btn.textContent = '\u00b7\u00b7\u00b7';

    try {
      const deviceId = await getDeviceId();
      const data = isActivate
        ? await callApi('activate', { code: $code.value.trim().toUpperCase(), account, password, deviceId })
        : await callApi('login',    { account, password, deviceId });

      if (data.success) {
        localStorage.setItem(KEY, 'true');
        localStorage.setItem(ACCT, account);
        $err.style.color = '#27ae60';
        $err.textContent = isActivate ? 'Activated! Welcome~' : 'Welcome back~';
        $auth.classList.add('fade-out');
        setTimeout(() => {
          $auth.classList.add('hidden');
          $phone.style.display = 'block';
          startHeartbeat();
        }, 500);
      } else {
        setErr(data.message || 'Wrong account or password');
        $btn.disabled    = false;
        $btn.textContent = isActivate ? 'Activate!' : 'Unlock!';
      }
    } catch (_) {
      setErr('Network error, please retry');
      $btn.disabled    = false;
      $btn.textContent = isActivate ? 'Activate!' : 'Unlock!';
    }
  }

  function setErr(msg) {
    $err.style.color = '#ff6b81';
    $err.textContent = msg;
  }

  // ── 初始化 ────────────────────────────────────────────
  async function init() {
    if (localStorage.getItem(KEY) === 'true') {
      $intro.classList.add('hidden');
      $auth.classList.add('hidden');
      $phone.style.display = 'block';
      startHeartbeat();
    } else {
      $intro.classList.add('hidden');
      $auth.classList.remove('hidden');
      $phone.style.display = 'none';
    }
  }

  // ── 事件绑定 ──────────────────────────────────────────
  $btn.addEventListener('click', handleSubmit);
  $pwd.addEventListener('keypress',  e => { if (e.key === 'Enter') handleSubmit(); });
  $acct.addEventListener('keypress', e => { if (e.key === 'Enter') $pwd.focus(); });
  $code.addEventListener('keypress', e => { if (e.key === 'Enter') $acct.focus(); });

  window.ephoneLogout = () => forceLogout('Logged out');

  init();
  console.log('Auth · yuan330');
})();
