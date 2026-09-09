# Fudaristo — Handover

Status na dan 09. septembar 2026. Ovom rundom je **zatvoren ceo plan faza**:
revizija Faze 6, pristup admin panelu, Faza 9 (liga + statistike), čipovi
(aktivacija + Joker efekat na transfere), javni pregled tuđeg tima, i backfill
skripta za `api_thesportsdb_id`.

Poslednja izmena: tri CLI skripte za održavanje kalendara sada se pokreću i iz
admin panela — videti "Održavanje kalendara iz panela".

**Ostaje samo posao sa podacima**, ne sa kodom — videti "Šta je stvarno ostalo"
na kraju.

---

## ⚠️ PRVO OVO: pokreni migraciju

```
Supabase → SQL Editor → migrations/003-security-and-rpc.sql → Run
Supabase → SQL Editor → migrations/004-reset-squad.sql      → Run
Supabase → SQL Editor → migrations/005-lineup-and-batch-transfers.sql → Run
Supabase → SQL Editor → migrations/006-ingestion-and-worldfootball.sql → Run
Supabase → SQL Editor → migrations/007-scoring-bulk-writes.sql → Run
Supabase → SQL Editor → migrations/008-chips.sql → Run
```

**007 i 008 su obavezne.** Bez 007 "Obračunaj poene" javlja `function
public.score_write_stat_points does not exist`; bez 008 dugmad za čipove javljaju
`function public.activate_chip does not exist`.

---

## Zašto se admin panel nije video

Dva razloga, oba popravljena ove runde.

**1. Linka nije ni bilo.** `/admin` je postojao i radio od Faze 5, ali nijedna
stranica nije vodila do njega — u navigaciji su bili samo Moj klub, Raspored,
Liga, Statistike i Podešavanja. Do admin panela se moglo doći isključivo ručnim
kucanjem URL-a. Sad `app/layout.tsx` čita i `is_admin` i prikazuje zlatni link
**„Admin”** u navigaciji, samo adminima.

**2. Odbijanje je bilo nemo.** `requireAdmin()` je radio
`redirect("/moj-tim")` bez ijedne reči — korisnik otvori `/admin`, završi na
svom timu, i razumno zaključi da admin panel ne postoji. Sad postoje dva
ulaza u `lib/admin-guard.ts`:

- `getAdminAccess()` za STRANICE — vraća razlog (`anon` / `no_profile` /
  `not_admin`), pa `components/AdminAccessDenied.tsx` objasni šta fali. Za
  slučaj `not_admin` ispisuje i **tačan SQL sa imenom tvog tima** koji treba
  pokrenuti.
- `requireAdmin()` za SERVER ACTION-e — i dalje tvrdo preusmerenje, bez
  objašnjenja. Akcija nema šta da renderuje, a odgovor ne sme ništa da procuri.

**Ako i dalje ne vidiš link posle ove runde**, `is_admin` ti prosto nije
postavljen. Niko ne može sam sebi da ga postavi (migracija 003 oduzima UPDATE
pravo na tu kolonu na nivou privilegija, jači sloj od RLS-a), pa je SQL Editor
jedini put:

```sql
update users set is_admin = true where team_name = 'Tvoj Tim';
```

Odjavi se i prijavi ponovo, ili samo osveži stranicu.

**I posle migracije, admin panel ne radi dok neko nema `is_admin = true`.**
Niko to ne može sam sebi da postavi (migracija 003) — postavi ga direktno u
SQL Editor-u:
```sql
update users set is_admin = true where team_name = 'Tvoj Tim';
```

Aplikacija od ove runde **ne radi bez nje** — čuvanje tima i transferi idu kroz
Postgres funkcije koje ta migracija pravi. Ako je preskočiš, dobićeš grešku
"function public.save_squad does not exist".

---

## Status po fazama

| Faza | Šta | Status |
|---|---|---|
| 0 | Skeleton, Supabase setup, Vercel deploy | ✅ Gotovo |
| 1 | Auth & korisnički profil | ✅ Gotovo (profil sad pravi DB trigger, ne browser) |
| 2 | Seed klubova i rostera (CSV, Transfermarkt) | ✅ Gotovo |
| 3 | Squad builder + transferi | ✅ Gotovo (prepisano na atomične RPC pozive) |
| 4 | Import kalendara | ✅ Gotovo |
| — | Runda popravki | ✅ Gotovo |
| — | FPL izgled + raspored | ✅ Gotovo |
| — | FPL transfer flow + postava | ✅ Gotovo |
| — | Istraživanje izvora podataka (`check-sources`) | ✅ Gotovo |
| 5 | Automatski ingestion rezultata + igračke statistike | ✅ Gotovo |
| 6 | **Scoring engine (obračun fantasy poena)** | ✅ Gotovo + revidirano ove runde (detalji ispod) |
| 7 | Admin panel (zaštićena ruta, CSV unos statistike) | ✅ Gotovo (apsorbovano u Fazu 5) |
| 8 | Bogatija transfer logika (multi-transfer batch) | ✅ Gotovo (`apply_transfers`) |
| 9 | Liga standings + statistike prikazi | ✅ Ova runda (`/liga`, `/statistike`) |
| — | Aktivacija čipova + Joker efekat na transfere | ✅ Ova runda (migracija 008) |
| — | Javni pregled tuđeg tima (`/tim/[id]`) | ✅ Ova runda |
| — | Backfill `api_thesportsdb_id` | ✅ Ova runda (`npm run backfill-fixture-ids`) |

---

## Šta je urađeno u rundi transfer flow-a

### „Moj tim” je sad jedan ekran, kao FPL

Stranica `/transferi` je ukinuta (ruta ostaje samo kao preusmerenje da stari
linkovi ne vode u 404), a dugme „Napravi transfer” je uklonjeno. Sve se dešava
na `/moj-tim`.

### Transfer flow — × je prvi korak, ne akcija

Tok je tačno onaj traženi:

`Trenutni tim` → `igrač označen za prodaju` → `izabrana zamena` → `transfer na
čekanju` → `potvrda` → `novi tim`

- **× na dresu ne menja ništa u bazi.** Označava igrača za prodaju, istakne
  njegov dres, prigušuje ostale i otvara listu zamena **filtriranu na njegovu
  poziciju**. Panel iznad liste piše koga prodaješ i za koliko, sa dugmetom
  „Odustani”.
- **Izbor zamene** prolazi kroz punu validaciju pre nego što se uopšte može
  kliknuti: pozicija, budžet, max 3 iz istog kluba, igrač koji je već u timu.
  Svaki nedostupan igrač kaže zašto, a kad je u pitanju novac — koliko tačno
  nedostaje („Nedostaje 2.3M”).
- **Više transfera odjednom.** Panel „Transferi na čekanju” prikazuje svaki par
  sa razlikom u ceni, i nudi „promeni izbor” i „poništi” za svaki pojedinačno.
  Drugi klik na × pending igrača takođe poništava zamenu.
- **Budžet se preračunava odmah**, pre bilo kakvog upisa. Predomišljanje na
  istom mestu ne naplaćuje dvaput — proveravao sam aritmetiku izolovano
  (višestruki transferi, izmena izbora, poništavanje).
- **Cena u poenima se prikazuje unapred** — `-4` po transferu preko broja
  slobodnih, `0` pre prvog roka.
- **Potvrda** je jedno dugme čiji tekst prati stanje: „Potvrdi 2 transfera”,
  „Sačuvaj postavu”, ili „Sačuvaj izmene” kad ima i jedno i drugo. Aktivno je
  samo kad postoje validne izmene. Uz njega stoji „Poništi izmene”.

Serverski deo je `apply_transfers()` (migracija 005) — ceo paket prolazi ili
pada zajedno. **Budžet i limit od 3 po klubu se proveravaju na KONAČNOM
sastavu, ne posle svakog pojedinačnog transfera**, pa možeš prodati dva igrača
iz istog kluba i kupiti dva iz drugog a da te međukorak ne blokira. To je i
razlog zašto je ovo jedna funkcija, a ne petlja nad `make_transfer()`.

### Izmena postave i kapitena nad sačuvanim timom

Ranije je pregled tima bio read-only. Sad:
- klik na dres, pa na igrača sa suprotne strane (teren ↔ klupa) → zamena;
  igrači koji bi pokvarili formaciju se prigušuju
- **C** i **V** dugmići ispod dresa menjaju kapitena i vice-kapitena; ako
  kapiten ode na klupu, uloga se skida i poruka to kaže
- sve čeka isto dugme za čuvanje

Serverski: `update_lineup()`. Ne dodaje i ne uklanja igrače — skup poslatih
ID-jeva mora biti tačno jednak postojećem sastavu, pa se preko njega ne može
prokrijumčariti tuđi igrač.

### Formacija i budžet pri zameni

- **Dropdown za formaciju** u statusnoj traci. Osam formacija (3-4-3, 3-5-2,
  4-3-3, 4-4-2, 4-5-1, 5-2-3, 5-3-2, 5-4-1) se **izvodi iz
  `STARTING_XI_BOUNDS`**, ne prekucava — ako se granice promene, lista se menja
  sa njima. Promena zadržava što više trenutnih startera (mereno: 9–10 od 11), a
  kapitensku traku koja bi ispala iz postave prebacuje na najboljeg igrača koji
  je ostao, umesto da je skine i blokira čuvanje.
- **Budžet pri zameni.** Čim se klikne ×, statusna traka prestaje da prikazuje
  stanje kase i prikazuje **iznos koji se zaista može potrošiti** — kasa plus
  novac za igrača kog prodaješ, sa razlaganjem („kasa 1.5M + 4.2M za Pelkas”).
  Filter u listi je i ranije računao ovako; obmanjujuć je bio samo prikaz.

### Moja podešavanja

Nova stranica `/podesavanja`: ime tima, boja tima (sa živim pregledom grba) i
**omiljeni klub**. „Navija za: …” je sklonjeno sa kartice tima — tamo je sad
samo ime tima i link ka podešavanjima.

Pod poljem za klub piše da ne utiče na fantasy pravila, jer to nije očigledno.
Zauzeto ime tima vraća razumljivu poruku umesto sirove baze.

Ove tri kolone su jedine na kojima korisnik ima `UPDATE` pravo još od migracije
003, pa ovde nije bila potrebna nova funkcija.

---

## Šta je urađeno u FPL rundi

### Raspored i rezultati — nova stranica `/raspored`

Sva kola od prvog do poslednjeg, sa navigacijom po kolima (traka sa brojevima) i
prekidačem „Cela sezona” za pregled svega odjednom. Podrazumevano se otvara kolo
koje je na redu. Odigrani mečevi prikazuju rezultat i podebljavaju pobednika,
predstojeći prikazuju termin, odloženi i otkazani su jasno označeni. Klubovi se
prepoznaju po traci u klupskoj boji sa svake strane.

Link „Raspored” je dodat u navigaciju; header se sad prelama i skroluje na uskim
ekranima jer je sa pet stavki postao pretesan za telefon.

### Teren i dresovi

Teren je sad pravi teren, ne zeleni okvir: aut-linije, centralna linija i krug,
oba kaznena prostora sa petercima, penal-tačke, polukrugovi i uglovi, plus
pokošene trake. Sve je SVG i CSS gradijent — nijedna slika, nijedan dodatni
zahtev.

Dres je jednobojan SVG u klupskoj boji, sa tankim svetlim obrisom da se tamni
dresovi (PAOK, OFI) ne izgube na tamnoj pozadini. Skraćenica kluba je na dresu, a
boja slova se računa iz kontrasta same boje. Ispod idu dve pločice — prezime i
cena — kao na FPL terenu. **Golman je gore, napadači dole**, isto kao FPL.

### Izbor igrača: × i +

Squad builder je sad teren sa 15 mesta (2/5/5/3). Prazno mesto je isprekidan dres
sa **+** — klik zaključa listu na tu poziciju i zlatno je istakne. Popunjen dres
ima **×** u uglu; klik ga uklanja i mesto se vraća na +. Prazna i popunjena mesta
imaju istu visinu pa se redovi poklapaju.

**Ništa se ne upisuje u bazu dok se ne klikne „Sačuvaj tim”** — sve izmene žive u
stanju komponente.

### Pretraga, filteri i sortiranje

Panel za izbor igrača ima pretragu (ime ili klub), tabove po poziciji, filter po
klubu, filter „cena do”, i sortiranje po ceni (oba smera), poenima i prezimenu.
Broj rezultata se prikazuje iznad liste.

Svaki nedostupan igrač kaže **zašto**: „Već 3 iz kluba”, „Preskup”, „Vezni red
popunjen”, „Već u timu”. Poslednji razlog je nov i najkorisniji — **„Ne bi ostalo
za ostatak tima”**: pre svakog dodavanja se računa najjeftinija moguća popuna
preostalih mesta, pa se ne može zaglaviti sa 12 igrača i praznim budžetom.
Računa se prefiksnim sumama po poziciji, pa je provera O(1) po igraču i lista od
360 igrača ostaje trenutna.

### Postava i kapiten

Drugi tab, otključan kad je 15 igrača izabrano. Zamena radi kao na FPL-u: klik na
igrača, pa klik na drugog sa suprotne strane (teren ↔ klupa). Igrači koji bi
pokvarili formaciju se prigušuju umesto da se blokiraju bez objašnjenja. Kapiten
i vice se biraju dugmićima **C** i **V** ispod dresa. Ako kapiten ode na klupu,
uloga se skida i poruka to kaže.

Klupa je zasebna traka ispod terena, sa rezervnim golmanom na kraju i oznakom
formacije.

### Praznjenje tima

Dva mesta:
- **U builderu** — „Isprazni tim” briše lokalni izbor, ništa nije ni bilo upisano.
- **Nad sačuvanim timom** — `reset_squad()` (migracija 004) briše sastav i vraća
  budžet. Dozvoljeno **samo pre prvog roka**; posle toga bi bio besplatan način da
  se zaobiđe −4 penal, pa ga funkcija odbija bez obzira na to šta UI prikaže.
  Dugme se i prikazuje samo u toj fazi.

### Ostalo

- Traka stanja iznad terena: broj igrača, preostali budžet i traka popunjenosti.
- Pregled sačuvanog tima prikazuje vrednost tima, novac u kasi i formaciju.

---

## Šta je popravljeno u prethodnoj rundi

### 1. Sigurnost: korisnik je mogao sam sebe da postavi za admina

`users_update_own` RLS politika je imala samo `USING`, bez `WITH CHECK`, a
Supabase po difoltu daje `authenticated` roli UPDATE na **sve** kolone. Svaki
ulogovan korisnik je preko anon ključa mogao:

```sql
update users set is_admin = true, budget_remaining = 999 where id = auth.uid();
```

Popravljeno privilegijama na nivou kolone (jači sloj od RLS-a, ne može ga
zaobići nijedna politika): `REVOKE UPDATE ON users`, pa `GRANT UPDATE
(team_name, team_color, favorite_club_id, updated_at)`. Postaje bitno u Fazi 7
kad admin panel počne da proverava `is_admin`.

### 2. Sastav se nije prenosio iz kola u kolo

Čim prođe deadline kola N, `/moj-tim` nije nalazio redove za kolo N+1 i nudio je
squad builder ispočetka — i to sa punih 100M, jer je budžet bio hardkodovan i
nikad nije čitao `users.budget_remaining`. Praktično: nov tim i resetovan budžet
svake nedelje.

Popravljeno funkcijom `carry_over_squad()` koju `/moj-tim` zove pre čitanja
sastava. Kopira prošlo kolo, ne radi ništa ako sastav već postoji, i idempotentna
je na paralelne pozive. Squad builder sad prima raspoloživ budžet kao prop.

**Uz to dodaje +1 slobodan transfer po kolu, kumulativno do 5** — po FPL logici.
Ako po tvom GDD-u to pripada scoring engine-u (Faza 6), obriši taj `UPDATE users`
na kraju funkcije, sve ostalo radi bez njega.

### 3. Deadline se nije proveravao na serveru

RLS je proveravao samo vlasništvo, ne i rok — moglo se upisati sastav za kolo
koje je već odigrano. Sad je sve pisanje u `squads`/`transfers` oduzeto klijentu
(`REVOKE INSERT/UPDATE/DELETE`) i ide kroz `save_squad()` / `make_transfer()`,
koje rok proveravaju u bazi.

### 4. Transfer nije bio atomičan

Bila su 4 odvojena zahteva iz browsera (insert transfers → delete squads →
insert squads → update users). Da treći padne, korisnik bi trajno ostao sa 14
igrača, bez načina da to popravi kroz UI. Sad je jedna transakcija.

Isto važi i za prvi upis tima (15 redova + skidanje budžeta).

### 5. Registracija je mogla da ostavi nalog bez profila

Red u `public.users` je upisivao browser, posle `signUp()`. Ako taj drugi zahtev
padne, korisnik ostaje sa auth nalogom bez profila — ne može ni tim da napravi
(FK), ni da se registruje ponovo sa istim mejlom. Sad to radi trigger
`on_auth_user_created` u istoj transakciji kao i signUp. Klijentski upis je
ostao kao fallback (`ignoreDuplicates`) pa radi i pre i posle migracije.

### 6. Auto-pick: 73.4M → 100.0M, sa zvezdom u timu

Stari greedy po `total_points / price` je sistematski kupovao najjeftinije: tim
validan, ali u proseku 73.4M od 100M i nikad nijedno veliko ime. Sad ide u tri
koraka: **sidro** (najskuplji igrač koji staje u budžet uz rezervu za ostalih 14
mesta) → **popuna** po vrednosti-za-cenu → **nadogradnja** (troši ostatak
budžeta zamenama koje najviše dižu kvalitet).

Izmereno na 300 sintetičkih pool-ova (14 klubova, ~360 igrača):

| | staro | novo |
|---|---|---|
| prosečno potrošeno | 73.4M | **100.0M** (min 99.5M) |
| ima igrača iz gornjih 5% po ceni | ~nikad | **300/300** na startu sezone |
| validnih timova | 300/300 | 300/300 |
| vreme | ~2ms | ~2ms |

"Kvalitet" je normalizovana mešavina poena i cene. Na startu sezone su svi
`total_points` nule pa cena nosi ceo signal (skuplji = bolji, jedino što tad
postoji); čim poeni krenu da se sabiraju (Faza 6), oni preuzimaju dominaciju i
auto-pick sam prelazi na "ko stvarno donosi poene" — bez izmene koda. Zato je
tad 281/300 umesto 300/300: u 19 slučajeva je jeftiniji igrač sa puno poena bio
bolji izbor od najskupljeg, što je i poenta.

Kapiten se sad bira kao najbolji igrač u postavi koji **nije golman**.

### 7. Parsiranje rezultata iz TheSportsDB

`ev.intHomeScore !== null ? Number(...) : null` — API za neodigrane mečeve ne
vraća uvek `null`, ume prazan string ili polje koje ne postoji. `Number("")` je
0, pa je neodigran meč mogao da dobije 0:0; `Number(undefined)` je NaN. Novi
`parseScore()` u `lib/api-parsing.ts` vraća `null` za sve što nije stvaran broj,
a meč sa statusom FT bez rezultata se ne proglašava završenim (ostaje `live` i
pokušava se opet) — da scoring engine u Fazi 6 ne uzme lažnu nulu kao konačnu.

### 8. Parsiranje datuma

`new Date(x + "Z")` je pucao čim bi u CSV-u vreme već imalo `Z` ili offset. Novi
`parseUtcTimestamp()` prihvata `2026-09-12 15:00`, `...T15:00:00`, sa i bez zone,
i vraća `null` umesto Invalid Date. Redovi sa neispravnim datumom se sad
preskaču uz jasnu poruku umesto da ruše kolo.

### 9. `update-results-thesportsdb.ts` je tiho preskakao sve CSV mečeve

Filtrirao je `.not("api_thesportsdb_id", "is", null)`, a svih 161 ručno unetih
mečeva ima NULL u toj koloni — izgledalo je kao da nema posla. Sad ih broji i
eksplicitno kaže da prvo treba pokrenuti `npm run import-fixtures` (ona
backfilluje ID na postojeće redove).

### 10. Sitnije

- `import-fixtures-csv.ts` je ažurirao `kickoff_at` bez obzira na status meča —
  placeholder termin iz CSV-a je mogao da pregazi stvaran termin odigranog ili
  odloženog meča. Sad se dira samo dok je meč `scheduled`.
- `transfer-client.tsx`: klub-limit provera je imala suvišan `? 0 : 1` koji je
  logički pogrešan (u praksi nije propuštao nevalidan transfer, ali bi postao
  pravi bug u Fazi 8 sa multi-transfer batch-om).
- `squads.squad_order`: svi starteri su dobijali `1`. Sad postava dobija 1–11 po
  liniji, klupa 1–4 sa rezervnim golmanom poslednjim — to je redosled koji će
  auto-sub logika u Fazi 6 koristiti.
- `import-roster-csv.ts` je upućivao na `faza2-schema-update.sql` koji ne postoji
  (ugrađen je u `schema.sql`) — komentar ispravljen.
- Ćirilična slova usred latinične reči u `lib/gameweek.ts`.

---

## Kako je testirano (obe runde)

- `npx tsc --noEmit` čist, `npx next build` prolazi (11 ruta)
- Teren i dresovi provereni renderovanjem u sliku pre nego što su pušteni: iz te
  provere su izašle dve ispravke — golman je bio dole umesto gore, i prazna mesta
  su bila niža od popunjenih pa se redovi nisu poklapali
- Migracija i `schema.sql` pokrenuti na pravom PostgreSQL 16 sa imitacijom
  Supabase `auth` šeme; sve funkcije kreirane bez greške
- **Napadi** (kao `authenticated` rola sa postavljenim `auth.uid()`): self-admin,
  self-budget, self-points, direktan upis sastava, ručno upisan besplatan
  transfer — **sva četiri blokirana**, dok legitimna izmena imena tima prolazi
- **Poslovna pravila**: dupli upis tima odbijen, upis u zaključano kolo odbijen,
  transfer na drugu poziciju odbijen, 4. igrač iz istog kluba odbijen,
  prekoračenje budžeta odbijeno
- **Prelaz kola**: sastav prekopiran (15/15), budžet sačuvan (17.4M, ne 100M),
  `free_transfers` 1→2, ponovni poziv ne duplira, sastav zaključanog kola
  netaknut
- **Penali**: pre-season 0, prvi transfer sa slobodnim 0, prvi bez slobodnih −4
- Auto-pick: 300 sintetičkih pool-ova sa i bez poena, plus tesan budžet
  (100/90/80/70/60M) i prazan pool
- Faza 5 ingestion: normalna potvrda, premeštanje odloženog meča, rešavanje
  u istom kolu bez pomeranja, idempotentnost, zaštita "upcoming ostaje
  upcoming", povratak iz data_pulled u in_progress kad premešten meč to
  zahteva — sve kroz lažni Supabase klijent (in-memory, napravljen samo za
  ovo testiranje, nije deo isporuke)
- worldfootball parser: prva verzija testirana i ODBAČENA jer je aktivno
  greškom pripisivala golove i status starter/klupa; skraćena verzija
  testirana kao tačna za ono što tvrdi
- Uparivanje imena (dijakritike): testirano na stvarnim imenima iz
  istraživanja (Jović/Jovic, Gaćinović) — tačno; zaštita od prepisivanja već
  potvrđenih redova pri ponovnom povlačenju — testirana
- `reset_squad`: odbijen kad korisnik ima sastav u ranijem kolu, prošao pre prvog
  roka (vratio 73.6M, budžet nazad na 100.0M, 0 igrača), a ponovni upis preskupog
  tima posle reseta uredno odbijen

---

## Poznata ograničenja / otvorena pitanja

- **Prodajna cena = kupovna cena.** Igrač se prodaje po `purchase_price`, ne po
  trenutnoj tržišnoj — nema FPL "50% profita" pravila. Namerno, ali proveri da
  li se slaže sa GDD sekcijom 17.
- **`free_transfers` +1 po kolu** je dodat u `carry_over_squad()` — ako po GDD-u
  to pripada Fazi 6, obriši taj `UPDATE` (videti tačku 2 iznad).
- **Max 3 po klubu je hardkodovan** i u `lib/fantasy-rules.ts` i u SQL
  funkcijama. Klijentska verzija je za brz fidbek, serverska stvarno odlučuje —
  ako menjaš pravila, menjaj na oba mesta (označeno komentarom).
- **Multi-transfer batch** — i dalje odloženo za Fazu 8, trenutno jedan-po-jedan.
- **`/raspored` prikazuje ono što je u `fixtures` tabeli.** Sad kad ingestion
  radi, rezultati će se pojaviti čim se kalendar uveze i cron/ručno dugme
  jednom pokrenu — do tada su kola i dalje „predstojeća” sa placeholder
  terminima jer kola 1–3 još nisu uvezena (videti Faza 5 sekciju).
- **Poništavanje transfera može ostaviti budžet u minusu** ako je taj transfer
  finansirao neki drugi (prodaš skupog, kupiš dva jeftinija, pa poništiš prvi).
  UI to jasno prijavi i blokira čuvanje; izlaz je „Poništi izmene”. Namerno
  ostavljeno tako — alternativa bi bila da se poništavanje ćutke odbije, što je
  gore.
- **Chip-ovi (UI aktivacija) nisu implementirani** — scoring engine (Faza 6)
  ih ISPRAVNO OBRAČUNAVA čim `chips_usage` dobije red (Triple Captain 3x,
  Favorite Club x2), ali ništa u aplikaciji trenutno ne piše u tu tabelu.
  Joker #1/#2 nemaju efekat u scoring engine-u uopšte (namerno — oni menjaju
  cenu transfera preko `make_transfer`/`apply_transfers`, ne poene; ta dva
  RPC-a i dalje ne znaju za čipove). Prirodan sledeći korak.
- **`bonus_points` (GDD sekcija 10, "najbolji u meču") je RUČNO polje**, dodato
  u admin formu ovog kruga — u bazi nema sirovih statistika iz kojih bi se
  pravi BPS mogao izračunati (defanzivni doprinos je svesno preskočen u istoj
  sekciji GDD-a). Admin dodeljuje 1-3 po sopstvenoj proceni; 0 ako se ne unese.
- **Auto-sub (klupa umesto igrača sa 0 minuta) je implementiran standardnim
  FPL greedy algoritmom** (`resolveEffectiveStartingXI` u `lib/scoring.ts`) —
  GDD nema posebnu sekciju o ovome, pretpostavka je izvedena iz "identično
  FPL" (sekcija 1) i `squads.squad_order` komentara. Testirano (GK-za-GK
  zamena, poziciona validnost, slučaj kad zamena nije moguća), ali proveri da
  li se slaže sa namerom ako imaš drugačiju sliku toga.
- **Kickoff vremena za kola 5-26 su placeholder** (19:00 lokalno) dok zvaničan TV
  raspored ne izađe. DST je proveren — 19:00 lokalno izlazi tačno i u letnjem
  (16:00 UTC) i u zimskom periodu (17:00 UTC).
- **Kalamata** — jedini klub od 14 koji nije direktno potvrđen protiv
  TheSportsDB naziva.
- Kalendar u `scripts/fixtures-template.csv` je programski proveren: 161 red,
  23 kola × 7 mečeva, svaki klub tačno jednom po kolu, nema dupliranih parova,
  svih 91 parova pokriveno, home/away balans konzistentan sa 13/13 na nivou
  sezone.

---

## Faza 5 — automatski ingestion rezultata

Odluke iz planiranja (potvrđene pre implementacije): rezultati preko
TheSportsDB (besplatno, već integrisano u Fazi 4); igračka statistika preko
worldfootball.net, ali NE kao cron — samo kao admin dugme "Povuci sa
worldfootball-a" (struganje tuđeg sajta u automatskom noćnom poslu je pravni
rizik koji nema smisla preuzeti; ručno okinuto po meču je isti sadržaj, mnogo
manji rizik); nema besplatnog live-score izvora za ovu ligu (TheSportsDB drži
live iza $9 pretplate, Sportmonks free plan ne pokriva grčku ligu) — rešeno
cron-om posle meča + ručnom izmenom rezultata u admin panelu; odloženi meč
nosi poene u kolo u kom se STVARNO odigra.

### `lib/ingestion.ts` — u DVE FAZE, ne jednoj

Prva verzija je pokušala sve po kolu (`eventsround.php`), uključujući
detekciju premeštenih mečeva. Test je odmah pokazao zašto to ne radi: kad se
pita `eventsround.php?r=1` za meč koji je TheSportsDB u međuvremenu prebacio
u kolo 5, taj meč prosto **nestaje** iz odgovora za kolo 1 — nema šanse da se
iz njega zaključi gde je otišao. Prepravljeno na dve faze:

- **Faza A — potvrda rezultata.** Za kola sa scheduled/live mečem čiji je
  kickoff prošao, jedan poziv `eventsround.php` po kolu (7 mečeva odjednom).
  Ne pokušava da otkrije premeštanje — samo potvrđuje status/rezultat U KOLU
  KOJE VEĆ TRAŽI.
- **Faza B — provera odloženih.** Za svaki meč sa statusom `postponed`,
  poziva se `lookupevent.php?id={njegov sopstveni ID}` — upit ka
  KONKRETNOM meču, ne ka kolu, pa uvek vraća njegovo trenutno stanje bez
  obzira gde je premešten. Retko ih ima, pa je poziv-po-meču ovde opravdan.

Kad Faza B otkrije novo kolo: `fixtures.gameweek_id` se premešta,
`original_gameweek_id` se upisuje (samo ako tamo već ne stoji nešto — trag
ostaje na PRVOM kolu iz kog je meč izašao). Cilj kolo mora već postojati u
bazi (kreira ga `import-fixtures-csv`/`import-fixtures-thesportsdb`) — ako
ne postoji, ingestion prijavljuje grešku umesto da nagađa.

### Kola imaju životni ciklus

`upcoming → in_progress → data_pulled` (pa `admin_reviewed → finalized` iz
Faze 6/7, koje ingestion nikad ne dira — nema dugmeta koje prevodi
`data_pulled` u `admin_reviewed`, to je prirodno mesto za Fazu 6). **Bitna
zaštita otkrivena testom:** kolo čiji rok još nije prošao ostaje `upcoming`
bez obzira na to da li u njega upravo upadne premešten meč — inače bi jedan
meč pomeren iz decembra u mart odmah prebacio to mart-kolo u `in_progress`,
iako niko još nije ni predao sastav. `is_current` se održava kao: prvo
`in_progress` kolo, inače najbliže `upcoming`.

### Testirano (mock, bez pravog Postgres/mreže — vidi "Kako je testirano" iznad)

Normalna potvrda, premeštanje sa tačnim `original_gameweek_id`, rešavanje
BEZ pomeranja (u istom kolu), idempotentnost (drugo pokretanje = nula
poziva), zaštita "upcoming ostaje upcoming", i povratak iz `data_pulled` u
`in_progress` kad premešten meč to zahteva. **Dva prava baga nađena i
ispravljena ovde, pre nego što su poslata dalje** — oba iz iste kategorije:
prvi pokušaj je pratio samo "koje kolo je meč NAPUSTIO", ne i "koje kolo ga
je PRIMILO".

### worldfootball parser — priznanje koje je važno pročitati

Prva verzija `lib/worldfootball-parser.ts` je pokušala da izvuče golove,
asistencije, postavu/klupu i minute izmena iz teksta oko linkova ka
igračima. Testirano na sintetičkoj stranici koja verno oponaša pravu
strukturu (istraženu ranije) — i pokazalo se da **aktivno greši**:

- Asistent je dobio pripisana **2 gola koja nije dao** — njegov link se
  našao u prozoru teksta oko sledećeg gola, regex ga je pokupio kao strelca
- Igrač sa klupe koji je ušao i dao gol je označen kao **starter** — njegov
  link se prvi put javlja u listi golova na vrhu stranice, PRE tabele sa
  postavom, pa je heuristika "prvo pojavljivanje = osnovni red" pogrešno
  zaključila da je od početka na terenu

Pogrešan broj koji izgleda uverljivo je opasniji od praznog polja — admin ga
lako previdi u review ekranu. Zato je parser **svesno skraćen**: sad tvrdi
samo ono što je test potvrdio kao pouzdano — finalni rezultat, imena timova,
i kompletan spisak igrača koji se pominju na strani (bez razdvajanja na
postava/klupa, bez golova/asistencija/minuta). Sve statističke vrednosti
počinju prazne (0) za admina.

I dalje štedi vreme: bez ovoga bi trebalo ručno otkucati i uparivati 22+
imena; sa ovim, redovi za oba kluba (iz TVOJE baze, ne sa stranice) su već
tu, sa hint kolonom "✓/–" koja pokazuje da li se ime pominje na worldfootball
stranici — samo se upisuju brojevi. **Odbrane golmana i dalje nisu dostupne
na ovom sajtu ni ručnim gledanjem** — proveri drugi izvor ili ostavi 0.

**Poznato ograničenje uparivanja imena:** poklapanje je supstring oba smera
nad normalizovanim (bez dijakritike) prezimenom. Testirano na stvarnim
imenima (Jović/Jovic, Gaćinović) — tačno. Teorijski rizik: vrlo kratko
prezime (2 slova) bi se lažno poklopilo sa dužim koje ga sadrži — nije
nađen nijedan takav slučaj u rosteru, ali hint kolona nije 100% pouzdana za
tako kratka imena.

### Admin panel

- **`/admin`** — dashboard: kola koja traže pažnju (in_progress/data_pulled)
  sa linkom na svaki meč, dugme "Pokreni ingestion sada" (poziva istu
  `runResultsIngestion()` funkciju koju koristi i cron, samo sa
  `triggered_by` popunjenim), sažet pregled svih kola, istorija poslednjih
  10 pokretanja ingestion-a.
- **`/admin/mecevi/[id]`** — tri celine: ručna izmena rezultata/statusa
  (prepisuje ono što je automatika upisala); "Povuci sa worldfootball-a"
  (nalepi URL, parsira, seed-uje redove za SVE igrače oba kluba sa
  `is_admin_reviewed = false`); tabela za unos sa svim FPL poljima
  editabilnim inline — `clean_sheet` se računa sam (0 primljenih golova +
  60+ minuta), dugme "Sačuvaj i potvrdi" postavlja `is_admin_reviewed = true`
  za ceo meč.

**Zaštita ponovnog povlačenja, testirana:** ako admin klikne "Povuci ponovo"
posle što je već potvrdio meč, već potvrđeni redovi (`is_admin_reviewed = true`)
se NE DIRAJU — testirano da uneti golovi i `raw_api_data` ostaju netaknuti.
Samo redovi koji su i dalje na `false` se osvežavaju.

`requireAdmin()` (`lib/admin-guard.ts`) čita `users.is_admin` iz baze na
svakoj admin stranici — NIJE u `middleware.ts`, jer bi to značilo upit ka
bazi na svaki zahtev uključujući statičke resurse. Middleware i dalje traži
login za `/admin`; `requireAdmin()` dodaje drugi sloj (ulogovan ali nije
admin → redirect na `/moj-tim`).

### Vercel Hobby ograničenja — primenjeno, ne samo dokumentovano

`vercel.json` već ima dva cron unosa (08:00, 23:00 UTC) — na limitu za Hobby
plan (max 2 po projektu, svaki najviše jednom dnevno). Posao je projektovan
da radi u malim koracima (po kolu, sa pauzom) tako da presecanje na pola nije
opasno — sledeći poziv (cron ili ručno dugme) samo nastavlja gde je stalo,
zahvaljujući idempotentnosti.

### Preneto iz planiranja, i dalje tačno

1. **Kalendar prvo.** Kola 1–3 i pravi termini (ne 19:00 placeholder) treba
   uneti pre nego što ingestion ima šta da potvrđuje — ingestion sam ne
   pravi kalendar, samo ga ažurira. Odloženi meč Panathinaikos–Kifisias iz
   kola 1 (10.09.2026) je stvaran test slučaj za Fazu B čim se uveze.
2. **Automatski backfill `api_thesportsdb_id`** za ručno unete redove i
   dalje nije urađen — `update-results-thesportsdb.ts` (Faza 4) i dalje
   traži prvo `npm run import-fixtures`. `lib/ingestion.ts` ovo zaobilazi
   jer sam radi upsert po (home_club, away_club), ne zavisi od tog polja.

---

## Revizija Faze 6 — pet popravki

Sama fantasy logika (bodovna tabela, auto-sub, kapiten, čipovi) je ostala
netaknuta — nezavisna provera je potvrdila da je tačna. Popravljeno je sve oko
nje.

### 1. Brzina: ~1.800 poziva ka bazi → 15

Stara verzija je radila red-po-red iz Node-a: ~250 UPDATE-ova statistike, pa 2
upita po IGRAČU, pa 4 upita + 15 UPDATE-ova po KORISNIKU. Za kolo sa 50
korisnika to je oko 1.800 uzastopnih HTTP poziva ka Supabase-u — 40 do 60
sekundi, preko Vercel limita (10s podrazumevano na Hobby planu, max 60s uz
`maxDuration`). Praktično: obračun bi počeo da puca čim liga poraste, i to na
pola posla.

Migracija 007 donosi četiri skupovne funkcije koje rade isti posao u jednom
SQL izrazu po koraku: `score_write_stat_points`, `score_refresh_player_totals`,
`score_write_user_points`, `score_write_auto_subs`.

**Logika je NAMERNO ostala u `lib/scoring.ts`.** Razmatrano je da ceo engine
pređe u PL/pgSQL (kao `apply_transfers`), ali auto-sub greedy algoritam u SQL-u
je znatno teži za čitanje i testiranje, a bio je već napisan i pokriven
testovima. Funkcije iz 007 su zato čisti "upiši ovaj niz" — nijedna fantasy
odluka nije u njima. Ako se ikad bude menjalo pravilo, menja se jedno mesto,
kao i do sad.

Mereno na mock bazi: **15 poziva za 1 korisnika, 16 za 100 korisnika** (razlika
je jedna dodatna strana `squads` redova). Ranije je isti scenario sa 100
korisnika bio preko 3.000 poziva.

`score_write_user_points` upisuje `user_gameweek_points` pa TEK ONDA osvežava
`users.total_points` — dva odvojena izraza, ne CTE. Data-modifying CTE i
naredni SELECT nad istom tabelom vide snimak od početka izraza, pa upravo
upisani redovi ne bi ušli u zbir. Komentar stoji u migraciji da se ne "sredi"
kasnije u jedan izraz.

### 2. Kolo se više ne zaključava kad obračun padne

`gameweeks.status = 'finalized'` se ranije upisivao bezuslovno, pa je
`finalizeGameweekAction` tek posle toga bacao grešku — admin je video crvenu
poruku nad kolom koje je već zaključano. Sad se `finalized` upisuje samo ako je
`errors` prazan; inače kolo ostaje na `admin_reviewed` i isto dugme se može
kliknuti ponovo posle ispravke. `ScoringResult` je dobio polje `finalized` da
se to razlikuje od `ok`.

### 3. Odigran meč bez ijednog reda statistike sad puca

Najopasniji tihi slučaj: validacija je proveravala samo da nijedan POSTOJEĆI
red nije nepotvrđen. Meč za koji admin nikad nije kliknuo "Povuci sa
worldfootball-a" nema nijedan red → nema nepotvrđenih → kolo se obračuna i svi
igrači iz tog meča dobiju nulu, bez ijednog upozorenja. Sad se za svaki
`finished` meč proverava da postoji bar jedan red. **Otkazan meč je izuzet** —
on legitimno nema statistiku.

### 4. Supabase limit od 1000 redova — dva mesta

Supabase vraća najviše 1000 redova po zahtevu, i to ćutke, bez greške i bez
naznake da je odsečeno.

- **`squads` u scoring engine-u** — 15 redova po korisniku znači da bi preko
  ~66 korisnika deo ljudi prosto ne bi bio obračunat. Tempirana bomba, ne
  odmah vidljiv bag. Sad se čita straničenjem (`selectAllPages`, stabilan
  `order` — bez njega `range()` nema definisan redosled pa se strane mogu
  preklopiti). Isto važi i za `player_gameweek_stats`, `users`, `chips_usage`
  i `transfers`.
- **`/admin` hint "koliko potvrđeno"** — povlačio je SVE
  `player_gameweek_stats` redove i brojao u Node-u; kroz sezonu ih bude
  ~6.000, pa bi brojevi tiho postali pogrešni već posle par kola. Sad broji
  baza, kroz novi view `v_gameweek_stat_review`.

### 5. Dnevnik se zatvara i kad obračun pukne

Red u `ingestion_runs` se ubacuje pre validacija, pa je ranije ostajao zauvek
bez `finished_at` ako bilo koja validacija baci grešku — na dashboard-u je
izgledao kao posao "u toku". Sad je sve u `try/catch`, a `closeRun()` upisuje
`finished_at` i poruku greške pre nego što se izuzetak prosledi dalje.

### Sitnica: kapiten sa klupe

`resolveCaptainMultiplier` je tražio samo "kapiten je odigrao > 0 minuta". Ako
je kapiten odigrao ali ostao na klupi (nije auto-subbed in), množilac bi bio
dodeljen igraču koji nije u efektivnoj postavi — nigde ne bi pao, a vice bi
ostao praznih ruku iako je igrao. Sad funkcija prima i `effectiveIds` i traži
oba uslova. UI danas ne dozvoljava kapitena na klupi, ali RPC-ovi to ne
garantuju.

### Testirano

`npm run verify-scoring` (`verify-faza6.ts`) — **56 provera, sve prolaze.**
Za razliku od ranijih rundi, ovaj skript JESTE deo isporuke: mock Supabase
klijent sad razume i `rpc()` i `range()` straničenje, pa se ceo tok može
ponovo pustiti posle svake izmene umesto da se testovi pišu iznova.

Pokriveno: bodovna tabela po pozicijama, auto-sub (uklj. odbijenu zamenu koja
bi pokvarila formaciju i dve zamene odjednom), kapiten sa svim fallback-ovima,
end-to-end obračun, idempotentnost (dva prolaza daju identičan rezultat i
nijedan keš se ne udvostručuje), prazan odigran meč, otkazan meč, nepotvrđena
statistika, neodigran meč, straničenje sa 100 korisnika (1.500 `squads`
redova), Triple Captain i Favorite Club x2.

**Migracija 007 je testirana na PRAVOM Postgres-u**, ne samo na mock-u —
`schema.sql` + sve migracije 003-007 su učitane u čist PostgreSQL 16 (uz
stub-ove za `auth.uid()` i Supabase role), pa su sve četiri funkcije i view
pozvane sa stvarnim podacima. Provereno: skupovni upis poena, `total_points`
kao SUM cele sezone (ne samo tekućeg kola), idempotentnost upserta,
brisanje starog auto-sub traga, i agregacija u view-u. Ostaje netestirano
protiv prave Supabase instance: RLS/service-role dozvole i klik-tok u
pregledaču.

---

## Faza 6 — scoring engine

`lib/scoring.ts` — jedna funkcija `runScoringForGameweek(supabase, gameweekId,
triggeredBy)`, poziva se preko novog dugmeta "Obračunaj poene" na `/admin`
(server action `finalizeGameweekAction`, `app/admin/actions.ts`).

**Tok:** validira da su svi mečevi kola gotovi (finished/cancelled), da svaki
odigran meč IMA unetu statistiku, i da je sva potvrđena
(`is_admin_reviewed = true`) → `data_pulled` →
`admin_reviewed` → upiše `fantasy_points` po redu → osveži `players.total_points`
keš → izračuna `user_gameweek_points` po korisniku (auto-sub, kapiten, čip,
transfer penal) → osveži `users.total_points` keš → `admin_reviewed` →
`finalized`. Upisuje i u `ingestion_runs` (isti dnevnik kao Faza 5, `kind =
"admin_scoring_finalize"`), pa se obračun vidi u "Poslednja pokretanja" na
dashboard-u.

**Bezbedno za ponovno pokretanje — namerno, ne kao slučajna nuspojava.** Svaki
upis je "izračunaj iznova iz sirovih vrednosti", ne inkrementalan. Dugme radi
i nad `finalized` kolom ("Ispravka već obračunatog kola" sekcija na
dashboard-u) — admin ispravi unetu statistiku pa ponovo klikne, sve se
prekalkuliše bez dupliranja (`user_gameweek_points` je `upsert` na
`user_id, gameweek_id`, keš kolone su uvek `SUM` iznova, ne `+=`). Testirano.

### Tri odluke koje GDD nije eksplicitno pokrivao

1. **Bonus poeni** (sekcija 10, "najbolji u meču, BPS sistem, 1-3") — nema
   sirovih statistika u bazi iz kojih bi se pravi BPS računao (defanzivni
   doprinos svesno preskočen u istoj sekciji), niti je admin forma ikad imala
   polje za ovo. Dodato ručno polje `bonus_points` u
   `/admin/mecevi/[fixtureId]` (kolona "Bonus" u tabeli, uz `STAT_FIELDS` u
   `actions.ts`) — admin dodeljuje 1-3 po sopstvenoj proceni (npr. gledajući
   whoscored.com), scoring engine ga samo sabira. 0 ako se ne unese.
2. **Auto-sub** — GDD nema posebnu sekciju, ali "identično FPL" (sekcija 1)
   plus `squads.squad_order` komentar ("redosled koji će auto-sub logika u
   Fazi 6 koristiti") jasno signaliziraju da se očekuje. Implementiran je
   standardni FPL greedy algoritam: golman se menja samo golmanom (uvek
   validno ako klupski GK ima minute), za ostala mesta se ide kroz klupu po
   `squad_order` prioritetu i za svakog kandidata traži bilo koji još-
   nezamenjeni "0-minutni" starter čije uklanjanje + ulazak kandidata i dalje
   poštuje `STARTING_XI_BOUNDS`. Ako zamena nije moguća (npr. i klupski GK ima
   0 min), taj slot ostaje "u postavi" sa 0 poena — tim efektivno igra sa manje
   od 11 koji su doneli poene, isto kao što se realno dešava i na FPL-u.
3. **Čipovi** — Triple Captain i Favorite Club x2 SU implementirani u
   obračunu (čita `chips_usage`, primenjuje 3x kapitenu / 2x igračima iz
   omiljenog kluba u efektivnoj postavi — testirano da se ova dva množioca
   STACKUJU ako je kapiten baš iz omiljenog kluba, npr. 8 poena → ×2 kapiten
   ×2 klub = 32, pošto GDD sekcija 5 eksplicitno kaže da je samo JEDAN čip
   aktivan po kolu, pa preklapanje sa Triple Captain-om nije ni moguće). Ali
   NIJEDNO dugme za aktivaciju čipa ne postoji nigde u aplikaciji (potvrđeno
   pre početka ove runde: nula pominjanja "chip" izvan `schema.sql`) — to je
   hendover od Faze 5 već označio kao prirodan sledeći korak POSLE scoring
   engine-a, tj. namerno van obima ove runde. Dok UI ne postoji, `chips_usage`
   je uvek prazna tabela i kod se svodi na "kapiten uvek 2x, bez klupskog
   bonusa" — bezopasno, ali spremno čim UI stigne. Joker #1/#2 NEMAJU efekat u
   scoring engine-u (oni menjaju cenu transfera, ne poene) — to ostaje posao
   `make_transfer()`/`apply_transfers()` kad god im UI stigne; scoring engine
   samo SABIRA `transfers.points_cost`, ne odlučuje o njemu.

### Poeni — GDD sekcija 10, red po red

`calculateRowFantasyPoints()` — minuti su ISKLJUČIVI (60+ min = 2, ne 1+2=3,
česta greška pri prepisivanju FPL pravila). Gol/asistencija/clean sheet po
poziciji, GK odbrane `floor(saves/3)`, primljeni golovi `floor(conceded/2)*-1`
za GK/DEF, kartoni/autogol/promašen penal isto za sve pozicije. Poziva se PO
REDU (jedan meč), sabiranje na nivou gameweek-a radi orkestrator — tako duplo
kolo (GDD sekcija 15, meč premešten pa klub odigra 2 meča u istom gameweek-u)
radi bez ikakve posebne logike, prosto se sabiraju oba reda.

`raw_points` (na `user_gameweek_points`) = zbir efektivne postave BEZ
množilaca/čipova, tačno kako schema.sql komentar kaže ("PRE multiplier-a").
`total_points` = zbir SA množiocima + `transfer_cost` (koji je SUM
`transfers.points_cost` za to kolo — taj deo je već radio od ranije, scoring
engine ga samo sabira, ne odlučuje o penalu).

### Testirano

Mock Supabase klijent, `npm run verify-scoring`. Ovaj spisak je iz prve runde;
posle revizije (videti gore) skript ima 56 provera i JESTE deo isporuke.
- Tabela poena red po red za sve pozicije (GK odbrane+penal, DEF primljeni
  golovi, MID gol+asist+clean sheet+bonus, crveni+autogol+promašen penal,
  isključivost minuta 45min≠60min pravilo).
- Auto-sub: GK-za-GK zamena, poljska zamena kad je validna, poljska zamena
  ODBIJENA kad bi pokvarila formaciju (GK slot ne sme da popuni DEF).
- Kapiten: normalan 2x, Triple Captain 3x, fallback na vice kad kapiten ima 0
  min, NIKO ne nosi množilac kad ni vice nije igrao.
- End-to-end preko `runScoringForGameweek` sa punom mock bazom (1 meč, 15
  igrača, 1 korisnik): tačan `raw_points`/`total_points`/`transfer_cost`,
  `players.total_points` i `users.total_points` keš, upis u `ingestion_runs`,
  status kola do `finalized`.
- **Idempotentnost**: isto kolo obračunato dvaput daje IDENTIČAN
  `total_points`, bez dupliranja `user_gameweek_points` reda niti duplog
  brojanja u `users.total_points` kešu.
- Favorite Club x2 čip: tačan zbir sa stackovanim kapiten+klub množiocem.

Nisu testirani: pravi Postgres (RLS/service role dozvole), pravi admin UI
klik-tok (dugme/forma), duplo kolo end-to-end (logika je ista kao jednostruko
kolo, samo se redovi sabiraju — pokrivena je posrednim putem kroz
`calculateRowFantasyPoints` + sabiranje, ne kroz poseban scenario sa 2 fixture
reda u mock bazi).

### `/admin` promene

Dugme "Obračunaj poene" se pojavljuje na kartici kola kad je status
`data_pulled` ili `admin_reviewed`, sa hint tekstom (koliko mečeva
gotovo/koliko redova potvrđeno) — sam hint je samo orijentacija, prava
provera je na serveru. Nova sekcija "Ispravka već obračunatog kola" (dropdown
+ dugme) za `finalized` kola. "Kola koja traže pažnju" filter proširen da
uključi `admin_reviewed` (ranije je stao na `data_pulled`).

### `players.total_points` / `users.total_points` keš

Oba se računaju kao `SUM` preko SVIH kola tog igrača/korisnika (ne
inkrementalno `+=`) — svaki put kad scoring engine dotakne tog igrača/
korisnika. Sporije nego inkrement, ali imuno na duplo brojanje pri ponovnom
pokretanju (videti "bezbedno za ponovno pokretanje" iznad) — namerno
odabrano nad bržom ali rizičnijom alternativom.

---

## Faza 9 — liga standings + statistike

### `/liga`

Bila je goli `<ul>` sa `#rang — ime — poeni`. Sad je tabela: rang, grb u boji
tima, ime tima, poeni poslednjeg zaključanog kola, ukupno. Tvoj red je istaknut
i ima dugme „Moj tim je N. → pokaži” koje skroluje do njega.

Pretraga po imenu tima **ne menja rangove** — filtriranje pokazuje manje redova,
ali svaki red i dalje nosi svoj pravi rang iz cele lige. (Alternativa —
prenumerisati filtrirane redove — izgleda urednije a laže.)

Izvor je `v_global_league_standings`: rang se računa iz `user_gameweek_points`,
NE iz `users.total_points` keša. Scoring engine održava oba i treba da se
poklapaju; ako se ikad raziđu, tačan je view.

**Kolona „kolo” prikazuje poslednje ZAKLJUČANO kolo, ne kolo u toku.** Dok
obračun nije gotov ti brojevi su nule ili polovični, a rang lista koja se menja
u toku vikenda bez objašnjenja je gora od nikakve.

### `/statistike`

Bio prazan plejsholder. Sad četiri taba nad view-ovima iz `schema.sql`
(nijedan nije menjan): fantasy poeni po poziciji, strelci, asistenti, klubovi.

**Zamka nađena testiranjem na pravom Postgres-u, vredi je znati:** na startu
sezone su svi `total_points` nule, pa `RANK()` u `v_top_fantasy_by_position`
svakom igraču daje rang 1 — filter „rank <= 5” je vratio **svih 14 test-igrača
kao top 5**. Zato svaka lista traži i da je vrednost > 0. Nema poena → nema
liste, uz poruku umesto lažne tabele.

Druga posledica istog `RANK()`: izjednačeni dele mesto, pa „top 5” ume da vrati
6+ redova (tri prva mesta → sledeći je 4.). Redni broj u listi bi tu lagao, pa
se prikazuje stvarni `rank_in_position` iz view-a, ne pozicija u nizu.

### Straničenje

`selectAllPages` je izvučen iz `lib/scoring.ts` u **`lib/db-paging.ts`** jer ga
sad koristi i `/liga`. Isto pravilo važi za svaki novi ekran: svaki `select`
bez `range()` ćuti kad Supabase odseče na 1000 redova.

### Testirano

Faza 9 nema jedinične testove (sve su prikazi nad view-ovima), ali su SVI
upiti pušteni protiv pravog PostgreSQL-a sa podacima: rang lista sa
korisnikom bez ijednog poena (LEFT JOIN ga mora vratiti sa 0 — vraća),
klupske sume, filter po poslednjem zaključanom kolu, i gore opisana zamka sa
rangovima. `npm run build` prolazi, `tsc --noEmit` čist.

Netestirano: izgled u pregledaču i ponašanje sa stvarno velikom ligom.

---

## Čipovi — migracija 008

### Bezbednosna rupa nađena usput

Politika `chips_insert_own` je dozvoljavala INSERT u `chips_usage` za **bilo
koje kolo**, jer RLS proverava samo vlasništvo, ne i rok. Korisnik je preko
anon ključa mogao da doda Triple Captain na već odigrano kolo i, pri sledećem
ponovnom obračunu tog kola, dobije 3x kapitena retroaktivno.

Popravljeno istim obrascem kao squads/transfers u migraciji 003: `REVOKE
INSERT, UPDATE, DELETE`, politika obrisana, sve pisanje ide kroz funkcije koje
rok proveravaju u bazi.

### `gameweeks.joker_window` — kad se koji Joker otvara

Triple Captain i Favorite Club x2 su po GDD-u "slobodno": bilo koje kolo,
jednom po sezoni. Jokeri nisu — #1 je vezan za zimsku pauzu, #2 za prelazak u
plej-of. Ta dva trenutka nigde nisu postojala kao podatak.

- **joker_2 se izvodi iz šeme.** Migracija ga postavlja na prvo kolo čija
  `phase` nije `'regular'` — to JESTE "prelazak u plej-of". Postavlja se samo
  ako već nije postavljen, pa ponovno pokretanje ne gazi admin izmenu.
- **joker_1 se NE može izvesti** — nijedna kolona ne opisuje zimsku pauzu. Zato
  ga admin bira na `/admin` ("Prozor za Joker #1"). Dok nije izabran, taj čip se
  ne nudi nikome.

⚠️ Ako se ovo ne slaže sa GDD-om, menja se jedan `UPDATE` u migraciji i jedan
dropdown na `/admin` — logika aktivacije ne zna ništa o kolima, samo poredi
`joker_window` sa traženim čipom.

### `activate_chip` / `cancel_chip`

Baza je već čuvala dva pravila preko UNIQUE ograničenja (svaki čip jednom po
sezoni; najviše jedan čip po kolu). `activate_chip` ih hvata unapred da
korisnik dobije razumljivu poruku ("Taj čip je već iskorišćen u 7. kolu.")
umesto sirove greške o ograničenju, i dodaje proveru roka i joker-prozora.

`cancel_chip` je asimetričan, namerno:
- **Triple Captain i Favorite Club x2** se otkazuju slobodno pre roka — utiču
  samo na obračun, koji se dešava posle roka, pa otkazivanje ne ostavlja trag.
- **Joker se odbija čim za to kolo postoji ijedan transfer.** Cena transfera se
  upisuje u trenutku transfera; ko aktivira Joker, napravi 10 besplatnih
  transfera pa otkaže čip, zadržao bi i transfere i čip.

### Joker u `make_transfer` / `apply_transfers`

Obe funkcije su prepisane u celini iz migracija 003 i 005; jedina razlika je
`v_joker`. Kad je Joker aktivan u tom kolu: svaki transfer je 0 poena i
`free_transfers` se ne troše. Scoring engine se NIJE dirao — on samo sabira
`transfers.points_cost` i nikad nije odlučivao o penalu.

### UI

`app/moj-tim/chips-panel.tsx`, iznad terena. Sva pravila proverava baza; panel
ih samo prikazuje unapred, pa je dugme koje ne može da uspe onemogućeno sa
razlogom ("Iskorišćen u 7. kolu", "Nije otvoren u ovom kolu", "Već je aktivan
Triple Captain") umesto da korisnik klikne pa dobije grešku. Favorite Club x2
se ne nudi dok omiljeni klub nije izabran u podešavanjima.

Jedini izuzetak: odbijanje otkazivanja Jokera posle transfera UI ne zna
unapred (ne čita transfere), pa se ta poruka prikazuje tek kad stigne.

### Testirano na pravom Postgres-u

Cela migracija je učitana u čist PostgreSQL 16 zajedno sa 003-007, pa je
dvanaest scenarija pušteno kao `authenticated` rola sa postavljenim
`auth.uid()`:

- direktan `INSERT` u `chips_usage` odbijen (nema privilegije)
- aktivacija na kolo sa isteklim rokom odbijena
- Triple Captain aktiviran, pa drugi čip u istom kolu odbijen
- isti čip u drugom kolu odbijen ("već iskorišćen u 2. kolu")
- otkazivanje pa Joker #2 van svog prozora odbijen
- Joker #1 bez postavljenog prozora odbijen
- **bez Jokera:** 2 transfera, 1 slobodan → `0, -4`, `free_transfers` 1 → 0
- **sa Jokerom:** ista 2 transfera → `0, 0`, `free_transfers` ostaje 1
- otkazivanje Jokera posle transfera odbijeno
- `make_transfer` (jedan po jedan) pod Jokerom takođe 0

---

## Javni pregled tuđeg tima — `/tim/[id]`

Rang lista sad vodi na tim. Stranica prikazuje sastav na terenu (isti `Pitch` i
`Jersey` kao `/moj-tim`), poene po igraču, kapitensku traku, klupu, korišćen
čip i cenu transfera za to kolo.

**Prikazuje SAMO poslednje zaključano kolo, nikad tekuće.** Sastav za kolo čiji
rok nije prošao je tajna do roka — inače bi se tuđi tim mogao prepisati pre
deadline-a. RLS na `squads` je `select_all` (javno čitanje, po GDD sekciji 9),
pa filtriranje mora da uradi stranica; baza ga ne radi za nas. Ovo je jedina
stvar na toj stranici koju NE sme da promeni neko ko ne razume zašto stoji.

Igrač koga je uveo auto-sub ima oznaku na dresu (`flag` prop na `Jersey`).

---

## `npm run backfill-fixture-ids`

Popunjava `fixtures.api_thesportsdb_id` za mečeve unete preko CSV kalendara.

Postoji odvojeno od `npm run import-fixtures` zato što ta skripta backfilluje ID
usput, ali usput i UPISUJE kalendar — menja termine i može da doda kola kojih u
CSV-u nema. Ako je kalendar već sređen ručno, to je poslednje što se želi. Nova
skripta ne dira ništa osim te jedne kolone, i podrazumevano radi probni prolaz
(`-- --apply` da stvarno upiše).

Uparuje po PARU KLUBOVA, ne po datumu: termin se pomera (odloženi mečevi, TV
raspored), par se ne menja. Neuparena imena sa TheSportsDB-a se ispisuju uz
podsetnik na `THESPORTSDB_CLUB_ALIASES`.

`lib/ingestion.ts` (cron) ovo i dalje ne traži — on uparuje po klubovima i radi
bez ID-ja. Backfill je za `update-results-thesportsdb.ts`, koji filtrira po
ID-ju; njegovo upozorenje sad upućuje na novu skriptu.

---

## Održavanje kalendara iz panela

Tri posla koja su bila samo `npm run` skripte sad imaju dugmad na `/admin`,
sekcija "Održavanje kalendara": povezivanje ručno unetih mečeva sa TheSportsDB,
osvežavanje rezultata, i uvoz kalendara.

### Logika je preseljena, ne kopirana

Skripte su bile `console.log` + `process.exit` — neupotrebljivo iz web zahteva.
Logika je zato preseljena u **`lib/maintenance.ts`**, koja vraća strukturiran
`TaskResult { ok, summary, lines, warnings, remaining }`. Skripte u `scripts/`
su sad tanki omotači (`scripts/_cli.ts` nosi `.env.local`, WebSocket polyfill i
ispis), a server action-i u `app/admin/actions.ts` zovu iste funkcije.

Isti obrazac kao `lib/ingestion.ts` (Faza 5), koju već dele cron ruta i admin
dugme. Usput je nestao duplikat: `import-fixtures-thesportsdb.ts` je imao
SOPSTVENU kopiju `CLUB_ALIASES` i `resolveClubId`, odvojenu od one u
`lib/thesportsdb.ts` — dva mesta koja su morala da se menjaju zajedno a niko to
ne bi primetio dok se ne raziđu. Sad postoji jedno.

### Trajanje — zašto `maxDuration = 60`

Pozivi ka TheSportsDB-u imaju razmak od 1.5s zbog rate limita (free tier ~30
zahteva/min). Sedam mečeva jednog kola je već preko podrazumevanih 10s koliko
Vercel Hobby daje serverless funkciji. Zato `app/admin/page.tsx` sad nosi
`export const maxDuration = 60` (maksimum na Hobby planu), što važi za sve
server action-e pokrenute sa te stranice.

Uz to, **osvežavanje rezultata radi u porcijama** — najviše 15 mečeva po
pokretanju, pa vrati `remaining` i poruku "ostalo još X, pokreni ponovo".
15 × 1.5s ≈ 23s plus mrežno vreme staje u 60s sa rezervom. Bez porcija bi
loše kolo umelo da pukne na pola posla.

### Dve zaštite koje CLI nije imao

1. **Backfill se prvo pušta kao probni prolaz.** Dugme "Upiši N" se pojavljuje
   tek kad probni prolaz nešto nađe, i piše koliko mečeva dodiruje. U terminalu
   je ovo bila zastava `--apply` koju je lako zaboraviti — ili, gore, otkucati
   bez `--` pa da je `npm` proguta i tiho odradi još jedan probni prolaz.
2. **Uvoz kalendara traži potvrdu.** On pravi kola koja ne postoje i PREPISUJE
   termine postojećim mečevima; ako su termini sređivani ručno, gazi ih. Ostala
   dva posla su bezopasna i idu na jedan klik.

Ceo ispis se prikazuje u panelu — koji meč je ažuriran, šta nije upareno,
koliko je ostalo. Posao koji zove spoljni API bez ispisa je posao kome se ne
veruje.

### Napomena o osvežavanju rezultata

To dugme je **rezerva, ne glavni put.** "Pokreni ingestion sada"
(`lib/ingestion.ts`) radi po KOLU — jedan poziv za 7 mečeva umesto sedam
poziva — i ne traži `api_thesportsdb_id` uopšte. Panel to i piše, da se ne
koristi pogrešno dugme iz navike.

### Testirano

`npm run verify-maintenance` — **16 provera**, `fetch` zamenjen lažnim (testovi
ne smeju da zavise od toga da li je TheSportsDB gore). Pokriveno: probni prolaz
ne upisuje ništa, `--apply` upisuje, uparivanje preko aliasa ("Iraklis 1908" →
"Iraklis"), povratni meč dobija SVOJ ID a ne ID prvog susreta, neuparen klub
završi u upozorenjima, porcije i `remaining`, i status FT bez rezultata ostaje
`live` umesto da upiše lažno 0:0 koje bi scoring engine uzeo kao konačno.

CLI komande rade i dalje isto:

```
npm run backfill-fixture-ids            # probni prolaz
npm run backfill-fixture-ids -- --apply
npm run update-results
npm run import-fixtures
```

---

## Šta je stvarno ostalo

Ništa od koda. Sve što sledi je posao sa podacima, koji traži pristup pravim
izvorima:

1. **Kola 1-3 nisu uvezena u kalendar.** Ingestion ne pravi kalendar, samo ga
   ažurira — dok ovo ne uđe, nema šta da potvrđuje. Odloženi meč
   Panathinaikos-Kifisias iz kola 1 je stvaran test za Fazu B ingestion-a.
2. **Kola 5-26 imaju placeholder kickoff (19:00 lokalno)** dok zvaničan TV
   raspored ne izađe. DST je proveren — 19:00 lokalno izlazi tačno i letnji
   (16:00 UTC) i zimski (17:00 UTC).
3. **Kalamata** je jedini klub od 14 koji nije potvrđen protiv TheSportsDB
   naziva. Prvi `backfill-fixture-ids` će to pokazati: ako njeni mečevi ostanu
   neupareni, dodaj alias u `lib/thesportsdb.ts`.
4. **Prozor za Joker #1** treba izabrati na `/admin` kad se zna kad je zimska
   pauza.
5. **`is_admin`** postaviti u SQL Editor-u ako već nije (videti gore).

Sve pod 1-3 se sad radi iz admin panela, ne iz terminala.

Prvi pravi test celog lanca je prvo odigrano kolo: ingestion povuče rezultate →
admin unese statistiku → "Obračunaj poene" → `/liga` i `/statistike` ožive.
