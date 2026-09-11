-- 0050 · Welle 3 A1-Nachtrag: Bucket product-images (öffentlich lesbar — Produktbilder sind Marketingmaterial ohne Personenbezug), Schreiben nur mit
-- service_role über scripts/import-product-images.mjs bzw. später den Admin (B9). Pfad <sku>/<datei>; product.images hält [{path, url, name, type, size}].
set search_path = public, extensions;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do nothing;

-- Lesen über die öffentliche URL braucht keine Policy; Auflisten/Schreiben bleibt service_role (keine Policies für anon/authenticated).
comment on column product.images is 'Bilder aus dem Bucket product-images: [{path, url, name, type, size}] — öffentlich lesbar, Pflege über Import-Skript/Admin.';

select harden_definer_functions();
