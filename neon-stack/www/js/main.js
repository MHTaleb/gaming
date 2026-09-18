/**
 * main.js - the app: screens, router, progression and ads.
 *
 * State machine in one place. `current` describes the run in progress, the
 * engine knows nothing about levels, stars or coins - it just reports events.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  function el(id) { return doc.getElementById(id); }

  var ui = {
    canvas: el('game'),
    hud: el('hud'),
    hudPause: el('hudPause'),
    score: el('score'),
    combo: el('combo'),
    perfectChip: el('perfectChip'),
    perfectCount: el('perfectCount'),
    goalWrap: el('goalWrap'),
    goalFill: el('goalFill'),
    goalLevel: el('goalLevel'),
    goalCount: el('goalCount'),
    cellRow: el('cellRow'),
    bossWrap: el('bossWrap'),
    bossFill: el('bossFill'),
    bossHp: el('bossHp'),
    bossName: el('bossName'),
    quip: el('quip'),
    quipText: el('quipText'),

    home: el('scr-home'),
    homeStars: el('homeStars'),
    homeCoins: el('homeCoins'),
    homeStreak: el('homeStreak'),
    homeBest: el('homeBest'),
    storyNext: el('storyNext'),
    storyLabel: el('storyLabel'),
    btnStory: el('btnStory'),
    btnEndless: el('btnEndless'),
    btnMissions: el('btnMissions'),
    btnDecks: el('btnDecks'),
    missionBadge: el('missionBadge'),
    btnLogs: el('btnLogs'),
    btnSkins: el('btnSkins'),
    btnSound: el('btnSound'),
    btnMusic: el('btnMusic'),

    levels: el('scr-levels'),
    levelGrid: el('levelGrid'),
    levelsStars: el('levelsStars'),

    intro: el('scr-intro'),
    introNum: el('introNum'),
    introTitle: el('introTitle'),
    introSub: el('introSub'),
    introLines: el('introLines'),

    complete: el('scr-complete'),
    completeBadge: el('completeBadge'),
    completeTitle: el('completeTitle'),
    starRow: el('starRow'),
    starHint: el('starHint'),
    completeBlocks: el('completeBlocks'),
    completePerfects: el('completePerfects'),
    completeCoins: el('completeCoins'),
    logUnlock: el('logUnlock'),
    logUnlockTitle: el('logUnlockTitle'),
    nextLevel: el('btnNextLevel'),

    over: el('scr-over'),
    overTitle: el('overTitle'),
    overRemaining: el('overRemaining'),
    overScore: el('overScore'),
    overSub: el('overSub'),
    revive: el('btnRevive'),
    reviveCoins: el('btnReviveCoins'),

    missions: el('scr-missions'),
    missionList: el('missionList'),
    missionsCoins: el('missionsCoins'),
    claimAll: el('btnClaimAll'),

    logs: el('scr-logs'),
    logList: el('logList'),
    logsCount: el('logsCount'),

    skins: el('scr-skins'),
    skinList: el('skinList'),
    skinsCoins: el('skinsCoins'),

    shop: el('scr-shop'),
    shopList: el('shopList'),
    shopCoins: el('shopCoins'),
    shopNotice: el('shopNotice'),
    shopFineprint: el('shopFineprint'),
    btnShop: el('btnShop'),
    btnRestore: el('btnRestore'),

    music: el('scr-music'),
    musicList: el('musicList'),
    musicNow: el('musicNow'),
    musicCount: el('musicCount'),
    musicToggle: el('btnMusicToggle'),
    musicAuto: el('btnMusicAuto'),
    musicVolume: el('musicVolume'),

    pause: el('scr-pause'),
    adLayer: el('ad-layer'),
    toast: el('toast'),
  };

  var COIN_CONTINUE_COST = 50;
  var SCREENS = ['home', 'levels', 'intro', 'complete', 'over', 'missions', 'logs', 'skins', 'shop', 'music', 'pause'];

  var QUIP_COOLDOWN = 5.5;      // seconds between voluntary lines
  var MUSE_AFTER = 20;          // seconds of calm before NS-7 thinks out loud

  var removedAds = false;   // legacy mirror only; Purchases owns the real answer
  var failsSinceAd = 0;
  var pendingLevel = 1;
  var openScreen = 'home';
  var screenStack = [];
  var current = { mode: 'endless', level: 1, cfg: null };
  var reportedStacked = 0;
  var runStats = null;
  var beats = {};               // first-time story beats already shown
  var quip = { last: '', at: 0, timer: 0, hideT: 0, posT: 0 };
  var museT = 0;

  /* ----------------------------- helpers ----------------------------- */

  function haptic(pattern) {
    if (!Store.get('haptics')) return;
    if (global.navigator && typeof global.navigator.vibrate === 'function') {
      try { global.navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  }

  function paletteFor(skinId) {
    var s = Skins.byId(skinId);
    return { id: s.id, hueBase: s.hueBase, hueStep: s.hueStep, spread: s.spread, bg: s.bg };
  }

  function pop(node) {
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
  }

  function missionToast(list) {
    if (!list.length) return;
    Toast('🎯 Mission complete: ' + list[0].label + '  +' + list[0].reward + ' ⛃');
    refreshBadges();
  }

  /* ----------------------------- NS-7's voice ----------------------------- */

  function chapterNow() {
    if (current.mode === 'level' && current.cfg) return current.cfg.chapter;
    var lv = Profile.unlocked();
    return Math.max(1, Math.min(Levels.chapterCount, Math.ceil(lv / Levels.perChapter)));
  }

  function positionQuip() {
    if (!game.actors || !game.actors.char) return;
    var p = game.project(game.actors.char.x, game.actors.char.y + 24);
    var w = global.innerWidth || 360;
    ui.quip.style.left = Math.round(clamp(p.x, 88, w - 88)) + 'px';
    ui.quip.style.top = Math.round(Math.max(120, p.y)) + 'px';
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function hideQuip() {
    ui.quip.classList.add('hidden');
    if (quip.posT) {
      global.clearInterval(quip.posT);
      quip.posT = 0;
    }
  }

  /** Shows a line above the drone. `force` skips the cooldown. */
  function say(text, opts) {
    if (!text) return;
    opts = opts || {};
    quip.last = text;
    quip.at = Date.now();
    ui.quipText.textContent = text;
    ui.quip.classList.remove('hidden');
    positionQuip();
    if (!quip.posT) quip.posT = global.setInterval(positionQuip, 90);
    global.clearTimeout(quip.hideT);
    quip.hideT = global.setTimeout(hideQuip, opts.duration || Math.min(4200, 1600 + text.length * 42));
  }

  /** Picks a random line for an event, respecting the cooldown. */
  function quipLine(key, opts) {
    opts = opts || {};
    var lines = Story.quip(key, chapterNow());
    if (!lines.length) return;
    if (!opts.force && Date.now() - quip.at < QUIP_COOLDOWN * 1000) return;
    var line = lines[Math.floor(Math.random() * lines.length)];
    if (lines.length > 1 && line === quip.last) {
      line = lines[(lines.indexOf(line) + 1) % lines.length];
    }
    say(line, opts);
  }

  /** Chapter-scoped one-shot beats: the first crawler, the first turret. */
  function firstBeat(key, quipKey) {
    var id = chapterNow() + ':' + key;
    if (beats[id]) return false;
    beats[id] = true;
    quipLine(quipKey, { force: true, duration: 3600 });
    return true;
  }

  /* ----------------------------- HUD ----------------------------- */

  function renderCells(cells, maxCells, hit) {
    if (!ui.cellRow) return;
    ui.cellRow.classList.remove('hidden');
    var html = '';
    for (var i = 0; i < maxCells; i++) {
      html += '<span class="cell' + (i < cells ? ' on' : '') + (hit && i === cells ? ' hit' : '') + '"></span>';
    }
    ui.cellRow.innerHTML = html;
  }

  function updateBoss(data) {
    if (!data || !data.maxHp) return;
    ui.bossWrap.classList.remove('hidden');
    ui.bossName.textContent = Story.bossName(chapterNow());
    ui.bossHp.textContent = Math.max(0, data.hp) + ' / ' + data.maxHp;
    ui.bossFill.style.width = Math.max(0, Math.round((data.hp / data.maxHp) * 100)) + '%';
  }

  /* ----------------------------- toast ----------------------------- */

  var toastTimer = 0;
  function Toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.remove('hidden');
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () {
      ui.toast.classList.add('hidden');
    }, 2400);
  }

  /* ----------------------------- engine ----------------------------- */

  var game = new NeonStack(ui.canvas, {
    haptic: haptic,
    onScore: function (score) {
      ui.score.textContent = String(score);
      pop(ui.score);
      if (game.combo < 2) ui.combo.classList.add('hidden');
    },
    onPerfect: function (combo, perfects) {
      ui.perfectCount.textContent = String(perfects);
      if (combo >= 2) {
        ui.combo.textContent = 'PERFECT x' + combo;
        ui.combo.classList.remove('hidden');
        ui.combo.style.animation = 'none';
        void ui.combo.offsetWidth;
        ui.combo.style.animation = '';
      }
      if (combo === 1) quipLine('firstPerfect');
      else if (combo === 3 || combo === 6) quipLine('combo');
      // The mix answers a good drop. A recording cannot do this.
      Music.react('perfect');
      missionToast(Missions.bump('perfects', 1));
    },
    onEvent: function (name, data) {
      switch (name) {
        case 'cells':
          renderCells(data.cells, data.maxCells, !!data.gained);
          if (data.gained) Music.react('coin');
          break;
        case 'crawlerSpawned':
          firstBeat('crawler', 'crawlerSeen');
          Music.setMood('tense');
          break;
        case 'crawlerKilled':
          if (data.how === 'crush') quipLine('crawlerKilled');
          Music.react('crush');
          break;
        case 'turretSpawned':
          firstBeat('turret', 'turretSeen');
          break;
        case 'turretBlast':
          Music.react('crush');
          quipLine('turretBlast', { force: true });
          break;
        case 'droneHit':
          renderCells(data.cells, data.maxCells, true);
          Music.react('hurt');
          quipLine(data.cells <= 1 ? 'lowCells' : 'droneHit', { force: true, duration: 2200 });
          break;
        case 'bossSpawned':
          updateBoss(data);
          Music.setMood('boss');
          Music.react('bossHit');
          quipLine('bossSeen', { force: true, duration: 4200 });
          break;
        case 'bossHit':
          updateBoss(data);
          if (data.hp > 0) {
            Music.react('bossHit');
            quipLine('bossHit');
          }
          break;
        case 'bossDefeated':
          Music.setMood('calm');
          Music.react('clear');
          quipLine('bossDead', { force: true, duration: 3000 });
          break;
      }
    },
    onProgress: function (p) {
      if (current.mode === 'level') {
        var pct = Math.min(100, Math.round((p.stacked / p.goal) * 100));
        ui.goalFill.style.width = pct + '%';
        ui.goalCount.textContent = p.stacked + ' / ' + p.goal;
        // The score lifts as you climb, so a long deck stops sounding static.
        Music.setIntensity(Math.min(1, p.stacked / p.goal));
      } else {
        Music.setIntensity(Math.min(1, (game.score || 0) / 60));
      }
      // Count blocks actually played, including blocks gained from a continue.
      var delta = p.stacked - reportedStacked;
      if (delta > 0) {
        reportedStacked = p.stacked;
        missionToast(Missions.bump('blocks', delta));
      }
    },
    onGameOver: function (score, stats) {
      failRun(score, stats);
    },
    onLevelComplete: function (stats) {
      completeRun(stats);
    },
    onStateChange: function () {
      ui.combo.classList.add('hidden');
      if (game.state !== 'playing') hideQuip();
    },
  });

  /* ----------------------------- router ----------------------------- */

  function showScreen(name, opts) {
    opts = opts || {};
    if (name && name === openScreen) return;
    if (opts.push !== false && openScreen && name && !opts.replace) {
      screenStack.push(openScreen);
    }
    for (var i = 0; i < SCREENS.length; i++) {
      var node = ui[SCREENS[i]];
      if (node) node.classList.add('hidden');
    }
    if (!name) {
      openScreen = null;
      return;
    }
    openScreen = name;
    var target = ui[name];
    if (target) target.classList.remove('hidden');
  }

  function back() {
    var prev = screenStack.pop();
    showScreen(prev || 'home', { push: false });
    if (prev === 'home') goHome();
  }

  function goHome() {
    game.stop();
    game.setState('idle');
    ui.hud.classList.add('hidden');
    showScreen('home', { push: false });
    screenStack.length = 0;
    refreshHome();
    Ads.showBanner();
    Music.stop();
  }

  function hideHud() {
    ui.hud.classList.add('hidden');
  }

  function showHud() {
    ui.hud.classList.remove('hidden');
    ui.goalWrap.classList.toggle('hidden', current.mode !== 'level');
    ui.perfectChip.classList.toggle('hidden', current.mode !== 'level');
  }

  /* ----------------------------- home ----------------------------- */

  function refreshHome() {
    var p = Profile;
    ui.homeStars.textContent = p.totalStars() + '/' + p.maxStars();
    ui.homeCoins.textContent = String(p.coins());
    ui.homeStreak.textContent = String(p.streak().days);
    ui.homeBest.textContent = String(p.endlessBest());

    var lv = p.unlocked();
    var cfg = Levels.config(lv);
    var info = Story.chapter(cfg.chapter);
    ui.storyNext.textContent = 'DECK ' + lv + ' · ' + info.name.toUpperCase();

    // Only the very first launch says "begin" - after that the player is resuming.
    var isFirstEver = p.unlocked() === 1 && p.totalStars() === 0;
    ui.storyLabel.textContent = isFirstEver ? 'BEGIN THE CLIMB' : 'CONTINUE STORY';

    refreshBadges();
  }

  function rendersAdsRemoved() {
    return !!(global.Purchases && global.Purchases.isAdsRemoved());
  }

  function refreshBadges() {
    var n = Missions.pendingCount();
    ui.missionBadge.classList.toggle('hidden', n === 0);
    ui.missionBadge.textContent = String(n);
  }

  /* ----------------------------- level flow ----------------------------- */

  function continueStory() {
    Sfx.unlock();
    Sfx.ui();
    var level = Profile.unlocked();
    enterLevel(level);
  }

  function enterLevel(level) {
    if (!Profile.isUnlocked(level)) {
      Toast('Clear the earlier decks first.');
      return;
    }
    pendingLevel = level;
    var cfg = Levels.config(level);
    // Show a chapter's intro card the first time the player reaches that chapter,
    // no matter which deck of it they tapped.
    if (!Profile.chapterSeen(cfg.chapter)) {
      renderIntro(cfg.chapter);
      showScreen('intro');
      return;
    }
    startLevel(level);
  }

  function renderIntro(chapterId) {
    var info = Story.chapter(chapterId);
    ui.introNum.textContent = String(chapterId);
    ui.introTitle.textContent = info.name;
    ui.introSub.textContent = info.subtitle;
    ui.introLines.innerHTML = '';
    for (var i = 0; i < info.intro.length; i++) {
      var p = doc.createElement('p');
      p.textContent = info.intro[i];
      p.style.animationDelay = (i * 110) + 'ms';
      ui.introLines.appendChild(p);
    }
  }

  function startLevel(level) {
    var cfg = Levels.config(level);
    current = { mode: 'level', level: level, cfg: cfg };
    Profile.markChapterSeen(cfg.chapter);

    game.configure({
      mode: 'level',
      goal: cfg.goal,
      tol: cfg.tol,
      baseW: cfg.baseW,
      speedMul: cfg.speedMul,
      palette: paletteFor(Profile.skin()),
      enemies: cfg.enemies,
    });

    ui.goalLevel.textContent = 'DECK ' + level + (cfg.isFinale ? ' · FINALE' : '');
    ui.goalCount.textContent = '0 / ' + cfg.goal;
    ui.goalFill.style.width = '0%';
    ui.bossWrap.classList.add('hidden');
    ui.bossFill.style.width = '100%';
    ui.perfectCount.textContent = '0';
    ui.score.textContent = '0';
    hideQuip();
    reportedStacked = 0;
    screenStack.length = 0;

    showScreen(null);
    showHud();
    Ads.hideBanner();
    Sfx.unlock();
    Music.start();
    Music.setMood('calm');
    // A fresh deck is a natural place for a new piece, if the last one has had
    // a fair run.
    Music.rotateIfDue(90);
    game.start();

    // Give NS-7 a line once the tower is standing and the intro has cleared.
    global.setTimeout(function () {
      if (game.state === 'playing' && current.mode === 'level' && current.level === level) {
        quipLine('deckStart', { force: true, duration: 3200 });
      }
    }, 900);
  }

  function startEndless() {
    Sfx.unlock();
    Sfx.ui();
    current = { mode: 'endless', level: 0, cfg: null };
    game.configure({
      mode: 'endless',
      palette: paletteFor(Profile.skin()),
      enemies: Levels.endlessEnemies(),
    });
    ui.score.textContent = '0';
    ui.bossWrap.classList.add('hidden');
    ui.bossFill.style.width = '100%';
    hideQuip();
    reportedStacked = 0;
    screenStack.length = 0;
    showScreen(null);
    showHud();
    Ads.hideBanner();
    Music.start();
    Music.setMood('calm');
    game.start();
  }

  function completeRun(stats) {
    var cfg = current.cfg;
    var stars = 1;
    if (stats.perfects >= cfg.stars[1]) stars = 2;
    if (stats.perfects >= cfg.stars[2]) stars = 3;

    var coins = stats.stacked + stats.perfects * 3 + stars * 15;
    var res = Profile.completeLevel(current.level, stars, coins);

    Missions.bump('levels', 1);
    Missions.bump('coins', coins, { flushNow: true });
    missionToast(Missions.bump('runs', 1));
    Missions.flush();

    var isFinale = current.level % Levels.perChapter === 0;
    var isGameEnd = current.level >= Levels.total;

    ui.completeBadge.classList.toggle('hidden', !isFinale);
    ui.completeBadge.textContent = isGameEnd ? 'SIGNAL RESTORED' : 'CHAPTER CLEAR';
    ui.completeTitle.textContent = isGameEnd ? Story.ending.title : 'DECK CLEARED';

    var starNodes = ui.starRow.querySelectorAll('.star');
    for (var i = 0; i < starNodes.length; i++) {
      var on = i < stars;
      starNodes[i].classList.toggle('on', on);
      starNodes[i].style.animationDelay = on ? (i * 180 + 120) + 'ms' : '0ms';
      starNodes[i].style.animation = '';
      void starNodes[i].offsetWidth;
    }

    var line = stars >= 3
      ? 'Perfect run. ' + stats.perfects + ' perfect drops.'
      : 'Next star at ' + (stars === 1 ? cfg.stars[1] : cfg.stars[2]) + ' perfect drops (you landed ' + stats.perfects + ').';
    var extras = [];
    if (stats.kills > 0) extras.push(stats.kills + ' crushed');
    if (stats.bossDefeated) extras.push('Warden down');
    if (extras.length) line += ' · ' + extras.join(' · ');
    ui.starHint.textContent = line;

    ui.completeBlocks.textContent = String(stats.stacked);
    ui.completePerfects.textContent = String(stats.perfects);
    ui.completeCoins.textContent = '+' + coins;

    if (res.logUnlocked) {
      ui.logUnlock.classList.remove('hidden');
      ui.logUnlockTitle.textContent = res.logUnlocked.title;
    } else {
      ui.logUnlock.classList.add('hidden');
    }

    ui.nextLevel.textContent = isGameEnd ? 'CLIMB AGAIN' : 'NEXT DECK';
    hideHud();
    showScreen('complete');
    Music.react('clear');
    Music.duck(2.5);
    haptic(20);
    Profile.save();
  }

  function failRun(score, stats) {
    runStats = stats;

    // Block counter for the interstitial cadence: only failures, never wins.
    failsSinceAd += 1;

    if (current.mode === 'level') {
      var remaining = Math.max(0, current.cfg.goal - stats.stacked);
      ui.overTitle.textContent = stats.reason === 'destroyed' ? 'NS-7 IS DOWN' : 'DECK FAILED';
      if (stats.bossFought && !stats.bossDefeated) {
        ui.overRemaining.textContent = 'The Warden is still standing.';
      } else if (stats.reason === 'destroyed') {
        ui.overRemaining.textContent = 'The crawlers got through.';
      } else {
        ui.overRemaining.textContent = remaining === 0
          ? 'So close.'
          : 'You were ' + remaining + (remaining === 1 ? ' block' : ' blocks') + ' from the top';
      }
      ui.overScore.textContent = stats.stacked;
      ui.overSub.textContent = 'TARGET ' + current.cfg.goal + ' BLOCKS';
    } else {
      var isBest = Profile.submitEndless(score);
      ui.overTitle.textContent = stats.reason === 'destroyed' ? 'NS-7 IS DOWN' : 'GAME OVER';
      ui.overRemaining.textContent = isBest && score > 0 ? 'New personal best!' : '';
      ui.overScore.textContent = String(score);
      ui.overSub.textContent = 'BEST ' + Profile.endlessBest();
    }

    var canRevive = !game.revived;
    // Ads-removed players keep the *rewarded* continue: it is opt-in value,
    // not an interruption. Only interstitials and banners are sold away.
    ui.revive.classList.toggle('hidden', !canRevive);
    ui.reviveCoins.classList.toggle('hidden', !canRevive);
    ui.reviveCoins.disabled = Profile.coins() < COIN_CONTINUE_COST;
    ui.reviveCoins.textContent = 'CONTINUE · ' + COIN_CONTINUE_COST + ' ⛃';

    missionToast(Missions.bump('runs', 1));
    if (current.mode === 'endless') Missions.bump('endlessScore', score, { flushNow: true });
    Missions.flush();

    hideHud();
    showScreen('over');
    Music.duck(2.5);
    Profile.save();
    refreshHome();

    if (!rendersAdsRemoved() && failsSinceAd >= 3) {
      failsSinceAd = 0;
      global.setTimeout(function () {
        if (openScreen === 'over') Ads.showInterstitial();
      }, 900);
    }
  }

  function reviveRun() {
    if (!game.revive()) return false;
    showScreen(null);
    showHud();
    reportedStacked = game.stacked;
    Sfx.revive();
    haptic(20);
    return true;
  }

  /* ----------------------------- level grid ----------------------------- */

  function renderLevels() {
    var unlocked = Profile.unlocked();
    var html = '';
    for (var ch = 1; ch <= Levels.chapterCount; ch++) {
      var start = Levels.firstLevelOfChapter(ch);
      var info = Story.chapter(ch);
      html += '<div class="chapter-block">';
      html += '<div class="chapter-head"><span class="chapter-num">CH ' + ch + '</span>';
      html += '<span class="chapter-name">' + info.name + '</span>';
      html += '<span class="chapter-sub">' + (start > unlocked ? 'LOCKED' : info.subtitle) + '</span></div>';
      html += '<div class="level-nodes">';
      for (var i = 0; i < Levels.perChapter; i++) {
        var lv = start + i;
        var cfg = Levels.config(lv);
        var stars = Profile.starsFor(lv);
        var locked = lv > unlocked;
        var cls = 'level-node';
        if (locked) cls += ' locked';
        if (stars > 0) cls += ' cleared';
        if (cfg.isFinale) cls += ' finale';
        if (lv === unlocked) cls += ' next';
        html += '<button class="' + cls + '" data-level="' + lv + '"' + (locked ? ' disabled' : '') + '>' + lv +
          '<span class="node-stars">' +
          '<i class="' + (stars >= 1 ? 'on' : '') + '">★</i>' +
          '<i class="' + (stars >= 2 ? 'on' : '') + '">★</i>' +
          '<i class="' + (stars >= 3 ? 'on' : '') + '">★</i>' +
          '</span></button>';
      }
      html += '</div></div>';
    }
    ui.levelGrid.innerHTML = html;
    ui.levelsStars.textContent = Profile.totalStars() + '/' + Profile.maxStars() + ' ★';
  }

  /* ----------------------------- missions ----------------------------- */

  function renderMissions() {
    var list = Missions.list();
    ui.missionsCoins.textContent = Profile.coins() + ' ⛃';
    var html = '';
    var widths = [];
    var anyClaimable = false;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var pct = Math.min(100, Math.round((m.progress / m.target) * 100));
      widths.push(m.claimed ? 100 : pct);
      var cls = 'mission-card' + (m.done ? ' done' : '') + (m.claimed ? ' claimed' : '');
      html += '<div class="' + cls + '">';
      html += '<div class="mission-top"><span class="mission-label">' + m.label + '</span>';
      html += '<span class="mission-reward">+' + m.reward + ' ⛃</span></div>';
      html += '<div class="mission-bar"><div class="mission-fill"></div></div>';
      html += '<div class="mission-progress">' + Math.min(m.progress, m.target) + ' / ' + m.target + '</div>';
      if (m.done && !m.claimed) {
        anyClaimable = true;
        html += '<button class="mission-claim" data-claim="' + m.id + '">CLAIM</button>';
      } else if (m.claimed) {
        html += '<div class="mission-progress">Claimed ✓</div>';
      }
      html += '</div>';
    }
    ui.missionList.innerHTML = html;
    // Widths go on via CSSOM, not a style="" attribute: style-src has no
    // 'unsafe-inline' and we want to keep it that way.
    var fills = ui.missionList.querySelectorAll('.mission-fill');
    for (var k = 0; k < fills.length; k++) fills[k].style.width = widths[k] + '%';
    ui.claimAll.classList.toggle('hidden', !anyClaimable);
  }

  /* ----------------------------- transmissions ----------------------------- */

  function renderLogs() {
    var html = '';
    var unlockedCount = 0;
    for (var i = 0; i < Story.chapters.length; i++) {
      var ch = Story.chapters[i];
      var has = Profile.hasLog(ch.log.id);
      if (has) unlockedCount++;
      html += '<div class="log-entry ' + (has ? '' : 'locked') + '">';
      html += '<div class="log-title">' + (has ? ch.log.title : 'ENCRYPTED · DECK ' + (ch.id * Levels.perChapter)) + '</div>';
      // Locked entries still render the text - CSS blurs it out. Seeing the
      // shape of what you have not unlocked yet is the point.
      html += '<div class="log-body">' + escapeHtml(ch.log.body) + '</div>';
      html += '</div>';
    }
    ui.logList.innerHTML = html;
    ui.logsCount.textContent = unlockedCount + '/' + Story.totalLogs;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ----------------------------- skins ----------------------------- */

  function renderSkins() {
    var eq = Profile.skin();
    ui.skinsCoins.textContent = Profile.coins() + ' ⛃';
    var html = '';
    for (var i = 0; i < Skins.all.length; i++) {
      var s = Skins.all[i];
      var owned = Profile.ownsSkin(s.id);
      var isEq = s.id === eq;
      html += '<div class="skin-card' + (isEq ? ' equipped' : '') + '">';
      html += '<div class="skin-swatch"></div>';
      html += '<div class="skin-info"><div class="skin-name">' + s.name + '</div>';
      html += '<div class="skin-desc">' + s.desc + '</div></div>';
      if (isEq) html += '<button class="skin-action equipped" disabled>EQUIPPED</button>';
      else if (owned) html += '<button class="skin-action" data-skin="' + s.id + '">USE</button>';
      else html += '<button class="skin-action locked" data-skin="' + s.id + '">' + s.cost + ' ⛃</button>';
      html += '</div>';
    }
    ui.skinList.innerHTML = html;
    var swatches = ui.skinList.querySelectorAll('.skin-swatch');
    for (var j = 0; j < swatches.length; j++) {
      var sk = Skins.all[j];
      swatches[j].style.background =
        'linear-gradient(135deg,' +
        'hsl(' + sk.hueBase + ',85%,62%),hsl(' + (sk.hueBase + sk.spread / 2) + ',80%,45%))';
    }
  }

  /* ----------------------------- input ----------------------------- */

  function onCanvasTap() {
    Sfx.unlock();
    if (game.state === 'playing') game.tap();
  }

  ui.canvas.addEventListener('pointerdown', onCanvasTap, { passive: true });

  doc.addEventListener('keydown', function (ev) {
    if (ev.code === 'Space' || ev.code === 'Enter') {
      if (game.state === 'playing') {
        ev.preventDefault();
        game.tap();
      }
    } else if (ev.code === 'Escape') {
      if (game.state === 'playing') pauseGame();
      else back();
    }
  });

  function pauseGame() {
    if (game.state !== 'playing') return;
    game.pause();
    Music.pause();
    showScreen('pause', { replace: true });
  }

  function resumeGame() {
    if (game.state !== 'paused') return;
    showScreen(null);
    game.resume();
    Music.resume();
  }

  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden && game.state === 'playing') pauseGame();
  });

  global.addEventListener('resize', function () { game.resize(); });
  global.addEventListener('orientationchange', function () {
    global.setTimeout(function () { game.resize(); }, 250);
  });

  /* ----------------------------- store ----------------------------- */

  var SHOP_ICONS = {
    remove_ads: '🚫',
    coins_small: '🪙',
    coins_medium: '💰',
    coins_large: '🏦',
  };

  function shopNotice(snap) {
    if (!snap.ready) return 'Connecting to the store...';
    if (snap.backend === 'disabled') return 'Purchases are disabled in config.js.';
    if (snap.error === 'billing-unavailable') {
      return 'The store is not available on this device, so nothing can be charged. Coins can still be earned by playing.';
    }
    if (!snap.native) return 'Development build - purchases are simulated and cost nothing.';
    if (!snap.validator) {
      return 'Receipts are not server-verified yet. Add your validator URL in config.js before you go live.';
    }
    return '';
  }

  /**
   * Built with DOM nodes, not innerHTML: titles and prices come back from the
   * store and must never be parsed as markup.
   */
  function renderShop() {
    var snap = Purchases.snapshot();
    ui.shopCoins.textContent = Profile.coins() + ' ⛃';

    var notice = shopNotice(snap);
    ui.shopNotice.textContent = notice;
    ui.shopNotice.classList.toggle('hidden', !notice);

    ui.shopList.textContent = '';
    Purchases.catalog().forEach(function (item) {
      var row = doc.createElement('div');
      row.className = 'shop-item' + (item.owned ? ' owned' : '') + (item.accent ? ' accent-' + item.accent : '');

      var icon = doc.createElement('div');
      icon.className = 'shop-icon';
      icon.textContent = SHOP_ICONS[item.id] || '✨';
      row.appendChild(icon);

      var info = doc.createElement('div');
      info.className = 'shop-info';
      var title = doc.createElement('div');
      title.className = 'shop-title';
      title.textContent = item.title;
      var blurb = doc.createElement('div');
      blurb.className = 'shop-blurb';
      blurb.textContent = item.blurb;
      info.appendChild(title);
      info.appendChild(blurb);
      row.appendChild(info);

      var buy = doc.createElement('button');
      buy.className = 'shop-buy' + (item.owned && item.kind === 'nonconsumable' ? ' owned' : '');
      buy.textContent = item.owned && item.kind === 'nonconsumable' ? 'OWNED' : item.price;
      if (item.owned && item.kind === 'nonconsumable') buy.disabled = true;
      else buy.setAttribute('data-buy', item.id);
      row.appendChild(buy);

      ui.shopList.appendChild(row);
    });

    ui.shopFineprint.textContent = snap.native
      ? 'Purchases are handled by Google Play. Restore brings back anything you have already bought.'
      : 'Store prices appear here on a real device.';
  }

  function buyError(res) {
    switch (res && res.error) {
      case 'unknown-product': return 'That item is not set up in the store yet.';
      case 'product-unavailable': return 'Google Play does not know that product id.';
      case 'store-not-ready': return 'The store is still connecting. Try again in a moment.';
      case 'store-disabled': return 'Purchases are turned off.';
      case 'order-failed': return 'Purchase cancelled.';
      case 'timeout': return 'The store did not answer. Nothing was charged.';
      case 'not-purchased': return 'The store has no record of that purchase.';
      case 'pending': return 'That purchase is still pending with the store.';
      case 'cancelled': return 'That purchase was cancelled.';
      case 'already-verified': return 'That receipt was already used.';
      case 'bad-signature':
      case 'nonce':
      case 'malformed':
        // A verification failure is deliberately vague in the UI and loud in
        // the logs: a real buyer should retry, an attacker learns nothing.
        return 'The purchase could not be verified. You have not been charged - please try again.';
      case 'validation-failed':
      case 'rejected':
        return 'That purchase could not be confirmed with the store.';
      case 'rate-limited': return 'Too many attempts. Try again in a minute.';
      default: return 'Purchase could not be completed.';
    }
  }

  function onBuyClick(ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-buy]') : null;
    if (!btn || btn.disabled) return;

    // A synthetic click means something is driving the UI that is not the
    // player. Purchase buttons only respond to a real tap.
    var sec = (global.NeonConfig && global.NeonConfig.security) || {};
    if (sec.requireUserGestureForPurchase !== false && ev.isTrusted !== true) {
      Toast('Purchase needs a real tap.');
      return;
    }

    var id = btn.getAttribute('data-buy');
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = '...';

    Purchases.buy(id).then(function (res) {
      btn.disabled = false;
      btn.textContent = label;
      if (!res || !res.ok) {
        Toast(buyError(res));
        return;
      }
      if (res.pending) {
        Toast('Confirming with the store...');
        return;
      }
      Sfx.coin();
      Toast(id === 'remove_ads' ? 'Ads removed. Thank you.' : 'Coins added. Thank you.');
      refreshHome();
      renderShop();
    });
  }

  /* ----------------------------- music ----------------------------- */

  /** The playlist. Built from DOM nodes: track names are data, not markup. */
  function renderMusic() {
    var now = Music.current();
    var all = Music.tracks();

    ui.musicCount.textContent = all.length + ' tracks';

    ui.musicToggle.textContent = Music.isEnabled() ? 'ON' : 'OFF';
    ui.musicToggle.classList.toggle('on', Music.isEnabled());
    ui.musicToggle.classList.toggle('off', !Music.isEnabled());

    ui.musicAuto.classList.toggle('on', Music.isAutoAdvance());
    ui.musicAuto.textContent = Music.isAutoAdvance() ? 'AUTO' : 'MANUAL';

    ui.musicNow.textContent = '';
    var nowLabel = doc.createElement('div');
    nowLabel.style.marginBottom = '4px';
    nowLabel.style.fontSize = '10px';
    nowLabel.style.letterSpacing = '0.18em';
    nowLabel.style.color = '#a5f3fc';
    nowLabel.textContent = Music.isRunning() ? 'NOW PLAYING' : 'SELECTED';
    var nowName = doc.createElement('b');
    nowName.textContent = now.name;
    var nowVibe = doc.createElement('div');
    nowVibe.textContent = now.vibe || '';
    ui.musicNow.appendChild(nowLabel);
    ui.musicNow.appendChild(nowName);
    ui.musicNow.appendChild(nowVibe);

    ui.musicList.textContent = '';
    all.forEach(function (t) {
      var row = doc.createElement('button');
      row.className = 'track-row' + (t.id === now.id ? ' playing' : '');
      row.setAttribute('data-track', t.id);

      var dot = doc.createElement('span');
      dot.className = 'track-dot';
      row.appendChild(dot);

      var info = doc.createElement('span');
      info.className = 'track-info';
      var name = doc.createElement('span');
      name.className = 'track-name';
      name.textContent = t.name;
      var vibe = doc.createElement('span');
      vibe.className = 'track-vibe';
      vibe.textContent = t.vibe || '';
      info.appendChild(name);
      info.appendChild(vibe);
      row.appendChild(info);

      var tag = doc.createElement('span');
      tag.className = 'track-tag ' + (t.character || 'calm');
      tag.textContent = t.character || 'calm';
      row.appendChild(tag);

      ui.musicList.appendChild(row);
    });
  }

  function onTrackClick(ev) {
    var row = ev.target.closest ? ev.target.closest('[data-track]') : null;
    if (!row) return;
    var id = row.getAttribute('data-track');
    var wasRunning = Music.isRunning();
    Music.playTrack(id);
    Store.set('musicTrack', id);
    // Picking a track from the sheet auditions it immediately.
    if (!wasRunning && Music.isEnabled()) {
      Sfx.unlock();
      Music.start();
    }
    renderMusic();
  }

  /* ----------------------------- buttons ----------------------------- */

  ui.btnStory.addEventListener('click', continueStory);
  ui.btnEndless.addEventListener('click', startEndless);
  ui.hudPause.addEventListener('click', pauseGame);
  el('btnResume').addEventListener('click', resumeGame);
  el('btnPauseHome').addEventListener('click', goHome);

  ui.btnDecks.addEventListener('click', function () {
    Sfx.ui();
    renderLevels();
    showScreen('levels');
  });

  ui.btnMissions.addEventListener('click', function () {
    Sfx.ui();
    renderMissions();
    showScreen('missions');
  });  ui.btnLogs.addEventListener('click', function () {
    Sfx.ui();
    renderLogs();
    showScreen('logs');
  });
  ui.btnSkins.addEventListener('click', function () {
    Sfx.ui();
    renderSkins();
    showScreen('skins');
  });

  ui.btnShop.addEventListener('click', function () {
    Sfx.ui();
    renderShop();
    showScreen('shop');
  });

  ui.shopList.addEventListener('click', onBuyClick);

  ui.btnRestore.addEventListener('click', function () {
    var sec = (global.NeonConfig && global.NeonConfig.security) || {};
    if (sec.requireUserGestureForPurchase !== false && arguments[0] && arguments[0].isTrusted !== true) return;
    Sfx.ui();
    ui.btnRestore.disabled = true;
    var label = ui.btnRestore.textContent;
    ui.btnRestore.textContent = 'RESTORING...';
    Purchases.restore().then(function (res) {
      ui.btnRestore.disabled = false;
      ui.btnRestore.textContent = label;
      if (!res || !res.ok) {
        Toast('Could not reach the store. Try again later.');
        return;
      }
      refreshHome();
      renderShop();
      Toast(Purchases.isAdsRemoved() ? 'Purchases restored.' : 'Nothing to restore.');
    });
  });

  ui.btnSound.addEventListener('click', function () {
    var on = !Store.get('sound');
    Store.set('sound', on);
    Sfx.setEnabled(on);
    if (on) Sfx.ui();
    ui.btnSound.textContent = on ? '🔊' : '🔇';
    ui.btnSound.classList.toggle('off', !on);
  });

  ui.btnMusic.addEventListener('click', function () {
    Sfx.ui();
    renderMusic();
    showScreen('music');
  });

  ui.musicList.addEventListener('click', onTrackClick);

  ui.musicToggle.addEventListener('click', function () {
    var on = !Music.isEnabled();
    Music.setEnabled(on);
    Store.set('music', on);
    Sfx.ui();
    ui.btnMusic.textContent = on ? '🎵' : '🚫';
    ui.btnMusic.classList.toggle('off', !on);
    renderMusic();
    Toast(on ? 'Music on' : 'Music off');
  });

  ui.musicAuto.addEventListener('click', function () {
    var on = !Music.isAutoAdvance();
    Music.setAutoAdvance(on);
    Store.set('musicAuto', on);
    Sfx.ui();
    renderMusic();
    Toast(on ? 'Tracks rotate automatically' : 'Staying on this track');
  });

  ui.musicVolume.addEventListener('input', function () {
    var v = Number(ui.musicVolume.value) / 100;
    Music.setVolume(v);
    Store.set('musicVolume', v);
  });
  ui.musicVolume.addEventListener('change', function () {
    Store.set('musicVolume', Number(ui.musicVolume.value) / 100);
  });

  var backs = doc.querySelectorAll('[data-back]');
  for (var b = 0; b < backs.length; b++) backs[b].addEventListener('click', back);

  el('btnIntroStart').addEventListener('click', function () {
    Sfx.ui();
    startLevel(pendingLevel);
  });
  el('btnIntroSkip').addEventListener('click', function () {
    Profile.markChapterSeen(Levels.config(pendingLevel).chapter);
    startLevel(pendingLevel);
  });

  el('btnNextLevel').addEventListener('click', function () {
    Sfx.ui();
    var next = current.level + 1;
    if (next > Levels.total) {
      enterLevel(1);
    } else {
      enterLevel(next);
    }
  });
  el('btnCompleteReplay').addEventListener('click', function () { startLevel(current.level); });
  el('btnCompleteHome').addEventListener('click', goHome);

  ui.revive.addEventListener('click', function () {
    ui.revive.disabled = true;
    Ads.showRewarded().then(function (rewarded) {
      ui.revive.disabled = false;
      if (!rewarded) {
        Toast('Ad skipped - no reward earned.');
        return;
      }
      reviveRun();
    });
  });

  ui.reviveCoins.addEventListener('click', function () {
    if (!Profile.spend(COIN_CONTINUE_COST)) {
      Toast('Not enough coins.');
      return;
    }
    Sfx.coin();
    reviveRun();
  });

  el('btnRetry').addEventListener('click', function () {
    if (current.mode === 'level') startLevel(current.level);
    else startEndless();
  });
  el('btnOverHome').addEventListener('click', goHome);

  ui.levelGrid.addEventListener('click', function (ev) {
    var node = ev.target.closest ? ev.target.closest('[data-level]') : null;
    if (!node) return;
    var lv = Number(node.getAttribute('data-level'));
    Sfx.ui();
    enterLevel(lv);
  });

  ui.missionList.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-claim]') : null;
    if (!btn) return;
    var got = Missions.claim(btn.getAttribute('data-claim'));
    if (got) {
      Sfx.coin();
      Toast('+' + got + ' ⛃');
      renderMissions();
      refreshHome();
    }
  });

  ui.claimAll.addEventListener('click', function () {
    var got = Missions.claimAll();
    if (got) {
      Sfx.coin();
      Toast('+' + got + ' ⛃ collected');
      renderMissions();
      refreshHome();
    }
  });

  ui.skinList.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-skin]') : null;
    if (!btn) return;
    var id = btn.getAttribute('data-skin');
    if (Profile.ownsSkin(id)) {
      Profile.equipSkin(id);
      Sfx.ui();
    } else if (Profile.buySkin(id)) {
      Sfx.coin();
      Toast('Theme unlocked. Equipped.');
    } else {
      Toast('Not enough coins - clear more decks.');
      return;
    }
    renderSkins();
    refreshHome();
  });

  /* ----------------------------- ambience ----------------------------- */

  /**
   * Long quiet stretches get a musing from NS-7 - the "talking to itself"
   * texture that makes the climb feel like a journey rather than a scoreboard.
   */
  function muse() {
    if (game.state !== 'playing') return;
    var a = game.actors;
    if (!a) return;

    // Keep the score in step with the deck: tense while something is on it,
    // a drone while a Warden is up, calm the moment the deck is clear again.
    if (a.boss && !a.boss.dead) Music.setMood('boss');
    else if (a.crawlers.length > 0) Music.setMood('tense');
    else Music.setMood('calm');

    if (a.crawlers.length > 0 || (a.boss && !a.boss.dead)) return;
    if (Date.now() - quip.at < MUSE_AFTER * 1000) return;
    quipLine('musing', { force: true, duration: 4200 });
  }

  /** Long runs get a new piece rather than the same one for half an hour. */
  function rotateMusic() {
    if (Music.rotateIfDue(210) && openScreen === 'music') renderMusic();
  }

  /* ----------------------------- boot ----------------------------- */

  function boot() {
    var soundOn = Store.get('sound');
    Sfx.setEnabled(soundOn);
    ui.btnSound.textContent = soundOn ? '🔊' : '🔇';
    ui.btnSound.classList.toggle('off', !soundOn);

    // Music is a separate switch: plenty of players want the bells and not the
    // chimes, and plenty want the opposite.
    var musicOn = Store.get('music') !== false;
    Music.init();
    Music.setEnabled(musicOn);
    Music.setAutoAdvance(Store.get('musicAuto') !== false);
    var savedVolume = Store.get('musicVolume');
    Music.setVolume(typeof savedVolume === 'number' ? savedVolume : 0.7);
    ui.musicVolume.value = String(Math.round(Music.getVolume() * 100));
    var savedTrack = Store.get('musicTrack');
    if (savedTrack && global.Tracks && Tracks.byId(savedTrack)) {
      Music.playTrack(savedTrack, { crossfade: false });
    }
    ui.btnMusic.textContent = musicOn ? '🎵' : '🚫';
    ui.btnMusic.classList.toggle('off', !musicOn);

    // The store is the source of truth for what has been paid for. This call
    // rebuilds entitlements from the store, then falls back to the cache if the
    // device is offline. Never trust the save file on its own.
    Purchases.init().then(function (snap) {
      removedAds = !!snap.adsRemoved;
      refreshHome();
      if (openScreen === 'shop') renderShop();
    });

    Purchases.onChange(function (snap) {
      removedAds = !!snap.adsRemoved;
      if (snap.adsRemoved) Ads.hideBanner();
      refreshHome();
    });

    Missions.ensure();

    var streak = Profile.touchStreak();
    if (streak.isNew && streak.bonus > 0) {
      global.setTimeout(function () {
        Toast('🔥 Day ' + streak.days + ' streak  +' + streak.bonus + ' ⛃');
      }, 600);
    }

    game.resize();
    refreshHome();
    showScreen('home', { push: false });

    global.setInterval(muse, 2000);
    global.setInterval(rotateMusic, 20000);

    Ads.init().then(function () { Ads.showBanner(); });

    if (global.location.search.indexOf('debug') >= 0) {
      global.__game = game;
      global.__ui = ui;
      global.__Store = Store;
      global.__Profile = Profile;
      global.__Missions = Missions;
      global.__Levels = Levels;
      global.__app = {
        startLevel: startLevel,
        startEndless: startEndless,
        enterLevel: enterLevel,
        goHome: goHome,
        current: function () { return current; },
      };
    }
  }

  if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
    global.setTimeout(boot, 0);
  } else {
    doc.addEventListener('DOMContentLoaded', boot);
  }
})(window);
