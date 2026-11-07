/* ============================================================
   MAZI storefront - SPECIAL OFFERS button + countdown timer
   Drop-in: add   <script src="special-offers.js" defer></script>   to index.html.
   Where it shows:
     - inside any element with   data-special-offers   (best: you choose the spot)
     - otherwise it is inserted at the top of <main> (or <body>).
   Dates are Philippine time (UTC+08:00).  Change them below.
   Behaviour:
     - before START  -> "Starts in"  + countdown to START
     - between       -> "Ends in"    + countdown to END
     - after END     -> the button hides itself (set HIDE_WHEN_ENDED=false to show "Ended")
   Click: goes to HREF, or fires the event  "mazi:special-offers"  on window.
   ============================================================ */
(function () {
  'use strict';

  var CONFIG = {
    LABEL: 'Special Offers',
    SUBLABEL: 'November 1–11, 2026 only',
    START: '2026-11-01T00:00:00+08:00',
    END:   '2026-11-11T23:59:59+08:00',
    HREF: '#special-offers',     // '' = no link, only fires the event
    HIDE_WHEN_ENDED: true
  };

  var startMs = Date.parse(CONFIG.START), endMs = Date.parse(CONFIG.END);
  if (isNaN(startMs) || isNaN(endMs)) return;

  var CSS = [
    '.so-btn{--so-a:#ffd43b;--so-b:#f5a300;--so-ink:#1b2a6b;',
    'display:flex;align-items:center;gap:12px;width:100%;max-width:520px;margin:10px auto;padding:10px 16px 10px 12px;',
    'border:2px solid #fff;border-radius:999px;cursor:pointer;text-decoration:none;color:var(--so-ink);',
    'font-family:Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'background:linear-gradient(180deg,var(--so-a),var(--so-b));',
    'box-shadow:0 4px 0 #b97800,0 8px 18px rgba(0,0,0,.25);-webkit-tap-highlight-color:transparent;',
    'transition:transform .15s ease,box-shadow .15s ease;box-sizing:border-box;text-align:left}',
    '.so-btn:hover{transform:translateY(-1px)}',
    '.so-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #b97800,0 3px 8px rgba(0,0,0,.25)}',
    '.so-btn:focus-visible{outline:3px solid #fff;outline-offset:3px}',
    '.so-ico{flex:0 0 38px;width:38px;height:38px;border-radius:50%;background:var(--so-ink);color:var(--so-a);',
    'display:grid;place-items:center}',
    '.so-ico svg{width:22px;height:22px}',
    '.so-txt{flex:1 1 auto;min-width:0;line-height:1.15}',
    '.so-title{display:block;font-weight:800;font-style:italic;font-size:15px;letter-spacing:.04em;text-transform:uppercase}',
    '.so-sub{display:block;margin-top:2px;font-weight:700;font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;opacity:.8}',
    '.so-time{flex:0 0 auto;text-align:center}',
    '.so-state{display:block;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.8;margin-bottom:3px}',
    '.so-cd{display:flex;gap:4px;justify-content:center}',
    '.so-u{min-width:34px;padding:3px 4px 2px;border-radius:7px;background:var(--so-ink);color:#fff;font-variant-numeric:tabular-nums}',
    '.so-u b{display:block;font-size:14px;font-weight:800;line-height:1.1}',
    '.so-u i{display:block;font-style:normal;font-size:7.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--so-a)}',
    '.so-btn.so-over{filter:grayscale(.85);cursor:default}',
    '@media (max-width:380px){.so-sub{display:none}.so-u{min-width:30px}.so-title{font-size:13.5px}}',
    '@media (prefers-reduced-motion:reduce){.so-btn{transition:none}}'
  ].join('');

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>' +
    '<path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function unit(v, l) { return '<span class="so-u"><b>' + v + '</b><i>' + l + '</i></span>'; }

  function build() {
    var style = document.createElement('style');
    style.id = 'so-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    var el = document.createElement(CONFIG.HREF ? 'a' : 'button');
    if (CONFIG.HREF) el.href = CONFIG.HREF; else el.type = 'button';
    el.className = 'so-btn';
    el.setAttribute('aria-label', CONFIG.LABEL + ', ' + CONFIG.SUBLABEL);
    el.innerHTML =
      '<span class="so-ico">' + ICON + '</span>' +
      '<span class="so-txt"><span class="so-title"></span><span class="so-sub"></span></span>' +
      '<span class="so-time"><span class="so-state"></span><span class="so-cd"></span></span>';
    el.querySelector('.so-title').textContent = CONFIG.LABEL;
    el.querySelector('.so-sub').textContent = CONFIG.SUBLABEL;

    el.addEventListener('click', function (e) {
      if (el.classList.contains('so-over')) { e.preventDefault(); return; }
      try { window.dispatchEvent(new CustomEvent('mazi:special-offers')); } catch (x) {}
    });
    return el;
  }

  function mount(el) {
    var slot = document.querySelector('[data-special-offers]');
    if (slot) { slot.appendChild(el); return; }
    var host = document.querySelector('main') || document.body;
    host.insertBefore(el, host.firstChild);
  }

  function init() {
    if (document.querySelector('.so-btn')) return;
    var el = build(), state = el.querySelector('.so-state'), cd = el.querySelector('.so-cd'), timer = 0;

    function tick() {
      var now = Date.now(), target, label;
      if (now < startMs) { target = startMs; label = 'Starts in'; }
      else if (now <= endMs) { target = endMs; label = 'Ends in'; }
      else {
        clearInterval(timer);
        if (CONFIG.HIDE_WHEN_ENDED) { el.remove(); return; }
        el.classList.add('so-over'); state.textContent = 'Offer ended';
        cd.innerHTML = ''; return;
      }
      var s = Math.max(0, Math.floor((target - now) / 1000));
      var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
      state.textContent = label;
      cd.innerHTML = unit(pad(d), 'Days') + unit(pad(h), 'Hrs') + unit(pad(m), 'Min') + unit(pad(sec), 'Sec');
    }

    if (Date.now() > endMs && CONFIG.HIDE_WHEN_ENDED) return;
    tick();
    mount(el);
    if (Date.now() <= endMs) timer = setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
