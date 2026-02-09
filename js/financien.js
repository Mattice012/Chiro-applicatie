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

  if (error) { console.error(error); showToast("Kon financiën niet laden", "error"); } 
  else { cachedFinances = data; }
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
// VIEW 1: OVERZICHT
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
            <div class="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1f2330]/30"><h3 class="font-bold text-white flex items-center gap-2"><i data-lucide="list" class="w-4 h-4 text-indigo-400"></i> Recente Transacties</h3></div>
            <div class="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                <table class="w-full text-left text-sm text-gray-400">
                    <thead class="bg-[#13151c] text-xs uppercase font-bold text-gray-500 sticky top-0"><tr><th class="px-6 py-4">Datum</th><th class="px-6 py-4">Omschrijving</th><th class="px-6 py-4">Afdelingen</th><th class="px-6 py-4 text-right">Bedrag</th></tr></thead>
                    <tbody class="divide-y divide-gray-800/50">${cachedFinances.map(t => renderTransactionRow(t)).join("")}</tbody>
                </table>
            </div>
        </div>
    </div>`;
}

function renderKpiCard(title, amount, sub, icon, textColor, colorClass) {
    return `<div class="bg-[#181b25] border border-gray-800 p-6 rounded-2xl relative overflow-hidden group">
        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><i data-lucide="${icon}" class="w-16 h-16 text-${colorClass.split('-')[1]}-500"></i></div>
        <p class="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">${title}</p><p class="text-3xl font-black ${textColor} tracking-tight">€ ${parseFloat(amount).toFixed(2)}</p><p class="text-xs text-gray-500 mt-1">${sub}</p>
    </div>`;
}

function renderTransactionRow(t) {
    let tags = (t.afdelingen || (t.afdeling ? [t.afdeling] : [])).map(afd => `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mr-1">${afd}</span>`).join("") || `<span class="text-xs italic text-gray-600">Algemeen</span>`;
    return `<tr class="hover:bg-[#1f2330]/50 transition-colors group">
        <td class="px-6 py-4 font-mono text-gray-300 whitespace-nowrap">${new Date(t.datum).toLocaleDateString("nl-BE")}</td>
        <td class="px-6 py-4 text-white font-medium">${t.description || "-"} <span class="text-xs text-gray-600 block">${t.user ? 'door ' + t.user : ''}</span></td>
        <td class="px-6 py-4">${tags}</td>
        <td class="px-6 py-4 text-right font-bold font-mono ${t.type === "income" ? "text-emerald-400" : "text-rose-400"}">${t.type === "income" ? "+" : "-"} € ${parseFloat(t.amount).toFixed(2)}</td>
    </tr>`;
}

// =============================================================================
// VIEW 2: VIRTUELE REKENINGEN (BUDGETS)
// =============================================================================
function renderBudgetsView(container) {
    const deptBalances = {};
    AFDELINGEN_CONFIG.forEach(afd => deptBalances[afd.naam] = { balance: 0, transactions: [], color: afd.kleur });
    deptBalances['Algemeen'] = { balance: 0, transactions: [], color: 'gray' };

    cachedFinances.forEach(t => {
        const netAmount = t.type === 'income' ? parseFloat(t.amount) : -parseFloat(t.amount);
        let involved = t.afdelingen || (t.afdeling ? [t.afdeling] : ['Algemeen']);
        const splitAmount = netAmount / involved.length;
        involved.forEach(dept => { if(deptBalances[dept]) { deptBalances[dept].balance += splitAmount; deptBalances[dept].transactions.push(t); } });
    });

    let cardsHtml = AFDELINGEN_CONFIG.map(afd => {
        const d = deptBalances[afd.naam];
        const c = afd.kleur || 'indigo';
        return `<div onclick="openBudgetDetail('${afd.naam}')" class="cursor-pointer group relative overflow-hidden rounded-2xl border border-${c}-500/30 bg-[#181b25] p-6 hover:-translate-y-1 hover:shadow-2xl hover:shadow-${c}-500/10 transition-all duration-300">
            <div class="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-${c}-500/10 blur-xl group-hover:bg-${c}-500/20 transition-all"></div>
            <div class="flex items-center justify-between mb-4"><h3 class="font-bold text-white text-lg">${afd.naam}</h3><div class="rounded-full bg-${c}-500/20 p-2 text-${c}-400"><i data-lucide="credit-card" class="h-5 w-5"></i></div></div>
            <div class="flex flex-col"><span class="text-xs font-bold text-gray-500 uppercase tracking-widest">Saldo</span><span class="text-3xl font-black text-white tracking-tight mt-1 group-hover:text-${c}-400 transition-colors">€ ${d.balance.toFixed(2)}</span></div>
            <div class="mt-4 flex items-center gap-2 text-xs font-medium text-gray-400"><span>${d.transactions.length} transacties</span><i data-lucide="chevron-right" class="w-3 h-3 group-hover:translate-x-1 transition-transform"></i></div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="animate-in fade-in zoom-in duration-300"><div class="mb-8"><h2 class="text-2xl font-bold text-white">Virtuele Rekeningen</h2><p class="text-gray-400 text-sm">Beheer budget per afdeling.</p></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">${cardsHtml}</div></div>`;
}

// --- MODAL & ACTIES ---
window.openBudgetDetail = (deptName) => {
    const txs = cachedFinances.filter(t => (t.afdelingen && t.afdelingen.includes(deptName)) || t.afdeling === deptName);
    const total = txs.reduce((sum, t) => sum + (t.type==='income' ? t.amount : -t.amount), 0);
    const modal = document.getElementById('budget-modal');
    
    modal.innerHTML = `
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onclick="closeBudgetDetail()"></div>
    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[#181b25] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div class="bg-[#1f2330] p-6 border-b border-gray-700 flex justify-between items-start">
            <div><h3 class="text-2xl font-bold text-white mb-1">${deptName}</h3><p class="text-gray-400 text-sm">Huidig saldo: <span class="font-bold ${total>=0?'text-emerald-400':'text-rose-400'}">€ ${total.toFixed(2)}</span></p></div>
            <button onclick="closeBudgetDetail()" class="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"><i data-lucide="x" class="w-6 h-6"></i></button>
        </div>
        <div class="p-4 bg-[#181b25] border-b border-gray-800 grid grid-cols-3 gap-3">
            <button onclick="showBudgetAction('${deptName}', 'income')" class="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all font-bold text-xs gap-2"><i data-lucide="arrow-down-to-line" class="w-5 h-5"></i> Storten</button>
            <button onclick="showBudgetAction('${deptName}', 'expense')" class="flex flex-col items-center justify-center p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all font-bold text-xs gap-2"><i data-lucide="arrow-up-from-line" class="w-5 h-5"></i> Afschrijven</button>
            <button onclick="showLidgeldAction('${deptName}')" class="flex flex-col items-center justify-center p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white transition-all font-bold text-xs gap-2"><i data-lucide="coins" class="w-5 h-5"></i> 4-uurtje</button>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar p-0">
            <table class="w-full text-left text-sm text-gray-400">
                <tbody class="divide-y divide-gray-800/50">
                    ${txs.length ? txs.map(t => `<tr class="hover:bg-white/5"><td class="px-6 py-3 font-mono text-gray-400">${new Date(t.datum).toLocaleDateString('nl-BE')}</td><td class="px-6 py-3 text-white"><div class="font-medium">${t.description}</div><div class="text-xs text-gray-500">${t.category || 'Algemeen'}</div></td><td class="px-6 py-3 text-right font-bold font-mono ${t.type==='income'?'text-emerald-400':'text-rose-400'}">${t.type==='income'?'+':'-'} € ${parseFloat(t.amount).toFixed(2)}</td></tr>`).join('') : `<tr><td colspan="3" class="text-center p-8 text-gray-500 italic">Nog geen transacties.</td></tr>`}
                </tbody>
            </table>
        </div>
    </div>`;
    modal.classList.remove('hidden'); lucide.createIcons();
}
window.closeBudgetDetail = () => { document.getElementById('budget-modal').classList.add('hidden'); }

// --- STANDAARD ACTIE (STORTEN / AFSCHRIJVEN) ---
window.showBudgetAction = (deptName, type) => {
    const modal = document.querySelector('#budget-modal > div:last-child');
    const color = type === 'income' ? 'emerald' : 'rose';
    modal.innerHTML = `
        <div class="bg-[#1f2330] p-6 border-b border-gray-700 flex justify-between items-center"><h3 class="text-xl font-bold text-white flex items-center gap-2"><i data-lucide="${type==='income'?'arrow-down-to-line':'arrow-up-from-line'}" class="text-${color}-400"></i> ${type==='income'?'Geld storten':'Kosten afschrijven'}</h3><button onclick="openBudgetDetail('${deptName}')" class="text-sm text-gray-400 hover:text-white underline">Terug</button></div>
        <form onsubmit="submitBudgetTransaction(event, '${deptName}', '${type}')" class="p-6 space-y-4">
            <div><label class="block text-xs font-bold text-gray-500 uppercase mb-2">Bedrag (€)</label><input type="number" id="budget-amount" step="0.01" min="0" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-${color}-500 outline-none font-mono text-xl" placeholder="0.00" autofocus></div>
            <div><label class="block text-xs font-bold text-gray-500 uppercase mb-2">Mededeling</label><input type="text" id="budget-desc" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-${color}-500 outline-none" placeholder="Omschrijving..."></div>
            <button type="submit" class="w-full py-4 rounded-xl bg-${color}-600 hover:bg-${color}-500 text-white font-bold shadow-lg mt-4 transition-all">Bevestigen</button>
        </form>`;
    lucide.createIcons();
}

// --- VERBETERD: 4-UURTJE / LIDGELD MET AUTO-FETCH & OPMERKINGEN ---
window.showLidgeldAction = async (deptName) => {
    const modal = document.querySelector('#budget-modal > div:last-child');
    
    // UI Opbouw
    modal.innerHTML = `
        <div class="bg-[#1f2330] p-6 border-b border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold text-white flex items-center gap-2"><i data-lucide="coins" class="text-amber-400"></i> 4-uurtje Verrekenen</h3>
            <button onclick="openBudgetDetail('${deptName}')" class="text-sm text-gray-400 hover:text-white underline">Terug</button>
        </div>
        <div class="p-6">
            <div class="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl mb-6">
                <label class="block text-xs font-bold text-indigo-300 uppercase mb-2 flex items-center gap-2"><i data-lucide="calendar" class="w-3 h-3"></i> Kies Zondag</label>
                <input type="date" id="calc-date" class="w-full bg-[#13161f] border border-indigo-500/30 rounded-lg py-2 px-3 text-white font-bold focus:outline-none focus:border-indigo-500" onchange="fetchAttendanceForCalc('${deptName}')">
            </div>

            <div id="attendance-feedback" class="mb-6 hidden"></div>

            <div class="grid grid-cols-2 gap-4 mb-6">
                 <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Aantal Leden</label>
                    <input type="number" id="calc-count" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white font-bold" oninput="calculateLidgeld()">
                 </div>
                 <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Prijs / stuk</label>
                    <div class="relative"><span class="absolute left-3 top-3 text-gray-500">€</span><input type="number" id="calc-price" value="2.00" step="0.10" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 pl-8 pr-4 text-white font-bold" oninput="calculateLidgeld()"></div>
                 </div>
            </div>
            
            <div class="bg-[#0f111a] rounded-xl p-4 mb-6 border border-gray-800">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-sm text-rose-400 font-bold">Aantal niet betaald / leiding</span>
                    <div class="w-24"><input type="number" id="calc-nopay" value="0" min="0" class="w-full bg-[#181b25] border border-rose-900/50 focus:border-rose-500 rounded-lg text-right text-rose-400 font-bold text-sm py-2 px-3 outline-none" oninput="calculateLidgeld()"></div>
                </div>
                <div class="flex justify-between items-center pt-3 border-t border-gray-800">
                    <span class="font-bold text-white text-lg">TOTAAL</span>
                    <span class="font-mono text-3xl font-black text-emerald-400" id="calc-total">€ 0.00</span>
                </div>
            </div>

            <button onclick="submitLidgeldTransaction('${deptName}')" class="w-full py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-lg transition-all flex justify-center items-center gap-2">
                <i data-lucide="save" class="w-4 h-4"></i> Opslaan
            </button>
        </div>`;
    
    lucide.createIcons();
    
    // 1. Zoek de dichtstbijzijnde zondag
    const d = new Date();
    // Als het niet zondag is, ga terug naar de vorige zondag
    if(d.getDay() !== 0) {
        d.setDate(d.getDate() - d.getDay()); 
    }
    const sundayStr = d.toISOString().split('T')[0];
    document.getElementById('calc-date').value = sundayStr;
    
    // 2. Haal data op
    await fetchAttendanceForCalc(deptName);
}

window.fetchAttendanceForCalc = async (deptName) => {
    const date = document.getElementById('calc-date').value;
    const feedbackBox = document.getElementById('attendance-feedback');
    
    // Reset en loading state
    feedbackBox.innerHTML = '<div class="loader w-4 h-4"></div>';
    feedbackBox.classList.remove('hidden');
    
    const { data } = await supabaseClient.from(COLLECTION_NAMES.AANWEZIGHEDEN).select('afdelingen').eq('datum', date).maybeSingle();
    
    let count = 0;
    let comment = "";
    let found = false;

    if (data && data.afdelingen) {
        let arr = typeof data.afdelingen === 'string' ? JSON.parse(data.afdelingen) : data.afdelingen;
        const entry = arr.find(a => a.naam === deptName);
        if(entry) {
            count = entry.aantal;
            comment = entry.opmerking || "";
            found = true;
        }
    }
    
    document.getElementById('calc-count').value = count;
    
    // Feedback UI update
    if (!found) {
        feedbackBox.innerHTML = `<div class="text-amber-500 text-xs font-bold bg-amber-500/10 p-3 rounded-lg border border-amber-500/20"><i data-lucide="alert-circle" class="w-3 h-3 inline mr-1"></i> Geen telling gevonden voor deze datum.</div>`;
    } else {
        if(comment) {
            feedbackBox.innerHTML = `
            <div class="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg">
                <div class="text-xs text-blue-300 font-bold uppercase mb-1">Opmerking uit telling:</div>
                <div class="text-white font-medium italic">"${comment}"</div>
                <div class="text-[10px] text-gray-400 mt-1">Check of hierboven staat wie niet betaald heeft.</div>
            </div>`;
        } else {
             feedbackBox.innerHTML = `<div class="text-gray-500 text-xs italic text-center p-2">Geen opmerkingen bij de telling.</div>`;
        }
    }
    lucide.createIcons();
    calculateLidgeld();
}

window.calculateLidgeld = () => {
    const count = parseInt(document.getElementById('calc-count').value) || 0;
    const price = parseFloat(document.getElementById('calc-price').value) || 0;
    const noPay = parseInt(document.getElementById('calc-nopay').value) || 0;
    
    const total = Math.max(0, (count - noPay) * price);
    document.getElementById('calc-total').innerText = `€ ${total.toFixed(2)}`;
}

window.submitLidgeldTransaction = async (deptName) => {
    const amountStr = document.getElementById('calc-total').innerText.replace('€', '').trim();
    const date = document.getElementById('calc-date').value;
    const noPay = document.getElementById('calc-nopay').value;
    const count = document.getElementById('calc-count').value;

    let desc = `Lidgeld/Drink ${new Date(date).toLocaleDateString('nl-BE')}`;
    if (parseInt(noPay) > 0) desc += ` (${count} aanw, ${noPay} gratis)`;
    else desc += ` (${count} aanw)`;

    try {
        const { error } = await supabaseClient.from(COLLECTION_NAMES.FINANCES).insert({
            type: 'income',
            amount: parseFloat(amountStr),
            description: desc,
            afdelingen: [deptName],
            afdeling: deptName,
            datum: date, 
            category: 'Lidgeld',
            user: currentUser.name
        });
        if (error) throw error;
        showToast('Lidgeld opgeslagen!', 'success');
        await loadData();
        openBudgetDetail(deptName);
    } catch(err) {
        console.error(err);
        showToast('Fout bij opslaan.', 'error');
    }
}

// --- ORIGINELE TRANSACTIE FUNCTIES (BEHOUDEN) ---
window.submitBudgetTransaction = async (e, deptName, type) => {
    e.preventDefault();
    const amount = document.getElementById('budget-amount').value;
    const desc = document.getElementById('budget-desc').value;
    const btn = e.target.querySelector('button'); btn.disabled = true; btn.innerHTML = '...';
    try {
        await supabaseClient.from(COLLECTION_NAMES.FINANCES).insert({ type, amount, description: desc, afdelingen: [deptName], afdeling: deptName, datum: new Date().toISOString().split('T')[0], category: 'Rekening', user: currentUser.name });
        showToast('Opgeslagen!', 'success'); await loadData(); openBudgetDetail(deptName);
    } catch(err) { showToast('Fout', 'error'); btn.disabled = false; }
}

function renderAddFormHtml() {
    const today = new Date().toISOString().split("T")[0];
    return `<div class="max-w-xl mx-auto animate-in fade-in zoom-in duration-300"><div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 shadow-xl"><h2 class="text-xl font-bold text-white mb-4">Nieuwe Transactie</h2><form onsubmit="submitTransaction(event)" class="space-y-4">
        <div class="grid grid-cols-2 gap-4"><label class="p-3 border border-gray-700 rounded-xl bg-[#1f2330] text-center cursor-pointer hover:bg-[#2a3040] transition-colors"><input type="radio" name="type" value="income" checked> <span class="text-emerald-400 font-bold block mt-1">Inkomsten</span></label><label class="p-3 border border-gray-700 rounded-xl bg-[#1f2330] text-center cursor-pointer hover:bg-[#2a3040] transition-colors"><input type="radio" name="type" value="expense"> <span class="text-rose-400 font-bold block mt-1">Uitgaven</span></label></div>
        <div><label class="block text-xs font-bold text-gray-500 uppercase mb-1">Bedrag</label><input type="number" id="amount" placeholder="0.00" step="0.01" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"></div>
        <div><label class="block text-xs font-bold text-gray-500 uppercase mb-1">Datum</label><input type="date" id="date" value="${today}" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"></div>
        <div><label class="block text-xs font-bold text-gray-500 uppercase mb-1">Omschrijving</label><input type="text" id="description" placeholder="Bv. Materiaal knutselen" required class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"></div>
        <div><label class="block text-xs font-bold text-gray-500 uppercase mb-1">Afdeling</label><select id="dept-select" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"><option value="Algemeen">Algemeen</option>${AFDELINGEN_CONFIG.map(a=>`<option value="${a.naam}">${a.naam}</option>`).join('')}</select></div>
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl text-white font-bold shadow-lg mt-2 transition-all">Opslaan</button>
    </form></div></div>`;
}
window.submitTransaction = async (e) => {
    e.preventDefault();
    const type = document.querySelector('input[name="type"]:checked').value;
    const amount = document.getElementById("amount").value;
    const dept = document.getElementById("dept-select").value;
    await supabaseClient.from(COLLECTION_NAMES.FINANCES).insert({type, amount, description: document.getElementById("description").value, afdelingen:[dept], afdeling:dept, datum:document.getElementById("date").value, user:currentUser.name});
    showToast("Opgeslagen", "success"); await loadData(); switchTab("overview");
};