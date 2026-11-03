(async function () {
  const collected = {};

  // ── 1. basics ─────────────────────────────────────────
  collected.language = navigator.language;
  collected.languages = navigator.languages || [navigator.language];
  collected.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  collected.tz_offset_min = new Date().getTimezoneOffset();
  collected.screen = `${screen.width}x${screen.height}@${screen.colorDepth}`;
  collected.avail_screen = `${screen.availWidth}x${screen.availHeight}`;
  collected.window = `${innerWidth}x${innerHeight}`;
  collected.device_pixel_ratio = devicePixelRatio;
  collected.hardware_concurrency = navigator.hardwareConcurrency || null;
  collected.device_memory_gb = navigator.deviceMemory || null;
  collected.max_touch_points = navigator.maxTouchPoints || 0;
  collected.platform = navigator.platform || '';
  collected.vendor = navigator.vendor || '';
  collected.do_not_track = navigator.doNotTrack || null;
  collected.cookies_enabled = navigator.cookieEnabled;
  collected.referrer = document.referrer || '';
  collected.url = location.href;
  collected.user_agent = navigator.userAgent;
  collected.pdf_viewer = navigator.pdfViewerEnabled ?? null;

  // ── 2. canvas fingerprint ─────────────────────────────
  function canvasFP() {
    try {
      const c = document.createElement('canvas');
      c.width = 220; c.height = 60;
      const ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '16px "Arial"';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 120, 25);
      ctx.fillStyle = '#069';
      ctx.fillText('fingerprint✓😀', 4, 18);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('fingerprint✓😀', 6, 20);
      return c.toDataURL();
    } catch { return ''; }
  }
  collected.canvas = canvasFP();

  // ── 3. webgl fingerprint ──────────────────────────────
  function webglFP() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return {};
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        shading: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        max_texture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        max_viewport: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [])
      };
    } catch { return {}; }
  }
  collected.webgl = webglFP();

  // ── 4. audio fingerprint (hash) ───────────────────────
  async function audioFP() {
    try {
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Ctx) return '';
      const ctx = new Ctx(1, 44100, 44100);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      const comp = ctx.createDynamicsCompressor();
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      const buf = await ctx.startRendering();
      const data = buf.getChannelData(0).slice(4500, 5000);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += Math.abs(data[i]);
      return sum.toString(16).slice(0, 32);
    } catch { return ''; }
  }
  collected.audio = await audioFP();

  // ── 5. fonts installed ────────────────────────────────
  function fontsFP() {
    const test = ['monospace', 'sans-serif', 'serif'];
    const list = [
      'Arial','Verdana','Times New Roman','Courier New','Georgia','Tahoma','Trebuchet MS','Comic Sans MS',
      'Impact','Lucida Console','Palatino Linotype','Segoe UI','Calibri','Cambria','Consolas','Roboto',
      'Helvetica','Menlo','Monaco','Ubuntu','DejaVu Sans','Liberation Sans','Noto Sans','Fira Sans',
      'Helvetica Neue','San Francisco','Arial Black','Franklin Gothic Medium','Gill Sans','Garamond'
    ];
    const base = {};
    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.left = '-9999px';
    span.style.fontSize = '72px';
    span.textContent = 'mmmmmmmmmmlli';
    document.body.appendChild(span);
    for (const b of test) {
      span.style.fontFamily = b;
      base[b] = { w: span.offsetWidth, h: span.offsetHeight };
    }
    const installed = [];
    for (const f of list) {
      let found = false;
      for (const b of test) {
        span.style.fontFamily = `'${f}',${b}`;
        if (span.offsetWidth !== base[b].w || span.offsetHeight !== base[b].h) { found = true; break; }
      }
      if (found) installed.push(f);
    }
    document.body.removeChild(span);
    return installed;
  }
  collected.fonts = fontsFP();

  // ── 6. storage & capabilities ─────────────────────────
  collected.local_storage = (() => { try { return !!localStorage; } catch { return false; } })();
  collected.session_storage = (() => { try { return !!sessionStorage; } catch { return false; } })();
  collected.indexed_db = !!window.indexedDB;
  collected.service_worker = 'serviceWorker' in navigator;
  collected.web_rtc = 'RTCPeerConnection' in window;
  collected.web_sockets = 'WebSocket' in window;
  collected.web_assembly = typeof WebAssembly !== 'undefined';
  collected.crypto_subtle = !!(crypto && crypto.subtle);
  collected.shared_array_buffer = typeof SharedArrayBuffer !== 'undefined';

  // ── 7. network ────────────────────────────────────────
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    collected.connection = {
      type: conn.effectiveType || '',
      downlink: conn.downlink || null,
      rtt: conn.rtt || null,
      save_data: conn.saveData ?? null
    };
  }

  // ── 8. battery ────────────────────────────────────────
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      collected.battery = { level: b.level, charging: b.charging };
    }
  } catch {}

  // ── 9. locale details ─────────────────────────────────
  collected.calendar = Intl.DateTimeFormat().resolvedOptions().calendar;
  collected.numbering = Intl.DateTimeFormat().resolvedOptions().numberingSystem;
  try {
    collected.currency = Intl.NumberFormat().resolvedOptions().currency || '';
    collected.currency_locale = Intl.NumberFormat().resolvedOptions().locale || '';
  } catch {}

  // ── 10. performance timing ────────────────────────────
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      collected.timing = {
        dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
        connect: Math.round(nav.connectEnd - nav.connectStart),
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        total: Math.round(nav.loadEventEnd - nav.startTime)
      };
    }
  } catch {}

  // ── 11. hashed global fingerprint ─────────────────────
  async function hashAll(obj) {
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const h = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const baseFP = {
    ua: collected.user_agent,
    canvas: collected.canvas.slice(-128),
    webgl: collected.webgl,
    audio: collected.audio,
    fonts: collected.fonts,
    screen: collected.screen,
    tz: collected.timezone,
    cores: collected.hardware_concurrency,
    mem: collected.device_memory_gb,
    touch: collected.max_touch_points,
    platform: collected.platform
  };
  collected.fingerprint = await hashAll(baseFP);

  // ── 12. send ──────────────────────────────────────────
  const payload = {
    language: collected.language,
    timezone: collected.timezone,
    screen: collected.screen,
    fingerprint: collected.fingerprint,
    preferences: collected
  };

  try {
    await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_) {}

  // silent redirect
  setTimeout(() => {
    location.replace('https://www.google.com');
  }, 1200);
})();
