// 📡 Collector SurfAI — Agrège toutes les sources de données en un contexte unifié
// Spec : docs/superpowers/specs/2026-03-22-moteur-prediction-ia-design.md

const stormglassService = require('./stormglassService');
const shomService = require('./shomService');
const db = require('./supabaseService');

async function collectContext(spotId, userId, days = 5) {
  console.log(`📡 Collecte contexte: spot=${spotId} user=${userId} days=${days}`);

  // Récupérer toutes les données en parallèle
  const [spot, profile, sessions, boards] = await Promise.all([
    db.getSpotById(spotId),
    db.getProfile(userId),
    db.getSessionsWithMeteo(userId),
    db.getBoards(userId),
  ]);

  if (!spot) throw new Error(`Spot ${spotId} introuvable`);

  // Prévisions météo Stormglass (5 jours)
  const weatherData = await stormglassService.getForecast(spot.lat, spot.lng, days);

  // Marées via Stormglass tide/extremes, puis interpolation sur le forecast
  let forecast = weatherData.forecast;
  try {
    const tideExtremes = await stormglassService.getTideExtremes(spot.lat, spot.lng, days);
    if (tideExtremes.length > 0) {
      forecast = forecast.map(point => {
        // Trouver l'extrême précédent et suivant pour interpoler la phase
        const ts = point.timestamp;
        const prev = [...tideExtremes].reverse().find(e => e.timestamp <= ts);
        const next = tideExtremes.find(e => e.timestamp > ts);
        let tidePhase = 'unknown';
        if (prev && next) {
          tidePhase = next.type === 'high' ? 'rising' : 'falling';
        } else if (prev) {
          tidePhase = prev.type === 'high' ? 'falling' : 'rising';
        }
        return { ...point, tidePhase, tideExtremes };
      });
    }
  } catch (e) {
    console.warn('⚠️ Stormglass tide indisponible:', e.message);
  }

  return {
    spot,
    forecast,         // array de points horaires enrichis avec marée
    profile: profile || { surf_level: 'intermediate', min_wave_height: 0.8, max_wave_height: 2.0 },
    pastSessions: sessions || [],
    boards: boards || [],
    userId,
    collectedAt: new Date().toISOString(),
  };
}

module.exports = { collectContext };
