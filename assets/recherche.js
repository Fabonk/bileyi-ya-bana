/* Bileyi ya Bana, version HTML statique : the search page (the index itself is read by moteur.js). */
(function () {
  'use strict';
  var BYB = window.BYB, d = document;
  var form = d.getElementById('sf'), statusEl = d.getElementById('status'), out = d.getElementById('results');
  if (!form || !BYB.ixdir || !BYB.engine) return;
  var ROOT = d.documentElement.getAttribute('data-root') || '';
  var E = BYB.engine, postings = E.postings, intersect = E.intersect, docOf = E.docOf, loadText = E.loadText;

  // ---------------------------------------------------------------- form
  function options() {
    var f = new FormData(form);
    return {
      q: (f.get('q') || '').trim(), m: f.get('m') || 'texte', t: f.getAll('t'),
      a: Number(f.get('a')) || 0, b: Number(f.get('b')) || 9999, o: f.get('o') || 'date'
    };
  }
  function fill(p) {
    form.q.value = p.get('q') || '';
    if (p.get('m')) form.querySelector('[name=m][value=' + (p.get('m') === 'titres' ? 'titres' : 'texte') + ']').checked = true;
    if (p.getAll('t').length) $$('[name=t]').forEach(function (c) { c.checked = p.getAll('t').indexOf(c.value) >= 0; });
    ['a', 'b', 'o'].forEach(function (k) { if (p.get(k)) form[k].value = p.get(k); });
  }
  function $$(sel) { return Array.prototype.slice.call(form.querySelectorAll(sel)); }
  function say(html) { statusEl.innerHTML = html; }
  function nb(n, one, many) { return n.toLocaleString('fr-FR') + ' ' + (n === 1 ? one : many || one + 's'); }

  var run = 0;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var o = options(), p = new URLSearchParams();
    p.set('q', o.q);
    if (o.m !== 'texte') p.set('m', o.m);
    // the kinds of documents go in the address when they are not the ones ticked by default (the Bible is not)
    var byDefault = $$('[name=t]').filter(function (c) { return c.defaultChecked; }).map(function (c) { return c.value; });
    if (o.t.join() !== byDefault.join()) o.t.forEach(function (t) { p.append('t', t); });
    if (o.a) p.set('a', o.a);
    if (o.b < 9999) p.set('b', o.b);
    if (o.o !== 'date') p.set('o', o.o);
    history.replaceState(null, '', '?' + p.toString());
    search(o);
  });
  form.addEventListener('change', function (e) { if (e.target.name !== 'q' && form.q.value.trim()) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit')); });

  function yearOk(doc, o) { return doc[5] !== 0 || (doc[3] >= o.a && doc[3] <= o.b); }

  function search(o) {
    var id = ++run;
    out.innerHTML = '';
    if (!o.q) { say(''); return; }
    var parts = BYB.parseQuery(o.q);
    if (!parts.length) { say('Écrivez au moins un mot.'); return; }
    if (o.m === 'titres') return titles(o, parts);
    // words to look up: all words of 2 letters or more; a phrase is checked afterwards in the text
    var need = [], seen = {}, verify = false;
    parts.forEach(function (p) {
      if (p.phrase && p.words.length > 1) verify = true;
      p.words.forEach(function (w, i) {
        var prefix = p.prefix && i === p.words.length - 1;
        if (w.length < 2) { verify = true; return; }
        if (!seen[w + prefix]) { seen[w + prefix] = 1; need.push({ w: w, prefix: prefix }); }
      });
    });
    if (!need.length) { say('Mots trop courts : ajoutez un mot d\'au moins deux lettres.'); return; }
    say('Recherche…');
    Promise.all(need.map(function (n) { return postings(n.w, n.prefix); })).then(function (lists) {
      if (id !== run) return;
      lists.sort(function (a, b) { return a.length - b.length; });
      var hits = lists[0];
      for (var i = 1; i < lists.length && hits.length; i++) hits = intersect(hits, lists[i]);
      var groups = [], byDoc = {};
      hits.forEach(function (g) {
        var k = docOf(g), doc = BYB.docs[k];
        if (o.t.indexOf(String(doc[5])) < 0 || !yearOk(doc, o)) return;
        if (!byDoc[k]) { byDoc[k] = { k: k, gs: [] }; groups.push(byDoc[k]); }
        byDoc[k].gs.push(g);
      });
      if (o.o === 'nb') groups.sort(function (a, b) { return b.gs.length - a.gs.length || a.k - b.k; });
      var total = groups.reduce(function (s, g) { return s + g.gs.length; }, 0);
      if (!groups.length) { say('Aucun résultat pour <b>' + BYB.esc(o.q) + '</b>.'); return; }
      say((verify ? 'Au plus ' : '') + nb(total, 'passage') + ' dans ' + nb(groups.length, 'document')
        + (verify ? ' (l\'expression exacte est vérifiée à l\'affichage)' : '') + '.');
      show(o, parts, groups, 0, verify, id);
    }).catch(function (err) {
      if (id !== run) return;
      say(err && err.message === 'trop' ? 'Trop de mots commencent ainsi : ajoutez des lettres avant l\'étoile.'
        : 'Les fichiers de recherche sont introuvables (dossier <code>data</code> du site).');
    });
  }

  var PAGE = 20;
  function show(o, parts, groups, from, verify, id) {
    var re = BYB.queryRegex(parts, false) || BYB.queryRegex(parts, true), phrases = parts.filter(function (p) { return p.phrase || p.words[0].length < 2; });
    var slice = groups.slice(from, from + PAGE);
    var boxes = slice.map(function (g) {
      var doc = BYB.docs[g.k], box = d.createElement('div');
      box.className = 'result';
      box.innerHTML = '<h3><a href="' + BYB.esc(ROOT + doc[0] + '?q=' + encodeURIComponent(o.q)) + '">' + BYB.esc(doc[1]) + '</a></h3>'
        + '<p class="sub">' + BYB.esc(doc[2]) + ' · ' + nb(g.gs.length, 'passage') + '</p><div class="hits-of">…</div>';
      out.appendChild(box);
      return box;
    });
    var more = null;
    if (from + PAGE < groups.length) {
      more = d.createElement('p');
      more.className = 'loadmore';
      more.innerHTML = '<button type="button">Plus de résultats (' + (groups.length - from - PAGE) + ')</button>';
      out.appendChild(more);
      more.firstChild.addEventListener('click', function () { more.remove(); show(o, parts, groups, from + PAGE, verify, id); });
    }
    slice.forEach(function (g, i) {
      loadText(g.k).then(function (rows) {
        if (id !== run) return;
        var doc = BYB.docs[g.k], start = doc[4];
        var found = g.gs.map(function (gg) { return rows[gg - start]; }).filter(function (r) { return r && check(r[2], phrases); });
        var box = boxes[i], list = box.querySelector('.hits-of');
        if (!found.length) { box.remove(); return; }
        box.querySelector('.sub').textContent = doc[2] + ' · ' + nb(found.length, 'passage');
        function render(n) {
          list.innerHTML = found.slice(0, n).map(function (r) { return hit(doc, r, o.q, re); }).join('')
            + (found.length > n ? '<button type="button" class="more">+ ' + nb(found.length - n, 'autre passage', 'autres passages') + '</button>' : '');
          var b = list.querySelector('.more');
          if (b) b.addEventListener('click', function () { render(found.length); });
        }
        render(3);
      }).catch(function () { boxes[i].querySelector('.hits-of').textContent = ''; });
    });
  }

  /** Phrases (and words of one letter) are checked on the text itself. */
  function check(text, phrases) {
    if (!phrases.length) return true;
    var t = ' ' + BYB.words(text).join(' ') + ' ';
    return phrases.every(function (p) { return t.indexOf(' ' + p.words.join(' ') + ' ') >= 0; });
  }
  function hit(doc, r, q, re) {
    var seq = r[0], label = r[1], text = r[2];
    var lbl = label ? ({ 0: '§ ', 1: 'p. ', 3: 'v. ' }[doc[5]] || '') + label : '';
    // a long paragraph: the part around the first match
    if (text.length > 380 && re) {
      re.lastIndex = 0;
      var m = re.exec(text), at = m ? m.index : 0;
      if (at > 140) {
        var cut = text.lastIndexOf(' ', at - 100);
        text = '… ' + text.slice(cut > 0 ? cut + 1 : at - 100);
      }
      if (text.length > 420) text = text.slice(0, text.lastIndexOf(' ', 400)) + ' …';
    }
    var href = ROOT + doc[0] + '?q=' + encodeURIComponent(q) + (doc[5] === 2 ? '' : '#s' + seq);
    return '<a class="hit" href="' + BYB.esc(href) + '">' + (lbl ? '<b>' + BYB.esc(lbl) + '</b>' : '') + BYB.markText(text, re) + '</a>';
  }

  // ---------------------------------------------------------------- titles only
  function titles(o, parts) {
    var ws = [];
    parts.forEach(function (p) { ws = ws.concat(p.words); });
    var kinds = { s: '0', l: '1', c: '2', b: '3' };
    var found = (BYB.cat || []).filter(function (c) {
      if (o.t.indexOf(kinds[c[3]]) < 0) return false;
      if (c[3] === 's') {
        var y = Number((c[0].match(/\/(\d{4})\//) || [])[1]);
        if (y && (y < o.a || y > o.b)) return false;
      }
      return ws.every(function (w) { return c[4].indexOf(w) >= 0; });
    });
    if (!found.length) { say('Aucun titre ne contient <b>' + BYB.esc(o.q) + '</b>.'); return; }
    say(nb(found.length, 'titre') + (found.length > 300 ? ' (les 300 premiers)' : '') + '.');
    var re = BYB.queryRegex(parts, false) || BYB.queryRegex(parts, true);
    out.innerHTML = '<ul class="list">' + found.slice(0, 300).map(function (c) {
      return '<li><a href="' + BYB.esc(ROOT + c[0]) + '"><span class="code">' + { s: 'Sermon', l: 'Livre', c: 'Cantique', b: 'Bible' }[c[3]]
        + '</span><span class="t">' + BYB.markText(c[1], re) + '</span><span class="m">' + BYB.esc(c[2]) + '</span></a></li>';
    }).join('') + '</ul>';
  }

  var params = new URLSearchParams(location.search);
  fill(params);
  if (params.get('q')) search(options());
})();
