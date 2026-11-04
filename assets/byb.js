/* Bileyi ya Bana, version HTML statique : what runs in the browser on every page.
   Theme, text size, "go to §", favourites, paragraphs highlighted by the reader, resume reading, highlighting of the
   searched words, list filters, quotation of the day. No server: everything is kept in this browser (localStorage). */
(function () {
  'use strict';
  var d = document, html = d.documentElement;
  var ROOT = html.getAttribute('data-root') || '';
  var KIND = html.getAttribute('data-kind') || 'page';
  var BYB = window.BYB = window.BYB || {};

  // ------------------------------------------------------------ small tools
  function get(k, def) {
    try { var v = localStorage.getItem('byb.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  function set(k, v) { try { localStorage.setItem('byb.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function setRaw(k, v) { try { if (v == null) localStorage.removeItem('byb.' + k); else localStorage.setItem('byb.' + k, v); } catch (e) { /* idem */ } }
  function getRaw(k) { try { return localStorage.getItem('byb.' + k); } catch (e) { return null; } }
  function norm(s) {
    return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  }
  function words(s) { return norm(s).match(/[a-z0-9]+/g) || []; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function $(sel, el) { return (el || d).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || d).querySelectorAll(sel)); }
  /** Path of the current page from the site root: "sermons/1963/63-0318.html". */
  function here() {
    var base = new URL(ROOT || './', location.href).href;
    var u = location.href.split('#')[0].split('?')[0];
    return u.indexOf(base) === 0 ? u.slice(base.length) || 'index.html' : u;
  }
  function toast(msg) {
    var t = d.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    d.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }
  function copy(text, msg) {
    function fallback() {
      var t = d.createElement('textarea');
      t.value = text;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      d.body.appendChild(t);
      t.select();
      try { d.execCommand('copy'); } catch (e) { /* nothing more to try */ }
      t.remove();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
    toast(msg || 'Copié');
  }
  BYB.norm = norm;
  BYB.words = words;
  BYB.esc = esc;
  BYB.store = { get: get, set: set };
  BYB.toast = toast;
  BYB.copy = copy;
  // the gift numbers of the footer are copied when touched (to paste them in M-Pesa or Orange Money)
  d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (b) copy(b.getAttribute('data-copy'), 'Numéro copié : ' + b.getAttribute('data-copy'));
  });
  // the footer button now says "Faire un don" (2026-11-04). Pages built before still say "Faites un don" in their
  // HTML until the next full build: changed here, so that the apps only download this file (not ~4250 pages)
  Array.prototype.forEach.call(d.querySelectorAll('.don-btn'), function (a) {
    var t = a.lastChild;
    if (t && t.nodeType === 3 && t.nodeValue.indexOf('Faites un don') >= 0) t.nodeValue = t.nodeValue.replace('Faites un don', 'Faire un don');
  });

  // ------------------------------------------------------------ accent-insensitive patterns (search and highlighting)
  var CLS = { a: '[aàâäáãå]', e: '[eéèêë]', i: '[iîïíì]', o: '[oôöóòõ]', u: '[uùûüú]', c: '[cç]', n: '[nñ]', y: '[yÿ]' };
  function wordPattern(w, prefix) {
    var s = '';
    for (var i = 0; i < w.length; i++) {
      var ch = w[i];
      if ((ch === 'o' || ch === 'a') && w[i + 1] === 'e') {
        s += ch === 'o' ? '(?:[oôö][eéèêë]|œ)' : '(?:[aàâä][eéèêë]|æ)';
        i++;
        continue;
      }
      s += CLS[ch] || ch;
    }
    return s + (prefix ? '[\\p{L}\\p{N}]*' : '(?![\\p{L}\\p{N}])');
  }
  /** Parses a query: "exact phrase", word, prefix* -> [{words:[...], prefix:bool}] */
  function parseQuery(q) {
    var out = [], m, re = /"([^"]+)"|«\s*([^»]+?)\s*»|(\S+)/g;
    while ((m = re.exec(q))) {
      var phrase = m[1] || m[2];
      if (phrase) {
        var ws = words(phrase);
        if (ws.length) out.push({ words: ws, phrase: true, prefix: false });
      } else {
        var raw = m[3], prefix = /\*$/.test(raw);
        words(raw).forEach(function (w, i, all) {
          out.push({ words: [w], phrase: false, prefix: prefix && i === all.length - 1 });
        });
      }
    }
    return out;
  }
  /** One regular expression that finds every part of the query in a text (with accents or not). */
  function queryRegex(parts, all) {
    var alts = parts.filter(function (p) { return all || p.phrase || p.prefix || p.words[0].length > 2; }).map(function (p) {
      return p.words.map(function (w, i) { return wordPattern(w, p.prefix && i === p.words.length - 1); }).join('[^\\p{L}\\p{N}]+');
    });
    if (!alts.length) return null;
    return new RegExp('(^|[^\\p{L}\\p{N}])(' + alts.join('|') + ')', 'giu');
  }
  /** Plain text -> HTML with the matches in <mark>. */
  function markText(text, re) {
    if (!re) return esc(text);
    var out = '', last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      var start = m.index + m[1].length;
      out += esc(text.slice(last, start)) + '<mark>' + esc(m[2]) + '</mark>';
      last = start + m[2].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    return out + esc(text.slice(last));
  }
  BYB.parseQuery = parseQuery;
  BYB.queryRegex = queryRegex;
  BYB.markText = markText;

  // ------------------------------------------------------------ theme
  var themeBtn = $('.theme');
  function prefersDark() { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var now = html.getAttribute('data-theme') || (prefersDark() ? 'dark' : 'light');
      var next = now === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      setRaw('theme', next === (prefersDark() ? 'dark' : 'light') ? null : next);
    });
  }

  // ------------------------------------------------------------ favourites
  function favs() { return get('favs', []); }
  function saveFavs(list) { set('favs', list); }
  function favIndex(u, a) {
    var list = favs();
    for (var i = 0; i < list.length; i++) if (list[i].u === u && (list[i].a || '') === (a || '')) return i;
    return -1;
  }
  function toggleFav(item) {
    var list = favs(), i = favIndex(item.u, item.a);
    if (i >= 0) list.splice(i, 1);
    else list.unshift(Object.assign({ at: Date.now() }, item));
    saveFavs(list);
    return i < 0;
  }

  // ------------------------------------------------------------ highlights: paragraphs coloured by the reader
  // byb.hl = [{u: page, a: id of the paragraph, c: colour 1-4, t: reference, x: start of the text, at: date}]
  var HL = ['Jaune', 'Vert', 'Bleu', 'Rose'];
  function hls() { return get('hl', []); }
  function hlIndex(list, u, a) {
    for (var i = 0; i < list.length; i++) if (list[i].u === u && list[i].a === a) return i;
    return -1;
  }
  function swatches(attr, current) {
    return HL.map(function (name, i) {
      return '<button type="button" class="sw hl-' + (i + 1) + (current === i + 1 ? ' on' : '') + '" ' + attr + '="' + (i + 1)
        + '" aria-label="' + name + '" title="' + name + '"></button>';
    }).join('') + '<button type="button" class="sw sw-0' + (current === 0 ? ' on' : '') + '" ' + attr + '="0" aria-label="Effacer" title="Effacer">✕</button>';
  }

  // ------------------------------------------------------------ reading pages
  var doc = $('article.doc'), texte = doc && $('.texte', doc);
  var LABEL = doc ? doc.getAttribute('data-label') : d.title;

  function numberOf(p) {
    // § number of a paragraph (verse number in the Bible): its own, or the one of the paragraph that carries it
    for (var el = p, k = 0; el && k < 80; el = el.previousElementSibling, k++) {
      var n = el.querySelector && el.querySelector('.n');
      if (n) return (KIND === 'bible' ? 'v. ' : '§ ') + n.textContent;
      if (el.classList && el.classList.contains('pg')) return el.textContent;
    }
    return '';
  }
  /** "63-0318 § 12 — Title", "Jean 3:16", "Title, p. 63": the reference of a paragraph. */
  function refOf(p) {
    var n = numberOf(p);
    if (!n) return LABEL;
    if (KIND === 'bible') return LABEL + ':' + n.slice(3);
    return LABEL.indexOf(' — ') > 0 ? LABEL.replace(' — ', ' ' + n + ' — ') : LABEL + ', ' + n;
  }
  function textOf(p) {
    var t = p.textContent, n = p.querySelector('.n, .sn, .lbl');
    if (n && t.indexOf(n.textContent) === 0) t = t.slice(n.textContent.length);
    return t.replace(/\s+/g, ' ').trim();
  }
  // the reference written after a copied quotation: author, title, date (data-cite of the page) and paragraphs
  var CITE = doc && doc.getAttribute('data-cite');
  function citeOf(p1, p2) {
    var a = p1 && numberOf(p1), b = p2 && numberOf(p2);
    var num = a && b && b !== a ? a + '-' + b.replace(/^(§|v\.) /, '') : a || b || '';
    if (KIND === 'bible') return (num ? LABEL + ':' + num.slice(3) : LABEL) + ' (Louis Segond 1910)';
    if (CITE) return CITE + (num ? ', ' + num : '');
    return 'William Branham, ' + (p1 ? refOf(p1) : LABEL);
  }
  // a passage selected and copied by hand also carries its reference
  d.addEventListener('copy', function (e) {
    var sel = window.getSelection && window.getSelection();
    if (!doc || !sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return;
    var range = sel.getRangeAt(0), texte = doc.querySelector('.texte');
    if (!texte || !texte.contains(range.commonAncestorContainer)) return;
    var para = function (node) {
      var el = node.nodeType === 1 ? node : node.parentNode;
      return el && el.closest && el.closest('.texte > p[id], .texte > h2[id], .texte > h3[id]');
    };
    var box = d.createElement('div');
    box.appendChild(range.cloneContents());
    Array.prototype.forEach.call(box.querySelectorAll('.n, .sn, .lbl, button'), function (x) { x.remove(); });
    var parts = Array.prototype.map.call(box.querySelectorAll('p, h2, h3, li'), function (x) {
      return x.textContent.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    var text = parts.length ? parts.join('\n\n') : box.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    e.clipboardData.setData('text/plain', '« ' + text + ' »\n— ' + citeOf(para(range.startContainer), para(range.endContainer)));
    e.preventDefault();
  });
  function flash(el) {
    el.classList.add('flash');
    setTimeout(function () { el.classList.remove('flash'); }, 1600);
  }

  // ------------------------------------------------------------ reading aloud, with a French man's voice
  // The voices of the browser read in the page (iPhone and iPad: Thomas; Windows: Paul; Chrome…). The WebView of the
  // Android app has none: from the app 1.3.0 (window.BYB_APP.voix), the page sends its sentences to the app (App.js),
  // which reads them with the phone's own voice. BYB.voix.lire(items, from): items = [{el, text}], one per sentence.
  var MEN = /thomas|nicolas|\bpaul\b|henri|r[ée]my|antoine|j[ée]r[ée]me|alain|fabrice|claude|guillaume|gilles|daniel|mathieu|yves|jacques|\bmale|homme|x-fr[bd]\b/i;
  var WOMEN = /am[ée]lie|audrey|aur[ée]lie|hortense|julie|denise|[ée]lo[ïi]se|virginie|marie|c[ée]line|brigitte|coralie|jacqueline|jos[ée]phine|charline|ariane|vivienne|sylvie|female|femme|google fran[çc]ais|x-fr[ac]\b|x-vlf/i;
  var SPEEDS = [0.8, 1, 1.25, 1.5];
  var ICON_V = {
    prec: '<path d="M6.5 5v14M18 6.2v11.6L9.2 12z"/>', suiv: '<path d="M17.5 5v14M6 6.2v11.6l8.8-5.8z"/>',
    lire: '<path d="M8 5.5v13l10.5-6.5z"/>', pause: '<path d="M7 5.5h3.6v13H7zM13.4 5.5H17v13h-3.6z"/>'
  };
  function svgV(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON_V[k] + '</svg>'; }
  /** The sentences of a text, in pieces short enough for every voice (some stop after about 15 seconds). */
  function sentences(text) {
    var out = [], cur = '';
    (String(text).match(/[^.!?…;:]+[.!?…;:]*[»”"')\]]*\s*|[.!?…;:]+\s*/g) || []).forEach(function (part) {
      if (cur && (cur + part).length > 240) { out.push(cur.trim()); cur = ''; }
      cur += part;
      while (cur.length > 300) {
        var cut = cur.lastIndexOf(' ', 280);
        if (cut < 80) cut = 280;
        out.push(cur.slice(0, cut).trim());
        cur = cur.slice(cut);
      }
    });
    if (cur.trim()) out.push(cur.trim());
    return out.filter(function (s) { return /[\wÀ-ÿ]/.test(s); });
  }
  // a voice to read with: the browser's, or the Android app's (before 1.3.0 it has none: the button then says so)
  var CAN_SPEAK = !!(window.speechSynthesis || window.ReactNativeWebView);
  var voix = BYB.voix = (function () {
    var synth = window.speechSynthesis, items = [], at = 0, end = 0, playing = false, token = null, bar = null, lit = null;
    var rate = get('vitesse', 1);
    function app() { return !!(window.BYB_APP && window.BYB_APP.voix && window.ReactNativeWebView); }
    function tell(msg) { try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) { /* not in the app */ } }
    // the voices of the browser come a moment after the page (Chrome): waited for, a second and a half at most
    function voices() {
      return new Promise(function (ok) {
        if (!synth || synth.getVoices().length) return ok(synth ? synth.getVoices() : []);
        var done = false;
        function fin() { if (!done) { done = true; ok(synth.getVoices()); } }
        if (synth.addEventListener) synth.addEventListener('voiceschanged', fin);
        setTimeout(fin, 1500);
      });
    }
    function best(list) {
      var fr = list.filter(function (v) { return /^fr/i.test(v.lang); });
      function score(v) {
        return (/^fr[-_]fr/i.test(v.lang) ? 2 : 0) + (MEN.test(v.name) ? 10 : 0) - (WOMEN.test(v.name) ? 10 : 0) + (v.localService ? 1 : 0);
      }
      fr.sort(function (a, b) { return score(b) - score(a); });
      return fr[0] || null;
    }
    function makeBar() {
      bar = d.createElement('div');
      bar.className = 'voix-bar';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Lecture à voix haute');
      bar.innerHTML = '<button type="button" data-v="prec" title="Paragraphe précédent" aria-label="Paragraphe précédent">' + svgV('prec') + '</button>'
        + '<button type="button" data-v="pause" class="voix-main" title="Pause" aria-label="Pause">' + svgV('pause') + '</button>'
        + '<button type="button" data-v="suiv" title="Paragraphe suivant" aria-label="Paragraphe suivant">' + svgV('suiv') + '</button>'
        + '<button type="button" data-v="vitesse" title="Vitesse de lecture"></button>'
        + '<span class="voix-ou" aria-live="polite"></span>'
        + '<button type="button" data-v="stop" title="Arrêter la lecture" aria-label="Arrêter la lecture">✕</button>';
      d.body.appendChild(bar);
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-v]');
        if (!b) return;
        var v = b.getAttribute('data-v');
        if (v === 'pause') { if (playing) halt(); else go(); }
        if (v === 'stop') stop();
        if (v === 'prec' || v === 'suiv') jump(v === 'suiv' ? 1 : -1);
        if (v === 'vitesse') {
          rate = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] || 1;
          set('vitesse', rate);
          if (playing) { halt(); go(); } else look();
        }
      });
    }
    function look() {
      if (!bar) return;
      var main = $('.voix-main', bar);
      main.innerHTML = svgV(playing ? 'pause' : 'lire');
      main.title = playing ? 'Pause' : 'Reprendre';
      main.setAttribute('aria-label', main.title);
      $('[data-v=vitesse]', bar).textContent = String(rate).replace('.', ',') + '×';
      var it = items[at], where = it && it.el && it.el.closest && it.el.closest('.texte') ? numberOf(it.el) : '';
      $('.voix-ou', bar).textContent = where || (it ? 'Lecture' : '');
    }
    function mark(i) {
      at = i;
      var el = items[i] && items[i].el;
      if (el !== lit) {
        if (lit) lit.classList.remove('voix-ici');
        lit = el || null;
        if (lit) {
          lit.classList.add('voix-ici');
          var r = lit.getBoundingClientRect();
          if (r.top < 120 || r.top > window.innerHeight * 0.6) lit.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
      look();
    }
    function speakWeb(list) {
      if (!playing) return;
      if (at >= items.length) { done(); return; }
      var u = new SpeechSynthesisUtterance(items[at].text), v = best(list), mine = token = {};
      u.lang = v ? v.lang : 'fr-FR';
      if (v) u.voice = v;
      if (v && !MEN.test(v.name) && WOMEN.test(v.name)) u.pitch = 0.8;  // only a woman's voice here: a little lower
      u.rate = rate;
      u.onstart = function () { if (token === mine) mark(at); };
      u.onend = function () { if (token !== mine || !playing) return; at++; speakWeb(list); };
      u.onerror = function (e) {
        if (token !== mine || !playing || e.error === 'interrupted' || e.error === 'canceled') return;
        at++;
        speakWeb(list);
      };
      synth.speak(u);
    }
    function go() {
      if (!items.length) return;
      if (at >= items.length) at = 0;
      playing = true;
      d.documentElement.classList.add('voix-on');
      bar.hidden = false;
      mark(at);
      if (app()) {
        end = Math.min(items.length, at + 400);  // the rest is sent when these are read
        tell({ voix: 'parler', textes: items.slice(at, end).map(function (it) { return it.text; }), depuis: at, vitesse: rate });
        return;
      }
      voices().then(function (list) {
        if (!list.length) {  // no voice here (the Android app before 1.3.0)
          stop();
          toast(window.ReactNativeWebView ? 'Lecture à voix haute : installez la dernière version de l’application.'
            : 'Pas de voix de lecture sur cet appareil.');
          return;
        }
        synth.cancel();
        speakWeb(list);
      });
    }
    function halt() {
      playing = false;
      token = null;
      if (app()) tell({ voix: 'stop' });
      else if (synth) synth.cancel();
      look();
    }
    function stop() {
      halt();
      items = [];
      if (lit) lit.classList.remove('voix-ici');
      lit = null;
      if (bar) bar.hidden = true;
      d.documentElement.classList.remove('voix-on');
    }
    function done() { stop(); }
    function jump(dir) {
      var el = items[at] && items[at].el, i = at;
      if (dir > 0) { while (i < items.length && items[i].el === el) i++; }
      else {
        while (i > 0 && items[i - 1].el === el) i--;           // the start of this paragraph…
        if (i === at && i > 0) {                                // …or, already there, of the one before
          var prev = items[i - 1].el;
          i--;
          while (i > 0 && items[i - 1].el === prev) i--;
        }
      }
      if (i >= items.length) { stop(); return; }
      halt();
      at = i;
      go();
    }
    // what the app says (App.js): the sentence being read, the end of what was sent
    window.BYB_VOIX_EVENT = function (ev) {
      if (!playing || !ev) return;
      if (ev.type === 'debut' && ev.i >= 0 && ev.i < items.length) mark(ev.i);
      if (ev.type === 'fin') { if (end < items.length) { at = end; go(); } else done(); }
      if (ev.type === 'erreur') { stop(); toast('La voix du téléphone n’a pas pu lire ce texte.'); }
    };
    window.addEventListener('pagehide', function () { if (playing) halt(); });
    return {
      /** Reads the items from the one at index from (default 0). */
      lire: function (list, from) {
        halt();
        if (!bar) makeBar();
        if (lit) lit.classList.remove('voix-ici');
        lit = null;
        items = list.filter(function (it) { return it && it.text; });
        at = Math.max(0, Math.min(items.length - 1, from || 0));
        go();
      },
      stop: stop,
      actif: function () { return !!items.length; },
      phrases: sentences
    };
  })();

  if (doc) {
    // text size
    var fs = parseInt(getRaw('fs'), 10) || 19;
    $$('[data-act=smaller],[data-act=bigger]', doc).forEach(function (b) {
      b.addEventListener('click', function () {
        fs = Math.max(14, Math.min(30, fs + (b.getAttribute('data-act') === 'bigger' ? 1 : -1)));
        html.style.setProperty('--fs', fs + 'px');
        setRaw('fs', String(fs));
      });
    });
    $$('[data-act=print]', doc).forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });

    // go to § / page
    var goto = $('form[data-act=goto]', doc);
    if (goto) {
      goto.addEventListener('submit', function (e) {
        e.preventDefault();
        var n = parseInt($('input', goto).value, 10), kind = goto.getAttribute('data-goto');
        if (!n) return;
        var el = null;
        for (var k = n; k > 0 && !el; k--) el = d.getElementById((kind === 'page' ? 'page-' : 'p') + k);
        if (!el) { toast('Introuvable'); return; }
        var target = kind === 'page' ? el.nextElementSibling || el : el.closest('p') || el;
        target.scrollIntoView({ block: 'start' });
        history.replaceState(null, '', '#' + el.id);
        flash(target);
      });
    }

    // favourite: the whole page
    var favBtn = $('[data-act=fav]', doc), page = here();
    function showFav() {
      if (!favBtn) return;
      var on = favIndex(page, '') >= 0;
      favBtn.classList.toggle('on', on);
      favBtn.textContent = on ? '★ Favori' : '☆ Favori';
    }
    if (favBtn) {
      showFav();
      favBtn.addEventListener('click', function () {
        var added = toggleFav({ u: page, a: '', t: LABEL, x: '' });
        showFav();
        toast(added ? 'Ajouté aux favoris' : 'Retiré des favoris');
      });
    }
    // favourite paragraphs of this page
    function markFavParas() {
      $$('.fav-mark', texte).forEach(function (p) { p.classList.remove('fav-mark'); });
      favs().forEach(function (f) {
        if (f.u === page && f.a) {
          var p = d.getElementById(f.a);
          if (p) p.classList.add('fav-mark');
        }
      });
    }
    markFavParas();

    // highlights of this page; "🖍 Surligner" turns on a mode where touching a paragraph colours it
    function hlOf(p) {
      var i = hlIndex(hls(), page, p.id);
      return i < 0 ? 0 : hls()[i].c;
    }
    function paintHl() {
      $$('.hl', texte).forEach(function (el) { el.classList.remove('hl', 'hl-1', 'hl-2', 'hl-3', 'hl-4'); });
      hls().forEach(function (h) {
        var el = h.u === page && d.getElementById(h.a);
        if (el && texte.contains(el)) el.classList.add('hl', 'hl-' + h.c);
      });
    }
    /** Colour c (1-4) on a paragraph, 0 to take it away. */
    function setHl(p, c) {
      var list = hls(), i = hlIndex(list, page, p.id);
      if (i >= 0) list.splice(i, 1);
      if (c) list.unshift({ u: page, a: p.id, c: c, t: refOf(p), x: textOf(p).slice(0, 280), at: Date.now() });
      set('hl', list);
      paintHl();
    }
    if (texte) paintHl();
    var hlBtn = $('[data-act=hl]', doc), hlBar = null, hlColor = get('hlc', 1);
    function hlMode(on) {
      html.classList.toggle('hl-mode', on);
      if (hlBtn) hlBtn.classList.toggle('on', on);
      if (hlBar) { hlBar.remove(); hlBar = null; }
      if (!on) return;
      hlBar = d.createElement('div');
      hlBar.className = 'hl-bar';
      hlBar.setAttribute('role', 'toolbar');
      hlBar.setAttribute('aria-label', 'Surligner');
      hlBar.innerHTML = swatches('data-c', hlColor) + '<button type="button" class="done" data-c="done">Terminé</button>';
      if ($('.hits')) hlBar.classList.add('up');
      d.body.appendChild(hlBar);
      hlBar.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        var c = b.getAttribute('data-c');
        if (c === 'done') { hlMode(false); return; }
        hlColor = Number(c);
        set('hlc', hlColor || 1);
        $$('.sw', hlBar).forEach(function (s) { s.classList.toggle('on', s === b); });
      });
      toast(hlColor ? 'Touchez un paragraphe pour le surligner' : 'Touchez un paragraphe surligné pour l’effacer');
    }
    if (hlBtn && texte) hlBtn.addEventListener('click', function () { hlMode(!html.classList.contains('hl-mode')); });
    if (texte) texte.addEventListener('click', function (e) {
      if (!html.classList.contains('hl-mode')) return;
      var p = e.target.closest && e.target.closest('.texte > p[id], .texte > h2[id], .texte > h3[id]');
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();  // no § menu, no link while highlighting
      setHl(p, !hlColor || hlOf(p) === hlColor ? 0 : hlColor);
    }, true);

    // menu of a paragraph number: link, quotation, favourite, highlight
    var menu = null;
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    d.addEventListener('click', function (e) {
      var n = e.target.closest && e.target.closest('.texte .n');
      if (!n) { if (menu && !menu.contains(e.target)) closeMenu(); return; }
      e.preventDefault();
      closeMenu();
      var p = n.closest('p'), num = n.textContent, ref = refOf(p), bible = KIND === 'bible';
      history.replaceState(null, '', '#' + n.id);
      var text = textOf(p);
      var isFav = favIndex(page, p.id) >= 0;
      menu = d.createElement('div');
      menu.className = 'pmenu';
      menu.innerHTML = '<button data-m="link">Copier le lien ' + (bible ? 'du verset ' : 'du § ') + esc(num) + '</button>'
        + '<button data-m="quote">Copier la citation</button>'
        + '<button data-m="fav">' + (isFav ? '★ Retirer des favoris' : '☆ Ajouter aux favoris') + '</button>'
        + '<div class="pm-hl"><span>Surligner</span>' + swatches('data-m', hlOf(p) || -1) + '</div>'
        + (CAN_SPEAK ? '<button data-m="voix">🔊 Écouter à partir d’ici</button>' : '')
        + '<button data-m="ia">✦ Expliquer avec l’IA</button>';
      var r = n.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + d.documentElement.clientWidth - 236)) + 'px';
      menu.style.top = (r.bottom + window.scrollY + 6) + 'px';
      d.body.appendChild(menu);
      menu.addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        var m = b.getAttribute('data-m');
        if (m === 'link') copy(location.href.split('#')[0].split('?')[0] + '#' + n.id, 'Lien copié');
        if (m === 'quote') copy('« ' + text + ' »\n— ' + citeOf(p, p), 'Citation copiée');
        if (m === 'fav') {
          var added = toggleFav({ u: page, a: p.id, t: ref, x: text.slice(0, 280) });
          markFavParas();
          toast(added ? 'Ajouté aux favoris' : 'Retiré des favoris');
        }
        if (/^\d$/.test(m)) {
          setHl(p, Number(m));
          toast(Number(m) ? 'Surligné' : 'Surlignage effacé');
        }
        if (m === 'ia') loadAssistant().then(function (ia) { ia.open(p); });
        if (m === 'voix') listenFrom(p);
        closeMenu();
      });
    });
    d.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeMenu();
      if (html.classList.contains('hl-mode')) hlMode(false);
    });

    // resume reading: remember the paragraph at the top of the screen
    var paras = texte ? $$(':scope > p[id], :scope > h2[id], :scope > h3[id]', texte) : [];
    var timer = null;
    function topPara(y) {
      var lo = 0, hi = paras.length - 1, best = paras[0];
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (paras[mid].getBoundingClientRect().bottom > (y || 130)) { best = paras[mid]; hi = mid - 1; } else lo = mid + 1;
      }
      return best;
    }
    function remember() {
      timer = null;
      if (!paras.length) return;
      var p = topPara();
      set('last', { u: page, a: p.id === 's1' ? '' : p.id, t: LABEL, l: p.id === 's1' ? '' : numberOf(p), at: Date.now() });
    }
    if (KIND !== 'cantique') {
      window.addEventListener('scroll', function () { if (!timer) timer = setTimeout(remember, 600); }, { passive: true });
      remember();
    }

    // reading aloud: from the paragraph at the top of the screen ("🔊 Écouter"), or from a § (its menu)
    function readable(el) {
      var c = el.cloneNode(true);
      $$('.n, .note, .sn, .lbl, .pg', c).forEach(function (x) { x.remove(); });  // numbers and editorial notes not read
      return c.textContent.replace(/\s+/g, ' ').trim();
    }
    function listenFrom(p) {
      var list = [], from = 0;
      paras.forEach(function (el) {
        if (el === p) from = list.length;
        sentences(readable(el)).forEach(function (t) { list.push({ el: el, text: t }); });
      });
      if (list.length) voix.lire(list, from);
    }
    var toolbar = $('.tools');
    if (toolbar && paras.length && CAN_SPEAK) {
      var listen = d.createElement('button');
      listen.type = 'button';
      listen.setAttribute('data-act', 'voix');
      listen.title = 'Écouter le texte à voix haute';
      listen.textContent = '🔊 Écouter';
      toolbar.insertBefore(listen, $('[data-act=print]', toolbar));
      listen.addEventListener('click', function () {
        var y = (parseFloat(getComputedStyle(html).scrollPaddingTop) || 130) + 24;
        listenFrom(KIND === 'cantique' || window.scrollY < 200 ? paras[0] : topPara(y));
      });
    }

    // another version of the sermon: opened at the § being read (the translations follow the numbers of the
    // English text, give or take a few)
    $$('a[data-ver]', doc).forEach(function (a) {
      a.addEventListener('click', function () {
        // the paragraph just under the header, where a link to a § puts it (scroll-padding-top of the page)
        var y = (parseFloat(getComputedStyle(html).scrollPaddingTop) || 130) + 24;
        var p = paras.length ? topPara(y) : null, n = p && p.id !== 's1' ? numberOf(p).replace(/^§ /, '') : '';
        a.href = a.href.split('#')[0] + (/^\d+$/.test(n) ? '#p' + n : '');
      });
    });
    // a § this version does not have (link made in another version): the nearest one before it
    var askedP = /^#p(\d+)$/.exec(location.hash);
    if (askedP && !d.getElementById(location.hash.slice(1))) {
      var near = null;
      for (var k = Number(askedP[1]) - 1; k > 0 && !near; k--) near = d.getElementById('p' + k);
      if (near) {
        near = near.closest('p') || near;
        near.scrollIntoView({ block: 'start' });
        flash(near);
      }
    }

    // words of a search: ?q=... highlighted, with a small bar to go from one to the next
    var q = new URLSearchParams(location.search).get('q');
    if (q && texte) highlight(q);
  }

  function highlight(q) {
    var re = queryRegex(parseQuery(q), false);
    if (!re) return;
    var walker = d.createTreeWalker(texte, NodeFilter.SHOW_TEXT), nodes = [], node;
    while ((node = walker.nextNode())) if (node.nodeValue.trim() && !node.parentNode.closest('.n,.pg')) nodes.push(node);
    nodes.forEach(function (tn) {
      var text = tn.nodeValue;
      re.lastIndex = 0;
      if (!re.test(text)) return;
      var span = d.createElement('span');
      span.innerHTML = markText(text, re);
      var frag = d.createDocumentFragment();
      while (span.firstChild) frag.appendChild(span.firstChild);
      tn.parentNode.replaceChild(frag, tn);
    });
    var marks = $$('mark', texte);
    if (!marks.length) return;
    var cur = 0, target = location.hash && d.getElementById(location.hash.slice(1));
    if (target) {
      for (var i = 0; i < marks.length; i++) {
        if (target.compareDocumentPosition(marks[i]) & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)) { cur = i; break; }
      }
    }
    var bar = d.createElement('div');
    bar.className = 'hits';
    bar.innerHTML = '<span></span><button type="button" data-h="-1" aria-label="Précédent">‹</button>'
      + '<button type="button" data-h="1" aria-label="Suivant">›</button><button type="button" data-h="0" aria-label="Fermer">✕</button>';
    d.body.appendChild(bar);
    function show(scroll) {
      marks.forEach(function (m) { m.classList.remove('now'); });
      marks[cur].classList.add('now');
      bar.firstChild.textContent = (cur + 1) + ' / ' + marks.length;
      if (scroll) marks[cur].scrollIntoView({ block: 'center' });
    }
    bar.addEventListener('click', function (e) {
      var h = e.target.getAttribute('data-h');
      if (h === '0') {
        marks.forEach(function (m) { m.replaceWith(d.createTextNode(m.textContent)); });
        bar.remove();
        return;
      }
      if (h) { cur = (cur + Number(h) + marks.length) % marks.length; show(true); }
    });
    show(!target);
    if (target) setTimeout(function () { target.scrollIntoView({ block: 'start' }); flash(target); }, 50);
  }

  // ------------------------------------------------------------ AI assistant, loaded only when asked for
  function loadAssistant() {
    if (BYB.ia) return Promise.resolve(BYB.ia);
    var load = function (src) {
      return new Promise(function (ok, ko) {
        var s = d.createElement('script');
        s.src = ROOT + src;
        s.onload = ok;
        s.onerror = ko;
        d.head.appendChild(s);
      });
    };
    return (BYB.engine ? Promise.resolve() : load('assets/moteur.js')).then(function () { return load('assets/assistant.js'); })
      .then(function () { return BYB.ia; });
  }
  $$('[data-ia-open]').forEach(function (b) {
    b.addEventListener('click', function () {
      loadAssistant().then(function (ia) { ia.open(); }).catch(function () { toast('Chat IA introuvable (dossier assets)'); });
    });
  });

  // ------------------------------------------------------------ a link to a closed block (a theme, a book of the Bible) opens it
  function openTarget() {
    var t = location.hash && d.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (t && t.tagName === 'DETAILS' && !t.open) {
      t.open = true;
      t.scrollIntoView({ block: 'start' });
    }
  }
  openTarget();
  window.addEventListener('hashchange', openTarget);

  // ------------------------------------------------------------ list filters
  $$('input[data-filter]').forEach(function (input) {
    var box = $(input.getAttribute('data-filter'));
    if (!box) return;
    var items = $$('li[data-k]', box), numeric = input.hasAttribute('data-number');
    input.addEventListener('input', function () {
      var v = input.value.trim(), ws = words(v), num = numeric && /^\d+[ab]?$/i.test(v) ? v.toLowerCase() : null;
      items.forEach(function (li) {
        var ok;
        if (num) {
          var n = li.getAttribute('data-n');
          ok = n === num || n.replace(/[ab]$/, '') === num;
        } else {
          var k = li.getAttribute('data-k');
          ok = ws.every(function (w) { return k.indexOf(w) >= 0; });
        }
        li.hidden = !ok;
      });
      $$('ul.list, ol.list', box).forEach(function (ul) {
        var empty = !ul.querySelector('li:not([hidden])');
        ul.hidden = empty;
        var h = ul.previousElementSibling;
        if (h && /^H[23]$/.test(h.tagName)) h.hidden = empty;
      });
    });
    var q0 = new URLSearchParams(location.search).get('filtre');
    if (q0) { input.value = q0; input.dispatchEvent(new Event('input')); }
  });

  // ------------------------------------------------------------ home: quotation of the day, resume reading
  // (data/citations.js is loaded after this script: wait for it)
  d.addEventListener('DOMContentLoaded', quoteOfTheDay);
  // one theme a day (BYB.themes, made by build_site.py), and one of its quotations (BYB.tq): ‹ › change the theme,
  // "Autre citation" shows another quotation on the same theme
  function quoteOfTheDay() {
    var qbox = $('[data-quotes]');
    if (!qbox || !BYB.themes || !BYB.tq) return;
    var now = new Date(), day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5), off = 0, more = 0;
    var T = BYB.themes.length;
    var mod = function (a, n) { return ((a % n) + n) % n; };
    var showQuote = function () {
      var n = day - 1 + off, t = mod(n, T), list = BYB.tq[t];
      if (!list || !list.length) return;
      var q = list[mod(Math.floor(n / T) + more, list.length)], th = BYB.themes[t];
      $('[data-q-label]', qbox).textContent = off || more ? 'Citation' : 'Citation du jour';
      var name = $('[data-q-theme]', qbox);
      name.textContent = th[0];
      name.href = ROOT + 'themes.html#theme-' + (t + 1);
      $('[data-q-refs]', qbox).textContent = th[2];
      $('blockquote p', qbox).textContent = '« ' + q[2] + ' »';
      var ref = $('.ref a', qbox);
      ref.textContent = q[1];
      ref.href = ROOT + q[0];
      $('[data-q-link]', qbox).href = ROOT + q[0];
    };
    $$('[data-q]', qbox).forEach(function (b) {
      b.addEventListener('click', function () { off += Number(b.getAttribute('data-q')); more = 0; showQuote(); });
    });
    var other = $('[data-q-more]', qbox);
    if (other) other.addEventListener('click', function () { more++; showQuote(); });
    showQuote();
  }
  var resume = $('[data-resume]'), last = get('last', null);
  if (resume && last && last.u) {
    resume.innerHTML = 'Reprendre la lecture : <a href="' + esc(ROOT + last.u + (last.a ? '#' + last.a : '')) + '">'
      + esc(last.t) + '</a>' + (last.l ? ' <small>(' + esc(last.l) + ')</small>' : '');
    resume.hidden = false;
  }

  // ------------------------------------------------------------ favourites page
  var favBox = KIND === 'favoris' && $('#favs');
  // favourites and highlights are shown by section, after the part of the site their page belongs to
  var SECTIONS = [['sermons/', 'Sermons'], ['livres/', 'Livres'], ['cantiques/', 'Cantiques'], ['bible/', 'Bible'], ['', 'Autres']];
  function bySection(list, prefix, item) {
    var groups = SECTIONS.map(function () { return []; });
    list.forEach(function (f, i) {
      for (var k = 0; k < SECTIONS.length; k++) if ((f.u || '').indexOf(SECTIONS[k][0]) === 0) { groups[k].push(item(f, i)); break; }
    });
    var shown = SECTIONS.map(function (s, k) { return [s[1], groups[k]]; }).filter(function (g) { return g[1].length; });
    var nav = shown.length > 1 ? '<p class="chips">' + shown.map(function (g) {
      return '<a href="#' + prefix + '-' + g[0].toLowerCase() + '">' + g[0] + ' (' + g[1].length + ')</a>';
    }).join('') + '</p>' : '';
    return nav + shown.map(function (g) {
      return '<h3 class="fav-sec" id="' + prefix + '-' + g[0].toLowerCase() + '">' + g[0] + ' <small>' + g[1].length + '</small></h3>' + g[1].join('');
    }).join('');
  }
  function renderFavs() {
    var list = favs();
    if (!list.length) {
      favBox.innerHTML = '<p class="status">Aucun favori pour le moment. Dans un sermon, touchez le numéro d\'un paragraphe ou le bouton « ☆ Favori ».</p>';
      return;
    }
    favBox.innerHTML = bySection(list, 'fav', function (f, i) {
      return '<div class="result"><button type="button" class="x" data-i="' + i + '">Retirer</button><h3><a href="'
        + esc(ROOT + f.u + (f.a ? '#' + f.a : '')) + '">' + esc(f.t || f.u) + '</a></h3>'
        + (f.x ? '<p class="hit">' + esc(f.x) + (f.x.length >= 280 ? '…' : '') + '</p>' : '')
        + '<p class="sub">ajouté le ' + new Date(f.at || 0).toLocaleDateString('fr-FR') + '</p></div>';
    });
  }
  // the highlighted passages, under the favourites
  var hlBox = KIND === 'favoris' && $('#hls');
  function renderHls() {
    var list = hls(), title = $('[data-hl-title]');
    if (title) title.hidden = !list.length;
    hlBox.innerHTML = bySection(list, 'hl', function (h, i) {
      return '<div class="result hl-item hl-' + h.c + '"><button type="button" class="x" data-r="' + i + '">Retirer</button><h3><a href="'
        + esc(ROOT + h.u + '#' + h.a) + '">' + esc(h.t || h.u) + '</a></h3>'
        + (h.x ? '<p class="hit">' + esc(h.x) + (h.x.length >= 280 ? '…' : '') + '</p>' : '')
        + '<p class="sub">surligné le ' + new Date(h.at || 0).toLocaleDateString('fr-FR') + '</p></div>';
    });
  }
  if (favBox) {
    renderFavs();
    renderHls();
    favBox.addEventListener('click', function (e) {
      var i = e.target.getAttribute('data-i');
      if (i == null) return;
      var list = favs();
      list.splice(Number(i), 1);
      saveFavs(list);
      renderFavs();
    });
    hlBox.addEventListener('click', function (e) {
      var i = e.target.getAttribute('data-r');
      if (i == null) return;
      var list = hls();
      list.splice(Number(i), 1);
      set('hl', list);
      renderHls();
    });
    // the copy holds the favourites and the highlights (a copy made before the highlights is a plain list of favourites)
    var ex = $('[data-act=export]');
    if (ex) ex.addEventListener('click', function () {
      var a = d.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ favs: favs(), hl: hls() }, null, 1)], { type: 'application/json' }));
      a.download = 'favoris-byb.json';
      d.body.appendChild(a);
      a.click();
      a.remove();
    });
    var im = $('[data-act=import]');
    if (im) im.addEventListener('change', function () {
      var file = im.files[0];
      if (!file) return;
      file.text().then(function (t) {
        var saved = JSON.parse(t), list = favs(), marks = hls();
        (Array.isArray(saved) ? saved : saved.favs || []).forEach(function (f) { if (f && f.u && favIndex(f.u, f.a) < 0) list.push(f); });
        (Array.isArray(saved) ? [] : saved.hl || []).forEach(function (h) { if (h && h.u && h.a && hlIndex(marks, h.u, h.a) < 0) marks.push(h); });
        saveFavs(list);
        set('hl', marks);
        renderFavs();
        renderHls();
        toast('Favoris repris');
      }).catch(function () { toast('Fichier illisible'); });
    });
  }

  // the search box of the header shows the current search
  var hq = new URLSearchParams(location.search).get('q');
  if (hq) $$('.qs input, .big-search input').forEach(function (i) { i.value = hq; });

  // ------------------------------------------------------------ the web app
  // The site on the internet, put on the home screen of a phone, works as an app: sw.js keeps the pages read, and the
  // home page can fetch all the others. Not in the Android, iPhone and Windows apps: they carry the whole site.
  var inApp = html.hasAttribute('data-app') || !!window.ReactNativeWebView || !!(window.chrome && window.chrome.webview);
  var web = !inApp && 'serviceWorker' in navigator && (location.protocol === 'https:' && location.hostname !== 'bileyiyabana.example'
    || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  var installed = navigator.standalone === true || !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  BYB.app = { inApp: inApp, installed: web && installed };  // the Chat IA answers in the apps and in the web app
  if (web) {
    navigator.serviceWorker.register(ROOT + 'sw.js').then(function () {
      // a look for a newer version of the site (sw.js does it at most every 10 minutes)
      if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('verifier');
    }).catch(function () { /* the site works without it */ });
  }
  var tiles = KIND === 'accueil' && $('.tiles');
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (tiles && web && ios && !installed && !get('pwa-vu', false)) {
    var tip = d.createElement('p');
    tip.className = 'pwa-tip';
    tip.innerHTML = '<span><b>Installer sur cet appareil</b>, sans ordinateur : dans Safari, touchez <span class="pwa-share" title="Partager">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M8 7l4-4 4 4M8.5 10H6v10.5h12V10h-2.5"/></svg></span>'
      + ' (Partager), puis « Sur l’écran d’accueil » et « Ajouter ».</span><button type="button" aria-label="Fermer">×</button>';
    tiles.insertAdjacentElement('beforebegin', tip);
    $('button', tip).addEventListener('click', function () { set('pwa-vu', true); tip.remove(); });
  }
  if (tiles && web && installed && 'caches' in window) offline(tiles);
  // the web app counted once per phone (a random number, nothing else), for the owner's page of the download site
  if (web && installed && !get('inst-ok', false)) {
    var me = get('inst', null) || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    set('inst', me);
    fetch('https://bileyiyabana.netlify.app/api/installation', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appareil: ios ? 'iphone' : /Android/.test(navigator.userAgent) ? 'android' : 'autre', id: me }) })
      .then(function (r) { if (r.ok) set('inst-ok', true); }).catch(function () { /* told at the next opening */ });
  }

  /** "Lire sans internet": every file of the site fetched once (sw.js keeps them), with the progress; started again by
      itself after an update of the site, when files changed. */
  function offline(after) {
    var base = new URL(ROOT || './', location.href).href, box = d.createElement('section'), stop = false, auto = true;
    box.className = 'horsligne';
    after.insertAdjacentElement('afterend', box);
    function mo(n) { return Math.max(1, Math.round(n / 1e6)) + ' Mo'; }
    function missing() {
      return Promise.all([fetch(base + 'manifest.txt', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw r; return r.text(); }),
        caches.open('byb-site').then(function (c) { return c.keys(); })]).then(function (a) {
        var have = {}, list = [];
        a[1].forEach(function (k) { have[k.url] = 1; });
        a[0].split('\n').forEach(function (line) {
          var i = line.indexOf(' '), j = line.indexOf(' ', i + 1), p = line.slice(j + 1);
          if (i > 0 && j > i && !/^(version\.json|manifest\.txt|sw\.js)$/.test(p) && !have[base + p]) list.push({ p: p, s: Number(line.slice(i + 1, j)) });
        });
        return list;
      });
    }
    function show() {
      missing().then(function (list) {
        if (!list.length) {
          box.innerHTML = '<p><b>✓ Toute la bibliothèque est sur cet appareil</b> : elle se lit sans internet.</p>';
          return;
        }
        var size = list.reduce(function (s, f) { return s + f.s; }, 0);
        var begun = get('horsligne', false);
        if (begun && auto) return run(list, size);  // begun earlier, or files changed with an update
        box.innerHTML = '<p><b>Lire sans internet</b> : les pages déjà ouvertes restent sur cet appareil. Pour avoir toute '
          + 'la bibliothèque, même sans connexion :</p><p><button type="button" class="button">' + (begun ? 'Reprendre le téléchargement' : 'Tout télécharger')
          + ' (' + mo(size) + ')</button></p>'
          + '<p class="note">Avec le wifi de préférence. Gardez l’application ouverte pendant le téléchargement ; s’il s’arrête, il reprend à la prochaine ouverture.</p>';
        $('button', box).addEventListener('click', function () { run(list, size); });
      }).catch(function () {  // no internet: nothing to offer until it comes back
        box.hidden = true;
        window.addEventListener('online', function back() {
          window.removeEventListener('online', back);
          box.hidden = false;
          show();
        });
      });
    }
    function run(list, size) {
      set('horsligne', true);
      stop = false;
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      var done = 0, i = 0, failed = 0;
      box.innerHTML = '<p><b>Téléchargement de la bibliothèque</b> <span data-n></span></p><progress max="' + size + '" value="0"></progress>'
        + '<p class="note" data-room hidden></p><p><button type="button" class="button">Arrêter</button></p>';
      var n = $('[data-n]', box), bar = $('progress', box);
      function step() { n.textContent = mo(done) + ' sur ' + mo(size); bar.value = done; }
      step();
      $('button', box).addEventListener('click', function () { stop = true; set('horsligne', false); });
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
        if (e.quota && e.quota - e.usage < size * 1.1) {
          var room = $('[data-room]', box);
          room.textContent = 'Il faut environ ' + mo(size) + ' de place libre sur cet appareil.';
          room.hidden = false;
        }
      }).catch(function () {});
      function next() {
        if (stop || i >= list.length) return Promise.resolve();
        var f = list[i++];
        return fetch(base + f.p).then(function (r) { if (!r.ok) throw r; return r.arrayBuffer(); })
          .then(function () { done += f.s; step(); }, function () { failed++; }).then(next);
      }
      Promise.all([next(), next(), next(), next()]).then(function () {
        if (failed && !stop) {
          auto = false;  // not again by itself in this page: the button
          toast(failed + (failed > 1 ? ' fichiers manquent' : ' fichier manque') + ' : connexion coupée ?');
        }
        setTimeout(show, 1500);  // what is still missing (sw.js finishes keeping the last files)
      });
    }
    show();
  }
})();
