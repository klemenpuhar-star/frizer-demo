/* ═══════════════════════════════════════════════════════════════
   NASTAVITVE PLATFORME – skupne za vse salone.
   Vrednosti za Supabase najdete v Supabase -> Project Settings -> API
   (Project URL in "publishable" oz. "anon" kljuc – ta kljuc je javen, to je v redu).

   Vse ostalo (ime, telefon, barve, logo, pravila) je v bazi, v tabeli app_salons.
   Salon se prepozna iz naslova:   domena.si/<slug>        (stran za naročanje)
                                   domena.si/<stran>?s=<slug>  (ostale strani)
   ═══════════════════════════════════════════════════════════════ */
window.APP = {
  supabaseUrl: 'https://lzbmdmdtycgimqirzknu.supabase.co',
  supabaseKey: 'sb_publishable_Rnf1nx52p7m0Iis_lvRSDA_8GYvbwet',
  platforma:   'Slotbee',            // ime platforme (seznam salonov na prvi strani)
  obdelovalec: 'Frizerski studio Najs, Nataša Markuta s.p., Forme 37, 4209 Žabnica (davčna št. 54499453)',                   // vaše podjetje kot ponudnik platforme (pravilnik o zasebnosti), npr. 'Ime Priimek s.p., Ulica 1, 1000 Ljubljana'

  // privzete vrednosti, dokler se salon ne naloži
  ime: '', kratko: '', telefon: '', logo: '',
  // enoten videz Slotbee za vse salone (barve salona v bazi se ne uporabljajo)
  barve: { navy: '#16181D', coral: '#A8720A', bez: '#F4EEE4', bez2: '#FBF8F3' }
};

/* ── od tu naprej ni treba nicesar spreminjati ── */
(function (A) {
  var skript = document.currentScript;
  var STRAN = (skript && skript.getAttribute('data-stran')) || 'narocanje';   // narocanje | narocilo | admin | zasebnost
  var REZERVIRANO = ['index', 'index.html', 'admin', 'admin.html', 'narocilo', 'narocilo.html', 'zasebnost',
                     'zasebnost.html', 'n', 'nastavitve.js', 'robots.txt', 'favicon.ico', 'superadmin', 'superadmin.html'];

  function slugIzNaslova() {
    var q = new URLSearchParams(location.search).get('s');
    if (q) return q.toLowerCase();
    var prvi = decodeURIComponent(location.pathname.split('/')[1] || '').toLowerCase();
    if (!prvi || REZERVIRANO.indexOf(prvi) >= 0) return '';
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(prvi) ? prvi : '__neveljaven__';
  }

  function telIntl(t) {
    var d = String(t || '').replace(/[^\d+]/g, '');
    if (d.indexOf('00') === 0) d = '+' + d.slice(2);
    if (d && d.charAt(0) !== '+') d = '+386' + d.replace(/^0/, '');
    return d;
  }

  function nastaviBarve() {
    var r = document.documentElement.style, b = A.barve || {};
    if (b.navy) r.setProperty('--navy', b.navy);
    if (b.coral) r.setProperty('--coral', b.coral);
    if (b.bez) r.setProperty('--bez', b.bez);
    if (b.bez2) r.setProperty('--bez2', b.bez2);
  }

  /* ── Slotbee: logotip in pečat dejavnosti (ikona po tipu salona) ── */
  var IKONE = {
    frizer: '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="6" cy="6.5" r="2.7"/><circle cx="6" cy="17.5" r="2.7"/><path d="M8.2 8.2 20 18M8.2 15.8 20 6"/></g>',
    brivec: '<path d="M12 12.6c-1.4-2.6-4.4-3.7-6.6-2.2-1.3.9-1.3 2.9.3 3.6-1.7.1-3-.6-3.4-1.8-.6 2.9 2 5.1 5.2 4.5 2.3-.4 3.6-2 4.5-4.1.9 2.1 2.2 3.7 4.5 4.1 3.2.6 5.8-1.6 5.2-4.5-.4 1.2-1.7 1.9-3.4 1.8 1.6-.7 1.6-2.7.3-3.6-2.2-1.5-5.2-.4-6.6 2.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    pasji_frizer: '<g fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="16" rx="4.5" ry="3.8"/><circle cx="6" cy="10.5" r="1.8"/><circle cx="9.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/><circle cx="18" cy="10.5" r="1.8"/></g>',
    kozmetika: '<path d="M12 3.5c.6 4.3 2.9 6.6 7.5 7.5-4.6.9-6.9 3.2-7.5 8-.6-4.8-2.9-7.1-7.5-8 4.6-.9 6.9-3.2 7.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    masaza: '<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v6.5c0 4.5-2.5 8-6.5 8-3 0-4.4-1.5-6-4.2L3 13a1.5 1.5 0 0 1 2.6-1.5L8 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    vulkanizer: '<g fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5"/></g>',
    avtomehanik: '<path d="M14.5 4.2a4.5 4.5 0 0 0-5.3 6L4 15.4a2 2 0 0 0 2.8 2.8L12 13a4.5 4.5 0 0 0 6-5.3l-2.7 2.7-2.5-.4-.4-2.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    drugo: '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></g>'
  };
  A.ikonaTipa = function (tip) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (IKONE[tip] || IKONE.drugo) + '</svg>';
  };
  /* pečat: okrogel žig z ikono dejavnosti */
  A.pecat = function (tip) { return '<span class="sb-pecat" data-tip="' + (IKONE[tip] ? tip : 'drugo') + '">' + A.ikonaTipa(tip) + '</span>'; };
  var TIPI = { frizer: 'Frizerski salon', brivec: 'Brivnica', pasji_frizer: 'Salon za hišne ljubljenčke', kozmetika: 'Kozmetični salon',
               masaza: 'Masaža in nega', vulkanizer: 'Vulkanizerstvo', avtomehanik: 'Avtomehanična delavnica' };
  A.tipIme = function (tip) { return TIPI[tip] || 'Naročanje na termin'; };
  A.logoSlotbee = function () {
    return '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25z" fill="currentColor"/>'
      + '<rect x="10" y="14" width="12" height="4.5" rx="2.25" fill="#E5A82B"/></svg>';
  };

  function vstavi() {
    document.title = document.title.replace(/\{IME\}/g, A.ime || A.platforma).replace(/\{KRATKO\}/g, A.kratko || A.ime || A.platforma);
    var el = document.querySelectorAll('[data-app]');
    for (var i = 0; i < el.length; i++) {
      var k = el[i].getAttribute('data-app');
      if (k === 'logo') {
        if (A.logo) { el[i].src = A.logo; el[i].alt = A.ime; el[i].style.display = ''; }
        else el[i].style.display = 'none';
      }
      else if (k === 'tel') { el[i].href = 'tel:' + A.telefonIntl; el[i].textContent = A.telefon; }
      else if (k === 'zasebnost') el[i].href = '/zasebnost.html' + (A.slug ? '?s=' + encodeURIComponent(A.slug) : '');
      else if (k === 'domov') el[i].href = '/' + (A.slug || '');
      else if (k === 'pecat') el[i].innerHTML = A.pecat(A.tip);
      else if (k === 'tip') el[i].textContent = A.tipIme(A.tip);
      else if (k === 'slotbee') el[i].innerHTML = A.logoSlotbee() + '<span>' + String(A.platforma).toLowerCase().replace(/</g, '&lt;') + '</span>';
      else el[i].textContent = A[k] || '';
    }
  }
  A.vstavi = vstavi;

  function rest(pot) {
    return fetch(A.supabaseUrl + '/rest/v1/' + pot, { headers: { apikey: A.supabaseKey } })
      .then(function (r) { return r.ok ? r.json() : []; });
  }

  /* Naloži salon po slugu in ga zapiše v window.APP. Vrne true/false. */
  A.naloziSalon = function (slug) {
    if (!slug || slug === '__neveljaven__') return Promise.resolve(false);
    return rest('app_salons?select=id,slug,ime,kratko,tip,barve,logo_url,kontakt,pravila&aktiven=eq.true&slug=eq.' + encodeURIComponent(slug))
      .then(function (v) {
        var s = v && v[0];
        if (!s) return false;
        var k = s.kontakt || {};
        A.salonId = s.id; A.slug = s.slug; A.tip = s.tip;
        A.ime = s.ime; A.kratko = s.kratko || s.ime;
        A.telefon = k.telefon || ''; A.telefonIntl = telIntl(A.telefon);
        A.email = k.email || ''; A.naslov = k.naslov || '';
        A.logo = s.logo_url || '';
        A.pravila = s.pravila || {};
        nastaviBarve();
        return rest('app_kategorije?select=ime,sort_order,vec_oseb,oznaka_oseb,nujna,barva&salon_id=eq.' + s.id)
          .then(function (kat) {
            A.kategorije = {};
            (kat || []).forEach(function (x) { A.kategorije[x.ime] = x; });
            return true;
          });
      })
      .catch(function () { return false; });
  };

  /* Pomočniki za kategorije (prej: posebni imeni "Otroci" in "...nujni...") */
  A.katVecOseb = function (ime) { var k = A.kategorije && A.kategorije[ime]; return k ? !!k.vec_oseb : ime === 'Otroci'; };
  A.katNujna = function (ime) { var k = A.kategorije && A.kategorije[ime]; return k ? !!k.nujna : String(ime || '').toLowerCase().indexOf('nujni') >= 0; };
  A.katOznakaOseb = function (ime) { var k = A.kategorije && A.kategorije[ime]; return (k && k.oznaka_oseb) || 'Število oseb'; };

  /* Seznam salonov (prva stran brez sluga) */
  function prikaziSeznam() {
    rest('app_salons?select=slug,ime,tip&aktiven=eq.true&order=ime').then(function (v) {
      var h = '<main style="max-width:560px;margin:0 auto;padding:48px 20px;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#1c1a19">'
        + '<h1 style="font-family:Georgia,serif;font-weight:400;font-size:2rem;margin:0 0 .4rem">' + A.platforma + '</h1>'
        + '<p style="color:#5c5146;margin:0 0 1.6rem">Izberite salon za spletno naročanje.</p>';
      (v || []).forEach(function (s) {
        h += '<a href="/' + encodeURIComponent(s.slug) + '" style="display:block;padding:16px 18px;margin-bottom:10px;background:#fff;border:1px solid #ece5db;border-radius:14px;color:inherit;text-decoration:none">'
          + '<strong>' + String(s.ime).replace(/</g, '&lt;') + '</strong></a>';
      });
      if (!v || !v.length) h += '<p>Trenutno ni aktivnih salonov.</p>';
      document.body.innerHTML = h + '</main>';
      document.body.style.background = '#f7f3ee';
      document.title = A.platforma;
    });
  }

  function prikaziNiSalona() {
    document.body.innerHTML = '<main style="max-width:520px;margin:0 auto;padding:64px 20px;text-align:center;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#1c1a19">'
      + '<h1 style="font-family:Georgia,serif;font-weight:400;font-size:1.8rem">Salon ne obstaja</h1>'
      + '<p style="color:#5c5146;line-height:1.6">Naslov ni pravilen ali salon trenutno ne sprejema spletnih naročil.</p>'
      + '<p><a href="/" style="color:#1c1a19">Seznam salonov</a></p></main>';
    document.body.style.background = '#f7f3ee';
    document.title = 'Salon ne obstaja';
  }

  if (/VAS-PROJEKT|VAS-PUBLISHABLE/.test(A.supabaseUrl + A.supabaseKey)) {
    document.addEventListener('DOMContentLoaded', function () {
      var o = document.createElement('div');
      o.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b42318;color:#fff;padding:12px 16px;font:15px/1.4 system-ui,sans-serif;text-align:center';
      o.textContent = 'Stran se ni povezana z bazo: v datoteki nastavitve.js vpisite supabaseUrl in supabaseKey.';
      document.body.appendChild(o);
    });
  }

  nastaviBarve();
  var domPripravljen = new Promise(function (ok) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ok); else ok();
  });

  /* APP.ready: obljuba, ki se razreši s true, ko je salon naložen.
     Stran za spremembo termina (narocilo) salon naloži sama po žetonu. */
  var slug = slugIzNaslova();
  var nalaganje;
  if (STRAN === 'narocilo' || STRAN === 'superadmin') nalaganje = Promise.resolve(false);
  else if (STRAN === 'admin') {
    // admin: salon iz ?s= ali zadnji izbrani; dokončna izbira je po prijavi (med saloni, katerih član je uporabnik)
    var zadnji = ''; try { zadnji = localStorage.getItem('admin_salon') || ''; } catch (e) {}
    nalaganje = A.naloziSalon(slug || zadnji);
  }
  else nalaganje = A.naloziSalon(slug);

  A.ready = Promise.all([nalaganje, domPripravljen]).then(function (r) {
    var ok = r[0];
    if (!ok && STRAN === 'narocanje') { if (slug) prikaziNiSalona(); else prikaziSeznam(); return false; }
    if (!ok && STRAN === 'admin') { A.ime = A.platforma; A.kratko = A.platforma; }
    vstavi();
    if (ok && STRAN === 'narocanje' && A.pravila && A.pravila.demo) demoPasica();
    return ok;
  });

  /* Primer salona (pravila.demo = true): pasica nad stranjo */
  function demoPasica() {
    var o = document.createElement('div');
    o.setAttribute('role', 'note');
    o.style.cssText = 'position:relative;z-index:100000;background:#1c1a19;color:#fff;padding:10px 16px;font:14px/1.45 system-ui,-apple-system,Segoe UI,Arial,sans-serif;text-align:center';
    o.innerHTML = '<b>Primer salona za predstavitev ' + String(A.platforma).replace(/</g, '&lt;') + '.</b> Termini niso pravi. '
      + 'Naročilo lahko preizkusite – prejeli boste potrditev po SMS, salon pa vas ne bo pričakoval.';
    document.body.insertBefore(o, document.body.firstChild);
  }
})(window.APP);
