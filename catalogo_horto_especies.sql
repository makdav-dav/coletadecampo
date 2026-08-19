-- ================================================================
-- CATÁLOGO DE ESPÉCIES — HORTO CAMPO LARGO
-- Gerado da aba "4. Espécies Horto" da planilha de Gestão.
-- APAGA todas as espécies atuais do catálogo e recadastra estas.
--
-- COMO RODAR: Supabase -> SQL Editor -> New query -> cole tudo -> RUN.
--   Rode DEPOIS do horto_inventario.sql (usa as colunas botânicas).
-- ================================================================

-- 1) Colunas extras da planilha (idempotente)
alter table public.especies_catalogo
  add column if not exists ornamental   boolean,
  add column if not exists tipo         text,   -- Árvore | Arbusto
  add column if not exists floracao     text,
  add column if not exists tipo_copa    text,
  add column if not exists persistencia text,
  add column if not exists crescimento  text;

-- 2) Apaga o catálogo atual
delete from public.especies_catalogo;

-- 3) Recadastra as espécies da planilha (uso é text[] → literal '{...}')
insert into public.especies_catalogo
  (id_especie, nome_popular, nome_cientifico, classificacao, origem, fruto,
   ornamental, tipo, floracao, tipo_copa, persistencia, crescimento, uso, ativo)
values
  ('3138a5f7-a303-48fc-946a-8f92755d9e85', 'Acácia-Mimosa', 'Acacia dealbata Link', null, null, null, null, null, null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('feb7cc96-6d7b-40bb-a788-adde61a3c576', 'Agapanto', 'Agapanthus spp.', 'ornamental', 'exotica', null, true, 'Arbusto', 'Novembro - Fevereiro', null, 'Perene', 'Rápido', '{arborizacao,jardinagem,horto}', true),
  ('756eb4a5-4a81-4578-ae37-16c9ad2a2f25', 'Angico', 'Parapiptadenia rigida', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Outubro - Dezembro', 'Umbeliforme', 'Semicaducifólia', 'Rápido', '{arborizacao,jardinagem,horto}', true),
  ('e70e1245-6969-4923-991b-b3b0633430dd', 'Araça', 'Psidium cattleyanum', 'frutifera', 'nativa', 'comestivel,fauna', false, 'Árvore', 'Setembro - Janeiro', 'Irregular', 'Perenifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('67715838-d437-4d56-ac70-f8aa5eb9442e', 'Araça-do-Mato', 'Psidium cattleyanum Sabine', null, null, null, false, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('46a2dbe0-0005-4399-9593-bd98da5a9188', 'Ariticum', 'Annona sylvatica A.St.-Hil.', 'frutifera', 'nativa', 'comestivel,fauna', false, 'Árvore', 'Outubro - Dezembro', 'Globosa', 'Perenifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('acc1f5c8-bc30-4806-a604-cae954ee5764', 'Aroeira', 'Schinus terebinthifolia Raddi', 'frutifera', 'nativa', 'comestivel,fauna', false, 'Árvore', 'Outubro - Março', 'Globosa', 'Perenifólia', 'Rápido', '{arborizacao,jardinagem,horto}', true),
  ('0180e156-d630-4b13-a4f1-436d45a45364', 'Assobiadeira', 'Pyrostegia venusta (Ker Gawl.) Miers', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('75af682a-ca2f-43e7-9962-55e3be54a843', 'Branquilho', 'Gymnanthes klotzschiana Müll.Arg.', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Agosto - Fevereiro', 'Globosa', 'Caducifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('ee1e6ac0-7dc4-4800-8888-b9bac64b3d61', 'Butiá', 'Butia eriospatha (Mart. ex Drude) Becc.', 'frutifera', 'nativa', 'comestivel,fauna', true, 'Árvore', 'Setembro - Janeiro', 'Pendente', 'Perenifólia', 'Lento', '{arborizacao,jardinagem,horto}', true),
  ('d498cc85-5048-4e48-8220-1476dfaf914e', 'Buxinho', 'Buxus sempervirens L.', 'frutifera', 'exotica', 'fauna', true, 'Arbusto', 'Agosto - Outubro', null, 'Perenifólia', 'Lento', '{arborizacao,jardinagem,horto}', true),
  ('9f0ad7f9-7e93-4a6d-a6c0-180240c594dc', 'Cafezeiro-do-Mato', 'Casearia sylvestris Sw.', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Junho - Novembro', 'Globosa', 'Perenifólia', 'Rápido', '{arborizacao,jardinagem,horto}', true),
  ('363de852-bef0-4a12-95c8-16e98355c80d', 'Café-de-Sardim', 'Ardisia crenata Sims', 'frutifera', 'exotica', 'fauna', true, 'Arbusto', null, null, 'Perenifólia', 'Lento', '{arborizacao,jardinagem,horto}', true),
  ('995eccaf-e357-4fef-bf8d-5e465ddbb3ca', 'Caliandra / Esponjinha', 'Calliandra tweedii Benth.', 'frutifera', 'nativa', 'fauna', true, 'Arbusto', 'Setembro - Março', 'Globosa', 'Perenifólia', 'Rápido', '{arborizacao,jardinagem,horto}', true),
  ('ae305c94-3108-40ce-83c7-d8048d38586c', 'Canela-Sassafrás', 'Ocotea odorifera (Vell.) Rohwer', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Dezembro - Fevereiro', 'Globosa', 'Perenifólia', 'Lento', '{arborizacao,jardinagem,horto}', true),
  ('5599f202-a4df-4e4d-842c-975cb5b7c132', 'Canifístula', 'Peltophorum dubium (Spreng.) Taub.', null, null, null, null, null, null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('105cba1d-08a8-4509-9fce-99ad8c2a71a4', 'Canjarana', 'Cabralea canjerana (Vell.) Mart. subsp. canjerana', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Setembro - Janeiro', 'Elíptica Vertical', 'Caducifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('e2a2c55a-3021-43da-9bf4-88baaf5b4ac2', 'Capororoca', 'Myrsine umbellata Mart.', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Março - Maio', 'Umbeliforme', 'Perenifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('52257cd6-53ea-4d96-99d1-cf644468651c', 'Capororoquinha', 'Myrsine coriacea (Sw.) R.Br. ex Roem. & Schult.', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Março - Maio', 'Umbeliforme', 'Perenifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('05d54f68-d09e-485d-b4fa-c3ce512afe86', 'Cedro', 'Cedrela fissilis Vell.', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Setembro - Dezembro', 'Umbeliforme', 'Caducifólia', 'Rápido', '{arborizacao,jardinagem,horto}', true),
  ('708be2fc-80c3-42f0-8280-1585a584ef44', 'Cerca Viva', null, null, null, null, null, 'Arbusto', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('bb41c23e-9baf-42a5-af07-8666c85b2fc4', 'Cerejeira', 'Amburana cearensis (Allemão) A.C.Sm.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('15eb107c-6c5c-41e2-a4d3-05a2b1cb2930', 'Cerejeira-do-Japão', 'Prunus serrulata Lindl.', 'frutifera', 'exotica', 'fauna', true, 'Árvore', 'Junho - Agosto', 'Elíptica Horizontal', 'Caducifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('f6a837cb-9fd5-49ff-bd1d-1b5feafe67d8', 'Cerejeira-flor', 'Prunus campanulata Maxim.', null, null, null, null, null, null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('e0d009bc-f506-4ca1-aa8e-f7b566e9fe18', 'Chuva-de-Ouro', 'Cassia leptophylla Vogel', 'frutifera', 'nativa', 'fauna', true, 'Árvore', 'Novembro - Março', 'Elíptica Vertical', 'Semicaducifólia', 'Rápido', '{arborizacao,jardinagem,horto}', true),
  ('71ac0d5b-2edc-4cb1-8bfb-55b8796e3b68', 'Coerana', 'Cestrum corymbosum Schltdl.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('fea821a4-7500-4a1a-8f16-4c9ed801f2c3', 'Cuvatã', 'Cupania vernalis Cambess.', 'frutifera', 'nativa', 'fauna', true, 'Árvore', 'Fevereiro - Julho', 'Globosa', 'Perenifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('0854123f-620c-4b7c-ab74-9c5ecee30db5', 'Dedaleiro', 'Lafoensia pacari A.St.-Hil.', 'frutifera', 'nativa', 'fauna', true, 'Árvore', 'Outubro - Março', 'Globosa', 'Semicaducifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('611924c4-4133-4bdc-ad6f-117bb765c69b', 'Erva-Mate', 'Ilex paraguariensis A.St.-Hil.', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Setembro - Novembro', 'Globosa', 'Perenifólia', 'Lento', '{arborizacao,jardinagem,horto}', true),
  ('4fea13d8-dec9-4cc7-9bea-8c4aac01cf29', 'Espinheira-Santa', 'Monteverdia ilicifolia (Mart. ex Reissek) Biral', 'frutifera', 'nativa', 'fauna', false, 'Árvore', 'Agosto - Outubro', 'Irregular', 'Perenifólia', 'Lento', '{arborizacao,jardinagem,horto}', true),
  ('0b23ead8-21a6-40cb-a793-eebba1cc9138', 'Extremosa', 'Lagerstroemia indica L.', 'frutifera', 'exotica', 'fauna', true, 'Árvore', 'Novembro - Março', 'Globosa', 'Caducifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('9f35445c-4b50-4647-98aa-87407bb2d2f1', 'Falsa Juta', 'Corchorus capsularis L.', null, null, null, null, null, null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('87a02b12-f2ca-487a-837d-1b685e3360a1', 'Goiaba Serrana', 'Feijoa sellowiana (O.Berg) O.Berg', 'frutifera', 'nativa', 'comestivel,fauna', true, 'Árvore', 'Outubro - Dezembro', 'Elíptica horizontal', 'Perenifólia', 'Lento', '{arborizacao,jardinagem,horto}', true),
  ('e6ce7ef8-4283-4a5c-9791-1644040249ca', 'Grumixama', 'Eugenia brasiliensis Lam.', 'frutifera', 'nativa', 'comestivel,fauna', false, 'Árvore', 'Setembro - Novembro', 'Copa Pirâmidal', 'Perenifólia', 'Médio', '{arborizacao,jardinagem,horto}', true),
  ('146ab85d-5b64-40b6-9104-5ff61226fc60', 'Guabiroba', 'Campomanesia xanthocarpa O.Berg', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('741d7503-0bc9-4890-80f0-3afec3be832e', 'Guaçatunga', 'Casearia decandra Jacq.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('a75a0df9-4def-47bd-8941-8c9c7252f14f', 'Hortência', 'Hydrangea macrophylla (Thunb.) Ser.', null, null, null, null, 'Arbusto', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('71ba1e39-6ca2-418f-8493-118f92a005ec', 'Imbuia', 'Ocotea porosa (Nees & Mart.) Barroso', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('e5e7649b-9636-4ec6-965c-37fb3811e0eb', 'Ipê Amarelo', 'Handroanthus chrysotrichus (Mart. ex DC.) Mattos', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('89b7e0e9-73b0-4813-a1a3-771ccd2989ef', 'Ipê Amarelo Miúdo', 'Handroanthus albus (Cham.) Mattos', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('6dd21c60-09a0-4d0d-b2a7-661f5a7eb44c', 'Ipê Rosa', 'Handroanthus impetiginosus (Mart. ex DC.) Mattos', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('c4728720-8d57-4182-b91c-39436ed15787', 'Ipê Roxo', 'Handroanthus heptaphyllus (Vell.) Mattos', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('c5502b83-cdaf-4d58-a20b-b9bdfb6c08cb', 'Jacarandá', 'Jacaranda mimosifolia D.Don', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('5dc67095-c43a-455d-a91b-1a664f2bb9bf', 'Jerivá', 'Syagrus romanzoffiana (Cham.) Glassman', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('8b055d6e-dadc-4264-8afd-50248fb8afa0', 'Liquidambar', 'Liquidambar styraciflua L.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('d83e1ff5-4f1d-43d8-a77c-7ec41377be0a', 'Magnólia', 'Magnolia grandiflora L.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('c84f93fc-6882-4cdb-b7dd-d6813a7f4e02', 'Manacá-da-serra', 'Tibouchina mutabilis (Vell.) Cogn.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('4be1ab4b-14a1-4445-8c0b-5d7dc77b9296', 'Monjoleiro', 'Acacia polyphylla DC.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('97889d95-b1b1-42f4-affd-adc6ad540dc3', 'Pata-de-Vaca (folha maior)', 'Bauhinia variegata L.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('e3bc3a93-4cb2-4fd0-a51a-152b5377b8f8', 'Pata-de-vaca', 'Bauhinia forficata Link', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('8e61407a-518e-47d8-afc6-bc92ccae81c8', 'Pau-Brasil', 'Paubrasilia echinata (Lam.) Gagnon, H.C.Lima & G.P.Lewis', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('d5d29818-e527-4566-a3c2-2cc261d49da8', 'Pau-Ferro', 'Libidibia ferrea (Mart. ex Tul.) L.P.Queiroz', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('a106ee54-617c-4e04-8888-e456141377ce', 'Pinheiro-do-Paraná', 'Araucaria angustifolia (Bertol.) Kuntze', 'frutifera', 'nativa', 'comestivel,fauna', null, 'Árvore', 'Inexistente', 'Caliciforme', 'Perenifólia', 'Lento', '{arborizacao,jardinagem,horto}', true),
  ('3f2f0dca-5b5e-49e2-bfba-fe772f04aea5', 'Pinho-Bravo', 'Podocarpus lambertii Klotzsch ex Endl.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('55fcd9cf-7b20-4eef-9f3a-0453c1b1bcce', 'Pitanga', 'Eugenia uniflora L.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('d5492abf-f39e-4b27-a47a-c8513a54914d', 'Quaresmeira', 'Tibouchina granulosa (Desr.) Cogn.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('5c817acc-8090-44c6-90c9-7308dbd81f6e', 'Randia-Armata', 'Randia armata (Sw.) DC.', null, null, null, null, null, null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('bf3160f2-f2b1-4013-a88e-c64dc0f71bdd', 'Sapuva', 'Machaerium stipitatum (DC.) Vogel', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('ca630b83-1ba7-4823-90b9-732948ef37a2', 'Senna-Araucária', 'Senna multijuga var. lindleyana (Gardner) H.S.Irwin & Barneby', null, null, null, null, null, null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('3672d9b8-cced-4ddd-9176-cba337f35d96', 'Sibipuruna', 'Cenostigma pluviosum (DC.) Gagnon & G.P.Lewis', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('688bce2d-87c7-40cc-81a1-87b6136e2d5c', 'Simploco', 'Symplocos tenuifolia Brand', null, null, null, null, null, null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('d6a011c5-c092-4592-b5e3-b990099205bb', 'Tipuana', 'Tipuana tipu (Benth.) Kuntze', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('2747f3bc-07a5-49a4-8081-72a2a62822b7', 'Uvaia', 'Eugenia pyriformis Cambess.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true),
  ('91441287-0a7a-422e-bccb-b7d71e3db26e', 'Vacum', 'Allophylus edulis (A.St.-Hil. et al.) Hieron. ex Niederl.', null, null, null, null, 'Árvore', null, null, null, null, '{arborizacao,jardinagem,horto}', true);
