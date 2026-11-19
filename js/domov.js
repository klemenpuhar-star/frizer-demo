(function(){
  // Nav senca ob pomikanju
  var nav=document.getElementById('nav');
  function onScroll(){nav.classList.toggle('scrolled',window.scrollY>8)}
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  // Mobilni meni
  var btn=document.getElementById('menuBtn'),menu=document.getElementById('mobileMenu');
  btn.addEventListener('click',function(){var o=menu.classList.toggle('open');btn.setAttribute('aria-expanded',o)});
  menu.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){menu.classList.remove('open');btn.setAttribute('aria-expanded',false)})});

  // Podvojen trak panog za neskončno drsenje
  var t=document.getElementById('track');t.innerHTML+=t.innerHTML;

  // Prikaz ob pomikanju
  var els=document.querySelectorAll('.rv');
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -40px 0px'});
    els.forEach(function(el){io.observe(el)});
  } else els.forEach(function(el){el.classList.add('in')});

  // Mesečno / letno
  document.querySelectorAll('[data-bill]').forEach(function(b){
    b.addEventListener('click',function(){
      var k=b.dataset.bill;
      document.querySelectorAll('[data-bill]').forEach(function(x){x.classList.toggle('on',x===b)});
      document.querySelectorAll('.price b,.billed').forEach(function(el){el.textContent=el.dataset[k]});
    });
  });

  // Izbira paketa vpiše v sporočilo
  document.querySelectorAll('[data-plan]').forEach(function(a){
    a.addEventListener('click',function(){var m=document.getElementById('f-msg');if(!m.value)m.value='Zanima me paket '+a.dataset.plan+'.'});
  });

  // Obrazec → Supabase (app_oddaj_povprasevanje) → Telegram skrbniku
  var SB_URL='https://lzbmdmdtycgimqirzknu.supabase.co', SB_KEY='sb_publishable_Rnf1nx52p7m0Iis_lvRSDA_8GYvbwet';
  var form=document.getElementById('leadForm'), fBtn=document.getElementById('f-btn'), fErr=document.getElementById('f-err');
  function napaka(t){fErr.textContent=t;fErr.hidden=!t}
  function uspeh(){form.classList.add('sent');document.getElementById('f-ok').hidden=false}
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var f=form; napaka('');
    if(!f.ime.value.trim()||!f.salon.value.trim()||!f.email.value.trim()){
      [f.ime,f.salon,f.email].some(function(x){if(!x.value.trim()){x.focus();return true}});
      napaka('Prosimo, izpolnite ime, ime salona in e-pošto.');return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())){f.email.focus();napaka('E-poštni naslov ni pravilen.');return}
    if(f.web.value){uspeh();return}   // past za robote
    fBtn.disabled=true; var t=fBtn.innerHTML; fBtn.textContent='Pošiljam …';
    fetch(SB_URL+'/rest/v1/rpc/app_oddaj_povprasevanje',{method:'POST',
      headers:{apikey:SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_ime:f.ime.value.trim(),p_salon:f.salon.value.trim(),p_dejavnost:f.dejavnost.value,
        p_zaposleni:f.zaposleni.value,p_telefon:f.telefon.value.trim(),p_email:f.email.value.trim(),p_sporocilo:f.sporocilo.value.trim()})})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
    .then(function(x){
      if(x.ok && x.j && x.j.ok){uspeh();return}
      var k=x.j&&x.j.napaka;
      napaka(k==='prevec'?'Povpraševanje ste že poslali. Oglasimo se kmalu.':k==='email'?'E-poštni naslov ni pravilen.':'Pošiljanje ni uspelo. Pišite nam na info@slotbee.si ali pokličite 031 217 361.');
    })
    .catch(function(){napaka('Pošiljanje ni uspelo. Pišite nam na info@slotbee.si ali pokličite 031 217 361.')})
    .then(function(){fBtn.disabled=false;fBtn.innerHTML=t});
  });

  // Varstvo podatkov (okno)
  var dlg=document.getElementById('dlg-zasebnost');
  document.querySelectorAll('[data-open="zasebnost"]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','')})});
  dlg.querySelector('button').addEventListener('click',function(){dlg.close?dlg.close():dlg.removeAttribute('open')});
  dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close()});

  document.getElementById('yr').textContent=new Date().getFullYear();
})();
