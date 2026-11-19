/* ══════════════════════════════════════════════════════════════════════
     Preverjanje telefonskih stevilk (v1, 2026-11-04)
     Uporablja: index.html (spletno narocanje), admin.html (nova rezervacija, urejanje stranke)
     - Slovenske stevilke: lastna pravila (8 stevk za 0/+386), enoten zapis "+386 40 123 456".
     - Tuje stevilke (+ ali 00 + koda drzave): Googlova knjiznica libphonenumber (zgoraj v datoteki).
     - stanje: "ok" | "opozorilo" (stevilka obstaja, a npr. ne prejme SMS) | "napaka" (ne more obstajati)
     Isto pretvorbo za slovenske stevilke dela tudi baza (funkcija app_norm_tel), zato so
     zapisi vedno enaki, ne glede na to, od kod pride stevilka.
     ══════════════════════════════════════════════════════════════════════ */
  (function(){
    var MOBILNE=['30','31','40','41','49','51','64','65','68','69','70','71'];
    var PRIMER='040 123 456';
    var SMS_OPOZ='SMS potrditve in opomnika na to številko ne boste prejeli. Če imate mobilno številko, vpišite raje njo.';
  
    function lib(){ return window.libphonenumber || null; }
    function stevk(n){ return n===1?'števko':(n===2?'števki':(n===3||n===4?'števke':'števk')); }
    function zapisSI(nat){
      if(MOBILNE.indexOf(nat.slice(0,2))>=0) return '+386 '+nat.slice(0,2)+' '+nat.slice(2,5)+' '+nat.slice(5);
      return '+386 '+nat.slice(0,1)+' '+nat.slice(1,4)+' '+nat.slice(4,6)+' '+nat.slice(6);
    }
    function drzava(cc){
      try{ return new Intl.DisplayNames(['sl'],{type:'region'}).of(cc) || cc; }catch(e){ return cc; }
    }
    function R(stanje,sporocilo,zapis,tip){ return {stanje:stanje,sporocilo:sporocilo||'',zapis:zapis||'',tip:tip||''}; }
  
    function tuja(intl){
      if(intl.length<7) return R('napaka','Številka je prekratka. Preverite jo.');
      if(intl.length>15) return R('napaka','Številka je predolga. Preverite jo.');
      var L=lib();
      if(!L) return R('ok','','+'+intl,'tuja');           /* knjiznica se ni nalozila: ne oviramo stranke */
      var e164='+'+intl, dolz;
      try{ dolz=L.validatePhoneNumberLength(e164); }catch(e){ dolz=null; }
      if(dolz==='INVALID_COUNTRY') return R('napaka','Koda države na začetku številke (+'+intl.slice(0,3)+'…) ne obstaja. Preverite začetek številke.');
      var p=null; try{ p=L.parsePhoneNumber(e164); }catch(e){ p=null; }
      var ime=p&&p.country?('državo '+drzava(p.country)):'izbrano državo';
      if(dolz==='TOO_SHORT') return R('napaka','Številka je prekratka za '+ime+'. Preverite jo.');
      if(dolz==='TOO_LONG') return R('napaka','Številka je predolga za '+ime+'. Preverite jo.');
      if(dolz==='INVALID_LENGTH'||!p) return R('napaka','Številka nima pravilne dolžine za '+ime+'. Preverite jo.');
      var zapis=p.formatInternational();
      if(!p.isValid()) return R('opozorilo','Številka verjetno ni pravilna – ne ustreza številkam za '+ime+' (prekratka ali napačen začetek). Preverite jo.',zapis,'tuja');
      var t=p.getType();
      if(t==='FIXED_LINE') return R('opozorilo','To je stacionarna številka. '+SMS_OPOZ,zapis,'stacionarna');
      if(t&&t!=='MOBILE'&&t!=='FIXED_LINE_OR_MOBILE') return R('opozorilo','To ni običajna osebna številka. '+SMS_OPOZ,zapis,'posebna');
      return R('ok','',zapis,(t==='MOBILE'?'mobilna · ':'')+drzava(p.country));
    }
  
    function preveri(vnos){
      var s=String(vnos==null?'':vnos).trim();
      if(!s) return R('napaka','Vpišite telefonsko številko.');
      if(/[^\d\s+()\-\/.]/.test(s)){
        return R('napaka', /[oO]/.test(s)
          ? 'V številki je črka »o« namesto ničle 0. Popravite jo.'
          : 'Telefonska številka lahko vsebuje samo števke (in znake + ( ) - /).');
      }
      if((s.match(/\+/g)||[]).length>1 || (s.indexOf('+')>0)) return R('napaka','Znak + je lahko samo na začetku, npr. +386 40 123 456.');
      var d=s.replace(/\D/g,''), intl=null, nat;
      if(s.charAt(0)==='+') intl=d; else if(d.slice(0,2)==='00') intl=d.slice(2);
      if(intl!==null){
        if(intl.slice(0,3)!=='386') return tuja(intl);
        nat=intl.slice(3);
      } else if(d.slice(0,3)==='386' && (d.length===11||d.length===12)) nat=d.slice(3);
      else if(d.charAt(0)==='0') nat=d.slice(1);
      else nat=d;
      if(nat.charAt(0)==='0') nat=nat.slice(1);
      var brezKode=(intl===null);
      if((nat.charAt(0)==='8'||nat.charAt(0)==='9') && nat.length<=8) return R('napaka','To je posebna številka (080/090), na katero vas ne moremo poklicati. Vpišite svojo mobilno ali domačo številko.');
      if(nat.length<8){
        var m=8-nat.length;
        return R('napaka','Številki manjka '+m+' '+stevk(m)+'. Slovenske številke imajo 9 števk, npr. '+PRIMER+'.');
      }
      if(nat.length>8){
        var v=nat.length-8;
        return R('napaka','Številka ima '+v+' '+stevk(v)+' preveč. Slovenske številke imajo 9 števk, npr. '+PRIMER+'.'
          +(brezKode?' Če je številka tuja, jo vpišite s kodo države, npr. +385 91 234 5678.':''));
      }
      var c1=nat.charAt(0), c2=nat.slice(0,2);
      if(c1==='8'||c1==='9') return R('napaka','To je posebna številka (080/090), na katero vas ne moremo poklicati. Vpišite svojo mobilno ali domačo številko.');
      if(!/^[1-7]/.test(nat)) return R('napaka','Ta številka ne obstaja. Preverite jo, npr. '+PRIMER+'.');
      var zapis=zapisSI(nat);
      if(MOBILNE.indexOf(c2)>=0) return R('ok','',zapis,'mobilna');
      if(c1==='6') return R('opozorilo','Številka se začne z 0'+c2+', kar ni običajna slovenska številka. Preverite, ali je pravilna.',zapis,'neobicajna');
      if(c2==='59') return R('opozorilo','To je internetna (VoIP) številka. '+SMS_OPOZ,zapis,'stacionarna');
      return R('opozorilo','To je stacionarna številka. '+SMS_OPOZ,zapis,'stacionarna');
    }
  
    /* Prikaz pod poljem. el = <input>, msg = element za sporocilo.
       Preveri, ko stranka zapusti polje; med tipkanjem samo pocisti napako, ko je popravljena.
       Ob uspehu polje prepise v enoten zapis (+386 40 123 456), da stranka vidi, kako smo jo razumeli. */
    function prikazi(el,msg,r){
      if(!msg) return;
      el.classList.remove('err');
      msg.className='tel-msg';
      if(!r){ msg.textContent=''; return; }
      if(r.stanje==='napaka'){ el.classList.add('err'); msg.classList.add('tel-napaka'); msg.textContent=r.sporocilo; }
      else if(r.stanje==='opozorilo'){ msg.classList.add('tel-opozorilo'); msg.textContent='⚠ '+r.sporocilo; }
      else { msg.classList.add('tel-ok'); msg.textContent='✓ '+r.zapis+(r.tip?' · '+r.tip:''); }
    }
    function povezi(el,msg){
      if(!el||el._appTel) return; el._appTel=true;
      el.addEventListener('blur',function(){
        if(!el.value.trim()){ prikazi(el,msg,null); return; }
        var r=preveri(el.value); prikazi(el,msg,r);
        if(r.stanje!=='napaka' && r.zapis) el.value=r.zapis;
      });
      el.addEventListener('input',function(){
        if(!msg||!msg.textContent) return;
        var r=preveri(el.value);
        if(r.stanje!=='napaka') prikazi(el,msg,r); else if(msg.classList.contains('tel-ok')||msg.classList.contains('tel-opozorilo')) prikazi(el,msg,null);
      });
    }
  
    window.AppTel={ preveri:preveri, prikazi:prikazi, povezi:povezi, verzija:'v2-2026-11-04-vgrajeno' };
  })();
  
