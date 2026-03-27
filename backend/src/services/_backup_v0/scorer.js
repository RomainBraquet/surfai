// 🎯 Scorer SurfAI — Score composite 0-10 par créneau horaire
// Spec : docs/superpowers/specs/2026-03-22-moteur-prediction-ia-design.md

// Poids de base (somme = 1.0)
const BASE_WEIGHTS = {
  wind:    0.30,
  waves:   0.20,
  period:  0.15,
  history: 0.20,
  spot:    0.15,
};

// Calcul du poids historique progressif selon le nombre de sessions réelles avec météo
function computeWeights(sessionsWithMeteoCount) {
  const h = 0.10 + (0.10 * Math.min(sessionsWithMeteoCount, 20) / 20);
  const remaining = 1 - h;
  const baseWithoutHistory = 1 - BASE_WEIGHTS.history; // 0.80
  return {
    wind:    BASE_WEIGHTS.wind    * (remaining / baseWithoutHistory),
    waves:   BASE_WEIGHTS.waves   * (remaining / baseWithoutHistory),
    period:  BASE_WEIGHTS.period  * (remaining / baseWithoutHistory),
    history: h,
    spot:    BASE_WEIGHTS.spot    * (remaining / baseWithoutHistory),
  };
}

// ─── Facteur Vent (0-10) ────────────────────────────────
function scoreWind(windSpeed, windDirection, idealWindDirections) {
  // windSpeed en km/h, windDirection en degrés (0-360) ou string cardinal
  const speedKmh = windSpeed > 50 ? windSpeed / 3.6 : windSpeed; // si m/s → km/h

  let speedScore;
  if (speedKmh < 10)       speedScore = 10;
  else if (speedKmh < 20)  speedScore = 8;
  else if (speedKmh < 30)  speedScore = 5;
  else if (speedKmh < 40)  speedScore = 2;
  else                     speedScore = 0;

  // Bonus direction si les conditions idéales du spot sont connues
  let directionBonus = 0;
  if (windDirection !== null && windDirection !== undefined && idealWindDirections?.length > 0) {
    const dir = degreesToCardinal(windDirection);
    if (idealWindDirections.includes(dir)) directionBonus = 1.5;
  }

  return Math.min(10, speedScore + directionBonus);
}

// ─── Facteur Vagues + Houle (0-10) ──────────────────────
function scoreWaves(waveHeight, swellHeight, profile) {
  const combined = Math.max(waveHeight || 0, swellHeight || 0);
  const min = profile.min_wave_height || 0.8;
  const max = profile.max_wave_height || 2.0;
  const optimal = (min + max) / 2;

  if (combined >= min && combined <= max) {
    // Dans la fourchette — peak au centre
    const distFromOptimal = Math.abs(combined - optimal) / ((max - min) / 2);
    return 10 - distFromOptimal * 2;
  } else if (combined < min) {
    const shortfall = (min - combined) / min;
    return Math.max(0, 6 - shortfall * 10);
  } else {
    const excess = (combined - max) / max;
    return Math.max(0, 6 - excess * 8);
  }
}

// ─── Facteur Période (0-10) ─────────────────────────────
function scorePeriod(period) {
  if (!period) return 3;
  if (period >= 15) return 10;
  if (period >= 12) return 8.5;
  if (period >= 8)  return 6;
  if (period >= 6)  return 3;
  return 1;
}

// ─── Facteur Historique (0-10) ──────────────────────────
function scoreHistory(slot, pastSessions) {
  const goodSessions = pastSessions.filter(s => s.rating >= 4 && s.meteo);
  if (goodSessions.length === 0) return 5; // neutre si pas de données

  // Distance euclidienne normalisée sur 3 dimensions
  function similarity(s) {
    const dWave = Math.abs((s.meteo.waveHeight || 0) - (slot.waveHeight || 0)) / 3;
    const dWind = Math.abs((s.meteo.windSpeed || 0) - (slot.windSpeed || 0)) / 40;
    const dPeriod = Math.abs((s.meteo.wavePeriod || 0) - (slot.wavePeriod || 0)) / 15;
    return 1 / (1 + Math.sqrt(dWave ** 2 + dWind ** 2 + dPeriod ** 2));
  }

  // Top 5 sessions les plus similaires
  const ranked = goodSessions
    .map(s => ({ session: s, sim: similarity(s) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5);

  const weightedRating = ranked.reduce((sum, { session, sim }) => sum + session.rating * sim, 0);
  const totalSim = ranked.reduce((sum, { sim }) => sum + sim, 0);
  const avgRating = totalSim > 0 ? weightedRating / totalSim : 3;

  return (avgRating / 5) * 10; // normaliser 1-5 → 0-10
}

// ─── Facteur Adéquation Spot (0-10) ─────────────────────
function scoreSpot(slot, spot) {
  let score = 5; // base neutre

  if (spot.ideal_wind?.length > 0 && slot.windDirection !== null) {
    const dir = degreesToCardinal(slot.windDirection);
    if (spot.ideal_wind.includes(dir)) score += 2.5;
  }

  if (spot.ideal_swell?.length > 0 && slot.swellDirection !== null) {
    const dir = degreesToCardinal(slot.swellDirection);
    if (spot.ideal_swell.includes(dir)) score += 2.5;
  }

  return Math.min(10, score);
}

// ─── Bonus Marée ────────────────────────────────────────
function tideBonus(tidePhase, idealTide) {
  if (!tidePhase || tidePhase === 'unknown' || !idealTide?.length) return 0;
  // Mapper phase courante vers catégorie low/mid/high
  const phaseMap = { low: 'low', high: 'high', rising: 'mid', falling: 'mid' };
  const category = phaseMap[tidePhase];
  if (idealTide.includes(category)) return 0.5;
  if (idealTide.includes('mid') && (tidePhase === 'rising' || tidePhase === 'falling')) return 0.3;
  return -0.3;
}

// ─── Board Suggestion ───────────────────────────────────
function suggestBoard(slot, pastSessions, boards) {
  if (!boards?.length) return null;
  const goodSessions = pastSessions.filter(s => s.rating >= 4 && s.meteo && s.board_id);
  if (goodSessions.length < 2) return null; // pas assez de données

  function similarity(s) {
    const dWave = Math.abs((s.meteo.waveHeight || 0) - (slot.waveHeight || 0)) / 3;
    const dWind = Math.abs((s.meteo.windSpeed || 0) - (slot.windSpeed || 0)) / 40;
    return 1 / (1 + Math.sqrt(dWave ** 2 + dWind ** 2));
  }

  const similar = goodSessions
    .map(s => ({ board_id: s.board_id, sim: similarity(s) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5);

  // Board la plus fréquente parmi les sessions similaires
  const boardCounts = {};
  similar.forEach(({ board_id }) => {
    boardCounts[board_id] = (boardCounts[board_id] || 0) + 1;
  });
  const topBoardId = Object.entries(boardCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const board = boards.find(b => b.id === topBoardId);
  if (!board) return null;

  return {
    board,
    confidence: Math.round((boardCounts[topBoardId] / similar.length) * 100) / 100,
    basedOnSessions: similar.length,
  };
}

// ─── Utilitaires ────────────────────────────────────────
function degreesToCardinal(deg) {
  if (deg === null || deg === undefined) return null;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ─── Fonction principale ─────────────────────────────────
function scoreSlot(slot, context) {
  const { profile, spot, pastSessions = [], boards = [] } = context;
  const sessionsWithMeteo = pastSessions.filter(s => s.meteo).length;
  const weights = computeWeights(sessionsWithMeteo);

  const windScore    = scoreWind(slot.windSpeed, slot.windDirection, spot.ideal_wind);
  const wavesScore   = scoreWaves(slot.waveHeight, slot.swellHeight, profile);
  const periodScore  = scorePeriod(slot.wavePeriod);
  const historyScore = scoreHistory(slot, pastSessions);
  const spotScore    = scoreSpot(slot, spot);
  const tideAdj      = tideBonus(slot.tidePhase, spot.ideal_tide);

  const rawScore =
    windScore    * weights.wind   +
    wavesScore   * weights.waves  +
    periodScore  * weights.period +
    historyScore * weights.history +
    spotScore    * weights.spot   +
    tideAdj;

  const score = Math.round(Math.min(10, Math.max(0, rawScore)) * 10) / 10;

  const boardSuggestion = score >= 6 ? suggestBoard(slot, pastSessions, boards) : null;

  // Trouver la session similaire la plus proche pour la narrative
  const goodSessions = pastSessions.filter(s => s.rating >= 4 && s.meteo);
  let similarSession = null;
  if (goodSessions.length > 0) {
    similarSession = goodSessions.sort((a, b) => {
      const da = Math.abs((a.meteo.waveHeight || 0) - (slot.waveHeight || 0));
      const db_ = Math.abs((b.meteo.waveHeight || 0) - (slot.waveHeight || 0));
      return da - db_;
    })[0];
  }

  return {
    score,
    factors: {
      wind:    { score: Math.round(windScore * 10) / 10,    weight: weights.wind },
      waves:   { score: Math.round(wavesScore * 10) / 10,   weight: weights.waves },
      period:  { score: Math.round(periodScore * 10) / 10,  weight: weights.period },
      history: { score: Math.round(historyScore * 10) / 10, weight: weights.history, basedOnSessions: sessionsWithMeteo },
      spot:    { score: Math.round(spotScore * 10) / 10,     weight: weights.spot },
    },
    boardSuggestion,
    similarSession,
    calibrationLevel: Math.round(weights.history * 100) / 100,
  };
}

module.exports = { scoreSlot, computeWeights, degreesToCardinal };
