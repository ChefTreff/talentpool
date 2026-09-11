-- 0059 · Vokabular organization_type: „Stiftung“ als eigener Typ (Konrad, 11.09.: Stiftung und Initiative sind nicht dasselbe).
-- HubSpot „CT Company Type“ = Stiftung wird im Ingest darauf abgebildet (lib/hubspot/mapping.ts); die Oberflächen lesen das Vokabular.
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
values ('organization_type', 'foundation', 'Stiftung', 'Foundation', 8, true)
on conflict (vocabulary, key) do nothing;

select harden_definer_functions();
