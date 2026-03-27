// 📡 Routes principales de l'API SurfAI
const express = require('express');
const router = express.Router();

// Middleware d'authentification et rate limiting
const { authenticateAPI } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');

console.log('📡 Chargement des routes API...');

// 🌊 Routes météo (PRINCIPALES - remplacent l'appel direct à Stormglass)
// Ces routes sont publiques mais avec rate limiting pour éviter l'abus
router.use('/weather', rateLimiter, require('./weather'));

// 🏄‍♂️ Routes sessions (protégées par authentification)
// router.use('/sessions', authenticateAPI, require('./sessions'));

// 🎯 Routes prédictions intelligentes (protégées)
// router.use('/predictions', authenticateAPI, require('./predictions'));

// 📍 Routes spots (publiques)
// router.use('/spots', require('./spots'));

// 🧪 Route de test simple
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '🧪 API SurfAI fonctionne !',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /api/v1/test',
      'GET /api/v1/weather/forecast',
      'POST /api/v1/weather/quality-prediction'
    ]
  });
});

// 📊 Route d'informations sur l'API
router.get('/info', (req, res) => {
  res.json({
    name: 'SurfAI API',
    version: '1.0.0',
    description: 'API intelligente pour prédictions de surf',
    endpoints: {
      weather: {
        forecast: 'GET /api/v1/weather/forecast',
        quality: 'POST /api/v1/weather/quality-prediction'
      }
    },
    rateLimit: '100 requêtes par 15 minutes',
    cors: 'Configuré pour développement local'
  });
});

// ========================================
// ROUTES ADAPTEURS — Compatibilité frontend
// ========================================

// Coordonnées des spots principaux
const SPOT_COORDS = {
  'biarritz': { lat: 43.4832, lng: -1.5586 },
  'hossegor': { lat: 43.6617, lng: -1.4278 },
  'anglet': { lat: 43.5109, lng: -1.5213 },
  'lacanau': { lat: 44.9833, lng: -1.2000 },
  'capbreton': { lat: 43.6431, lng: -1.4434 },
  'seignosse': { lat: 43.6667, lng: -1.4167 },
  'biscarrosse': { lat: 44.4500, lng: -1.2500 },
};

// Adapteur : /api/v1/ai/test → alias de /api/v1/test
router.get('/ai/test', (req, res) => {
  res.json({ status: 'UPGRADED_TO_V2', message: '🤖 SurfAI IA Engine opérationnel', version: '2.0' });
});

// Adapteur : /api/v1/ai/demo/:userId → analyse réelle depuis Supabase
router.get('/ai/demo/:userId', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const userId = req.params.userId;

    const [sessions, profile] = await Promise.all([
      db.getSessions(userId),
      db.getProfile(userId),
    ]);

    // Calcul des préférences depuis les sessions réelles
    const sessionsWithMeteo = sessions.filter(s => s.meteo);
    const goodSessions = sessions.filter(s => s.rating >= 4);
    const goodWithMeteo = goodSessions.filter(s => s.meteo);

    const avgWaveHeight = goodWithMeteo.length > 0
      ? goodWithMeteo.reduce((sum, s) => sum + (s.meteo.waveHeight || 0), 0) / goodWithMeteo.length
      : (profile?.min_wave_height ? (profile.min_wave_height + profile.max_wave_height) / 2 : 1.5);

    const avgWindSpeed = goodWithMeteo.length > 0
      ? goodWithMeteo.reduce((sum, s) => sum + (s.meteo.windSpeed || 0), 0) / goodWithMeteo.length
      : 15;

    // Spot favori (le plus surfé)
    const spotCount = {};
    sessions.forEach(s => { spotCount[s.spot_id] = (spotCount[s.spot_id] || 0) + 1; });
    const favoriteSpotId = Object.entries(spotCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    const favoriteSpot = sessions.find(s => s.spot_id === favoriteSpotId)?.spots;

    // Heure préférée
    const hours = sessions.filter(s => s.time).map(s => parseInt(s.time.split(':')[0]));
    const avgHour = hours.length > 0 ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length) : 9;

    const insights = [];
    if (sessions.length === 0) insights.push('Enregistrez vos premières sessions pour personnaliser les recommandations');
    else if (goodWithMeteo.length > 0) insights.push(`Vous surfez mieux avec des vagues de ${avgWaveHeight.toFixed(1)}m`);
    if (sessions.length > 5) insights.push(`${sessions.length} sessions analysées`);

    res.json({
      success: true,
      userId,
      userPreferences: {
        totalSessions: sessions.length,
        wavePreferences: { optimalHeight: { value: Math.round(avgWaveHeight * 10) / 10 } },
        windPreferences: { preferredDirection: 'Offshore', optimalSpeed: { value: Math.round(avgWindSpeed) } },
        spotPreferences: { favorite: { name: favoriteSpot?.name || 'Biarritz' } },
        timePreferences: { preferredHour: avgHour },
        behavioralInsights: insights,
        reliabilityScore: Math.min(1, sessions.length / 20),
      },
      profile,
      message: `Analyse de ${sessions.length} sessions réelles`,
    });
  } catch (error) {
    console.error('Erreur ai/demo:', error.message);
    res.json({
      success: true,
      userId: req.params.userId,
      userPreferences: {
        totalSessions: 0,
        wavePreferences: { optimalHeight: { value: 1.5 } },
        windPreferences: { preferredDirection: 'Offshore', optimalSpeed: { value: 15 } },
        spotPreferences: { favorite: { name: 'Biarritz' } },
        timePreferences: { preferredHour: 9 },
        behavioralInsights: ['Connectez Supabase pour personnaliser les recommandations'],
        reliabilityScore: 0,
      },
    });
  }
});

// Adapteur : /api/v1/sessions/weather/auto?spot=X → redirige vers /weather/forecast
router.get('/sessions/weather/auto', async (req, res) => {
  try {
    const spotName = (req.query.spot || 'biarritz').toLowerCase();
    const coords = SPOT_COORDS[spotName] || SPOT_COORDS['biarritz'];
    const days = req.query.days || 3;
    const userLevel = req.query.user_level || 'intermediate';

    // Appel interne au service météo
    const stormglassService = require('../services/stormglassService');
    const predictionService = require('../services/predictionService');

    const weatherData = await stormglassService.getForecast(coords.lat, coords.lng, days);
    const predictions = await predictionService.processForecastData(weatherData, userLevel);

    // Extraire les conditions actuelles (premier point >= maintenant, ou le premier)
    const nowSec = Date.now() / 1000;
    const currentPoint = weatherData.forecast && (
      weatherData.forecast.find(p => p.timestamp >= nowSec) || weatherData.forecast[0]
    );

    // Convertir degrés → direction cardinale
    const degreesToCompass = (deg) => {
      if (deg === null || deg === undefined) return 'N';
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    };

    const weather = currentPoint ? {
      waveHeight:    currentPoint.waveHeight,
      wavePeriod:    currentPoint.wavePeriod,
      windSpeed:     currentPoint.windSpeed,
      windDirection: degreesToCompass(currentPoint.windDirection),
      tidePhase:     currentPoint.tidePhase || 'unknown',
      tideHeight:    currentPoint.tideHeight || null,
      waterTemp:     currentPoint.waterTemp || null,
      confidence:    0.8,
      quality:       currentPoint.quality,
      offshore:      currentPoint.offshore,
    } : {};

    res.json({
      success: true,
      spot: req.query.spot || 'Biarritz',
      coords,
      weather,
      forecast: weatherData.forecast,
      predictions,
      message: `Prévisions pour ${req.query.spot || 'Biarritz'}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/sessions/quick → sauvegarde session + capture météo automatique
router.post('/sessions/quick', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const stormglassService = require('../services/stormglassService');
    const { userId, spotId, date, time, rating, notes, boardId } = req.body;

    let meteo = null;

    // Capture météo automatique si spot connu
    if (spotId) {
      try {
        const spot = await db.getSpotById(spotId);
        if (spot) {
          const weatherData = await stormglassService.getForecast(spot.lat, spot.lng, 1);
          // Trouver le point météo le plus proche de l'heure de session
          const sessionTime = time ? new Date(`${date?.split('T')[0]}T${time}`) : new Date(date);
          const sessionTimestamp = sessionTime.getTime() / 1000;
          const closest = weatherData.forecast?.reduce((best, p) =>
            Math.abs(p.timestamp - sessionTimestamp) < Math.abs((best?.timestamp || 0) - sessionTimestamp) ? p : best
          , null);

          if (closest) {
            meteo = {
              waveHeight: closest.waveHeight,
              wavePeriod: closest.wavePeriod,
              windSpeed: closest.windSpeed,
              windDirection: closest.windDirection,
              swellHeight: closest.swellHeight,
            };
            console.log(`📡 Météo capturée pour session: ${JSON.stringify(meteo)}`);
          }
        }
      } catch (meteoError) {
        console.warn('⚠️ Capture météo échouée (session sauvegardée sans météo):', meteoError.message);
      }
    }

    const session = await db.createSession({
      user_id: userId,
      spot_id: spotId,
      date: date || new Date().toISOString(),
      time: time || null,
      rating: rating || null,
      notes: notes || '',
      board_id: boardId || null,
      meteo,
    });

    // Snapshot communautaire anonymisé (si météo + rating disponibles)
    if (meteo && rating && spotId) {
      try {
        const sessionDate = new Date(date || new Date());
        await db.supabase.from('spot_session_snapshots').insert({
          spot_id: spotId,
          wave_height: meteo.waveHeight || null,
          wind_speed: meteo.windSpeed || null,
          wind_direction: meteo.windDirection || null,
          wave_period: meteo.wavePeriod || null,
          swell_height: meteo.swellHeight || null,
          tide_phase: meteo.tidePhase || null,
          rating_norm: Math.round((rating / 5) * 100) / 100,
          month: sessionDate.getMonth() + 1,
          year: sessionDate.getFullYear(),
        });
        console.log('📊 Snapshot communautaire créé');
      } catch (snapError) {
        console.warn('⚠️ Snapshot communautaire échoué:', snapError.message);
      }
    }

    res.json({
      success: true,
      message: meteo ? 'Session enregistrée avec météo capturée automatiquement' : 'Session enregistrée (météo non disponible)',
      session,
      meteoCapture: meteo !== null,
    });
  } catch (error) {
    console.error('Erreur sessions/quick:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/sessions/list?userId=X → liste des sessions depuis Supabase
router.get('/sessions/list', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });
    const sessions = await db.getSessions(userId);
    res.json({ success: true, sessions, count: sessions.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/spots → liste des spots depuis Supabase
router.get('/spots', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const spots = await db.getSpots();
    res.json({ success: true, spots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── ROUTES FAVORIS ──────────────────────────────────

// GET /api/v1/favorites?userId=X
router.get('/favorites', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });
    const { data: favRows, error } = await db.supabase
      .from('user_favorite_spots')
      .select('spot_id')
      .eq('user_id', userId);
    if (error) throw error;
    const spotIds = (favRows || []).map(r => r.spot_id);
    if (!spotIds.length) return res.json({ success: true, favorites: [] });
    const { data: spots } = await db.supabase
      .from('spots')
      .select('id, name, city, lat, lng, surf_zone, country')
      .in('id', spotIds);
    res.json({ success: true, favorites: spots || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/favorites/toggle { userId, spotId }
router.post('/favorites/toggle', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const { userId, spotId } = req.body;
    if (!userId || !spotId) return res.status(400).json({ success: false, error: 'userId et spotId requis' });

    const { data: existing } = await db.supabase
      .from('user_favorite_spots')
      .select('spot_id')
      .eq('user_id', userId)
      .eq('spot_id', spotId);

    if (existing?.length) {
      await db.supabase.from('user_favorite_spots').delete().eq('user_id', userId).eq('spot_id', spotId);
      res.json({ success: true, isFavorite: false });
    } else {
      await db.supabase.from('user_favorite_spots').upsert({ user_id: userId, spot_id: spotId });
      res.json({ success: true, isFavorite: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/spots/conditions?spotIds=id1,id2,id3
router.get('/spots/conditions', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const openMeteo = require('../services/openMeteoService');
    const spotIds = (req.query.spotIds || '').split(',').filter(Boolean);
    if (!spotIds.length) return res.json({ success: true, conditions: {} });

    const { data: spots } = await db.supabase
      .from('spots')
      .select('id, lat, lng')
      .in('id', spotIds);

    const validSpots = (spots || []).filter(s => s.lat && s.lng);
    const conditions = await openMeteo.getConditions(validSpots);
    res.json({ success: true, conditions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── ROUTES PRÉDICTIONS ──────────────────────────────────

// GET /api/v1/predictions/best-windows?userId=X&days=5
// Meilleurs créneaux sur les spots les plus surfés par l'utilisateur
router.get('/predictions/best-windows', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const { collectContext } = require('../services/collector');
    const { getBestWindows } = require('../services/recommender');

    const userId = req.query.userId;
    const days = parseInt(req.query.days) || 5;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });

    const favoriteSpots = await db.getFavoriteSpots(userId);
    if (!favoriteSpots.length) {
      return res.json({ success: true, message: 'Aucun spot favori trouvé', results: [] });
    }

    // Analyser tous les spots favoris (Stormglass payant = pas de limite)
    const spotsToAnalyze = favoriteSpots;
    const results = await Promise.all(
      spotsToAnalyze.map(spot =>
        collectContext(spot.id, userId, days)
          .then(ctx => getBestWindows(ctx, 6))
          .catch(err => ({ spot: { id: spot.id, name: spot.name }, error: err.message, windows: [] }))
      )
    );

    res.json({ success: true, userId, days, results });
  } catch (error) {
    console.error('Erreur best-windows:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/predictions/spot/:spotId?userId=X&days=5
// Prévisions détaillées pour un spot spécifique
router.get('/predictions/spot/:spotId', async (req, res) => {
  try {
    const { collectContext } = require('../services/collector');
    const { getBestWindows } = require('../services/recommender');

    const { spotId } = req.params;
    const userId = req.query.userId;
    const days = parseInt(req.query.days) || 5;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });

    const ctx = await collectContext(spotId, userId, days);
    const result = getBestWindows(ctx, 10);

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur predictions/spot:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/weather/current?lat=X&lng=Y
router.get('/weather/current', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, error: 'lat et lng requis' });
    }

    const stormglassService = require('../services/stormglassService');
    const shomService = require('../services/shomService');

    const weatherData = await stormglassService.getForecast(lat, lng, 1);

    const nowSec = Date.now() / 1000;
    const current = weatherData.forecast && (
      weatherData.forecast.find(p => p.timestamp >= nowSec) || weatherData.forecast[0]
    );

    const degreesToCompass = (deg) => {
      if (deg == null) return '';
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    };

    // Marée — port le plus proche selon longitude
    const shomPort = lng < -1.8 ? 'CPB' : 'BIA'; // Hossegor/Capbreton vs Biarritz/Anglet
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const nowHour = today.getHours();
    let nextTide = null;
    try {
      const tideData = await shomService.getTideData('home_geo', shomPort, dateStr);
      if (tideData) {
        const upcoming = tideData.filter(p => p.hour > nowHour && (p.phase === 'high' || p.phase === 'low'));
        if (upcoming.length > 0) {
          const next = upcoming[0];
          nextTide = {
            phase: next.phase,
            hour: next.hour,
            label: (next.phase === 'high' ? '⬆' : '⬇') + ' ' + String(next.hour).padStart(2, '0') + 'h'
          };
        }
      }
    } catch (e) { /* fallback silencieux */ }

    res.json({
      success: true,
      lat, lng,
      weather: current ? {
        waveHeight:    current.waveHeight,
        windSpeed:     current.windSpeed,
        windDirection: degreesToCompass(current.windDirection),
        wavePeriod:    current.wavePeriod,
        waterTemp:     current.waterTemp != null ? current.waterTemp : null,
        nextTide,
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;