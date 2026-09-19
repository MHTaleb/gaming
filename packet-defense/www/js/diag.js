/**
 * diag.js - the last line of defence.
 *
 * The problem this exists for is specific and it cost real time: a co-op battle
 * failed to start because a music lookup threw on an undefined ticket id, and the
 * exception aborted the rest of startBattle. The render loop never started, the
 * host broadcast nothing, and the screen looked like a battle that simply did not
 * begin. It was found by reading a console log during a manual two-client test,
 * which is not a strategy.
 *
 * So: nothing that throws is allowed to be silent.
 *
 * WHAT IT DOES
 *
 *   * keeps a small ring buffer of recent failures, so a bug report can quote one
 *   * installs window handlers, so an exception raised in a callback nobody
 *     wrapped is still recorded rather than vanishing into the console
 *   * tells whoever is listening, which is how the screen gets to say so
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not swallow anything, it does not stop the game, and it does not
 * classify. Deciding whether a failure is survivable belongs to the code that
 * knows what it was doing - the frame loop knows a single bad frame is fine and a
 * permanent one is not, and this file cannot know that.
 *
 * report() is written so that it cannot itself throw. A reporter that throws on
 * the reporting path turns one failure into a loop of failures, which is worse
 * than the failure.
 */
(function (global) {
  'use strict';

  var MAX = 20;
  var recent = [];
  var listeners = [];
  var installed = false;
  var seen = 0;
  var quiet = false;

  function describe(err) {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    if (err.message) return String(err.message);
    return String(err);
  }

  function stackOf(err) {
    if (!err || !err.stack) return '';
    // Only the first few frames. A full stack from a minified bundle is noise,
    // and this has to survive being pasted into a bug report.
    return String(err.stack).split('\n').slice(0, 6).join('\n');
  }

  /**
   * Record a failure. Returns the entry so a caller can hand it onward.
   *
   * Every step is guarded. If the console is missing, if a listener throws, if
   * the error object is a string, if it is undefined - none of it may propagate.
   */
  function report(err, context) {
    var entry = {
      at: Date.now(),
      context: String(context || 'unknown'),
      message: describe(err),
      stack: stackOf(err),
    };

    try {
      recent.push(entry);
      if (recent.length > MAX) recent.shift();
      seen++;
    } catch (e) { /* out of memory is not something this can fix */ }

    // A deliberately triggered failure is still recorded - the record is the
    // point - but it does not get to tell the player or the console that
    // something is wrong, because nothing is. Used by the self-test, and by any
    // future code that catches a failure and recovers from it on purpose.
    if (quiet) return entry;

    try {
      if (global.console && global.console.error) {
        global.console.error('[packet-defense] ' + entry.context + ': ' + entry.message);
      }
    } catch (e) { /* no console, keep going */ }

    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](entry);
      } catch (e) {
        // A listener that throws must not stop the next one, and must not
        // escape into whatever was already failing.
      }
    }
    return entry;
  }

  function install() {
    if (installed || !global.addEventListener) return installed;

    global.addEventListener('error', function (ev) {
      // A failed resource load fires 'error' on window too, with a target and no
      // .error. Those are not exceptions and reporting them as crashes would
      // make the signal useless - a missing image would look like a bug.
      if (ev && ev.target && ev.target !== global && ev.target.tagName) return;
      report((ev && ev.error) || new Error((ev && ev.message) || 'script error'),
        'window.onerror');
    });

    global.addEventListener('unhandledrejection', function (ev) {
      report((ev && ev.reason) || new Error('unhandled promise rejection'),
        'unhandledrejection');
    });

    installed = true;
    return true;
  }

  install();

  global.Diag = {
    report: report,
    /** Subscribe to failures. Returns nothing; there is no unsubscribe because
     *  every subscriber in this codebase lives as long as the page. */
    onError: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },
    recent: function () { return recent.slice(); },
    last: function () { return recent.length ? recent[recent.length - 1] : null; },
    count: function () { return seen; },
    /** How many distinct listeners are attached, for the self-test. */
    listenerCount: function () { return listeners.length; },
    isInstalled: function () { return installed; },
    clear: function () { recent.length = 0; },
    /**
     * Record failures without telling anybody.
     *
     * Restores the previous state even if the body throws, because the one
     * thing worse than a noisy reporter is a permanently muted one.
     */
    quiet: function (fn) {
      var was = quiet;
      quiet = true;
      try {
        return fn();
      } finally {
        quiet = was;
      }
    },
    isQuiet: function () { return quiet; },
    MAX: MAX,
  };
})(window);
