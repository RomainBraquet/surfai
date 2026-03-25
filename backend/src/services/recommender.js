// 🏆 Recommender SurfAI — Sélectionne les meilleurs créneaux et génère les narratives
// Spec : docs/superpowers/specs/2026-03-22-moteur-prediction-ia-design.md

const { scoreSlot } = require('./scorer');

// Labels selon score
function scoreLabel(score) {
  if (score >= 8.5) return 'Exceptionnel';
  if (score >= 7)   return 'Excellent';
  if (score >= 5.5) return 'Bon';
  if (score >= 4)   return 'Correct';
  return 'Faible';
}

// Narrative personnalisée
function buildNarrative(scoredSlot, spot) {
  const { similarSession, score } = scoredSlot;
  // Référencer uniquement les sessions passées sur CE spot
  if (similarSession?.meteo && similarSession?.spot_id === spot.id) {
    const date = new Date(similarSession.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const stars = '★'.repeat(similarSession.rating);
    return `Rappelle ta session du ${date} ici — ${stars}`;
  }
  if (score >= 8.5) return 'Conditions exceptionnelles pour ton niveau';
  if (score >= 7)   return 'Excellente session en perspective';
  if (score >= 5.5) return 'Bonne session possible';
  return 'Conditions correctes';
}

// Grouper les points horaires en fenêtres continues
function buildTimeWindow(slots) {
  if (!slots.length) return { timeWindow: null, peakHour: null };
  const best = slots.reduce((a, b) => a.score > b.score ? a : b);
  const peakHour = new Date(best.time).getHours();

  // Étendre la fenêtre aux heures adjacentes de score >= (peak - 1.5)
  const threshold = best.score - 1.5;
  const windowHours = slots
    .filter(s => s.score >= threshold)
    .map(s => new Date(s.time).getHours())
    .sort((a, b) => a - b);

  if (windowHours.length === 0) return { timeWindow: `${peakHour}h`, peakHour };
  const startH = windowHours[0];
  const endH = windowHours[windowHours.length - 1] + 1;
  return {
    timeWindow: startH === endH - 1 ? `${startH}h` : `${startH}h–${endH}h`,
    peakHour,
  };
}

// Fonction principale — retourne les meilleurs créneaux pour un spot
function getBestWindows(context, maxWindows = 10) {
  const { spot, forecast, profile, pastSessions, boards } = context;

  // Scorer chaque créneau horaire
  const scored = forecast.map(point => {
    const result = scoreSlot(point, { profile, spot, pastSessions, boards });
    return { ...result, time: point.time, conditions: point };
  });

  // Filtrer les créneaux non surfables (score < 4) et nocturnes (avant 6h, après 21h)
  const surfable = scored.filter(s => {
    if (s.score < 4) return false;
    const hour = new Date(s.time).getHours();
    return hour >= 6 && hour <= 21;
  });

  // Grouper par demi-journée (matin: 6-12, après-midi: 12-21)
  const groups = {};
  surfable.forEach(s => {
    const date = s.time.split('T')[0];
    const hour = new Date(s.time).getHours();
    const period = hour < 12 ? 'morning' : 'afternoon';
    const key = `${date}_${period}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  // Sélectionner le meilleur créneau par groupe
  const windows = Object.values(groups)
    .map(slots => {
      const best = slots.reduce((a, b) => a.score > b.score ? a : b);
      const { timeWindow, peakHour } = buildTimeWindow(slots);
      return {
        date: best.time.split('T')[0],
        timeWindow,
        peakHour: `${peakHour}h`,
        score: best.score,
        scoreLabel: scoreLabel(best.score),
        conditions: {
          waveHeight: best.conditions.waveHeight,
          windSpeed: best.conditions.windSpeed,
          windDirection: best.conditions.windDirection,
          wavePeriod: best.conditions.wavePeriod,
          tidePhase: best.conditions.tidePhase,
          swellHeight: best.conditions.swellHeight,
        },
        factors: best.factors,
        boardSuggestion: best.boardSuggestion,
        narrative: buildNarrative(best, spot),
        similarSession: best.similarSession,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxWindows);

  return {
    spot: { id: spot.id, name: spot.name, city: spot.city },
    generatedAt: new Date().toISOString(),
    windows,
    calibrationLevel: scored[0]?.calibrationLevel || 0.10,
    totalSessionsAnalyzed: pastSessions.filter(s => s.meteo).length,
  };
}

module.exports = { getBestWindows };
