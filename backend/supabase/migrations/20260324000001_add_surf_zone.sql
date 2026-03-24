-- Ajouter la colonne surf_zone pour les sous-régions surf
ALTER TABLE spots ADD COLUMN IF NOT EXISTS surf_zone text;

-- Mapping France : régions Surfline → sous-régions surf
UPDATE spots SET surf_zone = 'Pays Basque' WHERE country = 'France' AND region IN ('Pyrénées-Atlantiques');
UPDATE spots SET surf_zone = 'Landes' WHERE country = 'France' AND region IN ('Landes');
UPDATE spots SET surf_zone = 'Gironde' WHERE country = 'France' AND region IN ('Gironde');
UPDATE spots SET surf_zone = 'Charentes' WHERE country = 'France' AND region IN ('Charente-Maritime');
UPDATE spots SET surf_zone = 'Vendée' WHERE country = 'France' AND region IN ('Vendée', 'Loire-Atlantique', 'Pays de la Loire');
UPDATE spots SET surf_zone = 'Bretagne Sud' WHERE country = 'France' AND region IN ('Morbihan', 'Finistère');
UPDATE spots SET surf_zone = 'Bretagne Nord' WHERE country = 'France' AND region IN ('Côtes-d''Armor', 'Ille-et-Vilaine');
UPDATE spots SET surf_zone = 'Normandie / Manche' WHERE country = 'France' AND region IN ('Manche', 'Calvados', 'Seine-Maritime', 'Somme', 'Merville-Franceville-Plage');
UPDATE spots SET surf_zone = 'Nord' WHERE country = 'France' AND region IN ('Pas-de-Calais', 'North France');
UPDATE spots SET surf_zone = 'Méditerranée Ouest' WHERE country = 'France' AND region IN ('Pyrénées-Orientales', 'Aude', 'Hérault');
UPDATE spots SET surf_zone = 'Méditerranée Est' WHERE country = 'France' AND region IN ('Bouches-du-Rhône', 'Var', 'Alpes-Maritimes');
UPDATE spots SET surf_zone = 'Corse' WHERE country = 'France' AND region IN ('South Corsica', 'Upper Corsica', 'Capigliolo', 'Ogliastro', 'Bussaghia', 'Scudo', 'Kervigorn', 'Prad Foene');
UPDATE spots SET surf_zone = 'Nouvelle-Aquitaine' WHERE country = 'France' AND region = 'Nouvelle-Aquitaine' AND surf_zone IS NULL;
UPDATE spots SET surf_zone = 'Réunion' WHERE country = 'France' AND region = 'Reunion Island';

-- Mapping Espagne : grandes zones surf
UPDATE spots SET surf_zone = 'Pays Basque ES' WHERE country = 'Spain' AND region IN ('Basque Country', 'Gipuzkoa', 'Biscay');
UPDATE spots SET surf_zone = 'Cantabrie' WHERE country = 'Spain' AND region IN ('Cantabria');
UPDATE spots SET surf_zone = 'Asturies' WHERE country = 'Spain' AND region IN ('Asturias');
UPDATE spots SET surf_zone = 'Galice' WHERE country = 'Spain' AND region IN ('Galicia', 'A Coruña', 'Lugo', 'Pontevedra');
UPDATE spots SET surf_zone = 'Andalousie' WHERE country = 'Spain' AND region IN ('Andalusia', 'Cadiz', 'Malaga', 'Granada', 'Almeria', 'Southwest Spain');
UPDATE spots SET surf_zone = 'Catalogne' WHERE country = 'Spain' AND region IN ('Catalonia', 'Barcelona', 'Girona', 'Tarragona');
UPDATE spots SET surf_zone = 'Valence / Murcie' WHERE country = 'Spain' AND region IN ('Valencia', 'Murcia', 'Alicante', 'Castellon');
UPDATE spots SET surf_zone = 'Canaries' WHERE country = 'Spain' AND region IN ('Canary Islands', 'Tenerife Canaries', 'Lanzarote Canaries', 'Fuerteventura Canaries', 'Gran Canaria', 'Las Palmas', 'Santa Cruz de Tenerife');
UPDATE spots SET surf_zone = 'Baléares' WHERE country = 'Spain' AND region IN ('Balearic Islands', 'Spain (Balearic)');

-- Mapping Portugal : grandes zones surf
UPDATE spots SET surf_zone = 'Nord PT' WHERE country = 'Portugal' AND region IN ('Zona Norte Portugal', 'Porto', 'Braga', 'Viana do Castelo');
UPDATE spots SET surf_zone = 'Centre PT' WHERE country = 'Portugal' AND region IN ('Zona Centro Portugal', 'Coimbra', 'Aveiro', 'Leiria');
UPDATE spots SET surf_zone = 'Lisbonne / Ouest' WHERE country = 'Portugal' AND region IN ('Zona Oeste Portugal', 'Lisboa Portugal', 'Lisbon');
UPDATE spots SET surf_zone = 'Algarve' WHERE country = 'Portugal' AND region IN ('Algarve Portugal', 'Faro');
UPDATE spots SET surf_zone = 'Alentejo PT' WHERE country = 'Portugal' AND region IN ('Alentejo Portugal', 'Beja', 'Setúbal');
UPDATE spots SET surf_zone = 'Açores' WHERE country = 'Portugal' AND region IN ('Azores');
UPDATE spots SET surf_zone = 'Madère' WHERE country = 'Portugal' AND region IN ('Madeira');

-- Mapping Maroc : grandes zones surf
UPDATE spots SET surf_zone = 'Nord Maroc' WHERE country = 'Morocco' AND region IN ('Tanger-Tetouan-Al Hoceima', 'Oriental', 'North Morocco');
UPDATE spots SET surf_zone = 'Casablanca / Rabat' WHERE country = 'Morocco' AND region IN ('Casablanca-Settat', 'Rabat-Salé-Kénitra');
UPDATE spots SET surf_zone = 'Essaouira / Safi' WHERE country = 'Morocco' AND region IN ('Marrakesh-Safi', 'Essaouira Province');
UPDATE spots SET surf_zone = 'Agadir / Souss' WHERE country = 'Morocco' AND region IN ('Souss-Massa', 'Agadir-Ida-ou-Tnan');
UPDATE spots SET surf_zone = 'Sud Maroc' WHERE country = 'Morocco' AND region IN ('Guelmim-Oued Noun', 'Laâyoune-Sakia El Hamra');
