# Spots Import & Schema Enrichment — Design Spec

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Enrichir la table `spots` avec de nouvelles colonnes, puis importer ~500-800 spots (France, Espagne, Portugal, Maroc) depuis l'API Surfline avec métadonnées complètes (type de vague, fond, difficulté, vent idéal, description).

**Architecture:** Un script Node.js one-shot qui : (1) ajoute les colonnes manquantes via ALTER TABLE, (2) crawle l'API Surfline Taxonomy pour lister les spots des 4 pays, (3) enrichit chaque spot avec les données mapview Surfline, (4) insère en batch dans Supabase via la service key.

**Tech Stack:** Node.js, Supabase JS SDK (service key), API Surfline (taxonomy + mapview)

---

## 1. Nouvelles colonnes `spots`

```sql
ALTER TABLE spots ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS wave_type text;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS bottom_type text;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS difficulty text[];
ALTER TABLE spots ADD COLUMN IF NOT EXISTS ideal_swell_direction text[];
ALTER TABLE spots ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS surfline_id text;
```

**Convention de valeurs :**
- `wave_type` : `beach_break`, `reef_break`, `point_break`, `river_break` (ou null si inconnu)
- `bottom_type` : `sand`, `reef`, `rock`, `coral` (ou null — jamais saisi manuellement)
- `difficulty` : tableau parmi `["beginner", "intermediate", "advanced", "expert"]`
- `ideal_swell_direction` : tableau de directions cardinales `["W", "NW", "SW"]`
- `country` : nom en anglais (`France`, `Spain`, `Portugal`, `Morocco`)

**Mise à jour des spots existants :** Les spots déjà en BDD qui matchent un spot Surfline (par proximité géographique : même nom + distance < 500m) sont mis à jour avec les nouvelles données. Pas de doublons.

---

## 2. API Surfline — endpoints utilisés

### 2.1 Taxonomy (liste des spots)

```
GET https://services.surfline.com/taxonomy?type=taxonomy&id={parentId}&maxDepth=1
```

**Stratégie de crawl :**
1. Partir de Earth ID : `58f7ed51dadb30820bb38782`
2. Trouver les IDs des 4 pays (France, Spain, Portugal, Morocco) au niveau continent > country
3. Pour chaque pays, descendre récursivement : country → region → subregion → spots
4. Collecter tous les items de type `spot` avec `_id`, `name`, `location.coordinates`

**Pas de clé API requise.** Endpoint public.

**Rate limiting :** Insérer un `await sleep(200)` entre chaque requête pour ne pas surcharger.

### 2.2 Mapview (métadonnées enrichies)

```
GET https://services.surfline.com/kbyg/mapview?south={lat-0.5}&west={lng-0.5}&north={lat+0.5}&east={lng+0.5}
```

Pour chaque spot trouvé via taxonomy, appeler mapview avec un bounding box autour de ses coordonnées. Réponse contient :
- `abilityLevels` → mappé vers `difficulty`
- `boardTypes` → ignoré (hors scope)
- `offshoreDirection` → mappé vers `ideal_wind_direction` (direction offshore = vent idéal)

**Optimisation :** Regrouper les spots proches géographiquement dans un seul appel mapview avec un bounding box plus large (par région). Évite des centaines d'appels individuels.

---

## 3. Mapping des données Surfline → Supabase

| Surfline field | Colonne Supabase | Transformation |
|----------------|-----------------|----------------|
| `name` | `name` | Tel quel |
| `location.coordinates[1]` | `lat` | Surfline = [lng, lat] (GeoJSON) |
| `location.coordinates[0]` | `lng` | Surfline = [lng, lat] (GeoJSON) |
| `enumeratedPath` | `country`, `region`, `city` | Parser le path hiérarchique |
| `_id` | `surfline_id` | Tel quel |
| `abilityLevels` | `difficulty` | `["BEGINNER","INTERMEDIATE"]` → `["beginner","intermediate"]` |
| `offshoreDirection` (degrés) | `ideal_wind_direction` | Convertir degrés → direction cardinale (0°=N, 90°=E, etc.) |
| Non dispo directement | `wave_type` | Inférer depuis le nom si possible ("reef", "point"), sinon null |
| Non dispo directement | `bottom_type` | null (pas de saisie manuelle) |
| Non dispo directement | `ideal_swell_direction` | Calculer : perpendiculaire à la côte basée sur les coords, ou null |
| Non dispo directement | `description` | null (rempli ultérieurement par IA ou manuellement) |

---

## 4. Script d'import

**Fichier :** `backend/scripts/import-spots.js`

**Exécution :** `node backend/scripts/import-spots.js`

**Flux :**
1. Connexion Supabase avec service key (depuis `.env` ou variables d'environnement)
2. Exécuter les ALTER TABLE pour ajouter les colonnes manquantes
3. Crawler Surfline taxonomy : Earth → Europe/Africa → France/Spain/Portugal/Morocco → régions → spots
4. Pour chaque région, appeler mapview pour enrichir les spots
5. Pour chaque spot :
   - Vérifier si un spot existe déjà dans Supabase avec le même `surfline_id` ou (même nom ET distance < 500m)
   - Si existe : UPDATE avec les nouvelles données (ne pas écraser `ideal_tide`, `ideal_swell`, `shom_port_code` si déjà renseignés)
   - Si nouveau : INSERT
6. Log de progression : `[42/650] Imported: La Gravière (Hossegor, France)`
7. Résumé final : X spots importés, Y mis à jour, Z ignorés (doublons)

**Gestion d'erreur :**
- Si un appel Surfline échoue → log warning, skip ce spot, continuer
- Si l'upsert Supabase échoue → log error, continuer
- Le script est idempotent : peut être relancé sans créer de doublons

---

## 5. Dédoublonnage avec les spots existants

Les spots actuels n'ont pas de `surfline_id`. Pour matcher :
1. Normaliser les noms (lowercase, trim, supprimer accents)
2. Calculer la distance Haversine entre les coords
3. Match si : noms similaires (Levenshtein < 3 OU inclusion) ET distance < 500m
4. En cas de match : mettre à jour le spot existant avec `surfline_id` + nouvelles données

---

## 6. Hors scope

- Saisie manuelle de `bottom_type` ou `description`
- Import mondial (on se limite à FR/ES/PT/MA)
- WannaSurf scraping (complexe, potentiellement fragile — à explorer dans une spec future)
- Mise à jour du scorer (spec 3 séparée)
- Mise à jour de l'UX Spots (spec 2 séparée)
