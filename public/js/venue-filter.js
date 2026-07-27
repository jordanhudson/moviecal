// Shared venue-filter state — the single source of truth for "which venues has
// this visitor hidden", used by the home, movie, and By Movie pages.
//
// Storage: ONE key, localStorage['hiddenTheatres'], holding a flat array of
// strings — there is no separate store or type tag for the two levels of
// hiding. An entry is either a *filter key* (a whole location, what a home-page
// chip represents: 'The Rio', 'Fifth Avenue') or a raw `theatre_name` (one
// auditorium hidden from the timeline: 'Fifth Ave Aud #3'). Which one it is is
// never recorded; `isHidden` simply tests a screening against both readings.
//
// That works because the two namespaces don't collide: for single-screen and
// 'separate' venues the location key and the auditorium name are the *same*
// string (and mean the same thing), so the levels only actually diverge for the
// prefix-collapsed Cineplex sites. Adding a location whose name equals some
// other location's auditorium would break the assumption.
//
// This is the format the feature has always written, so existing visitor
// preferences carry over untouched.
//
// Matching lives here and only here: pages ask isHidden(theatreName) rather than
// each re-implementing the exact/prefix rules (which is how they drifted apart).
window.VenueFilter = (function () {
  var KEY = 'hiddenTheatres';

  var CONFIG = (function () {
    var el = document.getElementById('venueFilters');
    try {
      return (el && JSON.parse(el.textContent)) || {};
    } catch (e) {
      return {};
    }
  })();
  var FILTERS = Array.isArray(CONFIG.filters) ? CONFIG.filters : [];
  var ALIASES = CONFIG.aliases || {};

  // theatre_name -> filter, plus key -> filter
  var byTheatre = {};
  var byKey = {};
  FILTERS.forEach(function (f) {
    byKey[f.key] = f;
    (f.theatreNames || []).forEach(function (n) {
      byTheatre[n] = f;
    });
  });

  /** Alias ('The Rio Theatre') -> the room's real `theatre_name` ('The Rio'). */
  function canonical(theatreName) {
    return ALIASES[theatreName] || theatreName;
  }

  /** The filter key a `theatre_name` belongs to (exact, then Cineplex prefix). */
  function keyFor(theatreName) {
    var name = canonical(theatreName);
    var exact = byTheatre[name];
    if (exact) return exact.key;
    for (var i = 0; i < FILTERS.length; i++) {
      if (FILTERS[i].prefix && name.indexOf(FILTERS[i].prefix) === 0) return FILTERS[i].key;
    }
    return name;
  }

  // Stored entries are canonicalized on the way out, so an entry written under
  // an alias still matches the room, and duplicates collapse.
  function read() {
    var raw;
    try {
      raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (v) {
      if (typeof v !== 'string' || !v) return;
      var name = canonical(v);
      if (out.indexOf(name) === -1) out.push(name);
    });
    return out;
  }

  var listeners = [];

  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      /* private mode / quota — filtering still applies for this page view */
    }
    listeners.forEach(function (fn) {
      fn();
    });
  }

  /** Is a screening at `theatreName` hidden? Matches the raw name or its key. */
  function isHidden(theatreName) {
    if (!theatreName) return false;
    var list = read();
    if (list.indexOf(canonical(theatreName)) !== -1) return true;
    return list.indexOf(keyFor(theatreName)) !== -1;
  }

  /** Display label for a stored entry (resolves shortName overrides via the key). */
  function labelFor(entry) {
    return (byKey[entry] && byKey[entry].label) || entry;
  }

  function hide(name) {
    var entry = canonical(name);
    var list = read();
    if (list.indexOf(entry) === -1) list.push(entry);
    write(list);
  }

  function unhide(name) {
    // Unhiding a venue also clears any of its auditoriums hidden individually,
    // so "show The Rio again" never leaves half its screens filtered out.
    var entry = canonical(name);
    var names = byKey[entry] ? byKey[entry].theatreNames || [] : [];
    var prefix = byKey[entry] && byKey[entry].prefix;
    write(
      read().filter(function (n) {
        if (n === entry) return false;
        if (names.indexOf(n) !== -1) return false;
        if (prefix && n.indexOf(prefix) === 0) return false;
        return true;
      }),
    );
  }

  function toggle(name) {
    if (read().indexOf(canonical(name)) === -1) hide(name);
    else unhide(name);
  }

  return {
    keyFor: keyFor,
    hidden: read,
    isHidden: isHidden,
    labelFor: labelFor,
    hide: hide,
    unhide: unhide,
    toggle: toggle,
    /** Re-run `fn` whenever the filter changes — in this tab or another one. */
    subscribe: function (fn) {
      listeners.push(fn);
      window.addEventListener('storage', function (e) {
        if (e.key === KEY) fn();
      });
    },
  };
})();
