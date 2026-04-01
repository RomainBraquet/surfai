// 🗄️ Service Supabase pour SurfAI
// Accès centralisé à la base de données

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant dans .env');
}

// Client avec service key (accès complet, côté serveur uniquement)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('✅ Service Supabase initialisé');

// ─── SPOTS ───────────────────────────────────────────────

async function getSpots() {
  const { data, error } = await supabase.from('spots').select('*').order('name');
  if (error) throw new Error(`Erreur spots: ${error.message}`);
  return data;
}

async function getSpotById(spotId) {
  const { data, error } = await supabase.from('spots').select('*').eq('id', spotId).single();
  if (error) throw new Error(`Spot introuvable: ${error.message}`);
  return data;
}

// ─── SESSIONS ────────────────────────────────────────────

async function getSessions(userId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, spots(name, city, region)')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw new Error(`Erreur sessions: ${error.message}`);
  return data;
}

async function getAllSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, spots(name, city, region)')
    .order('date', { ascending: false });
  if (error) throw new Error(`Erreur sessions: ${error.message}`);
  return data;
}

async function createSession(sessionData) {
  const { data, error } = await supabase
    .from('sessions')
    .insert(sessionData)
    .select()
    .single();
  if (error) throw new Error(`Erreur création session: ${error.message}`);
  return data;
}

// ─── PROFIL ──────────────────────────────────────────────

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`Erreur profil: ${error.message}`);
  return data;
}

async function upsertProfile(userId, profileData) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...profileData, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(`Erreur upsert profil: ${error.message}`);
  return data;
}

// ─── BOARDS ──────────────────────────────────────────────

async function getBoards(userId) {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(`Erreur boards: ${error.message}`);
  return data;
}

// ─── WEATHER CACHE ───────────────────────────────────────

async function getWeatherCache(spotId) {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('weather_cache')
    .select('*')
    .eq('spot_id', spotId)
    .gte('cached_at', sixHoursAgo)
    .order('cached_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

async function setWeatherCache(spotId, weatherData) {
  const { error } = await supabase
    .from('weather_cache')
    .upsert({ spot_id: spotId, data: weatherData, cached_at: new Date().toISOString() });
  if (error) console.warn('⚠️ Erreur cache météo:', error.message);
}

// ─── ANALYSE IA ──────────────────────────────────────────

async function getSessionsWithMeteo(userId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, spots(name, city, ideal_wind, ideal_swell, ideal_tide)')
    .eq('user_id', userId)
    .not('meteo', 'is', null)
    .order('date', { ascending: false });
  if (error) throw new Error(`Erreur sessions meteo: ${error.message}`);
  return data;
}

// ─── TIDE CACHE ──────────────────────────────────────────

async function getTideCache(spotId, date) {
  const { data, error } = await supabase
    .from('tide_cache')
    .select('data, cached_at')
    .eq('spot_id', spotId)
    .eq('date', date)
    .single();
  if (error) return null;
  // Invalider si > 12h
  const age = Date.now() - new Date(data.cached_at).getTime();
  if (age > 12 * 60 * 60 * 1000) return null;
  return data.data;
}

async function setTideCache(spotId, date, tideData) {
  const { error } = await supabase
    .from('tide_cache')
    .upsert({ spot_id: spotId, date, data: tideData, cached_at: new Date().toISOString() });
  if (error) console.warn('⚠️ Erreur cache marée:', error.message);
}

// ─── FAVORITE SPOTS ──────────────────────────────────────

async function getFavoriteSpots(userId) {
  // Top 5 spots les plus surfés par cet utilisateur
  const { data, error } = await supabase
    .from('sessions')
    .select('spot_id, spots(id, name, city, lat, lng, ideal_wind, ideal_swell, ideal_tide, shom_port_code)')
    .eq('user_id', userId)
    .not('spot_id', 'is', null);
  if (error) throw new Error(`Erreur favorite spots: ${error.message}`);
  // Compter par spot_id
  const counts = {};
  data.forEach(s => {
    if (!s.spot_id) return;
    counts[s.spot_id] = counts[s.spot_id] || { count: 0, spot: s.spots };
    counts[s.spot_id].count++;
  });
  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(e => e.spot)
    .filter(Boolean);
}

async function updateSession(sessionId, userId, updates) {
  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw new Error(`Erreur mise à jour session: ${error.message}`);
  return data;
}

async function deleteSession(sessionId, userId) {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (error) throw new Error(`Erreur suppression session: ${error.message}`);
  return true;
}

// ─── EMAIL PREDICTIONS ──────────────────────────────────

async function getProfilesWithEmailPredictions() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email_predictions', true);
  if (error) throw new Error(`Erreur profiles email_predictions: ${error.message}`);
  return data || [];
}

async function updateProfileEmail(userId, email) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(`Erreur updateProfileEmail: ${error.message}`);
  return data;
}

module.exports = {
  supabase,
  getSpots,
  getAllSessions,
  getSpotById,
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  getProfile,
  upsertProfile,
  getBoards,
  getWeatherCache,
  setWeatherCache,
  getSessionsWithMeteo,
  getTideCache,
  setTideCache,
  getFavoriteSpots,
  getProfilesWithEmailPredictions,
  updateProfileEmail,
};
