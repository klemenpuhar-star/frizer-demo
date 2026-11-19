/* podatki upravljavca (salona) iz baze; ponudnik platforme iz nastavitve.js */
(function(){
  function vpisi(k,v){ document.querySelectorAll('[data-z="'+k+'"]').forEach(function(e){ e.textContent=v; }); }
  APP.ready.then(function(){
    if(APP.obdelovalec){ vpisi('obdelovalec', APP.obdelovalec); vpisi('obdelovalec-vrsta', APP.obdelovalec); }
    if(!APP.slug){ vpisi('naziv','salon, pri katerem ste se naročili (podatki so na strani salona)'); return; }
    fetch(APP.supabaseUrl+'/rest/v1/rpc/app_salon_upravljavec',{method:'POST',
      headers:{apikey:APP.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({p_slug:APP.slug})})
    .then(function(r){ return r.ok?r.json():null; }).then(function(d){
      if(!d) return;
      vpisi('naziv', d.naziv||APP.ime||'–'); vpisi('naslov', d.naslov||'–'); vpisi('davcna', d.davcna||'–');
      if(d.email){ var td=document.querySelector('[data-z="email"]'); td.innerHTML=''; var a=document.createElement('a'); a.href='mailto:'+d.email; a.textContent=d.email; td.appendChild(a); }
    }).catch(function(){});
  });
})();
