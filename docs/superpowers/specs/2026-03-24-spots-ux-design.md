# Spots UX Redesign — Design Spec

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Refondre l'onglet Spots avec une navigation performante (recherche, tri, pagination), un bandeau favoris scrollable, et une fiche spot enrichie avec les nouvelles métadonnées importées.

**Architecture:** Tout dans `index.html` (single-file app). Les spots sont chargés par page de 30 depuis Supabase. Les favoris sont chargés séparément (max ~20, toujours complets). La fiche spot enrichie utilise les nouvelles colonnes (`country`, `difficulty`, `wave_type`, `bottom_type`, `ideal_swell_direction`, `surfline_id`).

**Tech Stack:** Vanilla JS, Supabase JS SDK v2 (CDN), CSS existant

**Contrainte critique :** La BDD contient ~1000 spots. Ne JAMAIS charger tous les spots d'un coup. Pagination obligatoire (30 spots par page), chargement incrémental via "Voir plus".

---

## 1. Structure de l'onglet Spots

L'onglet Spots se compose de 3 zones, de haut en bas :

### Zone 1 : Bandeau favoris (scrollable horizontal)
- Toujours visible en haut
- Affiche les spots favoris de l'utilisateur (query `user_favorite_spots` JOIN `spots`)
- Chaque favori = carte compacte : score IA du jour (badge coloré) + nom + ville
- Scroll horizontal si > 3 favoris
- Clic → ouvre la fiche spot
- Si aucun favori : message discret "Ajoute des spots en favoris"
- **Bordure de la carte colorée selon le score** (vert ≥8, bleu 6-7, orange <6)

### Zone 2 : Recherche + Tri + Filtres
- **Barre de recherche** : `input` texte, filtre en temps réel sur `name`, `city`, `region`, `country`
  - Recherche côté client sur les spots déjà chargés
  - Si le texte fait ≥ 3 caractères ET pas de résultat dans les spots chargés → requête Supabase `ilike`
- **Chips de tri** (une seule active à la fois) :
  - `Score IA ↓` (défaut) — tri par score décroissant (nécessite les scores prefetchés)
  - `A→Z` — tri alphabétique par nom
  - `📍 Distance` — tri par distance depuis la position de l'utilisateur (nécessite géoloc)
- **Bouton Filtrer** → déroule les dropdowns pays/région/ville (existants, refactorisés)
  - Quand un filtre est actif, un chip "✕ France" apparaît pour le retirer

### Zone 3 : Liste paginée
- Affiche 30 spots à la fois
- Chaque ligne : nom du spot + ville/pays + type de vague (si dispo) + badge score IA
- Bouton "Voir plus" en bas charge les 30 suivants (append, pas replace)
- Quand un filtre/recherche/tri change → reset la liste, recharger page 1

---

## 2. Chargement des données

### Au chargement de l'onglet Spots :
1. `loadFavoriteSpots()` — charge tous les favoris (inchangé, max ~20)
2. `prefetchSpotScores(userId)` — charge les scores IA pour les 2 prochains jours (existant)
3. `loadSpotsList(page=0)` — charge les 30 premiers spots triés par score IA

### Requête Supabase pour la liste paginée :
```javascript
const PAGE_SIZE = 30;

async function loadSpotsList(page = 0, filters = {}) {
    let query = supabaseClient
        .from('spots')
        .select('id, name, city, region, country, lat, lng, wave_type, difficulty, surfline_id')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filters.country) query = query.eq('country', filters.country);
    if (filters.region) query = query.ilike('region', `%${filters.region}%`);
    if (filters.search) query = query.or(`name.ilike.%${filters.search}%,city.ilike.%${filters.search}%`);

    query = query.order('name');

    const { data, error } = await query;
    return data || [];
}
```

### Tri par score IA :
Le tri par score ne peut pas être fait côté Supabase (les scores sont calculés par le backend, pas stockés). Le tri s'applique côté client sur les spots chargés. Pour "Score IA ↓" :
- Les spots avec un score connu (via `_spotScoresCache`) sont triés en premier, score décroissant
- Les spots sans score apparaissent après, triés par nom

### Tri par distance :
- Nécessite `navigator.geolocation.getCurrentPosition()` (déjà demandé à l'utilisateur)
- Calcul Haversine côté client
- Appliqué sur les spots chargés

---

## 3. Bandeau favoris — détails techniques

```html
<div class="fav-strip">
    <div class="fav-strip-label">⭐ Mes spots</div>
    <div class="fav-strip-scroll">
        <!-- Pour chaque favori -->
        <div class="fav-card" onclick="showSpotDetail(id, name, lat, lng)"
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

Quand l'utilisateur clique sur un spot (depuis la liste ou les favoris), la vue détail s'affiche.

### Structure (de haut en bas) :

**Header :**
- Bouton retour "← Spots"
- Nom du spot + ville, région, pays
- Badge score IA du jour (gros)
- Bouton ⭐ Favori

**Caractéristiques du spot** (grille 2x2) :
- **Type de fond** : icône + valeur (`bottom_type` ou `wave_type`). Ex: "🏖️ Beach break". Si les deux sont null → ne pas afficher la carte
- **Niveau** : icône + valeur (`difficulty`). Ex: "🔥 Avancé+". Si null → ne pas afficher
- **Marée idéale** : icône + valeur (`ideal_tide`). Ex: "🌙 Mi-marée". Si null → ne pas afficher
- **Swell idéal** : icône + valeur (`ideal_swell`). Ex: "🌊 1–2m". Si null → ne pas afficher

**Vent idéal** (encart bleu dédié) :
- Affiché seulement si `ideal_wind` est renseigné
- Direction + "offshore" + vitesse recommandée

**Bouton Google Maps :**
```html
<a href="https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
   target="_blank" rel="noopener"
   class="gmaps-btn">
   📍 S'y rendre (Google Maps)
</a>
```
- Ouvre Google Maps avec l'itinéraire vers les coordonnées du spot
- Affiché juste après les caractéristiques, avant les prévisions

**Conditions actuelles** (existant, inchangé) :
- Houle, vent, marée en live

**Prévisions 5 jours** (existant, inchangé) :
- Score + créneau + narrative IA

**Mes sessions ici** (existant, inchangé) :
- Historique des sessions sur ce spot

### Gestion des données manquantes :
- Chaque carte de la grille 2x2 ne s'affiche QUE si la donnée existe
- Si aucune donnée de caractéristiques → la section entière est masquée
- La fiche reste utile même sans métadonnées (score IA + prévisions + sessions)

---

## 5. Modifications par rapport à l'existant

### Supprimé :
- Les deux sections séparées "⭐ Mes favoris" et "🌍 Tous les spots" (remplacées par bandeau + liste unifiée)
- La limite de 40 spots hardcodée
- L'affichage de tous les spots d'un coup

### Modifié :
- `loadSpotsTab()` → refactorisé pour appeler les 3 chargements (favoris, scores, liste paginée)
- `renderAllSpots()` → remplacé par `renderSpotsList()` avec pagination
- `populateSpotsFilters()` → refactorisé, dropdowns dans un panel "Filtrer" collapsible
- `showSpotDetail()` → enrichi avec les nouvelles métadonnées + bouton Google Maps
- Les filtres pays/région/ville → déplacés dans le panel collapsible, toujours fonctionnels

### Ajouté :
- `renderFavStrip()` — bandeau horizontal scrollable
- `renderSpotsList(spots, append)` — rendu paginé avec "Voir plus"
- `loadSpotsList(page, filters)` — requête Supabase paginée
- `searchSpots(query)` — recherche texte
- `sortSpots(spots, method)` — tri client-side
- CSS : `.fav-strip`, `.fav-card`, `.search-bar`, `.sort-chips`, `.filter-panel`, `.gmaps-btn`, `.spot-char-grid`

---

## 6. Hors scope

- Carte / vue map (spec future)
- Scores IA en temps réel sur la liste (on utilise les scores prefetchés existants)
- Infinite scroll (on garde "Voir plus" — plus simple, moins de bugs)
- Photos des spots
- Ajout/édition de spots par l'utilisateur
