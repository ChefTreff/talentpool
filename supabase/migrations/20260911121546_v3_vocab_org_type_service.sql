-- 0060 · Vokabular organization_type: „Service / Kooperation“ als eigener Typ (Konrad, 11.09.) — bisher auf agency abgebildet.
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
values ('organization_type', 'service', 'Service / Kooperation', 'Service / cooperation', 9, true)
on conflict (vocabulary, key) do nothing;

select harden_definer_functions();
