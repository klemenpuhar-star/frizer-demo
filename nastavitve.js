/* ═══════════════════════════════════════════════════════════════
   NASTAVITVE – edina datoteka, ki jo morate urediti.
   Vrednosti za Supabase najdete v Supabase -> Project Settings -> API
   (Project URL in "publishable" oz. "anon" kljuc – ta kljuc je javen, to je v redu).
   ═══════════════════════════════════════════════════════════════ */
window.APP = {
  supabaseUrl: 'https://lzbmdmdtycgimqirzknu.supabase.co',
  supabaseKey: 'sb_publishable_Rnf1nx52p7m0Iis_lvRSDA_8GYvbwet',

  ime:     'Frizerski salon Primer',      // ime podjetja (naslovi strani, potrditve)
  kratko:  'Salon Primer',                    // kratko ime (admin, izvozi v Excel)
  telefon: '031 000 000',                 // telefon za stranke (prikaz)
  logo:    'logo.png',                    // pot do logotipa (ce ga ni, se prikaze samo ime)

  // Barve (enake spremenljivke uporabljajo vse strani)
  barve: { navy: '#1c1a19', coral: '#b08d57', bez: '#e8dfd3', bez2: '#f7f3ee' }
};

/* ── od tu naprej ni treba nicesar spreminjati ── */
(function (A) {
  var d = String(A.telefon || '').replace(/[^\d+]/g, '');
  if (d.indexOf('00') === 0) d = '+' + d.slice(2);
  if (d && d.charAt(0) !== '+') d = '+386' + d.replace(/^0/, '');
  A.telefonIntl = d;
  var r = document.documentElement.style, b = A.barve || {};
  if (b.navy) r.setProperty('--navy', b.navy);
  if (b.coral) r.setProperty('--coral', b.coral);
  if (b.bez) r.setProperty('--bez', b.bez);
  if (b.bez2) r.setProperty('--bez2', b.bez2);
  function vstavi() {
    document.title = document.title.replace(/\{IME\}/g, A.ime).replace(/\{KRATKO\}/g, A.kratko || A.ime);
    var el = document.querySelectorAll('[data-app]');
    for (var i = 0; i < el.length; i++) {
      var k = el[i].getAttribute('data-app');
      if (k === 'logo') { el[i].src = A.logo; el[i].alt = A.ime; }
      else if (k === 'tel') { el[i].href = 'tel:' + A.telefonIntl; el[i].textContent = A.telefon; }
      else el[i].textContent = A[k] || '';
    }
    if (/VAS-PROJEKT|VAS-PUBLISHABLE/.test(A.supabaseUrl + A.supabaseKey)) {
      var o = document.createElement('div');
      o.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b42318;color:#fff;padding:12px 16px;font:15px/1.4 system-ui,sans-serif;text-align:center';
      o.textContent = 'Stran se ni povezana z bazo: v datoteki nastavitve.js vpisite supabaseUrl in supabaseKey.';
      document.body.appendChild(o);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vstavi); else vstavi();
})(window.APP);
