/* Profile extras (kept separate from script.js):
   1) "Profile" option in the account dropdown opens the Profile page.
   2) Change-password card on the Profile page. */
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };

  /* ---------- 1) Dropdown -> Profile page ---------- */
  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('.js-profile-open-btn');
    if (!btn) return;
    e.preventDefault();
    document.querySelectorAll('.profile-dropdown.open').forEach(function(d){ d.classList.remove('open'); });
    var view = $('profileView');
    var opener = $('pmProfileBtn');           // same button the mobile menu uses
    if (opener) opener.click();
    // Safety net: if the profile page didn't slide in, load it via the URL instead.
    setTimeout(function(){
      if (view && !view.classList.contains('open')) window.location.href = 'index.html?open=profile';
    }, 400);
  });

  /* ---------- 2) Change password ---------- */
  document.addEventListener('click', function(e){
    var eye = e.target.closest && e.target.closest('[data-pv-eye]');
    if (!eye) return;
    var input = eye.parentElement.querySelector('input');
    if (!input) return;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.classList.toggle('showing', show);
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  function msg(kind, text){
    var err = $('pvPassError'), ok = $('pvPassOk');
    if (!err || !ok) return;
    err.hidden = kind !== 'error'; ok.hidden = kind !== 'ok';
    if (kind === 'error') err.textContent = text;
    if (kind === 'ok') ok.textContent = text;
  }

  function savePassword(){
    var cur = $('pvCurrentPass').value, np = $('pvNewPass').value, cf = $('pvConfirmPass').value;
    var btn = $('pvPassSaveBtn');
    msg('none');
    if (!cur) return msg('error', 'Please enter your current password.');
    if (np.length < 6) return msg('error', 'New password must be at least 6 characters.');
    if (np !== cf) return msg('error', 'New password and confirm password do not match.');
    if (np === cur) return msg('error', 'Your new password must be different from your current one.');
    if (!window.MaziAPI) return msg('error', 'Service not available. Please refresh and try again.');

    btn.disabled = true; var label = btn.textContent; btn.textContent = 'Saving…';
    var done = function(){ btn.disabled = false; btn.textContent = label; };

    MaziAPI.getSession().then(function(sess){
      var email = sess && sess.user && sess.user.email;
      if (!email) throw { message: 'Password change needs an account that signs in with email.' };
      // Check the current password first
      return MaziAPI.client.auth.signInWithPassword({ email: email, password: cur }).then(function(res){
        if (res && res.error) throw { message: 'Your current password is incorrect.' };
      });
    }).then(function(){
      return MaziAPI.updatePassword(np);
    }).then(function(){
      $('pvCurrentPass').value = ''; $('pvNewPass').value = ''; $('pvConfirmPass').value = '';
      msg('ok', 'Password updated.');
      done();
    }).catch(function(err){
      msg('error', (err && err.message) || 'Could not update password. Please try again.');
      done();
    });
  }

  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('#pvPassSaveBtn')) savePassword();
  });

  /* ---------- 3) Dropdown: Profile / My Orders / Logout ----------
     Profile is added only if the dropdown doesn't already have one (no doubles). */
  function enhanceDropdowns(){
    document.querySelectorAll('.profile-dropdown').forEach(function(dd){
      // clean up anything left from the old account picker
      dd.querySelectorAll('.pd-accounts, .js-profile-accounts-btn').forEach(function(x){ x.remove(); });
      var btns = Array.prototype.slice.call(dd.querySelectorAll('button'));
      var isProfile = function(b){ return b.textContent.trim().toLowerCase() === 'profile'; };
      var mine = btns.filter(function(b){ return b.classList.contains('js-profile-open-btn'); });
      var native = btns.filter(function(b){ return isProfile(b) && !b.classList.contains('js-profile-open-btn'); });
      if (native.length && mine.length){ mine.forEach(function(b){ b.remove(); }); }
      else if (!native.length && !mine.length){
        var pb = document.createElement('button');
        pb.type = 'button'; pb.className = 'js-profile-open-btn'; pb.textContent = 'Profile';
        dd.insertBefore(pb, dd.firstChild);
      }
    });
  }
  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('.js-profile-toggle')) enhanceDropdowns();
  }, true);
  document.addEventListener('DOMContentLoaded', function(){
    enhanceDropdowns();
    setTimeout(enhanceDropdowns, 1200);
  });

  /* ---------- 4) Unsaved profile edits are saved when you log out ----------
     If you changed something on the Profile page (e.g. Date of Birth) but did not press
     "Save Profile", pressing Logout first triggers the normal Save, then logs out. */
  var pvDirty = false, logoutBusy = false;
  var LOGOUT_SEL = '.js-profile-logout-btn, #pmLogoutBtn, #pvLogoutBtn, #profileLogoutBtn, .profile-view-logout-btn';
  function markDirty(e){
    if (e.target && e.target.closest && e.target.closest('#profileView .pv-details-card')) pvDirty = true;
  }
  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);
  document.addEventListener('click', function(e){
    var el = e.target;
    if (!el || !el.closest) return;
    if (el.closest('#pvSaveBtn')) { pvDirty = false; saveExtraProfile(); return; }
    if (el.closest('#profileView .pv-currency-btn')) { pvDirty = true; return; }
    var lb = el.closest(LOGOUT_SEL);
    if (!lb || !pvDirty) return;
    var save = $('pvSaveBtn');
    if (!save) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (logoutBusy) return;
    logoutBusy = true;
    save.click();                       // the normal "Save Profile"
    setTimeout(function(){              // give it a moment to finish, then log out
      logoutBusy = false;
      pvDirty = false;
      lb.click();
    }, 1600);
  }, true);

  /* ---------- 5) Password fields are never pre-filled ----------
     The three fields start read-only (so the browser's password manager skips them) and unlock
     when you tap/focus them. They are also emptied whenever the Profile page opens or closes. */
  var PASS_IDS = ['pvCurrentPass', 'pvNewPass', 'pvConfirmPass'];
  function clearPasswordFields(){
    PASS_IDS.forEach(function(id){
      var el = $(id); if (!el) return;
      el.value = ''; el.type = 'password'; el.setAttribute('readonly', 'readonly');
    });
    document.querySelectorAll('#pvPasswordCard [data-pv-eye]').forEach(function(b){ b.classList.remove('showing'); });
  }
  document.addEventListener('focusin', function(e){
    if (e.target && PASS_IDS.indexOf(e.target.id) >= 0) e.target.removeAttribute('readonly');
  });
  document.addEventListener('pointerdown', function(e){
    var w = e.target.closest && e.target.closest('#pvPasswordCard .auth-password-wrap');
    if (w){ var i = w.querySelector('input'); if (i) i.removeAttribute('readonly'); }
  }, true);
  document.addEventListener('DOMContentLoaded', function(){
    clearPasswordFields();
    setTimeout(clearPasswordFields, 600);     // in case the browser filled them after load
    var pv = $('profileView');
    if (pv && window.MutationObserver){
      new MutationObserver(clearPasswordFields).observe(pv, { attributes: true, attributeFilter: ['class'] });
    }
  });
  window.addEventListener('pageshow', clearPasswordFields);

  /* ---------- 6) Profile page always opens at the top ---------- */
  function scrollProfileTop(){
    var pv = $('profileView');
    if (!pv) return;
    pv.scrollTop = 0;
    var wrap = pv.querySelector('.profile-view-wrap'); if (wrap) wrap.scrollTop = 0;
  }
  document.addEventListener('DOMContentLoaded', function(){
    var pv = $('profileView');
    if (!pv || !window.MutationObserver) return;
    new MutationObserver(function(){
      scrollProfileTop();                                  // as it starts sliding in
      if (pv.classList.contains('open')){
        // again after the slide-in and after My Accounts / profile data finish loading
        [80, 350, 900].forEach(function(ms){ setTimeout(function(){ if (pv.classList.contains('open') && !pv.__userScrolled) scrollProfileTop(); }, ms); });
        pv.__userScrolled = false;
      }
    }).observe(pv, { attributes: true, attributeFilter: ['class'] });
    // if the shopper starts scrolling themselves, stop forcing the top
    ['touchmove','wheel'].forEach(function(t){ pv.addEventListener(t, function(){ pv.__userScrolled = true; }, { passive: true }); });
  });

  /* ---------- 7) Birthday + last name are stored in the database ----------
     They used to live only in this browser's local copy, so they vanished after logout/login.
     Now Save Profile also writes profiles.last_name and profiles.dob, and they are read back
     into the form whenever the Profile page opens. */
  function pxToast(text){
    var t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);max-width:88vw;background:#b3261e;color:#fff;padding:10px 16px;font-size:13px;z-index:6000;box-shadow:0 6px 20px rgba(0,0,0,.25)';
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 6000);
  }
  function saveExtraProfile(){
    var ln = $('pvLastName'), dob = $('pvDob');
    if (!ln || !dob || !window.MaziAPI || !MaziAPI.client) return Promise.resolve();
    var patch = { last_name: ln.value.trim() || null, dob: dob.value || null };
    return MaziAPI.getSession().then(function(s){
      if (!s || !s.user) return;
      return MaziAPI.client.from('profiles').update(patch).eq('id', s.user.id).then(function(r){
        if (r && r.error) throw r.error;
      });
    }).catch(function(e){
      if (window.console) console.warn('Saving last name / birthday failed:', e);
      pxToast('Could not save birthday / last name: ' + ((e && e.message) || 'unknown error'));
    });
  }
  function fillExtraProfile(){
    if (pvDirty || !window.MaziAPI || !MaziAPI.getProfile) return;
    MaziAPI.getProfile().then(function(p){
      if (!p || pvDirty) return;
      var ln = $('pvLastName'), d = $('pvDob');
      if (p.last_name && ln) ln.value = p.last_name;
      if (p.dob && d) d.value = String(p.dob).slice(0, 10);
    }).catch(function(){});
  }
  document.addEventListener('DOMContentLoaded', function(){
    var pv = $('profileView');
    if (!pv || !window.MutationObserver) return;
    new MutationObserver(function(){
      if (!pv.classList.contains('open')) return;
      [300, 1000].forEach(function(ms){ setTimeout(fillExtraProfile, ms); });
    }).observe(pv, { attributes: true, attributeFilter: ['class'] });
  });
})();
