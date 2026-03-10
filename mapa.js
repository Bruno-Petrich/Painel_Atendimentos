// mapa.js
const CSV_URL = 'PAINEL_BRUNO_ATENDIMENTOS - BASE_ANALITICA (7).csv';
const GEOJSON_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson';
const IBGE_MUN_URL = 'https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/json/municipios.json';

let rawCsvData = [];
let geojsonStates = null;
let ibgeCities = null;

let map = null;
let geojsonLayer = null;
let markersLayer = null;

let stateCounts = {}; 
let cityCounts = {}; 

let maxStateCount = 0;
let currentLevel = 'BR';

// Botão de retorno
const btnVoltarBrasil = document.getElementById('btnVoltarBrasil');
if (btnVoltarBrasil) {
    btnVoltarBrasil.addEventListener('click', () => {
        resetToBrazilMap();
    });
}

async function init() {
    try {
        const loader = document.getElementById('loader');
        loader.innerHTML = '<div class="spinner"></div><p>Sincronizando Malhas Geográficas (IBGE)...</p>';
        
        const [geojsonRes, ibgeRes, csvRes] = await Promise.all([
            fetch(GEOJSON_URL),
            fetch(IBGE_MUN_URL),
            fetch(CSV_URL)
        ]);

        if (!geojsonRes.ok || !ibgeRes.ok || !csvRes.ok) throw new Error("Falha ao baixar os assets do mapa.");

        geojsonStates = await geojsonRes.json();
        const ibgeDataRaw = await ibgeRes.json();
        
        ibgeCities = {};
        for(let city of ibgeDataRaw) {
            ibgeCities[city.codigo_ibge.toString()] = city;
        }

        const csvString = await csvRes.text();
        
        loader.innerHTML = '<div class="spinner"></div><p>Processando Matriz Operacional...</p>';
        
        Papa.parse(csvString, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                rawCsvData = results.data;
                processDataMetrics();
                drawBaseMap();
            }
        });
    } catch(e) {
        console.error("Erro no inicializador do Leaflet:", e);
        document.getElementById('loader').innerHTML = '<p style="color:#ef4444">Erro ao carregar dados geográficos ou CSV.</p>';
    }
}

function getValidRowValue(row) {
    const prev = parseInt(row['Preventiva'] || 0, 10);
    const corr = parseInt(row['Corretiva'] || 0, 10);
    const inst = parseInt(row['Instalacao'] || 0, 10);
    const trei = parseInt(row['Treinamento'] || 0, 10);
    const desc = (row['Atendimento'] || '').trim();

    if (prev === 0 && corr === 0 && inst === 0 && trei === 0 && desc === 'Folga') return 0;

    let rowValue = prev + corr + inst + trei;
    if (rowValue === 0 && desc !== '' && desc !== '0') {
        rowValue = 1; 
    }
    return rowValue;
}

function processDataMetrics() {
    stateCounts = {};
    cityCounts = {};
    maxStateCount = 0;

    rawCsvData.forEach(row => {
        const uf = (row['Estado'] || row['UF'] || '').trim().toUpperCase();
        if (!uf || uf.length !== 2) return;

        const val = getValidRowValue(row);
        if (val > 0) {
            // Agg State
            if (!stateCounts[uf]) stateCounts[uf] = 0;
            stateCounts[uf] += val;
            if (stateCounts[uf] > maxStateCount) maxStateCount = stateCounts[uf];

            // Agg City
            const ibgeCidade = (row['Cod. IBGE Cidade'] || '').trim();
            if (ibgeCidade) {
                if(!cityCounts[ibgeCidade]) cityCounts[ibgeCidade] = { count: 0, uf: uf };
                cityCounts[ibgeCidade].count += val;
            }
        }
    });
}

let cityPolygonsLayer = null;

function getColorForState(volume) {
    if (!volume) return '#1e293b'; // cinza escuro

    // To make it smoother, we'll use a more gradual ramp
    // based on logarithmic scale or smaller percentage steps, 
    // since SP has a huge number compared to others.
    const pct = volume / maxStateCount;
    
    if (pct > 0.8) return '#2dd4bf'; // Soft Emerald 400
    if (pct > 0.4) return '#38bdf8'; // Soft Cyan 400
    if (pct > 0.15) return '#818cf8'; // Soft Indigo 400
    if (pct > 0.05) return '#6366f1'; // Indigo 500
    if (pct > 0.01) return '#4f46e5'; // Indigo 600
    return '#312e81'; // Indigo 900
}

function getColorForCity(volume) {
    if (!volume) return '#0f172a'; // slate-900 (bem escuro p/ cidades sem atendimento)
    if (volume > 50) return '#ec4899'; // Rosa forte
    if (volume > 20) return '#f472b6'; // Rosa medio
    if (volume > 5) return '#fbcfe8';  // Rosa claro
    return '#fdf2f8'; // Rosa mto claro
}

function drawBaseMap() {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('mapContainer').classList.remove('hidden');

    if (!map) {
        map = L.map('regions_div', {
            zoomControl: true,
            minZoom: 4,
            maxZoom: 10
        }).setView([-14.235, -51.925], 4); 

        // Removing tile layer to ONLY show Brazil
        // Add dark background via JS just to be sure
        document.getElementById('regions_div').style.backgroundColor = '#0f172a';

        markersLayer = L.layerGroup().addTo(map);
    }

    renderBRLevel();
}

function renderBRLevel() {
    currentLevel = 'BR';
    document.getElementById('mapTitle').textContent = 'Volume de Atendimentos por Unidade Federativa';
    btnVoltarBrasil.classList.add('hidden');
    markersLayer.clearLayers();

    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }

    geojsonLayer = L.geoJSON(geojsonStates, {
        style: function(feature) {
            const sigla = feature.properties.sigla; 
            const vol = stateCounts[sigla] || 0;
            const isDrilled = (currentLevel !== 'BR');
            
            if (isDrilled && currentLevel === sigla) {
                return {
                    fillColor: 'transparent',
                    weight: 2,
                    opacity: 1,
                    color: '#ffffff',
                    fillOpacity: 0
                };
            }
            
            return {
                fillColor: getColorForState(vol),
                weight: 1,
                opacity: 1,
                color: '#ffffff', // borda branca 
                fillOpacity: isDrilled ? 0.1 : (vol > 0 ? 0.75 : 0.3)
            };
        },
        onEachFeature: function(feature, layer) {
            const sigla = feature.properties.sigla;
            const nome = feature.properties.name;
            const vol = stateCounts[sigla] || 0;

            const tooltipHTML = `<div style="text-align:center;">
                <strong>${nome} (${sigla})</strong><br/>
                ${vol} Atendimentos mapeados
            </div>`;
            layer.bindTooltip(tooltipHTML);

            layer.on({
                mouseover: (e) => {
                    if (currentLevel !== 'BR') return; // Bloquear hover no estado se estiver navagando nas cidades
                    const l = e.target;
                    l.setStyle({ weight: 2, color: '#ffffff', fillOpacity: 1 });
                    l.bringToFront();
                },
                mouseout: (e) => {
                    if (currentLevel !== 'BR') return;
                    geojsonLayer.resetStyle(e.target);
                },
                click: (e) => {
                    if (currentLevel !== 'BR') return; // Bloquear duplo clique
                    if (vol > 0) drillDownToState(sigla, e.target.getBounds());
                }
            });
        }
    }).addTo(map);

    map.setView([-14.235, -51.925], 4.5);
}

async function drillDownToState(sigla, bounds) {
    currentLevel = sigla;
    document.getElementById('mapTitle').textContent = `Atendimentos em Cidades Georeferenciadas - ${sigla}`;
    btnVoltarBrasil.classList.remove('hidden');
    
    // Zoom in on State
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 9 });

    // Clean previous markers and polygons
    markersLayer.clearLayers();
    if (cityPolygonsLayer) {
        map.removeLayer(cityPolygonsLayer);
    }

    // Refresh state opacity (dims other states, makes selected transparent)
    if (geojsonLayer) {
        geojsonLayer.setStyle(function(feature) {
            const s = feature.properties.sigla;
            const vol = stateCounts[s] || 0;
            if (s === sigla) {
                return {
                    fillColor: 'transparent',
                    weight: 2,
                    opacity: 1,
                    color: '#ffffff',
                    fillOpacity: 0
                };
            }
            return {
                fillColor: getColorForState(vol),
                weight: 1,
                opacity: 1,
                color: '#ffffff', // manter borda branca 
                fillOpacity: 0.1 // Let the city polygons build the state
            };
        });

        // Unbind tooltips from all states so they don't hover-overlap city tooltips
        geojsonLayer.eachLayer(function(layer) {
            layer.unbindTooltip();
        });
    }

    try {
        const loader = document.getElementById('loader');
        loader.innerHTML = '<div class="spinner"></div><p>Carregando contornos das cidades...</p>';
        loader.classList.remove('hidden');
        document.getElementById('mapContainer').style.opacity = '0.5';

        const res = await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${sigla}?formato=application/vnd.geo+json&intrarregiao=municipio`);
        const cityGeoJson = await res.json();
        
        loader.classList.add('hidden');
        document.getElementById('mapContainer').style.opacity = '1';

        cityPolygonsLayer = L.geoJSON(cityGeoJson, {
            style: function(feature) {
                const ibgeCode = feature.properties.codarea;
                const dataInfo = cityCounts[ibgeCode] || { count: 0 };
                const vol = dataInfo.count;
                return {
                    fillColor: getColorForCity(vol),
                    weight: 1,
                    opacity: 1,
                    color: '#ffffff', // borda branca nas cidades
                    fillOpacity: vol > 0 ? 0.8 : 0.4
                };
            },
            onEachFeature: function(feature, layer) {
                const ibgeCode = feature.properties.codarea;
                const cityInfo = ibgeCities[ibgeCode];
                const nome = cityInfo ? cityInfo.nome : ibgeCode;
                const dataInfo = cityCounts[ibgeCode] || { count: 0 };
                const vol = dataInfo.count;

                const tooltipHTML = `<div style="text-align:center;">
                    <strong>${nome} - ${sigla}</strong><br/>
                    <span style="color:${vol>0?'var(--accent-pink)':'#94a3b8'}; font-size:1.2rem; font-weight:bold;">${vol}</span> atendimentos
                </div>`;
                layer.bindTooltip(tooltipHTML);

                layer.on({
                    mouseover: (e) => {
                        const l = e.target;
                        l.setStyle({ weight: 2, color: '#ffffff', fillOpacity: vol > 0 ? 1 : 0.6 });
                        l.bringToFront();
                    },
                    mouseout: (e) => cityPolygonsLayer.resetStyle(e.target)
                });
            }
        }).addTo(map);

    } catch (err) {
        console.error(err);
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('mapContainer').style.opacity = '1';
    }
}

function resetToBrazilMap() {
    if (cityPolygonsLayer) {
        map.removeLayer(cityPolygonsLayer);
        cityPolygonsLayer = null;
    }
    renderBRLevel();
}

function resetToBrazilMap() {
    renderBRLevel();
}

// Inicia
init();
