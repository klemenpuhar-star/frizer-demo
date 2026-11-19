var SB_URL=APP.supabaseUrl;
var SB_KEY=APP.supabaseKey;
var sb=supabase.createClient(SB_URL,SB_KEY);

/* ══ VEČ SALONOV (faza 4) ═══════════════════════════════════════════════
   Po prijavi se prebere, katerih salonov je uporabnik član. Vse poizvedbe na tabele
   s podatki salona samodejno dobijo filter salon_id (branje, sprememba, brisanje),
   novi zapisi pa salon_id. Pravila dostopa (RLS) v bazi to še dodatno varujejo. */
var SALON_ID=null, SALON_VLOGA=null, MOJI_SALONI=[];
var SALONSKE_TABELE={services:1,bookings:1,blocks:1,delovni_cas:1,stranke:1,sms_dnevnik:1,artikli:1,obracuni:1,
                     app_kategorije:1};
var _sbFrom=sb.from.bind(sb);
sb.from=function(t){
  var qb=_sbFrom(t);
  if(!SALONSKE_TABELE[t]) return qb;
  var sid=SALON_ID;
  function dodaj(v){
    if(Array.isArray(v)) return v.map(function(r){ var o=Object.assign({},r); o.salon_id=sid; return o; });
    var o=Object.assign({},v); o.salon_id=sid; return o;
  }
  return {
    select:function(){ return qb.select.apply(qb,arguments).eq('salon_id',sid); },
    insert:function(v,o){ return qb.insert(dodaj(v),o); },
    upsert:function(v,o){ return qb.upsert(dodaj(v),o); },
    update:function(v,o){ return qb.update(v,o).eq('salon_id',sid); },
    delete:function(o){ return qb.delete(o).eq('salon_id',sid); }
  };
};
function lsGet(k){ try{ return localStorage.getItem(k)||''; }catch(e){ return ''; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

function izberiSalon(s){
  return _sbFrom('app_salon_members').select('vloga, app_salons(id,slug,ime,aktiven)').eq('user_id',s.user.id).then(function(r){
    MOJI_SALONI=(r.data||[]).filter(function(x){return x.app_salons;}).map(function(x){
      return {vloga:x.vloga, id:x.app_salons.id, slug:x.app_salons.slug, ime:x.app_salons.ime};
    }).sort(function(a,b){return a.ime.localeCompare(b.ime,'sl');});
    povezavaSuperadmin();
    if(!MOJI_SALONI.length){
      calScroll.innerHTML='<div class="empty" style="padding:3rem 1rem;line-height:1.6">Vaš račun še ni povezan z nobenim salonom.<br>Za dostop se obrnite na skrbnika platforme.</div>';
      return false;
    }
    var zelen=new URLSearchParams(location.search).get('s')||lsGet('admin_salon');
    var izbran=MOJI_SALONI.filter(function(x){return x.slug===zelen;})[0]||MOJI_SALONI[0];
    SALON_ID=izbran.id; SALON_VLOGA=izbran.vloga; lsSet('admin_salon',izbran.slug);
    prikaziNaziv(s.user.email);
    izrisiIzbiroSalona();
    return (APP.slug===izbran.slug?Promise.resolve(true):APP.naloziSalon(izbran.slug)).then(function(){
      APP.vstavi(); document.title=(APP.kratko||APP.ime)+' · Admin'; return true;
    });
  });
}
/* naziv podjetja salona nad e-pošto v glavi (vpiše ga skrbnik platforme v superadminu) */
function prikaziNaziv(email){
  var who=document.getElementById('whoLabel'); if(!who) return;
  sb.rpc('app_salon_naziv',{s:SALON_ID}).then(function(r){
    var n=(r&&!r.error&&r.data)?String(r.data):'';
    if(!n){ who.classList.remove('z-nazivom'); who.textContent=email; return; }
    who.classList.add('z-nazivom'); who.title=n+' · '+email;
    who.innerHTML='<span class="who-naziv">'+esc(n)+'</span><span class="who-mail">'+esc(email)+'</span>';
  });
}
/* skrbnik platforme dobi v glavi povezavo do strani s saloni */
function povezavaSuperadmin(){
  var stara=document.getElementById('povSuperadmin'); if(stara) stara.remove();   /* nikoli ne ostane od prejšnje prijave */
  sb.rpc('app_je_superadmin').then(function(r){
    if(r.error||r.data!==true||document.getElementById('povSuperadmin')) return;
    var who=document.getElementById('whoLabel'); if(!who) return;
    var a=document.createElement('a'); a.id='povSuperadmin'; a.href='/superadmin'; a.textContent='Saloni';
    a.style.cssText='font-size:.82rem;color:var(--navy);text-decoration:underline;text-underline-offset:3px';
    who.parentNode.insertBefore(a,who);
  });
}
function izrisiIzbiroSalona(){
  var who=document.getElementById('whoLabel'); if(!who) return;
  var st=document.getElementById('salonIzbira'); if(st) st.remove();
  if(MOJI_SALONI.length<2) return;
  var sel=document.createElement('select'); sel.id='salonIzbira'; sel.title='Izberite salon';
  sel.style.cssText='font:inherit;font-size:.82rem;padding:.35rem .6rem;border-radius:999px;border:1.5px solid rgba(28,26,25,.18);background:#fff;color:var(--navy);max-width:14rem';
  MOJI_SALONI.forEach(function(x){ var o=document.createElement('option'); o.value=x.slug; o.textContent=x.ime; if(x.id===SALON_ID) o.selected=true; sel.appendChild(o); });
  sel.addEventListener('change',function(){ lsSet('admin_salon',sel.value); location.href='/admin?s='+encodeURIComponent(sel.value); });
  who.parentNode.insertBefore(sel,who);
}

/* ══ NASTAVITVE SALONA ══════════════════════════════════════════════════ */
var NS={};
function nsVal(id){ var el=document.getElementById(id); return el?String(el.value||'').trim():''; }
function nsChk(id){ var el=document.getElementById(id); return !!(el&&el.checked); }
function nsMsg(id,t,ok){ var m=document.getElementById(id); if(!m)return; m.textContent=t; m.className='d-edit-msg '+(ok?'ok':'err'); }
function nsInp(id,label,val,extra){ return '<label>'+label+'<input type="text" id="'+id+'" value="'+esc(val==null?'':val)+'" '+(extra||'')+'></label>'; }
function nsBarva(id,label,val){ return '<label>'+label+'<span style="display:flex;gap:.4rem;align-items:center"><input type="color" id="'+id+'" value="'+esc(val||'#000000')+'" style="width:3rem;height:2.2rem;padding:0;border-radius:8px"><code id="'+id+'Hex" style="font-size:.78rem">'+esc(val||'')+'</code></span></label>'; }

function loadNastavitve(){
  calScroll.classList.add('hidden'); nujniList.classList.add('hidden');
  document.getElementById('strankeView').classList.add('hidden'); skrijBlagajno();
  var box=document.getElementById('nastavitveView'); box.classList.remove('hidden');
  resetMiniHeight();
  document.getElementById('rangeLabel').textContent='Nastavitve salona';
  box.innerHTML='<div class="empty">Nalagam …</div>';
  if(jeZap()){ document.getElementById('rangeLabel').textContent='Moj urnik'; izrisiMojUrnik(box); return; }
  Promise.all([
    _sbFrom('app_salons').select('id,slug,ime,kratko,tip,barve,logo_url,kontakt,pravila,sms_predpona').eq('id',SALON_ID).single(),
    sb.rpc('app_salon_obvestila',{s:SALON_ID}),
    sb.from('delovni_cas').select('dan,teden,nacin,od,do_'),
    sb.from('services').select('*').order('sort_order',{ascending:true}),
    sb.from('app_kategorije').select('*').order('sort_order',{ascending:true})
  ]).then(function(r){
    if(r[0].error){ box.innerHTML='<div class="empty">Napaka: '+esc(r[0].error.message)+'</div>'; return; }
    NS={salon:r[0].data, obv:(r[1].data||{}), dc:r[2].data||[], svc:r[3].data||[], kat:r[4].data||[]};
    izrisiNastavitve(box);
  });
}

function izrisiNastavitve(box){
  var s=NS.salon, k=s.kontakt||{}, b=s.barve||{}, p=s.pravila||{}, o=NS.obv||{};
  var lastnik=(SALON_VLOGA==='lastnik');
  var javni=location.origin+'/'+s.slug;
  var h='';
  h+='<div class="obr-form" style="margin-bottom:1rem"><div class="d-edit-hd">Osnovni podatki</div>'
    +'<p class="bl-svc" style="margin:.2rem 0 .7rem">Stran za naročanje: <a href="'+esc(javni)+'" target="_blank" rel="noopener">'+esc(javni)+'</a></p>'
    +(lastnik?'':'<p class="bl-svc" style="color:#8a5a00">Podatke salona lahko spreminja samo lastnik.</p>')
    +'<div class="obr-row">'+nsInp('nsIme','Ime salona',s.ime)+nsInp('nsKratko','Kratko ime',s.kratko)+'</div>'
    +'<div class="obr-row">'+nsInp('nsTel','Telefon za stranke',k.telefon)+nsInp('nsEmail','E-pošta',k.email)+'</div>'
    +'<div class="obr-row">'+nsInp('nsNaslov','Naslov',k.naslov)+nsInp('nsLogo','Povezava do logotipa (URL)',s.logo_url,'placeholder="https://…/logo.png"')+'</div>'
    +'<div class="d-edit-hd" style="margin-top:.9rem">Pravila naročanja</div>'
    +'<div class="obr-row">'+nsInp('nsMinUr','Najmanj ur vnaprej',p.min_ur_vnaprej!=null?p.min_ur_vnaprej:4,'inputmode="decimal"')
    +'<label>Korak terminov (min)<select id="nsKorak">'+[5,10,15,20,30,60].map(function(x){return '<option'+((+p.korak_min||15)===x?' selected':'')+'>'+x+'</option>';}).join('')+'</select></label></div>'
    +'<div class="obr-row">'+nsInp('nsMaxDni','Največ dni vnaprej (prazno = brez omejitve)',p.max_dni_vnaprej!=null?p.max_dni_vnaprej:'','inputmode="numeric"')
    +nsInp('nsSms','SMS predpona (brez šumnikov, do 11 znakov)',s.sms_predpona,'maxlength="11"')+'</div>'
    +'<div class="obr-row"><label>Izbira zaposlenega pri spletnem naročanju (če ima salon zaposlene)<select id="nsIzbira">'
    +[['kdorkoli','Stranka izbere zaposlenega ali »kdorkoli prost«'],['obvezno','Stranka mora izbrati zaposlenega']].map(function(x){return '<option value="'+x[0]+'"'+((p.izbira_zaposlenega||'kdorkoli')===x[0]?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select></label></div>'
    +'<div class="d-edit-hd" style="margin-top:.9rem">Obvestila salonu</div>'
    +'<div class="obr-row">'+nsInp('nsTg','Telegram chat ID (več z vejico)',o.telegram_chat_ids)+nsInp('nsLastTel','Mobilni lastnika (SMS ob nujni zahtevi)',o.lastnik_telefon)+'</div>'
    +'<div class="obr-row">'+nsInp('nsMailOd','Pošiljatelj e-pošte (neobvezno)',o.email_od,'placeholder="Salon Ana <rezervacije@domena.si>"')+nsInp('nsMailOdg','Odgovori na e-pošto (neobvezno)',o.email_odgovor)+'</div>'
    +'<div class="obr-btns"><button class="act save" id="nsSaveSalon"'+(lastnik?'':' disabled')+'>Shrani podatke salona</button></div>'
    +'<div class="d-edit-msg" id="nsMsgSalon"></div></div>';

  /* delovni čas */
  var DN=['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota'], vrstni=[1,2,3,4,5,6,0];
  var izmenicni=NS.dc.some(function(x){return +x.teden!==0;});
  var dcMap={}; NS.dc.filter(function(x){return +x.teden===0;}).forEach(function(x){dcMap[x.dan]=x;});
  h+='<div class="obr-form" style="margin-bottom:1rem"><div class="d-edit-hd">Delovni čas</div>'
    +(izmenicni?'<p class="bl-svc" style="color:#8a5a00">Salon ima nastavljene izmenične tedne. Tukaj se ureja osnovni urnik (velja vsak teden).</p>':'')
    +'<div class="bl-list">'+vrstni.map(function(d){
      var x=dcMap[d]||{nacin:'zaprto',od:null,do_:null};
      return '<div class="bl-row" style="flex-wrap:wrap"><div class="bl-l" style="min-width:7rem"><b>'+DN[d]+'</b></div>'
        +'<div class="bl-r" style="flex-wrap:wrap">'
        +'<select id="nsDcN'+d+'">'+[['odprto','Odprto'],['dogovor','Po dogovoru'],['zaprto','Zaprto']].map(function(n){return '<option value="'+n[0]+'"'+(x.nacin===n[0]?' selected':'')+'>'+n[1]+'</option>';}).join('')+'</select>'
        +'<input type="time" id="nsDcOd'+d+'" value="'+esc(x.od?String(x.od).slice(0,5):'')+'"> – '
        +'<input type="time" id="nsDcDo'+d+'" value="'+esc(x.do_?String(x.do_).slice(0,5):'')+'"></div></div>';
    }).join('')+'</div>'
    +'<div class="obr-btns"><button class="act save" id="nsSaveDc">Shrani delovni čas</button></div>'
    +'<div class="d-edit-msg" id="nsMsgDc"></div></div>';

  /* dostopi (samo lastnik) */
  if(SALON_VLOGA==='lastnik') h+='<div class="obr-form" style="margin-bottom:1rem"><div class="d-edit-hd">Dostopi do admina</div><div id="nsDostopBox"></div></div>';

  /* zaposleni */
  if(jeUpr()) h+='<div class="obr-form" style="margin-bottom:1rem"><div class="d-edit-hd">Zaposleni</div><div id="nsZapBox"></div></div>';

  /* storitve */
  h+='<div class="obr-form" style="margin-bottom:1rem"><div class="d-edit-hd">Storitve</div>'
    +'<div class="bl-actions" style="margin-top:.4rem"><button class="btn bl-add" id="nsNovaSvc">+ Nova storitev</button></div>'
    +'<div id="nsSvcForm"></div>'
    +(NS.svc.length?'<div class="bl-list">'+NS.svc.map(function(v){
        return '<div class="bl-row"><div class="bl-l" style="min-width:0;flex:1 1 auto"><b>'+esc(v.name)+'</b> · '+esc(v.category)
          +'<div class="bl-svc">'+eur(v.price)+' · '+(+v.duration_min||0)+' min'
          +(v.requires_base?' <span class="bl-rn">dodatek</span>':'')
          +(v.gap_after_min&&v.gap_duration_min?' <span class="bl-rn">vrzel</span>':'')
          +(v.active?'':' <span class="bl-rn bl-rn-ni">neaktivna</span>')+'</div></div>'
          +'<div class="bl-r"><button class="act" data-svc="'+v.id+'">Uredi</button></div></div>';
      }).join('')+'</div>':'<div class="empty">Še ni storitev. Dodajte prvo zgoraj.</div>')
    +'</div>';

  /* kategorije */
  var kats={}; NS.kat.forEach(function(x){kats[x.ime]=x;});
  NS.svc.forEach(function(v){ if(!kats[v.category]) kats[v.category]={ime:v.category,sort_order:v.sort_order,vec_oseb:false,oznaka_oseb:null,nujna:false,_nova:true}; });
  var kl=Object.keys(kats).map(function(k){return kats[k];}).sort(function(a,b){return (a.sort_order||0)-(b.sort_order||0);});
  h+='<div class="obr-form" style="margin-bottom:1rem"><div class="d-edit-hd">Kategorije</div>'
    +'<p class="bl-svc" style="margin:.2rem 0 .7rem">»Več oseb« omogoči izbiro števila oseb v enem terminu (npr. otroci, živali). »Nujna« kategorija vodi v nujno zahtevo brez termina – salon stranko pokliče.</p>'
    +(kl.length?'<div class="bl-list">'+kl.map(function(x,i){
        return '<div class="bl-row" style="flex-wrap:wrap"><div class="bl-l" style="min-width:9rem"><b>'+esc(x.ime)+'</b></div>'
          +'<div class="bl-r" style="flex-wrap:wrap">'
          +'<label style="display:flex;gap:.3rem;align-items:center"><input type="checkbox" id="nsKv'+i+'"'+(x.vec_oseb?' checked':'')+'> več oseb</label>'
          +'<input type="text" id="nsKo'+i+'" value="'+esc(x.oznaka_oseb||'')+'" placeholder="npr. Število otrok" style="width:10rem">'
          +'<label style="display:flex;gap:.3rem;align-items:center"><input type="checkbox" id="nsKn'+i+'"'+(x.nujna?' checked':'')+'> nujna</label>'
          +'</div></div>';
      }).join('')+'</div>':'<div class="empty">Kategorije nastanejo samodejno iz storitev.</div>')
    +'<div class="obr-btns"><button class="act save" id="nsSaveKat">Shrani kategorije</button></div>'
    +'<div class="d-edit-msg" id="nsMsgKat"></div></div>';

  box.innerHTML=h;
  izrisiZaposleneNastavitve();
  izrisiDostope();

  document.getElementById('nsSaveSalon').addEventListener('click',shraniSalon);
  document.getElementById('nsSaveDc').addEventListener('click',function(){ shraniDelovniCas(vrstni); });
  document.getElementById('nsSaveKat').addEventListener('click',function(){ shraniKategorije(kl); });
  document.getElementById('nsNovaSvc').addEventListener('click',function(){ storitevForma(null); });
  box.querySelectorAll('[data-svc]').forEach(function(btn){
    btn.addEventListener('click',function(){ var v=NS.svc.filter(function(x){return String(x.id)===btn.getAttribute('data-svc');})[0]; storitevForma(v||null); });
  });
}

function shraniSalon(){
  var minUr=parseFloat(nsVal('nsMinUr').replace(',','.')), maxDni=nsVal('nsMaxDni');
  if(!nsVal('nsIme')){ nsMsg('nsMsgSalon','Ime salona je obvezno.',false); return; }
  if(isNaN(minUr)||minUr<0){ nsMsg('nsMsgSalon','»Najmanj ur vnaprej« mora biti število.',false); return; }
  if(maxDni!==''&&!/^\d+$/.test(maxDni)){ nsMsg('nsMsgSalon','»Največ dni vnaprej« mora biti celo število ali prazno.',false); return; }
  var sms=nsVal('nsSms').toUpperCase().replace(/[^A-Z0-9 ]/g,'').slice(0,11)||'NAROCILO';
  var p=Object.assign({},NS.salon.pravila||{},{min_ur_vnaprej:minUr,korak_min:parseInt(nsVal('nsKorak'))||15,max_dni_vnaprej:maxDni===''?null:parseInt(maxDni),izbira_zaposlenega:nsVal('nsIzbira')||'kdorkoli'});
  var patch={
    ime:nsVal('nsIme'), kratko:nsVal('nsKratko')||null, logo_url:nsVal('nsLogo')||null, sms_predpona:sms,
    kontakt:Object.assign({},NS.salon.kontakt||{},{telefon:nsVal('nsTel')||null,email:nsVal('nsEmail')||null,naslov:nsVal('nsNaslov')||null}),
    pravila:p,
    obvestila:{telegram_chat_ids:nsVal('nsTg')||null,lastnik_telefon:nsVal('nsLastTel')||null,email_od:nsVal('nsMailOd')||null,email_odgovor:nsVal('nsMailOdg')||null}
  };
  nsMsg('nsMsgSalon','Shranjujem …',true);
  /* shranjevanje prek funkcije v bazi (preveri lastnika; obvestila niso javno berljiva) */
  sb.rpc('app_shrani_salon',{s:SALON_ID, podatki:patch}).then(function(r){
    if(r.error){ nsMsg('nsMsgSalon','Napaka: '+r.error.message,false); return; }
    if(!r.data||!r.data.ok){ nsMsg('nsMsgSalon',(r.data&&r.data.napaka)||'Ni shranjeno.',false); return; }
    nsMsg('nsMsgSalon','Shranjeno.',true);
    APP.naloziSalon(APP.slug).then(function(){ APP.vstavi(); document.title=(APP.kratko||APP.ime)+' · Admin'; });
  });
}

function shraniDelovniCas(dnevi){
  var vrstice=[], napaka='';
  dnevi.forEach(function(d){
    var n=nsVal('nsDcN'+d), od=nsVal('nsDcOd'+d), dd=nsVal('nsDcDo'+d);
    if(n==='odprto'&&(!od||!dd||od>=dd)) napaka='Pri odprtih dneh vpišite uro od in do (»do« mora biti za »od«).';
    vrstice.push({dan:d,teden:0,nacin:n,od:n==='odprto'?od:null,do_:n==='odprto'?dd:null,updated_at:new Date().toISOString()});
  });
  if(napaka){ nsMsg('nsMsgDc',napaka,false); return; }
  nsMsg('nsMsgDc','Shranjujem …',true);
  sb.from('delovni_cas').upsert(vrstice,{onConflict:'salon_id,dan,teden'}).then(function(r){
    if(r.error){ nsMsg('nsMsgDc','Napaka: '+r.error.message,false); return; }
    nsMsg('nsMsgDc','Shranjeno.',true);
    nalozDelovniCas(function(){});
  });
}

function shraniKategorije(kl){
  var vrstice=kl.map(function(x,i){
    return {ime:x.ime,sort_order:x.sort_order||0,vec_oseb:nsChk('nsKv'+i),oznaka_oseb:nsVal('nsKo'+i)||null,nujna:nsChk('nsKn'+i)};
  });
  if(!vrstice.length) return;
  nsMsg('nsMsgKat','Shranjujem …',true);
  sb.from('app_kategorije').upsert(vrstice,{onConflict:'salon_id,ime'}).then(function(r){
    if(r.error){ nsMsg('nsMsgKat','Napaka: '+r.error.message,false); return; }
    nsMsg('nsMsgKat','Shranjeno.',true);
    APP.naloziSalon(APP.slug);
  });
}

function storitevForma(v){
  var box=document.getElementById('nsSvcForm'); if(!box) return;
  var kat=[]; NS.svc.forEach(function(x){ if(kat.indexOf(x.category)<0) kat.push(x.category); });
  v=v||{category:kat[0]||'',name:'',description:'',price:'',duration_min:30,sort_order:(NS.svc.length+1)*10,requires_base:false,is_base:true,gap_after_min:null,gap_duration_min:null,active:true};
  box.innerHTML='<div class="obr-form" style="margin-bottom:.8rem;border:1.5px solid var(--coral)"><div class="d-edit-hd">'+(v.id?'Uredi storitev':'Nova storitev')+'</div>'
    +'<datalist id="nsKatList">'+kat.map(function(k){return '<option value="'+esc(k)+'">';}).join('')+'</datalist>'
    +'<div class="obr-row">'+nsInp('nsSvKat','Kategorija (skupina v ceniku)',v.category,'list="nsKatList"')+nsInp('nsSvIme','Ime storitve',v.name)+'</div>'
    +'<div class="obr-row">'+nsInp('nsSvOpis','Opis (neobvezno)',v.description)+nsInp('nsSvCena','Cena (€)',v.price,'inputmode="decimal"')+'</div>'
    +'<div class="obr-row">'+nsInp('nsSvTraj','Trajanje (min)',v.duration_min,'inputmode="numeric"')+nsInp('nsSvVr','Vrstni red',v.sort_order,'inputmode="numeric"')+'</div>'
    +'<div class="obr-row">'+nsInp('nsSvGa','Vrzel: po koliko min (neobvezno)',v.gap_after_min,'inputmode="numeric"')+nsInp('nsSvGd','Vrzel: koliko min prosto',v.gap_duration_min,'inputmode="numeric"')+'</div>'
    +'<div class="obr-row" style="gap:1.2rem">'
    +'<label style="display:flex;gap:.4rem;align-items:center"><input type="checkbox" id="nsSvDod"'+(v.requires_base?' checked':'')+'> dodatek (samo skupaj z drugo storitvijo)</label>'
    +'<label style="display:flex;gap:.4rem;align-items:center"><input type="checkbox" id="nsSvAkt"'+(v.active?' checked':'')+'> aktivna (vidna strankam)</label></div>'
    +'<div class="obr-btns"><button class="act save" id="nsSvSave">Shrani storitev</button><button class="act" id="nsSvPrekl">Prekliči</button></div>'
    +'<div class="d-edit-msg" id="nsMsgSvc"></div></div>';
  box.scrollIntoView({behavior:'smooth',block:'start'});
  document.getElementById('nsSvPrekl').addEventListener('click',function(){ box.innerHTML=''; });
  document.getElementById('nsSvSave').addEventListener('click',function(){
    var cena=parseFloat(nsVal('nsSvCena').replace(',','.')), traj=parseInt(nsVal('nsSvTraj')), ga=nsVal('nsSvGa'), gd=nsVal('nsSvGd');
    if(!nsVal('nsSvKat')||!nsVal('nsSvIme')){ nsMsg('nsMsgSvc','Kategorija in ime sta obvezna.',false); return; }
    if(isNaN(cena)||cena<0){ nsMsg('nsMsgSvc','Cena mora biti število.',false); return; }
    if(isNaN(traj)||traj<0){ nsMsg('nsMsgSvc','Trajanje mora biti število minut.',false); return; }
    var dod=nsChk('nsSvDod');
    var rec={category:nsVal('nsSvKat'),name:nsVal('nsSvIme'),description:nsVal('nsSvOpis')||null,price:cena,duration_min:traj,
             sort_order:parseInt(nsVal('nsSvVr'))||0,requires_base:dod,is_base:!dod,
             gap_after_min:ga===''?null:parseInt(ga),gap_duration_min:gd===''?null:parseInt(gd),active:nsChk('nsSvAkt')};
    nsMsg('nsMsgSvc','Shranjujem …',true);
    var q=v.id?sb.from('services').update(rec).eq('id',v.id):sb.from('services').insert([rec]);
    q.then(function(r){
      if(r.error){ nsMsg('nsMsgSvc','Napaka: '+r.error.message,false); return; }
      sb.from('app_kategorije').upsert([{ime:rec.category,sort_order:rec.sort_order}],{onConflict:'salon_id,ime',ignoreDuplicates:true}).then(function(){
        loadServices(function(){}); loadNastavitve();
      });
    });
  });
}


/* ══ ZAPOSLENI ══════════════════════════════════════════════════════════
   Vsak zaposleni ima svoj koledar (termini z zaposleni_id), svoj urnik
   (app_urnik_zaposlenih; brez njega velja delovni čas salona), svoje odsotnosti
   (blocks z zaposleni_id) in svoje cene/trajanja (app_zaposleni_storitve).
   Lastnik in admin vidita vse, zaposleni (vloga 'zaposleni') samo sebe. */
var ZAP=[], ZAPMAP={}, ZS={}, URNIK={}, MOJ_ZAP=null, FILTER_Z='';
var ZAP_PALETA=['#2f5e92','#bd6e28','#3c8c3c','#8a3ea6','#22897a','#bc3f72','#9c8418','#4d52a3','#5b6f7d'];
function jeUpr(){ return SALON_VLOGA==='lastnik'||SALON_VLOGA==='admin'; }
function jeZap(){ return !jeUpr() && !jeRecepcija() && !!MOJ_ZAP; }
function jeRecepcija(){ return SALON_VLOGA==='recepcija'; }
function vidiVse(){ return jeUpr()||jeRecepcija(); }
function aktivniZap(){ return ZAP.filter(function(z){return z.aktiven;}); }
function zapIme(id){ var z=ZAPMAP[id]; return z?z.ime:''; }
function zapBarva(id){ var z=ZAPMAP[id]; return z?z.barva:'#9aa0a6'; }
function zapPika(id){ return id&&ZAPMAP[id]?'<span class="zap-pika" style="background:'+esc(zapBarva(id))+'"></span>':''; }
function nalozZaposlene(){
  return Promise.all([
    _sbFrom('app_zaposleni').select('id,ime,barva,sort_order,aktiven').eq('salon_id',SALON_ID).order('sort_order',{ascending:true}).order('ime',{ascending:true}),
    sb.rpc('app_moj_zaposleni_id',{s:SALON_ID})
  ]).then(function(r){
    ZAP=(r[0]&&!r[0].error&&r[0].data)||[]; ZAPMAP={};
    ZAP.forEach(function(z,i){ if(!z.barva) z.barva=ZAP_PALETA[i%ZAP_PALETA.length]; ZAPMAP[z.id]=z; });
    MOJ_ZAP=(r[1]&&!r[1].error&&r[1].data)||null;
    var ids=ZAP.map(function(z){return z.id;});
    ZS={}; URNIK={};
    if(!ids.length) return;
    return Promise.all([
      _sbFrom('app_zaposleni_storitve').select('*').in('zaposleni_id',ids),
      _sbFrom('app_urnik_zaposlenih').select('*').in('zaposleni_id',ids)
    ]).then(function(r2){
      ((r2[0]&&r2[0].data)||[]).forEach(function(x){ (ZS[x.zaposleni_id]=ZS[x.zaposleni_id]||{})[x.service_id]=x; });
      ((r2[1]&&r2[1].data)||[]).forEach(function(x){ (URNIK[x.zaposleni_id]=URNIK[x.zaposleni_id]||[]).push(x); });
    });
  }).then(prilagodiVlogi);
}
function prilagodiVlogi(){
  /* zaposleni: brez strank in blagajne */
  ['stranke','blagajna'].forEach(function(m){
    var b=document.querySelector('.seg button[data-mode="'+m+'"]');
    if(b) b.classList.toggle('hidden',jeZap());
  });
  var ns=document.querySelector('.seg button[data-mode="nastavitve"]');
  if(ns){ ns.textContent=jeZap()?'Moj urnik':'Nastavitve'; ns.classList.toggle('hidden',jeRecepcija()); }
  /* recepcija (skupni računalnik): brez uvoza/izvoza strank, mesečnega prometa in brisanja obračunov */
  document.body.classList.toggle('vloga-recepcija',jeRecepcija());
  var f=document.getElementById('zapFilter');
  if(jeZap()){ FILTER_Z=MOJ_ZAP; if(f) f.classList.add('hidden'); }
  else if(f){
    var ak=aktivniZap();
    if(!ak.length){ f.classList.add('hidden'); FILTER_Z=''; }
    else{
      var shr=lsGet('admin_zap_'+SALON_ID);
      f.innerHTML='<option value="">Vsi zaposleni</option>'+ak.map(function(z){return '<option value="'+z.id+'">'+esc(z.ime)+'</option>';}).join('');
      FILTER_Z=ZAPMAP[shr]&&ZAPMAP[shr].aktiven?shr:''; f.value=FILTER_Z; f.classList.remove('hidden');
    }
  }
  /* opravek / odsotnost: za cel salon ali za enega zaposlenega */
  var bl=document.getElementById('blkZapLbl'), bs=document.getElementById('blkZap');
  if(bl&&bs){
    if(jeZap()){ bs.innerHTML='<option value="'+MOJ_ZAP+'">'+esc(zapIme(MOJ_ZAP))+'</option>'; bl.classList.add('hidden'); }
    else if(aktivniZap().length){ bs.innerHTML='<option value="">Cel salon (zaprto za vse)</option>'+aktivniZap().map(function(z){return '<option value="'+z.id+'">'+esc(z.ime)+'</option>';}).join(''); bl.classList.remove('hidden'); }
    else { bs.innerHTML='<option value=""></option>'; bl.classList.add('hidden'); }
  }
}
/* delovni čas zaposlenega na dan (lasten urnik, sicer salon) – oblika kot dayInfo */
function dayInfoZ(d,zid){
  var rows=zid&&URNIK[zid];
  if(!rows||!rows.length) return dayInfo(d);
  var iso=(d instanceof Date)?isoOf(d):d;
  if(PRAZNIKI[iso]) return {closed:true, praznik:PRAZNIKI[iso]};
  var p=iso.split('-'), dow=new Date(+p[0],+p[1]-1,+p[2]).getDay(), par=tedenVrsta(iso);
  var x=rows.filter(function(r){return +r.dan===dow&&+r.teden===par;})[0]||rows.filter(function(r){return +r.dan===dow&&+r.teden===0;})[0];
  if(!x) return {closed:true};
  if(x.nacin==='odprto'&&x.od&&x.do_) return {h:[parseInt(String(x.od).substring(0,2)),parseInt(String(x.do_).substring(0,2))]};
  if(x.nacin==='dogovor') return {arrangement:true};
  return {closed:true};
}
/* storitve, ki jih opravlja zaposleni, z njegovimi cenami in trajanjem */
function svcSeznam(zid){
  if(!zid||!ZS[zid]) return zid&&ZAPMAP[zid]?[]:SERVICES;
  return SERVICES.filter(function(s){return !!ZS[zid][s.id];}).map(function(s){
    var o=Object.assign({},s), x=ZS[zid][s.id];
    if(x.cena!=null&&x.cena!=='') o.price=x.cena;
    if(x.trajanje_min!=null) o.duration_min=x.trajanje_min;
    return o;
  });
}
function nbZapVal(){ var el=document.getElementById('nbZap'); return el&&el.value?el.value:''; }
function pripraviNbZap(zid){
  var lbl=document.getElementById('nbZapLbl'), sel=document.getElementById('nbZap'); if(!lbl||!sel) return;
  var ak=aktivniZap();
  if(jeZap()){ sel.innerHTML='<option value="'+MOJ_ZAP+'">'+esc(zapIme(MOJ_ZAP))+'</option>'; lbl.classList.add('hidden'); return; }
  if(!ak.length){ sel.innerHTML='<option value=""></option>'; lbl.classList.add('hidden'); return; }
  sel.innerHTML=ak.map(function(z){return '<option value="'+z.id+'">'+esc(z.ime)+'</option>';}).join('')+'<option value="">— nedodeljeno (zasede vse) —</option>';
  sel.value=(zid&&ZAPMAP[zid])?zid:(FILTER_Z||ak[0].id);
  lbl.classList.remove('hidden');
}
/* stolpci koledarja: dnevi ali (dnevni pogled, vsi zaposleni) zaposleni */
function stolpciKoledarja(days,bookings){
  var ak=aktivniZap();
  if(mode==='day'&&!FILTER_Z&&ak.length>=2){
    var di=isoOf(days[0]);
    var cols=ak.map(function(z){return {d:days[0],zid:z.id};});
    if(bookings.some(function(b){return b.booking_date===di&&!b.zaposleni_id;})) cols.push({d:days[0],zid:null});
    return cols;
  }
  return days.map(function(d){return {d:d,zid:FILTER_Z||undefined};});
}
function terminVStolpcu(b,c){
  if(c.zid===undefined) return true;
  if(c.zid===null) return !b.zaposleni_id;
  return b.zaposleni_id===c.zid||(!!FILTER_Z&&!b.zaposleni_id);
}
function opravekVStolpcu(bl,c){
  if(c.zid===undefined||c.zid===null) return c.zid===undefined||!bl.zaposleni_id;
  return !bl.zaposleni_id||bl.zaposleni_id===c.zid;
}
/* ── Nastavitve → Zaposleni ── */
var NZ=[];
function izrisiZaposleneNastavitve(){
  var box=document.getElementById('nsZapBox'); if(!box) return;
  box.innerHTML='<div class="empty">Nalagam …</div>';
  sb.rpc('app_zaposleni_seznam',{s:SALON_ID}).then(function(r){
    if(r.error){ box.innerHTML='<div class="empty">Napaka: '+esc(r.error.message)+'</div>'; return; }
    NZ=r.data||[];
    box.innerHTML='<p class="bl-svc" style="margin:.2rem 0 .7rem">Vsak zaposleni ima svoj koledar, urnik, odsotnosti ter lahko svoje cene in trajanja. '
      +'Z e-pošto se lahko prijavi v admin, kjer vidi samo svoje termine. Salon brez zaposlenih deluje kot doslej.</p>'
      +'<div class="bl-actions" style="margin-top:.2rem"><button class="btn bl-add" id="nsNovZap">+ Nov zaposleni</button></div>'
      +'<div id="nsZapForm"></div>'
      +(NZ.length?'<div class="bl-list">'+NZ.map(function(z){
          return '<div class="bl-row"><div class="bl-l" style="min-width:0;flex:1 1 auto"><b><span class="zap-pika" style="background:'+esc(z.barva||'#9aa0a6')+'"></span>'+esc(z.ime)+'</b>'
            +'<div class="bl-svc">'+(z.email?esc(z.email):'brez prijave')
            +(z.ima_prijavo?' <span class="bl-rn">prijava</span>':(z.email?' <span class="bl-rn">povabljen</span>':''))
            +(z.ima_urnik?' <span class="bl-rn">lasten urnik</span>':'')
            +(z.aktiven?'':' <span class="bl-rn bl-rn-ni">neaktiven</span>')+'</div></div>'
            +'<div class="bl-r">'+(z.email&&!z.ima_prijavo?'<button class="act" data-zur="'+esc(z.email)+'">Ustvari prijavo</button>':'')+(z.email&&z.ima_prijavo?'<button class="act" data-zng="'+esc(z.email)+'">Novo geslo</button>':'')+'<button class="act" data-zap="'+z.id+'">Uredi</button></div></div>';
        }).join('')+'</div>':'<div class="empty">Še ni zaposlenih – vsi termini so za salon kot celoto.</div>');
    document.getElementById('nsNovZap').addEventListener('click',function(){ zaposleniForma(null); });
    box.querySelectorAll('[data-zur]').forEach(function(b){ b.addEventListener('click',function(){
      racunForma(b.closest('.bl-row'), b.getAttribute('data-zur'), function(){ izrisiZaposleneNastavitve(); izrisiDostope(); nalozZaposlene(); });
    }); });
    box.querySelectorAll('[data-zng]').forEach(function(b){ b.addEventListener('click',function(){
      racunForma(b.closest('.bl-row'), b.getAttribute('data-zng'), null, 'geslo');
    }); });
    box.querySelectorAll('[data-zap]').forEach(function(b){ b.addEventListener('click',function(){
      zaposleniForma(NZ.filter(function(z){return z.id===b.getAttribute('data-zap');})[0]||null);
    }); });
  });
}
function urnikVrsticeHtml(pref,rows){
  var DN=['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota'], vrstni=[1,2,3,4,5,6,0], m={};
  (rows||[]).filter(function(x){return +x.teden===0;}).forEach(function(x){m[x.dan]=x;});
  return '<div class="bl-list">'+vrstni.map(function(d){
    var x=m[d]||{nacin:'zaprto'};
    return '<div class="bl-row" style="flex-wrap:wrap"><div class="bl-l" style="min-width:7rem"><b>'+DN[d]+'</b></div>'
      +'<div class="bl-r" style="flex-wrap:wrap">'
      +'<select id="'+pref+'N'+d+'">'+[['odprto','Dela'],['dogovor','Po dogovoru'],['zaprto','Ne dela']].map(function(n){return '<option value="'+n[0]+'"'+(x.nacin===n[0]?' selected':'')+'>'+n[1]+'</option>';}).join('')+'</select>'
      +'<input type="time" id="'+pref+'Od'+d+'" value="'+esc(x.od?String(x.od).slice(0,5):'')+'"> – '
      +'<input type="time" id="'+pref+'Do'+d+'" value="'+esc(x.do_?String(x.do_).slice(0,5):'')+'"></div></div>';
  }).join('')+'</div>';
}
function urnikIzObrazca(pref,zid){
  var out=[], napaka='';
  [1,2,3,4,5,6,0].forEach(function(d){
    var n=nsVal(pref+'N'+d), od=nsVal(pref+'Od'+d), dd=nsVal(pref+'Do'+d);
    if(n==='odprto'&&(!od||!dd||od>=dd)) napaka='Pri dnevih, ko dela, vpišite uro od in do (»do« mora biti za »od«).';
    out.push({zaposleni_id:zid,dan:d,teden:0,nacin:n,od:n==='odprto'?od:null,do_:n==='odprto'?dd:null});
  });
  return {vrstice:out,napaka:napaka};
}
function shraniUrnik(zid,lasten,pref){
  if(!lasten) return _sbFrom('app_urnik_zaposlenih').delete().eq('zaposleni_id',zid);
  var u=urnikIzObrazca(pref,zid);
  if(u.napaka) return Promise.resolve({error:{message:u.napaka}});
  return _sbFrom('app_urnik_zaposlenih').upsert(u.vrstice,{onConflict:'zaposleni_id,dan,teden'});
}
function zaposleniForma(z){
  var box=document.getElementById('nsZapForm'); if(!box) return;
  var nov=!z;
  z=z||{ime:'',barva:ZAP_PALETA[NZ.length%ZAP_PALETA.length],sort_order:(NZ.length+1)*10,aktiven:true,email:'',telefon:'',telegram_chat_id:'',obvestila_sms:false,obvestila_telegram:true};
  var zs=(z.id&&ZS[z.id])||{}, vse=NS.svc||[];
  var urnik=(z.id&&URNIK[z.id])||[], lasten=urnik.length>0;
  var chk=function(id,lbl,on){ return '<label style="display:flex;flex-direction:row;gap:.45rem;align-items:center;margin:.35rem 0"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+' style="width:auto;margin:0"> '+lbl+'</label>'; };
  box.innerHTML='<div class="obr-form" style="margin-bottom:.8rem;border:1.5px solid var(--coral)"><div class="d-edit-hd">'+(nov?'Nov zaposleni':'Uredi: '+esc(z.ime))+'</div>'
    +'<div class="obr-row">'+nsInp('nzIme','Ime (vidijo ga stranke)',z.ime)+nsBarva('nzBarva','Barva v koledarju',z.barva)+'</div>'
    +'<div class="obr-row">'+nsInp('nzVr','Vrstni red',z.sort_order,'inputmode="numeric"')
    +'<div style="display:flex;align-items:flex-end;padding-bottom:.4rem">'+chk('nzAkt','aktiven (sprejema termine)',z.aktiven)+'</div></div>'
    +'<div class="d-edit-hd" style="margin-top:.9rem">Prijava in obvestila</div>'
    +'<div class="obr-row">'+nsInp('nzEmail','E-pošta za prijavo v admin (neobvezno)',z.email,'type="email" placeholder="ime@domena.si"')+nsInp('nzTel','Mobilni (SMS obvestila)',z.telefon)+'</div>'
    +'<div class="obr-row">'+nsInp('nzTg','Telegram chat ID (neobvezno)',z.telegram_chat_id)
    +'<div><div class="bl-svc" style="margin-bottom:.2rem">Obvestila o novih terminih</div><div style="display:flex;gap:1.2rem;flex-wrap:wrap">'+chk('nzObvTg','Telegram',z.obvestila_telegram)+chk('nzObvSms','SMS',z.obvestila_sms)+'</div></div></div>'
    +'<p class="bl-svc" style="margin:.1rem 0 .3rem">Po shranjevanju v seznamu zaposlenih kliknite »Ustvari prijavo« in določite začasno geslo.</p>'
    +'<div class="d-edit-hd" style="margin-top:.9rem">Storitve</div>'
    +'<p class="bl-svc" style="margin:.2rem 0 .5rem">Odkljukajte, kar opravlja. Cena in trajanje sta neobvezna – prazno pomeni ceno in trajanje salona.</p>'
    +'<div class="bl-list">'+vse.filter(function(v){return v.active||zs[v.id];}).map(function(v){
        var x=zs[v.id], on=nov?!!v.active:!!x;
        return '<div class="bl-row" style="flex-wrap:wrap"><div class="bl-l" style="min-width:0;flex:1 1 12rem">'
          +'<label style="display:flex;gap:.45rem;align-items:center"><input type="checkbox" class="nzSv" value="'+v.id+'"'+(on?' checked':'')+'> <span><b>'+esc(v.name)+'</b> <span class="bl-svc">'+esc(v.category)+'</span></span></label></div>'
          +'<div class="bl-r"><input type="text" class="nzCena" data-id="'+v.id+'" inputmode="decimal" style="width:5.5rem" placeholder="'+esc(String(v.price))+' €" value="'+esc(x&&x.cena!=null?x.cena:'')+'">'
          +'<input type="text" class="nzTraj" data-id="'+v.id+'" inputmode="numeric" style="width:5rem" placeholder="'+esc(String(v.duration_min||0))+' min" value="'+esc(x&&x.trajanje_min!=null?x.trajanje_min:'')+'"></div></div>';
      }).join('')+'</div>'
    +'<div class="d-edit-hd" style="margin-top:.9rem">Urnik</div>'
    +chk('nzLasten','lasten urnik (sicer velja delovni čas salona)',lasten)
    +'<div id="nzUrnik" style="margin-top:.5rem'+(lasten?'':';display:none')+'">'+urnikVrsticeHtml('nzU',lasten?urnik:(NS.dc||[]))+'</div>'
    +'<p class="bl-svc" style="margin:.5rem 0 0">Dopust in odsotnosti vpišete v koledarju z gumbom »Opravek« (izberite zaposlenega).</p>'
    +'<div class="obr-btns"><button class="act save" id="nzSave">Shrani zaposlenega</button><button class="act" id="nzPrekl">Prekliči</button></div>'
    +'<div class="d-edit-msg" id="nzMsg"></div></div>';
  box.scrollIntoView({behavior:'smooth',block:'start'});
  var bv=document.getElementById('nzBarva'); bv.addEventListener('input',function(){ document.getElementById('nzBarvaHex').textContent=bv.value; });
  document.getElementById('nzLasten').addEventListener('change',function(){ document.getElementById('nzUrnik').style.display=this.checked?'':'none'; });
  document.getElementById('nzPrekl').addEventListener('click',function(){ box.innerHTML=''; });
  document.getElementById('nzSave').addEventListener('click',function(){
    if(!nsVal('nzIme')){ nsMsg('nzMsg','Ime je obvezno.',false); return; }
    var izbr=[], napaka='';
    box.querySelectorAll('.nzSv').forEach(function(cb){
      if(!cb.checked) return;
      var id=cb.value, c=box.querySelector('.nzCena[data-id="'+id+'"]').value.trim().replace(',','.'), t=box.querySelector('.nzTraj[data-id="'+id+'"]').value.trim();
      if(c!==''&&(isNaN(parseFloat(c))||parseFloat(c)<0)) napaka='Cena mora biti število ali prazno.';
      if(t!==''&&!/^\d+$/.test(t)) napaka='Trajanje mora biti celo število minut ali prazno.';
      izbr.push({service_id:+id,cena:c===''?null:parseFloat(c),trajanje_min:t===''?null:parseInt(t)});
    });
    if(!izbr.length) napaka='Izberite vsaj eno storitev, ki jo opravlja.';
    var lastenU=nsChk('nzLasten'); if(lastenU){ var uu=urnikIzObrazca('nzU',null); if(uu.napaka) napaka=uu.napaka; }
    if(napaka){ nsMsg('nzMsg',napaka,false); return; }
    var p={ime:nsVal('nzIme'),barva:nsVal('nzBarva'),sort_order:parseInt(nsVal('nzVr'))||0,aktiven:nsChk('nzAkt'),
           email:nsVal('nzEmail'),telefon:nsVal('nzTel'),telegram_chat_id:nsVal('nzTg'),
           obvestila_telegram:nsChk('nzObvTg'),obvestila_sms:nsChk('nzObvSms')};
    var btn=this; btn.disabled=true; nsMsg('nzMsg','Shranjujem …',true);
    sb.rpc('app_shrani_zaposlenega',{s:SALON_ID,p_id:z.id||null,p:p}).then(function(r){
      if(r.error||!r.data||!r.data.ok){ btn.disabled=false; nsMsg('nzMsg',(r.error&&r.error.message)||(r.data&&r.data.napaka)||'Ni shranjeno.',false); return; }
      var zid=r.data.id, prijava=r.data.prijava;
      var keep=izbr.map(function(x){return x.service_id;});
      var vrst=izbr.map(function(x){return {zaposleni_id:zid,service_id:x.service_id,cena:x.cena,trajanje_min:x.trajanje_min};});
      var odstrani=(NS.svc||[]).map(function(v){return v.id;}).filter(function(id){return keep.indexOf(id)<0;});
      Promise.all([
        _sbFrom('app_zaposleni_storitve').upsert(vrst,{onConflict:'zaposleni_id,service_id'}),
        odstrani.length?_sbFrom('app_zaposleni_storitve').delete().eq('zaposleni_id',zid).in('service_id',odstrani):Promise.resolve({}),
        shraniUrnik(zid,lastenU,'nzU')
      ]).then(function(rr){
        btn.disabled=false;
        var e=rr.filter(function(x){return x&&x.error;})[0];
        if(e){ nsMsg('nzMsg','Zaposleni je shranjen, napaka pri storitvah ali urniku: '+e.error.message,false); return; }
        nsMsg('nzMsg','Shranjeno.'+(prijava==='povezan'?' Prijava v admin je povezana.':(prijava==='povabljen'?' Ko bo račun s to e-pošto ustvarjen, se samodejno poveže.':'')),true);
        nalozZaposlene().then(function(){ setTimeout(izrisiZaposleneNastavitve,900); });
      });
    });
  });
}
/* ── Ustvari račun za povabljeno e-pošto (edge funkcija ustvari-racun) ──
   Lastnik/admin vpiše začasno geslo, račun nastane takoj in se poveže s salonom. */
function predlogGesla(){
  var z='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', a=new Uint32Array(10), g='';
  try{ crypto.getRandomValues(a); }catch(e){ for(var i=0;i<10;i++) a[i]=Math.floor(Math.random()*1e9); }
  for(var j=0;j<10;j++) g+=z.charAt(a[j]%z.length);
  return g;
}
function racunForma(vrstica,email,koncano,akcija){
  var zaGeslo=(akcija==='geslo');
  var st=vrstica.nextElementSibling; if(st&&st.classList.contains('racun-forma')){ st.remove(); return; }
  var f=document.createElement('div'); f.className='racun-forma obr-form'; f.style.cssText='margin:.3rem 0 .6rem;border:1.5px solid var(--coral)';
  f.innerHTML='<div class="d-edit-hd">'+(zaGeslo?'Novo geslo za ':'Ustvari račun za ')+esc(email)+'</div>'
    +'<div class="obr-row"><label>Začasno geslo (vsaj 8 znakov)<input type="text" class="rf-geslo" value="'+predlogGesla()+'" autocomplete="off" spellcheck="false"></label>'
    +'<div style="display:flex;align-items:flex-end;gap:.5rem;padding-bottom:.2rem"><button class="act" type="button" data-rf="nov">Novo geslo</button><button class="act save" type="button" data-rf="ok">'+(zaGeslo?'Nastavi geslo':'Ustvari račun')+'</button></div></div>'
    +'<p class="bl-svc" style="margin:.2rem 0 0">Geslo si zapišite in ga osebi sporočite osebno (ne po e-pošti). Po prvi prijavi ga zamenja z gumbom »Geslo«.</p>'
    +'<div class="d-edit-msg rf-msg"></div>';
  vrstica.parentNode.insertBefore(f,vrstica.nextSibling);
  var msg=f.querySelector('.rf-msg');
  f.querySelector('[data-rf="nov"]').onclick=function(){ f.querySelector('.rf-geslo').value=predlogGesla(); };
  f.querySelector('[data-rf="ok"]').onclick=function(){
    var g=f.querySelector('.rf-geslo').value, btn=this;
    if(g.length<8){ msg.textContent='Geslo naj ima vsaj 8 znakov.'; msg.className='d-edit-msg rf-msg err'; return; }
    btn.disabled=true; msg.textContent='Ustvarjam …'; msg.className='d-edit-msg rf-msg ok';
    sb.functions.invoke('ustvari-racun',{body:{salon_id:SALON_ID,email:email,geslo:g,akcija:zaGeslo?'geslo':'ustvari'}}).then(function(r){
      var obdelaj=function(d){
        btn.disabled=false;
        if(d&&d.ok){ msg.textContent=zaGeslo?('Geslo je nastavljeno. Prijava: '+email+' na '+location.origin+'/admin – staro geslo ne velja več.'):('Račun je ustvarjen in povezan s salonom. Prijava: '+email+' na '+location.origin+'/admin'); msg.className='d-edit-msg rf-msg ok';
          f.querySelector('.rf-geslo').readOnly=true; btn.remove(); if(koncano) setTimeout(koncano,2500); return; }
        msg.textContent=(d&&d.napaka)||'Računa ni bilo mogoče ustvariti.'; msg.className='d-edit-msg rf-msg err';
      };
      if(r.error&&r.error.context&&typeof r.error.context.json==='function') r.error.context.json().then(obdelaj,function(){ obdelaj(null); });
      else obdelaj(r.data);
    });
  };
}

/* ── Nastavitve → Dostopi: kdo se lahko prijavi v admin salona ── */
var VLOGE_IME={lastnik:'Lastnik – ves dostop',admin:'Admin – ves dostop razen dostopov',recepcija:'Recepcija – koledarji, stranke, današnja blagajna',zaposleni:'Zaposleni – samo svoj koledar'};
function izrisiDostope(){
  var box=document.getElementById('nsDostopBox'); if(!box) return;
  box.innerHTML='<div class="empty">Nalagam …</div>';
  sb.rpc('app_clani_salona',{s:SALON_ID}).then(function(r){
    if(r.error){ box.innerHTML='<div class="empty">Napaka: '+esc(r.error.message)+'</div>'; return; }
    var cl=r.data||[];
    box.innerHTML='<p class="bl-svc" style="margin:.2rem 0 .7rem"><b>Recepcija</b> je račun za skupni računalnik v salonu: vidi koledarje vseh zaposlenih, vpisuje termine in opravke, '
      +'išče in ureja stranke ter vnaša današnje obračune. Ne vidi prometa za nazaj, izvoza, nastavitev in zaposlenih. '
      +'Zaposlene s svojim koledarjem dodate spodaj pod »Zaposleni«.</p>'
      +'<div class="bl-list">'+cl.map(function(c,i){
        var ure=!c.povabilo&&(c.vloga==='admin'||c.vloga==='recepcija');
        return '<div class="bl-row" style="flex-wrap:wrap"><div class="bl-l" style="min-width:0;flex:1 1 14rem"><b>'+esc(c.email||'')+'</b>'
          +'<div class="bl-svc">'+esc(VLOGE_IME[c.vloga]||c.vloga)+(c.zaposleni?' ('+esc(c.zaposleni)+')':'')
          +(c.povabilo?' <span class="bl-rn">čaka na račun</span>':'')+'</div></div>'
          +(c.povabilo&&c.vloga!=='lastnik'?'<div class="bl-r"><button class="act" data-ur="'+i+'">Ustvari račun</button></div>':'')
          +(!c.povabilo&&c.vloga==='zaposleni'?'<div class="bl-r"><button class="act" data-ng="'+i+'">Novo geslo</button></div>':'')
          +(ure?'<div class="bl-r"><select data-dv="'+i+'"><option value="admin"'+(c.vloga==='admin'?' selected':'')+'>Admin</option><option value="recepcija"'+(c.vloga==='recepcija'?' selected':'')+'>Recepcija</option></select>'
            +'<button class="act" data-ng="'+i+'">Novo geslo</button><button class="act" data-do="'+i+'">Odstrani</button></div>':'')+'</div>';
      }).join('')+'</div>'
      +'<div class="obr-row" style="margin-top:.8rem">'+nsInp('dsEmail','E-pošta novega dostopa','','type="email" placeholder="recepcija@salon.si"')
      +'<label>Vloga<select id="dsVloga"><option value="recepcija">Recepcija</option><option value="admin">Admin</option></select></label></div>'
      +'<p class="bl-svc" style="margin:.1rem 0 .3rem">Če oseba še nima računa, se pokaže »čaka na račun« – kliknite »Ustvari račun« in določite začasno geslo.</p>'
      +'<div class="obr-btns"><button class="act save" id="dsDodaj">Dodaj dostop</button></div><div class="d-edit-msg" id="dsMsg"></div>';
    box.querySelectorAll('[data-dv]').forEach(function(sel){ sel.addEventListener('change',function(){
      var c=cl[+sel.getAttribute('data-dv')];
      _sbFrom('app_salon_members').update({vloga:sel.value}).eq('salon_id',SALON_ID).eq('user_id',c.user_id).then(function(x){
        nsMsg('dsMsg',x.error?'Napaka: '+x.error.message:'Vloga spremenjena.',!x.error); if(!x.error) izrisiDostope();
      });
    }); });
    box.querySelectorAll('[data-ur]').forEach(function(btn){ btn.addEventListener('click',function(){
      racunForma(btn.closest('.bl-row'), cl[+btn.getAttribute('data-ur')].email, function(){ izrisiDostope(); izrisiZaposleneNastavitve(); nalozZaposlene(); });
    }); });
    box.querySelectorAll('[data-ng]').forEach(function(btn){ btn.addEventListener('click',function(){
      racunForma(btn.closest('.bl-row'), cl[+btn.getAttribute('data-ng')].email, null, 'geslo');
    }); });
    box.querySelectorAll('[data-do]').forEach(function(btn){ btn.addEventListener('click',function(){
      var c=cl[+btn.getAttribute('data-do')];
      if(!confirm('Odstranim dostop za '+c.email+'? Račun ostane, a se v ta salon ne bo več mogel prijaviti.')) return;
      _sbFrom('app_salon_members').delete().eq('salon_id',SALON_ID).eq('user_id',c.user_id).then(function(x){
        nsMsg('dsMsg',x.error?'Napaka: '+x.error.message:'Dostop odstranjen.',!x.error); if(!x.error) izrisiDostope();
      });
    }); });
    document.getElementById('dsDodaj').addEventListener('click',function(){
      var e=nsVal('dsEmail'); if(!e){ nsMsg('dsMsg','Vpišite e-pošto.',false); return; }
      nsMsg('dsMsg','Shranjujem …',true);
      sb.rpc('app_dodaj_clana',{s:SALON_ID,p_email:e,p_vloga:nsVal('dsVloga')}).then(function(x){
        if(x.error||!x.data||!x.data.ok){ nsMsg('dsMsg',(x.error&&x.error.message)||(x.data&&x.data.napaka)||'Ni shranjeno.',false); return; }
        var rz=x.data.rezultat;
        nsMsg('dsMsg',rz==='povezan'?'Dostop dodan.':'Povabilo shranjeno – ko bo račun ustvarjen, se samodejno poveže.',true);
        setTimeout(izrisiDostope,900);
      });
    });
  });
}

/* zaposleni (vloga 'zaposleni') v Nastavitvah vidi samo svoj urnik */
function izrisiMojUrnik(box){
  var urnik=URNIK[MOJ_ZAP]||[], lasten=urnik.length>0;
  box.innerHTML='<div class="obr-form" style="margin-bottom:1rem"><div class="d-edit-hd">Moj urnik – '+esc(zapIme(MOJ_ZAP))+'</div>'
    +'<label style="display:flex;gap:.4rem;align-items:center;margin:.3rem 0"><input type="checkbox" id="muLasten"'+(lasten?' checked':'')+'> lasten urnik (sicer velja delovni čas salona)</label>'
    +'<div id="muUrnik" style="margin-top:.5rem'+(lasten?'':';display:none')+'"></div>'
    +'<p class="bl-svc" style="margin:.5rem 0 0">Dopust in odsotnosti vpišete v koledarju z gumbom »Opravek«.</p>'
    +'<div class="obr-btns"><button class="act save" id="muSave">Shrani urnik</button></div><div class="d-edit-msg" id="muMsg"></div></div>';
  sb.from('delovni_cas').select('dan,teden,nacin,od,do_').then(function(r){
    document.getElementById('muUrnik').innerHTML=urnikVrsticeHtml('muU',lasten?urnik:((r.data)||[]));
  });
  document.getElementById('muLasten').addEventListener('change',function(){ document.getElementById('muUrnik').style.display=this.checked?'':'none'; });
  document.getElementById('muSave').addEventListener('click',function(){
    var l=nsChk('muLasten');
    if(l){ var u=urnikIzObrazca('muU',MOJ_ZAP); if(u.napaka){ nsMsg('muMsg',u.napaka,false); return; } }
    nsMsg('muMsg','Shranjujem …',true);
    shraniUrnik(MOJ_ZAP,l,'muU').then(function(r){
      if(r&&r.error){ nsMsg('muMsg','Napaka: '+r.error.message,false); return; }
      nsMsg('muMsg','Shranjeno.',true); nalozZaposlene();
    });
  });
}

var loginView=document.getElementById('loginView'),appView=document.getElementById('appView');
var calScroll=document.getElementById('calScroll'),nujniList=document.getElementById('nujniList'),miniEl=document.getElementById('mini');

var H0=0,H1=24,HOUR_PX=92,PXMIN=HOUR_PX/60,TOTAL=(H1-H0)*HOUR_PX;
/* Merilo casovnice: 30-minutni termin je visok tocno toliko, kot zasedejo njegove tri vrstice
   (ura, ime, storitev) — izmerjeno s pisavo Poppins: racunalnik 45,8px -> 92 px/uro (30 min = 46px),
   telefon 42,3px -> 86 px/uro (30 min = 43px). Vse ostalo (ure, termini, opravki) se skalira enako. */
function nastaviMerilo(){ HOUR_PX=(window.innerWidth<=820)?86:92; PXMIN=HOUR_PX/60; TOTAL=(H1-H0)*HOUR_PX; }
nastaviMerilo();
var ZACETNA_URA=6, VIDNIH_UR=15;   /* ob odprtju vidno 6:00–21:00, pomik mogoc do polnoci */
var DOW=['PON','TOR','SRE','ČET','PET','SOB','NED'];
var DOWF=['PONEDELJEK','TOREK','SREDA','ČETRTEK','PETEK','SOBOTA','NEDELJA'];
var DNI=['nedelja','ponedeljek','torek','sreda','četrtek','petek','sobota'];
var MES=['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december'];
var mode='day', cur=new Date(); cur.setHours(0,0,0,0);
var miniRef=new Date(cur);
var EDBK=null;
var cache={},blockCache={},SERVICES=[];
var CATMAP={};
var NAMECAT={};
/* Barve kategorij se dodelijo samodejno (po vrstnem redu storitev v tabeli services).
   Kategorija, ki vsebuje besedo "nujni", je vedno rdeca. */
var PALETA=[
  {bg:'#a9cdf2', bd:'#2f5e92'}, {bg:'#aee0a4', bd:'#3c8c3c'}, {bg:'#f6c79a', bd:'#bd6e28'},
  {bg:'#d7a9ec', bd:'#8a3ea6'}, {bg:'#93ddd0', bd:'#22897a'}, {bg:'#ecd86f', bd:'#9c8418'},
  {bg:'#f3b3cd', bd:'#bc3f72'}, {bg:'#b3b8f0', bd:'#4d52a3'}, {bg:'#cfe086', bd:'#73892a'},
  {bg:'#c9d3db', bd:'#5b6f7d'}
];
var BARVA_NUJNI={bg:'#f59b8c', bd:'#cc4030'};
var CAT_COLOR={ '_': {bg:'#dcdde0', bd:'#7d93a1'} };
function dodeliBarveKategorij(storitve){
  var n=0;
  (storitve||[]).forEach(function(s){
    var k=s.category; if(!k || CAT_COLOR.hasOwnProperty(k)) return;
    CAT_COLOR[k]= /nujni/i.test(k) ? BARVA_NUJNI : PALETA[(n++)%PALETA.length];
  });
}
function catColor(b){ return CAT_COLOR[CATMAP[b&&b.service_id]] || CAT_COLOR['_']; }
function kategorijaNujni(){ for(var k in CAT_COLOR){ if(CAT_COLOR.hasOwnProperty(k) && /nujni/i.test(k)) return k; } return null; }
function tokenCat(tok){
  var nm=String(tok).replace(/\s*×\s*\d+\s*$/,'').trim();
  if(NAMECAT[nm]) return NAMECAT[nm];
  for(var name in NAMECAT){ if(NAMECAT.hasOwnProperty(name) && name.length>4 && nm.indexOf(name)===0) return NAMECAT[name]; }
  if(/nujni/i.test(nm)) return kategorijaNujni();
  return null;
}
function catsOf(b){
  var out=[], txt=(b&&b.services_text)?String(b.services_text):'';
  if(txt){ txt.split(' + ').forEach(function(part){
    var c=tokenCat(part);
    if(c && out.indexOf(c)<0) out.push(c);
  }); }
  if(!out.length){ var c2=CATMAP[b&&b.service_id]; if(c2) out.push(c2); }
  return out;
}
function evStyle(b){
  var cats=catsOf(b); if(!cats.length) cats=['_'];
  var cols=cats.map(function(c){return CAT_COLOR[c]||CAT_COLOR['_'];});
  if(cols.length===1) return {bg:cols[0].bg, bd:cols[0].bd};
  var n=Math.min(cols.length,3), st=[];
  for(var i=0;i<n;i++){ st.push(cols[i].bg+' '+Math.round(i*100/n)+'% '+Math.round((i+1)*100/n)+'%'); }
  return {bg:'linear-gradient(135deg,'+st.join(',')+')', bd:cols[0].bd};
}
function stKey(s){ return 'st-'+String(s||'nova').replace(/\s+/g,''); }

function pad(n){return String(n).padStart(2,'0');}
function isoOf(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function isoToday(){return isoOf(new Date());}
function mondayOf(d){var x=new Date(d);var k=(x.getDay()+6)%7;x.setDate(x.getDate()-k);x.setHours(0,0,0,0);return x;}
function addDays(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x;}
function addMonths(d,n){var x=new Date(d);x.setDate(1);x.setMonth(x.getMonth()+n);return x;}
function monthGrid(ref){var first=new Date(ref.getFullYear(),ref.getMonth(),1);var s=mondayOf(first);var a=[];for(var i=0;i<42;i++)a.push(addDays(s,i));return a;}
function compactGrid(ref){var first=new Date(ref.getFullYear(),ref.getMonth(),1);var s=mondayOf(first);var dim=new Date(ref.getFullYear(),ref.getMonth()+1,0).getDate();var last=new Date(ref.getFullYear(),ref.getMonth(),dim);var end=addDays(mondayOf(last),6);var n=Math.round((end-s)/86400000)+1;var a=[];for(var i=0;i<n;i++)a.push(addDays(s,i));return a;}
function toMin(t){t=String(t||'').substring(0,5);var p=t.split(':');return (parseInt(p[0])||0)*60+(parseInt(p[1])||0);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function eur(v){return (parseFloat(v)||0).toFixed(2).replace('.',',')+' €';}
function hm(t){return String(t||'').substring(0,5);}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function isMobile(){return window.innerWidth<=820;}
function prettyDate(iso){if(!iso)return '';var p=iso.split('-');var d=new Date(+p[0],+p[1]-1,+p[2]);return DNI[d.getDay()]+', '+(+p[2])+'. '+MES[+p[1]-1]+' '+p[0];}
var DCAS=null; /* iz tabele delovni_cas: teden (0=vsak,1=lihi,2=sodi) -> dan; null = zasilne vrednosti */
/* Teden A ali B se steje od fiksnega ponedeljka 5.10.2026 – tako se izmenjava
   ne zalomi ob letih s 53 tedni (enako kot v bazi: app_teden_vrsta). */
function tedenVrsta(ds){
  var p=String(ds).split('-');
  var dni=Math.floor((Date.UTC(+p[0],+p[1]-1,+p[2]) - Date.UTC(2026,9,5))/86400000);
  var teden=Math.floor(dni/7);
  return (((teden%2)+2)%2===0) ? 1 : 2;
}
/* Slovenski dela prosti prazniki (datum -> naziv). */
var PRAZNIKI={};
function nalozPraznike(cb){
  sb.from('prazniki').select('datum,naziv').then(function(res){
    if(!res.error && res.data){
      var novi={};
      res.data.forEach(function(r){ novi[r.datum]=r.naziv||'praznik'; });
      PRAZNIKI=novi;
    }
    if(cb) cb();
  });
}
/* x je lahko Date, datum "YYYY-MM-DD" ali (zastarelo) stevilka dneva v tednu */
function dayInfo(x){
  var dow, iso=null;
  if(x instanceof Date){ dow=x.getDay(); iso=isoOf(x); }
  else if(typeof x==='string'){ var p=x.split('-'); dow=new Date(+p[0],+p[1]-1,+p[2]).getDay(); iso=x; }
  else { dow=x; }
  if(iso && PRAZNIKI[iso]) return {closed:true, praznik:PRAZNIKI[iso]};
  if(DCAS){
    if(iso){ var par=tedenVrsta(iso); if(DCAS[par]&&DCAS[par][dow]) return DCAS[par][dow]; }
    if(DCAS[0]&&DCAS[0][dow]) return DCAS[0][dow];
  }
  if(dow===1||dow===3||dow===4)return {h:[14,20]};if(dow===2||dow===5)return {h:[8,15]};if(dow===6)return {arrangement:true};return {closed:true};
}
function nalozDelovniCas(cb){
  sb.from('delovni_cas').select('dan,teden,nacin,od,do_').then(function(res){
    if(!res.error && res.data && res.data.length){
      var m={0:{},1:{},2:{}};
      res.data.forEach(function(r){
        var d=parseInt(r.dan), t=parseInt(r.teden)||0;
        if(r.nacin==='odprto' && r.od && r.do_){
          m[t][d]={h:[parseInt(String(r.od).substring(0,2)), parseInt(String(r.do_).substring(0,2))]};
        } else if(r.nacin==='dogovor'){ m[t][d]={arrangement:true}; }
        else { m[t][d]={closed:true}; }
      });
      DCAS=m;
    }
    if(cb) cb();
  });
}

/* AUTH */
function showApp(s){loginView.classList.add('hidden');appView.classList.remove('hidden');document.getElementById('whoLabel').textContent=s.user.email;
  izberiSalon(s).then(function(ok){ if(!ok) return; nalozZaposlene().then(function(){ nalozPraznike(function(){nalozDelovniCas(function(){buildMini();loadServices(load);});}); }); });}
function showLogin(){appView.classList.add('hidden');loginView.classList.remove('hidden');}
document.getElementById('loginBtn').addEventListener('click',doLogin);
document.getElementById('password').addEventListener('keydown',function(e){if(e.key==='Enter')doLogin();});
function doLogin(){
  var btn=document.getElementById('loginBtn'),msg=document.getElementById('loginMsg');
  var email=document.getElementById('email').value.trim(),pass=document.getElementById('password').value;
  msg.textContent='';msg.className='msg';
  if(!email||!pass){msg.textContent='Vnesi e-pošto in geslo.';msg.className='msg err';return;}
  btn.disabled=true;btn.textContent='Prijavljam …';
  sb.auth.signInWithPassword({email:email,password:pass}).then(function(res){
    btn.disabled=false;btn.textContent='Prijava';
    if(res.error){msg.textContent='Napačna e-pošta ali geslo.';msg.className='msg err';return;}
    showApp(res.data.session);
  });
}
/* odjava: stran se naloži na novo, da od prejšnjega uporabnika ne ostane nič (salon, povezave, zaposleni) */
document.getElementById('logoutBtn').addEventListener('click',function(){sb.auth.signOut().then(function(){ location.href='/admin'; });});

/* GESLO: sprememba (prijavljen) + pozabljeno (ponastavitev) */
var pwdRecovery=false, pwdOverlay=document.getElementById('pwdOverlay');
function openPwd(recovery){
  pwdRecovery=!!recovery;
  document.getElementById('pwdTitle').textContent=recovery?'Nastavi novo geslo':'Spremeni geslo';
  document.getElementById('pwdHint').textContent=recovery?'Vpiši novo geslo za prijavo v administracijo.':'Vpiši novo geslo. Po shranjevanju ostaneš prijavljen/a.';
  document.getElementById('pwdNew').value='';document.getElementById('pwdNew2').value='';
  var m=document.getElementById('pwdMsg');m.textContent='';m.className='msg';
  pwdOverlay.classList.remove('hidden');
  setTimeout(function(){document.getElementById('pwdNew').focus();},50);
}
function closePwd(){pwdOverlay.classList.add('hidden');}
function doPwdSave(){
  var p1=document.getElementById('pwdNew').value,p2=document.getElementById('pwdNew2').value;
  var m=document.getElementById('pwdMsg');m.className='msg';
  if(p1.length<6){m.textContent='Geslo naj ima vsaj 6 znakov.';m.className='msg err';return;}
  if(p1!==p2){m.textContent='Gesli se ne ujemata.';m.className='msg err';return;}
  var btn=document.getElementById('pwdSave');btn.disabled=true;btn.textContent='Shranjujem …';
  sb.auth.updateUser({password:p1}).then(function(res){
    btn.disabled=false;btn.textContent='Shrani geslo';
    if(res.error){m.textContent='Napaka: '+res.error.message;m.className='msg err';return;}
    m.textContent='Geslo je spremenjeno.';m.className='msg ok';
    setTimeout(function(){closePwd();if(pwdRecovery){sb.auth.getSession().then(function(r){if(r.data&&r.data.session)showApp(r.data.session);});}},1200);
  });
}
document.getElementById('pwdBtn').addEventListener('click',function(){openPwd(false);});
document.getElementById('pwdClose').addEventListener('click',closePwd);
pwdOverlay.addEventListener('click',function(e){if(e.target===pwdOverlay)closePwd();});
document.getElementById('pwdSave').addEventListener('click',doPwdSave);
document.getElementById('pwdNew2').addEventListener('keydown',function(e){if(e.key==='Enter')doPwdSave();});
document.getElementById('forgotBtn').addEventListener('click',function(){
  var email=document.getElementById('email').value.trim(), msg=document.getElementById('loginMsg');msg.className='msg';
  if(!email){msg.textContent='Najprej vpiši svojo e-pošto, nato klikni Pozabljeno geslo.';msg.className='msg err';return;}
  sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname}).then(function(res){
    if(res.error){msg.textContent='Napaka: '+res.error.message;msg.className='msg err';return;}
    msg.textContent='Na e-pošto smo poslali povezavo za ponastavitev gesla. Preveri tudi neželeno pošto.';msg.className='msg ok';
  });
});
sb.auth.onAuthStateChange(function(event){ if(event==='PASSWORD_RECOVERY'){ openPwd(true); } });

/* SEGMENT + NAV */
function setSeg(m){document.querySelectorAll('.seg button').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-mode')===m);});}
document.querySelectorAll('.seg button').forEach(function(b){b.addEventListener('click',function(){mode=b.getAttribute('data-mode');setSeg(mode);load();});});
document.getElementById('zapFilter').addEventListener('change',function(){FILTER_Z=this.value;lsSet('admin_zap_'+SALON_ID,FILTER_Z);load();});
document.getElementById('todayBtn').addEventListener('click',function(){cur=new Date();cur.setHours(0,0,0,0);miniRef=new Date(cur);load();});
document.getElementById('prevBtn').addEventListener('click',function(){nav(-1);});
document.getElementById('nextBtn').addEventListener('click',function(){nav(1);});
var SMER=0;            /* smer zadnjega premika: za mehak prehod */
function nav(dir){
  SMER=dir;
  if(mode==='day')cur=addDays(cur,dir);
  else if(mode==='month')cur=addMonths(cur,dir);
  else cur=addDays(cur,dir*7);
  miniRef=new Date(cur);load();
}

/* ── POTEG LEVO/DESNO PO DNEVIH (dotik) ──────────────────────
   Deluje v dnevnem pogledu; tedenski pogled se vodoravno pomika sam. */
(function(){
  var zx=0, zy=0, zt=0, aktiven=false;
  function okno(){ return document.querySelector('.overlay:not(.hidden)'); }
  function pomik(dir){ nav(dir); }
  var cal=document.getElementById('calScroll');
  if(!cal) return;
  cal.addEventListener('touchstart',function(e){
    if(mode!=='day' || e.touches.length!==1 || okno()){ aktiven=false; return; }
    aktiven=true; zx=e.touches[0].clientX; zy=e.touches[0].clientY; zt=Date.now();
  },{passive:true});
  cal.addEventListener('touchend',function(e){
    if(!aktiven) return; aktiven=false;
    var t=e.changedTouches[0];
    var dx=t.clientX-zx, dy=t.clientY-zy, cas=Date.now()-zt;
    if(cas>800) return;                               // prepocasen poteg = ne
    if(Math.abs(dx)<60) return;                       // prekratek poteg
    if(Math.abs(dx)<Math.abs(dy)*1.5) return;         // navpicno drsenje
    pomik(dx<0 ? 1 : -1);                             // poteg levo = naslednji dan
  },{passive:true});

  /* na racunalniku: puscici na tipkovnici */
  document.addEventListener('keydown',function(e){
    if(okno()) return;
    var t=e.target.tagName;
    if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||e.target.isContentEditable) return;
    if(e.key==='ArrowLeft'){ pomik(-1); }
    else if(e.key==='ArrowRight'){ pomik(1); }
  });
})();

/* BLOKADE */
var blockForm=document.getElementById('blockForm');
document.getElementById('blockToggle').addEventListener('click',function(){blockForm.classList.toggle('hidden');if(!blockForm.classList.contains('hidden')){document.getElementById('blkDate').value=isoOf(cur);var bz=document.getElementById('blkZap');if(bz&&!jeZap())bz.value=FILTER_Z||'';}});
function blkZapVal(){ var el=document.getElementById('blkZap'); return el&&el.value?el.value:''; }
document.getElementById('blkCancel').addEventListener('click',function(){blockForm.classList.add('hidden');document.getElementById('blkMsg').textContent='';});
document.getElementById('blkAllDay').addEventListener('click',function(){
  var dEl=document.getElementById('blkDate'); if(!dEl.value)dEl.value=isoOf(cur);
  var date=dEl.value;
  var p=date.split('-'); var wd=new Date(+p[0],+p[1]-1,+p[2]).getDay();
  var zid=blkZapVal(); var info=zid?dayInfoZ(date,zid):dayInfo(date); var h=(info&&info.h)?info.h:[8,20];
  var wStart=h[0]*60, wEnd=h[1]*60;
  var note=document.getElementById('blkNote').value.trim();
  var msg=document.getElementById('blkMsg'); msg.className='msg';
  var btn=this, old=btn.innerHTML; btn.disabled=true; btn.textContent='Računam …';
  Promise.all([
    sb.from('bookings').select('start_time,end_time,status,zaposleni_id').eq('booking_date',date),
    sb.from('blocks').select('start_time,end_time,zaposleni_id').eq('block_date',date)
  ]).then(function(r){
    btn.disabled=false; btn.innerHTML=old;
    if(r[0].error||r[1].error){msg.textContent='Napaka pri branju termina.';msg.className='msg err';return;}
    var busy=[];
    function velja(x){ return !zid||!x.zaposleni_id||x.zaposleni_id===zid; }
    (r[0].data||[]).forEach(function(b){ if(b.status==='preklicano'||!velja(b))return; busy.push([toMin(b.start_time),toMin(b.end_time)]); });
    (r[1].data||[]).forEach(function(b){ if(!velja(b))return; busy.push([toMin(b.start_time),toMin(b.end_time)]); });
    busy.sort(function(a,b){return a[0]-b[0];});
    var merged=[]; busy.forEach(function(iv){ if(merged.length&&iv[0]<=merged[merged.length-1][1]) merged[merged.length-1][1]=Math.max(merged[merged.length-1][1],iv[1]); else merged.push([iv[0],iv[1]]); });
    var free=[], cursor=wStart;
    merged.forEach(function(iv){ var s=Math.max(iv[0],wStart), e=Math.min(iv[1],wEnd); if(e<=wStart||s>=wEnd)return; if(s>cursor)free.push([cursor,s]); cursor=Math.max(cursor,e); });
    if(cursor<wEnd)free.push([cursor,wEnd]);
    free=free.filter(function(iv){return iv[1]-iv[0]>=5;});
    if(!free.length){msg.textContent='Ni prostih ur za zasedbo na ta dan.';msg.className='msg err';return;}
    var rows=free.map(function(iv){return {block_date:date,start_time:pad(Math.floor(iv[0]/60))+':'+pad(iv[0]%60),end_time:pad(Math.floor(iv[1]/60))+':'+pad(iv[1]%60),note:note||'Opravek',zaposleni_id:zid||null};});
    btn.disabled=true; var sBtn=document.getElementById('blkSave'); sBtn.disabled=true;
    sb.from('blocks').insert(rows).then(function(res){
      btn.disabled=false; sBtn.disabled=false;
      if(res.error){msg.textContent='Napaka: '+res.error.message;msg.className='msg err';return;}
      blockForm.classList.add('hidden'); document.getElementById('blkNote').value=''; load();
    });
  });
});
document.getElementById('blkSave').addEventListener('click',function(){
  var date=document.getElementById('blkDate').value,from=document.getElementById('blkFrom').value,to=document.getElementById('blkTo').value,note=document.getElementById('blkNote').value.trim();
  var msg=document.getElementById('blkMsg');msg.className='msg';
  if(!date||!from||!to){msg.textContent='Vnesi datum, začetek in konec.';msg.className='msg err';return;}
  if(to<=from){msg.textContent='Konec mora biti za začetkom.';msg.className='msg err';return;}
  var btn=document.getElementById('blkSave');btn.disabled=true;btn.textContent='Shranjujem …';
  sb.from('blocks').insert([{block_date:date,start_time:from,end_time:to,note:note||null,zaposleni_id:blkZapVal()||null}]).then(function(res){
    btn.disabled=false;btn.textContent='Shrani opravek';
    if(res.error){msg.textContent='Napaka: '+res.error.message;msg.className='msg err';return;}
    document.getElementById('blkFrom').value='';document.getElementById('blkTo').value='';document.getElementById('blkNote').value='';
    blockForm.classList.add('hidden');load();
  });
});

/* MINI KOLEDAR – drseč seznam mesecev */
var MINI_BUILT=false, lastMobile=null;
function miniMonthHTML(ref,withNav){
  var cells=compactGrid(ref),html='<div class="mini"><div class="mini-head">';
  if(withNav)html+='<button class="mini-nav" data-mn="-1">&#8249;</button>';
  html+='<span>'+cap(MES[ref.getMonth()])+' '+ref.getFullYear()+'</span>';
  if(withNav)html+='<button class="mini-nav" data-mn="1">&#8250;</button>';
  html+='</div><div class="mini-grid">';
  ['Po','To','Sr','Če','Pe','So','Ne'].forEach(function(d){html+='<div class="mini-dow">'+d+'</div>';});
  cells.forEach(function(d){
    if(d.getMonth()!==ref.getMonth()){html+='<div class="mini-day empty"></div>';return;}
    var praznik=PRAZNIKI[isoOf(d)];
    var tt=praznik?' title="'+esc(praznik)+'"':'';
    html+='<button class="mini-day'+(isoOf(d)===isoToday()?' today':'')+(praznik?' praznik':'')+'" data-d="'+isoOf(d)+'"'+tt+'>'+d.getDate()+'</button>';
  });
  return html+'</div></div>';
}
var miniDelegated=false;
function ensureMiniDelegation(){
  if(miniDelegated)return;miniDelegated=true;
  miniEl.addEventListener('click',function(e){
    var nav=e.target.closest('.mini-nav');
    if(nav){miniRef=addMonths(miniRef,parseInt(nav.getAttribute('data-mn')));buildMini();return;}
    var day=e.target.closest('.mini-day[data-d]');
    if(day){var p=day.getAttribute('data-d').split('-');cur=new Date(+p[0],+p[1]-1,+p[2]);miniRef=new Date(cur);mode='day';setSeg('day');load();}
  });
}
function adjustSegLabels(){
  var wk=document.querySelector('.seg button[data-mode="week"]'), ww=document.querySelector('.seg button[data-mode="workweek"]');
  if(isMobile()){
    if(wk)wk.style.display='none';
    if(ww){ww.style.display='';ww.textContent='Teden';}
    if(mode==='week'){mode='workweek';setSeg('workweek');}
  } else {
    if(wk){wk.style.display='';wk.textContent='Teden';}
    if(ww){ww.style.display='';ww.textContent='Delovni teden';}
  }
}
function buildMini(){
  ensureMiniDelegation();
  lastMobile=isMobile();
  adjustSegLabels();
  if(lastMobile){
    miniEl.innerHTML=miniMonthHTML(miniRef,true);
  } else {
    var base=new Date(cur.getFullYear(),cur.getMonth(),1);
    var html='';for(var m=0;m<12;m++){html+=miniMonthHTML(addMonths(base,m),false);}
    miniEl.innerHTML=html;
  }
  MINI_BUILT=true; updateMiniSel();
}
window.addEventListener('resize',function(){ syncCalHeight(); if(isMobile()!==lastMobile){buildMini();load();} else syncMiniHeight(); });
var calFit=false;
function syncCalHeight(){
  /* NAMIZNI pogled koledarja (Dan/Teden/Mesec): stran se NE sme drseti kot celota.
     Prej je 12 malih mesecev levo naredilo stran ~3000px visoko — ko se je stran
     podrsala, je koledar odsel navzgor in spodaj je ostala prazna lisa.
     Zdaj: levi stolpec mesecev ima svoj drsnik, koledar pa sega tocno do dna okna.
     TELEFON (<=820px): nic ne spreminjamo — ostane kot prej (CSS calc(100dvh - 185px)). */
  if(!calScroll)return;
  var wrapEl=document.querySelector('#appView .wrap');
  var fit=!isMobile() && !calScroll.classList.contains('hidden') && !appView.classList.contains('hidden');
  if(!fit){
    calScroll.style.height='';
    if(calFit){
      calFit=false;
      if(wrapEl)wrapEl.style.paddingBottom='';
      miniEl.style.maxHeight=''; miniEl.style.overflowY='';
    }
    return;
  }
  calFit=true;
  if(wrapEl)wrapEl.style.paddingBottom='0';
  var rob=18, vh=window.innerHeight, sy=window.pageYOffset||0;
  var mTop=miniEl.getBoundingClientRect().top+sy;
  miniEl.style.maxHeight=Math.max(200,Math.round(vh-mTop-rob))+'px';
  miniEl.style.overflowY='auto';
  if(calScroll.classList.contains('brez-drsnika')){ calScroll.style.height=''; return; }
  var top=calScroll.getBoundingClientRect().top+sy;
  calScroll.style.height=Math.max(300,Math.round(vh-top-rob))+'px';
}
/* ce se orodna vrstica / legenda / obrazec za opravek spremeni po visini
   (npr. pisava se nalozi, gumbi se prelomijo), visino koledarja takoj uskladimo */
if(window.ResizeObserver){
  var calRO=new ResizeObserver(function(){ syncCalHeight(); });
  ['.toolbar','#catLegend','#blockForm','header'].forEach(function(s){ var e=document.querySelector('#appView '+s)||document.querySelector(s); if(e)calRO.observe(e); });
}
function updateMiniSel(){
  if(!MINI_BUILT)return;
  var prev=miniEl.querySelector('.mini-day.sel'); if(prev)prev.classList.remove('sel');
  var el=miniEl.querySelector('.mini-day[data-d="'+isoOf(cur)+'"]'); if(el)el.classList.add('sel');
}
function syncMiniHeight(){
  if(!MINI_BUILT)return;
  if(window.innerWidth<=820){ miniEl.style.height=''; miniEl.style.maxHeight=''; miniEl.style.overflow='visible'; miniEl.querySelectorAll('.mini').forEach(function(m){m.style.minHeight='';}); return; }
  miniEl.style.height='';
  miniEl.querySelectorAll('.mini').forEach(function(m){m.style.minHeight='';});
  syncCalHeight();
}
function resetMiniHeight(){ miniEl.style.height=''; miniEl.style.maxHeight=''; miniEl.style.overflow='visible'; miniEl.querySelectorAll('.mini').forEach(function(m){m.style.minHeight='';}); syncCalHeight(); }

/* NALAGANJE */
function daysForMode(){
  if(mode==='day')return [new Date(cur)];
  var mon=mondayOf(cur);
  if(mode==='workweek')return [0,1,2,3,4].map(function(i){return addDays(mon,i);}); // pon–pet
  return [0,1,2,3,4,5,6].map(function(i){return addDays(mon,i);});
}
function rangeText(days){
  if(mode==='day'){var d=days[0];return cap(DNI[d.getDay()])+', '+d.getDate()+'. '+MES[d.getMonth()]+' '+d.getFullYear();}
  if(mode==='month')return cap(MES[cur.getMonth()])+' '+cur.getFullYear();
  var a=days[0],b=days[days.length-1];return a.getDate()+'. '+MES[a.getMonth()].substring(0,3)+' – '+b.getDate()+'. '+MES[b.getMonth()].substring(0,3)+' '+b.getFullYear();
}
function load(){
  nastaviMerilo();
  var lg=document.getElementById('catLegend'); if(lg)lg.style.display=(mode==='stranke'||mode==='blagajna'||mode==='nastavitve')?'none':'flex';
  if(isMobile()&&MINI_BUILT){buildMini();}else{updateMiniSel();}
  if(mode==='nujni'){loadNujni();return;}
  if(mode==='stranke'){loadStranke();return;}
  if(mode==='blagajna'){loadBlagajna();return;}
  if(mode==='nastavitve'){loadNastavitve();return;}
  if(mode==='month'){loadMonth();return;}
  calScroll.classList.remove('hidden');nujniList.classList.add('hidden');document.getElementById('strankeView').classList.add('hidden');skrijBlagajno();
  var days=daysForMode();
  document.getElementById('rangeLabel').textContent=rangeText(days);
  var fromISO=isoOf(days[0]),toISO=isoOf(days[days.length-1]);
  /* ohrani navpicni polozaj in staro vsebino, dokler ne pridejo novi podatki,
     da koledar ne skoci na vrh ob vsaki menjavi dneva */
  var jeIzrisan = !!calScroll.querySelector('.cal');
  var ohraniY = jeIzrisan ? calScroll.scrollTop : ZACETNA_URA*HOUR_PX;
  if(!jeIzrisan) calScroll.innerHTML='<div class="empty">Nalagam …</div>';
  else calScroll.classList.add('osvezujem');
  calScroll.classList.remove('brez-drsnika');
  syncCalHeight();
  Promise.all([
    sb.from('bookings').select('*').gte('booking_date',fromISO).lte('booking_date',toISO),
    sb.from('blocks').select('*').gte('block_date',fromISO).lte('block_date',toISO)
  ]).then(function(r){
    if(r[0].error){calScroll.innerHTML='<div class="empty">Napaka: '+esc(r[0].error.message)+'<br><small>Preveri pravice (RLS).</small></div>';return;}
    renderCal(days,r[0].data||[],(r[1]&&!r[1].error)?(r[1].data||[]):[]);
    calScroll.classList.remove('osvezujem');
    calScroll.scrollTop = ohraniY;        /* ostani na isti visini kot prej */
  });
}
function loadMonth(){
  calScroll.classList.add('brez-drsnika');      /* mesecni koledar je fiksen */
  calScroll.classList.remove('hidden');nujniList.classList.add('hidden');document.getElementById('strankeView').classList.add('hidden');skrijBlagajno();
  document.getElementById('rangeLabel').textContent=rangeText();
  var cells=monthGrid(cur);
  calScroll.innerHTML='<div class="empty">Nalagam …</div>';
  syncCalHeight();
  sb.from('bookings').select('booking_date,status,service_id,services_text,zaposleni_id').gte('booking_date',isoOf(cells[0])).lte('booking_date',isoOf(cells[41])).then(function(res){
    var counts={},dcats={};
    if(!res.error)(res.data||[]).forEach(function(b){if(b.status!=='preklicano'&&(!FILTER_Z||!b.zaposleni_id||b.zaposleni_id===FILTER_Z)){
      counts[b.booking_date]=(counts[b.booking_date]||0)+1;
      var cs=catsOf(b); if(!cs.length)cs=['_'];
      cs.forEach(function(c){(dcats[b.booking_date]=dcats[b.booking_date]||[]).push((CAT_COLOR[c]||CAT_COLOR['_']).bd);});
    }});
    renderMonth(cells,counts,dcats);
  });
}
function loadNujni(){
  calScroll.classList.add('hidden');nujniList.classList.remove('hidden');document.getElementById('strankeView').classList.add('hidden');skrijBlagajno();resetMiniHeight();
  document.getElementById('rangeLabel').textContent='Nujni / po dogovoru';
  nujniList.innerHTML='<div class="empty">Nalagam …</div>';
  sb.from('bookings').select('*').is('booking_date',null).order('id',{ascending:false}).then(function(res){
    if(res.error){nujniList.innerHTML='<div class="empty">Napaka: '+esc(res.error.message)+'</div>';return;}
    var rows=res.data||[];cache={};
    if(!rows.length){nujniList.innerHTML='<div class="empty">Ni nujnih rezervacij.</div>';return;}
    nujniList.innerHTML=rows.map(function(b){cache[b.id]=b;return ''
      +'<div class="card" style="border-left:5px solid '+catColor(b).bd+'"><div class="body"><div class="svc">'+esc(b.services_text||b.service_name||'—')+'</div>'
      +'<div class="meta">'+esc(b.customer_name||'—')+(b.customer_phone?(' · <a href="tel:'+esc(b.customer_phone)+'">'+esc(b.customer_phone)+'</a>'):'')+(b.customer_email?('<br>'+esc(b.customer_email)):'')+'</div>'
      +(b.note?('<div class="meta" style="font-style:italic">'+esc(b.note)+'</div>'):'')+'</div>'
      +'<div class="side2"><div class="price">'+eur(b.total_price)+'</div>'+badge(b.status)+'<button class="act" data-open="'+b.id+'">Podrobnosti</button></div></div>';
    }).join('');
    nujniList.querySelectorAll('[data-open]').forEach(function(x){x.addEventListener('click',function(){openDetail(cache[x.getAttribute('data-open')]);});});
  });
}

/* STRANKE */
var CUSTOMERS=[];
function obiski(n){var d=n%10,dd=n%100;if(dd>=11&&dd<=14)return n+' obiskov';if(d===1)return n+' obisk';if(d===2)return n+' obiska';if(d===3||d===4)return n+' obiski';return n+' obiskov';}
function prettyShort(iso){if(!iso)return '';var p=iso.split('-');return (+p[2])+'. '+MES[+p[1]-1].substring(0,3)+' '+p[0];}
function buildCustomers(rows){
  var map={};
  rows.forEach(function(b){
    var ph=telKljuc(b.customer_phone);   /* zadnjih 8 stevk: 040 123 456 = +386 40 123 456 */
    var key=ph||('n:'+(b.customer_name||'').toLowerCase().trim());
    if(!key||key==='n:')return;
    if(!map[key])map[key]={key:key,name:b.customer_name||'',phone:b.customer_phone||'',email:b.customer_email||'',bookings:[]};
    var c=map[key];
    if(b.customer_name)c.name=b.customer_name;
    if(b.customer_phone)c.phone=b.customer_phone;
    if(b.customer_email)c.email=b.customer_email;
    c.bookings.push(b);
  });
  var arr=Object.keys(map).map(function(k){return map[k];});
  arr.forEach(function(c){
    c.bookings.sort(function(a,b){return (b.booking_date||'').localeCompare(a.booking_date||'')||(b.start_time||'').localeCompare(a.start_time||'');});
    c.visits=c.bookings.length; c.last=c.bookings.length?c.bookings[0].booking_date:null;
  });
  arr.sort(function(a,b){return (b.last||'').localeCompare(a.last||'');});
  return arr;
}
function loadCustomersThen(cb){
  var q1=sb.from('bookings').select('id,customer_name,customer_phone,customer_email,booking_date,start_time,end_time,total_duration_min,services_text,service_name,total_price,status,note,gap_after_min,gap_duration_min,vir,created_at').order('booking_date',{ascending:false,nullsFirst:false});
  var q2=sb.from('stranke').select('id,ime,telefon,email,opomba,vir,created_at');
  Promise.all([q1,q2]).then(function(r){
    VIR_VRSTICE=r[0].error?[]:(r[0].data||[]);
    CUSTOMERS=r[0].error?[]:buildCustomers(r[0].data||[]);
    if(!r[1].error) mergeStranke(r[1].data||[]);
    if(cb)cb();
  });
}
/* Uvozene/rocno dodane stranke zdruzi s strankami iz rezervacij (po telefonu, sicer po imenu) */
function telKljuc(t){var d=String(t||'').replace(/\D/g,'');return d.length>=8?d.slice(-8):'';}
/* Ista oseba, ce so vse besede krajsega imena vsebovane v daljsem ("Aleksandra" ~ "Brezev Aleksandra").
   "Neza Obradovic" in "Nina Obradovic" (druzina z isto stevilko) sta razlicni osebi. */
function besedeImena(t){return String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z]+/).filter(function(w){return w.length>=2;});}
function isteOsebe(a,b){var A=besedeImena(a),B=besedeImena(b);if(!A.length||!B.length)return true;
  return A.every(function(w){return B.indexOf(w)>=0;})||B.every(function(w){return A.indexOf(w)>=0;});}
function mergeStranke(rows){
  var poTel={},poIme={};
  CUSTOMERS.forEach(function(c){var k=telKljuc(c.phone);if(k)poTel[k]=c;poIme[(c.name||'').toLowerCase().trim()]=c;});
  rows.forEach(function(r){
    var k=telKljuc(r.telefon), ime=(r.ime||'').toLowerCase().trim();
    var c=null;
    if(k&&poTel[k]&&isteOsebe(poTel[k].name,r.ime)) c=poTel[k];   /* ista stevilka + zdruzljivo ime */
    else if(!k&&poIme[ime]) c=poIme[ime];
    if(c){ if(!c.email&&r.email)c.email=r.email; if(r.opomba)c.opomba=r.opomba; c.strankaId=r.id; return; }
    c={key:k||('n:'+ime),name:r.ime||'',phone:r.telefon||'',email:r.email||'',opomba:r.opomba||'',bookings:[],visits:0,last:null,uvozena:true,strankaId:r.id};
    CUSTOMERS.push(c); if(k&&!poTel[k])poTel[k]=c; poIme[ime]=c;
  });
}

/* ── UVOZ / IZVOZ STRANK (Excel) ──────────────────────────────── */
var XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
function naloziXlsx(cb){
  if(window.XLSX)return cb();
  var sc=document.createElement('script'); sc.src=XLSX_URL;
  sc.onload=function(){cb();};
  sc.onerror=function(){alert('Knjižnice za Excel ni bilo mogoče naložiti. Preverite internetno povezavo.');};
  document.head.appendChild(sc);
}
function brezSum(t){return String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
var UV_NI_OSEBA=['mosko','zensko','otrok','otroci','test','stranka','neznano','opravek'];
/* "IRENA DEBELJAK" / "kos jernej" -> "Irena Debeljak" / "Kos Jernej"; mesana imena ostanejo */
function lepoIme(t){
  t=String(t||'').replace(/\s+/g,' ').trim();
  /* vsaka beseda posebej: "čelan" -> "Čelan", "POTOČNIK" -> "Potočnik"; kratice (S.P., RD) ostanejo */
  return t.split(' ').map(function(w){
    return w.split('-').map(function(d){
      var crke=d.replace(/[^A-Za-zČŠŽĆĐčšžćđ]/g,'');
      if(crke.length>=3&&d===d.toUpperCase()) d=d.toLowerCase();
      return d.charAt(0).toUpperCase()+d.slice(1);
    }).join('-');
  }).join(' ');
}
/* Excel "poje" vodilno niclo, stevilko zapise kot 3,86E+11, tuje stevilke brez "+" */
function popraviTel(t){
  var s=String(t||'').trim(); if(!s)return '';
  if(/e\+/i.test(s)) return null;
  var d=s.replace(/[^\d+]/g,'');
  if(!d.replace(/\+/g,'')||/^0+$/.test(d)) return '';
  if(/^\d{8}$/.test(d)) return '0'+d;
  if(/^00\d{10,13}$/.test(d)) return '+'+d.slice(2);
  if(/^\d{11,13}$/.test(d)&&d.charAt(0)!=='0') return '+'+d;
  return s.replace(/\s+/g,' ');
}
function uvozStolpci(glava){
  var m={ime:-1,priimek:-1,telefon:-1,email:-1,opomba:-1};
  glava.forEach(function(h,i){
    var t=brezSum(h); if(!t)return;
    if(m.email<0&&/(e-?mail|e-?posta|^mail)/.test(t)) m.email=i;
    else if(m.telefon<0&&/(tel|gsm|mobi|phone|stevilka|kontakt)/.test(t)) m.telefon=i;
    else if(m.priimek<0&&/(priimek|surname|last ?name)/.test(t)&&!/\bime\b/.test(t)) m.priimek=i;
    else if(m.ime<0&&/(ime|name|stranka|naziv)/.test(t)) m.ime=i;
    else if(m.opomba<0&&/(opomb|note|komentar|posebnost)/.test(t)) m.opomba=i;
  });
  return m;
}
/* jedro: iz vrstic tabele naredi seznam novih strank (brez DOM) */
function uvozPripravi(vrst,obstojece){
  vrst=vrst.filter(function(r){return r.some(function(c){return String(c==null?'':c).trim()!=='';});});
  var hi=-1,m=null;
  for(var i=0;i<Math.min(5,vrst.length);i++){var mm=uvozStolpci(vrst[i]);if(mm.ime>=0||mm.telefon>=0){hi=i;m=mm;break;}}
  var brezGlave=hi<0; if(brezGlave)m={ime:0,priimek:-1,telefon:1,email:2,opomba:3};
  var oTel={},oIme={},oMail={};
  obstojece.forEach(function(c){var k=telKljuc(c.phone);if(k)(oTel[k]=oTel[k]||[]).push(c);oIme[brezSum(c.name)]=c;if(c.email)oMail[String(c.email).toLowerCase()]=c;});
  var novi=[],podv=[],napake=[],dopolni=[],slabEmail=0,dTel={},dIme={};
  vrst.slice(hi+1).forEach(function(r,idx){
    var g=function(j){return j>=0?String(r[j]==null?'':r[j]).trim():'';};
    var ime=g(m.ime); if(m.priimek>=0&&g(m.priimek)) ime=(ime+' '+g(m.priimek)).trim();
    ime=lepoIme(ime);
    var tel=popraviTel(g(m.telefon)), em=g(m.email), op=g(m.opomba), vr=idx+hi+2, bi=brezSum(ime);
    if(tel===null){napake.push({v:vr,ime:ime,razlog:'telefon zapisan kot število (npr. 3,86E+11) – stolpec nastavite na »Besedilo«'});return;}
    if(!ime){napake.push({v:vr,ime:tel||em||'(prazno)',razlog:'manjka ime'});return;}
    if(UV_NI_OSEBA.indexOf(bi)>=0||bi.replace(/[^a-z]/g,'').length<2){napake.push({v:vr,ime:ime,razlog:'ni ime osebe'});return;}
    if(em&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){em='';slabEmail++;}
    if(!tel&&!em){napake.push({v:vr,ime:ime,razlog:'ni telefona ne e-pošte (verjetno opomnik, ne stranka)'});return;}
    var k=telKljuc(tel), ob=null;
    if(k&&oTel[k]) ob=oTel[k].filter(function(c){return isteOsebe(c.name,ime);})[0]||null;
    else if(!k) ob=(em&&oMail[em.toLowerCase()])||oIme[bi]||null;
    if(ob){ if(em&&!ob.email&&ob.strankaId) dopolni.push({id:ob.strankaId,email:em,ime:ob.name}); podv.push({ime:ime,tel:tel}); return; }
    var d=null;
    if(k&&dTel[k]) d=dTel[k].filter(function(x){return isteOsebe(x.ime,ime);})[0]||null;
    else if(!k) d=dIme[bi]||null;
    if(d){
      if(besedeImena(ime).length>besedeImena(d.ime).length) d.ime=ime;
      if(!d.email&&em)d.email=em; if(!d.opomba&&op)d.opomba=op;
      podv.push({ime:ime,tel:tel,vDatoteki:true}); return;
    }
    var z={ime:ime,telefon:tel||null,email:em||null,opomba:op||null,vir:'uvoz'};
    novi.push(z); if(k)(dTel[k]=dTel[k]||[]).push(z); else dIme[bi]=z;
  });
  return {novi:novi,podv:podv,napake:napake,dopolni:dopolni,slabEmail:slabEmail,m:m,brezGlave:brezGlave};
}

/* ── okno ── */
function openUvozIzvoz(){
  var ov=document.getElementById('uvozOverlay'); if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='uvozOverlay'; ov.className='overlay';
  ov.innerHTML='<div class="pop uvoz-pop">'
   +'<div class="ui-top"><h3 style="margin:0">Stranke – uvoz in izvoz</h3><button type="button" class="ui-x" id="uiZapri" aria-label="Zapri">✕</button></div>'
   +'<div class="ui-grid">'
   +'<div class="ui-card"><div class="ui-ico">⬇</div><b>Izvoz v Excel</b><p class="uvoz-sub">Vse stranke ('+CUSTOMERS.length+') v eni tabeli – za varnostno kopijo ali urejanje. Datoteko lahko pozneje uvozite nazaj.</p><button type="button" class="btn uvoz-potrdi" id="uiIzvozi">Izvozi v Excel</button></div>'
   +'<div class="ui-card"><div class="ui-ico">⬆</div><b>Uvoz iz Excela</b><p class="uvoz-sub">Datoteka .xlsx, .xls ali .csv. Pred shranjevanjem boste videli predogled. Obstoječe stranke se ne podvojijo.</p><button type="button" class="btn uvoz-btn" id="uiIzberi">Izberi datoteko</button><input type="file" id="uvozFile" accept=".xlsx,.xls,.csv" hidden></div>'
   +'</div>'
   +'<p class="uvoz-sub" style="margin-top:.8rem">🔒 Datoteka vsebuje osebne podatke strank. Hranite jo varno in je ne pošiljajte naprej. V opombe ne vpisujte zdravstvenih podatkov.</p>'
   +'<div id="uvozVsebina"></div></div>';
  document.body.appendChild(ov);
  document.getElementById('uiZapri').onclick=function(){ov.remove();};
  document.getElementById('uiIzvozi').onclick=izvoziStranke;
  document.getElementById('uiIzberi').onclick=function(){document.getElementById('uvozFile').click();};
  document.getElementById('uvozFile').addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];e.target.value='';if(f)uvozBeri(f);});
}
function izvoziStranke(){
  var btn=document.getElementById('uiIzvozi'); if(btn){btn.disabled=true;btn.textContent='Pripravljam …';}
  naloziXlsx(function(){ loadCustomersThen(function(){
    var rows=CUSTOMERS.slice().sort(function(a,b){return (a.name||'').localeCompare(b.name||'','sl');}).map(function(c){
      return {'Ime in priimek':c.name||'','Telefon':c.phone||'','E-pošta':c.email||'','Opomba':c.opomba||'',
              'Število obiskov':c.visits||0,'Zadnji obisk':c.last?String(c.last).split('-').reverse().join('.'):'',
              'Vir':c.uvozena?'uvoz':'rezervacije'};
    });
    var ws=XLSX.utils.json_to_sheet(rows,{header:['Ime in priimek','Telefon','E-pošta','Opomba','Število obiskov','Zadnji obisk','Vir']});
    ws['!cols']=[{wch:28},{wch:15},{wch:32},{wch:30},{wch:15},{wch:13},{wch:12}];
    var wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Stranke');
    var d=new Date(); XLSX.writeFile(wb,'Stranke_'+(APP.kratko||'')+'_'+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'.xlsx');
    if(btn){btn.disabled=false;btn.textContent='Izvozi v Excel';}
  });});
}
function uvozBeri(file){
  var box=document.getElementById('uvozVsebina'); if(box)box.innerHTML='<p class="uvoz-sub">Berem datoteko …</p>';
  naloziXlsx(function(){
    var fr=new FileReader();
    fr.onload=function(){
      try{
        var wb=XLSX.read(new Uint8Array(fr.result),{type:'array'});
        var vrst=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
        if(!vrst.length){box.innerHTML='<p class="uvoz-sub">Datoteka je prazna.</p>';return;}
        loadCustomersThen(function(){ uvozPredogled(uvozPripravi(vrst,CUSTOMERS),file.name); });
      }catch(err){ box.innerHTML='<p class="uvoz-sub">Datoteke ni bilo mogoče prebrati: '+esc(err.message)+'</p>'; }
    };
    fr.readAsArrayBuffer(file);
  });
}
function uvozPredogled(R,datoteka){
  var box=document.getElementById('uvozVsebina'); if(!box)return;
  var st=function(i){return i>=0?String.fromCharCode(65+i):'—';}, m=R.m;
  var h='<div class="ui-pred"><b>'+esc(datoteka)+'</b>';
  h+='<div class="uvoz-stat"><div><b>'+R.novi.length+'</b><span>novih</span></div><div><b>'+R.podv.length+'</b><span>že obstaja</span></div><div><b>'+R.napake.length+'</b><span>izpuščenih</span></div></div>';
  h+='<p class="uvoz-sub">'+(R.brezGlave?'Naslovne vrstice nisem prepoznal – predvidevam: A ime, B telefon, C e-pošta, D opomba.'
     :'Prepoznani stolpci: ime '+st(m.ime)+(m.priimek>=0?(' + priimek '+st(m.priimek)):'')+', telefon '+st(m.telefon)+', e-pošta '+st(m.email)+', opomba '+st(m.opomba)+'.')+'</p>';
  if(R.dopolni.length) h+='<p class="uvoz-sub">Obstoječim strankam bom dopolnil manjkajoči e-naslov: '+R.dopolni.length+'.</p>';
  if(R.slabEmail) h+='<p class="uvoz-sub">Neveljavnih e-naslovov, ki jih ne bom uvozil: '+R.slabEmail+'.</p>';
  if(m.opomba>=0) h+='<p class="uvoz-sub" style="color:#8a5a00">⚠ Datoteka ima stolpec z opombami. Preverite, da ne vsebuje zdravstvenih podatkov (alergije, bolezni).</p>';
  if(R.novi.length){
    h+='<div class="uvoz-tw"><table class="uvoz-tab"><tr><th>Ime</th><th>Telefon</th><th>E-pošta</th></tr>';
    R.novi.slice(0,8).forEach(function(r){h+='<tr><td>'+esc(r.ime)+'</td><td>'+esc(r.telefon||'')+'</td><td>'+esc(r.email||'')+'</td></tr>';});
    h+='</table></div>'+(R.novi.length>8?'<p class="uvoz-sub">… in še '+(R.novi.length-8)+'.</p>':'');
  }
  if(R.napake.length){h+='<details class="uvoz-det"><summary>Izpuščene vrstice ('+R.napake.length+')</summary>';R.napake.slice(0,60).forEach(function(e){h+='<div>vrstica '+e.v+': '+esc(e.ime)+' – '+esc(e.razlog)+'</div>';});h+='</details>';}
  if(R.podv.length){h+='<details class="uvoz-det"><summary>Že obstajajo ali podvojene ('+R.podv.length+')</summary>';R.podv.slice(0,60).forEach(function(e){h+='<div>'+esc(e.ime)+(e.tel?(' · '+esc(e.tel)):'')+(e.vDatoteki?' – podvojena v datoteki':'')+'</div>';});h+='</details>';}
  var nic=!R.novi.length&&!R.dopolni.length;
  h+='<div id="uvozMsg" class="uvoz-sub"></div><div class="uvoz-btns">'
   +(nic?'<span class="uvoz-sub">Ni novih podatkov za uvoz.</span>':'<button type="button" class="btn uvoz-potrdi" id="uvozPotrdi">Uvozi '+R.novi.length+' strank</button>')+'</div></div>';
  box.innerHTML=h;
  var p=document.getElementById('uvozPotrdi'); if(p)p.onclick=function(){uvozShrani(R,p);};
}
function uvozShrani(R,btn){
  btn.disabled=true; var msg=document.getElementById('uvozMsg'), i=0, ok=0, KOS=200, novi=R.novi;
  function konec(t){ msg.textContent=t; loadStranke(); }
  function dopolniEmail(j){
    if(j>=R.dopolni.length){ btn.textContent='Končano ✓'; konec('Uvoženih strank: '+ok+(R.dopolni.length?(', dopolnjenih e-naslovov: '+R.dopolni.length):'')+'.'); return; }
    sb.from('stranke').update({email:R.dopolni[j].email}).eq('id',R.dopolni[j].id).then(function(){dopolniEmail(j+1);});
  }
  (function naslednji(){
    if(i>=novi.length){ dopolniEmail(0); return; }
    var kos=novi.slice(i,i+KOS); btn.textContent='Uvažam … '+Math.min(i+KOS,novi.length)+'/'+novi.length;
    sb.from('stranke').insert(kos).then(function(res){
      if(res.error){ btn.textContent='Prekinjeno'; konec('Napaka: '+res.error.message+'. Uvoženih: '+ok+'. Datoteko uvozite znova – že uvožene bodo preskočene.'); return; }
      ok+=kos.length; i+=KOS; naslednji();
    });
  })();
}

function skrijBlagajno(){["blagajnaView","nastavitveView"].forEach(function(id){var b=document.getElementById(id);if(b)b.classList.add("hidden");});}
/* ── BLAGAJNA: obracun opravljenih storitev ───────────────────── */
var NACINI=[['gotovina','💶 Gotovina'],['kartica','💳 Kartica'],['nakazilo','🏦 Nakazilo']];
function nacinIme(n){for(var i=0;i<NACINI.length;i++){if(NACINI[i][0]===n)return NACINI[i][1];}return n;}
function stevilo(v){var n=parseFloat(String(v==null?'':v).replace(',','.'));return isNaN(n)?0:n;}

/* ── KOŠARICA (postavke obračuna) ─────────────────────────────── */
var ARTIKLI=[], KOS={postavke:[],popust:0,popustVrsta:'eur',nacin:'gotovina',opomba:''};
function loadArtikli(cb){
  sb.from('artikli').select('id,naziv,cena').eq('aktiven',true).order('naziv').then(function(r){
    ARTIKLI=r.error?[]:(r.data||[]); if(cb)cb();
  });
}
/* iz rezervacije naredi zacetne postavke (z mozniostjo popravka) */
function kosIzTermina(b){
  var out=[], txt=b.services_text||b.service_name||'';
  txt.split(' + ').forEach(function(tok){
    tok=String(tok).trim(); if(!tok)return;
    var kol=1, m=tok.match(/\s*[×x]\s*(\d+)\s*$/);
    if(m){ kol=parseInt(m[1])||1; tok=tok.replace(/\s*[×x]\s*\d+\s*$/,'').trim(); }
    var s=SERVICES.filter(function(x){return (x.name||'').toLowerCase()===tok.toLowerCase();})[0];
    out.push({vrsta:s?'storitev':'rocno', naziv:s?s.name:tok, cena:s?stevilo(s.price):0, kol:kol});
  });
  if(!out.length) out.push({vrsta:'rocno', naziv:'Storitev', cena:stevilo(b.total_price), kol:1});
  /* ce kaksne storitve ni vec v ceniku, ji dodeli preostanek do cene iz rezervacije */
  var neznane=out.filter(function(r){return r.vrsta==='rocno'&&!stevilo(r.cena);});
  if(neznane.length){
    var znano=out.reduce(function(a,r){return a+stevilo(r.cena)*(parseInt(r.kol)||1);},0);
    var ostanek=stevilo(b.total_price)-znano;
    if(ostanek>0) neznane[0].cena=Math.round((ostanek/(parseInt(neznane[0].kol)||1))*100)/100;
  }
  return out;
}
function kosVsota(){ return KOS.postavke.reduce(function(a,r){return a+stevilo(r.cena)*(parseInt(r.kol)||1);},0); }
function kosPopustPct(){ var v=stevilo(KOS.popust); if(v<0)v=0; return v>100?100:v; }
function kosPopustEur(){
  var vsota=kosVsota(), v=stevilo(KOS.popust); if(v<=0)return 0;
  if(KOS.popustVrsta==='pct') v=Math.round(vsota*kosPopustPct())/100;
  return v>vsota?vsota:v;   /* popust nikoli vecji od vrednosti racuna */
}
function kosZnesek(){ var z=kosVsota()-kosPopustEur(); return z<0?0:z; }
function kosOpombaShrani(){
  var o=(KOS.opomba||'').trim();
  if(KOS.popustVrsta==='pct'&&kosPopustPct()>0) o=(o?(o+' · '):'')+'popust '+kosPopustPct()+' %';
  return o||null;
}
function kosOpis(){ return KOS.postavke.map(function(r){return r.naziv+((parseInt(r.kol)||1)>1?(' ×'+r.kol):'');}).join(' + '); }

function kosRisi(){
  var box=document.getElementById('kosBox'); if(!box)return;
  var h='<div class="kos-list">';
  if(!KOS.postavke.length) h+='<div class="kos-prazno">Košarica je prazna – dodajte storitev ali izdelek.</div>';
  KOS.postavke.forEach(function(r,i){
    h+='<div class="kos-row"><span class="kos-nz">'+esc(r.naziv)+(r.vrsta==='artikel'?' <i>izdelek</i>':'')+'</span>'
      +'<input class="kos-kol" type="number" min="1" max="99" value="'+(parseInt(r.kol)||1)+'" data-i="'+i+'">'
      +'<input class="kos-cena" type="text" value="'+stevilo(r.cena).toFixed(2)+'" data-i="'+i+'">'
      +'<span class="kos-vs">'+eur(stevilo(r.cena)*(parseInt(r.kol)||1))+'</span>'
      +'<button class="kos-x" data-i="'+i+'" title="Odstrani">✕</button></div>';
  });
  h+='</div><button type="button" class="kos-add" id="kosAdd">+ Dodaj storitev ali izdelek</button><div id="kosPick"></div>';
  h+='<div class="obr-row" style="margin-top:.6rem"><label>Popust<span class="kos-pop">'
    +'<input type="text" id="kosPopust" value="'+stevilo(KOS.popust)+'">'
    +'<button type="button" class="kos-pv'+(KOS.popustVrsta==='eur'?' on':'')+'" data-v="eur">€</button>'
    +'<button type="button" class="kos-pv'+(KOS.popustVrsta==='pct'?' on':'')+'" data-v="pct">%</button></span></label>'
    +'<label>Opomba<input type="text" id="kosOpomba" value="'+esc(KOS.opomba||'')+'" placeholder="neobvezno"></label></div>'
    +'<div class="obr-nacin" id="kosNacin">'+NACINI.map(function(n){return '<button type="button" data-n="'+n[0]+'"'+(KOS.nacin===n[0]?' class="on"':'')+'>'+n[1]+'</button>';}).join('')+'</div>'
    +'<div class="obr-total">Skupaj '+eur(kosVsota())
      +(kosPopustEur()>0?(' − popust '+eur(kosPopustEur())+(KOS.popustVrsta==='pct'?(' ('+kosPopustPct()+' %)'):'')):'')
      +' · za plačilo <b>'+eur(kosZnesek())+'</b></div>';
  box.innerHTML=h;

  box.querySelectorAll('.kos-kol').forEach(function(el){el.addEventListener('input',function(){
    KOS.postavke[+el.getAttribute('data-i')].kol=Math.max(1,parseInt(el.value)||1); kosRisi();});});
  box.querySelectorAll('.kos-cena').forEach(function(el){el.addEventListener('change',function(){
    KOS.postavke[+el.getAttribute('data-i')].cena=stevilo(el.value); kosRisi();});});
  box.querySelectorAll('.kos-x').forEach(function(el){el.addEventListener('click',function(){
    KOS.postavke.splice(+el.getAttribute('data-i'),1); kosRisi();});});
  document.getElementById('kosAdd').addEventListener('click',kosIzbirnik);
  document.getElementById('kosPopust').addEventListener('change',function(){KOS.popust=stevilo(this.value);kosRisi();});
  box.querySelectorAll('.kos-pv').forEach(function(btn){btn.addEventListener('click',function(){
    KOS.popustVrsta=btn.getAttribute('data-v'); kosRisi();});});
  document.getElementById('kosOpomba').addEventListener('input',function(){KOS.opomba=this.value;});
  box.querySelectorAll('#kosNacin button').forEach(function(btn){btn.addEventListener('click',function(){
    KOS.nacin=btn.getAttribute('data-n');
    box.querySelectorAll('#kosNacin button').forEach(function(x){x.classList.toggle('on',x===btn);});});});
}
function kosIzbirnik(){
  var p=document.getElementById('kosPick'); if(!p)return;
  if(p.innerHTML){p.innerHTML='';return;}
  p.innerHTML='<div class="kos-pick"><input type="text" id="kosIsci" placeholder="Išči storitev ali izdelek …" autocomplete="off">'
    +'<div class="kos-rez" id="kosRez"></div>'
    +'<div class="kos-rocno"><input type="text" id="kosRNaziv" placeholder="Ročni vnos – naziv"><input type="text" id="kosRCena" placeholder="cena"><button type="button" id="kosRDodaj">Dodaj</button></div>'
    +'<div class="kos-novart"><input type="text" id="kosANaziv" placeholder="Nov izdelek – naziv"><input type="text" id="kosACena" placeholder="cena"><button type="button" id="kosADodaj">Shrani med izdelke za prodajo</button><span id="kosAMsg"></span></div></div>';
  function rezultati(){
    var q=brezSum(document.getElementById('kosIsci').value);
    var sez=[];
    SERVICES.forEach(function(s){ if(!q||brezSum(s.name).indexOf(q)>=0||brezSum(s.category||'').indexOf(q)>=0)
      sez.push({vrsta:'storitev',naziv:s.name,cena:stevilo(s.price),kat:s.category||''}); });
    ARTIKLI.forEach(function(a){ if(!q||brezSum(a.naziv).indexOf(q)>=0)
      sez.push({vrsta:'artikel',naziv:a.naziv,cena:stevilo(a.cena),kat:'Izdelki'}); });
    document.getElementById('kosRez').innerHTML=sez.slice(0,60).map(function(x,i){
      return '<button type="button" class="kos-opt" data-n="'+esc(x.naziv)+'" data-c="'+x.cena+'" data-v="'+x.vrsta+'">'
        +esc(x.naziv)+'<span>'+esc(x.kat)+' · '+eur(x.cena)+'</span></button>';}).join('')
      ||'<div class="kos-prazno">Ni zadetkov.</div>';
    document.querySelectorAll('.kos-opt').forEach(function(btn){btn.addEventListener('click',function(){
      KOS.postavke.push({vrsta:btn.getAttribute('data-v'),naziv:btn.getAttribute('data-n'),cena:stevilo(btn.getAttribute('data-c')),kol:1});
      kosRisi();});});
  }
  document.getElementById('kosIsci').addEventListener('input',rezultati);
  rezultati();
  document.getElementById('kosRDodaj').addEventListener('click',function(){
    var n=document.getElementById('kosRNaziv').value.trim(), c=stevilo(document.getElementById('kosRCena').value);
    if(!n)return; KOS.postavke.push({vrsta:'rocno',naziv:n,cena:c,kol:1}); kosRisi();
  });
  document.getElementById('kosADodaj').addEventListener('click',function(){
    var n=document.getElementById('kosANaziv').value.trim(), c=stevilo(document.getElementById('kosACena').value), m=document.getElementById('kosAMsg');
    if(!n){m.textContent='Vnesite naziv.';return;}
    this.disabled=true;
    sb.from('artikli').insert([{naziv:n,cena:c}]).then(function(r){
      if(r.error){m.textContent='Napaka: '+r.error.message;return;}
      loadArtikli(function(){ KOS.postavke.push({vrsta:'artikel',naziv:n,cena:c,kol:1}); kosRisi(); });
    });
  });
}

/* --- obracun znotraj okna termina --- */
function obrPreveri(b){
  var box=document.getElementById('obrBox'); if(!box)return;
  sb.from('obracuni').select('id,znesek,nacin,popust,datum,cas,stevilka_racuna').eq('booking_id',b.id).then(function(res){
    var o=(res.data||[])[0];
    if(o){
      box.innerHTML='<div class="obr-done">'
        +'<div class="obr-done-hd">✓ Obračunano · '+nacinIme(o.nacin)+(stevilo(o.popust)>0?(' · popust '+eur(o.popust)):'')+'</div>'
        +'<div class="obr-big">Za blagajno: <b>'+eur(o.znesek)+'</b>'
        +'<button class="obr-copy" id="obrCopy" title="Kopiraj znesek">📋 kopiraj</button></div>'
        +'<div class="obr-rn"><label>Št. računa iz miniBLAGAJNE'
        +'<input type="text" id="obrRn" value="'+esc(o.stevilka_racuna||'')+'" placeholder="npr. 12-1-2026"></label>'
        +'<button class="obr-rn-save" id="obrRnSave">Shrani</button><span id="obrRnMsg"></span></div>'
        +'<button class="obr-del" data-id="'+o.id+'">prekliči obračun</button></div>';
      var cp=box.querySelector('#obrCopy');
      if(cp)cp.addEventListener('click',function(){
        var t=Number(o.znesek).toFixed(2).replace('.',',');
        if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t);cp.textContent='✓ kopirano';}
        else{cp.textContent=t;}
        setTimeout(function(){cp.textContent='📋 kopiraj';},1800);
      });
      var rs=box.querySelector('#obrRnSave');
      if(rs)rs.addEventListener('click',function(){
        var v=document.getElementById('obrRn').value.trim(), m=document.getElementById('obrRnMsg');
        rs.disabled=true;
        sb.from('obracuni').update({stevilka_racuna:v||null}).eq('id',o.id).then(function(r2){
          rs.disabled=false; m.textContent=r2.error?('napaka: '+r2.error.message):'shranjeno ✓';
          setTimeout(function(){m.textContent='';},2500);
        });
      });
      var d=box.querySelector('.obr-del');
      d.addEventListener('click',function(){
        if(!confirm('Odstranim ta obračun iz prometa?'))return;
        sb.from('obracuni').delete().eq('id',o.id).then(function(){obrPreveri(b);});
      });
    } else {
      box.innerHTML='<button class="act obr-open" id="obrOpen">💶 Obračunaj</button>';
      document.getElementById('obrOpen').addEventListener('click',function(){obrObrazec(b);});
    }
  });
}
function obrObrazec(b){
  var box=document.getElementById('obrBox'); if(!box)return;
  KOS={postavke:kosIzTermina(b), popust:0, nacin:'gotovina', opomba:''};
  box.innerHTML='<div class="obr-form"><div class="d-edit-hd">Obračun</div>'
    +'<div id="kosBox"></div>'
    +'<div class="obr-btns"><button class="act" id="obrCancel">Prekliči</button><button class="act save" id="obrSave">Shrani obračun</button></div>'
    +'<div class="d-edit-msg" id="obrMsg"></div></div>';
  loadArtikli(kosRisi);
  kosRisi();
  document.getElementById('obrCancel').addEventListener('click',function(){obrPreveri(b);});
  document.getElementById('obrSave').addEventListener('click',function(){
    var btn=this, msg=document.getElementById('obrMsg');
    if(!KOS.postavke.length){msg.textContent='Dodajte vsaj eno postavko.';return;}
    var z=kosZnesek();
    if(z<=0&&!confirm('Znesek je 0 €. Vseeno shranim?'))return;
    btn.disabled=true; btn.textContent='Shranjujem …';
    sb.from('obracuni').insert([{booking_id:b.id, datum:b.booking_date||isoOf(new Date()),
      stranka:b.customer_name||null, storitve:kosOpis(), postavke:KOS.postavke,
      osnova:kosVsota(), popust:kosPopustEur(), znesek:z, nacin:KOS.nacin,
      opomba:kosOpombaShrani()}]).then(function(res){
      if(res.error){msg.textContent='Napaka: '+res.error.message;btn.disabled=false;btn.textContent='Shrani obračun';return;}
      sb.from('bookings').update({status:'opravljeno'}).eq('id',b.id).then(function(){ obrPreveri(b); load(); });
    });
  });
}

/* --- pogled Blagajna --- */
function loadBlagajna(){
  calScroll.classList.add('hidden'); nujniList.classList.add('hidden');
  document.getElementById('strankeView').classList.add('hidden');
  var box=document.getElementById('blagajnaView'); box.classList.remove('hidden');
  resetMiniHeight();
  document.getElementById('rangeLabel').textContent='Blagajna · '+prettyDate(isoOf(cur));
  box.innerHTML='<div class="empty">Nalagam …</div>';
  var dan=isoOf(cur);
  var prvi=isoOf(new Date(cur.getFullYear(),cur.getMonth(),1));
  var zadnji=isoOf(new Date(cur.getFullYear(),cur.getMonth()+1,0));
  Promise.all([
    sb.from('obracuni').select('*').eq('datum',dan).order('cas'),
    sb.from('obracuni').select('znesek,nacin,zaposleni_id').gte('datum',prvi).lte('datum',zadnji)
  ]).then(function(r){
    if(r[0].error){box.innerHTML='<div class="empty">Napaka: '+esc(r[0].error.message)+'</div>';return;}
    var dnevni=r[0].data||[], mesecni=r[1].data||[];
    var vs=function(arr,n){return arr.filter(function(o){return !n||o.nacin===n;}).reduce(function(a,o){return a+stevilo(o.znesek);},0);};
    var h='<div class="bl-top">'
      +'<div class="bl-kpi bl-glavni"><span>Danes skupaj</span><b>'+eur(vs(dnevni))+'</b><i>'+dnevni.length+' obračunov</i></div>'
      +'<div class="bl-kpi"><span>💶 Gotovina</span><b>'+eur(vs(dnevni,'gotovina'))+'</b></div>'
      +'<div class="bl-kpi"><span>💳 Kartica</span><b>'+eur(vs(dnevni,'kartica'))+'</b></div>'
      +'<div class="bl-kpi"><span>🏦 Nakazilo</span><b>'+eur(vs(dnevni,'nakazilo'))+'</b></div>'
      +'<div class="bl-kpi bl-mesec"><span>Mesec '+(cur.getMonth()+1)+'/'+cur.getFullYear()+'</span><b>'+eur(vs(mesecni))+'</b><i>'+mesecni.length+' obračunov</i></div>'
      +'</div>'
      +blPoZaposlenih(dnevni,mesecni,vs)
      +(dnevni.filter(function(o){return !o.stevilka_racuna;}).length?('<div class="bl-opoz">📋 Brez vpisane številke računa: '+dnevni.filter(function(o){return !o.stevilka_racuna;}).length+' — račun izdajte v miniBLAGAJNI, številko pa vpišite pri terminu.</div>'):'')
      +'<div class="bl-actions"><button class="btn bl-add" id="blAdd">+ Prost vnos</button>'
      +'<button class="btn bl-exp" id="blExp">⬇ Izvozi mesec v Excel</button></div>'
      +'<div id="blForm"></div>';
    if(!dnevni.length){ h+='<div class="empty">Ta dan še ni obračunov.</div>'; }
    else {
      h+='<div class="bl-list">'+dnevni.map(function(o){
        return '<div class="bl-row"><div class="bl-l"><b>'+esc(String(o.cas).slice(0,5))+'</b> '+(ZAP.length?zapPika(o.zaposleni_id):'')+esc(o.stranka||'—')
          +'<div class="bl-svc">'+esc(o.storitve||'')+(o.opomba?(' · '+esc(o.opomba)):'')
          +(stevilo(o.popust)>0?(' · popust '+eur(o.popust)):'')
          +(o.stevilka_racuna?('<span class="bl-rn">račun '+esc(o.stevilka_racuna)+'</span>'):'<span class="bl-rn bl-rn-ni">ni št. računa</span>')+'</div></div>'
          +'<div class="bl-r"><b>'+eur(o.znesek)+'</b><span>'+nacinIme(o.nacin)+'</span>'
          +'<button class="bl-del" data-id="'+o.id+'" title="Odstrani">✕</button></div></div>';
      }).join('')+'</div>';
    }
    box.innerHTML=h;
    document.getElementById('blAdd').addEventListener('click',blProstVnos);
    document.getElementById('blExp').addEventListener('click',blIzvoz);
    box.querySelectorAll('.bl-del').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!confirm('Odstranim ta obračun?'))return;
        sb.from('obracuni').delete().eq('id',btn.getAttribute('data-id')).then(loadBlagajna);
      });
    });
  });
}
/* promet po zaposlenih: danes in v mesecu (samo če ima salon zaposlene) */
function blPoZaposlenih(dnevni,mesecni,vs){
  if(!ZAP.length) return '';
  var vrst=ZAP.map(function(z){return {id:z.id,ime:z.ime};});
  if(dnevni.concat(mesecni).some(function(o){return !o.zaposleni_id||!ZAPMAP[o.zaposleni_id];})) vrst.push({id:null,ime:'Brez zaposlenega'});
  var za=function(arr,id){ return vs(arr.filter(function(o){ return id?o.zaposleni_id===id:(!o.zaposleni_id||!ZAPMAP[o.zaposleni_id]); })); };
  var st=function(arr,id){ return arr.filter(function(o){ return id?o.zaposleni_id===id:(!o.zaposleni_id||!ZAPMAP[o.zaposleni_id]); }).length; };
  return '<div class="obr-form" style="margin:.2rem 0 1rem"><div class="d-edit-hd">Promet po zaposlenih</div><div class="bl-list">'
    +vrst.map(function(v){
      return '<div class="bl-row"><div class="bl-l"><b>'+(v.id?zapPika(v.id):'')+esc(v.ime)+'</b></div>'
        +'<div class="bl-r" style="gap:1.1rem"><span>danes <b>'+eur(za(dnevni,v.id))+'</b> ('+st(dnevni,v.id)+')</span>'
        +(jeRecepcija()?'':'<span>mesec <b>'+eur(za(mesecni,v.id))+'</b> ('+st(mesecni,v.id)+')</span>')+'</div></div>';
    }).join('')+'</div></div>';
}
function blProstVnos(){
  var box=document.getElementById('blForm'); if(!box)return;
  KOS={postavke:[], popust:0, nacin:'gotovina', opomba:''};
  box.innerHTML='<div class="obr-form"><div class="d-edit-hd">Prost vnos (stranka brez rezervacije)</div>'
    +'<div class="obr-row"><label>Stranka<input type="text" id="pvIme" list="custNames" placeholder="išči ali vpiši ime" autocomplete="off"></label>'
    +'<label>Ura<input type="time" id="pvCas" value="'+pad(new Date().getHours())+':'+pad(new Date().getMinutes())+'"></label></div>'
    +(ZAP.length?'<div class="obr-row"><label>Zaposleni<select id="pvZap">'+aktivniZap().map(function(z){return '<option value="'+z.id+'"'+((FILTER_Z||MOJ_ZAP)===z.id?' selected':'')+'>'+esc(z.ime)+'</option>';}).join('')+'<option value="">— brez —</option></select></label></div>':'')
    +'<div id="kosBox"></div>'
    +'<div class="obr-btns"><button class="act" id="pvCancel">Prekliči</button><button class="act save" id="pvSave">Shrani</button></div>'
    +'<div class="d-edit-msg" id="pvMsg"></div></div>';
  loadArtikli(kosRisi);
  kosRisi();
  loadCustomersThen(populateCustDatalist);
  document.getElementById('pvCancel').addEventListener('click',function(){box.innerHTML='';});
  document.getElementById('pvSave').addEventListener('click',function(){
    var btn=this, msg=document.getElementById('pvMsg'), z=kosZnesek();
    if(!KOS.postavke.length){msg.textContent='Dodajte vsaj eno postavko.';return;}
    if(z<=0){msg.textContent='Znesek mora biti večji od 0.';return;}
    btn.disabled=true; btn.textContent='Shranjujem …';
    sb.from('obracuni').insert([{datum:isoOf(cur), cas:document.getElementById('pvCas').value||null,
      stranka:document.getElementById('pvIme').value||null, storitve:kosOpis(), postavke:KOS.postavke,
      osnova:kosVsota(), popust:kosPopustEur(), znesek:z, nacin:KOS.nacin,
      opomba:kosOpombaShrani(), zaposleni_id:(document.getElementById('pvZap')&&document.getElementById('pvZap').value)||null}]).then(function(res){
      if(res.error){msg.textContent='Napaka: '+res.error.message;btn.disabled=false;btn.textContent='Shrani';return;}
      loadBlagajna();
    });
  });
}
function blIzvoz(){
  var btn=document.getElementById('blExp'); btn.disabled=true; btn.textContent='Pripravljam …';
  var prvi=isoOf(new Date(cur.getFullYear(),cur.getMonth(),1)),
      zadnji=isoOf(new Date(cur.getFullYear(),cur.getMonth()+1,0));
  naloziXlsx(function(){
    sb.from('obracuni').select('*').gte('datum',prvi).lte('datum',zadnji).order('datum').order('cas').then(function(res){
      var rows=(res.data||[]).map(function(o){
        return {'Datum':String(o.datum).split('-').reverse().join('.'),'Ura':String(o.cas||'').slice(0,5),
                'Stranka':o.stranka||'','Storitve':o.storitve||'','Cena':stevilo(o.osnova),
                'Popust':stevilo(o.popust),'Plačano':stevilo(o.znesek),
                'Način':({gotovina:'Gotovina',kartica:'Kartica',nakazilo:'Nakazilo'})[o.nacin]||o.nacin,
                'Št. računa':o.stevilka_racuna||'','Opomba':o.opomba||''};
      });
      var ws=XLSX.utils.json_to_sheet(rows,{header:['Datum','Ura','Stranka','Storitve','Cena','Popust','Plačano','Način','Št. računa','Opomba']});
      ws['!cols']=[{wch:11},{wch:7},{wch:24},{wch:34},{wch:9},{wch:9},{wch:10},{wch:11},{wch:14},{wch:22}];
      var wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Promet');
      XLSX.writeFile(wb,'Promet_'+(APP.kratko||'')+'_'+cur.getFullYear()+'-'+pad(cur.getMonth()+1)+'.xlsx');
      btn.disabled=false; btn.textContent='⬇ Izvozi mesec v Excel';
    });
  });
}

function loadStranke(){
  calScroll.classList.add('hidden');nujniList.classList.add('hidden');document.getElementById('strankeView').classList.remove('hidden');
  resetMiniHeight();
  document.getElementById('rangeLabel').textContent='Stranke';
  var box=document.getElementById('strankeView');
  box.innerHTML='<div class="uvoz-bar"><input class="search" id="custSearch" placeholder="Išči po imenu ali telefonu …"><button type="button" class="btn uvoz-btn" id="uvozBtn">⇅ Uvoz / izvoz</button></div><div id="custList"><div class="empty">Nalagam …</div></div>';
  document.getElementById('uvozBtn').addEventListener('click',openUvozIzvoz);
  document.getElementById('custSearch').addEventListener('input',refreshStrankeList);
  var vp=document.createElement('div'); vp.id='virPovzetek'; box.insertBefore(vp, box.firstChild);
  loadCustomersThen(function(){ refreshStrankeList(); try{ risiVirPovzetek(); }catch(e){} });
}
/* ── VIR SPLETNIH REZERVACIJ (v54) ──
   bookings.vir zapise spletna stran ob uspesni rezervaciji (funkcija app_zabelezi_vir).
   Rezervacije, vnesene v adminu, vira nimajo. */
var VIR_VRSTICE=[];
function virOznaka(v){
  v=String(v||''); if(!v) return '';
  var IME={instagram:'Instagram',facebook:'Facebook',google:'Google iskanje','google-oglas':'Google oglas',bing:'Bing',chatgpt:'ChatGPT',perplexity:'Perplexity',
           gemini:'Gemini',tiktok:'TikTok',youtube:'YouTube',whatsapp:'WhatsApp',qr:'QR koda',sms:'SMS',email:'E-pošta',direktno:'Neposredno (zaznamek, vpisan naslov, SMS povezava)'};
  var KAMP={bio:'bio',profil:'profil',gbp:'Google zemljevid',story:'zgodba',objava:'objava',vizitka:'vizitka'};
  if(v.indexOf('utm:')===0){
    var d=v.slice(4).split('/'), src=d[0]||'', kamp=d[2]||'';
    var ime=IME[src]||(src.charAt(0).toUpperCase()+src.slice(1));
    if(src==='google'&&kamp==='gbp') return 'Google zemljevid / profil podjetja';
    return ime+(kamp?(' ('+(KAMP[kamp]||kamp.replace(/_/g,' '))+')'):'');
  }
  if(v.indexOf('ref:')===0) return 'povezava s strani '+v.slice(4);
  return IME[v]||v;
}
function risiVirPovzetek(){
  var el=document.getElementById('virPovzetek'); if(!el) return;
  var meja=new Date(Date.now()-90*864e5).toISOString(), st={}, skupaj=0;
  VIR_VRSTICE.forEach(function(b){ if(!b.vir||(b.created_at&&b.created_at<meja)) return;
    var k=virOznaka(b.vir).replace(/ \(.*\)$/,''); st[k]=(st[k]||0)+1; skupaj++; });
  var vrste=Object.keys(st).sort(function(a,b){return st[b]-st[a];});
  el.innerHTML='<div class="vir-box"><div class="vir-hd">Od kod pridejo spletne rezervacije <span>· zadnjih 90 dni</span></div>'
    +(skupaj ? vrste.map(function(k){ var pct=Math.round(st[k]*100/skupaj);
        return '<div class="vir-vr"><span class="vir-ime">'+esc(k)+'</span><span class="vir-trak"><i style="width:'+Math.max(pct,3)+'%"></i></span><span class="vir-st">'+st[k]+'</span></div>'; }).join('')
      : '<div class="vir-prazno">Še ni podatkov. Vir se zapisuje pri spletnih rezervacijah od 5. 11. 2026.</div>')
    +'</div>';
}
function refreshStrankeList(){
  var listEl=document.getElementById('custList'); if(!listEl)return;
  var q=(document.getElementById('custSearch').value||'').toLowerCase().trim(), qd=q.replace(/\D/g,'');
  if(!CUSTOMERS.length){listEl.innerHTML='<div class="empty">Ni strank.</div>';return;}
  var list=CUSTOMERS.filter(function(c){if(!q)return true;return (c.name||'').toLowerCase().indexOf(q)>=0||(qd&&(c.phone||'').replace(/\D/g,'').indexOf(qd)>=0);});
  if(!list.length){listEl.innerHTML='<div class="empty">Ni zadetkov.</div>';return;}
  var html='';
  list.slice(0,300).forEach(function(c,i){
    html+='<div class="cust"><div class="cust-head" data-ci="'+i+'">'
      +'<div class="cust-info"><div class="cust-name">'+esc(c.name||'—')+'</div><div class="cust-sub">'+esc(c.phone||'')+(c.email?(' · '+esc(c.email)):'')+'</div></div>'
      +'<div class="cust-meta">'+(c.uvozena&&!c.visits?'<span class="uvoz-tag">uvožena</span>':obiski(c.visits))+(c.last?('<br>zadnji: '+prettyShort(c.last)):'')+'</div>'
      +'<button type="button" class="act cust-edit-btn" data-ci="'+i+'">✎ Uredi</button>'
      +'</div><div class="cust-edit-form hidden" id="custEdit'+i+'"></div><div class="cust-hist hidden"></div></div>';
  });
  listEl.innerHTML=html;
  listEl.querySelectorAll('.cust-edit-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var i=+btn.getAttribute('data-ci'), c=list[i];
      var box=document.getElementById('custEdit'+i);
      if(!box.classList.contains('hidden')){box.classList.add('hidden');box.innerHTML='';return;}
      prikaziStrankaEditForma(box,c,refreshStrankeList);
      box.classList.remove('hidden');
    });
  });
  listEl.querySelectorAll('.cust-head').forEach(function(hd){
    hd.addEventListener('click',function(){
      var c=list[+hd.getAttribute('data-ci')], hist=hd.nextElementSibling.nextElementSibling;
      if(!hist.classList.contains('hidden')){hist.classList.add('hidden');hist.innerHTML='';return;}
      var hh=c.opomba?('<div class="hist-row" style="cursor:default"><span class="h-svc">📝 '+esc(c.opomba)+'</span></div>'):'';
      if(!c.bookings.length) hh+='<div class="hist-row" style="cursor:default"><span class="h-svc">Še brez rezervacij v sistemu.</span></div>';
      c.bookings.forEach(function(b){cache[b.id]=b;hh+='<div class="hist-row" data-id="'+b.id+'"><span class="h-date">'+(b.booking_date?(prettyShort(b.booking_date)+' '+hm(b.start_time)):'Po dogovoru')+'</span><span class="h-svc">'+esc(b.services_text||b.service_name||'')+'</span><span class="h-price">'+eur(b.total_price)+'</span>'+badge(b.status)+'</div>';});
      hist.innerHTML=hh; hist.classList.remove('hidden');
      hist.querySelectorAll('.hist-row').forEach(function(r){r.addEventListener('click',function(){openDetail(cache[r.getAttribute('data-id')]);});});
    });
  });
}
/* Urejanje kontaktnih podatkov stranke (ime/telefon/e-posta/opomba) – popravi imenik (stranke)
   in vse njene obstojece rezervacije (bookings), da so podatki povsod usklajeni (npr. za SMS opomnike). */
function prikaziStrankaEditForma(box,c,onSaved){
  box.innerHTML='<div class="obr-form" style="margin:.3rem 0 .6rem">'
    +'<div class="d-edit-hd">Uredi kontaktne podatke</div>'
    +'<div class="obr-row">'
    +'<label>Ime in priimek<input type="text" id="ceIme" value="'+esc(c.name||'')+'"></label>'
    +'<label>Telefon<input type="tel" id="ceTel" value="'+esc(c.phone||'')+'"></label>'
    +'</div><div class="tel-msg" id="ceTelMsg"></div><div class="obr-row">'
    +'<label>E-pošta<input type="text" id="ceEmail" value="'+esc(c.email||'')+'"></label>'
    +'</div><div class="obr-row">'
    +'<label style="flex:1 0 100%">Opomba<input type="text" id="ceOpomba" value="'+esc(c.opomba||'')+'"></label>'
    +'</div>'
    +(c.bookings&&c.bookings.length?('<p style="font-size:.76rem;opacity:.6;margin:.2rem 0 .6rem">Popravek se shrani v imenik strank in v '+c.bookings.length+' obstoječ'+(c.bookings.length===1?'o':'ih')+' rezervacij'+(c.bookings.length===1?'o':'')+' te stranke (npr. za pravilne SMS opomnike).</p>'):'')
    +'<div class="obr-btns"><button class="act" id="ceCancel">Prekliči</button><button class="act save" id="ceSave">Shrani</button></div>'
    +'<div class="d-edit-msg" id="ceMsg"></div></div>';
  if(window.AppTel) AppTel.povezi(document.getElementById('ceTel'), document.getElementById('ceTelMsg'));
  document.getElementById('ceCancel').addEventListener('click',function(){box.classList.add('hidden');box.innerHTML='';});
  document.getElementById('ceSave').addEventListener('click',function(){
    var btn=this, msg=document.getElementById('ceMsg');
    var ime=document.getElementById('ceIme').value.trim();
    var tel=document.getElementById('ceTel').value.trim();
    var email=document.getElementById('ceEmail').value.trim();
    var opomba=document.getElementById('ceOpomba').value.trim();
    if(!ime){msg.textContent='Vnesite ime.';msg.className='d-edit-msg err';return;}
    var tp=adminTel(document.getElementById('ceTel'), document.getElementById('ceTelMsg'));
    if(tp.ustavi) return; tel=tp.vrednost;
    btn.disabled=true; btn.textContent='Shranjujem …';
    var strankaPatch={ime:ime, telefon:tel||null, email:email||null, opomba:opomba||null};
    var p = c.strankaId
      ? sb.from('stranke').update(strankaPatch).eq('id',c.strankaId)
      : sb.from('stranke').insert([Object.assign({vir:'admin'},strankaPatch)]).select('id');
    p.then(function(res){
      if(res.error){msg.textContent='Napaka pri imeniku: '+res.error.message;msg.className='d-edit-msg err';btn.disabled=false;btn.textContent='Shrani';return;}
      if(!c.strankaId && res.data && res.data[0]) c.strankaId=res.data[0].id;
      var bookIds=(c.bookings||[]).map(function(b){return b.id;});
      var finish=function(){
        c.name=ime; c.phone=tel; c.email=email; c.opomba=opomba;
        box.classList.add('hidden'); box.innerHTML='';
        if(onSaved) onSaved();
      };
      if(!bookIds.length){ finish(); return; }
      sb.from('bookings').update({customer_name:ime, customer_phone:tel||null, customer_email:email||null}).in('id',bookIds).then(function(res2){
        if(res2.error){msg.textContent='Imenik shranjen, a rezervacij ni bilo mogoče posodobiti: '+res2.error.message;msg.className='d-edit-msg err';btn.disabled=false;btn.textContent='Shrani';return;}
        finish();
      });
    });
  });
}
/* Telefon v adminu: preveri s telefon.js. Pravilna stevilka -> zapis +386 …; napaka ali opozorilo
   se pokaze pod poljem in ustavi SAMO prvi klik »Shrani« – administrator lahko stevilko kljub temu shrani. */
function adminTel(el,msgEl){
  var v=(el.value||'').trim();
  if(!window.AppTel||!v) return {vrednost:v, ustavi:false};
  var r=AppTel.preveri(v);
  if(r.stanje==='ok'){ el.value=r.zapis; AppTel.prikazi(el,msgEl,r); return {vrednost:r.zapis, ustavi:false}; }
  var kljuc=r.zapis||v;
  if(el.dataset.potrjeno===kljuc) return {vrednost:kljuc, ustavi:false};
  if(r.zapis) el.value=r.zapis;
  AppTel.prikazi(el,msgEl,r);
  msgEl.textContent+=' Če je številka kljub temu pravilna, kliknite »Shrani« še enkrat.';
  el.dataset.potrjeno=kljuc;
  return {ustavi:true};
}
function populateCustDatalist(){
  var dl=document.getElementById('custNames'); if(!dl)return;
  var seen={},html='';
  CUSTOMERS.forEach(function(c){var n=c.name||''; if(n&&!seen[n.toLowerCase()]){seen[n.toLowerCase()]=1;html+='<option value="'+esc(n)+'">'+esc(c.phone||'')+'</option>';}});
  dl.innerHTML=html;
}
function fillFromCustomer(){
  var name=document.getElementById('nbName').value.trim().toLowerCase(); if(!name)return;
  var c=null;for(var i=0;i<CUSTOMERS.length;i++){if((CUSTOMERS[i].name||'').toLowerCase()===name){c=CUSTOMERS[i];break;}}
  if(!c)return;
  var ph=document.getElementById('nbPhone'), em=document.getElementById('nbEmail');
  if(!ph.value&&c.phone)ph.value=c.phone;
  if(!em.value&&c.email)em.value=c.email;
}

function badge(s){var m={'nova':'nova','potrjeno':'potrjeno','opravljeno':'opravljeno','preklicano':'preklicano','po dogovoru':'podogovoru'};return '<span class="badge '+(m[s]||'nova')+'">'+esc(s||'nova')+'</span>';}

/* temno rdeca crta, ki kaze trenutno uro (samo v stolpcu danasnjega dne) */
var CRTA_TIMER=null;
function risiCrtoZdaj(days){
  if(CRTA_TIMER){ clearInterval(CRTA_TIMER); CRTA_TIMER=null; }
  function nariši(){
    var stare=calScroll.querySelectorAll('.crta-zdaj'); stare.forEach(function(e){e.remove();});
    var zdaj=new Date(), di=isoOf(zdaj);
    var col=calScroll.querySelector('.col[data-date="'+di+'"]');
    if(!col) return;                                  /* danasnji dan ni v pogledu */
    var min=zdaj.getHours()*60+zdaj.getMinutes();
    var el=document.createElement('div');
    el.className='crta-zdaj';
    el.style.top=(min*PXMIN)+'px';
    el.innerHTML='<span class="crta-pika"></span><span class="crta-ura">'+pad(zdaj.getHours())+':'+pad(zdaj.getMinutes())+'</span>';
    col.appendChild(el);
  }
  nariši();
  CRTA_TIMER=setInterval(nariši, 60000);              /* osvezi vsako minuto */
}
/* v56: termini, ki se casovno prekrivajo, se izpisejo drug ob drugem (prvi levo, naslednji desno),
   vsak na svoji uri. Skupina = vsi termini, ki se med seboj (tudi posredno) prekrivajo; v skupini
   dobi vsak termin prvi prosti stolpec, sirina stolpca = 100 % / stevilo stolpcev v skupini. */
function razporediStolpce(items){
  var out={}; if(!items.length) return out;
  items.sort(function(a,b){ return a.s-b.s || b.e-a.e; });
  var skupina=[], konecSk=-1, stolpci=[];
  function zakljuci(){ var n=stolpci.length; skupina.forEach(function(it){ out[it.k]={c:it.c,n:n}; }); skupina=[]; stolpci=[]; }
  items.forEach(function(it){
    if(skupina.length && it.s>=konecSk) zakljuci();
    var c=0; while(c<stolpci.length && stolpci[c]>it.s) c++;
    stolpci[c]=it.e; it.c=c; skupina.push(it);
    konecSk = skupina.length===1 ? it.e : Math.max(konecSk, it.e);
  });
  zakljuci();
  return out;
}
function stolpecSlog(L){
  if(!L || L.n<2) return '';
  return 'left:calc('+(L.c*100/L.n)+'% + 2px);right:auto;width:calc('+(100/L.n)+'% - 4px);';
}
function renderCal(days,bookings,blocks){
  nastaviMerilo();
  cache={};blockCache={};
  var cols=stolpciKoledarja(days,bookings), poZap=(mode==='day'&&!FILTER_Z&&cols.length&&cols[0].zid!==undefined);
  var kaziPiko=ZAP.length>0&&!poZap;
  var N=cols.length;var gw=isMobile()?44:64;var gc=gw+'px repeat('+N+',1fr)';
  var h='<div class="cal '+(N>1?'multi':'')+'"><div class="cal-head" style="grid-template-columns:'+gc+'"><div></div>';
  cols.forEach(function(c){var d=c.d;var info=c.zid?dayInfoZ(d,c.zid):dayInfo(d);var hcls=info.closed?'off':(info.arrangement?'arr':'');var tt=info.praznik?' title="'+esc(info.praznik)+'"':'';var pz=info.praznik?'<div class="praznik">'+esc(info.praznik)+'</div>':'';
    var naslov=poZap?('<div class="dow zap-ime">'+(c.zid?zapPika(c.zid)+esc(zapIme(c.zid)):'Nedodeljeno')+'</div>'):('<div class="dow">'+(N===1?DOWF:DOW)[(d.getDay()+6)%7]+'</div>');
    h+='<div class="dayhead '+hcls+(isoOf(d)===isoToday()?' today':'')+'"'+tt+'>'+naslov+'<div class="dnum">'+pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear()+'</div>'+pz+'</div>';});
  h+='</div><div class="cal-body" style="grid-template-columns:'+gc+'"><div class="gutter" style="height:'+TOTAL+'px">';
  for(var hh=H0;hh<=H1;hh++){h+='<div class="hr" style="top:'+((hh-H0)*HOUR_PX)+'px">'+pad(hh)+':00</div>';}
  h+='</div>';
  cols.forEach(function(c){
    var d=c.d,info=c.zid?dayInfoZ(d,c.zid):dayInfo(d),di=isoOf(d),col='<div class="col" data-date="'+di+'"'+(c.zid?' data-zap="'+c.zid+'"':'')+' style="height:'+TOTAL+'px">';
    if(info.closed)col+='<div class="off-band closed" style="top:0;height:'+TOTAL+'px"></div>';
    else if(info.arrangement)col+='<div class="off-band arr" style="top:0;height:'+TOTAL+'px"></div>';
    else if(info.h){if(info.h[0]>H0)col+='<div class="off-band closed" style="top:0;height:'+((info.h[0]-H0)*HOUR_PX)+'px"></div>';if(info.h[1]<H1)col+='<div class="off-band closed" style="top:'+((info.h[1]-H0)*HOUR_PX)+'px;height:'+((H1-info.h[1])*HOUR_PX)+'px"></div>';}
    var dnevni=[];
    bookings.filter(function(b){return b.booking_date===di&&terminVStolpcu(b,c);}).forEach(function(b){
      var s=toMin(b.start_time),e=toMin(b.end_time)||(s+(b.total_duration_min||30));
      dnevni.push({k:'b'+b.id,s:s,e:Math.max(e,s+20/PXMIN)});
    });
    blocks.filter(function(bl){return bl.block_date===di&&opravekVStolpcu(bl,c);}).forEach(function(bl){
      var s=toMin(bl.start_time),e=toMin(bl.end_time);
      dnevni.push({k:'k'+bl.id,s:s,e:Math.max(e,s+18/PXMIN)});
    });
    var RAZ=razporediStolpce(dnevni);
    bookings.filter(function(b){return b.booking_date===di&&terminVStolpcu(b,c);}).forEach(function(b){
      cache[b.id]=b;var s=toMin(b.start_time),e=toMin(b.end_time)||(s+(b.total_duration_min||30));
      var top=(s-H0*60)*PXMIN,hgt=Math.max((e-s)*PXMIN,20);
      var cls=({'potrjeno':'potrjeno','opravljeno':'opravljeno','preklicano':'preklicano'})[b.status]||'';
      if(FILTER_Z&&!b.zaposleni_id&&ZAP.length) cls+=' zap-tuj';
      var cc=evStyle(b);
      var kratek=(e-s)<30;
      var pika=kaziPiko?zapPika(b.zaposleni_id):'';
      col+='<div class="ev '+cls+(kratek?' kratek':'')+'" data-bid="'+b.id+'" style="top:'+top+'px;height:'+hgt+'px;'+stolpecSlog(RAZ['b'+b.id])+'background:'+cc.bg+';border-left-color:'+cc.bd+'"><span class="ev-st '+stKey(b.status)+'"></span>'
        +(kratek
          ? '<div class="ev-n"><span class="ev-t">'+hm(b.start_time)+'–'+hm(b.end_time)+'</span>'+pika+esc(b.customer_name||'—')+'</div>'
          : '<div class="ev-t">'+hm(b.start_time)+'–'+hm(b.end_time)+'</div><div class="ev-n">'+pika+esc(b.customer_name||'—')+'</div>')
        +'<div class="ev-s">'+esc(b.services_text||b.service_name||'')+'</div></div>';
    });
    blocks.filter(function(bl){return bl.block_date===di&&opravekVStolpcu(bl,c);}).forEach(function(bl){
      blockCache[bl.id]=bl;
      var s=toMin(bl.start_time),e=toMin(bl.end_time),top=(s-H0*60)*PXMIN,hgt=Math.max((e-s)*PXMIN,18);
      var pika=kaziPiko?zapPika(bl.zaposleni_id):'';
      col+='<div class="ev block" data-blk="'+bl.id+'" style="top:'+top+'px;height:'+hgt+'px;'+stolpecSlog(RAZ['k'+bl.id])+'"><div class="ev-t">'+hm(bl.start_time)+'–'+hm(bl.end_time)+'</div><div class="ev-n">'+pika+esc(bl.note||'Opravek')+'</div>'+(bl.note?'<div class="ev-s">'+(bl.zaposleni_id&&kaziPiko?esc(zapIme(bl.zaposleni_id)):'opravek')+'</div>':'')+'</div>';
    });
    col+='</div>';h+=col;
  });
  h+='</div></div>';calScroll.innerHTML=h;
  calScroll.querySelectorAll('.ev[data-bid]').forEach(function(el){
    var b=cache[el.getAttribute('data-bid')];
    el.addEventListener('click',function(){openDetail(b);});
    el.addEventListener('mouseenter',function(){showTip(tipBooking(b),el);});
    el.addEventListener('mouseleave',hideTip);
    el.addEventListener('touchstart',function(){showTip(tipBooking(b),el);},{passive:true});
  });
  calScroll.querySelectorAll('.ev[data-blk]').forEach(function(el){
    var bl=blockCache[el.getAttribute('data-blk')];
    el.addEventListener('mouseenter',function(){showTip(tipBlock(bl),el);});
    el.addEventListener('mouseleave',hideTip);
    el.addEventListener('touchstart',function(){showTip(tipBlock(bl),el);},{passive:true});
    el.addEventListener('click',function(){hideTip();odpriOpravek(bl);});
  });
  risiCrtoZdaj(days);
  if(SMER){
    var platno=calScroll.querySelector('.cal');
    if(platno){ platno.classList.add(SMER>0?'vstop-l':'vstop-r'); }
    SMER=0;
  }
  calScroll.querySelectorAll('.col').forEach(function(colEl){
    colEl.addEventListener('dblclick',function(e){
      if(e.target.closest('.ev'))return;
      var rect=colEl.getBoundingClientRect();
      var mins=H0*60 + (e.clientY-rect.top)/PXMIN;
      mins=Math.round(mins/15)*15;
      if(mins<H0*60)mins=H0*60; if(mins>H1*60)mins=H1*60;
      openNewAt(colEl.getAttribute('data-date'), pad(Math.floor(mins/60))+':'+pad(mins%60), colEl.getAttribute('data-zap'));
    });
  });
  syncCalHeight();
  syncMiniHeight();
}

function renderMonth(cells,counts,dcats){
  dcats=dcats||{};
  var h='<div class="month"><div class="mhead">';
  DOW.forEach(function(d){h+='<div>'+d+'</div>';});
  h+='</div><div class="mgrid">';
  cells.forEach(function(d){
    var iso=isoOf(d),out=d.getMonth()!==cur.getMonth(),c=counts[iso]||0;
    var praznik=PRAZNIKI[iso],off=(d.getDay()===0)||!!praznik;
    var dd=(dcats[iso]||[]).slice(0,12).map(function(col){return '<span class="mdot" style="background:'+col+'"></span>';}).join('');
    var pz=praznik?'<div class="mpraznik" title="'+esc(praznik)+'">'+esc(praznik)+'</div>':'';
    h+='<button class="mcell'+(out?' out':'')+(iso===isoToday()?' today':'')+(off?' off':'')+'" data-d="'+iso+'"><span class="mnum">'+d.getDate()+'</span>'+pz+(dd?'<div class="mdots">'+dd+'</div>':'')+(c?'<span class="mcount">'+c+'</span>':'')+'</button>';
  });
  h+='</div></div>';calScroll.innerHTML=h;
  calScroll.querySelectorAll('.mcell').forEach(function(b){b.addEventListener('click',function(){var p=b.getAttribute('data-d').split('-');cur=new Date(+p[0],+p[1]-1,+p[2]);miniRef=new Date(cur);mode='day';setSeg('day');load();});});
  syncCalHeight();
  syncMiniHeight();
}

/* PREDOGLED (hover/dotik) */
var tip=document.getElementById('tip');
function tipBooking(b){
  if(!b)return '';
  var gap=(b.gap_duration_min>0)?'<div class="tip-row">⏳ vmesni prosti čas '+b.gap_after_min+'+'+b.gap_duration_min+' min</div>':'';
  return '<div class="tip-t">'+hm(b.start_time)+'–'+hm(b.end_time)+'</div>'
    +'<div class="tip-n">'+esc(b.customer_name||'—')+'</div>'
    +(b.zaposleni_id&&ZAPMAP[b.zaposleni_id]?'<div class="tip-row">'+zapPika(b.zaposleni_id)+esc(zapIme(b.zaposleni_id))+'</div>':(ZAP.length?'<div class="tip-row">nedodeljeno</div>':''))
    +(b.customer_phone?'<div class="tip-row">📞 '+esc(b.customer_phone)+'</div>':'')
    +'<div class="tip-row">'+esc(b.services_text||b.service_name||'')+'</div>'
    +(b.note?'<div class="tip-row" style="font-style:italic">'+esc(b.note)+'</div>':'')+gap
    +'<div class="tip-foot"><span class="tip-price">'+eur(b.total_price)+'</span>'+badge(b.status)+'</div>';
}
function tipBlock(bl){
  if(!bl)return '';
  return '<div class="tip-t">'+hm(bl.start_time)+'–'+hm(bl.end_time)+'</div><div class="tip-n" style="color:var(--coral)">Opravek / odsotnost</div>'+(bl.zaposleni_id?'<div class="tip-row">'+zapPika(bl.zaposleni_id)+esc(zapIme(bl.zaposleni_id))+'</div>':(ZAP.length?'<div class="tip-row">cel salon</div>':''))+(bl.note?'<div class="tip-row">'+esc(bl.note)+'</div>':'');
}
function showTip(html,el){
  if(!html)return;
  tip.innerHTML=html;tip.classList.remove('hidden');
  var r=el.getBoundingClientRect(),tw=tip.offsetWidth,th=tip.offsetHeight,M=8;
  var left=r.right+M; if(left+tw>window.innerWidth-M) left=r.left-tw-M; if(left<M) left=M;
  var top=r.top; if(top+th>window.innerHeight-M) top=window.innerHeight-th-M; if(top<M) top=M;
  tip.style.left=left+'px';tip.style.top=top+'px';
}
function hideTip(){tip.classList.add('hidden');}
window.addEventListener('scroll',hideTip,true);
window.addEventListener('touchmove',hideTip);

/* PODROBNOSTI */
var detail=document.getElementById('detail'),detailBody=document.getElementById('detailBody');
document.getElementById('detailClose').addEventListener('click',function(){detail.classList.add('hidden');});
detail.addEventListener('click',function(e){if(e.target===detail)detail.classList.add('hidden');});
function openDetail(b){
  if(!b)return;
  EDBK=b;
  hideTip();
  var gap=(b.gap_duration_min>0)?('<div class="d-meta">⏳ vmesni prosti čas: '+b.gap_after_min+'+'+b.gap_duration_min+' min</div>'):'';
  detailBody.innerHTML=''
    +'<div class="d-head"><div class="d-head-ime">'+esc(b.customer_name||'—')+'</div>'
      +'<div class="d-head-sub">'+(b.booking_date?(prettyDate(b.booking_date)+' · '+hm(b.start_time)+'–'+hm(b.end_time)):'Po dogovoru / nujni')+'</div></div>'
    +'<div class="d-time">'+(b.booking_date?((b.total_duration_min||0)+' min'):'')+'</div>'
    +'<div class="d-svc">'+esc(b.services_text||b.service_name||'—')+'</div>'
    +'<div class="d-meta">'+(b.customer_phone?('📞 <a href="tel:'+esc(b.customer_phone)+'">'+esc(b.customer_phone)+'</a>'):'')+(b.customer_email?('<br>✉️ '+esc(b.customer_email)):'')+'</div>'
    +(b.note?('<div class="d-note">'+esc(b.note)+'</div>'):'')+gap
    +(b.vir?('<div class="d-meta" style="opacity:.75">🔗 Prišla prek: '+esc(virOznaka(b.vir))+'</div>'):'')
    +'<div class="d-row"><span class="price">'+eur(b.total_price)+'</span>'+badge(b.status)+'</div>'
    +'<div class="d-edit">'
      +'<div class="d-edit-hd">Uredi termin in storitve</div>'
      +'<div class="d-edit-row">'
        +'<label>Datum<input type="date" id="edDate" value="'+(b.booking_date||'')+'"></label>'
        +'<label>Začetek<input type="time" id="edTime" step="900" value="'+(b.start_time?hm(b.start_time):'')+'"></label>'
        +'<label>Konec<input type="time" id="edEnd" step="300" value="'+(b.end_time?hm(b.end_time):'')+'"></label>'
      +'</div>'
      +edZapHtml(b)
      +'<div class="nb-svc-label" style="margin:.6rem 0 .35rem">Storitve</div>'
      +'<div class="nb-services" id="edServices"></div>'
      +'<div class="nb-summary" id="edSummary"></div>'
      +'<button class="act save" id="edSave">Shrani spremembe</button>'
      +'<div class="d-edit-msg" id="edMsg"></div>'
    +'</div>'
    +'<div id="obrBox" class="obr-box"></div>'
    +'<div class="d-actions">'
    +((['potrjeno','opravljeno','preklicano'].indexOf(b.status)<0)
        ? '<button class="act" data-id="'+b.id+'" data-s="potrjeno">Potrdi</button>' : '')
    +'<button class="act" data-id="'+b.id+'" data-s="opravljeno">Opravljeno</button><button class="act" data-id="'+b.id+'" data-s="preklicano">Prekliči</button><button class="act danger" id="edDel">Izbriši</button></div>';
  edKolIzTermina(b);
  buildEdServices(edServiceMatchIds(b));
  updateEdSummary();
  obrPreveri(b);
  var edZapEl=document.getElementById('edZap'); if(edZapEl)edZapEl.addEventListener('change',function(){ var ids=[];document.querySelectorAll('#edServices input:checked').forEach(function(cb){ids.push(cb.value);}); buildEdServices(ids); edSyncEnd(); });
  var edTimeEl=document.getElementById('edTime'); if(edTimeEl)edTimeEl.addEventListener('change',edSyncEnd);
  var edEndEl=document.getElementById('edEnd'); if(edEndEl)edEndEl.addEventListener('change',updateEdSummary);
  detailBody.querySelectorAll('.act[data-s]').forEach(function(btn){btn.addEventListener('click',function(){
    var id=btn.getAttribute('data-id'),s=btn.getAttribute('data-s');
    if(s==='preklicano'&&!confirm('Prekličem to rezervacijo?'))return;
    btn.textContent='…';
    sb.from('bookings').update({status:s}).eq('id',id).then(function(res){if(res.error)alert('Napaka: '+res.error.message);detail.classList.add('hidden');load();});
  });});
  var edSave=document.getElementById('edSave');
  if(edSave)edSave.addEventListener('click',function(){
    var nd=document.getElementById('edDate').value,nt=document.getElementById('edTime').value,ne=document.getElementById('edEnd').value,m=document.getElementById('edMsg');
    m.className='d-edit-msg';
    var sel=edSelected();
    if(!nd||!nt||!ne){m.textContent='Vnesite datum, začetek in konec.';m.className='d-edit-msg err';return;}
    if(!sel.length){m.textContent='Izberite vsaj eno storitev.';m.className='d-edit-msg err';return;}
    var dur=toMin(ne)-toMin(nt);
    if(dur<=0){m.textContent='Konec mora biti po začetku.';m.className='d-edit-msg err';return;}
    var origIds=edPodpisIzTermina(b);
    var selIds=edPodpis(sel);
    var price,stext,sid,sname;
    if(selIds===origIds){
      price=parseFloat(b.total_price)||0; stext=b.services_text||b.service_name; sid=b.service_id; sname=b.service_name;
    } else {
      price=parseFloat(sel.reduce(function(a,s){return a+(parseFloat(s.price)||0)*(s.kol||1);},0).toFixed(2));
      stext=sel.map(function(s){return s.name+((s.kol||1)>1?(' ×'+s.kol):'');}).join(' + '); sid=sel[0].id; sname=sel[0].name;
    }
    var gapAfter=0,gapDuration=0,gapSvc=null;
    sel.forEach(function(s){var gd=parseInt(s.gap_duration_min)||0,ga=parseInt(s.gap_after_min)||0;if(gd>0&&ga>0){if(!gapSvc||gd>(parseInt(gapSvc.gap_duration_min)||0))gapSvc=s;}});
    if(gapSvc){var ga=parseInt(gapSvc.gap_after_min)||0,gd=parseInt(gapSvc.gap_duration_min)||0;if(ga+gd<=dur){gapAfter=ga;gapDuration=gd;}}
    var rec={booking_date:nd,start_time:nt,end_time:ne,total_duration_min:dur,total_price:price,
      services_text:stext,service_id:sid,service_name:sname,gap_after_min:gapAfter,gap_duration_min:gapDuration};
    if(document.getElementById('edZap')) rec.zaposleni_id=edZapVal()||null;
    edSave.disabled=true;edSave.textContent='Shranjujem …';
    sb.from('bookings').update(rec).eq('id',b.id).then(function(res){
      if(res.error){m.textContent='Napaka: '+res.error.message;m.className='d-edit-msg err';edSave.disabled=false;edSave.textContent='Shrani spremembe';return;}
      detail.classList.add('hidden');load();
    });
  });
  var edDel=document.getElementById('edDel');
  if(edDel)edDel.addEventListener('click',function(){
    if(!confirm('Trajno izbrišem to rezervacijo? Tega ni mogoče razveljaviti.'))return;
    /* Stranko lahko o odpovedi obvestimo po SMS - le pri prihodnjih terminih,
       ki se niso preklicani/opravljeni in imajo telefonsko stevilko. */
    var danes=isoOf(new Date());
    var smiselno = !!(b.booking_date && b.customer_phone && b.booking_date>=danes
                      && ['preklicano','opravljeno'].indexOf(b.status)<0);
    var obvesti = smiselno && confirm('Želite stranko po SMS obvestiti, da je rezervacija odpovedana?\n\nOK = pošlji SMS in izbriši\nPrekliči = izbriši brez obvestila');
    edDel.textContent='…';edDel.disabled=true;
    function izbrisi(){
      sb.from('bookings').delete().eq('id',b.id).then(function(res){
        if(res.error){alert('Napaka pri brisanju: '+res.error.message);edDel.disabled=false;edDel.textContent='Izbriši';return;}
        detail.classList.add('hidden');load();
      });
    }
    if(obvesti){
      /* preklic sprozi obvestilo stranki, nato vrstico izbrisemo */
      edDel.textContent='Pošiljam SMS …';
      sb.from('bookings').update({status:'preklicano'}).eq('id',b.id).then(function(r2){
        if(r2.error)alert('SMS obvestila ni bilo mogoče sprožiti: '+r2.error.message);
        setTimeout(izbrisi,1200);
      });
    } else izbrisi();
  });
  detail.classList.remove('hidden');
}

/* NOVA REZERVACIJA */
function loadServices(cb){
  sb.from('services').select('id,name,description,price,category,sort_order,duration_min,gap_after_min,gap_duration_min').eq('active',true).order('sort_order',{ascending:true}).then(function(res){
    if(!res.error)SERVICES=res.data||[];
    sb.from('services').select('id,name,category,sort_order').order('sort_order',{ascending:true}).then(function(r2){
      if(!r2.error){ dodeliBarveKategorij(r2.data); (r2.data||[]).forEach(function(s){CATMAP[s.id]=s.category;NAMECAT[s.name]=s.category;}); }
      buildLegend();
      if(cb)cb();
    });
  });
}
function buildLegend(){
  var el=document.getElementById('catLegend'); if(!el)return;
  var html='';
  for(var k in CAT_COLOR){ if(k==='_'||!CAT_COLOR.hasOwnProperty(k))continue;
    html+='<span class="lg"><span class="sw" style="background:'+CAT_COLOR[k].bg+';border:1px solid '+CAT_COLOR[k].bd+'"></span>'+k+'</span>';
  }
  html+='<span class="lg"><span class="sw" style="background:linear-gradient('+PALETA[0].bd+' 0 50%,'+PALETA[2].bd+' 50% 100%);border:1px solid rgba(0,0,0,.15)"></span>kombinacija (več storitev)</span>';
  el.innerHTML=html;
}
function buildNbServices(){
  var box=document.getElementById('nbServices');
  if(!SERVICES.length){box.innerHTML='<div style="opacity:.6;padding:.4rem 0">Nalagam storitve …</div>';return;}
  var LIST=svcSeznam(nbZapVal());
  if(!LIST.length){box.innerHTML='<div style="opacity:.7;padding:.4rem 0">Ta zaposleni nima izbranih storitev (Nastavitve → Zaposleni).</div>';return;}
  var cats=[],byCat={};
  LIST.forEach(function(s){if(!byCat[s.category]){byCat[s.category]=[];cats.push(s.category);}byCat[s.category].push(s);});
  var html='';
  cats.forEach(function(c){
    var isNujni=(c||'').toLowerCase().indexOf('nujni')>=0;
    html+='<div class="nb-acc-item" data-cat="'+esc(c)+'">'
        + '<button class="nb-acc-trigger" type="button"><span class="nb-acc-cat'+(isNujni?' nujni':'')+'">'+esc(c)+'</span><span class="nb-acc-arr" aria-hidden="true">+</span></button>'
        + '<div class="nb-acc-body"><div class="nb-acc-inner">';
    byCat[c].forEach(function(s){
      html+='<label class="nb-item"><input type="checkbox" value="'+s.id+'">'
          + '<span class="nb-item-main"><span class="nb-item-name">'+esc(s.name)+'</span>'
          + (s.description?'<span class="nb-item-desc">'+esc(s.description)+'</span>':'')+'</span>'
          + '<span class="nb-dur">'+(s.duration_min||0)+' min</span>'
          + '<span class="nb-price">'+eur(s.price)+'</span></label>'
          + (jeOtrok(s)?kolHtml('nb',s):'');
    });
    html+='</div></div></div>';
  });
  box.innerHTML=html;
  box.querySelectorAll('.nb-acc-trigger').forEach(function(btn){btn.addEventListener('click',function(){btn.closest('.nb-acc-item').classList.toggle('open');});});
  box.querySelectorAll('input[type=checkbox]').forEach(function(cb){cb.addEventListener('change',updateNbSummary);});
  kolPoveži('nb','nbServices',updateNbSummary);
}
/* ── ŠTEVILO OTROK pri otroških storitvah (enako kot pri spletnem naročanju) ── */
var KOL={nb:{},ed:{}};
function jeOtrok(s){ return (s.category||'')==='Otroci'; }
function kolGet(p,id){ var v=parseInt(KOL[p][String(id)]); return (v&&v>0)?v:1; }
function kolSet(p,id,v){ KOL[p][String(id)]=Math.min(9,Math.max(1,v)); }
function kolHtml(p,s){
  return '<div class="kol-vrsta" id="kol-'+p+'-'+s.id+'" data-sid="'+s.id+'" style="display:none">'
    +'<span class="kol-lbl">Število otrok</span>'
    +'<button type="button" class="kol-btn" data-d="-1" aria-label="Manj">−</button>'
    +'<span class="kol-n">1</span>'
    +'<button type="button" class="kol-btn" data-d="1" aria-label="Več">+</button></div>';
}
/* poveze stevce s potrditvenimi polji v danem obrazcu */
function kolPoveži(p, boxId, osveži){
  var box=document.getElementById(boxId); if(!box)return;
  box.querySelectorAll('input[type=checkbox]').forEach(function(cb){
    var st=document.getElementById('kol-'+p+'-'+cb.value);
    if(!st)return;
    function vidnost(){ st.style.display=cb.checked?'flex':'none'; if(!cb.checked)kolSet(p,cb.value,1), st.querySelector('.kol-n').textContent='1'; }
    cb.addEventListener('change',function(){ vidnost(); osveži(); });
    vidnost();
  });
  box.querySelectorAll('.kol-vrsta .kol-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.preventDefault(); e.stopPropagation();
      var vr=btn.closest('.kol-vrsta'), sid=vr.getAttribute('data-sid');
      kolSet(p, sid, kolGet(p,sid)+parseInt(btn.getAttribute('data-d')));
      vr.querySelector('.kol-n').textContent=kolGet(p,sid);
      osveži();
    });
  });
}
function nbSelected(){
  var ids=[];document.querySelectorAll('#nbServices input:checked').forEach(function(cb){ids.push(cb.value);});
  return svcSeznam(nbZapVal()).filter(function(s){return ids.indexOf(String(s.id))>=0;})
    .map(function(s){ var o=Object.assign({},s); o.kol=jeOtrok(s)?kolGet('nb',s.id):1; return o; });
}
function updateNbSummary(){
  var sel=nbSelected(),sumEl=document.getElementById('nbSummary');
  var sbx=document.getElementById('nbServices'); if(sbx&&sel.length)sbx.classList.remove('err');
  if(!sel.length){sumEl.textContent='Izberi vsaj eno storitev.';return;}
  var dur=sel.reduce(function(a,s){return a+(parseInt(s.duration_min)||0)*(s.kol||1);},0);
  var price=sel.reduce(function(a,s){return a+(parseFloat(s.price)||0)*(s.kol||1);},0);
  var start=document.getElementById('nbTime').value,endTxt='';
  if(start&&dur){var sm=toMin(start)+dur;endTxt=pad(Math.floor(sm/60))+':'+pad(sm%60);}
  sumEl.innerHTML='Skupaj: <strong>'+dur+' min</strong> · <strong>'+eur(price)+'</strong>'+(endTxt?(' · konec ob <strong>'+endTxt+'</strong>'):'');
}
function edPodpis(arr){ return arr.map(function(s){return s.id+'x'+(s.kol||1);}).sort().join(',')+'|'+edZapVal(); }
function edZapVal(){ var el=document.getElementById('edZap'); return el?el.value:((EDBK&&EDBK.zaposleni_id)||''); }
function svcVsiZa(zid,extra){ var l=svcSeznam(zid).slice(); if(zid&&ZAPMAP[zid]){ (extra||[]).forEach(function(id){ if(!l.some(function(x){return String(x.id)===String(id);})){ var sv=SERVICES.filter(function(x){return String(x.id)===String(id);})[0]; if(sv) l.push(sv); } }); } return l; }
function edZapHtml(b){
  if(vidiVse()&&ZAP.length){
    var opt=ZAP.filter(function(z){return z.aktiven||z.id===b.zaposleni_id;});
    return '<label class="nb-full" style="display:block;margin:.55rem 0 0">Zaposleni<select id="edZap">'+opt.map(function(z){return '<option value="'+z.id+'"'+(z.id===b.zaposleni_id?' selected':'')+'>'+esc(z.ime)+'</option>';}).join('')
      +'<option value=""'+(b.zaposleni_id?'':' selected')+'>— nedodeljeno (zasede vse) —</option></select></label>';
  }
  return b.zaposleni_id&&ZAPMAP[b.zaposleni_id]?'<div class="d-meta" style="margin-top:.5rem">'+zapPika(b.zaposleni_id)+esc(zapIme(b.zaposleni_id))+'</div>':'';
}
function edPodpisIzTermina(b){
  var out=[];
  String(b.services_text||b.service_name||'').split(' + ').forEach(function(tok){
    var m=String(tok).match(/^(.*?)(?:\s*[×x]\s*(\d+))?\s*$/); if(!m)return;
    var ime=(m[1]||'').trim().toLowerCase(), kol=parseInt(m[2])||1;
    var sv=SERVICES.filter(function(s){return (s.name||'').toLowerCase()===ime;})[0];
    if(sv) out.push(sv.id+'x'+kol);
  });
  return out.sort().join(',')+'|'+(b.zaposleni_id||'');
}
function edServiceMatchIds(b){
  var txt=b.services_text||b.service_name||'',ids=[];
  txt.split(' + ').forEach(function(tok){
    tok=tok.replace(/\s*[×x]\s*\d+\s*$/,'').trim(); if(!tok)return;
    var m=SERVICES.filter(function(s){return (s.name||'').toLowerCase()===tok.toLowerCase();})[0];
    if(m&&ids.indexOf(String(m.id))<0)ids.push(String(m.id));
  });
  if(!ids.length&&b.service_id)ids.push(String(b.service_id));
  return ids;
}
function buildEdServices(preIds){
  var box=document.getElementById('edServices'); if(!box)return;
  preIds=preIds||[];
  if(!SERVICES.length){box.innerHTML='<div style="opacity:.6;padding:.4rem 0">Nalagam storitve …</div>';return;}
  var cats=[],byCat={};
  svcVsiZa(edZapVal(),preIds).forEach(function(s){if(!byCat[s.category]){byCat[s.category]=[];cats.push(s.category);}byCat[s.category].push(s);});
  var html='';
  cats.forEach(function(c){
    var isNujni=(c||'').toLowerCase().indexOf('nujni')>=0;
    var anyChecked=byCat[c].some(function(s){return preIds.indexOf(String(s.id))>=0;});
    html+='<div class="nb-acc-item'+(anyChecked?' open':'')+'" data-cat="'+esc(c)+'">'
        + '<button class="nb-acc-trigger" type="button"><span class="nb-acc-cat'+(isNujni?' nujni':'')+'">'+esc(c)+'</span><span class="nb-acc-arr" aria-hidden="true">+</span></button>'
        + '<div class="nb-acc-body"><div class="nb-acc-inner">';
    byCat[c].forEach(function(s){
      var chk=preIds.indexOf(String(s.id))>=0?' checked':'';
      html+='<label class="nb-item"><input type="checkbox" value="'+s.id+'"'+chk+'>'
          + '<span class="nb-item-main"><span class="nb-item-name">'+esc(s.name)+'</span>'
          + (s.description?'<span class="nb-item-desc">'+esc(s.description)+'</span>':'')+'</span>'
          + '<span class="nb-dur">'+(s.duration_min||0)+' min</span>'
          + '<span class="nb-price">'+eur(s.price)+'</span></label>'
          + (jeOtrok(s)?kolHtml('ed',s):'');
    });
    html+='</div></div></div>';
  });
  box.innerHTML=html;
  box.querySelectorAll('.nb-acc-trigger').forEach(function(btn){btn.addEventListener('click',function(){btn.closest('.nb-acc-item').classList.toggle('open');});});
  box.querySelectorAll('input[type=checkbox]').forEach(function(cb){cb.addEventListener('change',edSyncEnd);});
  kolPoveži('ed','edServices',edSyncEnd);
  /* pri urejanju pokazi ze vpisano stevilo otrok */
  box.querySelectorAll('.kol-vrsta').forEach(function(vr){
    var sid=vr.getAttribute('data-sid'), cb=box.querySelector('input[value="'+sid+'"]');
    if(cb&&cb.checked){ vr.style.display='flex'; vr.querySelector('.kol-n').textContent=kolGet('ed',sid); }
  });
}
function edSelected(){
  var ids=[];document.querySelectorAll('#edServices input:checked').forEach(function(cb){ids.push(cb.value);});
  return svcVsiZa(edZapVal(),ids).filter(function(s){return ids.indexOf(String(s.id))>=0;})
    .map(function(s){ var o=Object.assign({},s); o.kol=jeOtrok(s)?kolGet('ed',s.id):1; return o; });
}
/* iz besedila rezervacije prebere ze vpisano stevilo otrok (npr. "Otrosko strizenje ×3") */
function edKolIzTermina(b){
  KOL.ed={};
  String(b.services_text||'').split(' + ').forEach(function(tok){
    var m=String(tok).match(/^(.*?)\s*[×x]\s*(\d+)\s*$/); if(!m)return;
    var ime=m[1].trim().toLowerCase();
    var sv=SERVICES.filter(function(s){return (s.name||'').toLowerCase()===ime;})[0];
    if(sv) kolSet('ed', sv.id, parseInt(m[2])||1);
  });
}
function edSyncEnd(){
  var stEl=document.getElementById('edTime'),endEl=document.getElementById('edEnd'); if(!stEl||!endEl)return;
  var st=stEl.value,sel=edSelected(),dur;
  var origIds=EDBK?edPodpisIzTermina(EDBK):'';
  var selIds=edPodpis(sel);
  if(EDBK&&selIds===origIds&&parseInt(EDBK.total_duration_min)) dur=parseInt(EDBK.total_duration_min);
  else dur=sel.reduce(function(a,s){return a+(parseInt(s.duration_min)||0)*(s.kol||1);},0);
  if(st&&dur>0){var sm=toMin(st)+dur;endEl.value=pad(Math.floor(sm/60))+':'+pad(sm%60);}
  updateEdSummary();
}
function updateEdSummary(){
  var sel=edSelected(),sumEl=document.getElementById('edSummary'); if(!sumEl)return;
  if(!sel.length){sumEl.textContent='Izberite vsaj eno storitev.';return;}
  var st=document.getElementById('edTime').value,en=document.getElementById('edEnd').value;
  var origIds=EDBK?edPodpisIzTermina(EDBK):'';
  var selIds=edPodpis(sel);
  var price=(EDBK&&selIds===origIds)?(parseFloat(EDBK.total_price)||0):sel.reduce(function(a,s){return a+(parseFloat(s.price)||0)*(s.kol||1);},0);
  var dur=(st&&en)?(toMin(en)-toMin(st)):0;
  sumEl.innerHTML='Skupaj: <strong>'+(dur>0?dur:0)+' min</strong> · <strong>'+eur(price)+'</strong>'+(en?(' · konec ob <strong>'+en+'</strong>'):'');
}
function openNew(zid){
  if(typeof zid!=='string') zid=null;
  KOL.nb={};
  document.getElementById('nbDate').value=isoOf(cur);
  ['nbTime','nbName','nbPhone','nbEmail','nbNote'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('nbMsg').textContent='';document.getElementById('nbMsg').className='msg';
  var nbTelMsg=document.getElementById('nbPhoneMsg'); nbTelMsg.textContent=''; nbTelMsg.className='tel-msg';
  delete document.getElementById('nbPhone').dataset.potrjeno;
  if(window.AppTel) AppTel.povezi(document.getElementById('nbPhone'), nbTelMsg);
  pripraviNbZap(zid);
  buildNbServices();
  document.getElementById('nbSummary').textContent='Izberi vsaj eno storitev.';
  document.getElementById('newbk').classList.remove('hidden');
  loadCustomersThen(populateCustDatalist);
}
/* Okno opravka: opis, vrivanje termina kljub opravku, brisanje */
function odpriOpravek(bl){
  var ov=document.getElementById('opravekOverlay'); if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='opravekOverlay'; ov.className='overlay';
  ov.innerHTML='<div class="pop op-pop">'
    +'<div class="ui-top"><h3 style="margin:0">Opravek</h3><button type="button" class="ui-x" id="opZapri">✕</button></div>'
    +'<p class="uvoz-sub">'+esc(prettyDate(bl.block_date))+' · '+esc(hm(bl.start_time))+'–'+esc(hm(bl.end_time))+(bl.zaposleni_id?' · '+zapPika(bl.zaposleni_id)+esc(zapIme(bl.zaposleni_id)):(ZAP.length?' · cel salon':''))+'</p>'
    +'<label class="op-lab">Za kakšen opravek gre?'
    +'<input type="text" id="opOpis" value="'+esc(bl.note||'')+'" placeholder="npr. malica, dostava, zdravnik, dopust"></label>'
    +'<div class="op-btns">'
    +'<button type="button" class="btn op-shrani" id="opShrani">Shrani opis</button>'
    +'<button type="button" class="btn op-vrini" id="opVrini">+ Vrini termin ob '+esc(hm(bl.start_time))+'</button>'
    +'<button type="button" class="btn op-brisi" id="opBrisi">🗑 Odstrani opravek</button>'
    +'</div><div id="opMsg" class="uvoz-sub"></div></div>';
  document.body.appendChild(ov);
  document.getElementById('opZapri').onclick=function(){ov.remove();};
  document.getElementById('opShrani').onclick=function(){
    var v=document.getElementById('opOpis').value.trim(), m=document.getElementById('opMsg'); this.disabled=true;
    sb.from('blocks').update({note:v||null}).eq('id',bl.id).then(function(r){
      if(r.error){m.textContent='Napaka: '+r.error.message;document.getElementById('opShrani').disabled=false;return;}
      ov.remove(); load();
    });
  };
  document.getElementById('opVrini').onclick=function(){
    ov.remove();
    openNewAt(bl.block_date, hm(bl.start_time), bl.zaposleni_id||null);
    var m=document.getElementById('nbMsg');
    if(m){m.textContent='Opomba: ob tej uri je vpisan opravek – termin bo vseeno vnesen.';m.className='msg';}
  };
  document.getElementById('opBrisi').onclick=function(){
    if(!confirm('Odstranim ta opravek?'))return;
    sb.from('blocks').delete().eq('id',bl.id).then(function(r){
      if(r.error){alert('Napaka: '+r.error.message);return;}
      ov.remove(); load();
    });
  };
}
function openNewAt(dateISO,timeStr,zid){
  openNew(zid||null);
  if(dateISO)document.getElementById('nbDate').value=dateISO;
  if(timeStr){document.getElementById('nbTime').value=timeStr;updateNbSummary();}
}
function saveNew(){
  var sel=nbSelected(),msg=document.getElementById('nbMsg');msg.className='msg';
  var dateEl=document.getElementById('nbDate'),timeEl=document.getElementById('nbTime'),nameEl=document.getElementById('nbName'),phoneEl=document.getElementById('nbPhone'),svcBox=document.getElementById('nbServices');
  var date=dateEl.value,start=timeEl.value;
  var name=nameEl.value.trim(),phone=phoneEl.value.trim();
  var email=document.getElementById('nbEmail').value.trim(),note=document.getElementById('nbNote').value.trim();
  [svcBox,dateEl,timeEl,nameEl,phoneEl].forEach(function(el){if(el)el.classList.remove('err');});
  var bad=false;
  if(!sel.length){svcBox.classList.add('err');bad=true;}
  if(!date){dateEl.classList.add('err');bad=true;}
  if(!start){timeEl.classList.add('err');bad=true;}
  if(!name){nameEl.classList.add('err');bad=true;}
  if(!phone){phoneEl.classList.add('err');bad=true;}
  if(bad){msg.textContent='Prosimo, izpolnite vsa obvezna polja.';msg.className='msg err';return;}
  var tp=adminTel(phoneEl, document.getElementById('nbPhoneMsg'));
  if(tp.ustavi){msg.textContent='Preverite telefonsko številko (opozorilo pod poljem).';msg.className='msg err';return;}
  phone=tp.vrednost; msg.textContent=''; msg.className='msg';
  var dur=sel.reduce(function(a,s){return a+(parseInt(s.duration_min)||0)*(s.kol||1);},0);
  var price=sel.reduce(function(a,s){return a+(parseFloat(s.price)||0)*(s.kol||1);},0);
  var em=toMin(start)+dur,end=pad(Math.floor(em/60))+':'+pad(em%60);
  var gapAfter=0,gapDuration=0,gapSvc=null;
  sel.forEach(function(s){var gd=parseInt(s.gap_duration_min)||0,ga=parseInt(s.gap_after_min)||0;if(gd>0&&ga>0){if(!gapSvc||gd>(parseInt(gapSvc.gap_duration_min)||0))gapSvc=s;}});
  if(gapSvc){var ga=parseInt(gapSvc.gap_after_min)||0,gd=parseInt(gapSvc.gap_duration_min)||0;if(ga+gd<=dur){gapAfter=ga;gapDuration=gd;}}
  var rec={service_id:sel[0].id,service_name:sel[0].name,
    services_text:sel.map(function(s){return s.name+((s.kol||1)>1?(' ×'+s.kol):'');}).join(' + '),
    total_price:parseFloat(price.toFixed(2)),total_duration_min:dur,gap_after_min:gapAfter,gap_duration_min:gapDuration,
    customer_name:name,customer_phone:phone||null,customer_email:email||null,
    booking_date:date,start_time:start,end_time:end,status:'potrjeno',note:note||null,zaposleni_id:nbZapVal()||null};
  var btn=document.getElementById('nbSave');btn.disabled=true;btn.textContent='Shranjujem …';
  sb.from('bookings').insert([rec]).then(function(res){
    btn.disabled=false;btn.textContent='Shrani rezervacijo';
    if(res.error){msg.textContent='Napaka: '+res.error.message;msg.className='msg err';return;}
    document.getElementById('newbk').classList.add('hidden');
    var p=date.split('-');cur=new Date(+p[0],+p[1]-1,+p[2]);miniRef=new Date(cur);mode='day';setSeg('day');load();
  });
}
document.getElementById('newBtn').addEventListener('click',openNew);
document.getElementById('newClose').addEventListener('click',function(){document.getElementById('newbk').classList.add('hidden');});
document.getElementById('nbCancel').addEventListener('click',function(){document.getElementById('newbk').classList.add('hidden');});
document.getElementById('newbk').addEventListener('click',function(e){if(e.target.id==='newbk')document.getElementById('newbk').classList.add('hidden');});
document.getElementById('nbTime').addEventListener('change',updateNbSummary);
document.getElementById('nbZap').addEventListener('change',function(){ var ids=[];document.querySelectorAll('#nbServices input:checked').forEach(function(cb){ids.push(cb.value);}); buildNbServices();
  ids.forEach(function(id){ var cb=document.querySelector('#nbServices input[value="'+id+'"]'); if(cb){ cb.checked=true; var it=cb.closest('.nb-acc-item'); if(it) it.classList.add('open'); } }); kolPoveži('nb','nbServices',updateNbSummary); updateNbSummary(); });
['nbDate','nbTime','nbName','nbPhone'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener('input',function(){el.classList.remove('err');});});
document.getElementById('nbName').addEventListener('change',fillFromCustomer);
document.getElementById('nbSave').addEventListener('click',saveNew);

sb.auth.getSession().then(function(res){if(res.data&&res.data.session)showApp(res.data.session);else showLogin();});
