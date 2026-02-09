// js/statistieken.js

// --- CONFIGURATIE ---
const DEPT_STYLE = {
    "Sloebers":          { color: "purple" },
    "Speelclub Jongens": { color: "yellow" },
    "Speelclub Meisjes": { color: "yellow" },
    "Rakkers":           { color: "emerald" },
    "Kwiks":             { color: "emerald" },
    "Toppers":           { color: "red" },
    "Tippers":           { color: "rose" },
    "Kerels":            { color: "blue" },
    "Tiptiens":          { color: "sky" },
    "Aspis":             { color: "orange" }
};

let globalExportData = [];

window.onload = async () => {
    try {
        if (typeof renderLayout === 'function') renderLayout();
        const user = await requireAuth();
        if (!user) return;
        renderStatistics();
    } catch (error) { console.error("Error:", error); }
};

// --- HELPERS ---
function resolveDeptName(dbName, validNames) {
    if (!dbName) return null;
    const cleanDb = dbName.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const validName of validNames) {
        const cleanValid = validName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanDb === cleanValid) return validName;
        if ((cleanValid.includes('tiptien') && cleanDb.includes('tip10')) || 
            (cleanValid.includes('tip10') && cleanDb.includes('tiptien'))) return validName;
    }
    return null;
}

// FIX: Bereken start van het werkjaar (1 september)
function getStartOfChiroYear() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11, dus 8 is september
    
    // Als we voor september zijn (jan-aug), is de start vorig jaar september
    const startYear = currentMonth < 8 ? currentYear - 1 : currentYear;
    return `${startYear}-09-01`;
}

// --- HOOFDFUNCTIE ---
async function renderStatistics() {
    const container = document.getElementById('stats-content');
    
    try {
        // 1. DATA OPHALEN (Gefilterd op werkjaar)
        const startDate = getStartOfChiroYear();
        
        const { data: records, error } = await supabaseClient
            .from(COLLECTION_NAMES.AANWEZIGHEDEN)
            .select('*')
            .gte('datum', startDate) // FIX: Alleen data van dit seizoen
            .order('datum', { ascending: true });

        if (error) throw error;
        if (!records || records.length === 0) {
            container.innerHTML = `<div class="p-10 text-center text-gray-500 bg-[#181b25] border border-gray-800 rounded-2xl">Geen data beschikbaar voor dit werkjaar (vanaf ${startDate}).</div>`;
            return;
        }

        // 2. DATA VERWERKEN
        let historyData = [];
        let deptStats = {};
        const configNames = AFDELINGEN_CONFIG.map(c => c.naam);
        
        AFDELINGEN_CONFIG.forEach(c => {
            deptStats[c.naam] = { total: 0, count: 0, max: 0, min: 999, last: 0, prev: 0 };
        });

        records.forEach((dag, index) => {
            let berekendTotaal = 0;
            let afdData = dag.afdelingen;

            if (typeof afdData === 'string') { try { afdData = JSON.parse(afdData); } catch(e){ afdData = []; } }
            if (!Array.isArray(afdData)) afdData = [];

            afdData.forEach(item => {
                const correcteNaam = resolveDeptName(item.naam, configNames);
                const aantal = parseInt(item.aantal) || 0;
                
                if (correcteNaam && deptStats[correcteNaam]) {
                    const s = deptStats[correcteNaam];
                    s.total += aantal;
                    berekendTotaal += aantal;
                    
                    if (aantal > 0) {
                        s.count++;
                        s.max = Math.max(s.max, aantal);
                        s.min = Math.min(s.min, aantal);
                    }
                    if (index === records.length - 2) s.prev = aantal;
                    if (index === records.length - 1) s.last = aantal;
                }
            });

            const finalCount = berekendTotaal > 0 ? berekendTotaal : (parseInt(dag.totaalAantal) || 0);
            historyData.push({ date: dag.datum, count: finalCount, details: dag.opmerking });
        });

        globalExportData = historyData;

        for (const key in deptStats) { if(deptStats[key].min === 999) deptStats[key].min = 0; }

        const totalDays = historyData.length;
        const totalAtt = historyData.reduce((a,b) => a + b.count, 0);
        const avgAtt = totalDays > 0 ? (totalAtt / totalDays).toFixed(0) : 0;
        const maxAtt = Math.max(...historyData.map(t => t.count), 0);

        // 3. HTML RENDEREN
        let html = `
        <div class="font-sans space-y-10 pb-10">
            
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                ${renderKpiCard('Gem. Opkomst', avgAtt, 'leden per zondag', 'users', 'text-indigo-400', 'bg-indigo-500/10')}
                ${renderKpiCard('Record', maxAtt, 'hoogste opkomst', 'trophy', 'text-amber-400', 'bg-amber-500/10')}
                ${renderKpiCard('Dagen', totalDays, 'zondagen geteld', 'calendar', 'text-emerald-400', 'bg-emerald-500/10')}
                ${renderKpiCard('Totaal', totalAtt.toLocaleString('nl-BE'), `sinds ${new Date(startDate).toLocaleDateString('nl-BE', {month:'short'})}`, 'chart-bar', 'text-rose-400', 'bg-rose-500/10')}
            </div>

            <div>
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-lg font-bold text-white">Details per Afdeling</h3>
                    <span class="text-xs text-gray-500">Huidig werkjaar</span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    ${AFDELINGEN_CONFIG
                        .map(c => ({...c, stats: deptStats[c.naam]}))
                        .map(conf => {
                            const s = conf.stats;
                            const avg = s.count > 0 ? (s.total / s.count).toFixed(1) : "0";
                            const styleConfig = DEPT_STYLE[conf.naam] || { color: "gray" };
                            const color = styleConfig.color;
                            
                            const diff = s.last - s.prev;
                            let diffIcon = "minus";
                            let diffColor = "text-gray-500";
                            let diffVal = "=";

                            if (diff > 0) { diffIcon = "trending-up"; diffColor = "text-emerald-400"; diffVal = `+${diff}`; } 
                            else if (diff < 0) { diffIcon = "trending-down"; diffColor = "text-rose-400"; diffVal = `${diff}`; }

                            return `
                            <div class="bg-[#1e232e] rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 group flex flex-col h-full border border-gray-800/50">
                                
                                <div class="h-1.5 w-full bg-${color}-500"></div>

                                <div class="p-6 flex flex-col flex-1">
                                    <div class="flex justify-between items-start mb-6">
                                        <h4 class="font-bold text-white text-lg truncate pr-2">${conf.naam}</h4>
                                        <div class="w-9 h-9 rounded-lg bg-[#2a303c] border border-gray-700 flex items-center justify-center text-${color}-400 shrink-0">
                                            <i data-lucide="users" class="w-5 h-5"></i>
                                        </div>
                                    </div>

                                    <div class="text-center mb-8 flex-1 flex flex-col justify-center">
                                        <span class="text-5xl font-black text-white tracking-tight">${avg}</span>
                                        <span class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">Gemiddeld</span>
                                    </div>

                                    <div class="bg-[#151820] rounded-lg p-3 flex justify-between items-center mb-4 border border-gray-800">
                                        <div>
                                            <span class="text-[9px] text-gray-400 uppercase font-bold tracking-wider block mb-0.5">Laatste</span>
                                            <span class="text-xl font-bold text-white">${s.last}</span>
                                        </div>
                                        <div class="text-right flex items-center">
                                            <div class="flex items-center justify-end gap-1 ${diffColor} bg-white/5 px-2 py-1 rounded">
                                                <span class="font-bold text-sm">${diffVal}</span>
                                                <i data-lucide="${diffIcon}" class="w-3 h-3"></i>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-2 text-center border-t border-gray-800 pt-4 mt-auto">
                                        <div class="border-r border-gray-800">
                                            <span class="block text-lg font-bold text-${color}-400">${s.max}</span>
                                            <span class="text-[10px] text-gray-500 uppercase font-bold">Record</span>
                                        </div>
                                        <div>
                                            <span class="block text-lg font-bold text-gray-300">${s.min}</span>
                                            <span class="text-[10px] text-gray-500 uppercase font-bold">Min</span>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                </div>
            </div>

            <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 lg:p-8 shadow-2xl relative overflow-hidden">
                 <div class="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none"></div>
                <div class="relative z-10">
                    <h3 class="text-lg font-bold text-white mb-6">Seizoensverloop</h3>
                    <div class="chart-wrapper">
                        <canvas id="trendChart"></canvas>
                    </div>
                </div>
            </div>

            <div class="bg-[#181b25] border border-gray-800 rounded-2xl overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-800 bg-[#1f2330]/30 flex justify-between items-center">
                    <h3 class="font-bold text-white text-sm">Volledige Historiek</h3>
                    <button onclick="exportToCSV()" class="text-xs text-gray-400 hover:text-white flex items-center gap-1"><i data-lucide="download" class="w-3 h-3"></i> CSV</button>
                </div>
                <div class="max-h-80 overflow-y-auto custom-scrollbar">
                    <table class="w-full text-sm text-left text-gray-400">
                        <thead class="text-xs text-gray-500 uppercase bg-[#13151c] sticky top-0 z-10">
                            <tr><th class="px-6 py-3 font-semibold">Datum</th><th class="px-6 py-3 font-semibold">Opmerking</th><th class="px-6 py-3 text-right font-semibold">Totaal</th></tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800/50">
                            ${[...historyData].reverse().map(row => `
                                <tr class="hover:bg-white/5 transition-colors"><td class="px-6 py-3 font-mono text-gray-300">${new Date(row.date).toLocaleDateString('nl-BE')}</td><td class="px-6 py-3 italic text-gray-600">${row.details || '-'}</td><td class="px-6 py-3 text-right"><span class="font-bold text-white">${row.count}</span></td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>`;

        container.innerHTML = html;
        lucide.createIcons();
        renderTrendChart(historyData);

    } catch (err) {
        console.error("Render Error:", err);
        container.innerHTML = `<div class="text-rose-500 p-10 text-center">Fout: ${err.message}</div>`;
    }
}

function renderKpiCard(title, value, sub, icon, textColor, bgClass) {
    return `
    <div class="bg-[#181b25] border border-gray-800 p-6 rounded-2xl shadow-sm flex items-start justify-between hover:border-gray-700 transition-colors">
        <div>
            <p class="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">${title}</p>
            <p class="text-3xl font-black text-white tracking-tight">${value}</p>
            <p class="text-[11px] text-gray-500 mt-1">${sub}</p>
        </div>
        <div class="w-12 h-12 rounded-xl flex items-center justify-center ${bgClass} ${textColor}">
            <i data-lucide="${icon}" class="w-6 h-6"></i>
        </div>
    </div>`;
}

function renderTrendChart(data) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    let gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.date).toLocaleDateString('nl-BE', {day:'2-digit', month:'short'})),
            datasets: [{
                label: 'Aanwezigen',
                data: data.map(d => d.count),
                borderColor: '#6366f1',
                backgroundColor: gradient,
                borderWidth: 3,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#181b25',
                pointBorderColor: '#6366f1',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f111a', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: '#334155', borderWidth: 1, padding: 10, displayColors: false, callbacks: { label: (c) => c.parsed.y + ' leden' } } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#64748b', font: {family: 'Inter'} }, border: { display: false } },
                x: { grid: { display: false }, ticks: { color: '#64748b', font: {family: 'Inter'} }, border: { display: false } }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function exportToCSV() {
    if(!globalExportData.length) return alert("Geen data.");
    let csv = "Datum;Aantal;Opmerking\n" + globalExportData.map(r => `${r.date};${r.count};${r.details||''}`).join("\n");
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = `chiro_stats.csv`;
    link.click();
}