# Session Share Card — Design Spec

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Permettre aux utilisateurs de partager leur session de surf sur Instagram/réseaux sociaux via une image générée (post card) contenant leur photo, les conditions de la session, et le branding SurfAI. Objectif : viralité.

**Architecture:** Tout côté client. Un `<canvas>` JS génère l'image 1080x1350 à partir de la photo utilisateur + overlay de données. Export en PNG. Partage via Web Share API ou téléchargement.

**Tech Stack:** Vanilla JS, Canvas API, Web Share API Level 2

---

## 1. Flow utilisateur

1. L'utilisateur remplit le formulaire d'ajout de session (spot, date, note, board, notes)
2. Il sauvegarde → **écran de confirmation** apparaît
3. L'écran affiche un résumé de la session + bouton **"📸 Partager ta session"**
4. Clic → choix photo : **caméra ou galerie** (`<input type="file" accept="image/*">`)
5. Photo sélectionnée → **preview du post card** généré en temps réel
6. Deux boutons sous la preview :
   - **"💾 Enregistrer"** → télécharge le PNG dans la galerie
   - **"📤 Partager"** → ouvre le menu de partage natif (Instagram, WhatsApp, etc.)
7. Bouton **"Passer"** pour fermer sans partager

---

## 2. Post card — spécifications visuelles

### Dimensions
- **1080 x 1350 px** (ratio 4:5, format post Instagram)

### Composition (de haut en bas)

**Photo utilisateur :**
- Plein cadre, couvre tout le canvas
- Redimensionnée/cropée au centre pour remplir le format 4:5 (`object-fit: cover` en logique canvas)
- Légère réduction de luminosité sur la moitié basse (gradient transparent → rgba(10,14,39,0.85)) pour la lisibilité du texte

**Zone de données (bas de l'image, sur le gradient) :**

```
                                        [logo 🏄‍♂️ SurfAI]

                            LA GRAVIÈRE
                              Hossegor

                    🌊 1.5m  ·  💨 8 km/h SE  ·  12s

                          ⭐⭐⭐⭐  ·  @pseudo

                            24 mars 2026
```

**Détails typographiques (charte SurfAI) :**
- **Nom du spot** : 48px, bold, #f0f4ff (blanc cassé)
- **Ville** : 28px, regular, rgba(255,255,255,0.6)
- **Conditions** : 32px, bold, #4dff91 (vert SurfAI)
- **Note + pseudo** : 24px, regular, #f0f4ff
- **Date** : 22px, regular, rgba(255,255,255,0.5)
- **Logo** : texte "SurfAI" en 20px bold, #00cfff, centré en haut de la zone données. Pas d'emoji (les emojis ne rendent pas bien sur canvas).

**Important — pas d'emojis sur le canvas :**
Les emojis (`fillText`) s'affichent en noir/blanc ou en carrés vides sur beaucoup de navigateurs. Toutes les icônes sont remplacées par du texte :
- Vagues : pas d'icône, juste "1.5m"
- Vent : pas d'icône, juste "8 km/h SE"
- Période : juste "12s"
- Étoiles : caractères Unicode "★" (U+2605) qui rendent correctement en fillText
- Logo : texte "SurfAI" sans emoji
- Séparateurs : point médian " · "

**Couleurs charte :**
- Fond gradient : #0a0e27 (dark navy)
- Vert : #4dff91
- Bleu : #00cfff
- Texte : #f0f4ff

---

## 3. Génération canvas

```javascript
async function generateShareCard(photo, sessionData) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');

    // 1. Dessiner la photo (crop center, cover)
    const img = await loadImage(photo);
    drawImageCover(ctx, img, 0, 0, 1080, 1350);

    // 2. Gradient sombre en bas (moitié basse)
    const grad = ctx.createLinearGradient(0, 600, 0, 1350);
    grad.addColorStop(0, 'rgba(10,14,39,0)');
    grad.addColorStop(0.4, 'rgba(10,14,39,0.6)');
    grad.addColorStop(1, 'rgba(10,14,39,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 600, 1080, 750);

    // 3. Texte (centré, de bas en haut)
    // ... (voir implémentation)

    return canvas;
}
```

### Fonction drawImageCover (crop center)
```javascript
function drawImageCover(ctx, img, x, y, w, h) {
    const imgRatio = img.width / img.height;
    const canvasRatio = w / h;
    let sx, sy, sw, sh;
    if (imgRatio > canvasRatio) {
        sh = img.height;
        sw = sh * canvasRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        sw = img.width;
        sh = sw / canvasRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
```

---

## 4. Données nécessaires pour le post card

Toutes disponibles après la sauvegarde de la session :

| Donnée | Source |
|--------|--------|
| Photo | Sélectionnée par l'utilisateur (File API) |
| Nom du spot | `session.spots.name` (JOIN dans la réponse) |
| Ville du spot | `session.spots.city` |
| Date | `session.date` |
| Note (étoiles) | `session.rating` |
| Pseudo | `userData.profile.nickname` — si vide ou absent, ne pas afficher la ligne pseudo |
| Conditions météo | `session.meteo` (waveHeight, windSpeed, windDirection, wavePeriod) |

**Données manquantes — comportement :**
- Pas de météo → ne pas afficher la ligne conditions
- Pas de pseudo/nickname → ne pas afficher la ligne pseudo
- Pas de rating → ne pas afficher les étoiles
- Le card reste clean avec seulement les données disponibles

**IMPORTANT — capturer les données AVANT le form reset :**
Le formulaire d'ajout de session est reset immédiatement après sauvegarde. Les données du spot (nom, ville) doivent être capturées AVANT le reset :
```javascript
// Capturer avant reset
const spotSelect = document.getElementById('session-spot');
const spotName = spotSelect.options[spotSelect.selectedIndex]?.text || '';
// ... puis reset le form
```
Alternativement, enrichir la réponse backend pour inclure le spot name/city dans le résultat de la sauvegarde.

---

## 5. Partage

### Enregistrer (download)
```javascript
canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surfai-${spotName}-${date}.png`;
    a.click();
    URL.revokeObjectURL(url);
}, 'image/png');
```

### Partager (Web Share API)
```javascript
canvas.toBlob(async blob => {
    const file = new File([blob], `surfai-${spotName}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
            files: [file],
            title: `Session surf à ${spotName}`,
            text: `🏄‍♂️ Session à ${spotName} — ${conditions}`
        });
    } else {
        // Fallback : télécharger (try/catch car canShare peut throw sur certains navigateurs)
        downloadCard(canvas);
    }
} catch (e) {
    downloadCard(canvas);
}
}, 'image/png');
```

**Note :** `navigator.share` avec `files` fonctionne sur iOS Safari 15+ et Android Chrome. Sur desktop, fallback vers le téléchargement.

---

## 6. UI de l'écran de partage

### Écran de confirmation post-sauvegarde
```
┌──────────────────────────────────┐
│                                  │
│    ✅ Session enregistrée !      │
│                                  │
│    La Gravière · Hossegor        │
│    24 mars 2026 · ⭐⭐⭐⭐        │
│                                  │
│  ┌──────────────────────────┐    │
│  │  📸 Partager ta session  │    │
│  └──────────────────────────┘    │
│                                  │
│         Passer →                 │
│                                  │
└──────────────────────────────────┘
```

### Écran de preview post-card (après sélection photo)
```
┌──────────────────────────────────┐
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │    [PREVIEW DU POST CARD]  │  │
│  │    (scaled down à ~300px   │  │
│  │     de large)              │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────┐ ┌────────────┐   │
│  │ 💾 Enreg.  │ │ 📤 Partager│   │
│  └────────────┘ └────────────┘   │
│                                  │
│         Fermer                   │
│                                  │
└──────────────────────────────────┘
```

### CSS
- L'écran utilise l'overlay auth existant (`position: fixed, inset: 0, z-index: 1000`)
- Fond : `rgba(10,14,39,0.95)` avec `backdrop-filter: blur(6px)`
- Boutons : charte SurfAI (vert #4dff91 pour le partage, gris pour enregistrer)

---

## 7. Modifications existantes

### Modifié :
- Le flow de sauvegarde de session (`saveSession()` ou équivalent) → après succès, afficher l'écran de confirmation au lieu de juste un toast/message

### Ajouté :
- `showSessionConfirmation(session)` — écran de confirmation
- `showShareCardPreview(session, photoFile)` — preview avec canvas
- `generateShareCard(photoFile, sessionData)` — génération canvas
- `downloadShareCard(canvas)` — téléchargement PNG
- `shareCard(canvas, sessionData)` — Web Share API
- CSS pour l'overlay de partage

### Inchangé :
- Le formulaire d'ajout de session
- La sauvegarde backend
- L'onglet Sessions

---

## 8. Hors scope

- Partage direct via Instagram API (impossible sans SDK natif)
- Édition/crop de la photo
- Filtres photo
- Templates multiples (un seul design)
- Stories Instagram (format 9:16) — on fait 4:5 uniquement
- Vidéo
- Partage automatique (toujours déclenché par l'utilisateur)
