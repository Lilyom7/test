(function () {
  'use strict';

  // ── 配置 ──────────────────────────────────────────────
  const API  = 'https://kspzaxywgpkuhvqqsfyq.supabase.co/functions/v1/miniphone-api';
  const TAG  = 'yuan330';
  const KEY  = 'ephone_auth';
  const ACCT = 'ephone_auth_account';

  // ── DOM ───────────────────────────────────────────────
  const $intro = document.getElementById('intro-screen');
  const $auth  = document.getElementById('ephone-auth-screen');
  const $phone = document.getElementById('phone-screen');
  const $acct  = document.getElementById('ephone-account');
  const $pwd   = document.getElementById('ephone-password');
  const $btn   = document.getElementById('ephone-login-btn');
  const $err   = document.getElementById('ephone-auth-error');
  const $form  = $acct.parentElement;

  // ── 动态注入激活码输入 ────────────────────────────────
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
    $code.style.display  = isActivate ? 'block' : 'none';
    $btn.textContent     = isActivate ? 'Activate!' : 'Unlock!';
    $toggle.innerHTML    = isActivate
      ? 'Already have an account? <u>Login</u>'
      : 'New user? <u>Activate with code</u>';
    $err.textContent = '';
  });

  // ── 设备指纹 ─────────────────────────────────────────
  async function getDeviceId() {
    const cv = document.createElement('canvas');
    cv.getContext('2d').fillText('fp', 2, 2);
    const raw = [
      navigator.userAgent, navigator.language,
      screen.width + 'x' + screen.height,
      cv.toDataURL()
    ].join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf))
      .map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 32);
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

  // ── 提交处理 ──────────────────────────────────────────
  async function handleSubmit() {
    const account  = $acct.value.trim();
    const password = $pwd.value.trim();
    $err.textContent = '';

    if (!account || !password) { setError('Please enter account and password'); return; }
    if (isActivate && !$code.value.trim()) { setError('Please enter activation code'); return; }

    $btn.disabled = true;
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
          startHeartbeat(account, deviceId);
        }, 500);
      } else {
        setError(data.message || 'Wrong account or password');
        $btn.disabled = false;
        $btn.textContent = isActivate ? 'Activate!' : 'Unlock!';
      }
    } catch (e) {
      setError('Network error, please retry');
      $btn.disabled = false;
      $btn.textContent = isActivate ? 'Activate!' : 'Unlock!';
    }
  }

  function setError(msg) {
    $err.style.color = '#ff6b81';
    $err.textContent = msg;
  }

  // ── 心跳（每5分钟，被踢则强制登出）──────────────────
  function startHeartbeat(account, deviceId) {
    setInterval(async () => {
      try {
        const data = await callApi('check_status', { account, deviceId });
        if (!data.success) { localStorage.removeItem(KEY); localStorage.removeItem(ACCT); location.reload(); }
      } catch (_) {}
    }, 5 * 60 * 1000);
  }

  // ── 初始化 ────────────────────────────────────────────
  async function init() {
    if (localStorage.getItem(KEY) === 'true') {
      $intro.classList.add('hidden');
      $auth.classList.add('hidden');
      $phone.style.display = 'block';
      const account = localStorage.getItem(ACCT) || '';
      if (account) {
        try {
          const deviceId = await getDeviceId();
          const data = await callApi('check_status', { account, deviceId });
          if (!data.success) { localStorage.removeItem(KEY); localStorage.removeItem(ACCT); location.reload(); return; }
          startHeartbeat(account, deviceId);
        } catch (_) {}
      }
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

  window.ephoneLogout = function () {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ACCT);
    location.reload();
  };

  init();
  console.log('Auth · yuan330');
})();
