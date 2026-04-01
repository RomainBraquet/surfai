# SurfAI — Auth, Profil, Predictions par email, Push notifications

**Date :** 31 mars 2026
**Status :** Valide

---

## 1. Email de validation a l'inscription

**Comportement :** Quand un utilisateur s'inscrit via email/password, Supabase envoie automatiquement un email de confirmation. L'utilisateur doit cliquer le lien pour activer son compte.

**Implementation :**
- Activer "Confirm email" dans Supabase Dashboard > Auth > Settings
- Personnaliser le template email (branding SurfAI, ton surf)
- Cote frontend : apres `signUp()`, afficher un message "Verifie ta boite mail" au lieu de connecter directement
- Gerer le redirect apres confirmation (Supabase redirige vers `surfai-app.vercel.app` avec un token)
- Les inscriptions Apple/Google ne sont pas concernees (email deja verifie par le provider)

**Config Supabase necessaire :**
- Auth > Settings > Enable email confirmations: ON
- Auth > Email Templates > Customize "Confirm signup" template
- Auth > URL Configuration > Redirect URLs: ajouter `https://surfai-app.vercel.app`

---

## 2. Changement mot de passe + deconnexion dans Profil

**Emplacement :** Onglet Profil, sous les parametres existants (niveau, vagues, etc.)

**Fonctionnalites :**
- **Changer mot de passe** : bouton qui declenche `supabase.auth.updateUser({ password: newPassword })`. Demande le nouveau mot de passe 2 fois (confirmation). Min 6 caracteres.
- **Se deconnecter** : bouton existant `signOut()` — deja present, verifier qu'il est visible et fonctionnel.
- **Info compte** : afficher l'email de l'utilisateur connecte (lecture seule)

**UI :**
```
[Section "Compte"]
📧 Email: romain@example.com (grise, non editable)
🔑 [Changer le mot de passe]  → ouvre un formulaire inline
🚪 [Se deconnecter]           → confirme + sign out
```

**Note :** Si l'utilisateur est connecte via Apple/Google, ne pas afficher "Changer le mot de passe" (pas de mot de passe a changer).

---

## 3. Predictions par email — Dimanche + Jeudi

**Objectif :** Envoyer 2x/semaine un email avec les meilleurs creneaux des spots favoris de l'utilisateur, couvrant les jours a venir.

### Architecture

```
Vercel Cron (dim 7h + jeu 7h)
  → POST /api/v1/notifications/send-predictions
    → Pour chaque user avec email_predictions=true :
      1. Recuperer ses spots favoris
      2. Appeler getBestWindows() pour chaque spot (3 jours)
      3. Construire l'email HTML
      4. Envoyer via Resend API
```

### Backend

**Nouvelle route :** `POST /api/v1/notifications/send-predictions`
- Protegee par un secret (header `x-cron-secret` = variable env)
- Recupere tous les users avec `email_predictions = true`
- Pour chaque user : genere les predictions, construit l'email, envoie

**Service email :** Resend (gratuit jusqu'a 3000 emails/mois, API simple, pas de config SMTP)
- `npm install resend`
- Variable env : `RESEND_API_KEY`
- Domaine expediteur : `notifications@surfai-app.vercel.app` (ou domaine custom)

### Template email

Format simple, lisible sur mobile :
```
Sujet: 🌊 Tes previsions surf — [Dim 31 mars → Mar 2 avril]

Salut [Pseudo] !

Voici tes meilleurs creneaux pour les 3 prochains jours :

📍 Cote des Basques — Score 8.2
   Lundi 10h-12h · 🌊 1.3m · 💨 8km/h · 🌡 18°C
   "Tres bonne session en vue"

📍 Grande Plage — Score 6.5
   Mardi 14h-16h · 🌊 1.0m · 💨 15km/h · 🌡 16°C
   "Session sympa en perspective"

[Bouton : Voir dans l'app]

---
Tu recois cet email car tu as active les predictions par email.
[Se desabonner]
```

### Donnees a persister

**Nouvelle colonne table `profiles` :**
- `email_predictions` — BOOLEAN, default false
- `email` — TEXT (copie de l'email auth pour faciliter les requetes)

### Frontend

**Onglet Profil > Section Notifications :**
```
[Section "Notifications"]
📧 Predictions par email (dim + jeu)  [Toggle ON/OFF]
```

Toggle = appel `upsertProfile({ email_predictions: true/false })`

**Activation :** L'envoi d'emails n'est JAMAIS automatique. L'utilisateur doit explicitement activer le toggle. Par defaut = OFF. On peut proposer l'activation via un bandeau discret apres quelques sessions enregistrees, mais jamais forcer.

### Vercel Cron

**Fichier `vercel.json` du backend :**
```json
{
  "crons": [
    {
      "path": "/api/v1/notifications/send-predictions",
      "schedule": "0 7 * * 0,4"
    }
  ]
}
```
(Dimanche et jeudi a 7h UTC = 9h France ete)

---

## 4. Push notifications (PWA)

**Objectif :** Proposer UNE FOIS l'activation des push notifications quand l'app est installee en mode PWA (Add to Home Screen sur iOS/Android).

**Comportement :**
- Detecter si l'app tourne en mode standalone (PWA) : `window.matchMedia('(display-mode: standalone)').matches`
- Si oui ET que l'utilisateur n'a jamais ete sollicite (`push_notif_asked` en localStorage) :
  - Afficher un bandeau discret : "Active les notifications pour etre prevenu des bonnes sessions 🌊" [Activer] [Plus tard]
  - Si "Activer" : `Notification.requestPermission()` + enregistrer le Service Worker push
  - Si "Plus tard" : marquer `push_notif_asked = true`, ne plus demander
- Ne PAS demander en mode navigateur classique (trop intrusif, mauvais taux d'acceptation)

**Implementation :**
- Service Worker (`sw.js`) : ajouter le listener `push` pour afficher la notification
- Backend : stocker le `push_subscription` (endpoint + keys) dans une table `push_subscriptions`
- Envoi : utiliser `web-push` npm package depuis le meme cron que les emails
- Contenu push : "🌊 Score 8.2 a Cote des Basques demain 10h — fonce !"

**Table Supabase :**
```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz default now()
);
```

**Note :** Les push notifications sont un bonus. Si la config VAPID/Service Worker pose probleme, on peut livrer sans et l'ajouter plus tard. L'email est le canal prioritaire.

---

## 5. Ordre d'implementation

1. Email de validation (config Supabase + frontend)
2. Changement mot de passe + deconnexion dans Profil
3. Predictions par email (backend route + Resend + cron + toggle profil)
4. Push notifications PWA — **REPORTE** : a developper quand on passe en mode app native Google/Apple

---

## 6. Dependencies techniques

- **Resend** : compte gratuit + API key + domaine verifie
- **Vercel Cron** : disponible sur plan Hobby (gratuit)
- **web-push** : npm package pour les push notifications
- **Supabase** : activer email confirmation + ajouter colonnes profiles
