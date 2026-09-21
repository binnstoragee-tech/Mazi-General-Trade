/* My Accounts page — list the login's accounts, pick the active one, add a new one.
   Data: "Personal / Residential" comes from the profile; extra accounts live in public.shops (10_shops.sql). */
(function(){
  'use strict';
  const ATOLLS = {
  'Haa Alif (HA)': ['Dhidhdhoo', 'Hoarafushi', 'Kelaa', 'Ihavandhoo'],
  'Haa Dhaalu (HDh)': ['Kulhudhuffushi', 'Nolhivaranfaru', 'Hanimaadhoo'],
  'Shaviyani (Sh)': ['Funadhoo', 'Feydhoo', 'Milandhoo'],
  'Noonu (N)': ['Manadhoo', 'Holhudhoo', 'Velidhoo'],
  'Raa (R)': ['Ungoofaaru', 'Dhuvaafaru', 'Alifushi'],
  'Baa (B)': ['Eydhafushi', 'Thulhaadhoo', 'Dharavandhoo'],
  'Lhaviyani (Lh)': ['Naifaru', 'Hinnavaru'],
  'Kaafu (K)': ["Male'", "Hulhumale'", 'Vilingili', 'Dhiffushi', 'Gaafaru', 'Gulhi', 'Guraidhoo', 'Hinmafushi', 'Huraa', 'Kaashidhoo', 'Maafushi', 'Thulusdhoo'],
  'Alif Alif (AA)': ['Rasdhoo', 'Thoddoo', 'Ukulhas'],
  'Alif Dhaalu (ADh)': ['Mahibadhoo', 'Dhigurah', 'Dhangethi'],
  'Vaavu (V)': ['Felidhoo', 'Keyodhoo'],
  'Meemu (M)': ['Muli', 'Naalaafushi', 'Dhiggaru'],
  'Faafu (F)': ['Nilandhoo', 'Magoodhoo'],
  'Dhaalu (Dh)': ['Kudahuvadhoo', 'Meedhoo'],
  'Thaa (Th)': ['Veymandoo', 'Thimarafushi', 'Guraidhoo'],
  'Laamu (L)': ['Fonadhoo', 'Gan', 'Maabaidhoo'],
  'Gaafu Alif (GA)': ['Villingili', 'Maamendhoo'],
  'Gaafu Dhaalu (GDh)': ['Thinadhoo', 'Madaveli'],
  'Gnaviyani (Gn)': ['Fuvahmulah'],
  'Seenu (Addu) (S)': ['Hithadhoo', 'Maradhoo', 'Feydhoo', 'Hulhudhoo'],
};
  var BUSINESS_TYPES = ['Retail Shop','Supermarket / Mini Mart','Cafe / Restaurant','Resort / Hotel','Guesthouse','Wholesaler / Distributor','Other'];
  var $ = function(id){ return document.getElementById(id); };
  var state = { personal: null, shops: [], loadError: false };

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function showMsg(text, kind){
    var el = $('maMsg'); if (!text){ el.hidden = true; return; }
    el.textContent = text; el.className = 'ma-msg ' + (kind || ''); el.hidden = false;
  }

  /* ---------- data ---------- */
  function load(){
    return Promise.all([
      MaziAPI.getProfile().catch(function(){ return null; }),
      MaziAPI.listShops().then(function(l){ state.loadError = false; return l; })
        .catch(function(){ state.loadError = true; return []; })
    ]).then(function(res){
      var p = res[0] || {};
      state.personal = {
        id: 'personal', type: 'residence', status: 'approved',
        name: [p.name, p.last_name].filter(Boolean).join(' ') || 'Personal',
        place: [p.city, p.atoll].filter(Boolean).join(', ')
      };
      state.shops = (res[1] || []).map(function(s){
        return { id: s.id, type: s.account_type, status: s.status, name: s.name,
                 place: [s.city, s.atoll].filter(Boolean).join(', '), gst: s.gst_tin, gstExempt: s.gst_exempt,
                 businessType: s.business_type };
      });
      render();
    });
  }

  /* ---------- list ---------- */
  function render(){
    var all = [state.personal].concat(state.shops);
    $('maGrid').innerHTML = all.map(function(a){
      var isBiz = a.type === 'business';
      var note = a.status === 'pending' ? '<span class="ma-wait">Waiting for approval</span>'
               : (a.status === 'rejected' ? '<span class="ma-wait">Not approved</span>' : '');
      return '<div class="ma-card">' +
        '<div class="ma-name">' + esc(a.name) + '</div>' +
        '<span class="ma-type">' + (isBiz ? 'Business' : 'Personal / Residential') + '</span>' +
        (a.place ? '<div class="ma-place">' + esc(a.place) + '</div>' : '') +
        (isBiz && a.businessType ? '<div class="ma-place">' + esc(a.businessType) + '</div>' : '') +
        (isBiz ? '<div class="ma-place">' + (a.gstExempt ? 'Not GST registered' : (a.gst ? 'GST TIN: ' + esc(a.gst) : '')) + '</div>' : '') +
        '<div class="ma-foot"><span class="ma-status ' + esc(a.status) + '">' + esc(a.status) + '</span>' + note + '</div>' +
      '</div>';
    }).join('');
    if (state.loadError) showMsg("Couldn't load your business accounts yet. Make sure 10_shops.sql was run in Supabase.", 'error');
  }

  /* ---------- add account modal ---------- */
  function fillSelect(sel, items, placeholder){
    sel.innerHTML = '<option value="">' + esc(placeholder) + '</option>' +
      items.map(function(v){ return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
  }
  function syncType(){
    var biz = $('maType').value === 'business';
    $('maGstSwitchRow').hidden = !biz;
    $('maBizTypeField').hidden = !biz;
    $('maGstField').hidden = !biz || $('maGstExempt').checked;
    $('maNameLabel').textContent = biz ? 'Shop/Business Name' : 'Account Name';
  }
  function openModal(){
    $('maType').value = 'business'; $('maGstExempt').checked = false;
    $('maGst').value = ''; $('maName').value = '';
    fillSelect($('maBizType'), BUSINESS_TYPES, 'Select business type');
    fillSelect($('maAtoll'), Object.keys(ATOLLS), 'Select atoll');
    fillSelect($('maCity'), [], 'Select island');
    $('maError').hidden = true; syncType();
    $('maModal').hidden = false; document.body.classList.add('ma-modal-open');
  }
  function closeModal(){ $('maModal').hidden = true; document.body.classList.remove('ma-modal-open'); }
  function err(t){ var el = $('maError'); el.textContent = t; el.hidden = false; }

  $('maAddBtn').addEventListener('click', openModal);
  $('maCancel').addEventListener('click', closeModal);
  $('maModal').addEventListener('click', function(e){ if (e.target === $('maModal')) closeModal(); });
  $('maType').addEventListener('change', syncType);
  $('maGstExempt').addEventListener('change', syncType);
  $('maAtoll').addEventListener('change', function(){
    fillSelect($('maCity'), ATOLLS[$('maAtoll').value] || [], 'Select island');
  });

  $('maSubmit').addEventListener('click', function(){
    var biz = $('maType').value === 'business';
    var f = {
      accountType: $('maType').value, name: $('maName').value.trim(),
      businessType: $('maBizType').value, gstExempt: $('maGstExempt').checked,
      gstTin: $('maGst').value.trim().toUpperCase(),
      atoll: $('maAtoll').value, city: $('maCity').value
    };
    $('maError').hidden = true;
    if (biz && !f.gstExempt){
      if (!f.gstTin) return err('Please enter your GST TIN number, or switch on "not GST registered".');
      if (!/^\d{7}GST\d{3}$/.test(f.gstTin)) return err('GST TIN format should look like 1234567GST501.');
    }
    if (!f.name) return err(biz ? 'Please enter the shop / business name.' : 'Please enter an account name.');
    if (biz && !f.businessType) return err('Please select a business type.');
    if (!f.atoll) return err('Please select an atoll.');
    if (!f.city) return err('Please select a city / island.');

    var btn = $('maSubmit'); btn.disabled = true; btn.textContent = 'Submitting…';
    MaziAPI.addShop(f).then(function(){
      closeModal();
      document.dispatchEvent(new CustomEvent('mazi-accounts-updated'));
      showMsg(biz ? 'Account added. It will be available once our team approves it.' : 'Account added.', 'ok');
      return load();
    }).catch(function(e){
      err((e && e.message) || 'Could not add the account. Please try again.');
    }).then(function(){ btn.disabled = false; btn.textContent = 'Submit'; });
  });

  /* ---------- start (inside the Profile page) ---------- */
  function refresh(){
    MaziAPI.getSession().then(function(s){ if (s) load(); }).catch(function(){});
  }
  document.addEventListener('DOMContentLoaded', function(){
    if (!$('maGrid') || !window.MaziAPI) return;
    var pv = $('profileView');
    if (pv && window.MutationObserver){
      new MutationObserver(function(){ if (pv.classList.contains('open')) refresh(); })
        .observe(pv, { attributes: true, attributeFilter: ['class'] });
    }
    refresh();
  });
})();
