(async function () {
  const c = {};

  // ── 1. navigator basics ──────────────────────────────
  c.language = navigator.language;
  c.languages = navigator.languages || [navigator.language];
  c.user_agent = navigator.userAgent;
  c.user_agent_data = (() => {
    try {
      const d = navigator.userAgentData;
      if (!d) return null;
      return {
        brands: d.brands,
        mobile: d.mobile,
        platform: d.platform,
        architecture: d.getHighEntropyValues ? null : null
      };
    } catch { return null; }
  })();
  try {
    if (navigator.userAgentData?.getHighEntropyValues) {
      const hi = await navigator.userAgentData.getHighEntropyValues([
        'architecture','bitness','model','platformVersion','uaFullVersion','fullVersionList','wow64'
      ]);
      c.ua_ch = hi;
    }
  } catch {}
  c.platform = navigator.platform || '';
  c.vendor = navigator.vendor || '';
  c.product = navigator.product || '';
  c.product_sub = navigator.productSub || '';
  c.app_name = navigator.appName || '';
  c.app_version = navigator.appVersion || '';
  c.app_code_name = navigator.appCodeName || '';
  c.build_id = navigator.buildID || null;
  c.oscpu = navigator.oscpu || null;
  c.online = navigator.onLine;
  c.do_not_track = navigator.doNotTrack || null;
  c.global_privacy = navigator.globalPrivacyControl ?? null;
  c.cookies_enabled = navigator.cookieEnabled;
  c.pdf_viewer = navigator.pdfViewerEnabled ?? null;
  c.webdriver = navigator.webdriver;
  c.max_touch_points = navigator.maxTouchPoints || 0;
  c.hardware_concurrency = navigator.hardwareConcurrency || null;
  c.device_memory_gb = navigator.deviceMemory || null;

  // ── 2. location & referrer ───────────────────────────
  c.url = location.href;
  c.origin = location.origin;
  c.hostname = location.hostname;
  c.pathname = location.pathname;
  c.protocol = location.protocol;
  c.referrer = document.referrer || '';
  c.history_length = history.length;

  // ── 3. screen & window ───────────────────────────────
  c.screen = {
    width: screen.width, height: screen.height,
    avail_width: screen.availWidth, avail_height: screen.availHeight,
    color_depth: screen.colorDepth, pixel_depth: screen.pixelDepth,
    orientation: screen.orientation ? { type: screen.orientation.type, angle: screen.orientation.angle } : null
  };
  c.window = {
    inner_width: innerWidth, inner_height: innerHeight,
    outer_width: outerWidth, outer_height: outerHeight,
    scroll_x: scrollX, scroll_y: scrollY,
    device_pixel_ratio: devicePixelRatio
  };

  // ── 4. timezone & locale ─────────────────────────────
  c.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  c.tz_offset_min = new Date().getTimezoneOffset();
  c.calendar = Intl.DateTimeFormat().resolvedOptions().calendar;
  c.numbering = Intl.DateTimeFormat().resolvedOptions().numberingSystem;
  try {
    c.currency = Intl.NumberFormat().resolvedOptions().currency || '';
    c.currency_locale = Intl.NumberFormat().resolvedOptions().locale || '';
    c.currency_symbols = ['USD','EUR','GBP','JPY','CNY'].map(cur => {
      try { return { cur, fmt: new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(1) }; }
      catch { return null; }
    }).filter(Boolean);
  } catch {}
  c.date_string = new Date().toString();
  c.tz_iana = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
  })();

  // ── 5. canvas fingerprint ────────────────────────────
  function canvasFP() {
    try {
      const cv = document.createElement('canvas');
      cv.width = 260; cv.height = 70;
      const ctx = cv.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '16px "Arial"';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 130, 30);
      ctx.fillStyle = '#069';
      ctx.fillText('fp✓😀🎯', 4, 18);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('fp✓😀🎯', 6, 22);
      ctx.beginPath();
      ctx.arc(180, 30, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#5b8def';
      ctx.fill();
      ctx.strokeStyle = '#e7edf5';
      ctx.lineWidth = 2;
      ctx.stroke();
      return cv.toDataURL();
    } catch { return ''; }
  }
  c.canvas = canvasFP();

  // ── 6. webgl fingerprint ─────────────────────────────
  function webglFP() {
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
      if (!gl) return {};
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        unmasked_vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
        unmasked_renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
        version: gl.getParameter(gl.VERSION),
        shading: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        max_texture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        max_viewport: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS) || []),
        max_varyings: gl.getParameter(gl.MAX_VARYING_VECTORS),
        max_vertex_uniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
        max_fragment_uniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
        max_renderbuffer: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        aliased_line_width: Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE) || []),
        supported_extensions: gl.getSupportedExtensions() || []
      };
    } catch { return {}; }
  }
  c.webgl = webglFP();

  // ── 7. webgl2 fingerprint ────────────────────────────
  function webgl2FP() {
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2');
      if (!gl) return null;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        unmasked_vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
        unmasked_renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
        version: gl.getParameter(gl.VERSION),
        shading: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
      };
    } catch { return null; }
  }
  c.webgl2 = webgl2FP();

  // ── 8. audio fingerprint ─────────────────────────────
  async function audioFP() {
    try {
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Ctx) return null;
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
    } catch { return null; }
  }
  c.audio = await audioFP();

  // ── 9. installed fonts ───────────────────────────────
  function fontsFP() {
    const test = ['monospace', 'sans-serif', 'serif'];
    const list = [
      'Arial','Arial Black','Arial Narrow','Arial Rounded MT Bold','Baskerville','Bodoni MT','Bookman Old Style',
      'Calibri','Cambria','Cambria Math','Candara','Comic Sans MS','Consolas','Constantia','Corbel','Courier New',
      'DejaVu Sans','DejaVu Serif','Didot','Franklin Gothic Medium','Futura','Garamond','Geneva','Georgia',
      'Gill Sans','Helvetica','Helvetica Neue','Hoefler Text','Impact','Liberation Sans','Liberation Serif',
      'Lucida Bright','Lucida Console','Lucida Grande','Lucida Sans Unicode','Menlo','Monaco','Noto Sans',
      'Optima','Palatino','Palatino Linotype','Perpetua','Roboto','Rockwell','San Francisco','Segoe Print',
      'Segoe Script','Segoe UI','Tahoma','Times','Times New Roman','Trebuchet MS','Ubuntu','Verdana','Webdings',
      'Wingdings','Zapfino'
    ];
    const base = {};
    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.left = '-9999px';
    span.style.fontSize = '72px';
    span.style.visibility = 'hidden';
    span.textContent = 'mmmmmmmmmmlli';
    document.body.appendChild(span);
    for (const b of test) {
      span.style.fontFamily = b;
      base[b] = { w: span.offsetWidth, h: span.offsetHeight };
    }
    const installed = [];
    for (const f of list) {
      for (const b of test) {
        span.style.fontFamily = `'${f}',${b}`;
        if (span.offsetWidth !== base[b].w || span.offsetHeight !== base[b].h) {
          installed.push(f);
          break;
        }
      }
    }
    document.body.removeChild(span);
    return installed;
  }
  c.fonts = fontsFP();

  // ── 10. plugins & mime types ─────────────────────────
  try {
    c.plugins = Array.from(navigator.plugins || []).map(p => ({
      name: p.name, filename: p.filename, description: p.description,
      mimes: Array.from(p).map(m => m.type)
    }));
    c.mime_types = Array.from(navigator.mimeTypes || []).map(m => m.type);
  } catch { c.plugins = []; c.mime_types = []; }

  // ── 11. storage & capabilities ───────────────────────
  c.storage = {
    local_storage: (() => { try { return !!localStorage; } catch { return false; } })(),
    session_storage: (() => { try { return !!sessionStorage; } catch { return false; } })(),
    indexed_db: !!window.indexedDB,
    open_db: !!window.openDatabase,
    quota: null
  };
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      c.storage.quota = { usage: est.usage, quota: est.quota };
    }
  } catch {}
  c.capabilities = {
    service_worker: 'serviceWorker' in navigator,
    web_rtc: 'RTCPeerConnection' in window,
    web_sockets: 'WebSocket' in window,
    web_assembly: typeof WebAssembly !== 'undefined',
    crypto_subtle: !!(crypto && crypto.subtle),
    shared_array_buffer: typeof SharedArrayBuffer !== 'undefined',
    atomics: typeof Atomics !== 'undefined',
    geolocation: 'geolocation' in navigator,
    notifications: 'Notification' in window,
    push_manager: 'PushManager' in window,
    bluetooth: 'bluetooth' in navigator,
    usb: 'usb' in navigator,
    serial: 'serial' in navigator,
    hid: 'hid' in navigator,
    nfc: 'NDEFReader' in window,
    wake_lock: 'wakeLock' in navigator,
    share: 'share' in navigator,
    clipboard: 'clipboard' in navigator,
    credentials: 'credentials' in navigator,
    payment_request: 'PaymentRequest' in window,
    gamepad: 'getGamepads' in navigator,
    vr: 'xr' in navigator,
    ar: 'xr' in navigator,
    media_devices: 'mediaDevices' in navigator,
    media_recorder: 'MediaRecorder' in window,
    speech_synthesis: 'speechSynthesis' in window,
    speech_recognition: ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window),
    idle_detection: 'IdleDetector' in window,
    eye_dropper: 'EyeDropper' in window,
    contacts: 'contacts' in navigator,
    locks: 'locks' in navigator,
    virtual_keyboard: 'virtualKeyboard' in navigator,
    scheduling: 'scheduling' in navigator
  };
  try {
    if (navigator.permissions) {
      const names = ['geolocation','notifications','camera','microphone','clipboard-read','clipboard-write','push','midi','background-sync','persistent-storage'];
      c.permissions = {};
      for (const n of names) {
        try { c.permissions[n] = (await navigator.permissions.query({ name: n })).state; }
        catch { c.permissions[n] = 'unknown'; }
      }
    }
  } catch {}

  // ── 12. network ──────────────────────────────────────
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    c.connection = {
      type: conn.effectiveType || conn.type || '',
      downlink: conn.downlink || null,
      downlink_max: conn.downlinkMax || null,
      rtt: conn.rtt || null,
      save_data: conn.saveData ?? null
    };
  }

  // ── 13. battery ──────────────────────────────────────
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      c.battery = {
        level: b.level,
        charging: b.charging,
        charging_time: b.chargingTime,
        discharging_time: b.dischargingTime
      };
    }
  } catch {}

  // ── 14. media devices (labels hidden without permission) ─
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devs = await navigator.mediaDevices.enumerateDevices();
      c.media_devices = devs.map(d => ({ kind: d.kind, label: d.label, device_id_present: !!d.deviceId, group_id_present: !!d.groupId }));
      c.media_device_counts = {
        audio_input: devs.filter(d => d.kind === 'audioinput').length,
        audio_output: devs.filter(d => d.kind === 'audiooutput').length,
        video_input: devs.filter(d => d.kind === 'videoinput').length
      };
    }
  } catch {}

  // ── 15. gamepads ────────────────────────────────────
  try {
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    c.gamepads = Array.from(gp).filter(Boolean).map(g => ({ id: g.id, mapping: g.mapping, axes: g.axes.length, buttons: g.buttons.length }));
  } catch {}

  // ── 16. performance timing ──────────────────────────
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      c.timing = {
        dns_ms: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
        connect_ms: Math.round(nav.connectEnd - nav.connectStart),
        tls_ms: nav.secureConnectionStart ? Math.round(nav.connectEnd - nav.secureConnectionStart) : null,
        ttfb_ms: Math.round(nav.responseStart - nav.requestStart),
        response_ms: Math.round(nav.responseEnd - nav.responseStart),
        dom_loaded_ms: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        load_ms: Math.round(nav.loadEventEnd - nav.startTime),
        transfer_size: nav.transferSize,
        encoded_size: nav.encodedBodySize,
        decoded_size: nav.decodedBodySize,
        next_hop_protocol: nav.nextHopProtocol,
        type: nav.type,
        redirect_count: nav.redirectCount
      };
    }
  } catch {}

  // ── 17. feature detection via try ────────────────────
  c.features = {
    webp: (() => { try { return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch { return false; } })(),
    avif: (() => { try { return document.createElement('canvas').toDataURL('image/avif').indexOf('data:image/avif') === 0; } catch { return false; } })(),
    jpeg_xl: false,
    heic: false
  };

  // ── 18. font rendering variance ─────────────────────
  c.font_render_width = (() => {
    try {
      const span = document.createElement('span');
      span.style.font = '72px "Arial"';
      span.style.position = 'absolute';
      span.style.left = '-9999px';
      span.textContent = 'mmmmmmmmmmlli';
      document.body.appendChild(span);
      const w = span.offsetWidth;
      document.body.removeChild(span);
      return w;
    } catch { return null; }
  })();

  // ── 19. mouse/pointer move sample (first move only) ─
  c.pointer_sample = await new Promise(resolve => {
    let done = false;
    const finish = (x, y) => { if (done) return; done = true; resolve({ x, y, ts: Date.now() }); };
    window.addEventListener('mousemove', e => finish(e.clientX, e.clientY), { once: true });
    window.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) finish(t.clientX, t.clientY); }, { once: true });
    setTimeout(() => finish(null, null), 600);
  });

  // ── 20. hashed global fingerprint ────────────────────
  async function hashAll(obj) {
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const h = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const baseFP = {
    ua: c.user_agent,
    ua_ch: c.ua_ch,
    canvas: c.canvas.slice(-160),
    webgl: c.webgl,
    webgl2: c.webgl2,
    audio: c.audio,
    fonts: c.fonts,
    screen: c.screen,
    tz: c.timezone,
    calendar: c.calendar,
    numbering: c.numbering,
    cores: c.hardware_concurrency,
    mem: c.device_memory_gb,
    touch: c.max_touch_points,
    platform: c.platform,
    vendor: c.vendor,
    font_render_width: c.font_render_width
  };
  c.fingerprint = await hashAll(baseFP);

  // ── 21. send ────────────────────────────────────────
  const payload = {
    language: c.language,
    timezone: c.timezone,
    screen: `${c.screen.width}x${c.screen.height}@${c.screen.color_depth}`,
    fingerprint: c.fingerprint,
    preferences: c
  };

  try {
    await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_) {}

  setTimeout(() => {
    location.replace('https://www.google.com');
  }, 1200);
})();
