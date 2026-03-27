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
function scoreWind(windSpeed, windDirection, idealWindDirections, waveDirection) {
  // windSpeed en km/h, windDirection en degrés (0-360)
  const speedKmh = windSpeed > 50 ? windSpeed / 3.6 : windSpeed; // si m/s → km/h

  // Courbe continue gaussienne au lieu de paliers
  // 0→10, 10→8.5, 15→7.0, 20→5.3, 25→3.7, 30→2.4, 40→0.8
  const speedScore = 10 * Math.exp(-Math.pow(speedKmh / 25, 2));

  // Scoring offshore : compare direction vent vs direction vagues
  let offshoreBonus = 0;
  if (windDirection != null && waveDirection != null) {
    const diff = Math.abs(windDirection - waveDirection);
    const normalized = diff > 180 ? 360 - diff : diff;
    if (normalized > 150)      offshoreBonus = 2.0;   // offshore pur
    else if (normalized > 120) offshoreBonus = 1.5;   // cross-offshore
    else if (normalized > 60)  offshoreBonus = 0;     // cross-shore
    else if (normalized > 30)  offshoreBonus = -1.0;  // cross-onshore
    else                       offshoreBonus = -1.5;  // onshore pur
  }

  // Bonus direction idéale du spot (si connue)
  let spotDirBonus = 0;
  if (windDirection != null && idealWindDirections?.length > 0) {
    const dir = degreesToCardinal(windDirection);
    if (idealWindDirections.includes(dir)) spotDirBonus = 0.5;
  }

  return Math.min(10, Math.max(0, speedScore + offshoreBonus + spotDirBonus));
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
  if (!period) return 4; // neutre si inconnu (pas 3 — on ne pénalise pas l'absence)
  // Courbe sigmoïde : transition douce entre 6-14s, plateau au-dessus
  // 5s→2.4, 7s→3.6, 8s→4.4, 10s→6.0, 12s→7.6, 14s→8.8, 16s→9.5
  return Math.min(10, 2 + 8 / (1 + Math.exp(-0.6 * (period - 10))));
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
// Impact réel sur le Pays Basque : la marée peut rendre un spot dangereux ou parfait
function tideBonus(tidePhase, idealTide, spot) {
  if (!tidePhase || tidePhase === 'unknown') return 0;

  // Spot sans info marée → privilégier mi-marée par défaut
  if (!idealTide?.length) {
    if (tidePhase === 'rising' || tidePhase === 'falling') return 0.8;  // mi-marée = bon par défaut
    if (tidePhase === 'low') return 0;     // neutre
    if (tidePhase === 'high') return -0.5; // léger malus marée haute
    return 0;
  }

  // Mapper phase courante vers catégories
  const phaseMap = { low: 'low', high: 'high', rising: 'mid', falling: 'mid' };
  const category = phaseMap[tidePhase];

  // Marée idéale → gros bonus
  if (idealTide.includes(category)) return 1.5;

  // Marée acceptable (mi-marée quand le spot veut mid)
  if (idealTide.includes('mid') && (tidePhase === 'rising' || tidePhase === 'falling')) return 0.8;

  // Marée opposée à l'idéale → pénalité forte
  // Ex: spot qui veut "low" et on est à "high" → dangereux ou pas surfable
  const isOpposite = (idealTide.includes('low') && tidePhase === 'high') ||
                     (idealTide.includes('high') && tidePhase === 'low');
  if (isOpposite) return -1.5;

  // Marée pas idéale mais pas opposée
  return -0.5;
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

// ─── Explications lisibles ────────────────────────────────
function buildWhyGood(slot, windScore, wavesScore, periodScore, tideAdj, spotScore, profile, spot, similarSession) {
  const reasons = [];   // pourquoi c'est bien
  const caveats = [];   // points d'attention

  // --- Vent ---
  const speedKmh = (slot.windSpeed || 0) > 50 ? (slot.windSpeed || 0) / 3.6 : (slot.windSpeed || 0);
  if (windScore >= 9) {
    reasons.push('Conditions glassy — quasi pas de vent');
  } else if (windScore >= 7) {
    // Vérifier si c'est grâce à l'offshore
    if (slot.windDirection != null && slot.waveDirection != null) {
      const diff = Math.abs(slot.windDirection - slot.waveDirection);
      const norm = diff > 180 ? 360 - diff : diff;
      if (norm > 120) reasons.push('Vent offshore — vagues propres et creuses');
      else reasons.push('Vent modéré et bien orienté');
    } else {
      reasons.push('Vent faible (' + Math.round(speedKmh) + ' km/h)');
    }
  } else if (windScore < 4) {
    if (speedKmh > 30) caveats.push('Vent fort (' + Math.round(speedKmh) + ' km/h) — conditions difficiles');
    else caveats.push('Vent onshore — vagues hachées');
  }

  // --- Vagues ---
  const waveH = Math.max(slot.waveHeight || 0, slot.swellHeight || 0);
  if (wavesScore >= 8) {
    reasons.push('Vagues parfaites pour toi (' + waveH.toFixed(1) + 'm)');
  } else if (wavesScore >= 6) {
    reasons.push('Taille de vagues dans ta zone (' + waveH.toFixed(1) + 'm)');
  } else if (wavesScore < 4) {
    if (waveH < (profile.min_wave_height || 0.8)) {
      caveats.push('Vagues petites (' + waveH.toFixed(1) + 'm) — en dessous de tes préférences');
    } else {
      caveats.push('Vagues grosses (' + waveH.toFixed(1) + 'm) — au-dessus de tes préférences');
    }
  }

  // --- Période ---
  const period = slot.wavePeriod || 0;
  if (period >= 12) {
    reasons.push('Période longue (' + Math.round(period) + 's) — vagues puissantes et espacées');
  } else if (period > 0 && period < 7) {
    caveats.push('Période courte (' + Math.round(period) + 's) — vagues désorganisées');
  }

  // --- Marée ---
  if (tideAdj >= 1.0) {
    const tideLabel = { low: 'basse', high: 'haute', rising: 'montante', falling: 'descendante' };
    reasons.push('Marée ' + (tideLabel[slot.tidePhase] || slot.tidePhase) + ' — idéale pour ce spot');
  } else if (tideAdj <= -1.0) {
    const tideLabel = { low: 'basse', high: 'haute', rising: 'montante', falling: 'descendante' };
    caveats.push('Marée ' + (tideLabel[slot.tidePhase] || slot.tidePhase) + ' — pas idéale pour ce spot');
  }

  // --- Session similaire ---
  if (similarSession) {
    const date = new Date(similarSession.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const stars = '★'.repeat(similarSession.rating || 0);
    reasons.push('Conditions similaires à ta session du ' + date + ' (' + stars + ')');
  }

  return { whyGood: reasons, whyNotPerfect: caveats };
}

// ─── Fonction principale ─────────────────────────────────
function scoreSlot(slot, context) {
  const { profile, spot, pastSessions = [], boards = [] } = context;
  const sessionsWithMeteo = pastSessions.filter(s => s.meteo).length;
  const weights = computeWeights(sessionsWithMeteo);

  const windScore    = scoreWind(slot.windSpeed, slot.windDirection, spot.ideal_wind, slot.waveDirection);
  const wavesScore   = scoreWaves(slot.waveHeight, slot.swellHeight, profile);
  const periodScore  = scorePeriod(slot.wavePeriod);
  const historyScore = scoreHistory(slot, pastSessions);
  const spotScore    = scoreSpot(slot, spot);
  const tideAdj      = tideBonus(slot.tidePhase, spot.ideal_tide, spot);

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

  const why = buildWhyGood(slot, windScore, wavesScore, periodScore, tideAdj, spotScore, profile, spot, similarSession);

  return {
    score,
    factors: {
      wind:    { score: Math.round(windScore * 10) / 10,    weight: weights.wind },
      waves:   { score: Math.round(wavesScore * 10) / 10,   weight: weights.waves },
      period:  { score: Math.round(periodScore * 10) / 10,  weight: weights.period },
      history: { score: Math.round(historyScore * 10) / 10, weight: weights.history, basedOnSessions: sessionsWithMeteo },
      spot:    { score: Math.round(spotScore * 10) / 10,     weight: weights.spot },
      tide:    { bonus: tideAdj },
    },
    whyGood: why.whyGood,
    whyNotPerfect: why.whyNotPerfect,
    boardSuggestion,
    similarSession,
    calibrationLevel: Math.round(weights.history * 100) / 100,
  };
}

module.exports = { scoreSlot, computeWeights, degreesToCardinal, buildWhyGood };
