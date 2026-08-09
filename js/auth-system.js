(function () {
  'use strict';

  // ── 配置 ──────────────────────────────────────────────
  const API  = 'https://kspzaxywgpkuhvqqsfyq.supabase.co/functions/v1/miniphone-api';
  const TAG  = 'yuan330';
  const KEY  = 'ephone_auth';
  const ACCT = 'ephone_auth_account';
  const DID  = 'ephone_device_id';   // 登录时存入，心跳直接读取

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
  $code.type        = 'text';
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

  // ── 设备指纹（登录时计算并缓存到 localStorage）────────
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
    // 1. 立即黑屏
    document.body.innerHTML = `
      <div style="background:#0a0a0a;color:#fff;height:100vh;
        display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:12px;font-family:monospace;">
        <div style="font-size:22px;letter-spacing:4px;">DISCONNECTED</div>
        <div style="font-size:13px;color:#888;">${reason || 'Your session has ended'}</div>
      </div>`;

    // 2. 清空常规缓存
    localStorage.clear();
    sessionStorage.clear();

    // 3. 清空 IndexedDB（聊天记录、图片等）
    const tryDelete = (name) => { try { indexedDB.deleteDatabase(name); } catch (_) {} };
    if (window.indexedDB) {
      if (indexedDB.databases) {
        indexedDB.databases()
          .then(dbs => dbs.forEach(db => tryDelete(db.name)))
          .catch(() => {
            // 降级：删已知数据库
            ['GeminiChatDB', 'EPhoneDB', 'ephone_db'].forEach(tryDelete);
          });
      } else {
        ['GeminiChatDB', 'EPhoneDB', 'ephone_db'].forEach(tryDelete);
      }
    }

    // 4. 带时间戳跳转，防止缓存
    setTimeout(() => {
      window.location.replace(
        window.location.pathname + '?_t=' + Date.now()
      );
    }, 600);
  }

  // ── 心跳检测 ──────────────────────────────────────────
  async function checkHeartbeat() {
    const account  = localStorage.getItem(ACCT);
    const deviceId = localStorage.getItem(DID);
    if (!account || !deviceId) return;

    try {
      const data = await callApi('check_status', { account, deviceId });
      if (!data.success) {
        const reason = data.message === 'kicked_banned'
          ? 'Account has been banned'
          : 'Device unbound by admin';
        forceLogout(reason);
      }
    } catch (_) {}   // 网络异常不处理，下次再试
  }

  function startHeartbeat() {
    // 每5分钟定时检测
    setInterval(checkHeartbeat, 5 * 60 * 1000);

    // 切回前台时立即检测（手机切换 App 再回来）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkHeartbeat();
    });

    // 从缓存恢复页面时检测（iOS Safari 特有）
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) checkHeartbeat();
    });

    // 2秒后先检测一次（防止登录状态已被后台修改）
    setTimeout(checkHeartbeat, 2000);
  }

  // ── 登录 / 激活提交 ───────────────────────────────────
  async function handleSubmit() {
    const account  = $acct.value.trim();
    const password = $pwd.value.trim();
    $err.textContent = '';

    if (!account || !password)          { setErr('Please enter account and password'); return; }
    if (isActivate && !$code.value.trim()) { setErr('Please enter activation code'); return; }

    $btn.disabled    = true;
    $btn.textContent = '\u00b7\u00b7\u00b7';

    try {
      const deviceId = await getDeviceId();
      const data = isActivate
        ? await callApi('activate', {
            code: $code.value.trim().toUpperCase(),
            account, password, deviceId
          })
        : await callApi('login', { account, password, deviceId });

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

  window.ephoneLogout = function () {
    forceLogout('Logged out');
  };

  init();
  console.log('Auth · yuan330');
})();
