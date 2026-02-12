// js/bestellingen.js

// --- GLOBALE VARIABELEN ---
let webshopDate = "";
let webshopOrders = [];
let pendingImports = [];
let webshopStock = { choco: 0, jam: 0 };
let webshopPrices = { whiteBread: 0.00, brownBread: 0.00, choco: 0.00, jam: 0.00 };
let costMonth = new Date().toISOString().slice(0, 7);

// --- INITIALISATIE ---
window.onload = async () => {
    try {
        if (typeof renderLayout === 'function') await renderLayout(); 
        const user = await requireAuth();

        if (user) {
            webshopDate = getNextSunday();
            const urlParams = new URLSearchParams(window.location.search);
            if(urlParams.get('date')) webshopDate = urlParams.get('date');
            
            try { 
                await fetchPricesAndStock(); 
            } catch(e) { 
                console.warn("Prijzen error", e); 
            }

            // AUTOMATISATIE: Sync het HELE werkjaar (september t/m nu)
            if (['ADMIN', 'KASSIER'].includes(currentUser.role)) {
                await syncCurrentChiroYear(); 
            }

            renderWebshop('order');
        }
    } catch (err) {
        console.error("Critical Error:", err);
        const container = document.getElementById('webshop-content');
        if(container) container.innerHTML = `<div class="p-8 text-center text-rose-500">Error: ${err.message}</div>`;
    }
};

// --- NIEUWE FUNCTIE: SYNC HELE WERKJAAR ---
async function syncCurrentChiroYear() {
    const now = new Date();
    // Bepaal start werkjaar (1 september van dit jaar of vorig jaar)
    let startYear = now.getFullYear();
    if (now.getMonth() < 8) { // Januari (0) t.e.m. Augustus (7) -> start is vorig jaar
        startYear -= 1;
    }
    
    // Loop van September tot huidige maand
    const currentDate = new Date(startYear, 8, 1); // 1 september
    const today = new Date();

    const monthsToSync = [];
    
    while (currentDate <= today) {
        const monthStr = currentDate.toISOString().slice(0, 7);
        monthsToSync.push(monthStr);
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Voer sync uit voor elke maand (in parallel voor snelheid)
    console.log(`Auto-sync gestart voor maanden: ${monthsToSync.join(', ')}`);
    await Promise.all(monthsToSync.map(m => forceSyncMonth(m, false)));
}

function getNextSunday() {
    const d = new Date();
    d.setDate(d.getDate() + (7 - d.getDay()) % 7);
    return d.toISOString().split('T')[0];
}

async function fetchPricesAndStock() {
    const { data: p } = await supabaseClient.from(COLLECTION_NAMES.BROOD_PRICES_DOC).select('*').eq('id', 1).maybeSingle();
    if(p) webshopPrices = { ...webshopPrices, ...p };
    const { data: s } = await supabaseClient.from(COLLECTION_NAMES.BROOD_STOCK_DOC).select('*').eq('id', 1).maybeSingle();
    if(s) webshopStock = { choco: s.choco||0, jam: s.jam||0 };
}

// --- NAVIGATIE ---
async function renderWebshop(subTab = 'order') {
    const container = document.getElementById('webshop-content');
    const nav = document.getElementById('webshop-nav');
    if(!container) return;

    document.getElementById('csv-preview-container').classList.add('hidden');
    container.classList.remove('hidden');
    pendingImports = [];

    const url = new URL(window.location);
    url.searchParams.set('date', webshopDate);
    window.history.replaceState({}, '', url);

    const isAdminOrKassier = ['ADMIN', 'KASSIER', 'VB', 'KOOKOUDER'].includes(currentUser.role);
    const tabs = [
        { id: 'order', icon: 'shopping-cart', label: 'Bestellen' },
        { id: 'prep', icon: 'clipboard-list', label: 'Klaarzetten' },
        ...(isAdminOrKassier ? [{ id: 'stock', icon: 'settings-2', label: 'Prijzen & Stock' }] : []),
        { id: 'costs', icon: 'pie-chart', label: 'Financieel' }
    ];

    if(nav) nav.innerHTML = tabs.map(t => `
        <button onclick="renderWebshop('${t.id}')" class="px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${subTab === t.id ? 'bg-[#1f2330] text-white shadow-md border border-gray-700' : 'text-gray-400 hover:text-white hover:bg-white/5'}">
            <i data-lucide="${t.icon}" class="w-4 h-4 ${subTab === t.id ? 'text-indigo-400' : ''}"></i> ${t.label}
        </button>`).join('');

    container.innerHTML = '<div class="flex justify-center p-20"><div class="loader"></div></div>';
    
    try {
        if (subTab === 'order') await renderOrderView(container);
        else if (subTab === 'prep') await renderPrepView(container);
        else if (subTab === 'stock') await renderStockView(container);
        else if (subTab === 'costs') await renderCostsView(container);
    } catch(e) { 
        container.innerHTML = `<div class="text-rose-500 text-center p-10">Fout: ${e.message}</div>`; 
    }
    lucide.createIcons();
}

// =============================================================================
// CORE SYNC ENGINE: ZORGT DAT ALLES ALTIJD KLOPT
// =============================================================================
async function forceSyncMonth(monthStr, showToasts = true) {
    const start = `${monthStr}-01`;
    const [y, m] = monthStr.split('-').map(Number);
    const end = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1).toISOString().split('T')[0];
    const descriptionKey = `Webshop Kosten ${new Date(start).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })}`; 

    const { data: orders } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select('*').gte('date', start).lt('date', end);
    const { data: existingFin } = await supabaseClient.from(COLLECTION_NAMES.FINANCES).select('*').eq('description', descriptionKey).eq('category', 'Webshop');

    const grouped = {};
    if(orders) {
        orders.forEach(o => {
            const dept = normalizeDepartment(o.department);
            if(!grouped[dept]) grouped[dept] = 0;
            const i = o.items || {whiteBread:0, brownBread:0, choco:0, jam:0};
            grouped[dept] += (i.whiteBread * webshopPrices.whiteBread) + 
                             (i.brownBread * webshopPrices.brownBread) + 
                             (i.choco * webshopPrices.choco) + 
                             (i.jam * webshopPrices.jam);
        });
    }

    const toUpsert = [];
    const toDeleteIds = [];
    const allDepts = new Set([...Object.keys(grouped), ...(existingFin?.map(f => f.afdeling) || [])]);

    for (const dept of allDepts) {
        const calculatedTotal = Math.round((grouped[dept] || 0) * 100) / 100;
        const record = existingFin?.find(f => f.afdeling === dept);
        
        if (calculatedTotal > 0.01) {
            if (!record || Math.abs(record.amount - calculatedTotal) > 0.01) {
                toUpsert.push({
                    ...(record ? { id: record.id } : {}),
                    description: descriptionKey,
                    amount: calculatedTotal,
                    type: 'expense',
                    category: 'Webshop',
                    afdeling: dept,
                    afdelingen: [dept],
                    datum: new Date().toISOString().split('T')[0],
                    user: 'Systeem (Auto-Sync)'
                });
            }
        } else if (record) {
            toDeleteIds.push(record.id);
        }
    }

    if (toUpsert.length > 0) await supabaseClient.from(COLLECTION_NAMES.FINANCES).upsert(toUpsert);
    if (toDeleteIds.length > 0) await supabaseClient.from(COLLECTION_NAMES.FINANCES).delete().in('id', toDeleteIds);

    if ((toUpsert.length > 0 || toDeleteIds.length > 0) && showToasts) {
        showToast(`Boekhouding bijgewerkt voor ${monthStr}`, "success");
    }
}

// =============================================================================
// VIEW 1: BESTELLINGEN (ORDER)
// =============================================================================
async function renderOrderView(container) {
    const { data } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select('*').eq('date', webshopDate);
    webshopOrders = data || [];
    const canEdit = ['ADMIN', 'KASSIER', 'VB', 'KOOKOUDER', 'LEIDING'].includes(currentUser.role);

    const rows = webshopOrders.length > 0 ? webshopOrders.map(o => {
        const i = o.items || {whiteBread:0, brownBread:0, choco:0, jam:0};
        const safeDept = o.department.replace(/'/g, "\\'"); 
        return `
        <tr class="border-b border-gray-800/50 hover:bg-[#1f2330] transition-colors group">
            <td class="px-6 py-4 font-bold text-white">${o.department}</td>
            <td class="px-6 py-4 text-center"><span class="bg-[#181b25] border border-gray-700 text-gray-200 px-3 py-1 rounded text-sm font-bold font-mono">${i.whiteBread}</span></td>
            <td class="px-6 py-4 text-center"><span class="bg-[#2a2420] border border-[#3e342e] text-[#d6c0a8] px-3 py-1 rounded text-sm font-bold font-mono">${i.brownBread}</span></td>
            <td class="px-6 py-4 text-center"><span class="${i.choco > 0 ? 'text-amber-500 border-amber-500/20 bg-amber-500/10' : 'text-gray-700 border-gray-800'} border px-3 py-1 rounded text-sm font-bold font-mono">${i.choco}</span></td>
            <td class="px-6 py-4 text-center"><span class="${i.jam > 0 ? 'text-rose-500 border-rose-500/20 bg-rose-500/10' : 'text-gray-700 border-gray-800'} border px-3 py-1 rounded text-sm font-bold font-mono">${i.jam}</span></td>
            ${canEdit ? `<td class="px-6 py-4 text-right">
                <button onclick="openEditModal('${o.id}')" class="p-2 rounded-lg hover:bg-indigo-500/10 text-gray-500 hover:text-indigo-400 mr-1"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deleteOrder('${safeDept}', '${o.date}')" class="p-2 rounded-lg hover:bg-rose-500/10 text-gray-500 hover:text-rose-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>` : ''}
        </tr>`;
    }).join('') : `<tr><td colspan="${canEdit ? 6 : 5}" class="px-6 py-16 text-center text-gray-500 italic">Nog geen bestellingen voor deze datum.</td></tr>`;

    let toolsHtml = `
        <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 shadow-sm">
            <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-white text-sm uppercase">Datum</h3></div>
            <div class="flex items-center gap-2">
                <button id="btn-prev" class="p-2.5 rounded-xl bg-[#2a3040] text-gray-400 hover:text-white border border-gray-700/50"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                <input type="date" value="${webshopDate}" onchange="webshopDate=this.value; renderWebshop('order')" class="flex-1 bg-[#0f111a] border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm font-bold text-center outline-none focus:border-indigo-500 transition-colors">
                <button id="btn-next" class="p-2.5 rounded-xl bg-[#2a3040] text-gray-400 hover:text-white border border-gray-700/50"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
            </div>
        </div>`;

    if(canEdit) {
        toolsHtml += `<div class="grid grid-cols-2 gap-3 mt-4">
            <button onclick="openEditModal('new')" class="col-span-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"><i data-lucide="plus-circle" class="w-4 h-4"></i> Manueel</button>
            <button onclick="document.getElementById('csv-input').click()" class="col-span-1 py-3 bg-[#1f2330] hover:bg-[#2a3040] text-emerald-400 border border-emerald-500/30 font-bold rounded-xl flex items-center justify-center gap-2 transition-all"><i data-lucide="file-spreadsheet" class="w-4 h-4"></i> Import CSV</button>
            <button onclick="deleteAllOrders()" class="col-span-2 py-3 border border-gray-800 hover:bg-rose-900/10 text-rose-500 hover:text-rose-400 font-bold rounded-xl flex items-center justify-center gap-2 transition-all"><i data-lucide="trash" class="w-4 h-4"></i> Alles Wissen</button>
        </div>`;
    }

    container.innerHTML = `
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-in fade-in zoom-in duration-300">
        <div class="space-y-6 order-2 xl:order-1">${toolsHtml}</div>
        <div class="xl:col-span-2 flex flex-col h-full order-1 xl:order-2">
            <div class="bg-[#181b25] border border-gray-800 rounded-2xl overflow-hidden flex-1 shadow-lg flex flex-col">
                <div class="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1f2330]/30"><h3 class="font-bold text-white text-sm uppercase flex items-center gap-2"><i data-lucide="list" class="w-4 h-4 text-indigo-400"></i> Bestellingen</h3><span class="bg-[#0f111a] text-gray-400 text-xs px-2.5 py-1 rounded-md border border-gray-800 font-mono">${webshopOrders.length} afdelingen</span></div>
                <div class="overflow-x-auto flex-1 custom-scrollbar">
                    <table class="w-full text-sm"><thead class="bg-[#1f2330]/50 border-b border-gray-800 sticky top-0 backdrop-blur-md"><tr><th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Afdeling</th><th class="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Wit</th><th class="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Bruin</th><th class="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Choco</th><th class="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Conf</th>${canEdit ? '<th class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actie</th>' : ''}</tr></thead><tbody class="divide-y divide-gray-800/30">${rows}</tbody></table>
                </div>
            </div>
        </div>
    </div>`;
    
    document.getElementById('btn-prev').onclick = () => { const d = new Date(webshopDate); d.setDate(d.getDate() - 7); webshopDate = d.toISOString().split('T')[0]; renderWebshop('order'); };
    document.getElementById('btn-next').onclick = () => { const d = new Date(webshopDate); d.setDate(d.getDate() + 7); webshopDate = d.toISOString().split('T')[0]; renderWebshop('order'); };
}

// =============================================================================
// VIEW 2: KLAARZETTEN (PREP)
// =============================================================================
async function renderPrepView(container) {
    const { data } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select('*').eq('date', webshopDate);
    const orders = data || [];
    const sum = orders.reduce((acc, o) => {
        const i = o.items || {};
        return { white: acc.white+(i.whiteBread||0), brown: acc.brown+(i.brownBread||0), choco: acc.choco+(i.choco||0), jam: acc.jam+(i.jam||0) };
    }, { white:0, brown:0, choco:0, jam:0 });
    
    container.innerHTML = `
    <div class="max-w-[1600px] mx-auto animate-in fade-in zoom-in duration-300 print-container">
        <div class="flex justify-between items-center mb-8 pb-6 border-b border-gray-800 no-print">
            <div><h2 class="text-3xl font-extrabold text-white">Klaarzetten</h2><p class="text-indigo-400 font-medium capitalize">${new Date(webshopDate).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
            <button onclick="window.print()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold flex items-center shadow-lg hover:scale-105 transition-transform"><i data-lucide="printer" class="w-5 h-5 mr-2"></i> Print Lijst</button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 no-print"> 
            ${renderBigCard('WIT', sum.white)} ${renderBigCard('BRUIN', sum.brown)} ${renderBigCard('CHOCO', sum.choco)} ${renderBigCard('CONFITUUR', sum.jam)}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            ${orders.map(o => {
                const i = o.items;
                if((i.whiteBread+i.brownBread+i.choco+i.jam)===0) return '';
                return `<div class="ticket-card p-5 relative overflow-hidden flex flex-col h-full bg-[#181b25] border border-gray-800 rounded-xl">
                    <h4 class="text-lg font-black text-white uppercase mb-4 border-l-4 border-indigo-500 pl-3 print-text-black">${o.department}</h4>
                    <div class="space-y-2 flex-1">
                        ${i.whiteBread > 0 ? `<div class="item-badge badge-wit flex justify-between"><span>Wit</span> <span>${i.whiteBread}</span></div>` : ''}
                        ${i.brownBread > 0 ? `<div class="item-badge badge-bruin flex justify-between"><span>Bruin</span> <span>${i.brownBread}</span></div>` : ''}
                        ${i.choco > 0 ? `<div class="item-badge badge-choco flex justify-between"><span>Choco</span> <span>${i.choco}</span></div>` : ''}
                        ${i.jam > 0 ? `<div class="item-badge badge-jam flex justify-between"><span>Conf</span> <span>${i.jam}</span></div>` : ''}
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}
function renderBigCard(l, v) { return `<div class="flex flex-col items-center justify-center p-6 rounded-2xl border bg-[#181b25] border-gray-800 shadow-lg"><span class="text-4xl font-black text-white">${v}</span><span class="text-[10px] font-bold mt-2 uppercase text-gray-500 tracking-widest">${l}</span></div>`; }

// =============================================================================
// VIEW 3: FINANCIEEL OVERZICHT (ZELF-UPDATEND)
// =============================================================================
async function renderCostsView(container) {
    // Forceer sync voor de geselecteerde maand voordat we iets tonen
    await forceSyncMonth(costMonth, false);

    const start = `${costMonth}-01`;
    const [y, m] = costMonth.split('-').map(Number);
    const end = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1).toISOString().split('T')[0];
    const descriptionKey = `Webshop Kosten ${new Date(start).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })}`; 

    // Haal de nu ge-syncte data op
    const { data: existingTransactions } = await supabaseClient.from(COLLECTION_NAMES.FINANCES).select('*').eq('description', descriptionKey).eq('category', 'Webshop');
    const { data: orders } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select('*').gte('date', start).lt('date', end);

    let grandTotal = 0;
    const orderCounts = {};
    if(orders) {
        orders.forEach(o => {
            const dept = normalizeDepartment(o.department);
            if(!orderCounts[dept]) orderCounts[dept] = { count: 0 };
            orderCounts[dept].count++;
        });
    }

    const sortedTrans = existingTransactions ? existingTransactions.sort((a,b) => a.afdeling.localeCompare(b.afdeling)) : [];
    sortedTrans.forEach(t => grandTotal += t.amount);

    let contentHtml = sortedTrans.length === 0 ? 
        `<div class="p-10 text-center text-gray-500 border border-gray-800 rounded-xl bg-[#181b25] flex flex-col items-center gap-2"><i data-lucide="shopping-bag" class="w-8 h-8 opacity-50"></i><span>Geen kosten voor deze maand.</span></div>` : 
        sortedTrans.map(t => {
            const info = orderCounts[t.afdeling] || { count: 0 };
            return `
            <div class="bg-[#181b25] border border-gray-800 rounded-xl p-4 mb-3 flex items-center justify-between hover:bg-[#1f2330] transition-colors">
                <div>
                    <div class="flex items-center gap-3 mb-1">
                        <span class="font-bold text-white">${t.afdeling}</span>
                        <span class="text-[10px] text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase"><i data-lucide="check" class="w-3 h-3"></i> Synced</span>
                    </div>
                    <div class="text-xs text-gray-500">${info.count} bestellingen verwerkt</div>
                </div>
                <span class="font-mono font-bold text-rose-400 text-lg">€ ${parseFloat(t.amount).toFixed(2)}</span>
            </div>`;
        }).join('');

    container.innerHTML = `
    <div class="max-w-4xl mx-auto animate-in fade-in zoom-in duration-300">
        <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div><h2 class="text-2xl font-bold text-white">Maandelijkse Kosten</h2><p class="text-sm text-emerald-400 mt-1 flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3"></i> Live gesynchroniseerd met boekhouding.</p></div>
            <div class="flex gap-3 bg-[#181b25] p-1.5 rounded-xl border border-gray-800">
                <input type="month" value="${costMonth}" onchange="costMonth=this.value; renderWebshop('costs')" class="bg-transparent text-white border-none text-sm font-bold outline-none cursor-pointer">
            </div>
        </div>
        <div class="bg-gradient-to-r from-[#181b25] to-[#1f2330] border border-gray-800 rounded-2xl p-6 mb-8 flex justify-between items-center shadow-lg">
            <div><span class="text-gray-400 font-bold uppercase text-xs tracking-widest block mb-1">Totaal Webshop Kost</span><span class="text-xs text-gray-500 capitalize">${new Date(start).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })}</span></div>
            <span class="text-4xl font-black text-rose-400 tracking-tight">€ ${grandTotal.toFixed(2)}</span>
        </div>
        <div class="space-y-2">${contentHtml}</div>
    </div>`;
}

// =============================================================================
// VIEW 4: PRIJZEN & STOCK
// =============================================================================
async function renderStockView(container) {
    container.innerHTML = `<div class="max-w-3xl mx-auto animate-in fade-in zoom-in duration-300">
        <h2 class="text-2xl font-bold mb-6 text-white">Instellingen</h2>
        <form onsubmit="saveStockAndPrices(event)" class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 shadow-lg">
                <h3 class="text-indigo-400 font-bold mb-4 uppercase text-xs tracking-wider flex items-center gap-2"><i data-lucide="tag" class="w-3 h-3"></i> Prijzen (€)</h3>
                <div class="space-y-4">${renderInputRow('Wit Brood', 'price-white', webshopPrices.whiteBread)} ${renderInputRow('Bruin Brood', 'price-brown', webshopPrices.brownBread)}${renderInputRow('Pot Choco', 'price-choco', webshopPrices.choco)} ${renderInputRow('Pot Conf', 'price-jam', webshopPrices.jam)}</div>
            </div>
            <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 shadow-lg">
                <h3 class="text-emerald-400 font-bold mb-4 uppercase text-xs tracking-wider flex items-center gap-2"><i data-lucide="package" class="w-3 h-3"></i> Voorraad (Potten)</h3>
                <div class="space-y-4">${renderInputRow('Choco', 'stock-choco', webshopStock.choco)} ${renderInputRow('Confituur', 'stock-jam', webshopStock.jam)}</div>
            </div>
            <div class="md:col-span-2"><button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-indigo-500/20 transition-all">Instellingen Opslaan</button></div>
        </form></div>`;
}
function renderInputRow(l, id, v) { return `<div class="flex justify-between items-center"><label class="text-sm text-gray-400 font-medium">${l}</label><input type="number" step="0.01" id="${id}" value="${parseFloat(v)}" class="w-24 bg-[#0f111a] border border-gray-700 rounded-lg py-2 px-3 text-right text-white font-bold focus:border-indigo-500 outline-none transition-colors"></div>`; }

async function saveStockAndPrices(e) {
    e.preventDefault();
    const s = { choco: parseInt(document.getElementById('stock-choco').value), jam: parseInt(document.getElementById('stock-jam').value) };
    const p = { whiteBread: parseFloat(document.getElementById('price-white').value), brownBread: parseFloat(document.getElementById('price-brown').value), choco: parseFloat(document.getElementById('price-choco').value), jam: parseFloat(document.getElementById('price-jam').value) };
    await supabaseClient.from(COLLECTION_NAMES.BROOD_STOCK_DOC).upsert({ id: 1, ...s });
    await supabaseClient.from(COLLECTION_NAMES.BROOD_PRICES_DOC).upsert({ id: 1, ...p });
    showToast("Instellingen opgeslagen", "success"); fetchPricesAndStock();
}

// =============================================================================
// CSV IMPORT PREVIEW & EDIT LOGICA
// =============================================================================
async function handleCSVUpload(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            if (results.data && results.data.length > 0) {
                pendingImports = []; 
                for (const row of results.data) {
                    const keys = Object.keys(row);
                    const colDept = keys.find(k => k.toLowerCase().includes('afdeling'));
                    const colWit = keys.find(k => k.toLowerCase().includes('witte broden'));
                    const colBruin = keys.find(k => k.toLowerCase().includes('bruine broden'));
                    const colChoco = keys.find(k => k.toLowerCase().includes('potten choco'));
                    const colConf = keys.find(k => k.toLowerCase().includes('confituur'));

                    if (colDept && row[colDept]) {
                        const rawDept = row[colDept];
                        const dept = normalizeDepartment(rawDept);
                        const items = {
                            whiteBread: parseInt(row[colWit]) || 0,
                            brownBread: parseInt(row[colBruin]) || 0,
                            choco: parseInt(row[colChoco]) || 0,
                            jam: parseInt(row[colConf]) || 0
                        };
                        if (items.whiteBread + items.brownBread + items.choco + items.jam > 0) {
                            pendingImports.push({ department: dept, items: items });
                        }
                    }
                }
                renderPreviewMode();
                if (pendingImports.length === 0) showToast("CSV leek leeg.", "warning");
            } else {
                showToast("CSV bestand is leeg.", "error");
            }
            input.value = ''; 
        },
        error: (err) => { console.error(err); showToast("Fout bij lezen CSV.", "error"); }
    });
}

function renderPreviewMode() {
    document.getElementById('webshop-content').classList.add('hidden');
    document.getElementById('csv-preview-container').classList.remove('hidden');

    const tbody = document.getElementById('csv-preview-body');
    if (pendingImports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500 italic">Geen items.</td></tr>`;
    } else {
        tbody.innerHTML = pendingImports.map((o, index) => {
            const i = o.items;
            return `
            <tr class="hover:bg-[#1f2330] transition-colors border-b border-gray-800/50 group">
                <td class="px-6 py-4 font-bold text-white">${o.department}</td>
                <td class="px-6 py-4 text-center text-gray-300 font-mono">${i.whiteBread}</td>
                <td class="px-6 py-4 text-center text-gray-300 font-mono">${i.brownBread}</td>
                <td class="px-6 py-4 text-center text-gray-300 font-mono">${i.choco}</td>
                <td class="px-6 py-4 text-center text-gray-300 font-mono">${i.jam}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="openEditModal('preview-${index}')" class="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button onclick="removePreviewItem(${index})" class="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>`;
        }).join('');
    }
    lucide.createIcons();
}

function removePreviewItem(index) {
    if(confirm("Verwijderen uit import?")) {
        pendingImports.splice(index, 1);
        renderPreviewMode();
    }
}

function cancelImport() {
    pendingImports = [];
    document.getElementById('csv-preview-container').classList.add('hidden');
    document.getElementById('webshop-content').classList.remove('hidden');
    showToast("Import geannuleerd", "info");
}

async function commitImport() {
    if (pendingImports.length === 0) { showToast("Niets om op te slaan.", "warning"); return; }
    let successCount = 0;
    
    for (const order of pendingImports) {
        const recordId = `${webshopDate}_${order.department}`;
        const { error } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).upsert({
            id: recordId, date: webshopDate, department: order.department, items: order.items, last_updated: new Date().toISOString()
        });
        if (!error) successCount++;
    }
    
    // FORCEER UPDATE NA IMPORT
    await forceSyncMonth(webshopDate.slice(0, 7), false);

    showToast(`${successCount} bestellingen opgeslagen!`, "success");
    pendingImports = [];
    document.getElementById('csv-preview-container').classList.add('hidden');
    document.getElementById('webshop-content').classList.remove('hidden');
    renderWebshop('order');
}

// =============================================================================
// MODAL LOGIC & ACTIONS
// =============================================================================
function openEditModal(id) { 
    const modal = document.getElementById('edit-modal');
    const form = document.getElementById('edit-form');
    const idInput = document.getElementById('edit-id');
    const deptSelect = document.getElementById('edit-dept');
    
    form.reset();
    idInput.value = id;
    deptSelect.innerHTML = AFDELINGEN_CONFIG.map(a => `<option value="${a.naam}">${a.naam}</option>`).join('');

    if (id === 'preview-new') {
        deptSelect.disabled = false;
        ['edit-white', 'edit-brown', 'edit-choco', 'edit-jam'].forEach(i => document.getElementById(i).value = 0);
    } else if (id.startsWith('preview-')) {
        const index = parseInt(id.split('-')[1]);
        const order = pendingImports[index];
        if (order) {
            deptSelect.value = order.department;
            deptSelect.disabled = false; 
            const i = order.items;
            document.getElementById('edit-white').value = i.whiteBread;
            document.getElementById('edit-brown').value = i.brownBread;
            document.getElementById('edit-choco').value = i.choco;
            document.getElementById('edit-jam').value = i.jam;
        }
    } else if (id !== 'new') {
        const order = webshopOrders.find(o => o.id == id);
        if (order) {
            deptSelect.value = order.department;
            deptSelect.disabled = true; 
            const i = order.items || {};
            document.getElementById('edit-white').value = i.whiteBread || 0;
            document.getElementById('edit-brown').value = i.brownBread || 0;
            document.getElementById('edit-choco').value = i.choco || 0;
            document.getElementById('edit-jam').value = i.jam || 0;
        }
    } else {
        deptSelect.disabled = false;
        ['edit-white', 'edit-brown', 'edit-choco', 'edit-jam'].forEach(i => document.getElementById(i).value = 0);
    }
    modal.classList.remove('hidden'); 
}

function closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); }

async function saveEditedOrder(event) {
    event.preventDefault();
    const id = document.getElementById('edit-id').value;
    const dept = document.getElementById('edit-dept').value;
    const items = {
        whiteBread: parseInt(document.getElementById('edit-white').value) || 0,
        brownBread: parseInt(document.getElementById('edit-brown').value) || 0,
        choco: parseInt(document.getElementById('edit-choco').value) || 0,
        jam: parseInt(document.getElementById('edit-jam').value) || 0
    };

    if (Object.values(items).some(v => v < 0)) { showToast("Ongeldige aantallen.", "error"); return; }
    
    if (id === 'preview-new') {
        pendingImports.push({ department: dept, items: items });
        closeEditModal(); renderPreviewMode(); return;
    }
    if (id.startsWith('preview-')) {
        const index = parseInt(id.split('-')[1]);
        pendingImports[index] = { department: dept, items: items };
        closeEditModal(); renderPreviewMode(); return;
    }

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true; btn.innerText = "Opslaan...";

    try {
        const recordId = id === 'new' ? `${webshopDate}_${dept}` : id;
        const { error } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).upsert({ id: recordId, date: webshopDate, department: dept, items: items, last_updated: new Date().toISOString() });
        if (error) throw error;

        // DIRECT UPDATE NA OPSLAAN
        await forceSyncMonth(webshopDate.slice(0, 7), false);

        showToast("Bestelling opgeslagen!", "success");
        closeEditModal();
        renderWebshop('order');
    } catch (err) {
        showToast("Fout: " + err.message, "error");
    } finally {
        btn.disabled = false; btn.innerHTML = originalText;
    }
}

async function deleteOrder(dept, date) { 
    if(confirm(`Bestelling van ${dept} verwijderen?`)) { 
        const idToDelete = `${date}_${dept}`;
        await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).delete().eq('id', idToDelete);
        
        // DIRECT UPDATE NA WISSEN
        await forceSyncMonth(date.slice(0, 7), false);

        showToast("Verwijderd", "success"); renderWebshop('order');
    } 
}

async function deleteAllOrders() { 
    if(await askConfirmation("Alles wissen?", `ALLE bestellingen voor ${webshopDate} wissen?`)) { 
        const { error } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).delete().eq('date', webshopDate);
        
        // DIRECT UPDATE NA WISSEN
        await forceSyncMonth(webshopDate.slice(0, 7), false);
        
        if(!error) { showToast("Alles gewist", "success"); renderWebshop('order'); }
    } 
}

// =============================================================================
// HELPERS & MAPPING
// =============================================================================
function normalizeDepartment(rawName) {
    if (!rawName) return "Algemeen";
    const clean = rawName.trim();
    const mapping = { 
        "Tip10's": "Tip10's", "Tip10s": "Tip10's", "Tiptiens": "Tip10's",
        "Aspi's": "Aspis", "Aspis": "Aspis", 
        "Speelclub meisjes": "Speelclub Meisjes", "Speelclub jongens": "Speelclub Jongens" 
    };
    const found = Object.keys(mapping).find(k => k.toLowerCase() === clean.toLowerCase());
    return found ? mapping[found] : clean;
}

function askConfirmation(title, message) {
    if(window.askConfirmation) return window.askConfirmation(title, message);
    return confirm(message);
}