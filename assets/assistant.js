/* Bileyi ya Bana, version HTML statique : the Chat IA (Google Gemini).
   It answers questions from the library itself (sermons, books, the Bible): the question's words are looked up in the
   word index (moteur.js), the best passages are sent with the question to Gemini, and the answer cites them as [1], [2]…
   linked to the paragraph. On a reading page it can also summarise the page or explain a §. Needs an internet connection. */
(function () {
  'use strict';
  var BYB = window.BYB = window.BYB || {}, d = document;
  if (BYB.ia) return;
  var E = BYB.engine, ROOT = d.documentElement.getAttribute('data-root') || '';
  var BIBLE = d.documentElement.getAttribute('data-kind') === 'bible';  // a page of the Bible: verses, not §
  var esc = BYB.esc, store = BYB.store;

  // ---------------------------------------------------------------- the AI services: Google Gemini, then OpenRouter
  // Gemini answers first. When all its models are busy, or its free limit is reached, a free model of OpenRouter
  // answers: about as fast, less careful with the [n] of the sources, and only some 50 questions a day for the whole
  // library (Gemini: far more).
  // The keys are not in the site put online. The apps (Android, iPhone, Windows) can give the Gemini key as
  // window.BYB_GEMINI_KEY (a copy of the site kept private can carry it, build_site.py --cle-gemini): Gemini is then
  // called directly. Otherwise the questions go through the library's relay on Netlify (page-web/netlify/edge-functions/
  // ia.js), which holds the keys of both services: a new key is put there, without a new version of the apps.
  function key() { return window.BYB_GEMINI_KEY || ''; }
  var RELAY = 'https://bileyiyabana.netlify.app/api/ia/';
  var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
  // tried in this order when one is overloaded or withdrawn; the "-latest" names follow Google's newest versions
  var GEMINI = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
  var OPENROUTER = ['nvidia/nemotron-3.5-lightning:free', 'openrouter/free'];
  // the Chat IA answers in the apps, in the web app (the site put on the home screen) and in a copy of the site opened
  // from the computer's files; on the site in a browser it sends to the apps
  function allowed() {
    return !!key() || location.protocol === 'file:' || !!(BYB.app && (BYB.app.inApp || BYB.app.installed));
  }
  var NO_KEY = '<p>Sur le site internet, le Chat IA ne répond pas : il marche dans l’application Bileyi ya Bana, pour '
    + 'Android, iPhone et Windows. Sur iPhone, dans Safari : Partager, puis « Sur l’écran d’accueil ». '
    + '<a href="https://bileyiyabana.netlify.app/">Installer l’application</a></p>';
  var BUDGET = 120000;  // characters of library text sent with a question

  // ---------------------------------------------------------------- calling a model (streamed answer)
  function readSSE(resp, onEvent) {
    var reader = resp.body.getReader(), dec = new TextDecoder(), buf = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        buf += dec.decode(r.value, { stream: true });
        var i;
        while ((i = buf.indexOf('\n')) >= 0) {
          var line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line.indexOf('data:') !== 0) continue;
          var data = line.slice(5).trim();
          if (data === '[DONE]') return;
          var ev;
          try { ev = JSON.parse(data); } catch (e) { continue; }
          onEvent(ev);
        }
        return pump();
      });
    }
    return pump();
  }
  function failure(status, body, name) {
    var msg = '';
    try {
      var j = JSON.parse(body);
      if (Array.isArray(j)) j = j[0];
      msg = (j.error && (j.error.message || (typeof j.error === 'string' ? j.error : ''))) || j.message || '';
    } catch (e) { msg = String(body || '').slice(0, 200); }
    var why = { 400: 'Demande refusée par ' + name, 401: 'La clé ' + name + ' a été refusée', 403: 'La clé ' + name + ' a été refusée',
      404: 'Ce modèle de ' + name + ' n\'est plus disponible',
      429: 'La limite gratuite du Chat IA est atteinte : réessayez dans une minute (ou demain)',
      500: name + ' a rencontré une erreur : réessayez', 503: name + ' est surchargé en ce moment : réessayez dans un instant' }[status]
      || 'Erreur de ' + name + ' (' + status + ')';
    var err = new Error(why + (msg ? ' — ' + msg : ''));
    err.retry = status !== 400;  // another model, or the other service, may answer
    err.status = status;
    return err;
  }
  var WAIT = 25000;  // a model that has not started to answer after this long is left for the next one
  var QUIET = 60000;  // the same for an OpenRouter answer begun without a word (its first bytes come at once)
  var PLAIN = {};  // the Gemini models that refused the setting "no thinking first" (kept for this page)
  /** One model: {service: 'gemini' | 'openrouter', model, direct: Gemini called with the app's key}. */
  function askModel(m, system, messages, onText, signal, plain) {
    plain = plain || PLAIN[m.model];
    var full = '', own = new AbortController(), late = false, name = m.service === 'gemini' ? 'Gemini' : 'OpenRouter';
    var stop = function () { own.abort(); };
    if (signal) signal.addEventListener('abort', stop);
    var timer = setTimeout(function () { late = true; own.abort(); }, WAIT), quiet = null;
    var url, headers = { 'content-type': 'application/json' }, body;
    if (m.service === 'gemini') {
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(function (x) { return { role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] }; })
      };
      // answers come much sooner when the model does not "think" first (the passages are already chosen)
      if (!plain) body.generationConfig = { thinkingConfig: { thinkingBudget: 0 } };
      if (m.direct) {
        url = GEMINI_URL + encodeURIComponent(m.model) + ':streamGenerateContent?alt=sse';
        headers['x-goog-api-key'] = key();
      } else {
        url = RELAY + 'gemini';
        body = { model: m.model, body: body };
      }
    } else {
      url = RELAY + 'openrouter';
      // without "reasoning" first, the free models answer as soon as Gemini (3 s instead of 15 to 30)
      body = { model: m.model, body: { stream: true, reasoning: { enabled: false },
        messages: [{ role: 'system', content: system }].concat(messages.map(function (x) {
          return { role: x.role === 'assistant' ? 'assistant' : 'user', content: x.content };
        })) } };
    }
    return fetch(url, { method: 'POST', signal: own.signal, headers: headers, body: JSON.stringify(body) }).catch(function (e) {
      var err;
      if (late) err = new Error(name + ' ne répond pas : réessayez dans un instant.');
      else if (e.name === 'AbortError') throw e;
      else err = new Error('Pas de connexion à internet : le Chat IA en a besoin (le reste de la bibliothèque marche sans).');
      err.retry = true;
      throw err;
    }).then(function (resp) {
      clearTimeout(timer);
      if (!resp.ok) {
        return resp.text().then(function (t) {
          // a model that does not take the setting above is asked again without it (the "flash-lite" ones refuse it
          // with a plain "invalid argument")
          if (resp.status === 400 && !plain && m.service === 'gemini') {
            PLAIN[m.model] = true;
            return askModel(m, system, messages, onText, signal, true);
          }
          throw failure(resp.status, t, name);
        });
      }
      if (m.service === 'openrouter') quiet = setTimeout(function () { late = true; own.abort(); }, QUIET);
      return readSSE(resp, function (ev) {
        if (ev.error) throw new Error('Erreur de ' + name + ' — ' + (ev.error.message || ev.error));
        var piece = '';
        if (m.service === 'gemini') {
          if (ev.promptFeedback && ev.promptFeedback.blockReason) throw new Error('Gemini a refusé de répondre (' + ev.promptFeedback.blockReason + ').');
          var c = ev.candidates && ev.candidates[0];
          (c && c.content && c.content.parts || []).forEach(function (part) { if (part.text && !part.thought) piece += part.text; });
        } else {
          (ev.choices || []).forEach(function (ch) { if (ch.delta && ch.delta.content) piece += ch.delta.content; });
        }
        if (piece) {
          clearTimeout(quiet);
          full += piece;
          if (onText) onText(full);
        }
      }).catch(function (e) {
        if (!late || full) throw e;
        var slow = new Error(name + ' ne répond pas : réessayez dans un instant.');
        slow.retry = true;
        throw slow;
      }).then(function () { return full; });
    }).finally(function () {
      clearTimeout(timer);
      clearTimeout(quiet);
      if (signal) signal.removeEventListener('abort', stop);
    });
  }
  var refused = false;  // the app's Gemini key was refused: the relay's from now on
  var slower = null;    // set by the conversation: says that the slower service is asked
  /** Sends a conversation; onText(fullTextSoFar) is called as the answer arrives. The Gemini model that answered last is
      tried first, then the others when one is busy or gone, then OpenRouter (not when geminiOnly: the keywords of a
      search, which can do without). Resolves with the whole text. */
  function ask(system, messages, onText, signal, geminiOnly) {
    var saved = store.get('iamodel', null), names = GEMINI.slice();
    if (saved && names.indexOf(saved) > 0) {
      names.splice(names.indexOf(saved), 1);
      names.unshift(saved);
    }
    var order = names.map(function (n) { return { service: 'gemini', model: n }; });
    if (!geminiOnly) order = order.concat(OPENROUTER.map(function (n) { return { service: 'openrouter', model: n }; }));
    var lastError = null;
    function attempt(i) {
      if (i >= order.length) return Promise.reject(lastError);
      var m = order[i], started = false;
      m.direct = m.service === 'gemini' && !!key() && !refused;
      if (m.service === 'openrouter' && i > 0 && order[i - 1].service !== 'openrouter' && slower) slower();
      return askModel(m, system, messages, function (t) { started = true; if (onText) onText(t); }, signal).then(function (text) {
        if (m.service === 'gemini' && m.model !== saved) store.set('iamodel', m.model);
        return text;
      }).catch(function (e) {
        if (e.name === 'AbortError' || started || !e.retry) throw e;
        if (m.direct && (e.status === 401 || e.status === 403)) {
          refused = true;
          return attempt(i);  // the same model through the relay
        }
        // the message of the first service is the one that counts (the second one only stands in)
        if (!lastError || m.service === 'gemini') lastError = e;
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  // ---------------------------------------------------------------- instructions
  var RULES = 'Tu es l\'assistant d\'étude de « Bileyi ya Bana », une bibliothèque des prédications de William Branham '
    + 'en français (traduction Shekinah), avec des livres, des biographies, des recueils de citations, des cantiques '
    + 'et la Bible (Louis Segond 1910).\n'
    + 'Règles :\n'
    + '- Les extraits de la Bible sont le texte biblique, pas des paroles de William Branham : cite-les avec leur référence '
    + '(livre chapitre:verset).\n'
    + '- Réponds dans la langue de la question (en général le français), clairement et simplement, sans longueurs.\n'
    + '- Appuie-toi sur les extraits fournis. N\'invente jamais de sermon, de date, de citation ni de paragraphe.\n'
    + '- Les citations exactes sont recopiées mot pour mot depuis les extraits, entre guillemets « ».\n'
    + '- Si les extraits ne suffisent pas pour répondre, dis-le franchement et propose d\'autres mots à chercher.\n'
    + '- Pour expliquer, tu peux ajouter un contexte biblique ou historique général, mais présente-le à part '
    + '(« Contexte : … ») et ne l\'attribue pas à William Branham.\n'
    + '- Rapporte fidèlement ce que dit le texte, avec respect, sans juger ni débattre.';
  var LIB_RULES = RULES + '\n- Les extraits sont numérotés : après chaque idée, indique d\'où elle vient avec son numéro '
    + 'entre crochets, par exemple [2] ou [1][4].';
  function pageRules(title) {
    return RULES + '\n- Tu travailles sur le texte de la page que la personne lit : « ' + title + ' ». Pour renvoyer '
      + 'à un passage, écris son repère tel qu\'il apparaît dans le texte, par exemple (§ 12), (v. 16) ou (p. 63).';
  }
  var KEYWORDS = 'Tu prépares une recherche par mots dans les sermons de William Branham traduits en français. '
    + 'Réponds uniquement par 4 à 10 mots-clés séparés par des virgules : des mots qui doivent figurer dans les passages '
    + 'utiles (noms propres, termes bibliques, synonymes, au singulier). Aucune phrase, aucune explication.';

  // ---------------------------------------------------------------- finding passages in the library
  var STOP = new Set(('les des une est sont etait etaient ete ces cet cette que qui quoi quel quelle quels quelles dans sur pour '
    + 'par avec sans aux son ses sa leur leurs elle elles ils nous vous lui pas plus moins tres bien comment pourquoi quand '
    + 'combien dit dire disait parle parlait parler explique expliquer explication resume resumer resumes selon frere branham '
    + 'william marrion sermon sermons predication predications message livre livres bible peux peut pouvez donne donner moi mon mes '
    + 'notre nos votre vos etre avoir fait faire faut entre tout tous toute toutes autre autres ainsi alors aussi donc mais car '
    + 'comme meme deja encore enseigne enseignait pense pensait croit croyait signifie veut vouloir sujet propos concernant '
    + 'raconte racontez raconter racontait decris decrivez decrire decrit montre montrez montrer cite citez citer trouve '
    + 'trouver passage passages remarquez remarquer remarque regardez ecoutez souvenez rappelez voyez voyons utilise utiliser '
    + 'espere esperons possible simplement vraiment maintenant alors quelque chose choses deux trois').split(' '));

  function terms(text) {
    var seen = {}, out = [];
    BYB.words(text).forEach(function (w) {
      if ((w.length > 2 && !STOP.has(w)) || /^\d{2,}$/.test(w)) if (!seen[w]) { seen[w] = 1; out.push(w); }
    });
    return out;
  }
  function trim(text, max) {
    if (text.length <= max) return text;
    var cut = text.lastIndexOf(' ', max);
    return text.slice(0, cut > max * 0.6 ? cut : max) + ' …';
  }
  /** The paragraphs of the library that best match some words, best first: {ranked: [[g, score, doc]], idf, lists, useful}.
      groups: expressions (lists of words); a paragraph that has all the words of one counts more. */
  function rank(words, groups, types) {
    return E.ready().then(function () {
      var docs = BYB.docs, last = docs[docs.length - 1], N = BYB.ixn || last[4] + 50;
      var none = { ranked: [], idf: {}, lists: {}, useful: [] };
      if (!words.length) return none;
      return Promise.all(words.map(function (w) { return E.postings(w, false).catch(function () { return []; }); })).then(function (lists) {
        var items = words.map(function (w, i) { return { w: w, P: lists[i] }; }).filter(function (x) { return x.P.length; });
        if (!items.length) return none;
        items.sort(function (a, b) { return a.P.length - b.P.length; });
        var useful = items.filter(function (x) { return x.P.length < N * 0.12; });
        if (!useful.length) useful = items.slice(0, 1);
        var score = new Map(), idfOf = {}, listOf = {};
        items.forEach(function (x) { listOf[x.w] = x.P; idfOf[x.w] = Math.log(1 + (N - x.P.length + 0.5) / (x.P.length + 0.5)); });
        useful.forEach(function (x) {
          for (var i = 0; i < x.P.length; i++) score.set(x.P[i], (score.get(x.P[i]) || 0) + idfOf[x.w]);
        });
        groups.forEach(function (g) {
          var ws = g.filter(function (w) { return listOf[w]; });
          if (ws.length < 2 || ws.length < g.length) return;
          var both = ws.map(function (w) { return listOf[w]; }).sort(function (a, b) { return a.length - b.length; })
            .reduce(function (a, b) { return E.intersect(a, b); });
          var bonus = ws.reduce(function (s, w) { return s + idfOf[w]; }, 0) * 0.6;
          for (var i = 0; i < both.length; i++) score.set(both[i], (score.get(both[i]) || 0) + bonus);
        });
        // a document whose title has all the words of the question ("la colonne de feu", a hymn's name) comes first
        var asked = groups[0] && groups[0].length <= 5 ? groups[0] : [];
        var ranked = [];
        score.forEach(function (sc, g) {
          var k = E.docOf(g);
          if (types.indexOf(docs[k][5]) < 0) return;
          if (asked.length && asked.every(function (w) { return titleOf(k).indexOf(' ' + w) >= 0; })) sc *= 1.5;
          ranked.push([g, sc, k]);
        });
        ranked.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
        return { ranked: ranked, idf: idfOf, lists: listOf, useful: useful.map(function (x) { return x.w; }) };
      });
    });
  }
  var titles = {};
  function titleOf(k) { return titles[k] || (titles[k] = ' ' + BYB.words(BYB.docs[k][1]).join(' ') + ' '); }
  var BIBLE_SHARE = 6;  // passages kept for the Bible when it is searched with other texts
  /** The text of the best paragraphs: [{n, title, sub, label, text, url}], within a size budget. */
  function passages(r, budget, max, perDocMax) {
    var docs = BYB.docs, perDoc = {}, chosen = [];
    // the verses of the Bible are short and lose against the long paragraphs of the sermons: when both are searched,
    // the best verses get a share of the passages of their own
    var side = function (x) { return docs[x[2]][5] === 3 ? 'bible' : 'other'; };
    var has = { bible: r.ranked.some(function (x) { return side(x) === 'bible'; }), other: r.ranked.some(function (x) { return side(x) === 'other'; }) };
    var cap = { bible: has.other ? BIBLE_SHARE : max, other: max }, nb = { bible: 0, other: 0 };
    var want = { bible: has.bible ? Math.ceil(cap.bible * 1.5) : 0, other: has.other ? Math.ceil(max * 1.5) : 0 };
    for (var i = 0; i < r.ranked.length && (nb.bible < want.bible || nb.other < want.other); i++) {
      var k = r.ranked[i][2], s = side(r.ranked[i]);
      if (nb[s] >= want[s] || (perDoc[k] || 0) >= (perDocMax || 3)) continue;
      perDoc[k] = (perDoc[k] || 0) + 1;
      nb[s]++;
      chosen.push(r.ranked[i]);
    }
    if (has.bible && has.other) cap.other = max - Math.min(cap.bible, nb.bible);
    var need = Array.from(new Set(chosen.map(function (c) { return c[2]; })));
    var q = encodeURIComponent(r.useful.slice(0, 4).join(' '));
    return Promise.all(need.map(function (k) { return E.loadText(k); })).then(function (all) {
      var rowsOf = {};
      need.forEach(function (k, i) { rowsOf[k] = all[i] || []; });
      var out = [], used = 0, shown = {}, given = { bible: 0, other: 0 };
      for (var j = 0; j < chosen.length && out.length < max; j++) {
        var g = chosen[j][0], k2 = chosen[j][2], doc = docs[k2], rows = rowsOf[k2], i2 = g - doc[4], row = rows[i2];
        if (!row || given[side(chosen[j])] >= cap[side(chosen[j])]) continue;
        var text, key = k2 + ':' + i2, label = doc[5] === 0 ? (row[1] ? '§ ' + row[1] : '') : doc[5] === 1 ? (row[1] ? 'p. ' + row[1] : '') : '';
        if (doc[5] === 2) {  // a hymn: all of it
          if (shown[k2]) continue;
          shown[k2] = 1;
          text = rows.map(function (x) { return x[2]; }).join(' / ');
        } else if (doc[5] === 3) {  // a verse of the Bible, with the next ones while it is short
          if (shown[key]) continue;
          shown[key] = 1;
          text = row[2];
          var end = i2;
          while (text.length < 300 && end - i2 < 3 && rows[end + 1] && !shown[k2 + ':' + (end + 1)]) {
            end++;
            text += ' ' + rows[end][2];
            shown[k2 + ':' + end] = 1;
          }
          label = 'v. ' + row[1] + (end > i2 ? '-' + rows[end][1] : '');
        } else {
          if (shown[key]) continue;
          shown[key] = 1;
          text = row[2];
          if (text.length < 250 && rows[i2 + 1]) { text += ' ' + rows[i2 + 1][2]; shown[k2 + ':' + (i2 + 1)] = 1; }
        }
        text = trim(text, 1600);
        if (used + text.length > budget && out.length) break;
        used += text.length;
        given[side(chosen[j])]++;
        out.push({ n: out.length + 1, k: k2, title: doc[1], sub: doc[2], label: label, text: text,
          url: doc[0] + '?q=' + q + (doc[5] === 2 ? '' : '#s' + row[0]) });
      }
      return out;
    });
  }
  function retrieve(words, groups, types, budget) {
    return rank(words, groups, types).then(function (r) { return passages(r, budget, 20); });
  }

  // ---------------------------------------------------------------- the page being read
  function pageItems() {
    var t = d.querySelector('article.doc .texte');
    if (!t) return [];
    var out = [], label = '';
    Array.prototype.forEach.call(t.children, function (el) {
      if (el.classList.contains('pg')) { label = el.textContent.trim(); return; }
      var n = el.querySelector && el.querySelector('.n');
      if (n) label = (BIBLE ? 'v. ' : '§ ') + n.textContent.trim();
      var text = el.textContent.replace(/\s+/g, ' ').trim();
      if (n) text = text.replace(/^\d+\s*/, '');
      var sn = el.querySelector && el.querySelector('.sn, .lbl');  // number of a stanza, "Refrain"
      if (sn) text = sn.textContent + ' : ' + text.slice(sn.textContent.length).trim();
      if (text) out.push({ el: el, id: el.id, label: label, text: text });
    });
    return out;
  }
  function pageText(items) {
    var last = null;
    return items.map(function (it) {
      var head = it.label && it.label !== last ? '(' + it.label + ') ' : '';
      last = it.label;
      return head + it.text;
    }).join('\n');
  }
  function chunks(items, size) {
    var out = [], cur = [], n = 0;
    items.forEach(function (it) {
      if (n + it.text.length > size && cur.length) { out.push(cur); cur = []; n = 0; }
      cur.push(it);
      n += it.text.length + 12;
    });
    if (cur.length) out.push(cur);
    return out;
  }
  /** The paragraphs of the page closest to a question, kept in reading order, within the budget. */
  function pageSelection(items, question, budget) {
    var ws = terms(question);
    var scored = items.map(function (it, i) {
      var tw = ' ' + BYB.words(it.text).join(' ') + ' ', s = 0;
      ws.forEach(function (w) { if (tw.indexOf(' ' + w) >= 0) s += 1; });
      return { i: i, s: s };
    }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    var keep = {}, used = 0;
    for (var k = 0; k < scored.length; k++) {
      [scored[k].i - 1, scored[k].i, scored[k].i + 1].forEach(function (j) {
        if (j >= 0 && j < items.length && !keep[j] && used + items[j].text.length < budget) { keep[j] = 1; used += items[j].text.length; }
      });
      if (used > budget * 0.95) break;
    }
    return items.filter(function (it, i) { return keep[i]; });
  }

  // ---------------------------------------------------------------- answer display (a small, safe part of Markdown)
  function render(text, cite) {
    var html = [], para = [], list = null;
    function flushPara() { if (para.length) { html.push('<p>' + para.join('<br>') + '</p>'); para = []; } }
    function flushList() { if (list) { html.push('<' + list.tag + '>' + list.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</' + list.tag + '>'); list = null; } }
    function inline(s) {
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
      return cite(s);
    }
    esc(text).split('\n').forEach(function (line) {
      var m;
      if (!line.trim()) { flushPara(); flushList(); return; }
      if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { flushPara(); flushList(); html.push('<h4>' + inline(m[1]) + '</h4>'); return; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        var tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
        if (!list || list.tag !== tag) { flushList(); list = { tag: tag, items: [] }; }
        list.items.push(inline(m[1]));
        return;
      }
      flushList();
      para.push(inline(line));
    });
    flushPara();
    flushList();
    return html.join('');
  }
  function libraryCites(sources) {
    return function (s) {
      return s.replace(/\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\]/g, function (m, nums) {
        return nums.split(/[,;]/).map(function (n) {
          var src = sources[Number(n.trim()) - 1];
          return src ? '<a class="cite" href="' + esc(ROOT + src.url) + '" title="' + esc(src.title + (src.label ? ', ' + src.label : '')) + '">'
            + n.trim() + '</a>' : '[' + n.trim() + ']';
        }).join('');
      });
    };
  }
  function pageCites(s) {
    return s.replace(/§\s?(\d{1,4})/g, function (m, n) {
      return d.getElementById('p' + n) ? '<a class="cite-p" href="#p' + n + '">§ ' + n + '</a>' : m;
    }).replace(/\bv\.\s?(\d{1,3})/g, function (m, n) {
      return BIBLE && d.getElementById('p' + n) ? '<a class="cite-p" href="#p' + n + '">v. ' + n + '</a>' : m;
    }).replace(/\bp\.\s?(\d{1,4})/g, function (m, n) {
      return d.getElementById('page-' + n) ? '<a class="cite-p" href="#page-' + n + '">p. ' + n + '</a>' : m;
    });
  }

  // ---------------------------------------------------------------- the chat component
  var SUGGEST = ['Que dit frère Branham sur la colonne de feu ?', 'Qui sont les sept messagers des âges de l\'Église ?',
    'Explique le premier sceau', 'Raconte la vision de la tente', 'Que dit-il sur le baptême au nom de Jésus-Christ ?'];

  function mount(box, opts) {
    var page = opts.page, title = opts.title || d.title;
    // a conversation kept earlier, without the empty answers older versions could keep
    var history = page ? [] : (store.get('chat', []) || []).filter(function (m) { return m && m.content; });
    var busy = null;
    box.classList.add('ia');
    box.innerHTML = '<div class="ia-log" aria-live="polite"></div>'
      + (page ? '<div class="ia-quick"><button type="button" data-q="resume">Résumer cette page</button>'
        + '<button type="button" data-q="idees">Idées principales</button>'
        + '<button type="button" data-q="bible">Références bibliques</button></div>'
        : '<div class="ia-quick">' + SUGGEST.map(function (s) { return '<button type="button" data-s>' + esc(s) + '</button>'; }).join('') + '</div>')
      + '<form class="ia-form"><textarea rows="2" placeholder="' + (page ? 'Une question sur cette page…' : 'Posez votre question…')
      + '" aria-label="Votre question"></textarea><button class="ia-send" type="submit">Envoyer</button></form>'
      + '<div class="ia-opts">'
      + (page ? '<label><input type="checkbox" data-o="lib"> chercher dans toute la bibliothèque</label>'
        : '<label><input type="checkbox" data-t="0" checked> Sermons</label><label><input type="checkbox" data-t="1" checked> Livres</label>'
        + '<label><input type="checkbox" data-t="3" checked> Bible</label>')
      + '<span class="ia-who">IA : Google Gemini</span>'
      + '<button type="button" class="ia-new" data-a="new" aria-label="Nouvelle conversation" title="Nouvelle conversation">'
      + '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.5 3.5V8H16"/></svg>'
      + '</button></div>';
    var log = box.querySelector('.ia-log'), form = box.querySelector('.ia-form'), input = form.querySelector('textarea');
    var send = form.querySelector('.ia-send');

    // while the AI works: the send button becomes a small red square (to stop it)
    function busyLook(on) {
      send.classList.toggle('busy', on);
      send.textContent = on ? '' : 'Envoyer';
      send.setAttribute('aria-label', on ? 'Arrêter la réponse' : 'Envoyer');
      send.title = on ? 'Arrêter la réponse' : '';
    }
    function scroll() { log.scrollTop = log.scrollHeight; }
    function bubble(role) {
      var el = d.createElement('div');
      el.className = 'ia-msg ' + (role === 'user' ? 'ia-me' : 'ia-bot');
      log.appendChild(el);
      return el;
    }
    function showUser(text) { bubble('user').textContent = text; scroll(); }
    function sourcesHtml(sources) {
      if (!sources || !sources.length) return '';
      return '<details class="ia-src"><summary>Extraits consultés (' + sources.length + ')</summary><ol>'
        + sources.map(function (s) {
          return '<li><a href="' + esc(ROOT + s.url) + '">' + esc(s.title) + '</a>' + (s.label ? ' <b>' + esc(s.label) + '</b>' : '')
            + '<small>' + esc(s.sub) + '</small></li>';
        }).join('') + '</ol></details>';
    }
    function showBot(text, sources, el, html) {
      stopThinking();
      el = el || bubble('bot');
      // html: an answer made without AI, built (and escaped) by this script
      el.innerHTML = '<div class="ia-text">' + (html || render(text, sources ? libraryCites(sources) : page ? pageCites : function (s) { return s; }))
        + '</div>' + sourcesHtml(sources)
        + '<p class="ia-tools"><button type="button" data-a="copy">Copier</button>'
        + (BYB.voix ? '<button type="button" data-a="voix">🔊 Écouter</button>' : '') + '</p>';
      el._text = text;
      el._sources = sources;
      return el;
    }
    // the AI "thinking": three dots that bounce, what it is doing, and the seconds that pass when it takes long
    var thinkTimer = null;
    function stopThinking() { if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null; } }
    function status(el, msg) {
      stopThinking();
      el.innerHTML = '<p class="ia-think"><span class="ia-dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span></p>';
      var label = el.querySelector('.ia-think span:last-child'), since = Date.now();
      label.textContent = msg;
      thinkTimer = setInterval(function () {
        if (!el.isConnected) { stopThinking(); return; }
        var s = Math.round((Date.now() - since) / 1000);
        label.textContent = msg + (s >= 3 ? ' ' + s + ' s' : '');
      }, 1000);
      scroll();
    }
    function error(el, e) {
      stopThinking();
      el.classList.add('ia-err');
      el.innerHTML = '<p>' + esc(e.message || String(e)) + '</p>';
      scroll();
    }
    function save() { if (!page) store.set('chat', history.slice(-30)); }

    // earlier conversation (library page only)
    history.forEach(function (m) { if (m.role === 'user') showUser(m.content); else showBot(m.content, m.sources, null, m.html); });
    function hello() {
      bubble('bot').innerHTML = page
        ? '<p>Je peux résumer cette page, en expliquer les idées, relever ses références bibliques ou répondre à une question '
          + 'sur ce texte. Pour un paragraphe précis : touchez son numéro, puis « Expliquer avec l’IA ». Il faut une connexion à internet.</p>'
        : '<p>Posez votre question : je réponds à partir des sermons, des livres et de la Bible, avec les sources '
          + '<span class="cite">1</span>, qui mènent au passage.</p>';
      if (!allowed()) { bubble('bot').innerHTML = NO_KEY; scroll(); }
    }
    if (!history.length) hello();

    function run(task) {
      if (busy) return;
      if (!allowed()) { bubble('bot').innerHTML = NO_KEY; scroll(); return; }
      busy = new AbortController();
      busyLook(true);
      var el = bubble('bot');
      slower = function () { status(el, 'Gemini est occupé : un autre service d’IA répond…'); };
      el.classList.add('ia-live');  // a blinking caret follows the answer while it arrives
      status(el, 'Recherche dans la bibliothèque…');
      var frame = 0;
      function live(text, sources) {
        if (frame) return;
        frame = requestAnimationFrame(function () { frame = 0; showBot(text, sources, el); scroll(); });
      }
      task(el, live, busy.signal).then(function (res) {
        if (frame) cancelAnimationFrame(frame);
        if (!res) return;
        showBot(res.text || '(pas de réponse)', res.sources, el, res.html);
        // an empty answer is not kept: sent back to Gemini with the next question, it would refuse the request
        var said = res.text || (res.html ? res.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
        if (!page && res.question && said) {
          history.push({ role: 'user', content: res.question });
          history.push({ role: 'assistant', content: said, sources: res.sources, html: res.html });
          save();
        }
      }).catch(function (e) {
        if (frame) cancelAnimationFrame(frame);
        if (e.name === 'AbortError') { if (el._text) showBot(el._text + '\n\n(arrêté)', el._sources, el); else el.remove(); return; }
        error(el, e);
      }).then(function () { stopThinking(); el.classList.remove('ia-live'); busy = null; slower = null; busyLook(false); scroll(); });
    }

    function previous() {
      // the last exchanges, so that "and in 1963?" is understood; long answers shortened. Gemini refuses empty
      // messages and wants the turns to alternate, beginning with a question.
      var out = [];
      history.slice(-4).forEach(function (m) {
        var text = (m.content || '').slice(0, 2000).trim();
        if (!text) return;
        if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n' + text;
        else out.push({ role: m.role, content: text });
      });
      while (out.length && out[0].role !== 'user') out.shift();
      if (out.length && out[out.length - 1].role === 'user') out.pop();  // the new question comes after
      return out;
    }
    function askLibrary(question) {
      var types = page ? [0, 1, 2, 3] : Array.prototype.filter.call(box.querySelectorAll('[data-t]'), function (c) { return c.checked; })
        .map(function (c) { return Number(c.getAttribute('data-t')); });
      run(function (el, live, signal) {
        var lastQ = history.length ? history[history.length - 2].content : '';
        // Gemini first suggests the words to look for, then answers from the passages found with them
        return ask(KEYWORDS, [{ role: 'user', content: (lastQ ? 'Question précédente : ' + lastQ + '\n' : '') + 'Question : ' + question }], null, signal, true)
          .catch(function (e) { if (e.name === 'AbortError') throw e; return ''; })
          .then(function (extra) {
            var ws = terms(question + ' ' + extra.replace(/\n/g, ','));
            if (lastQ && ws.length < 2) ws = ws.concat(terms(lastQ));
            // expressions: the question, each pair of neighbouring words in it, each keyword suggested by Gemini
            var asked = terms(question), groups = [asked];
            for (var i = 0; i + 1 < asked.length; i++) groups.push(asked.slice(i, i + 2));
            groups = groups.concat(extra.split(/[,;\n]/).map(terms));
            return retrieve(ws, groups, types, BUDGET);
          }).then(function (sources) {
            if (!sources.length) {
              return { text: 'Je n\'ai trouvé aucun passage qui corresponde à cette question dans la bibliothèque. '
                + 'Essayez avec d\'autres mots, par exemple un nom, un lieu ou une expression du texte.', sources: [], question: question };
            }
            status(el, nbText(sources.length) + ' trouvés, rédaction de la réponse…');
            var context = 'Extraits de la bibliothèque :\n\n' + sources.map(function (s) {
              return '[' + s.n + '] ' + s.title + ' — ' + s.sub + (s.label ? ', ' + s.label : '') + '\n' + s.text;
            }).join('\n\n') + '\n\nQuestion : ' + question;
            var msgs = previous().concat([{ role: 'user', content: context }]);
            var onText = function (t) { live(t, sources); };
            return ask(LIB_RULES, msgs, onText, signal).catch(function (e) {
              // refused with the earlier exchanges: the question alone
              if (e.status === 400 && msgs.length > 1) return ask(LIB_RULES, msgs.slice(-1), onText, signal);
              throw e;
            }).then(function (text) {
              return { text: text, sources: sources, question: question };
            });
          });
      });
    }
    function nbText(n) { return n + (n > 1 ? ' extraits' : ' extrait'); }

    var ACTIONS = {
      resume: 'Fais un résumé fidèle de ce texte : d\'abord le thème principal en une ou deux phrases, puis les points importants '
        + 'dans l\'ordre, avec leurs repères (§ ou p.), et termine par une courte conclusion.',
      idees: 'Explique simplement les idées principales de ce texte, comme à quelqu\'un qui le découvre, avec les repères (§ ou p.).',
      bible: 'Relève les passages de la Bible cités ou évoqués dans ce texte (livre, chapitre et verset quand ils sont donnés), '
        + 'avec pour chacun le repère (§ ou p.) et ce que le texte en tire.'
    };
    function askPage(question, action) {
      var items = pageItems();
      run(function (el, live, signal) {
        var system = pageRules(title), instruction = action ? ACTIONS[action] : 'Question : ' + question;
        var total = items.reduce(function (s, it) { return s + it.text.length; }, 0);
        if (total <= BUDGET) {
          status(el, 'Lecture de la page…');
          return ask(system, [{ role: 'user', content: 'Texte de la page :\n\n' + pageText(items) + '\n\n' + instruction }],
            function (t) { live(t, null); }, signal).then(function (text) { return { text: text }; });
        }
        if (!action) {  // a question on a long page: the paragraphs closest to it
          var part = pageSelection(items, question, BUDGET);
          if (!part.length) part = items.slice(0, chunks(items, BUDGET)[0].length);
          status(el, 'Lecture des passages de la page…');
          return ask(system, [{ role: 'user', content: 'Passages de la page :\n\n' + pageText(part) + '\n\n' + instruction }],
            function (t) { live(t, null); }, signal).then(function (text) { return { text: text }; });
        }
        // a long page summarised part by part, then as a whole
        var parts = chunks(items, Math.floor(BUDGET * 0.9)), notes = [];
        var step = function (i) {
          if (i >= parts.length) return Promise.resolve();
          status(el, 'Lecture de la partie ' + (i + 1) + ' sur ' + parts.length + '…');
          return ask(system, [{ role: 'user', content: 'Partie ' + (i + 1) + ' sur ' + parts.length + ' du texte :\n\n'
            + pageText(parts[i]) + '\n\nNote les points importants de cette partie, avec leurs repères (§ ou p.) et les passages bibliques cités.' }],
          null, signal).then(function (t) { notes.push('Partie ' + (i + 1) + ' :\n' + t); return step(i + 1); });
        };
        return step(0).then(function () {
          status(el, 'Synthèse…');
          return ask(system, [{ role: 'user', content: 'Voici les notes prises sur les parties successives du texte :\n\n'
            + notes.join('\n\n') + '\n\n' + instruction }], function (t) { live(t, null); }, signal);
        }).then(function (text) { return { text: text }; });
      });
    }
    function explain(el) {
      var items = pageItems(), i = -1;
      for (var k = 0; k < items.length; k++) if (items[k].el === el) i = k;
      if (i < 0) return;
      var around = items.slice(Math.max(0, i - 2), i + 3), label = items[i].label;
      showUser('Explique ' + (label || 'ce passage'));
      run(function (bub, live, signal) {
        var text = around.map(function (it) { return (it === items[i] ? '>>> ' : '') + (it.label ? '(' + it.label + ') ' : '') + it.text; }).join('\n');
        return ask(pageRules(title), [{ role: 'user', content: 'Passage à expliquer (marqué >>>), avec ce qui l\'entoure :\n\n' + text
          + '\n\nExplique ce passage simplement : ce qu\'il veut dire, comment il s\'inscrit dans ce qui précède et ce qui suit, '
          + 'et les passages de la Bible qu\'il cite ou évoque.' }], function (t) { live(t, null); }, signal)
          .then(function (t) { return { text: t }; });
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) { busy.abort(); return; }
      var q = input.value.trim();
      if (!q) return;
      input.value = '';
      showUser(q);
      var lib = !page || box.querySelector('[data-o=lib]').checked;
      if (lib) askLibrary(q); else askPage(q, null);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit')); }
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !box.contains(b)) return;
      if (b.hasAttribute('data-s')) { input.value = b.textContent; input.focus(); }
      var q = b.getAttribute('data-q');
      if (q) { showUser(b.textContent); askPage('', q); }
      var a = b.getAttribute('data-a');
      if (a === 'new') {
        if (busy) busy.abort();
        history = [];
        save();
        log.innerHTML = '';
        hello();
      }
      if (a === 'voix') {
        // the answer read aloud, without the numbers of the sources nor the marks of the formatting
        var said = b.closest('.ia-msg'), plain = String(said._text || '').replace(/(\s*\[\d+\])+/g, '')
          .replace(/[*_#>`]+/g, '').replace(/^\s*[-•]\s+/gm, '');
        BYB.voix.lire(plain.split(/\n+/).reduce(function (list, line) {
          return list.concat(BYB.voix.phrases(line).map(function (t) { return { el: said, text: t }; }));
        }, []), 0);
      }
      if (a === 'copy') {
        var msg = b.closest('.ia-msg'), extra = (msg._sources || []).map(function (s) {
          return '[' + s.n + '] ' + s.title + (s.label ? ', ' + s.label : '');
        }).join('\n');
        BYB.copy(msg._text + (extra ? '\n\nSources :\n' + extra : ''), 'Réponse copiée');
      }
    });

    scroll();
    return { explain: explain, input: input };
  }

  // ---------------------------------------------------------------- the side panel of a reading page
  // The panel takes a step of the history while it is open: the back button of the page and the phone's own close it
  // (instead of leaving the page). A § cited in it (§ 12) shows that paragraph under the strip of the sermon; on a
  // phone, where the panel covers the page, it closes first.
  var drawer = null, chat = null;
  function isOpen() { return !!drawer && drawer.classList.contains('open'); }
  function shut(fromHistory) {
    if (!isOpen()) return;
    drawer.classList.remove('open');
    if (!fromHistory && history.state && history.state.byb === 'ia') history.back();
  }
  window.addEventListener('popstate', function () {
    if (isOpen() && !(history.state && history.state.byb === 'ia')) shut(true);
  });
  function open(paragraph) {
    if (!drawer) {
      drawer = d.createElement('aside');
      drawer.className = 'ia-drawer';
      drawer.setAttribute('aria-label', 'Chat IA');
      var art = d.querySelector('article.doc');
      var title = art && art.getAttribute('data-label') || d.title;
      drawer.innerHTML = '<header><button type="button" class="ia-close" aria-label="Retour au texte" title="Retour au texte">'
        + '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5.5 8.5 12l6.5 6.5"/></svg></button>'
        + '<b>Chat IA</b><span>' + esc(title) + '</span></header><div class="ia-body"></div>';
      d.body.appendChild(drawer);
      drawer.querySelector('.ia-close').addEventListener('click', function () { shut(false); });
      drawer.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        var t = a && d.getElementById(a.getAttribute('href').slice(1));
        if (!t) return;
        e.preventDefault();
        var beside = window.innerWidth >= 900;  // a wide screen: the text shows beside the panel
        try { history.replaceState(beside ? history.state : null, '', a.getAttribute('href')); } catch (x) { /* file: in old browsers */ }
        if (!beside) shut(true);
        var p = t.closest('p') || t;
        p.scrollIntoView({ block: 'start' });
        p.classList.add('flash');
        setTimeout(function () { p.classList.remove('flash'); }, 1600);
      });
      chat = mount(drawer.querySelector('.ia-body'), { page: true, title: title });
    }
    if (!isOpen()) {
      drawer.classList.add('open');
      try { history.pushState({ byb: 'ia' }, ''); } catch (x) { /* the panel works without it */ }
    }
    if (paragraph) chat.explain(paragraph);
    else chat.input.focus();
  }

  BYB.ia = { open: open, mount: mount };
  var host = d.getElementById('ia-page');
  if (host) mount(host, { page: false });
})();
