-- 0258 · Matterport-3D-Rundgang als Link-Eintrag partner_3d_tour für Partner (PART-093)
-- Angewendet von der Architektur-Session am 02.10.2026 als 20261002091443.
-- Matterport-3D-Rundgang des Summits als Link-Eintrag (PART-093)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PART-093 (Konrad 01.10.): der Rundgang durch den Summit soll ins Partner-Portal — eingebettet
-- auf dem Messestand, dazu ein Kasten auf der Startseite. Die Adresse steht nicht im Code, sondern als
-- Eintrag `partner_3d_tour` in `portal_link` (Admin → Medien → Links), damit Konrad den Rundgang je
-- Edition tauschen kann. Wie bei den Store-Links (PART-072) legt diese Migration den Startwert an; ohne
-- sie müsste jemand den Eintrag vor dem ersten Besuch von Hand anlegen.
--
-- * Ohne Edition, also für jede; ein Eintrag mit Edition geht ihm vor (`portal_links_for`).
-- * Zielgruppe nur `partner`.
-- * `on conflict do nothing`: ein vorhandener Eintrag — auch ein von Hand geänderter — bleibt unberührt.
--
-- Die Modell-Kennung ist kein Geheimnis. Der Rundgang ist bei Matterport allerdings passwortgeschützt
-- (K-53): ob Konrad das aufhebt oder das Passwort an die Partner gibt, entscheidet die Einbettung nicht —
-- sie zeigt Matterports Abfrage im Rahmen. Das Portal speichert kein Passwort.
-- Keine Funktion ändert sich. Test: `supabase/tests/v6_partner_3d_tour.sql`.
-- Endet mit `select harden_definer_functions();`.

set search_path = public, extensions;

insert into portal_link (key, title_de, title_en, url, audience, sort_order) values
  ('partner_3d_tour', 'Summit-Rundgang in 3D', 'Summit tour in 3D',
   'https://my.matterport.com/show/?m=Aj4uVT45GpQ', array['partner'], 30)
on conflict do nothing;

select harden_definer_functions();
