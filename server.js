const express = require('express');
const path = require('path');
const fs = require('fs');
const UAParser = require('ua-parser-js');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── webhook (env var prioritaire, config.json en fallback local) ──
let WEBHOOK = process.env.DISCORD_WEBHOOK || '';
if (!WEBHOOK) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    WEBHOOK = cfg.discord_webhook || '';
  } catch {}
}
if (!WEBHOOK) console.warn('[warn] DISCORD_WEBHOOK not set — webhook disabled');

// ── db ──────────────────────────────────────────────────
const insert = db.prepare(`
INSERT INTO profiles (ip, user_agent, browser, os, device, language, timezone, screen, fingerprint,
  full_name, email, phone, birthdate, address, city, zip, country, geo_lat, geo_lon, geo_city, geo_country, preferences)
VALUES (@ip, @user_agent, @browser, @os, @device, @language, @timezone, @screen, @fingerprint,
  @full_name, @email, @phone, @birthdate, @address, @city, @zip, @country, @geo_lat, @geo_lon, @geo_city, @geo_country, @preferences)
`);

// ── webhook ─────────────────────────────────────────────
function trunc(s, n = 1024) {
  if (s == null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function sendWebhook(record) {
  if (!WEBHOOK) return;

  const prefs = (() => {
    try { return JSON.parse(record.preferences || '{}'); }
    catch { return {}; }
  })();

  const fields = [
    { name: '🆔 Profil #', value: String(record.id ?? '—'), inline: true },
    { name: '🌐 IP', value: trunc(record.ip || '—'), inline: true },
    { name: '🖥 Navigateur', value: trunc(record.browser || '—'), inline: true },
    { name: '💻 OS', value: trunc(record.os || '—'), inline: true },
    { name: '📱 Appareil', value: trunc(record.device || '—'), inline: true },
    { name: '🗣 Langue', value: trunc(record.language || '—'), inline: true },
    { name: '🕓 Timezone', value: trunc(record.timezone || '—'), inline: true },
    { name: '📐 Écran', value: trunc(record.screen || '—'), inline: true },
    { name: '🔑 Fingerprint', value: '`' + trunc(record.fingerprint || '—', 200) + '`' },
    { name: '👤 Nom complet', value: trunc(record.full_name || '—'), inline: true },
    { name: '📧 Email', value: trunc(record.email || '—'), inline: true },
    { name: '📞 Téléphone', value: trunc(record.phone || '—'), inline: true },
    { name: '🎂 Naissance', value: trunc(record.birthdate || '—'), inline: true },
    { name: '🏠 Adresse', value: trunc(record.address || '—') },
    { name: '🏙 Ville', value: trunc(record.city || '—'), inline: true },
    { name: '📮 Code postal', value: trunc(record.zip || '—'), inline: true },
    { name: '🌍 Pays (saisi)', value: trunc(record.country || '—'), inline: true }
  ];

  if (record.geo_lat != null && record.geo_lon != null) {
    fields.push({
      name: '📍 Géoloc IP',
      value: `[${record.geo_lat}, ${record.geo_lon}] — ${record.geo_city || '?'}, ${record.geo_country || '?'}\nhttps://www.google.com/maps?q=${record.geo_lat},${record.geo_lon}`
    });
  }

  if (Object.keys(prefs).length) {
    fields.push({ name: '⭐ Préférences', value: '```json\n' + trunc(JSON.stringify(prefs, null, 2), 1000) + '\n```' });
  }

  const body = {
    username: 'Perso Collector',
    embeds: [{
      title: '📥 Nouveau profil collecté',
      color: 0x5b8def,
      timestamp: new Date().toISOString(),
      fields,
      footer: { text: 'perso-collector' }
    }]
  };

  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn('[webhook] HTTP', r.status, txt.slice(0, 200));
    }
  } catch (err) {
    console.warn('[webhook] failed:', err.message);
  }
}

// ── routes ──────────────────────────────────────────────
app.post('/api/collect', async (req, res) => {
  try {
    const body = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const parser = new UAParser(ua);
    const u = parser.getResult();

    let geo = {};
    try {
      const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`);
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
      full_name: body.full_name || '',
      email: body.email || '',
      phone: body.phone || '',
      birthdate: body.birthdate || '',
      address: body.address || '',
      city: body.city || '',
      zip: body.zip || '',
      country: body.country || '',
      geo_lat: geo.lat ?? null,
      geo_lon: geo.lon ?? null,
      geo_city: geo.city || '',
      geo_country: geo.country || '',
      preferences: JSON.stringify(body.preferences || {})
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
