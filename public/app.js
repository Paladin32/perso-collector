const form = document.getElementById('form');
const status = document.getElementById('status');

async function getFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height + '@' + screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency || '',
    navigator.platform || ''
  ];
  if (navigator.deviceMemory) parts.push('mem:' + navigator.deviceMemory);
  if (navigator.maxTouchPoints) parts.push('touch:' + navigator.maxTouchPoints);
  const data = new TextEncoder().encode(parts.join('|'));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function canvasFingerprint() {
  try {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 40;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('fingerprint', 2, 15);
    return c.toDataURL().slice(-64);
  } catch { return ''; }
}

async function collectSystem() {
  return {
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height}@${screen.colorDepth}`,
    fingerprint: await getFingerprint(),
    canvas: await canvasFingerprint()
  };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status.className = 'status';
  status.textContent = 'Envoi en cours...';

  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());

  const sys = await collectSystem();
  const payload = {
    ...data,
    language: sys.language,
    timezone: sys.timezone,
    screen: sys.screen,
    fingerprint: sys.fingerprint + '|' + sys.canvas,
    preferences: {
      lang: data.pref_lang || '',
      theme: data.pref_theme || '',
      interests: data.pref_interests || ''
    }
  };

  try {
    const r = await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    status.textContent = 'Profil enregistré ✓';
    form.reset();
  } catch (err) {
    status.className = 'status error';
    status.textContent = 'Erreur: ' + err.message;
  }
});
