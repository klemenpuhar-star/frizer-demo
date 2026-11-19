(function(){
'use strict';
/* polja z napako se očistijo ob vnosu (namesto vgrajenega oninput) */
document.addEventListener('input', function(e){ if(e.target && (e.target.id==='fName' || e.target.id==='fPhone')) e.target.classList.remove('err'); });

/* ── KONFIGURACIJA ──────────────────────────────────────── */
var SB_URL=APP.supabaseUrl;
var SB_KEY=APP.supabaseKey;

/* Delovni čas: 0=ned, 1=pon ... 6=sob */
var DELOVNI_CAS = {
  1: { start: '14:00', end: '20:00' },  // pon
  2: { start: '08:00', end: '15:00' },  // tor
  3: { start: '14:00', end: '20:00' },  // sre
  4: { start: '14:00', end: '20:00' },  // čet
  5: { start: '08:00', end: '15:00' },  // pet
  6: 'dogovor'                          // sob – brez spletnih terminov
  // 0 = ned: zaprto
};

/* ── SUPABASE ───────────────────────────────────────────── */
var sb = supabase.createClient(SB_URL, SB_KEY);

/* ── STATE ──────────────────────────────────────────────── */
var state = {
  step: 1,
  totalSteps: 5,
  service: null,
  date: null,
  slot: null,       // { start, end }
  customer: {},
  isNujni: false,
  nujniNote: ''
};

/* ── VIR OBISKA (v40) ────────────────────────────────────────
   Od kod je stranka prisla: oznaka v povezavi (?utm_source=instagram&utm_medium=organic&utm_campaign=bio)
   ali stran, ki jo je poslala (Google, Instagram, Facebook, ChatGPT …). Prebere se ob odprtju strani,
   NIC se ne shranjuje v brskalnik (ni piskotkov). Zapise se samo ob uspesni rezervaciji, v locenem klicu. */
var VIR_OBISKA = (function(){
  try{
    var q = new URLSearchParams(location.search), cist = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,30); };
    if(q.get('utm_source')) return 'utm:'+cist(q.get('utm_source'))+'/'+cist(q.get('utm_medium'))+'/'+cist(q.get('utm_campaign'));
    if(q.get('gclid')) return 'google-oglas';
    var ref=''; try{ ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; }catch(e){}
    if(ref && ref.replace(/^www\./,'')===location.hostname.replace(/^www\./,'')) ref='';
    if(q.get('fbclid') && !ref) return 'facebook';
    if(!ref) return 'direktno';
    var znani=[['instagram','instagram'],['facebook','facebook'],['fb.','facebook'],['messenger','facebook'],['google','google'],['bing','bing'],
               ['chatgpt','chatgpt'],['openai','chatgpt'],['perplexity','perplexity'],['gemini','gemini'],['tiktok','tiktok'],['youtube','youtube'],['whatsapp','whatsapp']];
    for(var i=0;i<znani.length;i++){ if(ref.indexOf(znani[i][0])>=0) return znani[i][1]; }
    return 'ref:'+ref.slice(0,40);
  }catch(e){ return ''; }
})();

/* ── HELPERS ─────────────────────────────────────────────── */
function timeToMin(t){ var p=t.split(':'); return +p[0]*60+ +p[1]; }
function minToTime(m){ var h=Math.floor(m/60),mi=m%60; return (h<10?'0':'')+h+':'+(mi<10?'0':'')+mi; }

var SL_MESECI = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December'];
var SL_DNEVI_K = ['Ne','Po','To','Sr','Če','Pe','So'];

function fmtDate(d){
  if(!d) return '';
  var dd=d.getDate(), mm=d.getMonth()+1, yyyy=d.getFullYear();
  return (dd<10?'0':'')+dd+'.'+(mm<10?'0':'')+mm+'.'+yyyy;
}
function isoDate(d){ return d.getFullYear()+'-'+(d.getMonth()+1<10?'0':'')+(d.getMonth()+1)+'-'+(d.getDate()<10?'0':'')+d.getDate(); }

/* ── DOM ────────────────────────────────────────────────── */
var overlay = document.getElementById('bkOverlay');
var body    = document.getElementById('bkBody');
var foot    = document.getElementById('bkFoot');
var stepBar = document.getElementById('bkStepBar');

function openModal(){
  if(!APP.salonId){ APP.ready.then(function(ok){ if(ok) openModal(); }); return; }
  state = { step:1, totalSteps:4, service:null, date:null, slot:null, customer:{}, isNujni:false, nujniNote:'', selectedIds:{}, selectedServices:[], allServices:[], qty:{}, zap:null };
  overlay.classList.add('open');
  document.body.style.overflow='hidden';
  renderStep();
}
function closeModal(){
  overlay.classList.remove('open');
  document.body.style.overflow='';
}

document.querySelectorAll('.open-modal').forEach(function(b){
  b.addEventListener('click', openModal);
});
document.getElementById('bkClose').addEventListener('click', closeModal);
overlay.addEventListener('click', function(e){ if(e.target===overlay) closeModal(); });
document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeModal(); });

/* ── STEP BAR ─────────────────────────────────────────────── */
function renderStepBar(){
  var n = state.isNujni ? 3 : state.totalSteps;
  stepBar.innerHTML = '';
  for(var i=1;i<=n;i++){
    var d=document.createElement('div');
    d.className='bk-step-dot'+(i<state.step?' done':i===state.step?' active':'');
    stepBar.appendChild(d);
  }
}

/* ── RENDER STEP ─────────────────────────────────────────── */
function renderStep(){
  renderStepBar();
  body.innerHTML = '';
  foot.innerHTML = '';

  var s = state.step;

  var modalEl = document.getElementById('bkModal');
  if(modalEl){
    if(s===2 && !state.isNujni) modalEl.classList.add('bk-modal-wide');
    else modalEl.classList.remove('bk-modal-wide');
  }

  if(s===1) renderStep1();
  else if(s===2) state.isNujni ? renderStepNujni() : renderStep2();
  else if(s===3) state.isNujni ? renderStepCustomer() : renderStep3();
  else if(s===4) state.isNujni ? renderStepConfirm() : renderStepCustomer();
  else if(s===5) renderStepConfirm();

  body.scrollTop = 0;
  document.getElementById('bkModal').scrollTop = 0;
}

/* ── STEP 1: STORITEV (multi-select accordion) ──────────────── */
function renderStep1(){
  body.innerHTML = '<div class="bk-step-label">Korak 1</div><div class="bk-step-title">Izbira storitev</div><div class="bk-loading">Nalagam storitve…</div>';
  foot.innerHTML = '';

  sb.from('services')
    .select('id,name,description,price,category,sort_order,duration_min,requires_base,is_base,active,gap_after_min,gap_duration_min')
    .eq('active', true)
    .eq('salon_id', APP.salonId)
    .order('sort_order', { ascending: true })
    .then(function(res){
      if(res.error){ showBodyError('Napaka pri nalaganju storitev: '+res.error.message); return; }
      var services = res.data || [];
      if(!services.length){ body.innerHTML='<p style="opacity:.6;font-size:.9rem">Ni razpoložljivih storitev.</p>'; return; }

      state.allServices = services;
      if(!state.selectedIds) state.selectedIds = {};

      var catMap = {};
      services.forEach(function(sv){
        var c = sv.category || 'Ostalo';
        if(!catMap[c]) catMap[c] = { minSort: sv.sort_order, items: [] };
        if(sv.sort_order < catMap[c].minSort) catMap[c].minSort = sv.sort_order;
        catMap[c].items.push(sv);
      });
      var catNames = Object.keys(catMap).sort(function(a,b){
        var aN = APP.katNujna(a) ? 99999 : catMap[a].minSort;
        var bN = APP.katNujna(b) ? 99999 : catMap[b].minSort;
        return aN - bN;
      });

      var h = '<div class="bk-step-label">Korak 1</div><div class="bk-step-title">Izbira storitev</div>';
      catNames.forEach(function(cat){
        var isNujni = APP.katNujna(cat);
        h += '<div class="bk-macc-item" data-cat="'+esc(cat)+'">'
           + '<button class="bk-macc-trigger" type="button">'
           + '<span class="bk-macc-cat'+(isNujni?' nujni':'')+'">' + esc(cat) + '</span>'
           + '<span class="bk-macc-arr" aria-hidden="true">+</span>'
           + '</button>'
           + '<div class="bk-macc-body"><div class="bk-macc-inner">';
        catMap[cat].items.forEach(function(sv){
          var checked = (state.selectedIds[sv.id]) ? ' checked' : '';
          var priceStr = (sv.price !== null && sv.price !== undefined)
            ? parseFloat(sv.price).toFixed(2).replace('.',',') + ' €' : '';
          var durStr = (sv.duration_min && sv.duration_min > 0) ? sv.duration_min + ' min' : '';
          var depId = sv.requires_base ? 'dep-'+sv.id : '';
          h += '<label class="bk-chk-row">'
             + '<input type="checkbox" data-id="'+sv.id+'"'+checked
             + (sv.requires_base ? ' data-requires-base="1"' : '')
             + (sv.is_base       ? ' data-is-base="1"' : '')
             + ' />'
             + '<span class="bk-chk-left">'
             + '<span class="bk-chk-name">'+esc(sv.name)+'</span>'
             + (sv.description ? '<span class="bk-chk-desc">'+esc(sv.description)+'</span>' : '')
             + '</span>'
             + (durStr ? '<span class="bk-chk-dur">'+durStr+'</span>' : '')
             + (priceStr ? '<span class="bk-chk-price">'+priceStr+'</span>' : '')
             + '</label>'
             + (sv.requires_base
               ? '<div class="bk-dep-inline" id="'+depId+'">⚠ Te storitve ni mogoče izbrati brez osnovne storitve!</div>'
               : '')
             + (isChildSvc(sv)
               ? '<div class="bk-qty" id="qty-'+sv.id+'" data-qid="'+sv.id+'" style="display:none">'
                 + '<span class="bk-qty-lbl">'+esc(APP.katOznakaOseb(sv.category))+'</span>'
                 + '<button type="button" class="bk-qty-btn" data-q="dec" aria-label="Manj">−</button>'
                 + '<span class="bk-qty-n" id="qtyn-'+sv.id+'">1</span>'
                 + '<button type="button" class="bk-qty-btn" data-q="inc" aria-label="Več">+</button>'
                 + '</div>'
               : '');
        });
        h += '</div></div></div>';
      });

      // bk-dep-warn je zdaj inline pod vsako vrstico – ne dodajamo globalnega
      h += '<div class="bk-sel-summary">'
         + '<div class="bk-sel-label">Izbrane storitve</div>'
         + '<div class="bk-sel-list" id="bkSelList"></div>'
         + '<div class="bk-sel-totals">'
         + '<div class="bk-sel-tot">Skupaj: <strong id="bkTotPrice">0,00 €</strong></div>'
         + '<div class="bk-sel-tot">Trajanje: <strong id="bkTotDur">0 min</strong></div>'
         + '</div></div>';

      body.innerHTML = h;

      body.querySelectorAll('.bk-macc-trigger').forEach(function(btn){
        btn.addEventListener('click', function(){
          btn.closest('.bk-macc-item').classList.toggle('open');
        });
      });

      body.querySelectorAll('input[type="checkbox"]').forEach(function(cb){
        cb.addEventListener('change', function(){
          var id = +cb.dataset.id;
          if(cb.checked) state.selectedIds[id] = true;
          else { delete state.selectedIds[id]; if(state.qty) delete state.qty[id]; }
          var qel = document.getElementById('qty-'+id);
          if(qel){
            qel.style.display = cb.checked ? '' : 'none';
            var nn = document.getElementById('qtyn-'+id); if(nn) nn.textContent = qtyOf({id:id});
          }
          updateSelSummary();
          renderFoot1();
        });
      });

      body.querySelectorAll('.bk-qty-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var wrap = btn.closest('.bk-qty'); var id = +wrap.dataset.qid;
          var cur = qtyOf({id:id});
          var nv = btn.dataset.q==='inc' ? Math.min(cur+1,6) : Math.max(cur-1,1);
          if(!state.qty) state.qty = {};
          state.qty[id] = nv;
          var nn = document.getElementById('qtyn-'+id); if(nn) nn.textContent = nv;
          updateSelSummary();
          renderFoot1();
        });
      });

      body.querySelectorAll('.bk-qty').forEach(function(q){
        var id = +q.dataset.qid;
        q.style.display = state.selectedIds[id] ? '' : 'none';
        var nn = document.getElementById('qtyn-'+id); if(nn) nn.textContent = qtyOf({id:id});
      });

      updateSelSummary();
      renderFoot1();
    });
}

function updateSelSummary(){
  var services = state.allServices || [];
  var selList  = document.getElementById('bkSelList');
  var totPrice = document.getElementById('bkTotPrice');
  var totDur   = document.getElementById('bkTotDur');
  var depWarn  = document.getElementById('bkDepWarn');
  if(!selList) return;

  var sel = services.filter(function(sv){ return state.selectedIds[sv.id]; });
  selList.textContent = sel.length ? sel.map(function(sv){ return svcLabel(sv); }).join(' + ') : '';

  var price = sumPrice(sel);
  var dur   = sumDur(sel);
  if(totPrice) totPrice.textContent = price.toFixed(2).replace('.',',') + ' €';
  if(totDur)   totDur.textContent   = dur + ' min';

  // Inline opozorila: prikaži pod vsako requires_base storitvijo, če ni izbrana is_base
  var hasBase = sel.some(function(sv){ return sv.is_base; });
  document.querySelectorAll('input[data-requires-base="1"]').forEach(function(cb){
    var id = cb.dataset.id;
    var warn = document.getElementById('dep-'+id);
    if(!warn) return;
    var thisChecked = !!state.selectedIds[+id];
    warn.classList.toggle('show', thisChecked && !hasBase);
  });
}

function checkDep(){
  var services = state.allServices || [];
  var sel = services.filter(function(sv){ return state.selectedIds[sv.id]; });
  var hasBase   = sel.some(function(sv){ return sv.is_base; });
  var needsBase = sel.some(function(sv){ return sv.requires_base; });
  return sel.length > 0 && (!needsBase || hasBase);
}

function renderFoot1(){
  foot.innerHTML = '';
  var nx = document.createElement('button');
  nx.className = 'bk-btn-next'; nx.textContent = 'Naprej →';
  var selCount = Object.keys(state.selectedIds||{}).length;
  nx.disabled = selCount === 0 || !checkDep();
  nx.addEventListener('click', function(){
    var services = state.allServices || [];
    var selArr = services.filter(function(sv){ return state.selectedIds[sv.id]; });
    if(selArr.length){
      state.service = selArr[0];
      state.isNujni = selArr.some(function(sv){ return APP.katNujna(sv.category); });
      state.selectedServices = selArr;
    }
    state.step = 2; renderStep();
  });
  foot.appendChild(nx);
}

/* ── STEP 2: TERMINSKI TRAK + IZBIRA UREUJE ─────────────── */

/* Delovni čas */
var DC = {
  1: { start: '14:00', end: '20:00' },
  2: { start: '08:00', end: '15:00' },
  3: { start: '14:00', end: '20:00' },
  4: { start: '14:00', end: '20:00' },
  5: { start: '08:00', end: '15:00' },
  6: 'dogovor'
};
var SLOT_STEP = 15; // minutni raaster za generiranje
var MIN_LEAD_MIN = 240; // najmanjsi cas vnaprej za narocanje (v minutah); prebere se iz pravil salona
APP.ready.then(function(){ var p=APP.pravila||{}; if(p.korak_min) SLOT_STEP=parseInt(p.korak_min)||15; if(p.min_ur_vnaprej!=null) MIN_LEAD_MIN=Math.round(parseFloat(p.min_ur_vnaprej)*60)||0; });

/* Delovni cas se bere iz baze (tabela delovni_cas) – zgornje vrednosti so le zasilne.
   Urnik je lahko razlicen v lihih in sodih ISO tednih (torek/sreda si izmenjata izmeno). */
var DCW = {0:{},1:{},2:{}};   /* teden (0=vsak,1=lihi,2=sodi) -> dan -> urnik */
/* Teden A ali B se steje od fiksnega ponedeljka 5.10.2026 – tako se izmenjava
   ne zalomi ob letih s 53 tedni (enako kot v bazi: app_teden_vrsta). */
function tedenVrsta(ds){
  var p=String(ds).split('-');
  var dni=Math.floor((Date.UTC(+p[0],+p[1]-1,+p[2]) - Date.UTC(2026,9,5))/86400000);
  var teden=Math.floor(dni/7);
  return (((teden%2)+2)%2===0) ? 1 : 2;
}
function dcZa(ds){
  var p=String(ds).split('-');
  var dow=new Date(+p[0],+p[1]-1,+p[2]).getDay();
  var par=tedenVrsta(ds);
  return (DCW[par] && DCW[par][dow]) || (DCW[0] && DCW[0][dow]) || DC[dow];
}
function nalozDelovniCas(){
  try{
    return sb.from('delovni_cas').select('dan,teden,nacin,od,do_').eq('salon_id', APP.salonId).then(function(res){
      if(res.error || !res.data || !res.data.length) return;
      var novi={0:{},1:{},2:{}};
      res.data.forEach(function(r){
        var d=parseInt(r.dan), t=parseInt(r.teden)||0;
        if(r.nacin==='odprto' && r.od && r.do_)
          novi[t][d]={ start:String(r.od).substring(0,5), end:String(r.do_).substring(0,5) };
        else if(r.nacin==='dogovor') novi[t][d]='dogovor';
        /* 'zaprto' -> dan ostane nedolocen */
      });
      DCW=novi;
    });
  }catch(e){ /* ob napaki ostanejo zasilne vrednosti */ }
}
APP.ready.then(function(ok){ if(ok){ nalozDelovniCas(); nalozZaposlene(); } });

/* ── ZAPOSLENI ─────────────────────────────────────────────
   Če ima salon zaposlene, stranka v koraku 2 izbere, pri kom želi termin
   (ali »kdorkoli prost«, če salon to dovoli). Prosti termini se računajo po
   urniku, odsotnostih, trajanju in cenah izbranega zaposlenega. */
var ZAP = [], ZS = {}, URN = {};
function nalozZaposlene(){
  try{
    return sb.from('app_zaposleni').select('id,ime,barva,sort_order').eq('salon_id', APP.salonId).eq('aktiven', true)
      .order('sort_order',{ascending:true}).order('ime',{ascending:true}).then(function(res){
        if(res.error || !res.data || !res.data.length){ ZAP=[]; return; }
        ZAP = res.data; var ids = ZAP.map(function(z){ return z.id; });
        return Promise.all([
          sb.from('app_zaposleni_storitve').select('zaposleni_id,service_id,cena,trajanje_min').in('zaposleni_id', ids),
          sb.from('app_urnik_zaposlenih').select('zaposleni_id,dan,teden,nacin,od,do_').in('zaposleni_id', ids)
        ]).then(function(r){
          ZS={}; URN={};
          ((r[0]&&r[0].data)||[]).forEach(function(x){ (ZS[x.zaposleni_id]=ZS[x.zaposleni_id]||{})[x.service_id]=x; });
          ((r[1]&&r[1].data)||[]).forEach(function(x){ (URN[x.zaposleni_id]=URN[x.zaposleni_id]||[]).push(x); });
        });
      });
  }catch(e){ ZAP=[]; }
}
function imaZap(){ return ZAP.length > 0; }
function izbiraObvezna(){ return ((APP.pravila||{}).izbira_zaposlenega === 'obvezno'); }
function zapIme(id){ for(var i=0;i<ZAP.length;i++){ if(ZAP[i].id===id) return ZAP[i].ime; } return ''; }
/* zaposleni, ki opravljajo vse izbrane storitve */
function kandidati(){
  var sel = getSelArrBase();
  return ZAP.filter(function(z){ return sel.every(function(s){ return ZS[z.id] && ZS[z.id][s.id]; }); });
}
function svcZa(s, z){
  if(!z || !ZS[z] || !ZS[z][s.id]) return s;
  var o = Object.assign({}, s), x = ZS[z][s.id];
  if(x.cena !== null && x.cena !== undefined) o.price = x.cena;
  if(x.trajanje_min !== null && x.trajanje_min !== undefined) o.duration_min = x.trajanje_min;
  return o;
}
function selZa(z){ return getSelArrBase().map(function(s){ return svcZa(s, z); }); }
function durZa(z){ return sumDur(selZa(z)) || 30; }
/* delovni čas zaposlenega: lasten urnik ali urnik salona */
function dcZaZ(ds, z){
  var rows = z && URN[z];
  if(!rows || !rows.length) return dcZa(ds);
  var p=String(ds).split('-'), dow=new Date(+p[0],+p[1]-1,+p[2]).getDay(), par=tedenVrsta(ds);
  var x = rows.filter(function(r){ return +r.dan===dow && +r.teden===par; })[0] || rows.filter(function(r){ return +r.dan===dow && +r.teden===0; })[0];
  if(!x) return null;
  if(x.nacin==='odprto' && x.od && x.do_) return { start:String(x.od).substring(0,5), end:String(x.do_).substring(0,5) };
  if(x.nacin==='dogovor') return 'dogovor';
  return null;
}
function zasedenoRpc(ds){
  return imaZap() ? sb.rpc('app_zasedenost',{p_slug:APP.slug, izbrani_datum:ds})
                  : sb.rpc('app_zasedeni_intervali',{p_slug:APP.slug, izbrani_datum:ds});
}
/* prosti termini: [{t, dur, z}] – brez zaposlenih kot doslej, sicer po zaposlenih */
function prostiTermini(ds, dow, rows){
  if(!imaZap()){
    var dur = getTotalDur();
    return calcFreeSlots(ds, dow, rows, dur).map(function(t){ return {t:t, dur:dur, z:null}; });
  }
  if(state.zap === null || state.zap === undefined) return [];
  var kand = state.zap ? kandidati().filter(function(z){ return z.id===state.zap; }) : kandidati();
  var po = {};
  kand.forEach(function(z){
    var d = durZa(z.id);
    var moji = rows.filter(function(b){ return !b.zaposleni_id || b.zaposleni_id===z.id; });
    calcFreeSlots(ds, dow, moji, d, dcZaZ(ds, z.id)).forEach(function(t){ if(!po[t]) po[t] = {t:t, dur:d, z:z.id}; });
  });
  return Object.keys(po).map(function(k){ return po[k]; }).sort(function(a,b){ return a.t-b.t; });
}
function cenaBesedilo(){
  if(!imaZap() || state.zap){ var tp=getTotalPrice(); return tp>0 ? tp.toFixed(2).replace('.',',')+' €' : ''; }
  var c = kandidati().map(function(z){ return sumPrice(selZa(z.id)); });
  if(!c.length) return '';
  var mn=Math.min.apply(null,c), mx=Math.max.apply(null,c);
  if(mx<=0) return '';
  return (mn===mx ? '' : 'od ')+mn.toFixed(2).replace('.',',')+' €';
}
function renderZapIzbira(){
  var box = document.getElementById('zapIzbira'); if(!box) return;
  if(!imaZap()){ box.style.display='none'; return; }
  var kand = kandidati();
  if(!kand.length){
    box.innerHTML = '<div class="bk-slot-msg" style="width:100%">Izbranih storitev ne opravlja isti zaposleni. Vrnite se in izberite manj storitev ali nas pokličite na <a href="tel:'+APP.telefonIntl+'" style="color:var(--coral)">'+esc(APP.telefon)+'</a>.</div>';
    return;
  }
  if(state.zap && !kand.some(function(z){ return z.id===state.zap; })) state.zap = null;
  if((state.zap===null||state.zap===undefined) && kand.length===1) state.zap = kand[0].id;
  if((state.zap===null||state.zap===undefined) && !izbiraObvezna()) state.zap = '';
  var h = '<div class="bk-zap-lbl">Pri kom želite termin?</div>';
  if(!izbiraObvezna() && kand.length>1) h += '<button type="button" class="bk-zap-btn'+(state.zap===''?' selected':'')+'" data-z="">Kdorkoli prost</button>';
  kand.forEach(function(z){
    h += '<button type="button" class="bk-zap-btn'+(state.zap===z.id?' selected':'')+'" data-z="'+z.id+'">'
       + (z.barva ? '<span class="pika" style="background:'+esc(z.barva)+'"></span>' : '') + esc(z.ime) + '</button>';
  });
  box.innerHTML = h;
  box.querySelectorAll('.bk-zap-btn').forEach(function(b){
    b.addEventListener('click', function(){
      state.zap = b.getAttribute('data-z'); state.slot = null; dayStatusCache = {};
      renderZapIzbira(); renderSummaryPanel(); buildStrip(); loadSlotList(); renderFoot2();
    });
  });
}

/* Slovenski dela prosti prazniki (datum -> naziv). Prebrano iz tabele prazniki;
   dokler se ne naloži, PRAZNIKI ostane prazen (koncno varovalko vedno izvede
   streznik: ustvari_rezervacijo/narocilo_popravi preko app_delovni_cas). */
var PRAZNIKI = {};
function nalozPraznike(){
  try{
    return sb.from('prazniki').select('datum,naziv').then(function(res){
      if(res.error || !res.data) return;
      var novi={};
      res.data.forEach(function(r){ novi[r.datum]=r.naziv||'praznik'; });
      PRAZNIKI=novi;
      if(document.getElementById('dayStrip')) buildStrip();
    });
  }catch(e){}
}
nalozPraznike();
function daysPerView(){ return window.innerWidth <= 600 ? 3 : 8; }
var stripOffset = 0; // offset v dnevih (0 = danes)

/* Cache za statuse dni */
var dayStatusCache = {};

function renderStep2(){
  state.slot = null;
  stripOffset = 0;
  dayStatusCache = {};
  renderSchedView();
}

function getSelArrBase(){
  return (state.selectedServices && state.selectedServices.length)
    ? state.selectedServices
    : (state.service ? [state.service] : []);
}
function getSelArr(){
  var z = (typeof state.zap === 'string' && state.zap) ? state.zap : null;
  return z ? getSelArrBase().map(function(s){ return svcZa(s, z); }) : getSelArrBase();
}
function qtyOf(s){ return (state.qty && state.qty[s.id]) ? state.qty[s.id] : 1; }
function isChildSvc(s){ return APP.katVecOseb(s.category||''); }
function svcLabel(s){ var q=qtyOf(s); return s.name + (q>1 ? (' ×'+q) : ''); }
function sumPrice(arr){ return arr.reduce(function(a,s){ return a+(parseFloat(s.price)||0)*qtyOf(s); }, 0); }
function sumDur(arr){ return arr.reduce(function(a,s){ return a+(parseInt(s.duration_min)||0)*qtyOf(s); }, 0); }
function getTotalDur(){
  return sumDur(getSelArr()) || 30;
}
function getTotalPrice(){
  return sumPrice(getSelArr());
}

function renderSchedView(){
  body.innerHTML =
    '<div class="bk-step-label">Korak 2</div>'
    +'<div class="bk-step-title" style="margin-bottom:.9rem">Izbira termina</div>'
    +'<div class="bk-zap" id="zapIzbira"></div>'
    +'<div class="bk-day-nav" id="dayNav">'
    +'<button class="bk-day-nav-btn" id="stripPrev">‹</button>'
    +'<div class="bk-day-strip-outer"><div class="bk-day-strip" id="dayStrip"></div></div>'
    +'<button class="bk-day-nav-btn" id="stripNext">›</button>'
    +'</div>'
    +'<div class="bk-sched-wrap">'
    +'<div class="bk-sched-left">'
    +'<div id="slotArea"><div class="bk-slot-msg">← Izberite dan</div></div>'
    +'</div>'
    +'<div class="bk-sched-right" id="schedSummary"></div>'
    +'</div>';

  renderZapIzbira();
  renderSummaryPanel();
  buildStrip();
  renderFoot2();

  document.getElementById('stripPrev').addEventListener('click', function(){
    stripOffset -= daysPerView(); buildStrip();
  });
  document.getElementById('stripNext').addEventListener('click', function(){
    stripOffset += daysPerView(); buildStrip();
  });

  window.onresize = function(){ if(document.getElementById('dayStrip')) buildStrip(); };
}

function buildStrip(){
  var strip  = document.getElementById('dayStrip');
  var prevBtn = document.getElementById('stripPrev');
  if(!strip) return;
  var nav = document.getElementById('dayNav'), brezIzbire = imaZap() && (state.zap===null || state.zap===undefined);
  if(nav) nav.style.display = brezIzbire ? 'none' : '';
  if(brezIzbire){ var sa=document.getElementById('slotArea'); if(sa && kandidati().length) sa.innerHTML='<div class="bk-slot-msg">Najprej izberite, pri kom želite termin.</div>'; return; }
  if(prevBtn) prevBtn.disabled = (stripOffset <= 0);

  var today = new Date(); today.setHours(0,0,0,0);
  var start = new Date(today); start.setDate(start.getDate() + stripOffset);
  var SL_DN = ['Ned','Pon','Tor','Sre','Čet','Pet','Sob'];
  var SL_M  = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];

  var cards = '';
  var per = daysPerView();
  for(var i = 0; i < per; i++){
    var d   = new Date(start); d.setDate(d.getDate()+i);
    var dow = d.getDay();
    var ds  = isoDate(d);
    var past  = d < today;
    var isSel = state.date && isoDate(state.date) === ds;

    var status = dayStatusCache[ds] || null;
    var statusHtml = '';
    var disClass = '';

    if(past){ statusHtml='<span class="bk-day-status closed">preteklo</span>'; disClass='disabled'; }
    else if(dow===0){ statusHtml='<span class="bk-day-status closed">zaprto</span>'; disClass='disabled'; }
    else if(PRAZNIKI[ds]){ statusHtml='<span class="bk-day-status closed">praznik</span>'; disClass='disabled'; }
    else if(dcZa(ds)==='dogovor'){ statusHtml='<span class="bk-day-status closed">po dogovoru</span>'; disClass='disabled'; }
    else if(status==='all'){ statusHtml='<span class="bk-day-status busy">vse zasedeno</span>'; disClass='disabled'; }
    else if(status==='free'){
      statusHtml='<span class="bk-day-status avail">'+(cenaBesedilo()||'na voljo')+'</div>';
    } else {
      // Neznano – pokaži za zdaj nevtralno, naloži asinhrono
      statusHtml='<span class="bk-day-status avail" id="dstat-'+ds+'">'+(cenaBesedilo()||'na voljo')+'</span>';
      prefetchDayStatus(ds, dow, d >= today);
    }

    cards += '<button type="button" class="bk-day-card'+(isSel?' selected':'')+(disClass?' '+disClass:'')+'" '
      +(disClass?'disabled ':'data-date="'+ds+'" data-dow="'+dow+'" ')
      +'aria-pressed="'+(isSel?'true':'false')+'">'
      +'<span class="bk-day-card-top">'
      +'<span class="bk-day-name">'+SL_DN[dow]+'</span>'
      +'<span class="bk-day-num">'+d.getDate()+'</span>'
      +'<span class="bk-day-mon">'+SL_M[d.getMonth()]+'</span>'
      +'</span>'
      +statusHtml
      +'</button>';
  }
  strip.innerHTML = cards;

  // Scroll do izbranega
  if(state.date){
    var selCard = strip.querySelector('.bk-day-card.selected');
    if(selCard) selCard.scrollIntoView({inline:'center', behavior:'smooth'});
  }

  strip.querySelectorAll('.bk-day-card:not(.disabled)').forEach(function(card){
    card.addEventListener('click', function(){
      strip.querySelectorAll('.bk-day-card').forEach(function(c){ c.classList.remove('selected'); c.setAttribute('aria-pressed','false'); });
      card.classList.add('selected'); card.setAttribute('aria-pressed','true');
      var parts = card.dataset.date.split('-');
      state.date = new Date(+parts[0],+parts[1]-1,+parts[2]);
      state.slot = null;
      renderSummaryPanel();
      loadSlotList();
      renderFoot2();
    });
  });
}

function prefetchDayStatus(ds, dow, isFuture){
  if(!isFuture || PRAZNIKI[ds] || dcZa(ds)==='dogovor' || (!imaZap() && !dcZa(ds))) return;
  var zapOb = state.zap;
  zasedenoRpc(ds).then(function(res){
    if(res.error || zapOb !== state.zap) return;
    var slots = prostiTermini(ds, dow, res.data||[]);
    var status = slots.length ? 'free' : 'all';
    dayStatusCache[ds] = status;
    var el = document.getElementById('dstat-'+ds);
    if(el){
      if(status==='all'){
        el.className='bk-day-status busy'; el.textContent='vse zasedeno';
        // Onemogoči kartico
        var card = el.closest('.bk-day-card');
        if(card){ card.classList.add('disabled'); card.removeAttribute('data-date'); card.disabled = true; }
      }
    }
  });
}

function calcFreeSlots(ds, dow, busyRaw, dur, dcIzbran){
  if(PRAZNIKI[ds]) return [];
  var dc = (dcIzbran === undefined) ? dcZa(ds) : dcIzbran;
  if(!dc || dc==='dogovor') return [];
  var wS = timeToMin(dc.start), wE = timeToMin(dc.end);
  var busy = [];
  busyRaw.forEach(function(b){
    var s = timeToMin(String(b.start_time).substring(0,5));
    var d = parseInt(b.duration_min)||0;
    var ga = parseInt(b.gap_after_min)||0;
    var gd = parseInt(b.gap_duration_min)||0;
    if(gd > 0 && ga > 0 && (ga + gd) <= d){
      // vrzel je prosta → dva zasedena dela (pred in po vrzeli)
      busy.push({s:s, e:s+ga});
      busy.push({s:s+ga+gd, e:s+d});
    } else {
      busy.push({s:s, e:s+d});
    }
  });
  busy = busy.filter(function(b){ return b.e>wS && b.s<wE; });
  busy.sort(function(a,b){ return a.s-b.s; });

  // Minimalni cas vnaprej: stranka se ne more narociti prej kot cez MIN_LEAD_MIN minut.
  // Prag racunamo kot absolutni cas (zdaj + MIN_LEAD_MIN), pretvorjen v minuto izbranega dne.
  var minStart = wS;
  var leadTs = new Date().getTime() + MIN_LEAD_MIN*60000;
  var dp = ds.split('-');
  var dayStartTs = new Date(+dp[0], (+dp[1])-1, +dp[2], 0, 0, 0, 0).getTime();
  var leadMinOfDay = Math.ceil((leadTs - dayStartTs)/60000);
  if(leadMinOfDay > minStart) minStart = leadMinOfDay;
  // Poravnaj prvi mozni termin na SLOT_STEP mrezo glede na zacetek delovnega casa
  if(minStart > wS){
    var rem = (minStart - wS) % SLOT_STEP;
    if(rem !== 0) minStart += (SLOT_STEP - rem);
  }

  var slots=[];
  for(var t=minStart; t+dur<=wE; t+=SLOT_STEP){
    var ok=true;
    for(var i=0;i<busy.length;i++){
      if(busy[i].s < t+dur && busy[i].e > t){ ok=false; break; }
    }
    if(ok) slots.push(t);
  }
  return slots;
}

function loadSlotList(){
  var area = document.getElementById('slotArea');
  if(!area) return;
  if(!state.date){ area.innerHTML='<div class="bk-slot-msg">← Izberite dan</div>'; return; }

  var ds  = isoDate(state.date);
  var dow = state.date.getDay();

  if(dow===0){ area.innerHTML='<div class="bk-slot-msg">Nedelja smo zaprti.</div>'; return; }
  if(PRAZNIKI[ds]){ area.innerHTML='<div class="bk-slot-msg">Ta dan smo zaprti zaradi praznika.</div>'; return; }
  if(dcZa(ds)==='dogovor'){
    area.innerHTML='<div class="bk-slot-msg">📞 <strong>Ta dan je po dogovoru</strong><br/>'
      +'Pokličite <a href="tel:'+APP.telefonIntl+'" style="color:var(--coral)">'+APP.telefon+'</a>.</div>';
    return;
  }

  if(imaZap() && (state.zap===null || state.zap===undefined)){ area.innerHTML='<div class="bk-slot-msg">Najprej izberite, pri kom želite termin.</div>'; return; }
  area.innerHTML='<div class="bk-slot-loading">Preverjam termine…</div>';
  var tp  = getTotalPrice();
  var zapOb = state.zap;

  zasedenoRpc(ds).then(function(res){
    if(zapOb !== state.zap) return;
    if(res.error){
      area.innerHTML='<div class="bk-error show">Napaka: '+esc(res.error.message)+'</div>';
      return;
    }
    var slots = prostiTermini(ds, dow, res.data||[]);
    dayStatusCache[ds] = slots.length ? 'free' : 'all';

    // Posodobi status kartice v traku
    var dstat = document.getElementById('dstat-'+ds);
    if(dstat && !slots.length){
      dstat.className='bk-day-status busy'; dstat.textContent='vse zasedeno';
    }

    if(!slots.length){
      area.innerHTML='<div class="bk-slot-msg">Ta dan ni prostih terminov.<br/>Izberite drug datum.</div>';
      return;
    }

    var SL_DN_FULL=['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota'];
    var SL_M_FULL=['januarja','februarja','marca','aprila','maja','junija','julija','avgusta','septembra','oktobra','novembra','decembra'];
    var dayLabel = SL_DN_FULL[dow]+', '+state.date.getDate()+'. '+SL_M_FULL[state.date.getMonth()];
    var priceStr = tp>0 ? tp.toFixed(2).replace('.',',')+ ' €' : '';

    var h='<div class="bk-slot-list">';
    var first=true;
    slots.forEach(function(o){
      var t=o.t, ts=minToTime(t);
      var sel=state.slot&&state.slot.start===ts;
      h+='<button type="button" class="bk-slot-row'+(sel?' selected':'')+'" aria-pressed="'+(sel?'true':'false')+'" data-s="'+ts+'" data-e="'+minToTime(t+o.dur)+'">'
        +'<span class="bk-slot-time">'+ts+'</span>'
        +'</button>';
      first=false;
    });
    h+='</div>';
    area.innerHTML=h;

    area.querySelectorAll('.bk-slot-row').forEach(function(row){
      row.addEventListener('click',function(){
        state.slot={start:row.dataset.s, end:row.dataset.e};
        area.querySelectorAll('.bk-slot-row').forEach(function(r){ r.classList.remove('selected'); r.setAttribute('aria-pressed','false'); });
        row.classList.add('selected'); row.setAttribute('aria-pressed','true');
        renderSummaryPanel();
        renderFoot2();
      });
    });
  });
}

function renderSummaryPanel(){
  var panel=document.getElementById('schedSummary');
  if(!panel) return;
  var selArr=getSelArr();
  var tp=getTotalPrice();
  var SL_DN_FULL=['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota'];
  var SL_M=['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];

  var dateStr='';
  if(state.date) dateStr=SL_DN_FULL[state.date.getDay()]+', '+state.date.getDate()+'. '+SL_M[state.date.getMonth()];
  if(state.slot) dateStr+=' ob '+state.slot.start;

  var h='<div class="bk-sum-hd">Povzetek</div>';
  h+='<div class="bk-sum-date">'+(dateStr||'<span style="opacity:.75">Termin ni izbran</span>')+'</div>';
  if(imaZap() && state.zap!==null && state.zap!==undefined) h+='<div class="bk-sum-svc"><span>'+(state.zap?'Pri: '+esc(zapIme(state.zap)):'Kdorkoli prost')+'</span></div>';
  selArr.forEach(function(sv){
    h+='<div class="bk-sum-svc"><span>'+esc(sv.name)+'</span>'
      +(sv.price?'<span>'+parseFloat(sv.price).toFixed(2).replace('.',',')+'€</span>':'')
      +'</div>';
  });
  var ctxt=cenaBesedilo();
  if(tp>0) h+='<div class="bk-sum-total"><span>Skupaj</span><span>'+(ctxt||(tp.toFixed(2).replace('.',',')+' €'))+'</span></div>';
  panel.innerHTML=h;
}

function renderFoot2(){
  foot.innerHTML='';
  var bk=document.createElement('button');
  bk.className='bk-btn-back'; bk.textContent='← Storitve';
  bk.addEventListener('click',function(){ state.step=1; renderStep(); });
  foot.appendChild(bk);
  var nx=document.createElement('button');
  nx.className='bk-btn-next'; nx.textContent='Naprej →';
  nx.disabled=!state.date||!state.slot;
  nx.addEventListener('click',function(){ state.step=3; renderStep(); });
  foot.appendChild(nx);
}

function renderStep3(){ renderStepCustomer(); }
function renderFoot3(){ }

/* ── STEP NUJNI TERMIN ─────────────────────────────────────── */
function renderStepNujni(){
  body.innerHTML='<div class="bk-step-label">Nujni termin</div><div class="bk-step-title">Dogovor po klicu</div>'
    +'<div class="bk-nujni-box"><div class="bk-nujni-label">📞 Po dogovoru</div>'
    +'Po oddaji obrazca vas pokličemo za potrditev termina. Vpišite nam vaš želeni datum in čas.</div>'
    +'<div class="bk-field"><label class="bk-label">Željeni datum in čas *</label>'
    +'<input class="bk-input" id="nujniNote" type="text" placeholder="npr. Četrtek 12. junij, med 10 in 12" value="'+esc(state.nujniNote||'')+'"></div>';
  foot.innerHTML='';
  var bk=document.createElement('button'); bk.className='bk-btn-back'; bk.textContent='← Nazaj';
  bk.addEventListener('click',function(){ state.step=1; renderStep(); });
  foot.appendChild(bk);
  var nx=document.createElement('button'); nx.className='bk-btn-next'; nx.textContent='Naprej →';
  nx.addEventListener('click',function(){
    var v=document.getElementById('nujniNote').value.trim();
    if(!v){ document.getElementById('nujniNote').classList.add('err'); return; }
    state.nujniNote=v; state.step=3; renderStep();
  });
  foot.appendChild(nx);
}

/* ── STEP CUSTOMER ─────────────────────────────────────────── */
function renderStepCustomer(){
  var c=state.customer;
  body.innerHTML='<div class="bk-step-label">Korak '+(state.isNujni?3:4)+'</div><div class="bk-step-title">Vaši podatki</div>'
    +'<div id="bkErr" class="bk-error"></div>'
    +'<div class="bk-field"><label class="bk-label" for="fName">Ime in priimek *</label>'
    +'<input class="bk-input" id="fName" type="text" autocomplete="name" autocapitalize="words" placeholder="Maja Novak" value="'+esc(c.name||'')+'"></div>'
    +'<div class="bk-field"><label class="bk-label" for="fPhone">Telefon *</label>'
    +'<input class="bk-input" id="fPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="npr. 040 123 456" value="'+esc(c.phone||'')+'">'
    +'<div class="tel-msg" id="fPhoneMsg"></div></div>'
    +'<div class="bk-field"><label class="bk-label" for="fEmail">E-pošta</label>'
    +'<input class="bk-input" id="fEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="maja@email.si" value="'+esc(c.email||'')+'"></div>'
    +'<div class="bk-field"><label class="bk-label" for="fNote">Opomba</label>'
    +'<textarea class="bk-textarea" id="fNote" placeholder="Posebne želje ali vprašanja…">'+esc(c.note||'')+'</textarea></div>';
  foot.innerHTML='';
  var telEl=document.getElementById('fPhone'), telMsg=document.getElementById('fPhoneMsg');
  if(window.AppTel) AppTel.povezi(telEl, telMsg);
  var bk=document.createElement('button'); bk.className='bk-btn-back'; bk.textContent='← Nazaj';
  bk.addEventListener('click',function(){ state.step=state.isNujni?2:3; renderStep(); });
  foot.appendChild(bk);
  var nx=document.createElement('button'); nx.className='bk-btn-next'; nx.textContent='Pregled →';
  nx.addEventListener('click',function(){
    var name=document.getElementById('fName').value.trim();
    var phone=document.getElementById('fPhone').value.trim();
    var errEl=document.getElementById('bkErr');
    document.getElementById('fName').classList.remove('err');
    document.getElementById('fPhone').classList.remove('err');
    if(!name||!phone){
      if(!name) document.getElementById('fName').classList.add('err');
      if(!phone) document.getElementById('fPhone').classList.add('err');
      errEl.textContent='Prosimo, izpolnite vsa obvezna polja.'; errEl.classList.add('show'); return;
    }
    /* preverjanje telefonske stevilke: napaka ustavi, opozorilo (npr. stacionarna) ustavi samo prvic */
    if(window.AppTel){
      if(!telEl._appTel) AppTel.povezi(telEl, telMsg);
      var tr=AppTel.preveri(phone);
      if(tr.stanje==='napaka'){
        AppTel.prikazi(telEl, telMsg, tr); telEl.focus();
        errEl.textContent='Preverite telefonsko številko.'; errEl.classList.add('show'); return;
      }
      var zePrikazano = telMsg.classList.contains('tel-opozorilo') && telEl.dataset.potrjeno===tr.zapis;
      telEl.value=tr.zapis; phone=tr.zapis;
      if(tr.stanje==='opozorilo' && !zePrikazano){
        AppTel.prikazi(telEl, telMsg, tr);
        telMsg.textContent+=' Če je številka pravilna, kliknite »Pregled« še enkrat.';
        telEl.dataset.potrjeno=tr.zapis; return;
      }
      errEl.classList.remove('show');
    }
    state.customer={name:name,phone:phone,email:document.getElementById('fEmail').value.trim(),note:document.getElementById('fNote').value.trim()};
    state.step=state.isNujni?4:5; renderStep();
  });
  foot.appendChild(nx);
}

/* ── STEP CONFIRM ─────────────────────────────────────────── */
function renderStepConfirm(){
  var c=state.customer; var sv=state.service;
  var rows='';
  var allNames = (state.selectedServices&&state.selectedServices.length ? state.selectedServices : [sv]).map(function(s){ return svcLabel(s); }).join(' + ');
  rows+='<div class="bk-sum-row"><span class="bk-sum-key">Storitev</span><span class="bk-sum-val">'+esc(allNames)+'</span></div>';
  var selArr2 = state.isNujni ? getSelArrBase() : getSelArr();
  var totalPrice2 = sumPrice(selArr2);
  if(totalPrice2>0) rows+='<div class="bk-sum-row"><span class="bk-sum-key">Cena</span><span class="bk-sum-val">'+((!state.isNujni&&cenaBesedilo())||(totalPrice2.toFixed(2).replace('.',',')+' €'))+'</span></div>';
  if(!state.isNujni && imaZap()) rows+='<div class="bk-sum-row"><span class="bk-sum-key">Pri</span><span class="bk-sum-val">'+(state.zap?esc(zapIme(state.zap)):'kdorkoli prost')+'</span></div>';
  if(state.isNujni){
    rows+='<div class="bk-sum-row"><span class="bk-sum-key">Termin</span><span class="bk-sum-val">Po dogovoru</span></div>';
    rows+='<div class="bk-sum-row"><span class="bk-sum-key">Želja</span><span class="bk-sum-val">'+esc(state.nujniNote)+'</span></div>';
  } else {
    rows+='<div class="bk-sum-row"><span class="bk-sum-key">Datum</span><span class="bk-sum-val">'+fmtDate(state.date)+'</span></div>';
    rows+='<div class="bk-sum-row"><span class="bk-sum-key">Čas</span><span class="bk-sum-val">'+state.slot.start+' – '+state.slot.end+'</span></div>';
  }
  rows+='<div class="bk-sum-row"><span class="bk-sum-key">Ime</span><span class="bk-sum-val">'+esc(c.name)+'</span></div>';
  rows+='<div class="bk-sum-row"><span class="bk-sum-key">Telefon</span><span class="bk-sum-val">'+esc(c.phone)+'</span></div>';
  if(c.email) rows+='<div class="bk-sum-row"><span class="bk-sum-key">E-pošta</span><span class="bk-sum-val">'+esc(c.email)+'</span></div>';
  if(c.note||state.nujniNote) rows+='<div class="bk-sum-row"><span class="bk-sum-key">Opomba</span><span class="bk-sum-val">'+esc(c.note||state.nujniNote)+'</span></div>';

  body.innerHTML='<div class="bk-step-label">Korak '+(state.isNujni?4:5)+'</div><div class="bk-step-title">Potrditev</div>'
    +'<div id="bkErr2" class="bk-error"></div>'
    +'<div class="bk-summary">'+rows+'</div>'
    +'<p class="bk-pogoj">S potrditvijo se strinjate, da nas pokličete v primeru odpovedi vsaj 2 uri pred terminom.</p>';

  foot.innerHTML='';
  var bk=document.createElement('button'); bk.className='bk-btn-back'; bk.textContent='← Nazaj';
  bk.addEventListener('click',function(){ state.step=state.isNujni?3:4; renderStep(); });
  foot.appendChild(bk);
  var nx=document.createElement('button'); nx.className='bk-btn-next'; nx.textContent='Potrdi naročilo';
  nx.addEventListener('click',function(){ submitBooking(nx); });
  foot.appendChild(nx);
}

/* ── SUBMIT ─────────────────────────────────────────────── */
function submitBooking(btn){
  btn.disabled=true; btn.textContent='Pošiljam…';
  var sv=state.service; var c=state.customer;
  var selArr = state.selectedServices && state.selectedServices.length ? state.selectedServices : [sv];

  var servicesText = selArr.map(function(s){ return svcLabel(s); }).join(' + ');
  var totalPrice   = sumPrice(selArr);
  var totalDur     = sumDur(selArr);

  // Vmesni prosti čas (vrzel) – velja tudi za kombinacije (npr. barvanje + striženje/fen)
  var gapAfter = 0, gapDuration = 0;
  var gapSvc = null;
  selArr.forEach(function(s){
    var gd = parseInt(s.gap_duration_min)||0;
    var ga = parseInt(s.gap_after_min)||0;
    if(gd > 0 && ga > 0){
      if(!gapSvc || gd > (parseInt(gapSvc.gap_duration_min)||0)) gapSvc = s;
    }
  });
  if(gapSvc){
    var gsa = parseInt(gapSvc.gap_after_min)||0;
    var gsd = parseInt(gapSvc.gap_duration_min)||0;
    if((gsa + gsd) <= totalDur){ gapAfter = gsa; gapDuration = gsd; }
  }

  var mtoken = null;
  var storitveArr = selArr.map(function(s){ return { id: s.id, qty: qtyOf(s) }; });
  var rpcArgs = {
    storitve: storitveArr,
    datum:    state.isNujni ? null : isoDate(state.date),
    zacetek:  state.isNujni ? null : state.slot.start,
    ime:      c.name,
    telefon:  c.phone,
    epota:    c.email || null,
    opomba:   state.isNujni ? (state.nujniNote + (c.note ? ('\n'+c.note) : '')) : (c.note || null),
    nujni:    !!state.isNujni,
    p_slug:   APP.slug
  };
  var fn = 'app_oddaj_narocilo';
  if(imaZap() && !state.isNujni){ fn = 'app_oddaj_termin'; rpcArgs.p_zaposleni = state.zap || null; }

  sb.rpc(fn, rpcArgs).then(function(res){
    var r = res.data || {};
    if(res.error || !r.ok){
      var t = 'Prišlo je do napake. Pokličite nas na '+APP.telefon+'.';
      if(r.napaka==='zasedeno')             t = 'Ta termin je bil pravkar zaseden. Prosimo, izberite drug termin.';
      else if(r.napaka==='prepozno')        t = 'Termin je premalo vnaprej. Naročanje je možno najmanj '+(Math.round(MIN_LEAD_MIN/6)/10).toString().replace('.',',')+' h vnaprej.';
      else if(r.napaka==='izven-delovnega-casa' || r.napaka==='zaprto')
                                            t = 'Izbrani termin je izven delovnega časa. Prosimo, izberite drug termin.';
      else if(r.napaka==='manjkajo-podatki') t = 'Prosimo, vnesite ime in telefonsko številko.';
      else if(r.napaka==='ni-storitev' || r.napaka==='neveljavna-storitev')
                                            t = 'Prišlo je do napake pri izbiri storitve. Poskusite znova.';
      else if(r.napaka==='zaposleni-ne-opravlja' || r.napaka==='neveljaven-zaposleni' || r.napaka==='izberi-zaposlenega')
                                            t = 'Izbrani zaposleni tega termina ne more prevzeti. Vrnite se in izberite drugega.';
      else if(r.napaka==='predalec')        t = 'Termin je predaleč vnaprej. Izberite bližji datum.';
      else if(r.napaka==='prevec-zahtev')   t = 'Z vaše številke smo pravkar prejeli več naročil. Če želite še en termin, nas pokličite na '+APP.telefon+'.';
      else if(res.error)                    t = 'Prišlo je do napake: '+res.error.message+'. Pokličite nas na '+APP.telefon+'.';
      var errEl = document.getElementById('bkErr2');
      if(errEl){ errEl.textContent = t; errEl.classList.add('show'); }
      btn.disabled=false; btn.textContent='Potrdi naročilo';
      return;
    }
    mtoken = r.zeton;
    /* vir obiska – locen klic; ce ne uspe, rezervacija ostane povsem nespremenjena */
    try{ if(VIR_OBISKA && r.zeton) sb.rpc('app_zabelezi_vir', { zeton: r.zeton, vir: VIR_OBISKA }).then(function(){}, function(){}); }catch(e){}
    foot.innerHTML = '';
    body.innerHTML = '<div class="bk-success">'
      + '<div class="bk-success-icon"><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M5 12.5 10 17 19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
      + '<div class="bk-success-title">Naročeni ste!</div>'
      + '<p class="bk-success-sub">'+(state.isNujni
          ? 'Vaša zahteva je bila sprejeta. Pokličemo vas za potrditev termina.'
          : 'Vaše naročilo je potrjeno. Vidimo se '+fmtDate(state.date)+' ob '+state.slot.start+(r.zaposleni?' (pri: '+esc(r.zaposleni)+')':'')+'.')+'</p>'
      + ((state.isNujni || !(c.email)) ? '' :
          '<p class="bk-success-sub" style="font-size:.82rem">Na e-pošto ste prejeli potrditev s povezavo, prek katere lahko termin <strong>spremenite ali prekličete</strong>.</p>')
      + '<br/><p class="bk-success-sub" style="font-size:.8rem">V primeru vprašanj pokličite <a class="bk-tel-povezava" href="tel:'+APP.telefonIntl+'">'+APP.telefon+'</a>.</p>'
      + '</div>';
    var cl = document.createElement('button');
    cl.className='bk-btn-next'; cl.textContent='Zapri';
    cl.style.margin='0 auto'; cl.style.display='block';
    cl.addEventListener('click', closeModal);
    foot.appendChild(cl);
  });
}

/* ── UTILS ─────────────────────────────────────────────── */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function showBodyError(msg){
  body.innerHTML='<div class="bk-error show">'+esc(msg)+'<br/>Pokličite nas na <a href="tel:'+APP.telefonIntl+'" style="color:var(--coral)">'+APP.telefon+'</a>.</div>';
}

})();
