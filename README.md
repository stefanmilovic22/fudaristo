# Fudaristo — setup (Faza 0)

Ovaj skelet odgovara Fazi 0 iz `IMPLEMENTATION-PLAN.md`. Struktura foldera,
Supabase klijenti, middleware, i placeholder stranice za sve rute su već tu.
Prati korake ispod tačno tim redosledom.

## 1. Instaliraj zavisnosti

```bash
cd fudaristo
npm install
```

## 2. Napravi GitHub repo

```bash
git init
git add .
git commit -m "Faza 0: initial skeleton"
gh repo create fudaristo --private --source=. --push
# (ili ručno kroz github.com, pa git remote add origin ... && git push)
```

## 3. Poveži sa Vercel-om

1. Idi na https://vercel.com/new, izaberi upravo kreirani GitHub repo
2. Framework Preset: Next.js (auto-detektovano)
3. NE deploy-uj još — prvo podesi environment varijable (korak 5)

## 4. Napravi Supabase projekat

1. https://supabase.com/dashboard → New Project
2. Sačekaj da se provizioniše (par minuta)
3. Project Settings → API → kopiraj:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` ključ → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` ključ → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ tajno, nikad u
     klijentski kod, samo server-side)
4. Authentication → Providers → Email → **isključi "Confirm email"**
   (sekcija 14 GDD-a — kratka registracija bez verifikacije)

## 5. Podesi environment varijable

```bash
cp .env.local.example .env.local
# popuni sve vrednosti iz koraka 4, plus API_FOOTBALL_KEY (korak 7) i CRON_SECRET (bilo koji dugačak random string)
```

Iste vrednosti unesi i u Vercel: Project Settings → Environment Variables
(za `Production`, `Preview` i `Development`).

## 6. Pokreni schema.sql

1. Supabase Dashboard → SQL Editor → New query
2. Nalepi ceo sadržaj `schema.sql` (iz planiranja, van ovog repo-a — dodaj ga
   u root projekta pre ovog koraka)
3. Run — kreira svih 14 tabela, enum tipova, view-ova i RLS politika
4. Proveri: Table Editor → treba da vidiš `clubs`, `players`, `users`, itd.

## 7. Napravi API-Football nalog

1. https://www.api-football.com → registruj se, uzmi besplatan API key
2. Dodaj ga u `.env.local` kao `API_FOOTBALL_KEY`

## 8. Pokreni lokalno

```bash
npm run dev
```

Otvori http://localhost:3000 — trebalo bi da vidiš landing stranicu, i sve
rute iz navigacije (Moj klub, Transferi, Liga, Statistike) da rade kao
placeholder-i. `/liga` već pokušava da čita iz baze (proveri da schema.sql
korak nije preskočen ako vidiš grešku).

## 9. Prvi deploy

```bash
git push
```

Vercel automatski build-uje i deploy-uje. Proveri da cron job-ovi iz
`vercel.json` postoje: Vercel Dashboard → Project → Cron Jobs.

## 10. Provera izvora podataka (Faza 5)

```bash
npm run check-sources                      # sve tri provere
npm run check-sources -- --event 2154321   # konkretan TheSportsDB meč
npm run check-sources -- --skip-worldfootball
```

Odgovara na pitanje odakle vaditi igračku statistiku (minuti, golovi,
asistencije, kartoni, odbrane) za grčku Super ligu. Ništa ne upisuje u bazu —
čita, ispisuje nalaz i snima sirove odgovore u `tmp/` da se parser posle piše
iz njih, bez novih poziva.

- **TheSportsDB** — ima li `lookuplineup` / `lookuptimeline` / `lookupeventstats`
  podatke za ovu ligu. Testira se besplatnim ključem `123`; ako vrati tačno 5
  zapisa, to je tavanica besplatnog ključa a ne odsustvo podataka, i skripta to
  kaže. Premium je $9/mesec i usput donosi livescores.
  Sa premium ključem: `THESPORTSDB_KEY=xxx npm run check-sources`.
- **API-Football** — polje `coverage.statistics_players` za **tekuću** sezonu.
  Ranije sezone mogu biti pokrivene a ova ne, pa se zaključak izvodi samo iz
  tekuće. Zahteva `API_FOOTBALL_KEY`; bez njega se preskače.
- **worldfootball.net** — potvrda da izveštaj sa meča sadrži postavu, minute
  izmena, golove, asistencije i kartone.

⚠️ Skripta povlači dve worldfootball stranice, jednom, sa pauzom — to je
dijagnostika. Pre nego što od toga nastane cron koji radi svake nedelje,
pročitaj njihove opšte uslove (https://www.worldfootball.net/terms/).

---

## 11. Migracije baze (posle schema.sql)

Pokreni redom u Supabase → SQL Editor. Bezbedno je pokrenuti više puta.

```
migrations/003-security-and-rpc.sql
migrations/004-reset-squad.sql
migrations/005-lineup-and-batch-transfers.sql
migrations/006-ingestion-and-worldfootball.sql
```

⚠️ **Obavezno pre puštanja u rad.** Bez ove migracije:
- svaki ulogovan korisnik može sam sebi da postavi `is_admin = true` i
  proizvoljan budžet (RLS politika `users_update_own` je imala samo `USING`,
  bez `WITH CHECK`, a `authenticated` rola je imala UPDATE na sve kolone)
- sastav i transferi se upisuju iz browsera u 4 odvojena zahteva, bez
  serverske provere roka — može se upisati tim za kolo koje je već odigrano
- sastav se ne prenosi iz kola u kolo

Posle migracija aplikacija zove `save_squad()`, `apply_transfers()`,
`update_lineup()`, `carry_over_squad()` i `reset_squad()` umesto da piše
direktno u tabele. (`make_transfer()` iz 003 ostaje u bazi kao pojedinačni
transfer, ali ga UI više ne koristi — sve ide kroz `apply_transfers()`.)

Migracija 006 dodaje `ingestion_runs` tabelu i dve kolone (`fixtures.worldfootball_url`,
`players.api_worldfootball_id`) za Fazu 5 (automatski ingestion rezultata +
admin panel). Ništa u njoj ne zahteva RPC pozive iz aplikacije — admin panel
piše preko service role klijenta (`lib/supabase/server.ts` → `createServiceRoleClient()`),
isti obrazac kao cron ruta.

**Da bi admin panel radio, bar jedan korisnik mora imati `is_admin = true`.**
Nijedan korisnik to ne može sam sebi da postavi (migracija 003 to sprečava) —
postavi ga direktno u Supabase SQL Editor-u kao superuser:
```sql
update users set is_admin = true where team_name = 'Tvoj Tim';
``` Ako migracija nije
pokrenuta, čuvanje tima vraća grešku "function does not exist".

---

## Definition of done (Faza 0)

- [ ] `npm run dev` radi lokalno bez grešaka
- [ ] Sve rute iz navigacije se otvaraju (i pored placeholder sadržaja)
- [ ] `/liga` se povezuje na Supabase (čak i ako je "baza prazna" poruka —
      to znači konekcija radi)
- [ ] Vercel deploy je live i javno dostupan
- [ ] Cron job-ovi se vide u Vercel dashboardu (još rade placeholder logiku)

## Sledeći korak

Faza 1 (Auth & korisnički profil) — videti `IMPLEMENTATION-PLAN.md`.
