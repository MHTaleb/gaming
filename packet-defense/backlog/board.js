/*
 * board.js - render the backlog data as a kanban board.
 *
 * Reads ../backlog/backlog.json and renders it. It writes nothing back: the JSON
 * is the source of truth and is edited in an editor, under review, like code. A
 * board that can silently mutate the plan is a board nobody can trust, and the
 * whole reason the backlog is data is so that it can be validated and diffed.
 *
 * Filtering hides cards rather than re-rendering them. That is the difference
 * between a board that feels instant and one that flickers while you type.
 */

(function () {
  'use strict';

  var STATUS_ORDER = ['doing', 'next', 'blocked', 'done', 'later', 'dropped'];
  var STATUS_LABEL = {
    doing: 'In progress',
    next: 'Ready',
    blocked: 'Blocked',
    done: 'Done',
    later: 'Backlog',
    dropped: 'Dropped'
  };
  var PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3'];

  var state = {
    data: null,
    items: [],
    epics: {},
    search: '',
    priority: new Set(),
    epic: new Set(),
    area: new Set(),
    tag: new Set(),
    showDropped: false,
    openId: null
  };

  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /* ------------------------------------------------------------ scoring */

  /*
   * The same formula as tools/backlog.js. Duplicated deliberately rather than
   * shared, because one runs in Node and one in a browser and a shared module
   * would need a build step - which this project does not have. If the formula
   * changes, it changes in two places; that is the cheaper of the two problems.
   */
  function score(it) {
    var bonus = { P0: 9, P1: 5, P2: 2, P3: 0 }[it.priority] || 0;
    return (it.value * 2) - (it.risk * 1.5) + bonus;
  }

  /* -------------------------------------------------------------- render */

  function renderMeta() {
    var m = state.data.meta || {};
    var done = state.items.filter(function (i) { return i.status === 'done'; }).length;
    $('meta-line').textContent =
      (m.release ? 'release ' + m.release + ' · ' : '') +
      state.items.length + ' items · ' +
      done + ' done · ' +
      'updated ' + (m.updated || '?');
    document.title = (m.project || 'Backlog') + ' — Backlog';
  }

  function renderProgress() {
    var host = $('progress');
    host.innerHTML = '';
    var total = state.items.length || 1;

    STATUS_ORDER.forEach(function (status) {
      var n = state.items.filter(function (i) { return i.status === status; }).length;
      if (status === 'dropped' && n === 0) return;
      var pct = Math.round((n / total) * 100);

      var box = el('div', 'stat');
      box.dataset.status = status;
      box.appendChild(el('div', 'n', String(n)));
      box.appendChild(el('div', 'k', STATUS_LABEL[status] + ' · ' + pct + '%'));
      var bar = el('div', 'bar');
      var fill = el('i');
      fill.style.width = pct + '%';
      fill.style.background = 'currentColor';
      bar.appendChild(fill);
      box.appendChild(bar);
      host.appendChild(box);
    });
  }

  /*
   * A chip row.
   *
   * `limit` collapses a long row behind a "+N more" button. Tags are the reason:
   * there are forty of them, and laid out in full they push the board itself
   * below the fold on a laptop - a filter panel that hides the thing it filters
   * is worse than no filter panel.
   *
   * A chip that is currently active is always shown, whatever the limit. A
   * filter you cannot see is a filter you cannot clear.
   */
  function chipRow(host, values, setKey, labels, limit) {
    host.innerHTML = '';
    var shown = 0;
    var hidden = [];

    values.forEach(function (v) {
      var n = state.items.filter(function (i) {
        if (setKey === 'tag') return (i.tags || []).indexOf(v) !== -1;
        return i[setKey] === v;
      }).length;
      if (!n) return;

      var active = state[setKey].has(v);
      if (limit && shown >= limit && !active) { hidden.push(v); return; }
      shown++;
      host.appendChild(makeChip(v, n, labels, setKey, host, function () { shown--; }));
    });

    if (!hidden.length) return;

    var more = el('button', 'chip more',
      '+' + hidden.length + ' more');
    more.type = 'button';
    more.addEventListener('click', function () {
      // Re-render this row with no limit. Cheap, and it keeps one code path.
      chipRow(host, values, setKey, labels, null);
    });
    host.appendChild(more);
  }

  function makeChip(v, n, labels, setKey, host, onRemove) {
    var b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', state[setKey].has(v) ? 'true' : 'false');
    b.appendChild(document.createTextNode(labels && labels[v] ? labels[v] : v));
    b.appendChild(el('span', 'c', String(n)));
    b.addEventListener('click', function () {
      if (state[setKey].has(v)) state[setKey].delete(v); else state[setKey].add(v);
      b.setAttribute('aria-pressed', state[setKey].has(v) ? 'true' : 'false');
      apply();
    });
    return b;
  }

  function renderFilters() {
    chipRow($('chips-priority'), PRIORITY_ORDER, 'priority', null);

    var epics = Object.keys(state.epics).sort();
    var epicLabels = {};
    epics.forEach(function (id) { epicLabels[id] = state.epics[id].title || id; });
    chipRow($('chips-epic'), epics, 'epic', epicLabels);

    var areas = (state.data.meta.enums.areas || []).slice();
    chipRow($('chips-area'), areas, 'area', null);

    var tags = {};
    state.items.forEach(function (i) {
      (i.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
    });
    // Most-used tags first, so the visible ten are the useful ones.
    var tagList = Object.keys(tags).sort(function (a, b) {
      return tags[b] - tags[a] || a.localeCompare(b);
    });
    chipRow($('chips-tag'), tagList, 'tag', null, 10);
  }

  function cardFor(it) {
    var card = el('button', 'card');
    card.type = 'button';
    card.dataset.id = it.id;
    card.dataset.priority = it.priority;
    card.dataset.status = it.status;

    card.appendChild(el('span', 'id', it.id));
    card.appendChild(el('span', 'title', it.title));

    var row = el('div', 'row');
    row.appendChild(el('span', 'badge ' + it.priority, it.priority));
    row.appendChild(el('span', 'badge size', it.size));
    if (it.type && it.type !== 'story') row.appendChild(el('span', 'badge type', it.type));
    row.appendChild(el('span', 'badge area', it.area));
    card.appendChild(row);

    var haystack = [it.id, it.title, it.summary, it.why, it.riskNote, it.blockedBy]
      .concat(it.tags || []).concat(it.refs || [])
      .filter(Boolean).join(' ').toLowerCase();
    card.dataset.haystack = haystack;

    card.addEventListener('click', function () { openDetail(it.id); });
    return card;
  }

  function renderBoard() {
    var board = $('board');
    board.innerHTML = '';

    STATUS_ORDER.forEach(function (status) {
      var col = el('section', 'col');
      col.dataset.status = status;

      var head = el('div', 'col-head');
      head.appendChild(el('h2', null, STATUS_LABEL[status]));
      var count = el('span', 'count', '0');
      head.appendChild(count);
      col.appendChild(head);

      var cards = el('div', 'cards');
      var inCol = state.items.filter(function (i) { return i.status === status; });
      // Highest scoring first: within a column, the order is the recommendation.
      inCol.sort(function (a, b) { return score(b) - score(a); });
      inCol.forEach(function (it) { cards.appendChild(cardFor(it)); });
      col.appendChild(cards);

      var empty = el('p', 'col-empty', 'nothing here');
      col.appendChild(empty);

      board.appendChild(col);
    });
  }

  /* ------------------------------------------------------------- filtering */

  function matches(it) {
    if (!state.showDropped && it.status === 'dropped') return false;
    if (state.priority.size && !state.priority.has(it.priority)) return false;
    if (state.epic.size && !state.epic.has(it.epic)) return false;
    if (state.area.size && !state.area.has(it.area)) return false;
    if (state.tag.size) {
      var hit = (it.tags || []).some(function (t) { return state.tag.has(t); });
      if (!hit) return false;
    }
    if (state.search) {
      var card = document.querySelector('.card[data-id="' + it.id + '"]');
      if (!card || card.dataset.haystack.indexOf(state.search) === -1) return false;
    }
    return true;
  }

  function apply() {
    var visible = 0;
    state.items.forEach(function (it) {
      var card = document.querySelector('.card[data-id="' + it.id + '"]');
      if (!card) return;
      var ok = matches(it);
      card.classList.toggle('hidden', !ok);
      if (ok) visible++;
    });

    // Column counts and empty states, from what actually survived the filter.
    STATUS_ORDER.forEach(function (status) {
      var col = document.querySelector('.col[data-status="' + status + '"]');
      if (!col) return;
      var n = col.querySelectorAll('.card:not(.hidden)').length;
      var total = col.querySelectorAll('.card').length;

      // The dropped column is hidden entirely when it is switched off, rather
      // than shown empty. An empty column still occupies a grid cell, which
      // pushed a sixth column onto a second row below the five real ones.
      if (status === 'dropped' && !state.showDropped) {
        col.hidden = true;
        return;
      }
      col.hidden = false;

      col.querySelector('.count').textContent = String(n);
      col.querySelector('.col-empty').classList.toggle('hidden', !(total === 0 || n > 0));
    });

    var dropped = state.items.filter(function (i) { return i.status === 'dropped'; }).length;
    $('foot-count').textContent = visible + ' of ' + state.items.length + ' items shown' +
      (dropped && !state.showDropped ? ' · ' + dropped + ' dropped hidden' : '');
  }

  /* ---------------------------------------------------------------- detail */

  function badge(cls, text) {
    var b = el('span', 'badge ' + cls, text);
    return b;
  }

  function section(host, heading, node) {
    var s = el('section');
    s.appendChild(el('h4', null, heading));
    if (Array.isArray(node)) node.forEach(function (n) { s.appendChild(n); });
    else s.appendChild(node);
    return s;
  }

  function para(text) { return el('p', null, text); }

  function openDetail(id) {
    var it = state.items.filter(function (i) { return i.id === id; })[0];
    if (!it) return;
    state.openId = id;

    var body = $('drawer-body');
    body.innerHTML = '';

    var close = el('button', 'btn close', 'close');
    close.type = 'button';
    close.addEventListener('click', closeDetail);
    body.appendChild(close);

    body.appendChild(el('div', 'did', it.id));
    body.appendChild(el('h3', null, it.title));

    var meta = el('div', 'meta');
    meta.appendChild(badge(it.priority, it.priority));
    meta.appendChild(badge('size', it.size + (it.size === 'S' ? ' · half a day' : '')));
    meta.appendChild(badge('type', it.type));
    meta.appendChild(badge('area', it.area));
    if (it.epic && state.epics[it.epic]) meta.appendChild(badge('area', state.epics[it.epic].title));
    meta.appendChild(badge(it.status === 'done' ? 'P2' : 'P3', it.status));
    body.appendChild(meta);

    var scores = el('div', 'scores');
    [['value', it.value], ['risk', it.risk], ['score', Math.round(score(it))]].forEach(function (pair) {
      var d = el('div');
      d.appendChild(el('div', 'v', String(pair[1])));
      d.appendChild(el('div', 'k', pair[0]));
      scores.appendChild(d);
    });
    body.appendChild(section(body, 'score', scores));

    body.appendChild(section(body, 'what', para(it.summary)));
    if (it.why) body.appendChild(section(body, 'why it matters', para(it.why)));

    if (it.blockedBy) {
      var b = el('div', 'note blocked');
      b.appendChild(document.createTextNode('Blocked: ' + it.blockedBy));
      body.appendChild(section(body, 'blocked by', b));
    }
    if (it.riskNote) {
      var r = el('div', 'note risk');
      r.appendChild(document.createTextNode(it.riskNote));
      body.appendChild(section(body, 'risk', r));
    }
    if (it.note) {
      var n = el('div', 'note');
      n.appendChild(document.createTextNode(it.note));
      body.appendChild(section(body, 'note', n));
    }
    if (it.caveat) {
      var cv = el('div', 'note');
      cv.appendChild(document.createTextNode(it.caveat));
      body.appendChild(section(body, 'caveat', cv));
    }

    if (it.dod && it.dod.length) {
      var ul = el('ul');
      it.dod.forEach(function (d) { ul.appendChild(el('li', null, d)); });
      body.appendChild(section(body, 'definition of done', ul));
    }

    if (it.deps && it.deps.length) {
      var wrap = el('div');
      it.deps.forEach(function (dep) {
        var target = state.items.filter(function (i) { return i.id === dep; })[0];
        var btn = el('button', 'linky', dep + (target ? ' · ' + target.status : ' · MISSING'));
        btn.type = 'button';
        if (target) btn.addEventListener('click', function () { openDetail(dep); });
        else btn.className = 'linky plain';
        wrap.appendChild(btn);
      });
      body.appendChild(section(body, 'depends on', wrap));
    }

    // What depends on this, which is the question you ask before moving it.
    var dependents = state.items.filter(function (i) {
      return (i.deps || []).indexOf(it.id) !== -1;
    });
    if (dependents.length) {
      var dw = el('div');
      dependents.forEach(function (d) {
        var btn = el('button', 'linky', d.id + ' · ' + d.status);
        btn.type = 'button';
        btn.addEventListener('click', function () { openDetail(d.id); });
        dw.appendChild(btn);
      });
      body.appendChild(section(body, 'blocks', dw));
    }

    if (it.sources && it.sources.length) {
      var sw = el('div');
      it.sources.forEach(function (sid) {
        var r = (state.data.research || []).filter(function (x) { return x.id === sid; })[0];
        if (!r) { sw.appendChild(el('span', 'path', sid)); return; }
        if (r.source && /^https?:/.test(r.source)) {
          var a = document.createElement('a');
          a.className = 'linky';
          a.href = r.source;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = sid + ' · ' + r.topic;
          sw.appendChild(a);
        } else {
          sw.appendChild(el('span', 'linky plain', sid + ' · ' + r.topic));
        }
      });
      body.appendChild(section(body, 'research', sw));
    }

    if (it.refs && it.refs.length) {
      var rw = el('div');
      it.refs.forEach(function (p) { rw.appendChild(el('span', 'path', p)); });
      body.appendChild(section(body, 'in the repository', rw));
    }

    if (it.tags && it.tags.length) {
      var tw = el('div');
      it.tags.forEach(function (t) {
        var btn = el('button', 'linky plain', t);
        btn.type = 'button';
        btn.addEventListener('click', function () {
          state.tag.clear();
          state.tag.add(t);
          renderFilters();
          apply();
          closeDetail();
        });
        tw.appendChild(btn);
      });
      body.appendChild(section(body, 'tags', tw));
    }

    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('scrim').hidden = false;
    requestAnimationFrame(function () { $('scrim').classList.add('on'); });

    // Deep link, so a card can be shared without a screenshot.
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }

  function closeDetail() {
    state.openId = null;
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('scrim').classList.remove('on');
    setTimeout(function () {
      if (!state.openId) $('scrim').hidden = true;
    }, 220);
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
  }

  /* ------------------------------------------------------------------ boot */

  function fail(message) {
    var box = el('div', 'error');
    box.appendChild(el('strong', null, 'Could not load the backlog. '));
    box.appendChild(document.createTextNode(message));
    var p = el('p', null, 'Serve this page rather than opening the file directly: ' +
      'fetch() is blocked on file://. From the project root, run ' +
      '"node tools/serve.js" and open /backlog/.');
    p.style.marginTop = '10px';
    box.appendChild(p);
    document.body.insertBefore(box, $('board'));
  }

  function boot() {
    fetch('backlog.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' from backlog.json');
        return r.json();
      })
      .then(function (data) {
        state.data = data;
        state.items = data.items || [];
        (data.epics || []).forEach(function (e) { state.epics[e.id] = e; });

        renderMeta();
        renderProgress();
        renderFilters();
        renderBoard();
        apply();

        var q = location.hash.replace('#', '');
        if (q) openDetail(q);
      })
      .catch(function (err) { fail(err.message); });

    $('search').addEventListener('input', function (e) {
      state.search = e.target.value.trim().toLowerCase();
      apply();
    });

    $('reset').addEventListener('click', function () {
      state.search = '';
      $('search').value = '';
      state.priority.clear();
      state.epic.clear();
      state.area.clear();
      state.tag.clear();
      renderFilters();
      apply();
      closeDetail();
    });

    $('toggle-filters').addEventListener('click', function (e) {
      var collapsed = $('filters').classList.toggle('collapsed');
      e.target.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
    });

    // Collapsed by default when there is not room for both the filters and the
    // board. Hiding the filters is the lesser evil: a filter panel that pushes
    // the thing it filters off the screen is worse than one extra click, and the
    // active filters stay readable in the footer count.
    if (window.innerHeight < 800) {
      $('filters').classList.add('collapsed');
      $('toggle-filters').setAttribute('aria-pressed', 'false');
    }

    $('toggle-dropped').addEventListener('click', function (e) {
      state.showDropped = !state.showDropped;
      e.target.setAttribute('aria-pressed', state.showDropped ? 'true' : 'false');
      e.target.textContent = state.showDropped ? 'hide dropped' : 'show dropped';
      apply();
    });

    $('scrim').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDetail();
      // "/" focuses search, the way every issue tracker behaves.
      if (e.key === '/' && document.activeElement !== $('search')) {
        e.preventDefault();
        $('search').focus();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
