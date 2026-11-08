/* Bileyi ya Bana, version HTML statique : what every page has around its own content, written here once instead of in
   each of the ~4250 pages (since 2026-11-08): the header (logo, search, theme, menu) and the footer. The pages are
   smaller, and a change of the menu or of the footer changes only this file in the updates of the apps.
   Loaded without "defer" as the first thing of <body>: the header is there before the page shows.

   It also writes the text of the sermons (Shekinah) and of the Bible chapters. Their pages have an empty
   <div class="texte" data-t="n"> followed by <script src="data/textes/n.js">: that file, also used by the search and
   the Chat IA, calls BYB.txt(n, rows) while the page loads, so the text is written once in the whole site.
   rows: [[seq, § number (carried over), text, flags]], flags 1 = a paragraph without its own number, 2 = a reading
   (class "lecture"); Bible: [[verse, verse, text]] (data-f="b").

   build_site.py puts the HTML of the header and the footer in C below ({R}: the way to the root of the site). */
(function () {
  'use strict';
  var d = document, html = d.documentElement, BYB = window.BYB = window.BYB || {};
  var ROOT = html.getAttribute('data-root') || '', SECTION = html.getAttribute('data-section') || '';
  var C = {"haut": "<a class=\"skip\" href=\"#main\">Aller au contenu</a>\n<header class=\"top\">\n<div class=\"bar\">\n<a class=\"brand\" href=\"{R}index.html\"><img src=\"{R}assets/logo-96.png\" alt=\"\" width=\"36\" height=\"36\"><span><b>Bileyi ya Bana</b><small>William Branham en français</small></span></a>\n<form class=\"qs\" action=\"{R}recherche.html\" role=\"search\"><input name=\"q\" type=\"search\" placeholder=\"Rechercher…\" aria-label=\"Rechercher\"></form>\n<button class=\"theme\" type=\"button\" aria-label=\"Thème clair ou sombre\" title=\"Thème clair ou sombre\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 3.5a8.5 8.5 0 0 1 0 17z\" fill=\"currentColor\"/></svg></button>\n</div>\n<nav class=\"main\" aria-label=\"Sections\"><a href=\"{R}index.html\" data-nav=\"accueil\" data-k=\"index\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 11.5 12 4l9 7.5\"/><path d=\"M5.5 10v10h13V10\"/><path d=\"M10 20v-5.5h4V20\"/></svg><span>Accueil</span></a><a href=\"{R}sermons/index.html\" data-nav=\"sermons\" data-k=\"sermons\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5.5 11a6.5 6.5 0 0 0 13 0\"/><path d=\"M12 17.5V21M8.5 21h7\"/></svg><span>Sermons</span></a><a href=\"{R}livres/index.html\" data-nav=\"livres\" data-k=\"livres\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z\"/><path d=\"M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5\"/><path d=\"M9 7.5h7\"/></svg><span>Livres</span></a><a href=\"{R}cantiques/index.html\" data-nav=\"cantiques\" data-k=\"cantiques\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M9 18V5.5l11-2.5v12.5\"/><circle cx=\"6.5\" cy=\"18\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"15.5\" r=\"2.5\"/></svg><span>Cantiques</span></a><a href=\"{R}bible/index.html\" data-nav=\"bible\" data-k=\"bible\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z\"/><path d=\"M12 7v8M9.2 9.8h5.6\"/></svg><span>Bible</span></a><a href=\"{R}recherche.html\" data-nav=\"recherche\" data-k=\"recherche\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m20 20-4.8-4.8\"/></svg><span>Recherche</span></a><a href=\"{R}assistant.html\" data-nav=\"assistant\" data-k=\"assistant\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z\"/><path d=\"m12 6.5.9 2 2.1.9-2.1.9-.9 2-.9-2-2.1-.9 2.1-.9z\"/></svg><span>Chat IA</span></a><a href=\"{R}favoris.html\" data-nav=\"favoris\" data-k=\"favoris\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z\"/></svg><span>Favoris</span></a></nav>\n</header>", "bas": "<footer class=\"foot\">\n<div class=\"foot-in\">\n<p>© 2026 Bileyi ya Bana · <a class=\"wa\" href=\"https://wa.me/243820366841\"><svg class=\"wa-ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z\"/></svg>WhatsApp +243 820 366 841</a></p>\n<p><a class=\"button don-btn\" href=\"{R}don.html\"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z\"/></svg>Faire un don</a></p>\n</div>\n</footer>"};
  function fill(s) { return String(s || '').replace(/\{R\}/g, ROOT); }

  // the header, just after this script
  var me = d.currentScript;
  if (me && C.haut) {
    me.insertAdjacentHTML('afterend', fill(C.haut));
    var on = SECTION && d.querySelector('nav.main [data-k="' + SECTION + '"]');
    if (on) on.setAttribute('aria-current', 'page');
  }
  // the footer, at the end of the page
  if (C.bas) d.addEventListener('DOMContentLoaded', function () { d.body.insertAdjacentHTML('beforeend', fill(C.bas)); });

  // the text of a sermon or of a Bible chapter (see above); the search engine (moteur.js) puts its own BYB.txt later
  var NOTE = /\[[^\[\]]{1,160}\]/g;
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]; });
  }
  function num(n) { return '<a class="n" id="p' + n + '" href="#p' + n + '">' + n + '</a>'; }
  BYB.txt = function (n, rows) {
    var box = d.querySelector('.texte[data-t="' + n + '"]');
    if (!box || box.querySelector('p')) return;
    var bible = box.getAttribute('data-f') === 'b';
    box.innerHTML = '\n' + rows.map(function (r) {
      if (bible) return '<p id="s' + r[0] + '">' + num(r[1]) + esc(r[2]) + '</p>';
      var f = r[3] || 0, k = f & 1 ? 0 : r[1];
      return '<p id="s' + r[0] + '"' + (f & 2 ? ' class="lecture"' : '') + '>' + (k ? num(k) : '')
        + esc(r[2]).replace(NOTE, '<span class="note">$&</span>') + '</p>';
    }).join('\n') + '\n';
  };
})();
