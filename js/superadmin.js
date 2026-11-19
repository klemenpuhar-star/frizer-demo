(function(){
'use strict';
var sb = supabase.createClient(APP.supabaseUrl, APP.supabaseKey);
var $ = function(id){ return document.getElementById(id); };
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sporoci(id, t, ok){ var m=$(id); m.textContent=t; m.className='sporocilo '+(ok?'ok':'err'); }
function pokazi(k){ ['pogledPrijava','pogledNi','pogledApp'].forEach(function(x){ $(x).classList.toggle('hidden', x!==k); }); }
var TIPI={frizer:'Frizerski salon',brivec:'Brivnica',pasji_frizer:'Salon za ljubljenčke',kozmetika:'Kozmetični salon',masaza:'Masaža in nega',vulkanizer:'Vulkanizerstvo',avtomehanik:'Avtomehanična delavnica'};

/* naslov iz imena: "Frizerski salon Ana" -> "frizerski-salon-ana" */
function vSlug(t){
  return String(t||'').toLowerCase()
    .replace(/[čć]/g,'c').replace(/š/g,'s').replace(/ž/g,'z').replace(/đ/g,'d')
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
}
var slugRocno=false;
$('nIme').addEventListener('input', function(){ if(!slugRocno){ $('nSlug').value=vSlug($('nIme').value); namigSlug(); } });
$('nSlug').addEventListener('input', function(){ slugRocno=true; $('nSlug').value=$('nSlug').value.toLowerCase().replace(/[^a-z0-9-]/g,''); namigSlug(); });
function namigSlug(){ var s=$('nSlug').value; $('nSlugNamig').textContent = s ? (location.origin+'/'+s) : ''; }

function zacni(seja){
  $('kdo').textContent = seja.user.email;
  sb.rpc('app_je_superadmin').then(function(r){
    if(r.error || r.data!==true){ pokazi('pogledNi'); return; }
    pokazi('pogledApp'); nalozi();
  });
}

/* obvestila platforme (npr. salon je dodal zaposlenega) – neprebrana */
function naloziDogodke(){
  sb.from('app_dogodki_platforme').select('id,cas,opis').eq('prebrano', false).order('cas', {ascending:false}).limit(50).then(function(r){
    var v = (r && !r.error && r.data) || [];
    $('kartaDogodki').classList.toggle('hidden', !v.length);
    $('dogodki').innerHTML = v.map(function(d){
      return '<div class="dogodek"><span'+(/PRESEGA/.test(d.opis)?' class="opoz-paket"':'')+'>'+esc(d.opis)+'</span><small>'+new Date(d.cas).toLocaleString('sl-SI',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})+'</small></div>';
    }).join('');
  });
}
$('gPrebrano').addEventListener('click', function(){
  sb.from('app_dogodki_platforme').update({prebrano:true}).eq('prebrano', false).then(naloziDogodke);
});
var ZAP_SALON = {}, PODJ = {};
function nalozi(){
  naloziDogodke();
  Promise.all([sb.rpc('app_superadmin_zaposleni'), sb.rpc('app_superadmin_podjetja')]).then(function(r){
    ZAP_SALON = {}; ((r[0] && r[0].data) || []).forEach(function(x){ ZAP_SALON[x.salon_id] = x; });
    PODJ = {}; ((r[1] && r[1].data) || []).forEach(function(x){ PODJ[x.salon_id] = x.podjetje || {}; });
    nalozi2();
  });
}
function podjetjeBesedilo(p){
  p=p||{}; var d=[];
  if(p.naziv) d.push('<b style="font-size:.82rem">'+esc(p.naziv)+'</b>');
  if(p.naslov) d.push(esc(p.naslov)); if(p.davcna) d.push('DŠ '+esc(p.davcna)); if(p.email) d.push(esc(p.email));
  return d.length ? 'Podjetje: '+d.join(' · ') : '<span style="color:#8a5a00">Podatki podjetja niso vpisani</span>';
}
function podjetjeForma(sid){
  var host=document.querySelector('[data-podj-box="'+sid+'"]'); if(!host) return;
  if(host.innerHTML){ host.innerHTML=''; return; }
  var p=PODJ[sid]||{};
  var pol=function(k,l,ph,t){ return '<label>'+l+'<input type="'+(t||'text')+'" data-pf="'+k+'" value="'+esc(p[k]||'')+'" placeholder="'+ph+'"></label>'; };
  host.innerHTML='<div class="rac-forma" style="border:1px solid var(--rob);border-radius:10px;margin-top:8px">'
    +'<div class="vrsta">'+pol('naziv','Ime podjetja (v glavi admina)','npr. Brivnica Miha')+pol('davcna','Davčna številka','SI12345678')+'</div>'
    +'<div class="vrsta">'+pol('naslov','Naslov podjetja','Ulica 1, 1000 Ljubljana')+pol('email','E-pošta za račune','racuni@podjetje.si','email')+'</div>'
    +'<button type="button" class="gumb" data-pshrani>Shrani podjetje</button> <button type="button" class="gumb svetel" data-pprekl>Prekliči</button>'
    +'<div class="sporocilo" data-psp></div></div>';
  host.querySelector('[data-pprekl]').onclick=function(){ host.innerHTML=''; };
  host.querySelector('[data-pshrani]').onclick=function(){
    var b=this, pod={}; host.querySelectorAll('[data-pf]').forEach(function(i){ pod[i.getAttribute('data-pf')]=i.value; });
    var sp=host.querySelector('[data-psp]'); b.disabled=true;
    sb.rpc('app_superadmin_podjetje',{s:sid, p:pod}).then(function(x){
      b.disabled=false;
      if(x.error||!x.data||!x.data.ok){ sp.textContent=(x.error&&x.error.message)||(x.data&&x.data.napaka)||'Ni shranjeno.'; sp.className='sporocilo err'; return; }
      sp.textContent='Shranjeno.'; sp.className='sporocilo ok'; setTimeout(nalozi,700);
    });
  };
}
function nalozi2(){
  sb.rpc('app_superadmin_saloni').then(function(r){
    var box=$('seznam');
    if(r.error){ box.innerHTML='<p class="sporocilo err">Napaka: '+esc(r.error.message)+'</p>'; return; }
    var v=r.data||[];
    if(!v.length){ box.innerHTML='<p class="namig">Še ni salonov.</p>'; return; }
    box.innerHTML = v.map(function(s){
      var url=location.origin+'/'+s.slug;
      return '<div class="salon"><span class="sb-pecat mali">'+APP.ikonaTipa(s.tip)+'</span><div class="levo"><b>'+esc(s.ime)+'</b>'
        +(s.aktiven?'<span class="znacka">aktiven</span>':'<span class="znacka off">izklopljen</span>')
        +'<div class="meta">'+esc(TIPI[s.tip]||'drugo')+' · <a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(url)+'</a></div>'
        +'<div class="meta">Storitev: '+s.st_storitev+' · Rezervacij: '+s.st_rezervacij+' · Ustvarjen: '+new Date(s.created_at).toLocaleDateString('sl-SI')+'</div>'
        +(ZAP_SALON[s.id]?'<div class="meta">Zaposleni: '+ZAP_SALON[s.id].aktivni+' aktivnih, '+ZAP_SALON[s.id].s_prijavo+' s prijavo</div>':'')
        +'<div class="meta">'+podjetjeBesedilo(PODJ[s.id])+'</div><div data-podj-box="'+s.id+'"></div>'
        +'<div class="clani-sez" data-clani="'+s.id+'"><div class="clan-vr namig">Nalagam člane …</div></div>'
        +'<div class="clan"><input type="email" placeholder="e-pošta novega člana" data-clan-email="'+s.id+'">'
        +'<select data-clan-vloga="'+s.id+'"><option value="lastnik">lastnik</option><option value="admin" selected>admin</option><option value="recepcija">recepcija</option><option value="zaposleni">zaposleni</option></select>'
        +'<button class="gumb svetel" data-clan="'+s.id+'">Dodaj člana</button></div>'
        +'<div class="sporocilo" id="sp-'+s.id+'"></div></div>'
        +'<div class="desno"><button class="gumb svetel" data-podj="'+s.id+'">Podjetje</button><button class="gumb svetel" data-aktiven="'+s.id+'" data-vrednost="'+(s.aktiven?'0':'1')+'">'+(s.aktiven?'Izklopi':'Vklopi')+'</button></div></div>';
    }).join('');
    v.forEach(function(s){ naloziClane(s.id); });
    box.querySelectorAll('[data-podj]').forEach(function(b){ b.addEventListener('click', function(){ podjetjeForma(b.getAttribute('data-podj')); }); });
    box.querySelectorAll('[data-aktiven]').forEach(function(b){
      b.addEventListener('click', function(){
        var vklop=b.getAttribute('data-vrednost')==='1';
        if(!vklop && !confirm('Izklopljen salon ne sprejema spletnih naročil. Izklopim?')) return;
        b.disabled=true;
        sb.rpc('app_salon_aktiven',{s:b.getAttribute('data-aktiven'), p_aktiven:vklop}).then(function(){ nalozi(); });
      });
    });
    box.querySelectorAll('[data-clan]').forEach(function(b){
      b.addEventListener('click', function(){
        var id=b.getAttribute('data-clan');
        var em=box.querySelector('[data-clan-email="'+id+'"]').value.trim();
        var vl=box.querySelector('[data-clan-vloga="'+id+'"]').value;
        b.disabled=true;
        sb.rpc('app_dodaj_clana',{s:id, p_email:em, p_vloga:vl}).then(function(r){
          b.disabled=false;
          if(r.error){ sporoci('sp-'+id,'Napaka: '+r.error.message,false); return; }
          if(!r.data||!r.data.ok){ sporoci('sp-'+id,(r.data&&r.data.napaka)||'Ni uspelo.',false); return; }
          nalozi();
          setTimeout(function(){ sporoci('sp-'+id, r.data.rezultat==='povezan'
            ? 'Dodano – uporabnik se lahko takoj prijavi.'
            : 'Povabilo shranjeno. Ustvarite račun za '+em+' v Supabase (Authentication → Users → Add user); ob tem bo samodejno dodan.', true); }, 400);
        });
      });
    });
  });
}

/* člani salona z gumboma »Ustvari račun« (povabila) in »Novo geslo« (edge funkcija ustvari-racun) */
var VLOGE_SA={lastnik:'lastnik',admin:'admin',recepcija:'recepcija',zaposleni:'zaposleni'};
function predlogGesla(){
  var z='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', a=new Uint32Array(10), g='';
  try{ crypto.getRandomValues(a); }catch(e){ for(var i=0;i<10;i++) a[i]=Math.floor(Math.random()*1e9); }
  for(var j=0;j<10;j++) g+=z.charAt(a[j]%z.length);
  return g;
}
function naloziClane(sid){
  var box=document.querySelector('[data-clani="'+sid+'"]'); if(!box) return;
  sb.rpc('app_clani_salona',{s:sid}).then(function(r){
    if(r.error){ box.innerHTML='<div class="clan-vr sporocilo err">Napaka: '+esc(r.error.message)+'</div>'; return; }
    var cl=r.data||[];
    if(!cl.length){ box.innerHTML='<div class="clan-vr namig">Salon še nima članov – dodajte lastnika spodaj.</div>'; return; }
    box.innerHTML=cl.map(function(c,i){
      return '<div class="clan-vr"><span><b style="font-size:.86rem">'+esc(c.email||'')+'</b> · '+esc(VLOGE_SA[c.vloga]||c.vloga)
        +(c.zaposleni?' ('+esc(c.zaposleni)+')':'')+(c.povabilo?' · <span class="caka">čaka na račun</span>':'')+'</span>'
        +'<span><button type="button" class="gumb svetel" data-rac="'+i+'">'+(c.povabilo?'Ustvari račun':'Novo geslo')+'</button></span></div>';
    }).join('');
    box.querySelectorAll('[data-rac]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var c=cl[+btn.getAttribute('data-rac')], vr=btn.closest('.clan-vr');
        var st=vr.nextElementSibling; if(st&&st.classList.contains('rac-forma')){ st.remove(); return; }
        var f=document.createElement('div'); f.className='rac-forma';
        f.innerHTML=(c.povabilo?'Nov račun za ':'Novo geslo za ')+'<b>'+esc(c.email)+'</b> – začasno geslo: '
          +'<input type="text" class="rf-g" value="'+predlogGesla()+'" autocomplete="off" spellcheck="false"> '
          +'<button type="button" class="gumb svetel" data-rf="nov">Drugo</button> '
          +'<button type="button" class="gumb" data-rf="ok">'+(c.povabilo?'Ustvari račun':'Nastavi geslo')+'</button>'
          +'<div class="namig" style="margin-top:4px">Geslo si zapišite in ga sporočite osebno; po prijavi ga zamenja z gumbom »Geslo«.</div>'
          +'<div class="sporocilo rf-sp"></div>';
        vr.parentNode.insertBefore(f,vr.nextSibling);
        f.querySelector('[data-rf="nov"]').onclick=function(){ f.querySelector('.rf-g').value=predlogGesla(); };
        f.querySelector('[data-rf="ok"]').onclick=function(){
          var g=f.querySelector('.rf-g').value, ok=this, sp=f.querySelector('.rf-sp');
          if(g.length<8){ sp.textContent='Geslo naj ima vsaj 8 znakov.'; sp.className='sporocilo rf-sp err'; return; }
          ok.disabled=true; sp.textContent='Pošiljam …'; sp.className='sporocilo rf-sp ok';
          sb.functions.invoke('ustvari-racun',{body:{salon_id:sid,email:c.email,geslo:g,akcija:c.povabilo?'ustvari':'geslo'}}).then(function(x){
            var obdelaj=function(d){
              ok.disabled=false;
              if(d&&d.ok){ sp.textContent=c.povabilo?'Račun je ustvarjen in povezan s salonom.':'Geslo je nastavljeno.'; sp.className='sporocilo rf-sp ok';
                f.querySelector('.rf-g').readOnly=true; ok.remove(); if(c.povabilo) setTimeout(function(){ naloziClane(sid); },2500); return; }
              sp.textContent=(d&&d.napaka)||'Ni uspelo.'; sp.className='sporocilo rf-sp err';
            };
            if(x.error&&x.error.context&&typeof x.error.context.json==='function') x.error.context.json().then(obdelaj,function(){ obdelaj(null); });
            else obdelaj(x.data);
          });
        };
      });
    });
  });
}

$('gUstvari').addEventListener('click', function(){
  var b=this, ime=$('nIme').value.trim(), slug=$('nSlug').value.trim(), email=$('nEmail').value.trim();
  $('rezUstvari').innerHTML='';
  if(!ime){ sporoci('spUstvari','Vpišite ime salona.',false); return; }
  if(!slug){ sporoci('spUstvari','Vpišite naslov strani.',false); return; }
  if($('nTip').value==='-'){ sporoci('spUstvari','Izberite dejavnost (od njega so odvisne privzete storitve in pečat dejavnosti).',false); return; }
  if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ sporoci('spUstvari','E-pošta lastnika ni veljavna.',false); return; }
  b.disabled=true; sporoci('spUstvari','Ustvarjam …',true);
  sb.rpc('app_ustvari_salon',{p_ime:ime, p_slug:slug, p_tip:$('nTip').value, p_email_lastnika:email||null, p_telefon:$('nTel').value.trim()||null}).then(function(r){
    b.disabled=false;
    if(r.error){ sporoci('spUstvari','Napaka: '+r.error.message,false); return; }
    if(!r.data||!r.data.ok){ sporoci('spUstvari',(r.data&&r.data.napaka)||'Ni uspelo.',false); return; }
    var d=r.data, url=location.origin+'/'+d.slug;
    sporoci('spUstvari','Salon je ustvarjen.',true);
    var pod={naziv:$('nPodNaziv').value, naslov:$('nPodNaslov').value, davcna:$('nPodDavcna').value, email:$('nPodEmail').value};
    if(pod.naziv||pod.naslov||pod.davcna||pod.email){
      sb.rpc('app_superadmin_podjetje',{s:d.id, p:pod}).then(function(x){
        if(x.error||!x.data||!x.data.ok) sporoci('spUstvari','Salon je ustvarjen, podatki podjetja niso shranjeni: '+((x.error&&x.error.message)||(x.data&&x.data.napaka)||'')+' Popravite jih s »Podjetje« v seznamu.',false);
        nalozi();
      });
    }
    var h='<div class="rezultat'+(d.lastnik==='povabljen'?' opoz':'')+'"><b>'+esc(ime)+'</b> je pripravljen ('+d.storitev+' storitev).<br>'
      +'Stran za naročanje: <a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(url)+'</a><br>'
      +'Administracija: <a href="'+esc(location.origin)+'/admin" target="_blank" rel="noopener">'+esc(location.origin)+'/admin</a><br>';
    if(d.lastnik==='povezan') h+='Lastnik <b>'+esc(email)+'</b> že ima račun in se lahko takoj prijavi.';
    else if(d.lastnik==='povabljen') h+='<b>Še en korak:</b> lastnik '+esc(email)+' še nima računa. V seznamu »Vsi saloni« pri tem salonu kliknite <b>»Ustvari račun«</b> in določite začasno geslo. Geslo sporočite lastniku osebno.';
    else h+='Salon še nima lastnika. Dodajte ga spodaj v seznamu (»Dodaj člana«).';
    $('rezUstvari').innerHTML=h+'</div>';
    $('nIme').value=''; $('nSlug').value=''; $('nEmail').value=''; $('nTel').value='';
    ['nPodNaziv','nPodNaslov','nPodDavcna','nPodEmail'].forEach(function(id){ $(id).value=''; }); $('nTip').value='-'; slugRocno=false; namigSlug();
    nalozi();
  });
});

/* ================= zavihki ================= */
document.querySelectorAll('[data-zavihek]').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('[data-zavihek]').forEach(function(x){
      x.classList.toggle('akt', x===b);
      $(x.getAttribute('data-zavihek')).classList.toggle('hidden', x!==b);
    });
    if(b.getAttribute('data-zavihek')==='zKalk') kNalozi();
  });
});

/* ================= kalkulator naročnin ================= */
var EUR = new Intl.NumberFormat('sl-SI',{style:'currency',currency:'EUR',maximumFractionDigits:2});
var EUR0 = new Intl.NumberFormat('sl-SI',{style:'currency',currency:'EUR',maximumFractionDigits:0});
var STATUSI = {poskus:'Poskus (brezplačno)', ustanovna:'Ustanovna cena', placuje:'Plačuje', neaktiven:'Neaktiven'};
var PAKETI = ['solo','salon','pro'];
var K_PRIVZETO = {
  paketi:{solo:{ime:'Solo',cena:13.9,sms:50,zap:1,dod:0,dodSms:0}, salon:{ime:'Salon',cena:26.9,sms:150,zap:2,dod:8.9,dodSms:75}, pro:{ime:'Pro',cena:46.9,sms:400,zap:0,dod:0,dodSms:0}}, tgChat:'',
  smsCena:0.0363, smsDoplacilo:0.06, provizija:0.5, davek:4,
  prispevkiTip:'93', prispevki:93, tech:45, racunovodstvo:60, banka:10,
  cilj:1000, ddvPrag:60000, useLive:false
};
var K_POLJA = ['smsCena','smsDoplacilo','provizija','davek','prispevki','tech','racunovodstvo','banka','cilj','ddvPrag'];
var KS = JSON.parse(JSON.stringify(K_PRIVZETO)), kNar = [], kPoraba = {}, kSaloni = {}, kZap = {}, kNalozeno = false;
function kKoledarji(salonId){ var z = salonId ? kZap[salonId] : null; return Math.max(1, z ? z.aktivni : 0); }
/* paket + dodatni koledarji: {p, meja, dodatni, presega, kvota, osnova} */
function kPaketObseg(n, koledarji){
  var p = KS.paketi[n.paket] || KS.paketi.salon, meja = kMejaZap(n.paket), dod = +p.dod || 0;
  var cez = (meja > 0 && koledarji > meja) ? koledarji - meja : 0;
  var dodatni = dod > 0 ? cez : 0;
  var osnova = (n.posebna_cena === null || n.posebna_cena === undefined || n.posebna_cena === '') ? p.cena : kst(n.posebna_cena, p.cena);
  return {p:p, meja:meja, dodatni:dodatni, presega: dod > 0 ? 0 : cez, kvota: (+p.sms||0) + dodatni*(+p.dodSms||0), osnova:osnova, dodZnesek: dodatni*dod};
}
function kMejaZap(paket){ var p = KS.paketi[paket] || KS.paketi.salon; var m = p.zap; if(m === undefined || m === null || m === '') m = (K_PRIVZETO.paketi[paket]||{}).zap; return +m || 0; }

function kst(v, d){ var x = parseFloat(String(v).replace(',','.')); return isFinite(x) ? x : d; }
function kOpcije(sel, obj, val){
  sel.innerHTML = '';
  Object.keys(obj).forEach(function(k){ var o=document.createElement('option'); o.value=k; o.textContent=obj[k]; sel.appendChild(o); });
  sel.value = val;
}
function kPaketiOpc(){ var o={}; PAKETI.forEach(function(k){ o[k]=KS.paketi[k].ime+' · '+EUR.format(KS.paketi[k].cena); }); return o; }

function kVObrazec(){
  PAKETI.forEach(function(k){
    $('p_'+k+'_ime').value = KS.paketi[k].ime; $('p_'+k+'_cena').value = KS.paketi[k].cena; $('p_'+k+'_sms').value = KS.paketi[k].sms;
    $('p_'+k+'_zap').value = kMejaZap(k); $('p_'+k+'_dod').value = +KS.paketi[k].dod || 0; $('p_'+k+'_dodSms').value = +KS.paketi[k].dodSms || 0;
  });
  K_POLJA.forEach(function(f){ $('k_'+f).value = KS[f]; });
  $('k_tgChat').value = KS.tgChat || '';
  $('k_prispevkiTip').value = KS.prispevkiTip; $('k_useLive').checked = !!KS.useLive;
  kOpcije($('aPaket'), kPaketiOpc(), 'salon'); kOpcije($('aStatus'), STATUSI, 'poskus');
}
function kIzObrazca(){
  PAKETI.forEach(function(k){
    KS.paketi[k].ime = $('p_'+k+'_ime').value || KS.paketi[k].ime;
    KS.paketi[k].cena = kst($('p_'+k+'_cena').value, 0); KS.paketi[k].sms = kst($('p_'+k+'_sms').value, 0);
    KS.paketi[k].zap = Math.max(0, Math.round(kst($('p_'+k+'_zap').value, 0)));
    KS.paketi[k].dod = Math.max(0, kst($('p_'+k+'_dod').value, 0)); KS.paketi[k].dodSms = Math.max(0, Math.round(kst($('p_'+k+'_dodSms').value, 0)));
  });
  K_POLJA.forEach(function(f){ KS[f] = kst($('k_'+f).value, 0); });
  KS.tgChat = $('k_tgChat').value.trim();
  KS.useLive = $('k_useLive').checked;
}

var kTimer = null;
function kShraniNast(){
  clearTimeout(kTimer);
  kTimer = setTimeout(function(){
    sb.from('app_platforma').update({nastavitve: KS, updated_at: new Date().toISOString()}).eq('id',1).then(function(r){
      sporoci('spNast', r.error ? 'Ni shranjeno: '+r.error.message : 'Shranjeno.', !r.error);
    });
  }, 700);
}
$('kNast').addEventListener('input', function(e){
  if(e.target.id === 'k_prispevkiTip') return;
  if(e.target.id === 'k_prispevki'){ KS.prispevkiTip = 'custom'; $('k_prispevkiTip').value = 'custom'; }
  kIzObrazca(); kIzris(); kShraniNast();
});
$('k_prispevkiTip').addEventListener('change', function(){
  KS.prispevkiTip = this.value;
  if(this.value !== 'custom'){ KS.prispevki = +this.value; $('k_prispevki').value = KS.prispevki; }
  kIzris(); kShraniNast();
});
$('k_useLive').addEventListener('change', function(){ kIzObrazca(); kIzris(); kShraniNast(); });

function kNalozi(){
  Promise.all([
    sb.from('app_platforma').select('nastavitve').eq('id',1).maybeSingle(),
    sb.from('app_narocnine').select('*').eq('arhiviran', false).order('created_at'),
    sb.rpc('app_superadmin_poraba'),
    sb.rpc('app_superadmin_saloni'),
    sb.rpc('app_superadmin_zaposleni')
  ]).then(function(r){
    var err = r.map(function(x){ return x.error; }).filter(Boolean)[0];
    if(err){ $('kVrstice').innerHTML = '<tr><td colspan="9" class="sporocilo err">Napaka: '+esc(err.message)+'</td></tr>'; return; }
    var n = (r[0].data && r[0].data.nastavitve) || {};
    KS = Object.assign(JSON.parse(JSON.stringify(K_PRIVZETO)), JSON.parse(JSON.stringify(n)));
    KS.paketi = Object.assign(JSON.parse(JSON.stringify(K_PRIVZETO.paketi)), KS.paketi || {});
    kNar = r[1].data || [];
    kPoraba = {}; (r[2].data || []).forEach(function(p){ kPoraba[p.salon_id] = p; });
    kSaloni = {}; (r[3].data || []).forEach(function(s){ kSaloni[s.id] = s; });
    kZap = {}; (r[4].data || []).forEach(function(z){ kZap[z.salon_id] = z; });
    kNalozeno = true;
    kVObrazec(); kIzris();
    if(!$('obrMesec').value){ $('obrMesec').value = obrPrejsnjiMesec(); obrNalozi(); }
  });
}

function kIzracun(n){
  var p = KS.paketi[n.paket] || KS.paketi.salon;
  var por = n.salon_id ? kPoraba[n.salon_id] : null;
  var sms = (KS.useLive && por) ? por.sms_30d : kst(n.sms_ocena, 0);
  if(n.status === 'neaktiven') return {sms:0, pri:0, str:0, ost:0, placljiv:false, por:por};
  var pri = 0;
  if(n.status === 'placuje' || n.status === 'ustanovna'){
    var o = kPaketObseg(n, n.salon_id ? kKoledarji(n.salon_id) : 1);
    pri = o.osnova + o.dodZnesek + Math.max(0, sms - o.kvota) * KS.smsDoplacilo;
  }
  var str = sms*KS.smsCena + (pri > 0 ? KS.provizija : 0) + pri*KS.davek/100;
  return {sms:sms, pri:pri, str:str, ost:pri-str, placljiv:pri>0, por:por};
}

function kIzris(){
  if(!kNalozeno) return;
  var tb = $('kVrstice'); tb.innerHTML = '';
  var pri=0, str=0, ost=0, plac=0, posk=0, ostPlac=0;
  if(!kNar.length) tb.innerHTML = '<tr><td colspan="9" class="namig">Še ni naročnin.</td></tr>';
  kNar.forEach(function(n){
    var c = kIzracun(n);
    pri += c.pri; str += c.str; ost += c.ost;
    if(c.placljiv){ plac++; ostPlac += c.ost; }
    if(n.status === 'poskus') posk++;
    tb.appendChild(kVrstica(n, c));
  });
  $('fPri').textContent = EUR.format(pri); $('fStr').textContent = EUR.format(str); $('fOst').textContent = EUR.format(ost);
  var fx = KS.prispevki + KS.tech + KS.racunovodstvo + KS.banka, dob = ost - fx;
  $('kMrr').textContent = EUR0.format(pri); $('kMrrH').textContent = 'letno ' + EUR0.format(pri*12);
  $('kStr').textContent = EUR0.format(str + fx); $('kStrH').textContent = 'fiksni ' + EUR0.format(fx) + ' + spremenljivi ' + EUR0.format(str);
  $('kDob').textContent = EUR0.format(dob); $('kDob').className = 'v num ' + (dob >= 0 ? 'poz' : 'neg');
  $('kDobH').textContent = dob >= 0 ? 'po vseh stroških' : 'manjka do pokritja stroškov';
  $('kSt').textContent = plac; $('kStH').textContent = posk ? posk + ' na poskusu' : 'brez poskusnih';

  var avg = plac ? ostPlac / plac : 0, vir = 'povprečje plačljivih salonov';
  if(avg <= 0){
    var p = KS.paketi.salon, s = 120, pr = p.cena + Math.max(0, s - (+p.sms||0))*KS.smsDoplacilo;
    avg = pr - (s*KS.smsCena + KS.provizija + pr*KS.davek/100); vir = 'paket ' + p.ime + ', 120 SMS';
  }
  $('nMarza').textContent = EUR.format(avg); $('nMarza').title = vir;
  $('nPokritje').textContent = avg > 0 ? Math.ceil(fx/avg) : '∞';
  $('nCilj').textContent = avg > 0 ? Math.ceil((fx + KS.cilj)/avg) : '∞';
  $('nCiljL').textContent = 'salonov za ' + EUR0.format(KS.cilj) + ' zate';
  var leto = pri*12, pct = KS.ddvPrag > 0 ? Math.min(100, leto/KS.ddvPrag*100) : 0;
  $('ddvTxt').textContent = EUR0.format(leto) + ' / ' + EUR0.format(KS.ddvPrag);
  $('ddvTrak').style.width = pct.toFixed(1) + '%'; $('ddvTrak').className = pct >= 80 ? 'opoz' : '';
  clearTimeout(obrTimer); if($('obrMesec').value) obrTimer = setTimeout(obrNalozi, 800);
}

function kVrstica(n, c){
  var tr = document.createElement('tr'), s = n.salon_id ? kSaloni[n.salon_id] : null;
  var td = document.createElement('td');
  var b = document.createElement('b'); b.textContent = (s && s.ime) || n.ime || '(brez imena)'; td.appendChild(b);
  var sm = document.createElement('small');
  var deli = [TIPI[(s && s.tip) || n.tip] || 'drugo'];
  if(s) deli.push('/' + s.slug + (s.aktiven ? '' : ' · izklopljen')); else deli.push('ročno dodan');
  if(c.por) deli.push(c.por.termini_30d + ' terminov v 30 dneh');
  var zz = n.salon_id ? kZap[n.salon_id] : null, nz = zz ? zz.aktivni : 0;
  if(n.salon_id) deli.push(nz + (nz === 1 ? ' zaposleni' : (nz === 2 ? ' zaposlena' : (nz === 3 || nz === 4 ? ' zaposleni' : ' zaposlenih'))));
  sm.textContent = deli.join(' · '); td.appendChild(sm);
  if(n.salon_id){
    var ob = kPaketObseg(n, kKoledarji(n.salon_id));
    if(ob.presega){
      var op = document.createElement('small'); op.className = 'opoz-paket';
      op.textContent = '⚠ presega paket ' + ob.p.ime + ' (vključeni koledarji: ' + ob.meja + ') – predlagaj višji paket';
      td.appendChild(op);
    } else if(ob.dodatni){
      var od = document.createElement('small');
      od.textContent = 'dodatni koledarji: ' + ob.dodatni + ' × ' + EUR.format(+ob.p.dod) + ' (+' + ob.dodatni*(+ob.p.dodSms||0) + ' SMS)';
      td.appendChild(od);
    }
  }
  tr.appendChild(td);

  td = document.createElement('td'); var st = document.createElement('select'); st.setAttribute('aria-label','Status');
  kOpcije(st, STATUSI, n.status); st.onchange = function(){ kPopravi(n, {status: st.value}); }; td.appendChild(st); tr.appendChild(td);

  td = document.createElement('td'); var pk = document.createElement('select'); pk.setAttribute('aria-label','Paket');
  kOpcije(pk, kPaketiOpc(), n.paket); pk.onchange = function(){ kPopravi(n, {paket: pk.value}); }; td.appendChild(pk); tr.appendChild(td);

  td = document.createElement('td'); td.className = 'd'; var pc = document.createElement('input'); pc.type = 'number'; pc.step = '0.5';
  pc.placeholder = String((KS.paketi[n.paket] || KS.paketi.salon).cena); pc.setAttribute('aria-label','Posebna cena');
  pc.value = n.posebna_cena === null || n.posebna_cena === undefined ? '' : n.posebna_cena;
  pc.onchange = function(){ kPopravi(n, {posebna_cena: pc.value === '' ? null : kst(pc.value, null)}); };
  td.appendChild(pc); tr.appendChild(td);

  td = document.createElement('td'); td.className = 'd'; var si = document.createElement('input'); si.type = 'number'; si.step = '10';
  si.value = n.sms_ocena; si.setAttribute('aria-label','SMS na mesec (ocena)');
  si.onchange = function(){ kPopravi(n, {sms_ocena: Math.round(kst(si.value, 0))}); };
  td.appendChild(si);
  if(c.por){ var d = document.createElement('small'); d.textContent = '30 dni: ' + c.por.sms_30d; td.appendChild(d); }
  tr.appendChild(td);

  [[c.pri,''],[c.str,''],[c.ost, c.ost>0?'m-poz':(c.ost<0?'m-neg':'')]].forEach(function(x){
    td = document.createElement('td'); td.className = 'd num ' + x[1]; td.textContent = EUR.format(x[0]); tr.appendChild(td);
  });

  td = document.createElement('td');
  if(!n.salon_id){
    var g = document.createElement('button'); g.type = 'button'; g.className = 'gumb svetel mali'; g.textContent = 'Odstrani';
    g.onclick = function(){
      if(!g.dataset.potrdi){ g.dataset.potrdi = '1'; g.textContent = 'Potrdi?'; setTimeout(function(){ if(g.isConnected){ delete g.dataset.potrdi; g.textContent = 'Odstrani'; } }, 3000); return; }
      kPopravi(n, {arhiviran: true});
    };
    td.appendChild(g);
  }
  tr.appendChild(td);
  return tr;
}

/* ---- mesečni obračun ---- */
var obrPodatki = [], obrTimer = null;
function obrPrejsnjiMesec(){ var d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function obrNalozi(){
  var m = $('obrMesec').value; if(!m) return;
  $('obrVrstice').innerHTML = '<tr><td colspan="8" class="namig">Nalagam …</td></tr>';
  sb.rpc('app_superadmin_obracun', {p_mesec: m + '-01'}).then(function(r){
    if(r.error){ $('obrVrstice').innerHTML = '<tr><td colspan="8" class="sporocilo err">Napaka: ' + esc(r.error.message) + '</td></tr>'; return; }
    var por = {}; (r.data || []).forEach(function(x){ por[x.salon_id] = x; });
    var tb = $('obrVrstice'), skupaj = 0; tb.innerHTML = ''; obrPodatki = [];
    kNar.filter(function(n){ return n.salon_id; }).forEach(function(n){
      var x = por[n.salon_id] || {sms:0, sms_neuspesni:0, termini:0, koledarji:1};
      var s = kSaloni[n.salon_id] || {}, ob = kPaketObseg(n, x.koledarji);
      var placljiv = n.status === 'placuje' || n.status === 'ustanovna';
      var cez = Math.max(0, x.sms - ob.kvota), smsZn = cez * KS.smsDoplacilo;
      var znesek = placljiv ? ob.osnova + ob.dodZnesek + smsZn : 0;
      skupaj += znesek;
      obrPodatki.push({salon: s.ime || n.ime, slug: s.slug || '', status: STATUSI[n.status] || n.status, paket: ob.p.ime,
        narocnina: placljiv ? ob.osnova : 0, koledarji: x.koledarji, dodatni: ob.dodatni, dodZnesek: placljiv ? ob.dodZnesek : 0,
        sms: x.sms, kvota: ob.kvota, presezek: cez, smsZnesek: placljiv ? smsZn : 0, skupaj: znesek});
      var tr = document.createElement('tr');
      var celice = [
        '<b>' + esc(s.ime || n.ime) + '</b><small>' + esc(STATUSI[n.status] || n.status) + ' · ' + x.termini + ' terminov' + (x.sms_neuspesni ? ' · ' + x.sms_neuspesni + ' neuspešnih SMS' : '') + (ob.presega ? '</small><small class="opoz-paket">⚠ presega paket' : '') + '</small>',
        esc(ob.p.ime),
        '<span class="num">' + (placljiv ? EUR.format(ob.osnova) : '–') + '</span>',
        '<span class="num">' + x.koledarji + (ob.meja > 0 ? ' / ' + ob.meja : '') + '</span>',
        '<span class="num">' + (ob.dodatni ? ob.dodatni + ' × ' + EUR.format(+ob.p.dod) : '–') + '</span>',
        '<span class="num">' + x.sms + ' / ' + ob.kvota + '</span>',
        '<span class="num">' + (cez ? cez + ' × ' + EUR.format(KS.smsDoplacilo) + ' = ' + EUR.format(smsZn) : '–') + '</span>',
        '<b class="num">' + (placljiv ? EUR.format(znesek) : 'ni računa') + '</b>'];
      celice.forEach(function(h, i){ var td = document.createElement('td'); if(i > 1) td.className = 'd'; td.innerHTML = h; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    if(!obrPodatki.length) tb.innerHTML = '<tr><td colspan="8" class="namig">Ni salonov.</td></tr>';
    $('obrSkupaj').textContent = EUR.format(skupaj);
  });
}
$('obrMesec').addEventListener('change', obrNalozi);
$('gObrCsv').addEventListener('click', function(){
  if(!obrPodatki.length){ sporoci('spObr', 'Ni podatkov za izvoz.', false); return; }
  var st = function(v){ return typeof v === 'number' ? String(Math.round(v*100)/100).replace('.', ',') : '"' + String(v).replace(/"/g,'""') + '"'; };
  var glava = ['Salon','Pot','Status','Paket','Naročnina €','Koledarji','Dodatni koledarji','Dodatni koledarji €','SMS poslani','SMS kvota','SMS presežek','SMS presežek €','Skupaj €'];
  var vr = obrPodatki.map(function(o){ return [o.salon,o.slug,o.status,o.paket,o.narocnina,o.koledarji,o.dodatni,o.dodZnesek,o.sms,o.kvota,o.presezek,o.smsZnesek,o.skupaj].map(st).join(';'); });
  var blob = new Blob(['﻿' + glava.map(st).join(';') + '\n' + vr.join('\n')], {type:'text/csv;charset=utf-8'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'obracun-' + $('obrMesec').value + '.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
});

function kPopravi(n, pod){
  pod.updated_at = new Date().toISOString();
  Object.assign(n, pod);
  if(n.arhiviran) kNar = kNar.filter(function(x){ return x !== n; });
  kIzris();
  sb.from('app_narocnine').update(pod).eq('id', n.id).then(function(r){
    sporoci('spNar', r.error ? 'Ni shranjeno: ' + r.error.message : 'Shranjeno.', !r.error);
  });
}

$('gDodajN').addEventListener('click', function(){
  var ime = $('aIme').value.trim();
  if(!ime){ sporoci('spNar','Vpiši ime salona.',false); return; }
  var b = this; b.disabled = true;
  sb.from('app_narocnine').insert({ime:ime, tip:$('aTip').value || null, paket:$('aPaket').value, status:$('aStatus').value,
    sms_ocena: Math.round(kst($('aSms').value, 0))}).select().single().then(function(r){
    b.disabled = false;
    if(r.error){ sporoci('spNar','Napaka: ' + r.error.message, false); return; }
    kNar.push(r.data); $('aIme').value = ''; kIzris(); sporoci('spNar','Dodano.',true);
  });
});

$('gPrijava').addEventListener('click', prijava);
$('geslo').addEventListener('keydown', function(e){ if(e.key==='Enter') prijava(); });
function prijava(){
  var em=$('email').value.trim(), g=$('geslo').value;
  if(!em||!g){ sporoci('spPrijava','Vpišite e-pošto in geslo.',false); return; }
  $('gPrijava').disabled=true;
  sb.auth.signInWithPassword({email:em,password:g}).then(function(r){
    $('gPrijava').disabled=false;
    if(r.error){ sporoci('spPrijava','Napačna e-pošta ali geslo.',false); return; }
    zacni(r.data.session);
  });
}
function odjava(){ sb.auth.signOut().then(function(){ pokazi('pogledPrijava'); }); }
$('gOdjava').addEventListener('click', odjava);
$('gOdjava2').addEventListener('click', odjava);

sb.auth.getSession().then(function(r){ if(r.data&&r.data.session) zacni(r.data.session); else pokazi('pogledPrijava'); });
})();
