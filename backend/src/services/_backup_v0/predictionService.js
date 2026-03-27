// 🎯 Service de prédiction intelligente pour SurfAI
// Analyse les conditions et prédit la qualité des sessions

class PredictionService {
  constructor() {
    console.log('🎯 Service de prédiction initialisé');
  }

  // 🏄‍♂️ Prédire la qualité d'une session selon les conditions et le niveau
  async predictSessionQuality(conditions) {
    const { 
      wave_height, 
      wave_period, 
      wind_speed, 
      wind_direction, 
      user_level = 'intermediate',
      swell_height,
      swell_period 
    } = conditions;

    console.log('🎯 Prédiction qualité pour:', { wave_height, wind_speed, user_level });

    // Validation des données essentielles
    if (!wave_height || !wind_speed) {
      throw new Error('wave_height et wind_speed sont requis pour la prédiction');
    }

    // Calcul de score basé sur le niveau utilisateur
    const levelWeights = this.getLevelWeights(user_level);
    let score = 1;
    let factors = {};
    let recommendations = [];

    // 🌊 Analyse hauteur de vagues
    const waveScore = this.analyzeWaveHeight(wave_height, user_level);
    score += waveScore.score * levelWeights.wave;
    factors.wave = waveScore;

    // 💨 Analyse conditions de vent
    const windScore = this.analyzeWind(wind_speed, wind_direction);
    score += windScore.score * levelWeights.wind;
    factors.wind = windScore;

    // 🌊 Analyse période de vagues (si disponible)
    if (wave_period) {
      const periodScore = this.analyzePeriod(wave_period);
      score += periodScore.score * levelWeights.period;
      factors.period = periodScore;
    }

    // 🌊 Analyse houle (si disponible)
    if (swell_height && swell_period) {
      const swellScore = this.analyzeSwell(swell_height, swell_period);
      score += swellScore.score * levelWeights.swell;
      factors.swell = swellScore;
    }

    // Normaliser le score final
    const finalScore = Math.min(5, Math.max(1, score));
    
    // Générer recommandations
    recommendations = this.generateRecommendations(factors, user_level, finalScore);

    // Calculer la confiance de la prédiction
    const confidence = this.calculateConfidence(factors);

    return {
      score: Math.round(finalScore * 10) / 10,
      rating: this.getScoreRating(finalScore),
      confidence: confidence,
      factors: factors,
      recommendations: recommendations,
      user_level: user_level,
      timestamp: new Date().toISOString()
    };
  }

  // 🎚️ Poids selon le niveau du surfeur
  getLevelWeights(level) {
    const weights = {
      beginner: {
        wave: 0.4,     // Priorité sécurité
        wind: 0.3,     
        period: 0.1,   
        swell: 0.1,
        safety: 0.1
      },
      intermediate: {
        wave: 0.35,
        wind: 0.25,
        period: 0.2,
        swell: 0.15,
        safety: 0.05
      },
      advanced: {
        wave: 0.3,
        wind: 0.2,
        period: 0.25,
        swell: 0.2,
        safety: 0.05
      },
      expert: {
        wave: 0.25,    // Plus technique
        wind: 0.15,
        period: 0.3,   // Période importante
        swell: 0.25,   
        safety: 0.05
      }
    };

    return weights[level] || weights.intermediate;
  }

  // 🌊 Analyser hauteur de vagues
  analyzeWaveHeight(height, level) {
    let score = 0;
    let analysis = '';

    // Optimales selon niveau
    const optimal = {
      beginner: [0.5, 1.2],
      intermediate: [0.8, 2.0],
      advanced: [1.2, 3.0],
      expert: [1.5, 5.0]
    };

    const [min, max] = optimal[level] || optimal.intermediate;

    if (height >= min && height <= max) {
      score = 2.5;
      analysis = `Hauteur parfaite pour votre niveau (${height}m)`;
    } else if (height >= min * 0.7 && height <= max * 1.3) {
      score = 1.5;
      analysis = `Hauteur correcte (${height}m)`;
    } else if (height < min) {
      score = height >= min * 0.5 ? 0.5 : 0;
      analysis = `Vagues trop petites (${height}m)`;
    } else {
      score = height <= max * 1.5 ? 0.5 : 0;
      analysis = `Vagues trop grosses (${height}m)`;
    }

    return { score, analysis, optimal: `${min}-${max}m` };
  }

  // 💨 Analyser conditions de vent
  analyzeWind(speed, direction) {
    let score = 0;
    let analysis = '';

    // Conversion en km/h si nécessaire
    const speedKmh = speed > 50 ? speed : speed * 3.6;

    if (speedKmh < 10) {
      score = 2.5;
      analysis = `Vent très léger (${Math.round(speedKmh)}km/h) - conditions glassy`;
    } else if (speedKmh < 20) {
      score = 2;
      analysis = `Vent léger (${Math.round(speedKmh)}km/h) - bonnes conditions`;
    } else if (speedKmh < 30) {
      score = 1;
      analysis = `Vent modéré (${Math.round(speedKmh)}km/h) - conditions moyennes`;
    } else if (speedKmh < 40) {
      score = 0.5;
      analysis = `Vent fort (${Math.round(speedKmh)}km/h) - conditions difficiles`;
    } else {
      score = 0;
      analysis = `Vent très fort (${Math.round(speedKmh)}km/h) - évitez`;
    }

    // Bonus/malus selon direction si fournie
    if (direction) {
      // TODO: Implémenter analyse direction selon spot
      analysis += ` (${this.getWindDirectionName(direction)})`;
    }

    return { score, analysis, speedKmh: Math.round(speedKmh) };
  }

  // 🌊 Analyser période de vagues
  analyzePeriod(period) {
    let score = 0;
    let analysis = '';

    if (period >= 12) {
      score = 2;
      analysis = `Excellente période (${period}s) - vagues puissantes`;
    } else if (period >= 8) {
      score = 1.5;
      analysis = `Bonne période (${period}s) - vagues organisées`;
    } else if (period >= 6) {
      score = 1;
      analysis = `Période moyenne (${period}s) - vagues correctes`;
    } else {
      score = 0.5;
      analysis = `Période courte (${period}s) - vagues chaotiques`;
    }

    return { score, analysis };
  }

  // 🌊 Analyser houle
  analyzeSwell(height, period) {
    let score = 0;
    let analysis = '';

    // Ratio houle/période
    const ratio = height / period;

    if (ratio < 0.1 && period > 10) {
      score = 2;
      analysis = `Houle longue et organisée (${height}m/${period}s)`;
    } else if (ratio < 0.15) {
      score = 1.5;
      analysis = `Houle correcte (${height}m/${period}s)`;
    } else {
      score = 1;
      analysis = `Houle courte (${height}m/${period}s)`;
    }

    return { score, analysis };
  }

  // 🎯 Générer recommandations personnalisées
  generateRecommendations(factors, level, score) {
    const recommendations = [];

    // Recommandations générales selon score
    if (score >= 4.5) {
      recommendations.push('🏄‍♂️ Conditions excellentes ! Foncez à l\'eau !');
    } else if (score >= 3.5) {
      recommendations.push('👍 Bonnes conditions pour une session sympa');
    } else if (score >= 2.5) {
      recommendations.push('🤔 Conditions moyennes, restez prudent');
    } else {
      recommendations.push('❌ Conditions défavorables, mieux vaut attendre');
    }

    // Recommandations spécifiques
    if (factors.wave && factors.wave.score < 1) {
      if (level === 'beginner') {
        recommendations.push('📚 Profitez-en pour réviser la théorie');
      } else {
        recommendations.push('🏋️ Bon moment pour l\'entraînement physique');
      }
    }

    if (factors.wind && factors.wind.speedKmh > 25) {
      recommendations.push('🌬️ Vent fort - prenez une planche plus petite');
    }

    if (factors.period && factors.period.score > 1.5) {
      recommendations.push('🌊 Période excellente - sortez votre gun !');
    }

    // Recommandations sécurité pour débutants
    if (level === 'beginner' && score > 3) {
      recommendations.push('🔰 Surfez accompagné et restez près du bord');
    }

    return recommendations;
  }

  // 📊 Calculer confiance de la prédiction
  calculateConfidence(factors) {
    let confidence = 0.5; // Base
    let factorsCount = 0;

    // Plus on a de données, plus on est confiant
    Object.values(factors).forEach(factor => {
      if (factor && factor.score !== undefined) {
        confidence += 0.15;
        factorsCount++;
      }
    });

    // Bonus si données complètes
    if (factorsCount >= 3) {
      confidence += 0.1;
    }

    return Math.min(0.95, Math.max(0.3, confidence));
  }

  // ⭐ Convertir score en rating
  getScoreRating(score) {
    if (score >= 4.5) return 'Excellent';
    if (score >= 3.5) return 'Très bon';
    if (score >= 2.5) return 'Bon';
    if (score >= 1.5) return 'Moyen';
    return 'Médiocre';
  }

  // 🧭 Nom direction du vent
  getWindDirectionName(degrees) {
    const directions = [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  }

  // 🔄 Traiter données de prévisions pour enrichissement
  async processForecastData(forecastData, userLevel = 'intermediate') {
    if (!forecastData || !forecastData.forecast) {
      return forecastData;
    }

    console.log(`🔄 Enrichissement prévisions pour niveau: ${userLevel}`);

    // Enrichir chaque point avec prédiction personnalisée
    const enrichedForecast = await Promise.all(
      forecastData.forecast.map(async (point) => {
        if (!point.waveHeight || !point.windSpeed) {
          return point;
        }

        try {
          const prediction = await this.predictSessionQuality({
            wave_height: point.waveHeight,
            wave_period: point.wavePeriod,
            wind_speed: point.windSpeed,
            wind_direction: point.windDirection,
            user_level: userLevel,
            swell_height: point.swellHeight,
            swell_period: point.swellPeriod
          });

          return {
            ...point,
            prediction: {
              personalizedScore: prediction.score,
              rating: prediction.rating,
              confidence: prediction.confidence,
              mainRecommendation: prediction.recommendations[0]
            }
          };
        } catch (error) {
          console.warn('⚠️ Erreur enrichissement point:', error.message);
          return point;
        }
      })
    );

    return {
      ...forecastData,
      forecast: enrichedForecast,
      userLevel: userLevel,
      enriched: true
    };
  }
}

// Export instance singleton
module.exports = new PredictionService();