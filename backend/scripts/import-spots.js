#!/usr/bin/env node
/**
 * Import spots from Surfline API into Supabase
 * Usage: node backend/scripts/import-spots.js
 *
 * Targets: France, Spain, Portugal, Morocco
 * Sources: Surfline Taxonomy API + Mapview API
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Surfline country IDs (found via taxonomy root)
const COUNTRY_IDS = {
    'France': '58f7ef3fdadb30820bb5b1b2',
    'Spain': '58f7eef8dadb30820bb56027',
    'Portugal': '58f7ef37dadb30820bb5a7e8',
    'Morocco': '58f7f00ddadb30820bb69bc6',
};

const SLEEP_TAXONOMY = 200;
const SLEEP_MAPVIEW = 400;

// ========================================
// UTILITIES
// ========================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'SurfAI/1.0' } }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)); }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    });
}

function degreesToCardinal(deg) {
    if (deg == null || isNaN(deg)) return null;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeName(name) {
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/^(plage de |praia da |praia de |praia do |beach |playa de |playa )/i, '');
}

function namesMatch(a, b) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    return na === nb || na.includes(nb) || nb.includes(na);
}

// ========================================
// SURFLINE TAXONOMY CRAWL
// ========================================

async function crawlCountry(countryName, countryId) {
    console.log(`\n  📍 ${countryName}...`);
    const spots = [];

    // Get regions
    await sleep(SLEEP_TAXONOMY);
    const countryData = await fetchJSON(
        `https://services.surfline.com/taxonomy?type=taxonomy&id=${countryId}&maxDepth=1`
    );
    const regions = countryData.contains || [];

    for (const region of regions) {
        const regionName = region.name;
        const regionId = region._id;

        // Get subregions/spots within region
        await sleep(SLEEP_TAXONOMY);
        let regionData;
        try {
            regionData = await fetchJSON(
                `https://services.surfline.com/taxonomy?type=taxonomy&id=${regionId}&maxDepth=1`
            );
        } catch (err) {
            console.warn(`    [WARN] Skip region ${regionName}: ${err.message}`);
            continue;
        }

        const children = regionData.contains || [];

        for (const child of children) {
            const coords = child.location?.coordinates;

            if (child.type === 'spot' && coords?.length === 2) {
                // Direct spot under region
                spots.push({
                    surfline_id: child._id,
                    name: child.name,
                    lat: coords[1],
                    lng: coords[0],
                    country: countryName,
                    region: regionName,
                    city: regionName,
                });
            } else if (child.type !== 'spot') {
                // Subregion — go deeper
                await sleep(SLEEP_TAXONOMY);
                let subData;
                try {
                    subData = await fetchJSON(
                        `https://services.surfline.com/taxonomy?type=taxonomy&id=${child._id}&maxDepth=1`
                    );
                } catch (err) {
                    console.warn(`    [WARN] Skip subregion ${child.name}: ${err.message}`);
                    continue;
                }

                const subChildren = subData.contains || [];
                for (const spot of subChildren) {
                    const sc = spot.location?.coordinates;
                    if (spot.type === 'spot' && sc?.length === 2) {
                        spots.push({
                            surfline_id: spot._id,
                            name: spot.name,
                            lat: sc[1],
                            lng: sc[0],
                            country: countryName,
                            region: regionName,
                            city: child.name,
                        });
                    }
                }
            }
        }

        process.stdout.write(`    ${regionName}: ${spots.length} spots total\r`);
    }

    console.log(`    → ${countryName}: ${spots.length} spots`);
    return spots;
}

// ========================================
// MAPVIEW ENRICHMENT
// ========================================

async function enrichWithMapview(spots) {
    // Group by country+region for batched mapview calls
    const byRegion = {};
    for (const spot of spots) {
        const key = `${spot.country}|${spot.region}`;
        if (!byRegion[key]) byRegion[key] = [];
        byRegion[key].push(spot);
    }

    console.log(`\nEnrichissement mapview pour ${Object.keys(byRegion).length} régions...`);
    let enriched = 0;
    let regionCount = 0;

    for (const [regionKey, regionSpots] of Object.entries(byRegion)) {
        regionCount++;
        const lats = regionSpots.map(s => s.lat);
        const lngs = regionSpots.map(s => s.lng);
        const bbox = {
            south: Math.min(...lats) - 0.05,
            north: Math.max(...lats) + 0.05,
            west: Math.min(...lngs) - 0.05,
            east: Math.max(...lngs) + 0.05,
        };

        await sleep(SLEEP_MAPVIEW);
        const url = `https://services.surfline.com/kbyg/mapview?south=${bbox.south}&west=${bbox.west}&north=${bbox.north}&east=${bbox.east}`;

        try {
            const data = await fetchJSON(url);
            const mapSpots = data.data?.spots || [];

            for (const ms of mapSpots) {
                const match = regionSpots.find(s =>
                    s.surfline_id === ms._id ||
                    (haversineDistance(s.lat, s.lng, ms.lat, ms.lon) < 200)
                );
                if (match) {
                    if (ms.abilityLevels?.length) {
                        match.difficulty = ms.abilityLevels.map(l => l.toLowerCase());
                    }
                    if (ms.offshoreDirection != null) {
                        match._ideal_wind_surfline = [degreesToCardinal(ms.offshoreDirection)];
                    }
                    enriched++;
                }
            }
        } catch (err) {
            console.warn(`  [WARN] Mapview failed for ${regionKey}: ${err.message}`);
        }

        process.stdout.write(`  [${regionCount}/${Object.keys(byRegion).length}] ${regionKey}\r`);
    }

    console.log(`\n  Enrichis: ${enriched}/${spots.length} spots`);
    return spots;
}

// ========================================
// SUPABASE IMPORT
// ========================================

async function importToSupabase(spots) {
    // Load existing spots for deduplication
    const { data: existing, error } = await supabase
        .from('spots')
        .select('id, name, lat, lng, surfline_id, ideal_wind, ideal_swell, ideal_tide, shom_port_code');

    if (error) {
        console.error('Failed to load existing spots:', error.message);
        return;
    }

    console.log(`\nSpots existants en BDD: ${existing.length}`);
    console.log(`Spots à importer: ${spots.length}\n`);

    let imported = 0, updated = 0, errors = 0;

    for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        const progress = `[${i + 1}/${spots.length}]`;

        // Find existing match
        let match = null;
        if (spot.surfline_id) {
            match = existing.find(e => e.surfline_id === spot.surfline_id);
        }
        if (!match) {
            match = existing.find(e =>
                e.lat && e.lng &&
                namesMatch(e.name, spot.name) &&
                haversineDistance(e.lat, e.lng, spot.lat, spot.lng) < 500
            );
        }

        // Build data object
        const data = {
            name: spot.name,
            lat: spot.lat,
            lng: spot.lng,
            country: spot.country,
            region: spot.region,
            city: spot.city,
            surfline_id: spot.surfline_id,
        };

        if (spot.difficulty?.length) data.difficulty = spot.difficulty;

        // Only set ideal_wind if not already set manually
        if (spot._ideal_wind_surfline?.length) {
            if (!match || !match.ideal_wind?.length) {
                data.ideal_wind = spot._ideal_wind_surfline;
            }
        }

        try {
            if (match) {
                const { error: upErr } = await supabase
                    .from('spots')
                    .update(data)
                    .eq('id', match.id);
                if (upErr) throw upErr;
                updated++;
                if (updated <= 5 || updated % 50 === 0) {
                    console.log(`${progress} Updated: ${spot.name} (${spot.city}, ${spot.country})`);
                }
            } else {
                const { error: insErr } = await supabase
                    .from('spots')
                    .insert(data);
                if (insErr) throw insErr;
                imported++;
                if (imported <= 10 || imported % 50 === 0) {
                    console.log(`${progress} Imported: ${spot.name} (${spot.city}, ${spot.country})`);
                }
            }
        } catch (err) {
            console.error(`${progress} ERROR: ${spot.name}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\n========================================`);
    console.log(`  RÉSUMÉ IMPORT`);
    console.log(`========================================`);
    console.log(`  Nouveaux:    ${imported}`);
    console.log(`  Mis à jour:  ${updated}`);
    console.log(`  Erreurs:     ${errors}`);
    console.log(`  Total traité: ${spots.length}`);
    console.log(`========================================`);
}

// ========================================
// MAIN
// ========================================

async function main() {
    console.log('🏄 SurfAI — Import Spots Surfline');
    console.log('Pays cibles: France, Spain, Portugal, Morocco\n');

    // Step 1: Crawl taxonomy
    console.log('1/3 Crawl taxonomy Surfline...');
    const allSpots = [];

    for (const [country, id] of Object.entries(COUNTRY_IDS)) {
        try {
            const spots = await crawlCountry(country, id);
            allSpots.push(...spots);
        } catch (err) {
            console.error(`  [ERROR] Failed to crawl ${country}: ${err.message}`);
        }
    }

    console.log(`\n  TOTAL: ${allSpots.length} spots trouvés\n`);

    if (allSpots.length === 0) {
        console.error('Aucun spot trouvé. Vérifiez la connexion.');
        process.exit(1);
    }

    // Step 2: Enrich with mapview
    console.log('2/3 Enrichissement mapview...');
    await enrichWithMapview(allSpots);

    // Step 3: Import to Supabase
    console.log('\n3/3 Import dans Supabase...');
    await importToSupabase(allSpots);

    console.log('\n✅ Import terminé');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
