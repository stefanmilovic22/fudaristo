-- Nalog postoji u Authentication, a nema reda u public.users.
-- (Profil bi trebalo da pravi trigger on_auth_user_created iz migracije 003.)

-- 1) Da li trigger postoji? Treba da vrati 1 red.
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- 2) Ko nema profil?
SELECT u.id, u.email, u.raw_user_meta_data
  FROM auth.users u
  LEFT JOIN public.users p ON p.id = u.id
 WHERE p.id IS NULL;

-- 3) Napravi profile koji nedostaju (ime, boja i omiljeni klub iz podataka naloga).
--    Ako nema imena tima u podacima, dobija "Tim xxxxxxxx" — korisnik ga menja u Podešavanjima.
INSERT INTO public.users (id, team_name, team_color, favorite_club_id)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'team_name', 'Tim ' || left(u.id::TEXT, 8)),
       COALESCE(u.raw_user_meta_data->>'team_color', '#1E88E5'),
       NULLIF(u.raw_user_meta_data->>'favorite_club_id', '')::UUID
  FROM auth.users u
  LEFT JOIN public.users p ON p.id = u.id
 WHERE p.id IS NULL
ON CONFLICT DO NOTHING;
-- Ako ovde javi grešku o duplom imenu tima (UNIQUE), nalog sa istim imenom već postoji —
-- reci mi pa ćemo ga rešiti ručno.

-- 4) Ako je korak 1 vratio 0 redova, trigger fali: ponovo pokreni poslednji deo
--    migrations/003-security-and-rpc.sql (od "CREATE OR REPLACE FUNCTION public.handle_new_auth_user()"
--    do kraja), pa ponovi korake 2 i 3.
