// Login (ohne ?code) -> osu!-OAuth, Callback (mit ?code) -> Token als HttpOnly-Cookie, ?logout=1 -> abmelden
exports.handler = async (e) => {
  const q = e.queryStringParameters || {};
  const redirect = `${process.env.SITE_URL || process.env.URL}/.netlify/functions/auth`;
  if (q.logout) return { statusCode: 302, headers: { Location: '/', 'Set-Cookie': 'osu_t=; Path=/; Max-Age=0' } };
  if (!q.code) {
    const u = new URL('https://osu.ppy.sh/oauth/authorize');
    u.search = new URLSearchParams({ client_id: process.env.OSU_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: 'public identify' });
    return { statusCode: 302, headers: { Location: u.toString() } };
  }
  const r = await fetch('https://osu.ppy.sh/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: Number(process.env.OSU_CLIENT_ID), client_secret: process.env.OSU_CLIENT_SECRET, code: q.code, grant_type: 'authorization_code', redirect_uri: redirect })
  });
  const t = await r.json();
  if (!t.access_token) return { statusCode: 400, body: 'Login fehlgeschlagen: ' + JSON.stringify(t) };
  return { statusCode: 302, headers: { Location: '/', 'Set-Cookie': `osu_t=${t.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${t.expires_in}` } };
};
