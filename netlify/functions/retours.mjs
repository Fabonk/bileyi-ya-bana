// What the visitors leave, kept for the owner of the library alone (Netlify Blobs, private to the Netlify project):
//   POST   /api/commentaire   a comment from the download page {nom, contact, message} (public)
//   POST   /api/installation  the web app put on the home screen of a phone {appareil, id} (public, once per phone)
//   GET    /api/gestion       the comments and the installations (the owner's key, see gestion.html)
//   DELETE /api/gestion?id=…  a comment taken away (the owner's key)
// The owner's key is not here: only its SHA-256, so the code can be public (LISEZ-MOI.md says how to change it).
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

// read as written, not up to a minute late (the default of Netlify Blobs)
const store = (name) => getStore({ name, consistency: 'strong' });

const OWNER = '3d6a3ce450c95df84e267222594e9b602161268138e33cac374d447c7b1703ec';
// the download page (and its draft deploys), the site of the library, and a copy tried on this computer
const PAGE = /^(https:\/\/([a-z0-9]+--)?bileyiyabana\.netlify\.app|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const SITE = /^(https:\/\/fabonk\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

function json(status, value, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store' } });
}
function text(v, max) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max); }
function device(ua) {
  return /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Macintosh/.test(ua) ? 'Mac' : 'autre';
}
function isOwner(req) {
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(createHash('sha256').update(given).digest('hex')), b = Buffer.from(OWNER);
  return given.length > 0 && timingSafeEqual(a, b);
}

async function comment(req, context) {
  if (!PAGE.test(req.headers.get('origin') || '')) return json(403, { erreur: 'origine' });
  let body;
  try { body = await req.json(); } catch { return json(400, { erreur: 'illisible' }); }
  const message = text(body.message, 3000);
  if (message.length < 2) return json(400, { erreur: 'Le message est vide.' });
  // robots: they fill the hidden field, or send the form at once; they are told "thank you" all the same
  if (text(body.site_web, 200) || Number(body.t) < 3000) return json(200, { ok: true });
  const now = new Date(), id = now.toISOString().replace(/[-:.TZ]/g, '') + '-' + Math.random().toString(36).slice(2, 8);
  await store('commentaires').setJSON(id, {
    id, date: now.toISOString(), nom: text(body.nom, 80), contact: text(body.contact, 120), message,
    appareil: device(req.headers.get('user-agent') || ''),
    lieu: [context.geo?.city, context.geo?.country?.name].filter(Boolean).join(', '),
  });
  return json(200, { ok: true });
}

async function installation(req) {
  const origin = req.headers.get('origin') || '';
  const cors = { 'access-control-allow-origin': SITE.test(origin) ? origin : 'https://fabonk.github.io', vary: 'origin' };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
  }
  if (!SITE.test(origin)) return json(403, { erreur: 'origine' }, cors);
  let body;
  try { body = await req.json(); } catch { return json(400, { erreur: 'illisible' }, cors); }
  const what = { iphone: 'iphone', android: 'android' }[body.appareil] || 'autre';
  const id = text(body.id, 40).replace(/[^a-z0-9]/gi, '');
  if (id.length < 8) return json(400, { erreur: 'id' }, cors);
  // one key per phone (its id, made once by the app): counted once even if it says it again
  const kept = store('installations'), month = new Date().toISOString().slice(0, 7);
  const known = await kept.list({ prefix: `${what}/` });
  if (!known.blobs.some((b) => b.key.endsWith('/' + id))) await kept.set(`${what}/${month}/${id}`, '1');
  return json(200, { ok: true }, cors);
}

async function owner(req) {
  if (!isOwner(req)) return json(401, { erreur: 'Clé incorrecte.' });
  const comments = store('commentaires');
  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id') || '';
    if (id) await comments.delete(id);
    return json(200, { ok: true });
  }
  const { blobs } = await comments.list();
  const list = (await Promise.all(blobs.map((b) => comments.get(b.key, { type: 'json' })))).filter(Boolean);
  list.sort((a, b) => (a.date < b.date ? 1 : -1));
  const installs = {};
  for (const b of (await store('installations').list()).blobs) {
    const [what, month] = b.key.split('/');
    installs[what] = installs[what] || { total: 0, mois: {} };
    installs[what].total++;
    installs[what].mois[month] = (installs[what].mois[month] || 0) + 1;
  }
  return json(200, { commentaires: list, installations: installs });
}

export default async (req, context) => {
  const path = new URL(req.url).pathname;
  if (path === '/api/installation') return installation(req);
  if (path === '/api/commentaire' && req.method === 'POST') return comment(req, context);
  if (path === '/api/gestion' && (req.method === 'GET' || req.method === 'DELETE')) return owner(req);
  return json(405, { erreur: 'méthode' });
};

export const config = { path: ['/api/commentaire', '/api/installation', '/api/gestion'] };
