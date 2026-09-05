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
