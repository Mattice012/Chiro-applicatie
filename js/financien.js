// js/financien.js

let activeTab = "overview";
let cachedFinances = [];

window.onload = async () => {
  try {
    if (typeof renderLayout === "function") renderLayout();
    const user = await requireAuth();
    if (!user) return;

    // Check rechten
    const role = USER_ROLES[currentUser.role];
    if (!role.canViewFinances) {
      document.getElementById("fin-content").innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-rose-500 bg-[#181b25] rounded-3xl border border-rose-900/30">
            <i data-lucide="lock" class="w-12 h-12 mb-4"></i>
            <h2 class="text-xl font-bold">Geen toegang</h2>
            <p class="text-gray-400">Jouw rol (${currentUser.role}) mag geen financiën inzien.</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    await loadData();
    renderView();
  } catch (e) {
    console.error(e);
  }
};

// --- DATA OPHALEN ---
async function loadData() {
  const { data, error } = await supabaseClient
    .from(COLLECTION_NAMES.FINANCES)
    .select("*")
    .order("datum", { ascending: false })
    .limit(500);

  if (error) {
    console.error(error);
    showToast("Kon financiën niet laden", "error");
  } else {
    cachedFinances = data;
  }
}

// --- TAB NAVIGATIE ---
window.switchTab = (tabName) => {
  activeTab = tabName;
  document.querySelectorAll('[id^="tab-"]').forEach((btn) => {
    btn.classList.remove("bg-indigo-600", "text-white", "shadow-lg");
    btn.classList.add("text-gray-400");
  });
  const activeBtn = document.getElementById(`tab-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.add("bg-indigo-600", "text-white", "shadow-lg");
    activeBtn.classList.remove("text-gray-400");
  }
  renderView();
};

function renderView() {
  const container = document.getElementById("fin-content");
  if (activeTab === "overview") container.innerHTML = renderOverviewHtml();
  else if (activeTab === "add") container.innerHTML = renderAddFormHtml();
  else if (activeTab === "budgets") renderBudgetsView(container);
  
  lucide.createIcons();
}

// =============================================================================
// VIEW 1: OVERZICHT (GLOBAAL)
// =============================================================================
function renderOverviewHtml() {
  const totalIncome = cachedFinances.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = cachedFinances.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);
  const balance = totalIncome - totalExpense;

  return `
    <div class="space-y-8 animate-in fade-in zoom-in duration-300">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${renderKpiCard('Huidig Saldo', balance, 'Totaal Chiro', 'wallet', balance >= 0 ? 'text-white' : 'text-rose-400', 'bg-indigo-500')}
            ${renderKpiCard('Totaal Inkomsten', totalIncome, 'Dit werkjaar', 'trending-up', 'text-emerald-400', 'bg-emerald-500')}
            ${renderKpiCard('Totaal Uitgaven', totalExpense, 'Dit werkjaar', 'trending-down', 'text-rose-400', 'bg-rose-500')}
        </div>

        <div class="bg-[#181b25] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
            <div class="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1f2330]/30">
                <h3 class="font-bold text-white flex items-center gap-2"><i data-lucide="list" class="w-4 h-4 text-indigo-400"></i> Recente Transacties</h3>
            </div>
            <div class="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                <table class="w-full text-left text-sm text-gray-400">
                    <thead class="bg-[#13151c] text-xs uppercase font-bold text-gray-500 sticky top-0">
                        <tr><th class="px-6 py-4">Datum</th><th class="px-6 py-4">Omschrijving</th><th class="px-6 py-4">Afdelingen</th><th class="px-6 py-4 text-right">Bedrag</th></tr>
                    </thead>
                    <tbody class="divide-y divide-gray-800/50">
                        ${cachedFinances.map(t => renderTransactionRow(t)).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

function renderKpiCard(title, amount, sub, icon, textColor, colorClass) {
    return `
    <div class="bg-[#181b25] border border-gray-800 p-6 rounded-2xl relative overflow-hidden group">
        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <i data-lucide="${icon}" class="w-16 h-16 text-${colorClass.split('-')[1]}-500"></i>
        </div>
        <p class="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">${title}</p>
        <p class="text-3xl font-black ${textColor} tracking-tight">${formatCurrency(amount)}</p>
        <p class="text-xs text-gray-500 mt-1">${sub}</p>
    </div>`;
}

function renderTransactionRow(t) {
    let tags = "";
    if (t.afdelingen && Array.isArray(t.afdelingen)) {
        tags = t.afdelingen.map(afd => `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mr-1">${afd}</span>`).join("");
    } else if (typeof t.afdeling === 'string') {
        tags = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mr-1">${t.afdeling}</span>`;
    } else {
        tags = `<span class="text-xs italic text-gray-600">Algemeen</span>`;
    }

    return `
    <tr class="hover:bg-[#1f2330]/50 transition-colors group">
        <td class="px-6 py-4 font-mono text-gray-300 whitespace-nowrap">${new Date(t.datum).toLocaleDateString("nl-BE")}</td>
        <td class="px-6 py-4 text-white font-medium">${t.description || "-"} <span class="text-xs text-gray-600 block">${t.user ? 'door ' + t.user : ''}</span></td>
        <td class="px-6 py-4">${tags}</td>
        <td class="px-6 py-4 text-right font-bold font-mono ${t.type === "income" ? "text-emerald-400" : "text-rose-400"}">
            ${t.type === "income" ? "+" : "-"} ${formatCurrency(t.amount)}
        </td>
    </tr>`;
}

// =============================================================================
// VIEW 2: VIRTUELE REKENINGEN (PER AFDELING)
// =============================================================================
function renderBudgetsView(container) {
    const deptBalances = {};
    AFDELINGEN_CONFIG.forEach(afd => deptBalances[afd.naam] = { balance: 0, transactions: [], color: afd.kleur });
    deptBalances['Algemeen'] = { balance: 0, transactions: [], color: 'gray' };

    cachedFinances.forEach(t => {
        const amount = parseFloat(t.amount);
        const isIncome = t.type === 'income';
        const netAmount = isIncome ? amount : -amount;
        let involvedDepts = [];
        if (Array.isArray(t.afdelingen)) involvedDepts = t.afdelingen;
        else if (t.afdeling) involvedDepts = [t.afdeling];
        else involvedDepts = ['Algemeen'];
        
        const splitAmount = netAmount / involvedDepts.length;

        involvedDepts.forEach(deptName => {
            if(deptBalances[deptName]) {
                deptBalances[deptName].balance += splitAmount;
                deptBalances[deptName].transactions.push(t);
            }
        });
    });

    let cardsHtml = AFDELINGEN_CONFIG.map(afd => {
        const data = deptBalances[afd.naam];
        const balance = data.balance;
        const color = afd.kleur || 'indigo';
        
        return `
        <div onclick="openBudgetDetail('${afd.naam}')" class="cursor-pointer group relative overflow-hidden rounded-2xl border border-${color}-500/30 bg-[#181b25] p-6 hover:-translate-y-1 hover:shadow-2xl hover:shadow-${color}-500/10 transition-all duration-300">
            <div class="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-${color}-500/10 blur-xl group-hover:bg-${color}-500/20 transition-all"></div>
            
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-white text-lg">${afd.naam}</h3>
                <div class="rounded-full bg-${color}-500/20 p-2 text-${color}-400">
                    <i data-lucide="credit-card" class="h-5 w-5"></i>
                </div>
            </div>
            
            <div class="flex flex-col">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-widest">Saldo</span>
                <span class="text-3xl font-black text-white tracking-tight mt-1 group-hover:text-${color}-400 transition-colors">
                    € ${balance.toFixed(2)}
                </span>
            </div>
            
            <div class="mt-4 flex items-center gap-2 text-xs font-medium text-gray-400">
                <span>${data.transactions.length} transacties</span>
                <i data-lucide="chevron-right" class="w-3 h-3 group-hover:translate-x-1 transition-transform"></i>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
    <div class="animate-in fade-in zoom-in duration-300">
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-white">Virtuele Rekeningen</h2>
            <p class="text-gray-400 text-sm">Beheer het budget per afdeling. Klik op een kaart voor details.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            ${cardsHtml}
        </div>
    </div>`;
}

// --- DETAIL MODAL & ACTIES ---
window.openBudgetDetail = (deptName) => {
    const txs = cachedFinances.filter(t => {
        if (Array.isArray(t.afdelingen)) return t.afdelingen.includes(deptName);
        if (t.afdeling) return t.afdeling === deptName;
        return false;
    });

    const total = txs.reduce((sum, t) => sum + (t.type==='income' ? t.amount : -t.amount), 0);
    const modal = document.getElementById('budget-modal');
    
    modal.innerHTML = `
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onclick="closeBudgetDetail()"></div>
    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[#181b25] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div class="bg-[#1f2330] p-6 border-b border-gray-700 flex justify-between items-start">
            <div>
                <h3 class="text-2xl font-bold text-white mb-1">${deptName}</h3>
                <p class="text-gray-400 text-sm">Huidig saldo: <span class="font-bold ${total>=0?'text-emerald-400':'text-rose-400'}">€ ${total.toFixed(2)}</span></p>
            </div>
            <button onclick="closeBudgetDetail()" class="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"><i data-lucide="x" class="w-6 h-6"></i></button>
        </div>

        <div class="p-6 bg-[#181b25] border-b border-gray-800 grid grid-cols-2 gap-4">
            <button onclick="showBudgetAction('${deptName}', 'income')" class="flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all font-bold group">
                <div class="p-1 bg-emerald-500/20 rounded-full group-hover:bg-white/20"><i data-lucide="arrow-down-to-line" class="w-4 h-4"></i></div>
                Storten
            </button>
            <button onclick="showBudgetAction('${deptName}', 'expense')" class="flex items-center justify-center gap-2 py-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all font-bold group">
                <div class="p-1 bg-rose-500/20 rounded-full group-hover:bg-white/20"><i data-lucide="arrow-up-from-line" class="w-4 h-4"></i></div>
                Afschrijven
            </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-0">
            <table class="w-full text-left text-sm text-gray-400">
                <thead class="bg-[#13151c] text-xs uppercase font-bold text-gray-500 sticky top-0">
                    <tr><th class="px-6 py-3">Datum</th><th class="px-6 py-3">Transactie</th><th class="px-6 py-3 text-right">Bedrag</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-800/50">
                    ${txs.length ? txs.map(t => `
                        <tr class="hover:bg-white/5">
                            <td class="px-6 py-3 font-mono text-gray-400">${new Date(t.datum).toLocaleDateString('nl-BE')}</td>
                            <td class="px-6 py-3 text-white">
                                <div class="font-medium">${t.description}</div>
                                <div class="text-xs text-gray-500">${t.category || 'Algemeen'}</div>
                            </td>
                            <td class="px-6 py-3 text-right font-bold font-mono ${t.type==='income'?'text-emerald-400':'text-rose-400'}">
                                ${t.type==='income'?'+':'-'} € ${t.amount.toFixed(2)}
                            </td>
                        </tr>
                    `).join('') : `<tr><td colspan="3" class="text-center p-8 text-gray-500 italic">Nog geen transacties.</td></tr>`}
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

window.showBudgetAction = (deptName, type) => {
    const modal = document.querySelector('#budget-modal > div:last-child');
    const color = type === 'income' ? 'emerald' : 'rose';
    const title = type === 'income' ? 'Geld storten op rekening' : 'Kosten afschrijven van rekening';
    const icon = type === 'income' ? 'arrow-down-to-line' : 'arrow-up-from-line';
    const btnText = type === 'income' ? 'Storten bevestigen' : 'Afschrijving bevestigen';

    modal.innerHTML = `
        <div class="bg-[#1f2330] p-6 border-b border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold text-white flex items-center gap-2"><i data-lucide="${icon}" class="text-${color}-400"></i> ${title}</h3>
            <button onclick="openBudgetDetail('${deptName}')" class="text-sm text-gray-400 hover:text-white underline">Terug</button>
        </div>
        <form onsubmit="submitBudgetTransaction(event, '${deptName}', '${type}')" class="p-6 space-y-4">
            <div class="bg-${color}-500/10 border border-${color}-500/20 p-4 rounded-xl flex items-center gap-4 mb-4">
                <div class="w-10 h-10 rounded-full bg-${color}-500 flex items-center justify-center text-white shadow-lg"><i data-lucide="credit-card"></i></div>
                <div>
                    <p class="text-xs font-bold text-${color}-400 uppercase">Rekening</p>
                    <p class="text-lg font-bold text-white">${deptName}</p>
                </div>
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Bedrag (€)</label>
                <input type="number" id="budget-amount" step="0.01" min="0" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-${color}-500 outline-none font-mono text-xl" placeholder="0.00" autofocus>
            </div>
            
            <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Mededeling</label>
                <input type="text" id="budget-desc" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-${color}-500 outline-none" placeholder="Bv. Winst verkoop, Materiaal...">
            </div>

            <button type="submit" class="w-full py-4 rounded-xl bg-${color}-600 hover:bg-${color}-500 text-white font-bold shadow-lg mt-4 transition-all">
                ${btnText}
            </button>
        </form>
    `;
    lucide.createIcons();
}

window.submitBudgetTransaction = async (e, deptName, type) => {
    e.preventDefault();
    const amount = document.getElementById('budget-amount').value;
    const desc = document.getElementById('budget-desc').value;

    const btn = e.target.querySelector('button');
    btn.innerHTML = `<div class="loader w-4 h-4 border-white inline-block mr-2"></div> Verwerken...`;
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.from(COLLECTION_NAMES.FINANCES).insert({
            type: type,
            amount: amount,
            description: desc,
            afdelingen: [deptName],
            afdeling: deptName,
            datum: new Date().toISOString().split('T')[0],
            category: 'Rekening',
            user: currentUser.name
        });

        if (error) throw error;
        
        showToast('Transactie verwerkt!', 'success');
        await loadData();
        openBudgetDetail(deptName);
    } catch(err) {
        console.error(err);
        showToast('Fout bij verwerken.', 'error');
        btn.disabled = false;
        btn.innerHTML = 'Opnieuw proberen';
    }
}

// =============================================================================
// VIEW 3: TOEVOEGEN (ORIGINEEL)
// =============================================================================
function renderAddFormHtml() {
  const today = new Date().toISOString().split("T")[0];
  return `
    <div class="max-w-2xl mx-auto animate-in fade-in zoom-in duration-300">
        <div class="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div>
                <h3 class="text-orange-400 font-bold text-sm flex items-center gap-2"><i data-lucide="shopping-cart" class="w-4 h-4"></i> Webshop Koppeling</h3>
                <p class="text-xs text-gray-400 mt-1">Haalt bestellingen op van de geselecteerde datum hieronder.</p>
            </div>
            <button type="button" onclick="importWebshopData()" class="bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2"><i data-lucide="download-cloud" class="w-4 h-4"></i> Bereken Totaal</button>
        </div>

        <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 md:p-8 shadow-2xl">
            <h2 class="text-xl font-bold text-white mb-6 flex items-center gap-2"><i data-lucide="plus-square" class="text-indigo-500"></i> Transactie Toevoegen</h2>
            <form id="finance-form" onsubmit="submitTransaction(event)" class="space-y-6">
                <div class="grid grid-cols-2 gap-4">
                    <label class="cursor-pointer">
                        <input type="radio" name="type" value="income" id="radio-income" class="peer sr-only" checked>
                        <div class="p-4 rounded-xl border border-gray-700 bg-[#1f2330]/50 peer-checked:border-emerald-500 peer-checked:bg-emerald-500/10 hover:border-gray-600 transition-all text-center">
                            <i data-lucide="arrow-up-circle" class="mx-auto mb-2 text-emerald-400"></i><span class="font-bold text-emerald-400">Inkomsten</span>
                        </div>
                    </label>
                    <label class="cursor-pointer">
                        <input type="radio" name="type" value="expense" id="radio-expense" class="peer sr-only">
                        <div class="p-4 rounded-xl border border-gray-700 bg-[#1f2330]/50 peer-checked:border-rose-500 peer-checked:bg-rose-500/10 hover:border-gray-600 transition-all text-center">
                            <i data-lucide="arrow-down-circle" class="mx-auto mb-2 text-rose-400"></i><span class="font-bold text-rose-400">Uitgaven</span>
                        </div>
                    </label>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Bedrag (€)</label>
                        <div class="relative"><span class="absolute left-4 top-3 text-gray-400">€</span><input type="number" id="amount" step="0.01" min="0" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 pl-8 pr-4 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-lg transition-all" placeholder="0.00"></div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Datum</label>
                        <input type="date" id="date" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all" value="${today}">
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Omschrijving</label>
                    <input type="text" id="description" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all" placeholder="Bv. Aankoop verf voor Rakkers">
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-3">Betrokken Afdeling(en)</label>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <label class="cursor-pointer select-none">
                            <input type="checkbox" name="afdeling" value="Algemeen" id="check-algemeen" class="peer sr-only" checked onchange="toggleAlgemeen(this)">
                            <div class="px-3 py-2 rounded-lg border border-gray-700 bg-[#1f2330] peer-checked:bg-white peer-checked:text-black peer-checked:border-white text-xs font-bold text-center transition-all">Algemeen</div>
                        </label>
                        ${AFDELINGEN_CONFIG.map(afd => `
                            <label class="cursor-pointer select-none">
                                <input type="checkbox" name="afdeling" value="${afd.naam}" class="peer sr-only afd-check" onchange="checkAlgemeen()">
                                <div class="px-3 py-2 rounded-lg border border-gray-700 bg-[#1f2330] peer-checked:bg-${afd.kleur}-500 peer-checked:border-${afd.kleur}-500 peer-checked:text-white text-xs font-bold text-center transition-all hover:border-gray-500">${afd.naam}</div>
                            </label>`).join("")}
                    </div>
                </div>

                <button type="submit" id="submit-btn" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"><span>Transactie Opslaan</span><i data-lucide="save" class="w-5 h-5"></i></button>
            </form>
        </div>
    </div>`;
}

window.toggleAlgemeen = (checkbox) => { if (checkbox.checked) document.querySelectorAll(".afd-check").forEach((c) => (c.checked = false)); };
window.checkAlgemeen = () => { const algemeen = document.querySelector('input[value="Algemeen"]'); const others = document.querySelectorAll(".afd-check:checked"); if (others.length > 0) algemeen.checked = false; };

window.importWebshopData = async () => {
  const btn = document.querySelector('button[onclick="importWebshopData()"]');
  const dateInput = document.getElementById("date").value;
  const originalContent = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<div class="loader w-3 h-3 border-white"></div> Laden...`;

  try {
    const { data: prices } = await supabaseClient.from(COLLECTION_NAMES.BROOD_PRICES_DOC).select('*').eq('id', 1).single();
    if(!prices) throw new Error("Geen prijzen ingesteld.");

    const { data: orders, error } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select("items").eq('date', dateInput);
    if (error) throw error;
    if (!orders || orders.length === 0) { showToast(`Geen bestellingen gevonden voor ${dateInput}`, "error"); return; }

    let grandTotal = 0;
    orders.forEach(order => {
        const i = order.items || {whiteBread:0, brownBread:0, choco:0, jam:0};
        const cost = (i.whiteBread * (prices.whiteBread||0)) + (i.brownBread * (prices.brownBread||0)) + (i.choco * (prices.choco||0)) + (i.jam * (prices.jam||0));
        grandTotal += cost;
    });

    document.getElementById("amount").value = grandTotal.toFixed(2);
    document.getElementById("description").value = `Webshop inkomsten ${new Date(dateInput).toLocaleDateString('nl-BE')} (${orders.length} bestellingen)`;
    document.getElementById("radio-income").checked = true;
    const checkAlgemeen = document.getElementById("check-algemeen");
    if (checkAlgemeen) { checkAlgemeen.checked = true; window.toggleAlgemeen(checkAlgemeen); }

    showToast(`€ ${grandTotal.toFixed(2)} berekend!`, "success");
  } catch (err) { console.error("Webshop import error:", err); showToast(err.message || "Kon data niet berekenen.", "error"); } finally { btn.disabled = false; btn.innerHTML = originalContent; lucide.createIcons(); }
};

window.submitTransaction = async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submit-btn");
  const originalText = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<div class="loader w-5 h-5 border-white"></div> Opslaan...`;

  try {
    const type = document.querySelector('input[name="type"]:checked').value;
    const amount = document.getElementById("amount").value;
    const date = document.getElementById("date").value;
    const desc = document.getElementById("description").value;
    const selectedDepts = Array.from(document.querySelectorAll('input[name="afdeling"]:checked')).map((cb) => cb.value);
    if (selectedDepts.length === 0) selectedDepts.push("Algemeen");

    const { error } = await supabaseClient.from(COLLECTION_NAMES.FINANCES).insert([{ type: type, amount: amount, description: desc, afdelingen: selectedDepts, datum: date, user: currentUser.name }]);
    if (error) throw error;
    showToast("Transactie opgeslagen!", "success");
    await loadData();
    switchTab("overview");
  } catch (err) { console.error(err); showToast(err.message || "Fout bij opslaan", "error"); btn.disabled = false; btn.innerHTML = originalText; }
};