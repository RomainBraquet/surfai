# SurfAI — Document Référent V0

**Date :** 26 mars 2026
**Commit :** 20c4e0f
**Status :** Version locale fonctionnelle, prête pour push

---

## Positionnement

**"L'app de surf qui t'es vraiment dédiée."**

Pas une app de prévisions de plus. SurfAI se différencie par :
- **Le sur-mesure** : profil, boards, sessions, IA personnalisée par surfeur et par spot
- **La communauté** : intelligence collective, partage, marketplace future

---

## Architecture technique

### Stack
- **Frontend** : HTML/CSS/JS vanilla (index.html ~4000 lignes), mobile-first (420px), dark theme
- **Backend** : Express.js (localhost:3001), 13+ services
- **Base de données** : Supabase (PostgreSQL + Auth + Storage)
- **APIs externes** : Stormglass (marine), Open-Meteo (météo gratuite), SHOM (marées)
- **Déploiement** : Vercel (frontend surfai-app.vercel.app, backend surfai-backend.vercel.app)
- **PWA** : manifest.json + service worker

### Structure monorepo
```
surfai/
├── apps/web/index.html     ← frontend principal
├── backend/
│   ├── server.js            ← Express entry point (port 3001)
│   ├── src/routes/api.js    ← toutes les routes API
│   ├── src/services/        ← stormglass, openMeteo, supabase, scorer, recommender, prediction...
│   └── supabase/migrations/ ← 6 migrations SQL
├── docs/                    ← vision, specs, plans, rapports
└── index.html               ← copie racine pour Vercel
```

---

## Fonctionnalités V0

### 1. Accueil
- Hero avec avatar (photo ou initiale), pseudo, niveau, stats sessions
- Bloc météo temps réel (eau, vent, vagues, marée) via géoloc ou home spot
- Meilleurs créneaux IA — 3 jours (scoring backend)
- Favoris en dropdown avec conditions live Open-Meteo
- Boutons rapides Session / Spots

### 2. Spots
- **Favoris** : dropdown déroulant avec conditions temps réel (houle, vent, période)
- **Autour de moi** : géoloc < 10km, fallback 5 plus proches
- **Explorer** : pays → zones (France ordonnées) → villes → spots
- **Recherche** : barre de recherche temps réel
- **Fiche spot** : détail complet, prévisions, sessions utilisateur sur ce spot, toggle favori
- **Mode sélection** : réutilisé par Session, Profil et Boards pour choisir un spot

### 3. Session
- **Ajouter** : spot (via mode sélection Spots), date/heure, note 1-5 étoiles, board (optionnel), notes libres
- **Historique** : liste avec tri, filtre 3 mois ou tout afficher
- **Enrichissement auto** : le backend capture les conditions météo/marine au moment de la session
- **Partage Instagram** : après enregistrement, photo + card canvas 1080×1350 téléchargeable

### 4. Profil
- Photo de profil uploadable (Supabase Storage + fallback base64)
- Pseudo, niveau de surf (débutant → expert)
- Mon home spot (sélection via mode Spots)
- Les vagues que je surfe (min/max inline)
- Dropdown "Mes boards" avec miniatures → lien vers onglet Boards
- Configuration avancée (backend URL, test connexion)
- Déconnexion

### 5. Boards (Mon Quiver) — NOUVEAU V0
- **Cards visuelles** : photo (ou icône par type), nom custom, dimensions, volume, type, shaper/marque, fins setup, tail shape, sweet spot, stats sessions
- **Formulaire enrichi** (menu dépliant) en 3 sections :
  - L'essentiel : nom, photo, type, taille
  - Les détails : volume, largeur, épaisseur, fins, tail, shaper, marque, année, état
  - Sweet spot : houle min/max, marée, spots associés (multi-sélection)
- **Édition complète** de tous les champs
- **Suppression** avec détachement des sessions FK
- **Partage Instagram 3 modes** :
  - Montrer ma board (flex lifestyle)
  - Vendre ma board (prix, ville, message)
  - Réparer ma board (description, ville, urgence)
  - Chaque mode : choisir photo → canvas 1080×1350 → Enregistrer/Partager

### 6. Auth
- Supabase Auth via magic link (email)
- Onboarding premier login
- Overlay login si non connecté

### 7. Backend API (Express.js)
- `GET /health` — status
- `GET /api/v1/weather/forecast` — prévisions Stormglass
- `GET /api/v1/weather/current` — conditions live + prochaine marée
- `GET /api/v1/spots/conditions` — conditions multi-spots Open-Meteo
- `POST /api/v1/sessions/quick` — enregistrer session + auto-météo
- `GET /api/v1/sessions/list` — historique sessions
- `GET /api/v1/spots` — base de spots
- `GET/POST /api/v1/favorites` — favoris utilisateur
- `GET /api/v1/predictions/best-windows` — meilleurs créneaux IA
- `GET /api/v1/ai/demo/:userId` — préférences IA

---

## Base de données Supabase

### Tables principales
- `profiles` — pseudo, niveau, préférences vagues
- `boards` — 20+ colonnes (nickname, type, dims, volume, fins, tail, shaper, brand, sweet_spot_*, photo_url...)
- `sessions` — spot_id, date, heure, rating, board_id, notes, meteo (JSONB)
- `spots` — nom, ville, région, pays, lat/lng, wave_type, surf_zone
- `user_favorite_spots` — relation user ↔ spot
- `tide_cache` — cache marées SHOM
- `weather_cache` — cache météo 6h

### Migrations exécutées
1. add_shom_port_code
2. create_tide_cache
3. create_user_favorite_spots
4. add_spot_enrichment_columns
5. add_surf_zone
6. enrich_boards_table (V0)

---

## Ce qui n'est PAS dans la V0

- [ ] Moteur de prédiction ML personnalisé (actuellement règles simples)
- [ ] Intelligence collective (recommandations communautaires)
- [ ] Annuaire shapers / réparateurs
- [ ] Marketplace boards in-app
- [ ] Notifications push
- [ ] Migration React + Vite
- [ ] App mobile React Native
- [ ] Stormglass plan payant
- [ ] Question post-session "C'était la bonne board ?" (felt_adapted)
- [ ] Poids/taille dans le profil (ratio volume/poids)
- [ ] Partage carte "Mon Quiver" complète
- [ ] Comparaison de quivers entre surfeurs

---

## Déploiement

- **Frontend** : surfai-app.vercel.app (repo github.com/romainbraquet/surfai-app)
- **Backend** : surfai-backend.vercel.app
- **Variables env backend** : STORMGLASS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, NODE_ENV
- **Agent cloud** : rapport quotidien 21h Paris (trig_01K9HZ5M3mWeRLKszjk87hbB)

---

## Prochaines priorités

1. **Push V0 sur GitHub** et vérifier le déploiement Vercel
2. **Moteur de prédiction** : enrichir le scoring avec les données boards et sessions
3. **felt_adapted** : question post-session pour alimenter le ML
4. **Templates Instagram** : design dédié par mode de partage
5. **Poids/taille profil** : ratio volume/poids pour recommandations board
