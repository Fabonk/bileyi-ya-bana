/* Bileyi ya Bana, version HTML statique : access to the word index, shared by the search page and the assistant.
   The index is split in small files (data/index/<n>.js, found with data/index/dir.js) loaded as scripts only when
   a word needs them, so it works from a web host and from a double-click (file://, where fetch() is refused).
   Each entry lists, for one word, the paragraphs that contain it; the text of a document is in data/textes/<n>.js. */
(function () {
  'use strict';
  var BYB = window.BYB = window.BYB || {}, d = document;
  if (BYB.engine) return;
  var ROOT = d.documentElement.getAttribute('data-root') || '';
  var loading = {}, shards = {}, texts = {};
  BYB.ix = function (k, obj) { shards[k] = obj; };
  BYB.txt = function (n, rows) { texts[n] = rows; };

  function load(src) {
    if (!loading[src]) {
      loading[src] = new Promise(function (ok, ko) {
        var s = d.createElement('script');
        s.src = ROOT + src;
        s.onload = ok;
        s.onerror = function () { delete loading[src]; ko(new Error(src)); };
        d.head.appendChild(s);
      });
    }
    return loading[src];
  }
  function ready() { return BYB.ixdir ? Promise.resolve() : load('data/index/dir.js'); }
  function loadText(n) { return load('data/textes/' + n + '.js').then(function () { return texts[n]; }); }

  var LAST = new Int16Array(128).fill(-1), MORE = new Int16Array(128).fill(-1);
  '0123456789abcdefghijklmnopqrstuv'.split('').forEach(function (c, i) { LAST[c.charCodeAt(0)] = i; });
  'wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$'.split('').forEach(function (c, i) { MORE[c.charCodeAt(0)] = i; });
  /** Paragraph numbers written as differences, in base 32 (see encode() in build_site.py). */
  function decode(s) {
    var res = [], v = 0, acc = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), t = LAST[c];
      if (t >= 0) { v += acc * 32 + t; res.push(v); acc = 0; } else acc = acc * 32 + MORE[c];
    }
    return res;
  }
  function shardOf(term) {
    var dir = BYB.ixdir, lo = 0, hi = dir.length - 1, k = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (dir[mid] <= term) { k = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return k;
  }
  function union(lists) {
    var all = [].concat.apply([], lists).sort(function (a, b) { return a - b; }), res = [];
    for (var i = 0; i < all.length; i++) if (!i || all[i] !== all[i - 1]) res.push(all[i]);
    return res;
  }
  function intersect(a, b) {
    var res = [], i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { res.push(a[i]); i++; j++; } else if (a[i] < b[j]) i++; else j++;
    }
    return res;
  }
  /** Paragraphs containing a word (or any word starting with it). */
  function postings(w, prefix) {
    return ready().then(function () {
      var k = shardOf(w), ks = [k], dir = BYB.ixdir;
      if (prefix) for (var j = k + 1; j < dir.length && dir[j].indexOf(w) === 0; j++) ks.push(j);
      return Promise.all(ks.map(function (n) { return load('data/index/' + n + '.js'); })).then(function () {
        if (!prefix) return shards[k][w] ? decode(shards[k][w]) : [];
        var lists = [];
        ks.forEach(function (n) {
          var sh = shards[n];
          for (var t in sh) if (t.indexOf(w) === 0) lists.push(decode(sh[t]));
        });
        if (lists.length > 600) throw new Error('trop');
        return union(lists);
      });
    });
  }
  /** Document (sermon, chapter, hymn) of a paragraph number: BYB.docs = [url, title, subtitle, year, first, kind]. */
  function docOf(g) {
    var docs = BYB.docs, lo = 0, hi = docs.length - 1, k = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (docs[mid][4] <= g) { k = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return k;
  }

  BYB.engine = { load: load, ready: ready, loadText: loadText, postings: postings, union: union,
    intersect: intersect, docOf: docOf, root: ROOT };
})();
