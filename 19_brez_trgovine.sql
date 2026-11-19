-- ═══════════════════════════════════════════════════════════════════════
--  SLOTBEE NI SPLETNA TRGOVINA
--  Ostanki iz NAJS (spletna trgovina salona) se odstranijo:
--  * tabeli narocila_trgovina in nastavitve_trgovina (prazni, nobena funkcija
--    ali sprožilec ju ne uporablja)
--  * javno branje izdelkov (artikli) za obiskovalce spletne strani
--  * stolpci za prikaz na spletu (prikazi_na_spletu, opis, slika_url)
--  Tabela artikli OSTANE: to so izdelki, ki jih salon proda na blagajni
--  (npr. šampon) – samo za admin, ni javna.
--  Dodatno (namen aplikacije = naročanje za različne storitve):
--  * novi tipi dejavnosti s privzetimi storitvami: masaza, vulkanizer, avtomehanik
--  * rezervirani naslovi salonov usklajeni s stranmi (domov, dostopnost, js …)
--  Varno jo je zagnati večkrat.
-- ═══════════════════════════════════════════════════════════════════════

drop table if exists public.narocila_trgovina cascade;
drop table if exists public.nastavitve_trgovina cascade;

drop policy if exists javno_branje on public.artikli;
alter table public.artikli drop column if exists prikazi_na_spletu;
alter table public.artikli drop column if exists opis;
alter table public.artikli drop column if exists slika_url;

-- obiskovalci (anon) do izdelkov nimajo dostopa
revoke all on public.artikli from anon;

-- ── novi tipi dejavnosti: privzete storitve (lastnik jih kasneje prilagodi) ──
insert into public.app_predloge_storitev (tip, category, name, description, price, duration_min, sort_order) values
 ('masaza','Masaže','Masaža hrbta in vratu',null,30,30,1),
 ('masaza','Masaže','Klasična masaža celega telesa',null,50,60,2),
 ('masaza','Masaže','Športna masaža',null,45,45,3),
 ('masaza','Masaže','Sproščujoča masaža z eteričnimi olji',null,55,60,4),
 ('masaza','Terapije','Refleksna masaža stopal',null,40,45,5),
 ('masaza','Terapije','Limfna drenaža',null,55,60,6),
 ('vulkanizer','Osebna vozila','Menjava 4 koles (na platiščih)',null,25,30,1),
 ('vulkanizer','Osebna vozila','Montaža in centriranje 4 pnevmatik',null,45,45,2),
 ('vulkanizer','SUV in kombi','Menjava 4 koles – SUV/kombi',null,30,30,3),
 ('vulkanizer','SUV in kombi','Montaža in centriranje 4 pnevmatik – SUV/kombi',null,55,60,4),
 ('vulkanizer','Ostalo','Popravilo pnevmatike',null,15,20,5),
 ('vulkanizer','Ostalo','Hramba pnevmatik (sezona)','Ob menjavi koles.',40,10,6),
 ('avtomehanik','Servis','Menjava olja in filtrov','Cena dela, brez materiala.',40,45,1),
 ('avtomehanik','Servis','Letni servis','Cena dela, brez materiala.',90,120,2),
 ('avtomehanik','Pregled','Računalniška diagnostika',null,35,30,3),
 ('avtomehanik','Pregled','Pregled pred tehničnim pregledom',null,35,45,4),
 ('avtomehanik','Popravila','Menjava zavornih ploščic (os)','Cena dela, brez materiala.',45,60,5),
 ('avtomehanik','Popravila','Polnjenje in pregled klime',null,60,45,6)
on conflict (tip, name) do nothing;

-- ── rezervirani naslovi (ne smejo biti naslov salona) ──
do $$
declare d text;
begin
  d := pg_get_functiondef('public.app_ustvari_salon(text,text,text,text,text)'::regprocedure);
  if position('''dostopnost''' in d) = 0 then
    d := replace(d, 'array[''admin'',''superadmin'',''narocilo'',''zasebnost'',''index'',''n'',''api'',''www'',''app'',''login'',''prijava'']',
      'array[''admin'',''superadmin'',''narocilo'',''zasebnost'',''index'',''n'',''api'',''www'',''app'',''login'',''prijava'',''domov'',''dostopnost'',''js'',''fonts'',''vendor'',''ikone'',''pogoji'',''cenik'',''pomoc'',''kontakt'',''slotbee'']');
    if position('''dostopnost''' in d) = 0 then raise exception 'Seznama rezerviranih naslovov ni bilo mogoče posodobiti.'; end if;
    execute d;
  end if;
end $$;

-- preverjanje: pričakovano 0 vrstic s trgovino, artikli brez javne politike
select 'tabele trgovine' kaj, count(*)::text vrednost from information_schema.tables
 where table_schema='public' and table_name in ('narocila_trgovina','nastavitve_trgovina')
union all
select 'privzete storitve: '||tip, count(*)::text from public.app_predloge_storitev
 where tip in ('masaza','vulkanizer','avtomehanik') group by tip
union all
select 'javne politike artikli', count(*)::text from pg_policies
 where schemaname='public' and tablename='artikli' and 'anon' = any(roles);
