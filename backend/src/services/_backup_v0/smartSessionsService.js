// 🧠 Service d'analyse intelligente des créneaux de surf
// Divise la journée en créneaux optimaux et sélectionne les meilleures heures

class SmartSessionsService {
  constructor() {
    console.log('🧠 Service SmartSessions initialisé');
    
    // Définition des créneaux de surf réalistes
    this.surfSlots = [
      {
        name: 'Aube',
        emoji: '🌅',
        startHour: 6,
        endHour: 9,
        description: 'Conditions souvent calmes, vent faible',
        bonusFactors: {
          lowWind: 1.3,      // Bonus si vent < 10km/h
          glassy: 1.2,       // Bonus conditions glass
          uncrowded: 1.1     // Moins de monde
        }
      },
      {
        name: 'Matinée',
        emoji: '🌞',
        startHour: 9,
        endHour: 12,
        description: 'Souvent optimal, avant que le vent se lève',
        bonusFactors: {
          optimalWind: 1.4,  // Bonus vent 5-15km/h
          goodSwell: 1.3,    // Bonus houle organisée
          classic: 1.2       // Créneau classique
        }
      },
      {
        name: 'Après-midi',
        emoji: '☀️',
        startHour: 12,
        endHour: 17,
        description: 'Vent plus fort, conditions variables',
        bonusFactors: {
          bigWaves: 1.2,     // Bonus si grosses vagues (>2m)
          offshore: 1.4,     // Bonus vent offshore
          advanced: 1.1      // Pour surfeurs avancés
        }
      },
      {
        name: 'Soirée',
        emoji: '🌇',
        startHour: 17,
        endHour: 20,
        description: 'Vent qui retombe, glass-off possible',
        bonusFactors: {
          glassOff: 1.5,     // Bonus glass-off
          sunset: 1.2,       // Bonus coucher de soleil
          magical: 1.1       // Ambiance
        }
      }
    ];
  }

  // 🎯 Analyser les prévisions et extraire les meilleurs créneaux
  async analyzeOptimalSlots(forecastData, userLevel = 'intermediate', spot = 'Biarritz') {
    console.log(`🧠 Analyse créneaux optimaux pour ${spot} (niveau: ${userLevel})`);
    
    if (!forecastData || !forecastData.forecast) {
      throw new Error('Données de prévision manquantes');
    }

    const days = this.groupForecastByDays(forecastData.forecast);
    const optimalSlots = [];

    // Analyser chaque jour
    for (const [dateKey, dayForecast] of Object.entries(days)) {
      const daySlots = this.analyzeDaySlots(dayForecast, userLevel, spot, dateKey);
      optimalSlots.push(...daySlots);
    }

    // Trier par score et garder les meilleurs
    const bestSlots = optimalSlots
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 12); // Top 12 créneaux

    return {
      success: true,
      spot: spot,
      userLevel: userLevel,
      totalSlots: optimalSlots.length,
      optimalSlots: bestSlots,
      analysis: this.generateSlotAnalysis(bestSlots),
      meta: {
        analyzedDays: Object.keys(days).length,
        algorithm: 'smart-slots-v1',
        timestamp: new Date().toISOString()
      }
    };
  }

  // 📅 Grouper les prévisions par jour
  groupForecastByDays(forecast) {
    const days = {};
    
    forecast.forEach(point => {
      const date = new Date(point.time);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!days[dateKey]) {
        days[dateKey] = [];
      }
      days[dateKey].push(point);
    });

    return days;
  }

  // 🎯 Analyser les créneaux d'une journée
  analyzeDaySlots(dayForecast, userLevel, spot, dateKey) {
    const daySlots = [];
    const date = new Date(dateKey);
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    // Analyser chaque créneau de la journée
    this.surfSlots.forEach(slot => {
      const slotForecast = this.getSlotForecast(dayForecast, slot);
      
      if (slotForecast.length === 0) return; // Pas de données pour ce créneau

      const optimalPoint = this.findOptimalPointInSlot(slotForecast, slot, userLevel);
      const slotAnalysis = this.analyzeSlot(slotForecast, slot, userLevel);
      
      if (optimalPoint) {
        daySlots.push({
          date: dateKey,
          dayName: dayName,
          slot: slot,
          optimalTime: optimalPoint.time,
          optimalHour: new Date(optimalPoint.time).getHours(),
          conditions: {
            waveHeight: optimalPoint.waveHeight,
            wavePeriod: optimalPoint.wavePeriod,
            windSpeed: optimalPoint.windSpeed,
            windDirection: optimalPoint.windDirection,
            offshore: optimalPoint.offshore
          },
          scores: {
            baseScore: optimalPoint.prediction?.personalizedScore || optimalPoint.quality,
            slotBonus: slotAnalysis.slotBonus,
            compositeScore: slotAnalysis.compositeScore,
            confidence: optimalPoint.prediction?.confidence || 0.8
          },
          tide: this.calculateTide(new Date(optimalPoint.time)),
          recommendation: this.generateSlotRecommendation(slotAnalysis, slot, userLevel),
          analysis: slotAnalysis
        });
      }
    });

    return daySlots;
  }

  // 🔍 Récupérer les données d'un créneau
  getSlotForecast(dayForecast, slot) {
    return dayForecast.filter(point => {
      const hour = new Date(point.time).getHours();
      return hour >= slot.startHour && hour < slot.endHour;
    });
  }

  // 🎯 Trouver le meilleur point dans un créneau
  findOptimalPointInSlot(slotForecast, slot, userLevel) {
    if (slotForecast.length === 0) return null;

    // Calculer un score composite pour chaque point
    const scoredPoints = slotForecast.map(point => {
      const baseScore = point.prediction?.personalizedScore || point.quality || 1;
      const slotBonuses = this.calculateSlotBonuses(point, slot, userLevel);
      const compositeScore = baseScore * slotBonuses;

      return {
        ...point,
        slotBonuses,
        compositeScore
      };
    });

    // Retourner le meilleur point
    return scoredPoints.sort((a, b) => b.compositeScore - a.compositeScore)[0];
  }

  // 🎁 Calculer les bonus spécifiques au créneau
  calculateSlotBonuses(point, slot, userLevel) {
    let bonusMultiplier = 1.0;
    const bonuses = [];

    // Bonus vent faible pour créneaux calmes
    if (point.windSpeed < 10 && slot.bonusFactors.lowWind) {
      bonusMultiplier *= slot.bonusFactors.lowWind;
      bonuses.push('Vent faible');
    }

    // Bonus vent optimal
    if (point.windSpeed >= 5 && point.windSpeed <= 15 && slot.bonusFactors.optimalWind) {
      bonusMultiplier *= slot.bonusFactors.optimalWind;
      bonuses.push('Vent optimal');
    }

    // Bonus offshore
    if (point.offshore && slot.bonusFactors.offshore) {
      bonusMultiplier *= slot.bonusFactors.offshore;
      bonuses.push('Vent offshore');
    }

    // Bonus grosses vagues
    if (point.waveHeight > 2 && slot.bonusFactors.bigWaves) {
      bonusMultiplier *= slot.bonusFactors.bigWaves;
      bonuses.push('Grosses vagues');
    }

    // Bonus période longue
    if (point.wavePeriod > 12 && slot.bonusFactors.goodSwell) {
      bonusMultiplier *= slot.bonusFactors.goodSwell;
      bonuses.push('Houle organisée');
    }

    // Bonus selon créneau
    if (slot.bonusFactors.classic) {
      bonusMultiplier *= slot.bonusFactors.classic;
      bonuses.push(slot.description);
    }

    return {
      multiplier: bonusMultiplier,
      factors: bonuses
    };
  }

  // 📊 Analyser un créneau complet
  analyzeSlot(slotForecast, slot, userLevel) {
    const avgWaveHeight = slotForecast.reduce((sum, p) => sum + (p.waveHeight || 0), 0) / slotForecast.length;
    const avgWindSpeed = slotForecast.reduce((sum, p) => sum + (p.windSpeed || 0), 0) / slotForecast.length;
    const offshoreCount = slotForecast.filter(p => p.offshore).length;
    
    let slotBonus = 1.0;
    const bonusReasons = [];

    // Bonus conditions stables
    const waveStability = this.calculateStability(slotForecast.map(p => p.waveHeight));
    if (waveStability > 0.8) {
      slotBonus *= 1.1;
      bonusReasons.push('Vagues stables');
    }

    // Bonus majorité offshore
    if (offshoreCount > slotForecast.length / 2) {
      slotBonus *= 1.2;
      bonusReasons.push('Majoritairement offshore');
    }

    return {
      slotBonus,
      bonusReasons,
      compositeScore: (avgWaveHeight * 2 + (20 - avgWindSpeed) / 10) * slotBonus,
      stability: waveStability,
      avgConditions: {
        waveHeight: Math.round(avgWaveHeight * 10) / 10,
        windSpeed: Math.round(avgWindSpeed)
      }
    };
  }

  // 📈 Calculer stabilité des conditions
  calculateStability(values) {
    if (values.length < 2) return 1;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Stabilité inversement proportionnelle à l'écart-type
    return Math.max(0, 1 - (standardDeviation / mean));
  }

  // 🌊 Calculer marée simulée
  calculateTide(date) {
    const hour = date.getHours();
    const tidePhase = Math.floor(hour / 6) % 2 === 0 ? 'Montante' : 'Descendante';
    const tideHeight = (1.5 + Math.sin(hour * Math.PI / 6) * 1.2).toFixed(1);
    
    return {
      phase: tidePhase,
      height: parseFloat(tideHeight),
      coefficient: Math.round(50 + Math.sin(date.getDate() * Math.PI / 15) * 40) // Coeff simulé
    };
  }

  // 💬 Générer recommandation pour un créneau
  generateSlotRecommendation(analysis, slot, userLevel) {
    const score = analysis.compositeScore;
    const stability = analysis.stability;
    
    if (score >= 4.5) {
      return `🏄‍♂️ ${slot.emoji} Session exceptionnelle prévue ! ${slot.name} parfait pour ${userLevel}`;
    } else if (score >= 3.5) {
      return `👍 ${slot.emoji} Excellente session en ${slot.name.toLowerCase()}. ${slot.description}`;
    } else if (score >= 2.5) {
      return `🤔 ${slot.emoji} Session correcte possible en ${slot.name.toLowerCase()}`;
    } else {
      return `⏳ ${slot.emoji} Mieux vaut attendre un autre créneau`;
    }
  }

  // 📊 Générer analyse globale
  generateSlotAnalysis(bestSlots) {
    if (bestSlots.length === 0) {
      return {
        summary: 'Aucun créneau optimal détecté',
        bestDay: null,
        bestSlot: null,
        avgScore: 0
      };
    }

    const bestSlot = bestSlots[0];
    const avgScore = bestSlots.reduce((sum, slot) => sum + slot.scores.compositeScore, 0) / bestSlots.length;
    
    // Analyser quel créneau est le plus souvent optimal
    const slotCounts = {};
    bestSlots.forEach(slot => {
      const slotName = slot.slot.name;
      slotCounts[slotName] = (slotCounts[slotName] || 0) + 1;
    });
    
    const mostFrequentSlot = Object.keys(slotCounts).reduce((a, b) => 
      slotCounts[a] > slotCounts[b] ? a : b
    );

    return {
      summary: `${bestSlots.length} créneaux optimaux détectés`,
      bestSession: {
        date: bestSlot.dayName,
        slot: `${bestSlot.slot.emoji} ${bestSlot.slot.name}`,
        time: new Date(bestSlot.optimalTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        score: bestSlot.scores.compositeScore.toFixed(1)
      },
      patterns: {
        mostFrequentSlot: mostFrequentSlot,
        avgScore: avgScore.toFixed(1),
        totalDays: new Set(bestSlots.map(s => s.date)).size
      },
      recommendation: bestSlot.recommendation
    };
  }
}

// Export instance singleton
module.exports = new SmartSessionsService();