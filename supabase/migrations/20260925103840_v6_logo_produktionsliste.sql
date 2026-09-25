-- 0201 · Logo-Produktionsliste für die Foto-Wand, Abschnitt logoWall (ADM-048)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925103840.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, 22.09. — Partner-Logos fuer die Foto-Wand wurden in den Vorjahren immer wieder
-- vergessen.
--
-- **Die Umkehrung ist der ganze Punkt.** Eine Liste des Vorhandenen verhindert das Vergessen nicht,
-- sie *sieht* nur vollstaendig aus: wer nie eine Datei hochgeladen hat, taucht darin gar nicht auf
-- — und genau der wird vergessen. Deshalb steht hier **jeder Partner der Edition**, und was fehlt,
-- steht als leere Zelle da. Ein `join` auf die Logo-Pflicht waere die bequemere Abfrage und die
-- falsche.
--
-- Gedruckt wird nur, was **beides** hat: eine Vektordatei und die Einwilligung zum Weissen
-- (`org_edition.logo_whitening_consent_at`, 22.09.). Fehlt eines von beidem, ist die Antwort nicht
-- „fast fertig", sondern **nein** — deshalb ein eigenes Feld `druckbar` und ein Textfeld `fehlt`,
-- das benennt, was zu tun ist, statt es aus drei Spalten erraten zu lassen.
--
-- **Die Logokategorie steht bewusst nicht hier** (ADM-046, noch nicht gebaut). Sie jetzt aus
-- `partner_category` oder dem Sponsoring-Level zu erfinden hiesse, die Druckerei mit einer
-- Ableitung zu beliefern, die spaeter nicht stimmt. Die Spalte kommt mit ihrem Feld.
--
-- Eigener Abschnitt `logoWall`: die Liste gehoert nicht nur dem Partner-Team, sondern auch
-- Produktion und Marketing — die drucken die Wand. Rechte ueber PORT1b, damit sie sich je Person
-- nachschaerfen lassen.
-- Test: `supabase/tests/v6_logo_produktionsliste.sql`.

-- 1 · Der Abschnitt (Spiegelung von lib/admin-sections.ts, PORT1b)
insert into admin_section_role (section, role) values
  ('logoWall', 'admin'),
  ('logoWall', 'area_lead_partner'),
  ('logoWall', 'partner_team'),
  ('logoWall', 'area_lead_production'),
  ('logoWall', 'production_team'),
  ('logoWall', 'marketing_team')
on conflict (section, role) do nothing;

-- 2 · Die Liste
create or replace function partner_logo_production(p_edition_id uuid default null::uuid)
 returns table(org_id uuid, org_edition_id uuid, org_name text, sponsoring_level text,
               vektor_datei text, vektor_status text, vektor_seit timestamp with time zone,
               pixel_datei text, einwilligung timestamp with time zone,
               druckbar boolean, fehlt text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
declare v_ed uuid;
begin
  if not has_admin_section('logoWall') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;

  return query
  with basis as (
    select oe.id as oe_id, oe.org_id, oe.sponsoring_level, oe.logo_whitening_consent_at,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name) as name,
           -- **Left join, nicht join**: ein Partner ohne jede Datei muss in der
           -- Liste stehen, sonst faellt genau er wieder durch.
           (select a.filename from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor,
           (select a.status from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor_status,
           (select a.created_at from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor_seit,
           (select a.filename from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_png' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as pixel
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed
  )
  select b.org_id, b.oe_id, b.name, b.sponsoring_level,
         b.vektor, b.vektor_status, b.vektor_seit, b.pixel, b.logo_whitening_consent_at,
         b.vektor is not null and b.logo_whitening_consent_at is not null,
         -- Sagt, was zu tun ist. Drei Spalten zu lesen und daraus zu schliessen
         -- ist im Druckstress genau die Arbeit, die niemand macht.
         nullif(concat_ws(' · ',
           case when b.vektor is null then 'Vektordatei fehlt' end,
           case when b.logo_whitening_consent_at is null then 'Einwilligung zum Weissen fehlt' end,
           case when b.vektor is not null and b.vektor_status = 'pending' then 'Datei noch ungeprueft' end), '')
    from basis b
   order by b.name;
end $$;

select harden_definer_functions();
