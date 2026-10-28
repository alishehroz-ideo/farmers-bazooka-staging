// ---- GameBull hooks (gamebull/client-hooks.js) ----
// A classic script loaded right after the client's app.js (outputs/farmers-bazooka/dist, never edited). Their
// top-level functions and lets (start, pause, readyTitle, showResult, send, toggleSound, game, state, muted...)
// are globals shared by every classic script, so this file can wrap them by reassigning. Their game is a Unity
// WebGL build driven by SendMessage('FarmRun', ...); everything here goes through their own send() and their own
// functions, so their rules decide every run. The GameBull shell (main.tsx, a module) only talks to window.FBClient.
'use strict';
(() => {
  const hooks = { onLock: null, onZero: null, onEnd: null };   // set by the shell
  const el = id => document.getElementById(id);
  let inRun = false;     // a GameBull run is on (their HUD shows, their menus stay closed)
  let held = false;      // Score Challenge: run started but frozen under the 5..1 GO intro
  let target = 0;        // Score Challenge target (early finish), 0 = none
  let limitS = 0;        // Score Challenge time limit in seconds of their run time, 0 = none (their run has no clock)
  let locked = false;    // scoring locked (target reached / time limit / run over)
  let ended = false;     // the end has been handed to the shell (once per run)
  let last = null;       // latest state object their Unity build published

  function closeTheirDialogs() {
    // A <dialog> opened with showModal() sits in the browser's top layer, above every z-index (trap W16).
    for (const id of ['instructions', 'course-menu']) { const d = el(id); if (d && d.open) d.close(); }
  }
  // Their screens the GameBull shell replaces: TOP (title, course menu), pause menu and result card.
  function hideTheirMenus(alsoHud) {
    for (const id of ['title', 'paused', 'result']) { const e = el(id); if (e) e.hidden = true; }
    if (alsoHud) for (const id of ['loading', 'hud', 'play-ui']) { const e = el(id); if (e) e.hidden = true; }
    closeTheirDialogs();
  }

  // Their readyTitle() shows their TOP page on every state update once Unity is ready; the GameBull lobby
  // replaces that page, so it stays hidden (their quality setting and loading hand-off still run).
  const __fbReadyTitle = readyTitle;
  readyTitle = function () { __fbReadyTitle(); el('title').hidden = true; };

  // No pause in a GameBull run: their pause button is hidden for the run (space kept), and their Escape key and
  // background auto-pause (visibilitychange) open nothing. Under the lobby it is theirs again.
  const __fbPause = pause;
  pause = function (value) { if (inRun || held) return; return __fbPause(value); };

  // Their render size: their boot() sends SetVisualViewport (their visualViewport()) once, as soon as
  // createUnityInstance resolves, and after that only when the canvas changes size. On a slower phone (iPhone) their
  // FarmRun is not loaded yet at that moment, the message is dropped, and Unity keeps the canvas default 300x150
  // stretched over the whole screen (blurred, stretched top to bottom). Whenever the canvas buffer is not the size
  // their page asks for (their ratio, their Unity clamp in FarmVisualQuality.cs), the buffer is set to that size
  // (their build runs with matchWebGLToCanvasSize=false, so Unity draws at whatever size the canvas has) and their
  // own visualViewport() is sent again so Unity's Screen size agrees.
  let fitAt = 0, fits = 0;
  // Layout size (clientWidth/Height), not the box on screen: their crash jolt (canvas.impact-hit) scales the canvas
  // for 0.38 s. Only a clear miss (over 3%) is put right, so a rounding pixel never fights their own size.
  function fitRender(why) {
    const c = el('game');
    if (!game || !c.clientWidth || !c.clientHeight) return;
    const ratio = visualQuality === 'low' ? 1 : Math.min(Math.max(devicePixelRatio, 1.25), 1.5);
    const w = Math.min(1000, Math.max(200, Math.round(c.clientWidth * ratio))), h = Math.min(1800, Math.max(300, Math.round(c.clientHeight * ratio)));
    if (Math.abs(c.width - w) <= w * 0.03 && Math.abs(c.height - h) <= h * 0.03) return;
    if (fits++ < 5) console.log(`[FB-GB] Render size ${c.width}x${c.height}, their page asks ${w}x${h} (${why}): set, and their visualViewport() sent again.`);
    c.width = w; c.height = h;
    const now = performance.now();
    if (now - fitAt < 1000) return;
    fitAt = now;
    visualViewport();
  }
  // Also between their state updates (their state stops while their game is paused or not yet ready).
  setInterval(() => fitRender('watch'), 500);

  // Their state callback (10 times a second from their Unity build): after their own HUD update, keep their
  // menus closed, keep their render size, and watch the Score Challenge target / time limit.
  const __fbState = window.onFarmersPortraitState;
  window.onFarmersPortraitState = s => {
    __fbState(s);
    last = s;
    if (s.ready) fitRender('state');
    hideTheirMenus(!inRun && !ended);
    if (!inRun || held || locked || ended || !s.running) return;
    if (target > 0 && !s.finishing && s.score >= target) {
      lock('target', s);
      console.log(`[FB-GB] Challenge target ${target} reached at ${s.score}; ending in 0.9 s.`);
      setTimeout(() => finishRun(s, 'target'), 900);
    } else if (limitS > 0 && !s.finishing && s.elapsed >= limitS) {
      lock('clock', s);
      const done = () => finishRun(s, 'timeout');
      if (hooks.onZero) hooks.onZero(done); else setTimeout(done, 700);
    }
  };

  // Target or time limit: freeze their game on that frame (their own pause, without their pause menu), so nothing
  // scores after it, then hand the numbers of that frame to the board.
  function lock(why, s) {
    locked = true;
    send('SetPaused', 1); send('SetBazookaHeld', 0); setSteer(0); stopFire();
    console.log(`[FB-GB] Run ends (${why}): their game paused at score ${s.score}.`);
    hooks.onLock?.(why);
  }

  // Their run end: their state callback calls showResult(s) once when their Unity run has ended (after their own
  // delivery / crash / fall animation). Their function still runs (their local TOP 5 and their farmers:score
  // event), then the GameBull board replaces their result card.
  const __fbShowResult = showResult;
  showResult = function (s) {
    __fbShowResult(s);
    if (!inRun) return;
    if (!locked) { locked = true; hooks.onLock?.(s.outcome); }
    finishRun(s, s.outcome);
  };

  function finishRun(s, reason) {
    if (ended) return;
    ended = true; inRun = false; held = false;
    stopRescueSound();
    el('pause').style.visibility = '';
    hideTheirMenus(true);
    const rows = s.rescuePoints + s.skillPoints + s.breakPoints + s.distancePoints + (s.finishPoints || 0) - s.penaltyPoints - (s.animalPenalty || 0);
    const f = {
      reason, outcome: s.outcome, clear: s.outcome === 'clear', total: s.score,
      rescue: s.rescuePoints, skill: s.skillPoints, breaks: s.breakPoints, distance: s.distancePoints || 0, finish: s.finishPoints || 0,
      hitPenalty: s.penaltyPoints, animalPenalty: s.animalPenalty || 0,
      animals: s.animals, required: s.required, hits: s.hits, animalLosses: s.animalLosses || 0, nearMisses: s.nearMisses,
      destroyed: s.destroyed, elapsed: s.elapsed, stage: s.stage, stageName: s.stageName, health: s.health,
      check: rows === s.score ? 'parts add up' : `PARTS MISMATCH ${rows}`,
    };
    console.log(`[FB-GB] Client run end '${reason}' (outcome '${s.outcome}'), stage ${s.stage} ${s.stageName}: ${s.animals}/${s.required} animals, ${s.hits} hits, ${s.elapsed.toFixed(1)} s, client score ${s.score} (${f.check}).`);
    hooks.onEnd?.(f);
  }

  // iPhone / Safari: sound may only start inside a tap, and Safari does not count an earlier tap. On their own
  // page start() runs inside the START tap; here the shell calls it after a server call, so their rescue chime's
  // AudioContext would stay suspended. On the player's taps during a run, start it the way their start() does.
  function audioTap() { if (inRun && !muted) { try { unlockRescueAudio(); } catch { /* their audio not ready */ } } }
  for (const t of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(t, audioTap, { capture: true, passive: true });

  window.FBClient = {
    hooks,
    // Unity loaded and their FarmRun ready (their own boot(): build-config.json, loader, createUnityInstance).
    ready() { return !!(game && state && state.ready); },
    failed() { return !el('reload').hidden; },
    loadProgress() { return Number(el('load-progress').value) || 0; },
    // Under the lobby: their page with every menu closed and their HUD hidden.
    park() {
      inRun = false; held = false; locked = false;
      el('pause').style.visibility = '';
      try { stopRescueSound(); } catch { /* not started */ }
      hideTheirMenus(true);
    },
    // A run = their own START (their random pick from the 50 courses, unless ?stage= is set), as delivered.
    start(opts) {
      target = opts.target || 0; limitS = opts.limitSeconds || 0;
      inRun = true; held = !!opts.hold; locked = false; ended = false;
      closeTheirDialogs();
      el('start').onclick();
      el('pause').style.visibility = 'hidden';
      // Held for the challenge intro: paused in the same tick, before their Unity build runs a frame.
      if (held) send('SetPaused', 1);
      fitAt = 0; fitRender('run start');
      const s = last;
      console.log(`[FB-GB] Client START: their run on a random course${held ? ' (held for the intro)' : ''}${target ? `, target ${target}` : ''}${limitS ? `, limit ${limitS} s` : ''}.`);
      return s;
    },
    go() { if (!held) return; held = false; send('SetPaused', 0); },
    totalScore() { return last ? last.score : 0; },
    // Seconds left under a challenge time limit (their run time, which stops while paused); Infinity with no limit.
    remaining() { return limitS > 0 && last ? Math.max(0, limitS - last.elapsed) : Infinity; },
    isRunning() { return inRun && !held && !locked; },
    muted() { return muted; },
    setMuted(v) { if (muted !== v) toggleSound(); },   // their own toggle: Unity mute, their chime and saved setting
    // Under the GameBull board: their Unity build muted directly (their saved setting untouched); their start()
    // sends their own setting again on the next run.
    silence() { send('SetMuted', 1); try { stopRescueSound(); } catch { /* not started */ } },
    // Localhost autoplay only (gamebull/ui/DevAuto.tsx): hold the road centre through their SetSteer, tap their
    // bazooka now and then. Their Unity rules decide everything else.
    autoStep(tick) {
      if (!this.isRunning() || !last) return;
      setSteer(Math.max(-1, Math.min(1, -last.x / 3)));
      send('SetBazookaHeld', tick % 8 < 2 ? 1 : 0);
    },
  };
  window.dispatchEvent(new Event('fbclient-ready'));
})();
