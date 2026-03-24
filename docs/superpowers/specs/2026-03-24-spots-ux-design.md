# Spots UX Redesign — Design Spec

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Refondre l'onglet Spots avec une navigation performante (recherche, tri, pagination), un bandeau favoris scrollable, et une fiche spot enrichie avec les nouvelles métadonnées importées.

**Architecture:** Tout dans `index.html` (single-file app). Les spots sont chargés par page de 30 directement depuis Supabase (requêtes ciblées). Les favoris sont chargés via un JOIN Supabase. La fiche spot récupère le spot complet via une requête single(). **La fonction `getSpots()` et `buildSpotHierarchy()` ne sont plus utilisées dans l'onglet Spots** — remplacées par des requêtes Supabase directes pour éviter de charger ~1000 spots en mémoire.

**Tech Stack:** Vanilla JS, Supabase JS SDK v2 (CDN), CSS existant

**Contrainte critique :** La BDD contient ~1000 spots. Ne JAMAIS charger tous les spots d'un coup. Pagination obligatoire (30 spots par page), chargement incrémental via "Voir plus".

---

## 1. Structure de l'onglet Spots

L'onglet Spots se compose de 3 zones, de haut en bas :

### Zone 1 : Bandeau favoris (scrollable horizontal)
- Toujours visible en haut
- Requête directe : `supabaseClient.from('user_favorite_spots').select('spot_id, spots(id, name, city, lat, lng)').eq('user_id', userId)` — PAS via `getSpots()`
- Chaque favori = carte compacte : score IA du jour (badge coloré) + nom + ville
- Scroll horizontal si > 3 favoris
- Clic → ouvre la fiche spot
- Si non connecté : "Connectez-vous pour voir vos favoris"
- Si connecté mais aucun favori : "Ajoute des spots en favoris"
- **Bordure de la carte colorée selon le score** (vert ≥8, bleu 6-7, orange <6)

### Zone 2 : Recherche + Tri + Filtres
- **Barre de recherche** : `input` texte avec debounce 300ms
  - Recherche côté client sur les spots déjà chargés
  - Si ≥ 3 caractères ET pas de résultat local → requête Supabase avec `.ilike('name', ...)` et `.ilike('city', ...)` séparés (pas de string interpolation dans `.or()`)
  - **Sanitization :** échapper les caractères spéciaux PostgREST (`.`, `,`, `(`, `)`) avant la requête
- **Chips de tri** (une seule active à la fois) :
  - `A→Z` (défaut) — tri alphabétique par nom (côté serveur via `.order('name')`)
  - `📍 Distance` — tri par distance depuis la position de l'utilisateur (côté client, Haversine)
- **Bouton Filtrer** → déroule les dropdowns pays/région/ville
  - Pays remplis via `supabaseClient.from('spots').select('country').neq('country', null)` + dédoublonnage côté client — PAS via `getSpots()`
  - Région/ville filtrés en cascade (requêtes directes)
  - Quand un filtre est actif, un chip "✕ France" apparaît pour le retirer

**Note sur le tri par score IA :** Supprimé comme option de tri de la liste principale. Les scores ne sont disponibles que pour les favoris (via `prefetchSpotScores`), pas pour les ~1000 spots. Les favoris avec scores sont déjà visibles dans le bandeau en haut. Le tri par score s'appliquera dans le bandeau favoris uniquement.

### Zone 3 : Liste paginée
- Affiche 30 spots à la fois
- Chaque ligne : nom du spot + ville/pays + type de vague (si dispo)
- Bouton "Voir plus" en bas charge les 30 suivants (append, pas replace)
- **Détection fin de liste :** si `data.length < PAGE_SIZE` → masquer le bouton "Voir plus"
- **État loading :** bouton "Voir plus" disabled + texte "Chargement..." pendant le fetch
- Quand un filtre/recherche/tri change → reset la liste, recharger page 1

---

## 2. Chargement des données

### Au chargement de l'onglet Spots :
1. `loadFavoriteSpots()` — requête JOIN directe Supabase (pas via `getSpots()`)
2. `prefetchSpotScores(userId)` — scores IA pour les favoris uniquement (existant)
3. `loadSpotsList(page=0)` — charge les 30 premiers spots

### Requête Supabase pour la liste paginée :
```javascript
const PAGE_SIZE = 30;

async function loadSpotsList(page = 0, filters = {}) {
    let query = supabaseClient
        .from('spots')
        .select('id, name, city, region, country, lat, lng, wave_type, difficulty')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filters.country) query = query.eq('country', filters.country);
    if (filters.region) query = query.eq('region', filters.region);
    if (filters.city) query = query.eq('city', filters.city);
    if (filters.search) {
        const s = filters.search.replace(/[.,()]/g, '');
        query = query.or(`name.ilike.%${s}%,city.ilike.%${s}%`);
    }

    query = query.order('name');

    const { data, error } = await query;
    return data || [];
}
```

### Tri par distance :
- Nécessite `navigator.geolocation.getCurrentPosition()` (déjà demandé)
- Calcul Haversine côté client sur les spots chargés
- Re-trie les spots déjà en mémoire (pas de nouvelle requête)

### Requête favoris (remplace l'ancien `loadFavoriteSpots`) :
```javascript
async function loadFavoriteSpots() {
    const userId = dataManager.currentUserId;
    if (!userId || !supabaseClient) return [];
    const { data, error } = await supabaseClient
        .from('user_favorite_spots')
        .select('spot_id, spots(id, name, city, lat, lng)')
        .eq('user_id', userId);
    return (data || []).map(r => r.spots);
}
```

### Requête filtres (pays distincts) :
```javascript
async function loadDistinctCountries() {
    const { data } = await supabaseClient
        .from('spots')
        .select('country')
        .not('country', 'is', null)
        .order('country');
    return [...new Set((data || []).map(s => s.country))];
}
```

---

## 3. Bandeau favoris — détails techniques

```html
<div class="fav-strip">
    <div class="fav-strip-label">⭐ Mes spots</div>
    <div class="fav-strip-scroll">
        <!-- Pour chaque favori -->
        <div class="fav-card" onclick="showSpotDetail('{id}')"
             style="border-color: {scoreColor}">
            <div class="fav-score" style="background:{scoreColor}">{score}</div>
            <div class="fav-name">{name}</div>
            <div class="fav-city">{city}</div>
        </div>
    </div>
</div>
```

**CSS :**
```css
.fav-strip { padding: 0 4px; margin-bottom: 12px; }
.fav-strip-label { color: rgba(255,255,255,0.4); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.fav-strip-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
.fav-card { min-width: 100px; border-radius: 10px; padding: 8px; text-align: center; cursor: pointer; flex-shrink: 0; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
.fav-score { border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.7rem; margin-bottom: 4px; }
.fav-name { color: #f0f4ff; font-size: 0.75rem; font-weight: 600; }
.fav-city { color: rgba(255,255,255,0.35); font-size: 0.6rem; }
```

---

## 4. Fiche spot enrichie

Quand l'utilisateur clique sur un spot, **le spot complet est chargé directement depuis Supabase** :

```javascript
async function showSpotDetail(spotId) {
    const { data: spot } = await supabaseClient
        .from('spots')
        .select('*')
        .eq('id', spotId)
        .single();
    if (!spot) return;
    // ... render avec toutes les colonnes
}
```

Cela garantit l'accès à TOUTES les colonnes (`wave_type`, `bottom_type`, `difficulty`, `ideal_wind`, `ideal_swell`, `ideal_tide`, `lat`, `lng`) sans dépendre de `buildSpotHierarchy()` qui stripait la plupart des champs.

### Structure (de haut en bas) :

**Header :**
- Bouton retour "← Spots"
- Nom du spot + ville, région, pays
- Badge score IA du jour (gros) — depuis `_spotScoresCache` si disponible
- Bouton ⭐ Favori

**Caractéristiques du spot** (grille 2x2, chaque carte masquée si donnée null) :
- **Type de vague** : `wave_type` ou `bottom_type`. Ex: "🏖️ Beach break". Format d'affichage : `beach_break` → "Beach break"
- **Niveau** : `difficulty` (type `text[]`). Ex: `["intermediate","advanced"]` → "Intermédiaire · Avancé". Mapping : beginner→Débutant, intermediate→Intermédiaire, advanced→Avancé, expert→Expert
- **Marée idéale** : `ideal_tide` (type `text[]`). Ex: `["mid","high"]` → "Mi-marée · Haute". Mapping : low→Basse, mid→Mi-marée, high→Haute
- **Vent idéal** : `ideal_wind` (type `text[]`). Ex: `["SE"]` → "SE (offshore)". Affiché en encart bleu dédié si renseigné.

**Note :** Pas de carte "Swell idéal" — aucune colonne ne stocke la taille de swell idéale (min/max). La colonne `ideal_swell` contient des directions, pas des tailles. On n'affiche pas `ideal_swell` pour ne pas confondre avec la houle actuelle.

**Bouton Google Maps :**
```html
<a href="https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
   target="_blank" rel="noopener"
   class="gmaps-btn">
   📍 S'y rendre (Google Maps)
</a>
```

**Prévisions 5 jours** (existant, inchangé) — appel backend `/api/v1/predictions/spot/{spotId}`

**Mes sessions ici** (existant, inchangé) — filtre `userData.sessions` par `spot_id`

### Gestion des données manquantes :
- Chaque carte de la grille ne s'affiche QUE si la donnée existe et n'est pas un array vide
- Si aucune métadonnée → la section caractéristiques est masquée
- La fiche reste utile (prévisions + sessions + Google Maps)

---

## 5. Refactoring `getSpots()` et `buildSpotHierarchy()`

### Problème :
`getSpots()` dans `SurfAIDataManager` fait un `SELECT *` sur toute la table spots (~1000 lignes) et cache le résultat. `buildSpotHierarchy()` organise en country>region>city mais strippe la plupart des colonnes. Plusieurs fonctions appellent `getSpots()`.

### Plan de migration :

| Appelant | Avant | Après |
|----------|-------|-------|
| `loadSpotsTab()` → `renderAllSpots()` | `getSpots()` → affiche tout | `loadSpotsList(page)` paginé |
| `loadFavoriteSpots()` | `getSpots()` → cherche dans hiérarchie | Requête JOIN directe (§2) |
| `populateSpotsFilters()` | `getSpots()` → extrait pays/régions | `loadDistinctCountries()` (§2) |
| `showSpotDetail()` | Cherche dans hiérarchie | `.select('*').eq('id', spotId).single()` |
| `populateSessionSpots()` | `getSpots()` → liste pour le select session | Inchangé — cette fonction concerne le formulaire d'ajout de session, pas l'onglet Spots. À migrer dans une spec future si perf problématique. |

**`getSpots()` et `buildSpotHierarchy()` ne sont PAS supprimés** — ils sont encore utilisés par `populateSessionSpots()`. Mais l'onglet Spots ne les appelle plus.

---

## 6. Modifications par rapport à l'existant

### Supprimé :
- Les deux sections séparées "⭐ Mes favoris" et "🌍 Tous les spots"
- La limite de 40 spots hardcodée
- L'appel à `getSpots()` depuis l'onglet Spots

### Modifié :
- `loadSpotsTab()` → appelle favoris (JOIN), scores, liste paginée
- `loadFavoriteSpots()` → requête JOIN directe Supabase
- `showSpotDetail()` → fetch single spot complet + métadonnées enrichies + Google Maps
- `populateSpotsFilters()` → requête distinct countries/regions

### Ajouté :
- `renderFavStrip(favSpots)` — bandeau horizontal scrollable
- `renderSpotsList(spots, append)` — rendu paginé avec "Voir plus"
- `loadSpotsList(page, filters)` — requête Supabase paginée
- `loadDistinctCountries()` / `loadDistinctRegions(country)` — pour les filtres
- Debounce sur la recherche (300ms)
- CSS : `.fav-strip`, `.fav-card`, `.search-bar`, `.sort-chips`, `.filter-panel`, `.gmaps-btn`, `.spot-chars`

---

## 7. Hors scope

- Carte / vue map (spec future)
- Tri par score IA dans la liste (pas de scores pour tous les spots)
- Infinite scroll (on garde "Voir plus" — plus simple)
- Photos des spots
- Ajout/édition de spots par l'utilisateur
- Suppression de `getSpots()` / `buildSpotHierarchy()` (encore utilisés ailleurs)
