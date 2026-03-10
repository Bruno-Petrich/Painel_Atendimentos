// Configurações e Globais
let dashboardData = [];
let charts = {};

// Elementos da DOM
const loader = document.getElementById('loader');
const grid = document.getElementById('dashboardGrid');

let drilldownState = {
    level: 'year', // 'year', 'month', 'day'
    selectedYear: null,
    selectedMonth: null
};

let globalFilters = {
    date: null,
    uf: null,
    service: null,
    os: null,
    search: ''
};

// Estruturas globais para Gráficos
let drilldownData = {}; // year -> month -> day
let typeData = {};
let ufData = {};
let osData = {};

// Configuração padrão do Chart.js para Dark Theme
Chart.register(ChartDataLabels);
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.plugins.datalabels.color = '#ffffff';

// Tentar carregar automaticamente o arquivo se ele estiver na mesma pasta (via fetch)
document.addEventListener('DOMContentLoaded', () => {
    const fileName = 'PAINEL_BRUNO_ATENDIMENTOS - BASE_ANALITICA (7).csv';
    
    // Listener de busca central
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            globalFilters.search = e.target.value;
            applyGlobalFilter();
        });
    }

    fetch(fileName)
        .then(response => {
            if(!response.ok) throw new Error("Aviso de bloqueio CORS ou arquivo não encontrado (Normal rodando local).");
            return response.text();
        })
        .then(csvText => {
            processCSV(csvText);
        })
        .catch(err => {
            console.log("Erro no carregamento automático do CSV:", err.message);
            loader.innerHTML = '<p style="color:red">Erro: Servidor local necessário para auto-loading ou CSV ausente.</p>';
        });

    // Lógica do Modal
    const closeModalBtn = document.getElementById('closeModalBtn');
    if(closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            document.getElementById('dayModal').classList.add('hidden');
        });
    }
    
    // Fechar ao clicar fora
    const dayModal = document.getElementById('dayModal');
    if(dayModal) {
        dayModal.addEventListener('click', (e) => {
            if (e.target === dayModal) dayModal.classList.add('hidden');
        });
    }
});

function openDayDetailsModal(dateStr) {
    const modal = document.getElementById('dayModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = `Atendimentos do dia ${dateStr}`;
    modalBody.innerHTML = '';
    
    // Filtrar dados reais daquele dia baseados no dataset original total ou do filtro atual? 
    // Vamos buscar no dashboardData raw para não interagir com duplo clique (Se já buscou algo, talvez já esteja cortado)
    let dayData = dashboardData.filter(row => row['Data'] === dateStr);
    
    // Se quiser respeitar a busca de texto atual:
    if (globalFilters.search && globalFilters.search.trim() !== '') {
        const term = globalFilters.search.toLowerCase();
        dayData = dayData.filter(row => (row['Atendimento'] || '').toLowerCase().includes(term));
    }
    
    if (dayData.length === 0) {
        modalBody.innerHTML = '<p>Nenhum atendimento operado neste dia com os parâmetros atuais.</p>';
    } else {
        dayData.forEach(row => {
            const texto = row['Atendimento'] || 'Sem descrição detalhada inserida na base.';
            const demandante = row['Demandante'] && row['Demandante'] !== '0' ? row['Demandante'] : 'Não especificado';
            const preventivas = parseInt(row['Preventiva'] || 0);
            const corretivas = parseInt(row['Corretiva'] || 0);
            const inst = parseInt(row['Instalacao'] || 0);
            const trei = parseInt(row['Treinamento'] || 0);
            
            const atuacao = row['Atuação'] || 'N/A';
            const modelo = row['Modelo'] || 'N/A';
            
            // Mostrar todas as marcações daquele dia na tabela, inclusive folgas e sem atividade
            // removendo o bloqueio original: if (preventivas === 0 && corretivas === 0 && inst === 0 && trei === 0 && texto === 'Folga') return;
            
            let badgesHTML = '';
            if (preventivas > 0) badgesHTML += `<span style="color:var(--accent-purple)"><i class="fa-solid fa-shield-halved"></i> Prev (${preventivas})</span>`;
            if (corretivas > 0) badgesHTML += `<span style="color:var(--accent-pink)"><i class="fa-solid fa-wrench"></i> Corr (${corretivas})</span>`;
            if (inst > 0) badgesHTML += `<span style="color:var(--accent-green)"><i class="fa-solid fa-plug"></i> Inst (${inst})</span>`;
            if (trei > 0) badgesHTML += `<span style="color:var(--accent-blue)"><i class="fa-solid fa-graduation-cap"></i> Trei (${trei})</span>`;
            
            const item = document.createElement('div');
            item.className = 'atendimento-item';
            
            item.innerHTML = `
                <div class="atendimento-meta">
                    <span><i class="fa-solid fa-user"></i> Demandante: ${demandante}</span>
                    <span style="color:#94a3b8"><i class="fa-solid fa-briefcase"></i> Atuação: ${atuacao}</span>
                    <span style="color:#94a3b8"><i class="fa-solid fa-desktop"></i> Modelo: ${modelo}</span>
                    ${badgesHTML}
                </div>
                <div class="atendimento-texto">${texto}</div>
            `;
            modalBody.appendChild(item);
        });
        
        if(modalBody.innerHTML === '') {
            modalBody.innerHTML = '<p>Nenhum atendimento operado neste dia (Apenas folgas ou linhas vazias).</p>';
        }
    }
    
    modal.classList.remove('hidden');
}

function processCSV(csvString) {
    Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            dashboardData = results.data;
            updateDashboard();
        }
    });
}

function updateDashboard() {
    if(!dashboardData || dashboardData.length === 0) return;

    // Identificar período para o subtítulo
    const dates = dashboardData.map(d => d['Data']).filter(d => Boolean(d));
    if(dates.length > 0) {
        document.getElementById('dataRange').textContent = `Período: ${dates[0]} a ${dates[dates.length-1]}`;
    }

    // Iniciar filtros globais e renderizações
    applyGlobalFilter();

    // Mostrar Grid e esconder Loader
    loader.style.display = 'none';
    grid.classList.remove('hidden');
    
    // Configurar listener botão voltar
    const btnBackChart = document.getElementById('btnBackChart');
    if(btnBackChart) {
        btnBackChart.addEventListener('click', goBackDrilldown);
    }
}

function renderDrilldownChart() {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    const titleEl = document.getElementById('mainChartTitle');
    const btnBack = document.getElementById('btnBackChart');
    
    let labels = [];
    let values = [];

    if (drilldownState.level === 'year') {
        titleEl.textContent = 'Volume de Atendimentos por Ano';
        btnBack.classList.add('hidden');
        labels = Object.keys(drilldownData).sort();
        values = labels.map(y => drilldownData[y].total);
    } 
    else if (drilldownState.level === 'month') {
        titleEl.textContent = `Atendimentos em ${drilldownState.selectedYear}`;
        btnBack.classList.remove('hidden');
        
        const monthsData = drilldownData[drilldownState.selectedYear].months;
        const monthOrder = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        labels = Object.keys(monthsData).sort((a,b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
        values = labels.map(m => monthsData[m].total);
    }
    else if (drilldownState.level === 'day') {
        titleEl.textContent = `Atendimentos em ${drilldownState.selectedMonth}/${drilldownState.selectedYear}`;
        btnBack.classList.remove('hidden');
        
        const daysData = drilldownData[drilldownState.selectedYear].months[drilldownState.selectedMonth].days;
        const daysArray = Object.keys(daysData).map(Number).sort((a,b) => a - b);
        
        const monthOrder = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        const mesInt = monthOrder.indexOf(drilldownState.selectedMonth);

        labels = daysArray.map(d => {
            const dateObj = new Date(drilldownState.selectedYear, mesInt, d);
            const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
            return [d.toString(), weekday.charAt(0).toUpperCase() + weekday.slice(1)];
        });
        values = daysArray.map(d => daysData[d]);
    }

    if(charts.mainLine) charts.mainLine.destroy();

    charts.mainLine = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Atendimentos',
                    data: values,
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: '#94a3b8',
                    font: { weight: 'bold' },
                    formatter: function(value) {
                        return value > 0 ? value : '';
                    }
                }
            },
            layout: {
                padding: { top: 20 }
            },
            scales: {
                x: {
                    grid: { display: false }
                },
                y: { 
                    display: false,
                    beginAtZero: true 
                }
            },
            onClick: (e) => {
                const elements = e.chart.getElementsAtEventForMode(e, 'index', { intersect: false }, true);
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedLabel = labels[idx];
                    handleChartClick(clickedLabel);
                }
            }
        }
    });
}

function handleChartClick(label) {
    if (drilldownState.level === 'year') {
        drilldownState.level = 'month';
        drilldownState.selectedYear = label;
        renderDrilldownChart();
    } 
    else if (drilldownState.level === 'month') {
        drilldownState.level = 'day';
        drilldownState.selectedMonth = label;
        renderDrilldownChart();
    }
    else if (drilldownState.level === 'day') {
        // Formatar data clicada
        const diaNum = Array.isArray(label) ? label[0] : label;
        const monthOrder = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        const mesInt = monthOrder.indexOf(drilldownState.selectedMonth) + 1;
        
        const diaStr = diaNum.toString().padStart(2, '0');
        const mesStr = mesInt.toString().padStart(2, '0');
        const anoStr = drilldownState.selectedYear;
        
        const targetDate = `${diaStr}/${mesStr}/${anoStr}`;
        
        // Abrir Modal de Detalhes
        openDayDetailsModal(targetDate);
    }
}

function goBackDrilldown() {
    if (drilldownState.level === 'day') {
        drilldownState.level = 'month';
        drilldownState.selectedMonth = null;
        globalFilters.date = null;
        applyGlobalFilter();
    } 
    else if (drilldownState.level === 'month') {
        drilldownState.level = 'year';
        drilldownState.selectedYear = null;
    }
    renderDrilldownChart();
}

function renderTypeChart(data) {
    const ctx = document.getElementById('typeChart').getContext('2d');
    
    if(charts.type) charts.type.destroy();

    charts.type = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: [
                    '#8b5cf6', // Preventiva
                    '#ec4899', // Corretiva
                    '#10b981', // Instalacao
                    '#3b82f6'  // Treinamento
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                datalabels: {
                    color: '#ffffff',
                    font: { weight: 'bold' },
                    formatter: function(value, context) {
                        const dataArr = context.chart.data.datasets[0].data;
                        const sumTotal = dataArr.reduce((a, b) => a + b, 0);
                        if(sumTotal === 0 || value === 0) return '';
                        return Math.round((value / sumTotal) * 100) + '%';
                    }
                }
            },
            onClick: (e, activeElements) => {
                if (activeElements.length > 0) {
                    const idx = activeElements[0].index;
                    const clickedLabel = Object.keys(data)[idx];
                    
                    if (globalFilters.service === clickedLabel) {
                        globalFilters.service = null;
                    } else {
                        globalFilters.service = clickedLabel;
                    }
                    applyGlobalFilter();
                }
            }
        }
    });
}

function renderOSChart(data) {
    const ctx = document.getElementById('osChart').getContext('2d');
    
    if(charts.os) charts.os.destroy();
    
    const totaisArr = Object.values(data);
    const sumTotal = totaisArr.reduce((a, b) => a + b, 0);

    charts.os = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: totaisArr,
                backgroundColor: [
                    '#3b82f6', // Com OS
                    '#f43f5e'  // Sem OS
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                datalabels: {
                    color: '#ffffff',
                    font: { weight: 'bold' },
                    formatter: function(value, context) {
                        const dataArr = context.chart.data.datasets[0].data;
                        const sumTotal = dataArr.reduce((a, b) => a + b, 0);
                        if(sumTotal === 0 || value === 0) return '';
                        return Math.round((value / sumTotal) * 100) + '%';
                    }
                }
            },
            onClick: (e, activeElements) => {
                if (activeElements.length > 0) {
                    const idx = activeElements[0].index;
                    const clickedLabel = Object.keys(data)[idx];
                    
                    if (globalFilters.os === clickedLabel) {
                        globalFilters.os = null;
                    } else {
                        globalFilters.os = clickedLabel;
                    }
                    applyGlobalFilter();
                }
            }
        }
    });
}

function renderUFTable(data) {
    const tbody = document.querySelector('#ufTable tbody');
    tbody.innerHTML = '';
    
    const sortedUfs = Object.keys(data).sort((a,b) => data[b] - data[a]);
    
    sortedUfs.forEach(uf => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        if(globalFilters.uf === uf) {
             tr.style.backgroundColor = 'rgba(59, 130, 246, 0.2)'; 
        }
        tr.innerHTML = `
            <td><strong>${uf}</strong></td>
            <td>${data[uf]}</td>
        `;
        tr.addEventListener('click', () => {
            if (globalFilters.uf === uf) {
                globalFilters.uf = null;
            } else {
                globalFilters.uf = uf;
            }
            applyGlobalFilter();
        });
        tbody.appendChild(tr);
    });
}

function renderDemandanteTable(data) {
    const tbody = document.querySelector('#demandanteTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const sortedDems = Object.keys(data).sort((a,b) => data[b] - data[a]).slice(0, 15); // Top 15 para não quebrar a UI
    
    sortedDems.forEach(dem => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row'; // OPCIONAL: Adicionar clique global pelo demandante no futuro se solicitado
        
        tr.innerHTML = `
            <td><strong>${dem}</strong></td>
            <td>${data[dem]}</td>
        `;
        tbody.appendChild(tr);
    });
}

function animateValue(id, start, end, duration) {
    if (start === end) return;
    const obj = document.getElementById(id);
    if(!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString('pt-BR');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function applyGlobalFilter() {
    if(!dashboardData || dashboardData.length === 0) return;

    let filteredData = dashboardData.filter(row => row['Data']); 
    
    // 1. Aplicar Filtros Passivos
    if (globalFilters.uf) {
        filteredData = filteredData.filter(row => row['UF'] === globalFilters.uf);
    }
    if (globalFilters.date) {
        filteredData = filteredData.filter(row => row['Data'] === globalFilters.date);
    }
    if (globalFilters.service) {
        filteredData = filteredData.filter(row => parseInt(row[globalFilters.service] || 0) > 0);
    }
    if (globalFilters.os === 'Com OS') {
        filteredData = filteredData.filter(row => parseInt(row['Com OS'] || 0) > 0);
    } else if (globalFilters.os === 'Sem OS') {
        filteredData = filteredData.filter(row => parseInt(row['Sem OS'] || 0) > 0);
    }
    if (globalFilters.search && globalFilters.search.trim() !== '') {
        const term = globalFilters.search.toLowerCase();
        filteredData = filteredData.filter(row => {
            const atend = (row['Atendimento'] || '').toLowerCase();
            return atend.includes(term);
        });
    }

    // 2. Recalcular Variáveis KPI baseada nos dados restantes
    let totalKm = 0;
    let totalKmAer = 0;
    let totalKmTerr = 0;
    let totalCorretivas = 0;
    let totalPreventivas = 0;
    let diasTrabalhados = 0;
    
    drilldownData = {};
    typeData = { 'Preventiva': 0, 'Corretiva': 0, 'Instalacao': 0, 'Treinamento': 0 };
    ufData = {};
    osData = { 'Com OS': 0, 'Sem OS': 0 };
    demandanteData = {};

    filteredData.forEach(row => {
        // Distances
        const kmT = parseFloat(row['KM Terrestre'] || 0);
        const kmA = parseFloat(row['KM Aéreo'] || 0);
        totalKmTerr += kmT;
        totalKmAer += kmA;
        totalKm += (kmT + kmA);

        // Services
        const prev = parseInt(row['Preventiva'] || 0);
        const corr = parseInt(row['Corretiva'] || 0);
        const inst = parseInt(row['Instalacao'] || 0);
        const treina = parseInt(row['Treinamento'] || 0);

        totalCorretivas += corr;
        totalPreventivas += prev;
        
        typeData['Preventiva'] += prev;
        typeData['Corretiva'] += corr;
        typeData['Instalacao'] += inst;
        typeData['Treinamento'] += treina;

        // OS Track
        osData['Com OS'] += parseInt(row['Com OS'] || 0);
        osData['Sem OS'] += parseInt(row['Sem OS'] || 0);

        // Dias (Considera a linha de folga trabalhada TB)
        if (parseInt(row['Dias Trabalhados'] || 1) > 0) diasTrabalhados++;

        // Drilldown BugFix (Ano -> Mes -> Dia): Somar os apontamentos que a linha tem, ou mínimo 1 se trabalhou.
        const rowValue = (prev + corr + inst + treina) > 0 ? (prev + corr + inst + treina) : (row['Atuação'] === 'Trabalhado' ? 1 : 0);
        const year = row['Ano'];
        const month = row['MesNome'];
        if(row['Data']){
             const day = parseInt(row['Data'].split('/')[0]).toString();
             if(!drilldownData[year]) drilldownData[year] = { total: 0, months: {} };
             drilldownData[year].total += rowValue;
             
             if(!drilldownData[year].months[month]) drilldownData[year].months[month] = { total: 0, days: {} };
             drilldownData[year].months[month].total += rowValue;
             
             if(!drilldownData[year].months[month].days[day]) drilldownData[year].months[month].days[day] = 0;
             drilldownData[year].months[month].days[day] += rowValue;
        }

        // UF
        const uf = row['UF'];
        if(uf && uf.trim() !== '') {
            if(!ufData[uf]) ufData[uf] = (row['Atuação'] === 'Trabalhado' ? 1 : 0);
            else ufData[uf] += (row['Atuação'] === 'Trabalhado' ? 1 : 0);
        }

        // Demandante
        const demandante = row['Demandante'];
        if(demandante && demandante !== '0' && demandante.trim() !== '') {
            if(!demandanteData[demandante]) demandanteData[demandante] = 0;
            demandanteData[demandante] += rowValue;
        }
    });

    // 3. Atualizar DOM KPI
    animateValue('kpi-km', 0, Math.round(totalKm), 1000);
    animateValue('kpi-km-aereo', 0, Math.round(totalKmAer), 1000);
    animateValue('kpi-km-terrestre', 0, Math.round(totalKmTerr), 1000);
    animateValue('kpi-days', 0, diasTrabalhados, 1000);

    // 4. Redesenhar gráficos com os novos cômputos
    renderDrilldownChart();
    renderTypeChart(typeData);
    renderOSChart(osData);
    renderUFTable(ufData);
    renderDemandanteTable(demandanteData);
}
