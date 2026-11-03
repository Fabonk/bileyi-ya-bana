// The relay of the Chat IA of Bileyi ya Bana: the pages of the library (the apps, the web app put on the home screen of
// an iPhone) send their question here, and it goes on to Google Gemini or to OpenRouter with the library's keys, which
// stay on Netlify (environment variables GEMINI_KEY and OPENROUTER_KEY, see LISEZ-MOI.md): a new key is put here,
// without a new version of the apps. The answer comes back as it is written (streamed).
//   POST /api/ia/gemini      {model, body}: body as for Gemini's streamGenerateContent
//   POST /api/ia/openrouter  {model, body}: body as for OpenRouter's chat/completions
// Only the free models it lists can be asked (Gemini Flash, OpenRouter ":free"), and only from the pages of the library.

// the pages of the library: the site online, the download page, the apps (file: pages have the origin "null"; Windows
// shows the site at https://bileyiyabana.example/), and a copy of the site tried on this computer
const ORIGINS = /^(https:\/\/fabonk\.github\.io|https:\/\/bileyiyabana\.netlify\.app|https:\/\/bileyiyabana\.example|null|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const MAX = 600000;  // characters of a question (with the passages of the library: about 130 000)

const SERVICES = {
  gemini: {
    model: /^gemini-[a-z0-9.-]*flash[a-z0-9.-]*$/,
    request: (model, body, key) => [
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      { 'content-type': 'application/json', 'x-goog-api-key': key }, body],
    key: 'GEMINI_KEY',
  },
  openrouter: {
    model: /^([a-z0-9._-]+\/[a-z0-9._-]+:free|openrouter\/free)$/,
    request: (model, body, key) => [
      'https://openrouter.ai/api/v1/chat/completions',
      { 'content-type': 'application/json', authorization: `Bearer ${key}`,
        'http-referer': 'https://bileyiyabana.netlify.app/', 'x-title': 'Bileyi ya Bana' },
      { ...body, model, stream: true }],
    key: 'OPENROUTER_KEY',
  },
};

function answer(status, text, cors) {
  return new Response(JSON.stringify({ error: { message: text } }), {
    status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } });
}

export default async (request) => {
  const origin = request.headers.get('origin') || '';
  const cors = { 'access-control-allow-origin': ORIGINS.test(origin) ? origin : 'https://fabonk.github.io',
    'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400', vary: 'origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return answer(405, 'Le relais du Chat IA ne reçoit que des questions (POST).', cors);
  if (!ORIGINS.test(origin)) return answer(403, 'Ce relais ne sert que les pages de Bileyi ya Bana.', cors);
  const service = SERVICES[new URL(request.url).pathname.split('/').pop()];
  if (!service) return answer(404, 'Service inconnu : gemini ou openrouter.', cors);
  const text = await request.text();
  if (text.length > MAX) return answer(413, 'Question trop longue.', cors);
  let asked;
  try {
    asked = JSON.parse(text);
  } catch {
    return answer(400, 'Question illisible.', cors);
  }
  if (!asked || typeof asked.body !== 'object' || !service.model.test(String(asked.model))) {
    return answer(400, 'Modèle non permis par le relais.', cors);
  }
  const key = Netlify.env.get(service.key);
  if (!key) return answer(503, 'Le relais n’a pas de clé pour ce service.', cors);
  const [url, headers, body] = service.request(asked.model, asked.body, key);
  let resp;
  try {
    resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    return answer(502, 'Le service d’IA ne répond pas.', cors);
  }
  return new Response(resp.body, { status: resp.status, headers: { ...cors,
    'content-type': resp.headers.get('content-type') || 'text/event-stream', 'cache-control': 'no-store' } });
};

export const config = { path: '/api/ia/*' };
