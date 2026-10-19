(function () {
  'use strict';

  var G = window.BOOK.groups;
  var UNITS = [], UBY = {}, GBY = {};
  G.forEach(function (g) {
    GBY[g.id] = g;
    g.units.forEach(function (u) { u.group = g; UBY[u.id] = u; UNITS.push(u); });
  });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- storage ---------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  var prog = LS.get('dq.prog', {});
  var last = LS.get('dq.last', null);
  var soundOn = LS.get('dq.sound', true);
  var theme = LS.get('dq.theme', null);
  var fontScale = LS.get('dq.fs', 100);
  var flips = LS.get('dq.flips', 0);
  var openGroups = {};

  /* ---------- theme / font ---------- */
  function applyTheme() {
    var t = theme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', document.body.classList.contains('on-cover') ? '#0a1f36' : (t === 'dark' ? '#0e1d2c' : '#ffffff'));
  }
  function applyFont() { document.documentElement.style.setProperty('--fs', fontScale + '%'); }

  /* ---------- sound (WebAudio, файл қажет емес) ---------- */
  var ctx = null;
  function ac() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noise(c, dur) {
    var n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function flipSound(dir) {
    if (!soundOn) return;
    var c = ac(); if (!c) return;
    var t = c.currentTime;
    var src = c.createBufferSource(); src.buffer = noise(c, 0.34);
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    var f0 = dir >= 0 ? 1100 : 3400, f1 = dir >= 0 ? 3800 : 1000;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + 0.27);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.38, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.31);
    src.connect(bp); bp.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + 0.35);
    var o = c.createOscillator(), og = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t + 0.22); o.frequency.exponentialRampToValueAtTime(85, t + 0.36);
    og.gain.setValueAtTime(0.0001, t + 0.22);
    og.gain.exponentialRampToValueAtTime(0.16, t + 0.235);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(og); og.connect(c.destination); o.start(t + 0.22); o.stop(t + 0.42);
  }
  function tickSound() {
    if (!soundOn) return;
    var c = ac(); if (!c) return;
    var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(760, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.07);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.1);
  }

  function updateSoundBtn() {
    var b = $('#btnSound');
    b.innerHTML = soundOn
      ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
      : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
    b.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
  }

  /* ---------- toast ---------- */
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- helpers ---------- */
  function readHref(u, n) { return '#/read/' + u.id + '/' + (n || 1); }
  function unitPct(u) {
    var m = prog[u.id]; if (m == null) return 0;
    return Math.round((m + 1) / u.pages.length * 100);
  }
  function unitRow(u) {
    var pct = unitPct(u);
    return '<a class="urow" href="' + readHref(u, 1) + '">' +
      '<span class="ul">' + esc(u.label || '•') + '</span>' +
      '<span class="ut">' + esc(u.title) + '</span>' +
      '<span class="up">' + u.pages.length + ' бет</span>' +
      (pct ? '<i class="bar"><b style="width:' + pct + '%"></b></i>' : '') + '</a>';
  }
  function groupAcc(g) {
    var open = openGroups[g.id] ? ' open' : '';
    return '<div class="acc' + open + '" data-g="' + g.id + '">' +
      '<button class="acc-h" type="button" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="acc-t">' + (g.num ? g.num + ' ' : '') + esc(g.title) + '</span>' +
      '<span class="cnt">' + g.units.length + '</span><span class="pm">' + (open ? '−' : '+') + '</span></button>' +
      '<div class="acc-b"><div><div class="acc-b-in">' + g.units.map(unitRow).join('') + '</div></div></div></div>';
  }

  /* ---------- views ---------- */
  var view = $('#view');

  function viewHome() {
    var h = '<div class="eyebrow">ДЕРЕКТЕР ҚОРЫ</div><h1 class="big">МАЗМҰНЫ</h1>' +
      '<label class="search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>' +
      '<input id="q" type="search" placeholder="Тақырыпты іздеу…" autocomplete="off" enterkeyhint="search"></label>' +
      '<div id="results" hidden></div><div id="list">';
    if (last && UBY[last.u]) {
      var lu = UBY[last.u];
      h += '<a class="resume" href="' + readHref(lu, last.p + 1) + '"><small>ОҚУДЫ ЖАЛҒАСТЫРУ</small><b>' + esc((lu.label ? lu.label + ' ' : '') + lu.title) + '</b><span>' + (last.p + 1) + '-бет · ' + esc(lu.pages[last.p] ? lu.pages[last.p].t : '') + '</span></a>';
    }
    G.forEach(function (g) {
      if (g.flat) h += '<a class="row" href="' + readHref(g.units[0], 1) + '">' + esc(g.title) + '</a>';
      else h += groupAcc(g);
    });
    h += '</div>';
    view.innerHTML = h;
    bindSearch();
  }

  function viewList(title, eyebrow, groupIds) {
    var h = '<div class="eyebrow">' + esc(eyebrow) + '</div><h1 class="big">' + esc(title) + '</h1>';
    groupIds.forEach(function (id) {
      var g = GBY[id];
      h += '<div class="card list-card">' + g.units.map(unitRow).join('') + '</div>';
    });
    view.innerHTML = h;
  }

  function viewMore() {
    var h = '<div class="eyebrow">ДЕРЕКТЕР ҚОРЫ</div><h1 class="big">ТАҒЫ</h1>';
    h += '<div class="section-h">БІЛІМДІ БАҚЫЛАУ</div><div class="card list-card">' + GBY.control.units.map(unitRow).join('') + '</div>';
    h += '<div class="section-h">ҚОРЫТЫНДЫ ЖӘНЕ ӘДЕБИЕТТЕР</div><div class="card list-card">' + unitRow(GBY.concl.units[0]) + unitRow(GBY.refs.units[0]) + '</div>';
    h += '<div class="section-h">ҚОСЫМШАЛАР</div><div class="card list-card">' + GBY.apps.units.map(unitRow).join('') + '</div>';
    h += '<div class="section-h">БАПТАУЛАР</div><div class="card">' +
      '<div class="set"><span>Бет аудару дыбысы<small>Бетті басқанда шығатын дыбыс</small></span><button id="swSound" class="sw" role="switch" aria-checked="' + soundOn + '" aria-label="Дыбыс"></button></div>' +
      '<div class="set"><span>Түсті тақырып<small>Жарық / қараңғы</small></span><div class="seg"><button data-th="light">Жарық</button><button data-th="dark">Қараңғы</button></div></div>' +
      '<div class="set"><span>Қаріп өлшемі<small id="fsLbl">' + fontScale + '%</small></span><div class="seg"><button id="fsM" aria-label="Кішірейту">A−</button><button id="fsP" aria-label="Үлкейту">A+</button></div></div>' +
      '<div class="set"><span>Оқу барысы<small>Белгіленген беттерді тазалау</small></span><div class="seg"><button id="resetProg">Тазалау</button></div></div>' +
      '</div>';
    h += '<p class="about">Найзағараева А.А.<br>«Деректер қоры» электрондық оқу құралы<br>Астана, 2026</p>';
    view.innerHTML = h;
    $('#swSound').addEventListener('click', function () {
      soundOn = !soundOn; LS.set('dq.sound', soundOn); this.setAttribute('aria-checked', soundOn); updateSoundBtn(); tickSound();
    });
    $$('[data-th]').forEach(function (b) { b.addEventListener('click', function () { theme = b.dataset.th; LS.set('dq.theme', theme); applyTheme(); tickSound(); }); });
    function fs(d) { fontScale = Math.max(85, Math.min(140, fontScale + d)); LS.set('dq.fs', fontScale); applyFont(); $('#fsLbl').textContent = fontScale + '%'; tickSound(); }
    $('#fsM').addEventListener('click', function () { fs(-10); });
    $('#fsP').addEventListener('click', function () { fs(10); });
    $('#resetProg').addEventListener('click', function () { prog = {}; last = null; LS.set('dq.prog', prog); LS.set('dq.last', null); toast('Оқу барысы тазартылды'); });
  }

  /* ---------- reader ---------- */
  var cur = { u: null, p: 0 };
  var dir = 1;

  function viewRead(u, p) {
    p = Math.max(0, Math.min(u.pages.length - 1, p));
    cur = { u: u, p: p };
    prog[u.id] = Math.max(prog[u.id] == null ? -1 : prog[u.id], p);
    LS.set('dq.prog', prog);
    last = { u: u.id, p: p }; LS.set('dq.last', last);

    var pg = u.pages[p];
    var ui = UNITS.indexOf(u);
    var isLastPage = p === u.pages.length - 1;
    var nextU = isLastPage ? UNITS[ui + 1] : null;
    var hasPrev = !(ui === 0 && p === 0);
    var pct = Math.round((p + 1) / u.pages.length * 100);

    var crumbG = u.group.flat ? '' : ' <span>/</span> <span>' + (u.group.num ? u.group.num + ' ' : '') + esc(u.group.title) + '</span>';
    var h = '<div class="crumb"><a href="#/home">Мазмұн</a>' + crumbG + '</div>' +
      '<div class="utitle">' + (u.label ? '<span class="ulabel">' + esc(u.label) + '</span>' : '') + '<h1>' + esc(u.title) + '</h1></div>' +
      '<article id="page" class="page ' + (dir >= 0 ? 'in-next' : 'in-prev') + '" aria-live="polite">' +
      '<div class="phead"><span>Бет ' + (p + 1) + ' / ' + u.pages.length + '</span><span></span></div>' +
      '<div class="pbody">' + pg.h + '</div></article>' +
      '<div class="pager">' +
      '<button id="prevBtn" class="pbtn" type="button"' + (hasPrev ? '' : ' disabled') + '>← Артқа</button>' +
      '<div class="pcount">' + (p + 1) + ' / ' + u.pages.length + '<i><b style="width:' + pct + '%"></b></i></div>' +
      '<button id="nextBtn" class="pbtn next" type="button">' + (isLastPage ? (nextU ? 'Келесі тақырып →' : 'Мазмұнға →') : 'Келесі →') + '</button></div>' +
      (nextU ? '<div class="nextinfo">' + (isLastPage ? 'Келесі: ' + esc((nextU.label ? nextU.label + ' ' : '') + nextU.title) : '') + '</div>' : '') +
      (flips < 6 ? '<p class="hint">Бетті басыңыз — келесі бетке өтеді (сол жақ шетін басу — артқа)</p>' : '');
    view.innerHTML = h;
    document.title = (u.label ? u.label + ' ' : '') + u.title + ' — Деректер қоры';
    window.scrollTo(0, 0);

    $('#prevBtn').addEventListener('click', function () { step(-1); });
    $('#nextBtn').addEventListener('click', function () { step(1); });
    var page = $('#page');
    page.addEventListener('click', function (e) {
      if (e.target.closest('a,button,input,.code,.tw')) return;
      var sel = window.getSelection && String(window.getSelection());
      if (sel && sel.length > 0) return;
      var r = page.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width;
      step(x < 0.22 ? -1 : 1);
    });
    $$('.copy', page).forEach(function (b) {
      b.addEventListener('click', function () {
        var txt = b.parentNode.querySelector('pre').innerText;
        var done = function () { b.textContent = 'Көшірілді ✓'; tickSound(); setTimeout(function () { b.textContent = 'Көшіру'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done);
        else { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); done(); }
      });
    });
  }

  function step(d) {
    if (!cur.u) return;
    var u = cur.u, i = cur.p + d;
    if (i >= u.pages.length) {
      var ni = UNITS.indexOf(u) + 1;
      if (ni >= UNITS.length) { flipSound(1); dir = 1; toast('Оқу құралының соңы'); location.hash = '#/home'; return; }
      u = UNITS[ni]; i = 0;
    } else if (i < 0) {
      var pi = UNITS.indexOf(u) - 1;
      if (pi < 0) return;
      u = UNITS[pi]; i = u.pages.length - 1;
    }
    flips++; LS.set('dq.flips', flips);
    flipSound(d); dir = d;
    var target = readHref(u, i + 1);
    if (location.hash === target) render(); else location.hash = target;
  }

  /* ---------- search ---------- */
  var IDX = null;
  function buildIdx() {
    IDX = [];
    UNITS.forEach(function (u) {
      u.pages.forEach(function (p, i) {
        IDX.push({ u: u, i: i, title: p.t, raw: p.x, low: (u.title + ' ' + u.label + ' ' + p.t + ' ' + p.x).toLowerCase() });
      });
    });
  }
  function bindSearch() {
    var q = $('#q'), res = $('#results'), list = $('#list'), timer;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 120); });
    function run() {
      var s = q.value.trim().toLowerCase();
      if (s.length < 2) { res.hidden = true; list.hidden = false; return; }
      if (!IDX) buildIdx();
      var out = [], seenTitle = {};
      IDX.forEach(function (e) {
        var inTitle = (e.u.title + ' ' + e.u.label + ' ' + e.title).toLowerCase().indexOf(s) >= 0;
        if (inTitle) out.push({ e: e, score: 0 });
      });
      IDX.forEach(function (e) {
        if (out.some(function (o) { return o.e === e; })) return;
        if (e.low.indexOf(s) >= 0) out.push({ e: e, score: 1 });
      });
      out = out.slice(0, 40);
      var h = '';
      if (!out.length) h = '<p class="empty">Ештеңе табылмады.</p>';
      out.forEach(function (o) {
        var e = o.e, snip = '';
        var k = e.raw.toLowerCase().indexOf(s);
        if (k >= 0) {
          var a = Math.max(0, k - 50), b = Math.min(e.raw.length, k + s.length + 90);
          snip = (a > 0 ? '…' : '') + esc(e.raw.slice(a, k)) + '<mark>' + esc(e.raw.slice(k, k + s.length)) + '</mark>' + esc(e.raw.slice(k + s.length, b)) + (b < e.raw.length ? '…' : '');
        }
        h += '<a class="res" href="' + readHref(e.u, e.i + 1) + '"><small>' + esc((e.u.label ? e.u.label + ' · ' : '') + (e.i + 1) + '-бет') + '</small><b>' + esc(e.u.title) + '</b>' + (snip ? '<p>' + snip + '</p>' : '<p>' + esc(e.title) + '</p>') + '</a>';
      });
      res.innerHTML = h; res.hidden = false; list.hidden = true;
    }
  }

  /* ---------- router ---------- */
  function setTab(name) {
    $$('.tabs a').forEach(function (a) { a.classList.toggle('on', a.dataset.tab === name); });
  }
  function showCover(on) {
    document.body.classList.toggle('on-cover', on);
    $('#shell').hidden = on;
    applyTheme();
    if (on) { document.title = 'Деректер қоры — Электрондық оқу құралы'; window.scrollTo(0, 0); }
  }
  function render() {
    var h = location.hash.replace(/^#\/?/, '');
    try { h = decodeURIComponent(h); } catch (e) { }
    var parts = h.split('/');
    var r = parts[0];
    if (r === '' || r === 'cover') { showCover(true); return; }
    showCover(false);
    if (r === 'read') {
      var u = UBY[parts[1]];
      if (!u) { location.hash = '#/home'; return; }
      var p = (parseInt(parts[2], 10) || 1) - 1;
      var gt = u.group.id;
      setTab(gt === 'theory' ? 'lectures' : gt === 'practice' ? 'practice' : (gt === 'self') ? 'self' : (gt === 'intro') ? 'home' : 'more');
      viewRead(u, p);
      return;
    }
    dir = 1;
    document.title = 'Деректер қоры — Электрондық оқу құралы';
    if (r === 'lectures') { setTab('lectures'); viewList('ДӘРІСТЕР', 'ТЕОРИЯЛЫҚ БӨЛІМ · 15 ДӘРІС', ['theory']); }
    else if (r === 'practice') { setTab('practice'); viewList('ПРАКТИКА', 'ПРАКТИКАЛЫҚ БӨЛІМ · 15 ЖҰМЫС', ['practice']); }
    else if (r === 'self') { setTab('self'); viewList('ӨЗІНДІК', 'БІЛІМ АЛУШЫНЫҢ ӨЗІНДІК ЖҰМЫСЫ', ['self']); }
    else if (r === 'more') { setTab('more'); viewMore(); }
    else { setTab('home'); viewHome(); }
    window.scrollTo(0, 0);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var h = e.target.closest('.acc-h');
    if (h) {
      var acc = h.parentNode, id = acc.dataset.g, open = !acc.classList.contains('open');
      acc.classList.toggle('open', open); openGroups[id] = open;
      h.setAttribute('aria-expanded', open); $('.pm', h).textContent = open ? '−' : '+';
      tickSound();
    }
  });
  // Мұқабаға өту (Деректер қоры атауын басқанда)
  $('#brand').addEventListener('click', function () { flipSound(-1); });
  // Оқуды бастау
  $('#startBtn').addEventListener('click', function () { flipSound(1); });
  // мазмұн / қойындылар
  $$('.tabs a').forEach(function (a) { a.addEventListener('click', function () { tickSound(); }); });
  // тізім ішіндегі сілтемелер (тақырып ашу) — бет аудару дыбысы
  view.addEventListener('click', function (e) {
    var a = e.target.closest('a.urow, a.row, a.res, a.resume');
    if (a) flipSound(1);
  });
  $('#btnSound').addEventListener('click', function () { soundOn = !soundOn; LS.set('dq.sound', soundOn); updateSoundBtn(); if (soundOn) tickSound(); toast(soundOn ? 'Дыбыс қосулы' : 'Дыбыс өшірулі'); });
  $('#btnTheme').addEventListener('click', function () {
    var now = document.documentElement.getAttribute('data-theme');
    theme = now === 'dark' ? 'light' : 'dark'; LS.set('dq.theme', theme); applyTheme(); tickSound();
  });

  // пернетақта
  document.addEventListener('keydown', function (e) {
    if (!cur.u || !/^#\/read\//.test(location.hash)) return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' && e.target === document.body) { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
  });

  // сипау қимылы (swipe)
  var sx = 0, sy = 0, st = 0;
  document.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!/^#\/read\//.test(location.hash)) return;
    if (e.target.closest && e.target.closest('.code,.tw')) return;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - st < 700) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.addEventListener('hashchange', render);

  /* ---------- init ---------- */
  applyTheme(); applyFont(); updateSoundBtn();
  render();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  }
})();
