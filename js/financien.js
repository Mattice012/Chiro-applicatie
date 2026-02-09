// js/financien.js
// Enterprise Grade Finance Module

let activeTab = "overview";
let cachedFinances = [];
let currentFilter = ""; // Voor real-time zoeken

// --- FORMATTERS (Zoals een pro boekhoudpakket) ---
const moneyFormatter = new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat('nl-BE', {
    day: '2-digit', month: 'short', year: 'numeric'
});

// --- INITIALISATIE ---
window.onload = async () => {
    try {
        if (typeof renderLayout === "function") renderLayout();
        
        // Auth check
        const user = await requireAuth();
        if (!user) return;

        // Security check
        const role = USER_ROLES[currentUser.role];
        if (!role.canViewFinances) {
            renderNoAccess();
            return;
        }

        await loadData();
        renderView();
    } catch (e) {
        console.error("System Error:", e);
        showToast("Systeemfout bij laden module.", "error");
    }
};

function renderNoAccess() {
    document.getElementById("fin-content").innerHTML = `
        <div class="flex flex-col items-center justify-center h-[60vh] text-center animate-in fade-in zoom-in duration-300">
            <div class="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mb-6 border border-rose-500/20">
                <i data-lucide="shield-alert" class="w-10 h-10 text-rose-500"></i>
            </div>
            <h2 class="text-2xl font-bold text-white mb-2">Toegang Geweigerd</h2>
            <p class="text-gray-400 max-w-md">Je accountrechten (${currentUser.role}) staan het beheren van financiën niet toe.</p>
        </div>`;
    lucide.createIcons();
}

// --- DATA LAYER ---
async function loadData() {
    const { data, error } = await supabaseClient
        .from(COLLECTION_NAMES.FINANCES)
        .select("*")
        .order("datum", { ascending: false })
        .order("created_at", { ascending: false }) 
        .limit(1000); // Hogere limiet voor pro gebruik

    if (error) {
        console.error(error);
        showToast("Kon financiële data niet synchroniseren.", "error");
    } else {
        cachedFinances = data || [];
    }
}

// --- VIEW CONTROLLER ---
window.switchTab = (tabName) => {
    activeTab = tabName;
    updateTabUI();
    renderView();
};

function updateTabUI() {
    const tabs = ['overview', 'budgets', 'add'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if(btn) {
            const isActive = t === activeTab;
            btn.className = isActive 
                ? "px-5 py-2.5 text-sm font-bold rounded-xl transition-all bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 flex items-center gap-2 transform scale-105"
                : "px-5 py-2.5 text-sm font-bold rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2";
        }
    });
}

function renderView() {
    const container = document.getElementById("fin-content");
    
    // Smooth transition
    container.style.opacity = '0';
    
    setTimeout(() => {
        if (activeTab === "overview") container.innerHTML = renderOverviewHtml();
        else if (activeTab === "add") container.innerHTML = renderAddFormHtml();
        else if (activeTab === "budgets") renderBudgetsView(container);
        
        lucide.createIcons();
        container.style.opacity = '1';
        container.style.transition = 'opacity 0.2s ease-in-out';
        
        // Re-attach search listener if in overview
        if(activeTab === 'overview') {
            const searchInput = document.getElementById('table-search');
            if(searchInput) {
                searchInput.value = currentFilter;
                searchInput.focus();
                // Cursor aan einde zetten
                const val = searchInput.value; searchInput.value = ''; searchInput.value = val;
            }
        }
    }, 150);
}

// =============================================================================
// 1. DASHBOARD & TRANSACTIES (The "Cockpit")
// =============================================================================
function renderOverviewHtml() {
    // Calculaties
    const totalIncome = cachedFinances.filter(t => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = cachedFinances.filter(t => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);
    const balance = totalIncome - totalExpense;

    // Filter Logic
    const filteredData = cachedFinances.filter(t => {
        if (!currentFilter) return true;
        const search = currentFilter.toLowerCase();
        return (t.description || '').toLowerCase().includes(search) ||
               (t.category || '').toLowerCase().includes(search) ||
               (t.user || '').toLowerCase().includes(search) ||
               (t.afdelingen || []).join(' ').toLowerCase().includes(search);
    });

    return `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${renderProCard('Huidig Saldo', balance, 'Netto balans', 'wallet', balance >= 0 ? 'bg-indigo-500' : 'bg-rose-500')}
            ${renderProCard('Inkomsten', totalIncome, 'Dit werkjaar', 'trending-up', 'bg-emerald-500')}
            ${renderProCard('Uitgaven', totalExpense, 'Dit werkjaar', 'trending-down', 'bg-rose-500')}
        </div>

        <div class="bg-[#181b25] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[650px]">
            
            <div class="p-5 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#1f2330]/50 backdrop-blur-xl">
                <div class="flex items-center gap-3">
                    <div class="bg-indigo-500/10 p-2 rounded-lg text-indigo-400">
                        <i data-lucide="arrow-right-left" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-white text-sm">Transacties</h3>
                        <p class="text-xs text-gray-500">${filteredData.length} resultaten</p>
                    </div>
                </div>

                <div class="flex items-center gap-3 w-full sm:w-auto">
                    <div class="relative group w-full sm:w-64">
                        <i data-lucide="search" class="absolute left-3 top-2.5 w-4 h-4 text-gray-500 group-hover:text-indigo-400 transition-colors"></i>
                        <input type="text" id="table-search" 
                            oninput="handleSearch(this.value)" 
                            value="${currentFilter}"
                            placeholder="Zoeken op omschrijving, afdeling..." 
                            class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-gray-600">
                    </div>
                    <button onclick="exportFinances()" class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg border border-transparent hover:border-gray-700 transition-all" title="Download Excel">
                        <i data-lucide="download" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
            
            <div class="overflow-auto custom-scrollbar flex-1 relative">
                <table class="w-full text-left text-sm text-gray-400">
                    <thead class="bg-[#13151c] text-xs uppercase font-bold text-gray-500 sticky top-0 z-10 shadow-md">
                        <tr>
                            <th class="px-6 py-4 bg-[#13151c] w-32">Datum</th>
                            <th class="px-6 py-4 bg-[#13151c]">Omschrijving</th>
                            <th class="px-6 py-4 bg-[#13151c]">Categorie</th>
                            <th class="px-6 py-4 bg-[#13151c] text-right">Bedrag</th>
                            <th class="px-6 py-4 bg-[#13151c] w-12"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-800/50">
                        ${filteredData.length > 0 ? filteredData.map(t => renderProRow(t)).join("") : renderEmptyState()}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// Search Handler (Debounced zou beter zijn, maar direct is prima voor <1000 items)
window.handleSearch = (val) => {
    currentFilter = val;
    // We re-renderen alleen de tbody zou efficiënter zijn, maar renderView is snel genoeg hier
    document.getElementById("fin-content").querySelector('tbody').innerHTML = 
        cachedFinances.filter(t => {
            if (!currentFilter) return true;
            const search = currentFilter.toLowerCase();
            return (t.description || '').toLowerCase().includes(search) ||
                   (t.category || '').toLowerCase().includes(search) ||
                   (t.user || '').toLowerCase().includes(search) ||
                   (t.afdelingen || []).join(' ').toLowerCase().includes(search);
        }).map(t => renderProRow(t)).join("") || renderEmptyState();
    lucide.createIcons();
}

function renderProCard(title, amount, sub, icon, bgClass) {
    const colorName = bgClass.split('-')[1]; // e.g. 'indigo'
    return `
    <div class="bg-[#181b25] border border-gray-800 p-6 rounded-2xl relative overflow-hidden group hover:border-gray-700 transition-all duration-300">
        <div class="absolute -right-6 -top-6 w-32 h-32 ${bgClass}/10 rounded-full blur-2xl group-hover:${bgClass}/20 transition-all"></div>
        
        <div class="flex justify-between items-start mb-4 relative z-10">
            <div>
                <p class="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">${title}</p>
                <h3 class="text-3xl font-black text-white tracking-tight">${moneyFormatter.format(amount)}</h3>
            </div>
            <div class="p-3 rounded-xl ${bgClass}/10 text-${colorName}-400 border border-${colorName}-500/20">
                <i data-lucide="${icon}" class="w-6 h-6"></i>
            </div>
        </div>
        
        <div class="flex items-center gap-2 text-xs font-medium text-gray-400 relative z-10">
            <span class="w-2 h-2 rounded-full ${bgClass}"></span>
            ${sub}
        </div>
    </div>`;
}

function renderProRow(t) {
    const isIncome = t.type === "income";
    const amountColor = isIncome ? "text-emerald-400" : "text-rose-400";
    const sign = isIncome ? "+" : "-";
    
    // Tags
    let tags = (t.afdelingen || (t.afdeling ? [t.afdeling] : ['Algemeen']))
        .map(afd => `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-300 border border-gray-700 mr-1">${afd}</span>`)
        .join("");

    const canDelete = ['ADMIN', 'KASSIER'].includes(currentUser.role);

    return `
    <tr class="hover:bg-[#1f2330]/60 transition-colors group border-l-2 border-transparent hover:border-indigo-500">
        <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex flex-col">
                <span class="font-bold text-gray-200 text-sm">${dateFormatter.format(new Date(t.datum))}</span>
                <span class="text-[10px] text-gray-500 uppercase">${new Date(t.datum).toLocaleDateString('nl-BE', {weekday: 'short'})}</span>
            </div>
        </td>
        <td class="px-6 py-4">
            <div class="font-medium text-white mb-1">${t.description}</div>
            <div class="text-xs text-gray-500 flex items-center gap-2">
                <i data-lucide="user" class="w-3 h-3"></i> ${t.user || 'Onbekend'}
            </div>
        </td>
        <td class="px-6 py-4">
            <div class="flex flex-col items-start gap-1">
                <span class="text-xs font-medium text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                    ${t.category || 'Overige'}
                </span>
                <div class="mt-1">${tags}</div>
            </div>
        </td>
        <td class="px-6 py-4 text-right">
            <span class="font-bold font-mono ${amountColor} text-base">${sign} ${moneyFormatter.format(t.amount).replace('€', '').trim()}</span>
        </td>
        <td class="px-6 py-4 text-right">
            ${canDelete ? `
            <button onclick="deleteTransaction(${t.id})" class="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all" title="Verwijderen">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>` : ''}
        </td>
    </tr>`;
}

function renderEmptyState() {
    return `
    <tr>
        <td colspan="5" class="py-20 text-center">
            <div class="flex flex-col items-center justify-center opacity-50">
                <i data-lucide="search-x" class="w-16 h-16 text-gray-600 mb-4"></i>
                <h3 class="text-lg font-bold text-gray-300">Geen transacties gevonden</h3>
                <p class="text-sm text-gray-500">Probeer een andere zoekterm of voeg een nieuwe transactie toe.</p>
            </div>
        </td>
    </tr>`;
}

// =============================================================================
// 2. ACTIES (CRUD)
// =============================================================================

window.deleteTransaction = async (id) => {
    let confirmed = false;
    if (typeof window.askConfirmation === 'function') {
        confirmed = await window.askConfirmation(
            "Transactie verwijderen", 
            "Weet je dit zeker? De balans wordt onmiddellijk aangepast. Dit kan niet ongedaan worden gemaakt."
        );
    } else {
        confirmed = confirm("Transactie definitief verwijderen?");
    }

    if (!confirmed) return;

    try {
        const { error } = await supabaseClient.from(COLLECTION_NAMES.FINANCES).delete().eq('id', id);
        if (error) throw error;
        
        showToast("Transactie succesvol verwerkt.", "success");
        await loadData();
        // Update view zonder volledige refresh voor snelheid
        if(activeTab === 'overview') handleSearch(currentFilter); 
        else renderView();
    } catch (err) {
        console.error(err);
        showToast("Kon transactie niet verwijderen.", "error");
    }
}

window.exportFinances = () => {
    if (!cachedFinances.length) return showToast("Geen data beschikbaar voor export.", "warning");
    
    // Professionele CSV headers
    let csv = "Datum;Weekdag;Type;Categorie;Omschrijving;Afdelingen;Ingevoerd Door;Bedrag (EUR)\n";
    
    cachedFinances.forEach(row => {
        const dateObj = new Date(row.datum);
        const datum = dateFormatter.format(dateObj);
        const dag = dateObj.toLocaleDateString('nl-BE', {weekday: 'long'});
        const bedrag = parseFloat(row.amount).toFixed(2).replace('.', ','); // Excel NL formaat
        const desc = (row.description || '').replace(/;/g, ',').replace(/\n/g, ' ');
        const afd = (row.afdelingen || []).join(', ');
        
        csv += `${datum};${dag};${row.type};${row.category || ''};"${desc}";"${afd}";${row.user || ''};${bedrag}\n`;
    });

    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = `Chiro_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
}

// =============================================================================
// 3. VIRTUELE REKENINGEN (BUDGETS)
// =============================================================================
function renderBudgetsView(container) {
    const deptBalances = {};
    
    // Init Structuur
    AFDELINGEN_CONFIG.forEach(afd => deptBalances[afd.naam] = { balance: 0, transactions: [], color: afd.kleur });
    deptBalances['Algemeen'] = { balance: 0, transactions: [], color: 'gray' };

    // Berekenen
    cachedFinances.forEach(t => {
        const netAmount = t.type === 'income' ? parseFloat(t.amount) : -parseFloat(t.amount);
        let involved = t.afdelingen || (t.afdeling ? [t.afdeling] : ['Algemeen']);
        if(!Array.isArray(involved)) involved = [involved];
        if(involved.length === 0) involved = ['Algemeen'];

        const splitAmount = netAmount / involved.length;
        involved.forEach(dept => {
            if (deptBalances[dept]) {
                deptBalances[dept].balance += splitAmount;
                deptBalances[dept].transactions.push(t);
            }
        });
    });

    // Render Cards
    let cardsHtml = AFDELINGEN_CONFIG.map(afd => {
        const d = deptBalances[afd.naam];
        const c = afd.kleur || 'indigo';
        const isPositive = d.balance >= 0;
        
        return `
        <div onclick="openBudgetDetail('${afd.naam}')" class="cursor-pointer group relative overflow-hidden rounded-2xl border border-${c}-500/30 bg-[#181b25] p-6 hover:-translate-y-1 hover:shadow-2xl hover:shadow-${c}-500/10 transition-all duration-300">
            <div class="absolute -right-10 -top-10 w-40 h-40 bg-${c}-500/5 rounded-full blur-3xl group-hover:bg-${c}-500/10 transition-all"></div>
            
            <div class="flex items-center justify-between mb-6 relative z-10">
                <h3 class="font-bold text-white text-lg tracking-wide">${afd.naam}</h3>
                <div class="rounded-xl bg-${c}-500/10 p-2.5 text-${c}-400 border border-${c}-500/20 group-hover:bg-${c}-500/20 transition-colors">
                    <i data-lucide="piggy-bank" class="h-5 w-5"></i>
                </div>
            </div>
            
            <div class="flex flex-col relative z-10">
                <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Beschikbaar</span>
                <span class="text-3xl font-black ${isPositive ? 'text-white' : 'text-rose-400'} tracking-tight group-hover:scale-105 transition-transform origin-left">
                    ${moneyFormatter.format(d.balance)}
                </span>
            </div>
            
            <div class="mt-6 pt-4 border-t border-gray-800 flex items-center justify-between text-xs font-medium text-gray-500 relative z-10">
                <span class="flex items-center gap-1.5"><i data-lucide="history" class="w-3 h-3"></i> ${d.transactions.length} verrichtingen</span>
                <span class="group-hover:translate-x-1 transition-transform text-${c}-400 flex items-center gap-1">Details <i data-lucide="arrow-right" class="w-3 h-3"></i></span>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
    <div class="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
        <div class="mb-8 flex items-center gap-4">
            <div class="p-3 bg-indigo-500/20 rounded-xl text-indigo-400"><i data-lucide="layout-grid" class="w-6 h-6"></i></div>
            <div>
                <h2 class="text-2xl font-bold text-white">Virtuele Rekeningen</h2>
                <p class="text-gray-400 text-sm">Beheer het budget per afdeling.</p>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            ${cardsHtml}
        </div>
    </div>`;
}

// --- BUDGET MODAL (The Professional One) ---
window.openBudgetDetail = (deptName) => {
    const txs = cachedFinances.filter(t => (t.afdelingen && t.afdelingen.includes(deptName)) || t.afdeling === deptName);
    const total = txs.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
    
    const modal = document.getElementById('budget-modal');

    modal.innerHTML = `
    <div class="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity" onclick="closeBudgetDetail()"></div>
    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-[#181b25] border border-gray-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
        
        <div class="bg-[#1f2330] p-6 border-b border-gray-800 flex justify-between items-center relative z-20">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    ${deptName.charAt(0)}
                </div>
                <div>
                    <h3 class="text-xl font-bold text-white">${deptName}</h3>
                    <p class="text-sm text-gray-400">Balans: <span class="font-bold text-white">${moneyFormatter.format(total)}</span></p>
                </div>
            </div>
            <button onclick="closeBudgetDetail()" class="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"><i data-lucide="x" class="w-6 h-6"></i></button>
        </div>
        
        <div class="p-4 bg-[#181b25] border-b border-gray-800 grid grid-cols-3 gap-4">
            <button onclick="showBudgetAction('${deptName}', 'income')" class="group flex items-center justify-center gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all">
                <div class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform"><i data-lucide="plus" class="w-4 h-4"></i></div>
                <div class="text-left">
                    <span class="block text-xs font-bold text-emerald-500 uppercase">Inkomsten</span>
                    <span class="block text-xs text-gray-400">Storten</span>
                </div>
            </button>
            <button onclick="showBudgetAction('${deptName}', 'expense')" class="group flex items-center justify-center gap-3 p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all">
                <div class="w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform"><i data-lucide="minus" class="w-4 h-4"></i></div>
                <div class="text-left">
                    <span class="block text-xs font-bold text-rose-500 uppercase">Uitgaven</span>
                    <span class="block text-xs text-gray-400">Afschrijven</span>
                </div>
            </button>
            <button onclick="showLidgeldAction('${deptName}')" class="group flex items-center justify-center gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all">
                <div class="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform"><i data-lucide="coins" class="w-4 h-4"></i></div>
                <div class="text-left">
                    <span class="block text-xs font-bold text-amber-500 uppercase">4-uurtje</span>
                    <span class="block text-xs text-gray-400">Verrekenen</span>
                </div>
            </button>
        </div>
        
        <div class="flex-1 overflow-y-auto custom-scrollbar p-0 bg-[#0f111a]">
            <table class="w-full text-left text-sm text-gray-400">
                <thead class="bg-[#13151c] sticky top-0 z-10 text-xs font-bold uppercase text-gray-500">
                    <tr><th class="px-6 py-3">Datum</th><th class="px-6 py-3">Detail</th><th class="px-6 py-3 text-right">Bedrag</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-800/50">
                    ${txs.length ? txs.map(t => `
                        <tr class="hover:bg-white/5 transition-colors">
                            <td class="px-6 py-4 font-mono text-gray-400 text-xs whitespace-nowrap">${dateFormatter.format(new Date(t.datum))}</td>
                            <td class="px-6 py-4 text-white">
                                <div class="font-bold text-sm text-gray-200">${t.description}</div>
                                <div class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mt-0.5">${t.category || 'Algemeen'}</div>
                            </td>
                            <td class="px-6 py-4 text-right font-bold font-mono ${t.type === 'income' ? 'text-emerald-400' : 'text-rose-400'} whitespace-nowrap">
                                ${t.type === 'income' ? '+' : '-'} ${moneyFormatter.format(t.amount)}
                            </td>
                        </tr>`).join('') 
                    : `<tr><td colspan="3" class="text-center p-12"><div class="flex flex-col items-center gap-3 text-gray-600"><i data-lucide="inbox" class="w-10 h-10 opacity-50"></i><span>Nog geen transacties</span></div></td></tr>`}
                </tbody>
            </table>
        </div>
    </div>`;
    
    modal.classList.remove('hidden');
    lucide.createIcons();
}

window.closeBudgetDetail = () => {
    document.getElementById('budget-modal').classList.add('hidden');
}

// --- SUB-FORMS: Gestroomlijnd ---
window.showBudgetAction = (deptName, type) => {
    const modal = document.querySelector('#budget-modal > div:last-child');
    const color = type === 'income' ? 'emerald' : 'rose';
    const today = new Date().toISOString().split("T")[0];

    modal.innerHTML = `
        <div class="bg-[#1f2330] p-6 border-b border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
                <div class="p-2 rounded-lg bg-${color}-500/20 text-${color}-400"><i data-lucide="${type === 'income' ? 'arrow-down-to-line' : 'arrow-up-from-line'}"></i></div>
                ${type === 'income' ? 'Budget Verhogen' : 'Kosten Inboeken'}
            </h3>
            <button onclick="openBudgetDetail('${deptName}')" class="text-sm text-gray-400 hover:text-white underline">Terug</button>
        </div>
        
        <form onsubmit="submitBudgetTransaction(event, '${deptName}', '${type}')" class="p-8 space-y-6">
            <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Bedrag</label>
                <div class="relative">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xl">€</span>
                    <input type="number" id="budget-amount" step="0.01" min="0" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-4 pl-10 pr-4 text-white focus:border-${color}-500 focus:ring-1 focus:ring-${color}-500 outline-none font-mono text-2xl transition-all placeholder-gray-700" placeholder="0.00" autofocus>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-6">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Datum</label>
                    <input type="date" id="budget-date" value="${today}" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-${color}-500 outline-none">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Categorie</label>
                    <select id="budget-cat" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-${color}-500 outline-none">
                        <option>Materiaal</option><option>Eten</option><option>Drank</option><option>Verhuur</option><option>Activiteit</option><option>Overige</option>
                    </select>
                </div>
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Omschrijving</label>
                <input type="text" id="budget-desc" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-${color}-500 outline-none" placeholder="Waarvoor dient dit?">
            </div>
            
            <button type="submit" class="w-full py-4 rounded-xl bg-${color}-600 hover:bg-${color}-500 text-white font-bold shadow-lg shadow-${color}-500/20 mt-4 transition-all transform active:scale-[0.98]">
                Transactie Voltooien
            </button>
        </form>`;
    lucide.createIcons();
}

// --- SUB-FORM: 4-Uurtje (Calculated) ---
window.showLidgeldAction = async (deptName) => {
    const modal = document.querySelector('#budget-modal > div:last-child');
    // Default vorige zondag
    const d = new Date();
    if (d.getDay() !== 0) d.setDate(d.getDate() - d.getDay());
    const sundayStr = d.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="bg-[#1f2330] p-6 border-b border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold text-white flex items-center gap-2"><div class="p-2 bg-amber-500/20 rounded-lg text-amber-400"><i data-lucide="calculator"></i></div> 4-uurtje Verrekenen</h3>
            <button onclick="openBudgetDetail('${deptName}')" class="text-sm text-gray-400 hover:text-white underline">Terug</button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[70vh]">
            <div class="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl mb-6 flex items-center justify-between">
                <div>
                    <label class="block text-xs font-bold text-indigo-300 uppercase mb-1">Datum Telling</label>
                    <input type="date" id="calc-date" value="${sundayStr}" class="bg-transparent text-white font-bold focus:outline-none border-b border-indigo-500/50 pb-1" onchange="fetchAttendanceForCalc('${deptName}')">
                </div>
                <div class="text-right">
                    <span class="text-xs text-indigo-400/60 block">Status</span>
                    <span id="calc-status" class="text-xs font-bold text-indigo-400">Controleren...</span>
                </div>
            </div>

            <div id="attendance-feedback" class="mb-6 hidden animate-in fade-in"></div>

            <div class="grid grid-cols-2 gap-5 mb-6">
                 <div class="p-4 bg-[#0f111a] rounded-xl border border-gray-800">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Aanwezig</label>
                    <input type="number" id="calc-count" min="0" class="w-full bg-transparent text-white text-2xl font-mono font-bold outline-none border-b border-gray-700 focus:border-amber-500 transition-colors" oninput="calculateLidgeld()">
                 </div>
                 <div class="p-4 bg-[#0f111a] rounded-xl border border-gray-800">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Prijs / Stuk</label>
                    <div class="flex items-center">
                        <span class="text-gray-500 mr-2">€</span>
                        <input type="number" id="calc-price" value="2.00" step="0.10" min="0" class="w-full bg-transparent text-white text-2xl font-mono font-bold outline-none border-b border-gray-700 focus:border-amber-500 transition-colors" oninput="calculateLidgeld()">
                    </div>
                 </div>
            </div>
            
            <div class="p-5 bg-[#0f111a] rounded-xl mb-6 border border-gray-800 shadow-inner">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-xs text-rose-400 font-bold uppercase">Aantal leden niet betaald?</span>
                    <div class="w-20"><input type="number" id="calc-nopay" value="0" min="0" class="w-full bg-[#181b25] border border-rose-900/30 focus:border-rose-500 rounded-lg text-right text-rose-400 font-bold py-1 px-2 outline-none" oninput="calculateLidgeld()"></div>
                </div>
                <div class="flex justify-between items-end pt-4 border-t border-gray-800">
                    <span class="font-bold text-gray-400 text-sm uppercase tracking-widest pb-1">Totaal Kas</span>
                    <span class="font-mono text-4xl font-black text-emerald-400" id="calc-total">€ 0,00</span>
                </div>
            </div>

            <button id="btn-save-lidgeld" onclick="submitLidgeldTransaction('${deptName}')" class="w-full py-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold shadow-lg shadow-amber-900/20 transition-all transform active:scale-[0.98] flex justify-center items-center gap-2">
                <i data-lucide="check-circle" class="w-5 h-5"></i> Kas Inboeken
            </button>
        </div>`;
    
    lucide.createIcons();
    await fetchAttendanceForCalc(deptName);
}

// Helper 4-uurtje
window.fetchAttendanceForCalc = async (deptName) => {
    const date = document.getElementById('calc-date').value;
    const statusEl = document.getElementById('calc-status');
    const feedbackBox = document.getElementById('attendance-feedback');
    
    statusEl.innerText = "Syncing...";
    
    const { data } = await supabaseClient
        .from(COLLECTION_NAMES.AANWEZIGHEDEN)
        .select('afdelingen')
        .eq('datum', date)
        .maybeSingle();
    
    let count = 0;
    let comment = "";
    let found = false;

    if (data && data.afdelingen) {
        let arr = typeof data.afdelingen === 'string' ? JSON.parse(data.afdelingen) : data.afdelingen;
        const entry = arr.find(a => a.naam === deptName);
        if(entry) {
            count = parseInt(entry.aantal) || 0;
            comment = entry.opmerking || "";
            found = true;
        }
    }
    
    document.getElementById('calc-count').value = count;
    
    if (!found) {
        statusEl.innerText = "Geen Data";
        statusEl.className = "text-xs font-bold text-rose-400";
        feedbackBox.innerHTML = `<div class="text-amber-500 text-xs bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 flex gap-2"><i data-lucide="alert-triangle" class="w-4 h-4"></i><span>Geen telling gevonden. Vul aantal handmatig in.</span></div>`;
    } else {
        statusEl.innerText = "Gesynchroniseerd";
        statusEl.className = "text-xs font-bold text-emerald-400";
        if(comment) feedbackBox.innerHTML = `<div class="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-xs text-blue-300 flex gap-2"><i data-lucide="message-square" class="w-4 h-4"></i><span>Opmerking: "${comment}"</span></div>`;
        else feedbackBox.innerHTML = ''; // Clear if no comment
        feedbackBox.classList.remove('hidden');
    }
    lucide.createIcons();
    calculateLidgeld();
}

window.calculateLidgeld = () => {
    const count = parseInt(document.getElementById('calc-count').value) || 0;
    const price = parseFloat(document.getElementById('calc-price').value) || 0;
    const noPay = parseInt(document.getElementById('calc-nopay').value) || 0;
    
    const total = Math.max(0, (count - noPay) * price);
    document.getElementById('calc-total').innerText = moneyFormatter.format(total);
}

// --- SUBMIT HANDLERS (Generic) ---
// Vervang de volledige window.submitLidgeldTransaction functie in js/financien.js

window.submitLidgeldTransaction = async (deptName) => {
    const btn = document.getElementById('btn-save-lidgeld');
    const date = document.getElementById('calc-date').value;
    const count = document.getElementById('calc-count').value;
    const noPay = document.getElementById('calc-nopay').value;
    
    // Bedrag ophalen en formatteren
    const amountStr = document.getElementById('calc-total').innerText.replace(/[^0-9,-]+/g,"").replace(',', '.');
    const amount = parseFloat(amountStr);

    // Validatie: mag niet 0 zijn tenzij bevestigd
    if (amount <= 0 && !confirm("Het totaalbedrag is € 0.00. Wil je dit toch opslaan?")) return;

    // Beschrijving genereren
    let desc = `Lidgeld ${dateFormatter.format(new Date(date))}`;
    if (parseInt(noPay) > 0) desc += ` (${count} aanwezig, ${noPay} gratis)`;
    else desc += ` (${count} aanwezig)`;

    // UI op laden zetten
    const originalContent = btn.innerHTML;
    setLoading(btn, true);

    try {
        // STAP 1: CHECK OP DUPLICATEN
        // Zoek of er al een transactie is voor deze afdeling, op deze datum, met categorie Lidgeld
        const { data: existingRecord, error: fetchError } = await supabaseClient
            .from(COLLECTION_NAMES.FINANCES)
            .select('id')
            .eq('datum', date)
            .eq('afdeling', deptName) // We checken specifiek op deze afdeling
            .eq('category', 'Lidgeld')
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (existingRecord) {
            // STAP 2: BESTAAT AL -> VRAAG OM TE OVERSCHRIJVEN
            let overwrite = false;
            
            // Gebruik onze mooie modal indien beschikbaar, anders standaard confirm
            if (typeof window.askConfirmation === 'function') {
                overwrite = await window.askConfirmation(
                    "Reeds verwerkt", 
                    `Er bestaat al een afrekening voor ${deptName} op ${new Date(date).toLocaleDateString('nl-BE')}.\n\nWil je de oude overschrijven met deze nieuwe berekening?`
                );
            } else {
                overwrite = confirm(`Er is al een afrekening voor ${deptName} op deze datum. Overschrijven?`);
            }

            if (!overwrite) {
                setLoading(btn, false, originalContent);
                return; // Gebruiker annuleert
            }

            // STAP 3: UPDATE DE BESTAANDE
            const { error: updateError } = await supabaseClient
                .from(COLLECTION_NAMES.FINANCES)
                .update({
                    amount: amount,
                    description: desc,
                    user: currentUser.name,
                    // We updaten datum/afdeling niet want die zijn hetzelfde, 
                    // maar timestamp update is wel handig voor sortering:
                    created_at: new Date().toISOString() 
                })
                .eq('id', existingRecord.id);

            if (updateError) throw updateError;
            showToast('Afrekening succesvol bijgewerkt!', 'success');

        } else {
            // STAP 4: BESTAAT NOG NIET -> NIEUWE INVOEREN
            const { error: insertError } = await supabaseClient
                .from(COLLECTION_NAMES.FINANCES)
                .insert({
                    type: 'income',
                    amount: amount,
                    description: desc,
                    afdelingen: [deptName],
                    afdeling: deptName,
                    datum: date,
                    category: 'Lidgeld',
                    user: currentUser.name
                });

            if (insertError) throw insertError;
            showToast('Lidgeld succesvol geboekt!', 'success');
        }

        // Alles klaar: Herlaad data en sluit modal niet (zodat ze zien dat het gelukt is), of refresh budget
        await loadData();
        openBudgetDetail(deptName); // Ververs de lijst in de modal

    } catch(err) {
        console.error(err);
        showToast('Fout bij verwerken.', 'error');
        setLoading(btn, false, originalContent);
    }
}
window.toggleFormColors = (type) => {
    // Visuele feedback knopkleur
    const btn = document.getElementById('btn-submit-main');
    if(type === 'income') {
        btn.className = "w-full bg-emerald-600 hover:bg-emerald-500 py-5 rounded-2xl text-white font-bold shadow-lg shadow-emerald-500/25 mt-4 transition-all transform active:scale-[0.98] text-sm uppercase tracking-wider flex justify-center items-center gap-2";
    } else {
        btn.className = "w-full bg-rose-600 hover:bg-rose-500 py-5 rounded-2xl text-white font-bold shadow-lg shadow-rose-500/25 mt-4 transition-all transform active:scale-[0.98] text-sm uppercase tracking-wider flex justify-center items-center gap-2";
    }
}

window.submitTransaction = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-main');
    const originalContent = btn.innerHTML;
    
    setLoading(btn, true);

    const type = document.querySelector('input[name="type"]:checked').value;
    const amount = document.getElementById("amount").value;
    const dept = document.getElementById("dept-select").value;
    const desc = document.getElementById("description").value;
    const date = document.getElementById("date").value;

    const { error } = await supabaseClient.from(COLLECTION_NAMES.FINANCES).insert({
        type, 
        amount, 
        description: desc, 
        afdelingen: [dept], 
        afdeling: dept, 
        datum: date, 
        category: 'Handmatig',
        user: currentUser.name
    });

    if(error) { 
        showToast("Opslaan mislukt.", "error"); 
        console.error(error);
        setLoading(btn, false, originalContent);
    } else { 
        showToast("Transactie toegevoegd.", "success"); 
        await loadData(); 
        switchTab("overview");
    }
};