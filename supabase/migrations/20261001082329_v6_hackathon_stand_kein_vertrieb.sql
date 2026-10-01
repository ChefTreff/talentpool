-- 0225 · Hackathon Stand I-10729 aus dem Vertriebskatalog, bleibt aktiv (ADM-047)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001082329.
--
-- Zweck: `I-10729 Hackathon Stand` ist kein eigenes Produkt. Der Stand gehört
-- automatisch zur Hackathon Challenge (`I-37220`) und braucht auch kein
-- Bündel — „das ist einfach klar" (Konrad 22.09.). Konrad 25.09.: Empfehlung
-- folgen, also aus dem Vertriebskatalog nehmen, **nicht löschen**.
--
-- Wirkung: `source_hubspot = false` nimmt den Artikel aus `products_for_sync
-- ('hubspot')`; der Abgleich schiebt ihn nicht mehr nach HubSpot. `active`
-- bleibt `true` und die Zeile bleibt stehen: Alt-Deals und Testfixtures
-- verweisen auf die SKU, und SevDesk kennt ihn weiter.
--
-- Nicht Teil dieser Migration, offen bei Konrad: Der Abgleich **archiviert**
-- nichts in HubSpot. Das Produkt steht dort in der Bibliothek, bis es jemand
-- dort archiviert — ein Schreibzugriff ins Fremdsystem, der abgesprochen wird.
--
-- Geprüft vor dem Schreiben: Keine Funktion hängt an `I-10729`. Die Kategorie
-- „hackathon" in der Event-App kommt aus `product.category`, und die trägt
-- auch die Challenge.
set search_path = public, extensions;

update product
   set source_hubspot = false,
       internal_comment = concat_ws(E'\n', nullif(internal_comment, ''),
         'ADM-047 (01.10.2026): kein eigenes Produkt, gehört zur Hackathon Challenge I-37220. Aus dem Vertriebskatalog genommen, nicht gelöscht.')
 where sku = 'I-10729' and source_hubspot;

select harden_definer_functions();
