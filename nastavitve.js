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
  platforma:   'Naročanje',          // ime platforme (seznam salonov na prvi strani)

  // privzete vrednosti, dokler se salon ne naloži
  ime: '', kratko: '', telefon: '', logo: '',
  barve: { navy: '#1c1a19', coral: '#b08d57', bez: '#e8dfd3', bez2: '#f7f3ee' }
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
        var b = s.barve || {}, k = s.kontakt || {};
        A.salonId = s.id; A.slug = s.slug; A.tip = s.tip;
        A.ime = s.ime; A.kratko = s.kratko || s.ime;
        A.telefon = k.telefon || ''; A.telefonIntl = telIntl(A.telefon);
        A.email = k.email || ''; A.naslov = k.naslov || '';
        A.logo = s.logo_url || '';
        A.barve = { navy: b.glavna || A.barve.navy, coral: b.poudarek || A.barve.coral,
                    bez: b.ozadje2 || A.barve.bez, bez2: b.ozadje || A.barve.bez2 };
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
    return ok;
  });
})(window.APP);
