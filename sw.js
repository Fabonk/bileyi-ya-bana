/* Bileyi ya Bana, version HTML statique : the service worker of the web app, the site put on the home screen of a phone
   from the browser (on iPhone: Safari, "Sur l'écran d'accueil", no computer needed). Every page and file read is kept
   on the phone and shown from there the next time, also without internet; the home page can fetch all the others
   (byb.js, "Lire sans internet"). When the site put online changes (version.json), the files that changed
   (manifest.txt: the MD5 of every file) are taken out of the copy and read again from the internet when opened.
   Not used by the Android, iPhone and Windows apps: they carry the whole site and update it themselves. */
'use strict';
var FILES = 'byb-site';   // the copy of the site: one entry per file, its address without ?… or #…
var META = 'byb-meta';    // the version and the manifest.txt the copy goes with
var BASE = new URL('./', self.location.href).href;
// kept as soon as the app is put on the phone: the home page and what every page needs
var FIRST = ['index.html', 'recherche.html', 'assistant.html', 'favoris.html', 'don.html', 'themes.html',
  'sermons/index.html', 'livres/index.html', 'cantiques/index.html', 'manifest.webmanifest',
  'assets/byb.css', 'assets/cadre.js', 'assets/byb.js', 'assets/moteur.js', 'assets/recherche.js', 'assets/assistant.js',
  'assets/logo-96.png', 'assets/logo-320.png', 'assets/icon-192.png',
  'data/citations.js', 'data/catalogue.js', 'data/index/dir.js'];
var OUTSIDE = ['version.json', 'manifest.txt', 'sw.js'];  // always asked to the internet

/** The file of the site an address shows ("sermons/1963/63-0318.html"), or null outside the site. */
function fileOf(url) {
  var u = new URL(url), path = u.origin + u.pathname;
  if (path.indexOf(BASE) !== 0) return null;
  var rel = path.slice(BASE.length);
  if (rel === '' || rel.slice(-1) === '/') rel += 'index.html';
  return rel;
}
// read from the site online, not from the browser's own cache (it could give the version before an update)
function download(rel) { return fetch(BASE + rel, { cache: 'no-cache' }); }

function manifest(text) {
  var files = {};
  text.split('\n').forEach(function (line) {
    var a = line.indexOf(' '), b = line.indexOf(' ', a + 1);
    if (a > 0 && b > a) files[line.slice(b + 1)] = line.slice(0, a);
  });
  return files;
}
function readMeta(meta, name) { return meta.match(BASE + '.' + name).then(function (r) { return r ? r.text() : null; }); }
function writeMeta(meta, name, text) { return meta.put(BASE + '.' + name, new Response(text)); }

/** The version online: when it is not the one of the copy, the files that changed leave the copy. */
var checking = null, checked = 0;
function check() {
  if (checking) return checking;
  if (Date.now() - checked < 10 * 60 * 1000) return Promise.resolve();
  checked = Date.now();
  checking = Promise.all([download('version.json').then(function (r) { return r.json(); }), caches.open(META)])
    .then(function (a) {
      var version = a[0].version, meta = a[1];
      return readMeta(meta, 'version').then(function (mine) {
        if (mine === version) return;
        return Promise.all([download('manifest.txt').then(function (r) { if (!r.ok) throw new Error(); return r.text(); }),
          readMeta(meta, 'manifest'), caches.open(FILES)]).then(function (b) {
          var now = manifest(b[0]), before = b[1] ? manifest(b[1]) : {}, files = b[2];
          return files.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
              var rel = decodeURIComponent(fileOf(k.url) || '');
              if (!now[rel] || before[rel] !== now[rel]) return files.delete(k);
            }));
          }).then(function () {
            return Promise.all([writeMeta(meta, 'version', version), writeMeta(meta, 'manifest', b[0])]);
          });
        });
      });
    })
    .catch(function () { /* no internet: the copy stays as it is */ })
    .then(function () { checking = null; });
  return checking;
}

self.addEventListener('install', function (e) {
  e.waitUntil(Promise.all([caches.open(FILES), caches.open(META)]).then(function (a) {
    var files = a[0], meta = a[1];
    // the version first: what is kept from now on goes with it
    return Promise.all([download('version.json').then(function (r) { return r.text(); }),
      download('manifest.txt').then(function (r) { return r.text(); })]).then(function (b) {
      return Promise.all([writeMeta(meta, 'version', JSON.parse(b[0]).version), writeMeta(meta, 'manifest', b[1])]);
    }).then(function () {
      return Promise.all(FIRST.map(function (rel) {
        return download(rel).then(function (r) { if (r.ok) return files.put(BASE + rel, r); }).catch(function () {});
      }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim().then(check));
});

// the pages ask at each opening (byb.js); the look online is made at most every 10 minutes
self.addEventListener('message', function (e) {
  if (e.data === 'verifier') e.waitUntil(check());
});

var NOT_HERE = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>Sans connexion · Bileyi ya Bana</title><style>body{margin:0;padding:3rem 1.5rem;font:17px/1.5 system-ui,sans-serif;'
  + 'background:#f5f3ef;color:#1d1b18;text-align:center}@media(prefers-color-scheme:dark){body{background:#0f172a;color:#e8edf5}}'
  + 'a{color:#0f3d8e;font-weight:600}@media(prefers-color-scheme:dark){a{color:#8db2f5}}</style></head><body>'
  + '<p>Cette page n’est pas encore sur ce téléphone : il faut une connexion à internet pour l’ouvrir la première fois.</p>'
  + '<p>Pour lire toute la bibliothèque sans internet : page d’accueil, « Lire sans internet ».</p>'
  + '<p><a href="' + BASE + 'index.html">Accueil</a></p></body></html>';

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var rel = fileOf(req.url);
  if (rel === null || OUTSIDE.indexOf(rel) >= 0) return;
  e.respondWith(caches.open(FILES).then(function (files) {
    var key = BASE + rel;
    return files.match(key).then(function (kept) {
      if (kept) return kept;
      return download(rel).then(function (r) {
        if (r.ok) e.waitUntil(files.put(key, r.clone()).catch(function () { /* phone full: shown, not kept */ }));
        return r;
      }, function () {
        if (req.mode === 'navigate') return new Response(NOT_HERE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        return Response.error();
      });
    });
  }));
});
