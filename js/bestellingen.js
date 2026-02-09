// js/bestellingen.js

// --- GLOBALE VARIABELEN ---
let webshopDate = "";
let webshopOrders = [];
let pendingImport = [];
let webshopStock = { choco: 0, jam: 0 };
let webshopPrices = { whiteBread: 0.00, brownBread: 0.00, choco: 0.00, jam: 0.00 };

// Kosten instellingen
let costMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
let costDate = ""; 
let costViewMode = 'month'; // 'month' of 'day'

// --- INITIALISATIE ---
window.onload = async () => {
    try {
        renderLayout();
        const user = await requireAuth();
        if(user) {
            webshopDate = getNextSunday();
            costDate = getNextSunday();
            try { await fetchPricesAndStock(); } catch(e) { console.warn("Prijzen error", e); }
            renderWebshop('order');
        }
    } catch (err) {
        console.error("Critical Error:", err);
        document.getElementById('webshop-content').innerHTML = `
            <div class="p-8 text-center text-rose-500 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <strong>Er ging iets mis:</strong> ${err.message}<br>Herlaad de pagina.
            </div>`;
    }
};

// Helper: Volgende zondag berekenen
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
    const role = USER_ROLES[currentUser.role];
    const nav = document.getElementById('webshop-nav');
    const container = document.getElementById('webshop-content');
    
    // Check permissies voor tabs (Instellingen & Financieel alleen voor Admin/Kassier/VB)
    const isAdminOrKassier = ['ADMIN', 'KASSIER', 'VB'].includes(currentUser.role);

    const tabs = [
        { id: 'order', icon: 'shopping-cart', label: 'Bestellen' },
        { id: 'prep', icon: 'clipboard-list', label: 'Klaarzetten' },
        ...(isAdminOrKassier ? [{ id: 'stock', icon: 'settings-2', label: 'Instellingen' }] : []),
        ...(isAdminOrKassier ? [{ id: 'costs', icon: 'pie-chart', label: 'Financieel' }] : [])
    ];

    nav.innerHTML = tabs.map(t => `
        <button onclick="renderWebshop('${t.id}')" class="px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${subTab === t.id ? 'bg-[#1f2330] text-white shadow-md border border-gray-700' : 'text-gray-400 hover:text-white hover:bg-white/5'}">
            <i data-lucide="${t.icon}" class="w-4 h-4 ${subTab === t.id ? 'text-indigo-400' : ''}"></i> ${t.label}
        </button>
    `).join('');

    container.innerHTML = '<div class="flex justify-center p-20"><div class="loader"></div></div>';
    
    try {
        if (subTab === 'order') await renderOrderView(container);
        else if (subTab === 'prep') await renderPrepView(container);
        else if (subTab === 'stock') await renderStockView(container);
        else if (subTab === 'costs') await renderCostsView(container);
    } catch(e) { 
        console.error(e);
        container.innerHTML = `<div class="text-rose-500 text-center p-10">Fout in module: ${e.message}</div>`; 
    }
    
    lucide.createIcons();
}

// =============================================================================
// VIEW 1: BESTELLEN & IMPORT
// =============================================================================
async function renderOrderView(container) {
    const { data } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select('*').eq('date', webshopDate);
    webshopOrders = data || [];

    // CHECK: Mag deze gebruiker bewerken?
    const canEdit = ['ADMIN', 'KASSIER', 'VB'].includes(currentUser.role);

    const totals = webshopOrders.reduce((acc, o) => ({
        white: acc.white + (o.items.whiteBread||0), brown: acc.brown + (o.items.brownBread||0),
        choco: acc.choco + (o.items.choco||0), jam: acc.jam + (o.items.jam||0)
    }), { white: 0, brown: 0, choco: 0, jam: 0 });

    const rows = webshopOrders.length > 0 ? webshopOrders.map(o => {
        const i = o.items || {whiteBread:0, brownBread:0, choco:0, jam:0};
        const safeDept = (o.department || '').replace(/'/g, "\\'");
        
        return `
        <tr class="border-b border-gray-800/50 hover:bg-[#1f2330] transition-colors group">
            <td class="px-6 py-4 font-bold text-white">${o.department}</td>
            <td class="px-6 py-4 text-center"><span class="bg-[#181b25] border border-gray-700 text-gray-200 px-3 py-1 rounded text-sm font-bold font-mono">${i.whiteBread}</span></td>
            <td class="px-6 py-4 text-center"><span class="bg-[#2a2420] border border-[#3e342e] text-[#d6c0a8] px-3 py-1 rounded text-sm font-bold font-mono">${i.brownBread}</span></td>
            <td class="px-6 py-4 text-center"><span class="${i.choco > 0 ? 'text-amber-500 border-amber-500/20 bg-amber-500/10' : 'text-gray-700 border-gray-800'} border px-3 py-1 rounded text-sm font-bold font-mono">${i.choco}</span></td>
            <td class="px-6 py-4 text-center"><span class="${i.jam > 0 ? 'text-rose-500 border-rose-500/20 bg-rose-500/10' : 'text-gray-700 border-gray-800'} border px-3 py-1 rounded text-sm font-bold font-mono">${i.jam}</span></td>
            ${canEdit ? `
            <td class="px-6 py-4 text-right">
                <button onclick="openEditModal('${o.id}')" class="p-2 rounded-lg hover:bg-indigo-500/10 text-gray-500 hover:text-indigo-400 mr-1"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deleteOrder('${safeDept}', '${o.date}')" class="p-2 rounded-lg hover:bg-rose-500/10 text-gray-500 hover:text-rose-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>` : ''}
        </tr>`;
    }).join('') : `<tr><td colspan="${canEdit ? 6 : 5}" class="px-6 py-16 text-center text-gray-500 italic">Geen bestellingen gevonden.<br>Sleep een CSV hierheen.</td></tr>`;

    // Bouw Linkerkolom (Tools)
    let toolsHtml = `
        <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 shadow-sm">
            <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-white">Datum</h3><p class="text-gray-500 text-xs">Bestelling voor</p></div>
            <div class="flex items-center gap-2">
                <button id="btn-prev" class="p-2.5 rounded-xl bg-[#2a3040] hover:bg-[#32394d] text-gray-400 hover:text-white transition-colors"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                <input type="date" value="${webshopDate}" onchange="webshopDate=this.value; renderWebshop('order')" class="flex-1 bg-[#0f111a] border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm font-bold text-center outline-none focus:border-indigo-500">
                <button id="btn-next" class="p-2.5 rounded-xl bg-[#2a3040] hover:bg-[#32394d] text-gray-400 hover:text-white transition-colors"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
            </div>
        </div>`;

    if (canEdit) {
        toolsHtml += `
        <div id="upload-step" class="bg-[#181b25] border border-gray-800 border-dashed rounded-2xl p-8 text-center hover:bg-[#1f2330] hover:border-indigo-500/50 transition-all cursor-pointer relative group shadow-sm"
             ondragover="this.classList.add('drag-active'); event.preventDefault();" ondragleave="this.classList.remove('drag-active')" ondrop="handleDrop(event)">
            <div class="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform"><i data-lucide="upload-cloud" class="w-6 h-6"></i></div>
            <h3 class="text-white font-bold mb-1">CSV Importeren</h3>
            <p class="text-gray-500 text-xs mb-4">Sleep 'Formulierreacties'</p>
            <label class="inline-flex items-center justify-center px-4 py-2.5 bg-[#2a3040] hover:bg-[#32394d] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer border border-gray-700">Bestand Kiezen<input type="file" accept=".csv" class="hidden" onchange="handleFileSelect(this)"></label>
        </div>

        <div id="preview-step" class="hidden bg-[#181b25] border border-gray-800 rounded-2xl p-5 shadow-xl animate-in fade-in slide-in-from-bottom-2">
            <div class="flex justify-between items-center mb-4"><span class="text-sm font-bold text-white"><span id="preview-count" class="text-indigo-400">0</span> rijen</span><button onclick="cancelImport()" class="text-xs text-gray-500 hover:text-white underline">Annuleer</button></div>
            <div class="bg-[#0f111a] rounded-lg border border-gray-800 max-h-48 overflow-y-auto mb-4 custom-scrollbar"><table class="w-full text-xs text-left text-gray-400"><tbody id="preview-table-body"></tbody></table></div>
            <button onclick="confirmImport()" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-sm transition-all shadow-lg">Import Bevestigen</button>
        </div>

        <div class="grid grid-cols-2 gap-3">
            <button onclick="openEditModal('new')" class="w-full py-3.5 border border-gray-800 hover:bg-[#1f2330] text-gray-400 hover:text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"><i data-lucide="plus-circle" class="w-4 h-4"></i> Toevoegen</button>
            <button onclick="deleteAllOrders()" class="w-full py-3.5 border border-gray-800 hover:bg-rose-900/20 text-rose-500 hover:text-rose-400 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"><i data-lucide="trash" class="w-4 h-4"></i> Alles Wissen</button>
        </div>`;
    } else {
        toolsHtml += `<div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 text-center"><div class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-500"><i data-lucide="lock" class="w-5 h-5"></i></div><p class="text-gray-400 text-xs">Alleen leiding met de juiste rol kan wijzigen.</p></div>`;
    }

    container.innerHTML = `
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-in fade-in zoom-in duration-300">
        <div class="space-y-6">${toolsHtml}</div>
        <div class="xl:col-span-2 flex flex-col h-full">
            <div class="grid grid-cols-4 gap-4 mb-6">
                ${renderMiniStat('Wit', totals.white, 'bg-[#1f2330] text-gray-200 border border-gray-700')}
                ${renderMiniStat('Bruin', totals.brown, 'bg-[#2a2420] text-[#d6c0a8] border border-[#3e342e]')}
                ${renderMiniStat('Choco', totals.choco, 'bg-amber-900/20 text-amber-500 border border-amber-500/30')}
                ${renderMiniStat('Confituur', totals.jam, 'bg-rose-900/20 text-rose-500 border border-rose-500/30')}
            </div>
            <div class="bg-[#181b25] border border-gray-800 rounded-2xl overflow-hidden flex-1 shadow-lg flex flex-col">
                <div class="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1f2330]/30"><h3 class="font-bold text-white text-sm uppercase tracking-wide">Bestellijst</h3><span class="bg-[#0f111a] text-gray-400 text-xs px-2.5 py-1 rounded-md border border-gray-800 font-mono">${webshopOrders.length} afdelingen</span></div>
                <div class="overflow-x-auto flex-1 custom-scrollbar">
                    <table class="w-full"><thead class="bg-[#1f2330]/50 border-b border-gray-800 sticky top-0 backdrop-blur-md"><tr><th class="px-6 py-3 text-left">Afdeling</th><th class="px-6 py-3 text-center">Wit</th><th class="px-6 py-3 text-center">Bruin</th><th class="px-6 py-3 text-center">Choco</th><th class="px-6 py-3 text-center">Conf</th>${canEdit ? '<th class="px-6 py-3 text-right">Actie</th>' : ''}</tr></thead><tbody class="divide-y divide-gray-800/30">${rows}</tbody></table>
                </div>
            </div>
        </div>
    </div>`;
    
    document.getElementById('btn-prev').onclick = () => { const d = new Date(webshopDate); d.setDate(d.getDate() - 7); webshopDate = d.toISOString().split('T')[0]; renderWebshop('order'); };
    document.getElementById('btn-next').onclick = () => { const d = new Date(webshopDate); d.setDate(d.getDate() + 7); webshopDate = d.toISOString().split('T')[0]; renderWebshop('order'); };
}

function renderMiniStat(label, value, classes) { return `<div class="rounded-xl p-3 flex flex-col items-center justify-center ${classes} shadow-sm transition-transform hover:-translate-y-1"><span class="text-2xl font-extrabold leading-none mb-1">${value}</span><span class="text-[10px] uppercase font-bold opacity-70">${label}</span></div>`; }
// =============================================================================
// VIEW 2: KLAARZETTEN (TICKET SYSTEEM) - HYBRIDE (Web mooi, Print strak)
// =============================================================================
async function renderPrepView(container) {
    const { data } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select('*').eq('date', webshopDate);
    const orders = data || [];
    
    // Totalen berekenen
    const sum = orders.reduce((acc, o) => {
        const i = o.items || {whiteBread:0, brownBread:0, choco:0, jam:0};
        return { white: acc.white+(i.whiteBread||0), brown: acc.brown+(i.brownBread||0), choco: acc.choco+(i.choco||0), jam: acc.jam+(i.jam||0) };
    }, { white:0, brown:0, choco:0, jam:0 });

    const copyText = `Bestelling Chiro ${new Date(webshopDate).toLocaleDateString('nl-BE')}:\n\n- ${sum.white}x Wit Brood\n- ${sum.brown}x Bruin Brood\n- ${sum.choco}x Choco\n- ${sum.jam}x Confituur`;

    // --- SLIMME STIJLEN: ALLEEN ACTIEF BIJ PRINTEN ---
    const printStyles = `
    <style>
        /* Verberg print-elementen op het scherm */
        .only-print { display: none !important; }

        @media print {
            @page { size: landscape; margin: 10mm; }
            
            /* RESET NAAR WIT PAPIER */
            body { background-color: white !important; color: black !important; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
            .only-print { display: flex !important; } /* Toon print-specifieke dingen */

            /* LAYOUT RESET */
            .print-container { width: 100% !important; max-width: none !important; padding: 0 !important; margin: 0 !important; }
            
            /* HEADER STIJL (PRINT) */
            .print-header-title { color: black !important; font-size: 24px !important; text-transform: uppercase; }
            .print-header-sub { color: black !important; }

            /* SAMENVATTING BALK (PRINT) */
            .summary-bar { width: 100%; display: flex; gap: 10px; margin-bottom: 20px; border: 1px solid #000; padding: 10px; border-radius: 8px; background: #f0f0f0 !important; color: black !important; }
            .summary-item { flex: 1; text-align: center; border-right: 1px solid #ccc; }
            .summary-item:last-child { border-right: none; }
            .summary-val { font-size: 22px; font-weight: 900; display: block; }
            .summary-lbl { font-size: 10px; text-transform: uppercase; }

            /* HET GRID */
            .tickets-grid { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 15px !important; }

            /* KAARTJES STIJL (PRINT OVERRIDES) */
            .ticket-card { 
                background: white !important; 
                border: 2px dashed #666 !important; /* Snijlijntjes */
                color: black !important;
                box-shadow: none !important;
                break-inside: avoid;
                display: flex; flex-direction: column; justify-content: space-between;
                height: 100%;
            }

            /* Header binnen kaartje */
            .ticket-dept-title { 
                color: white !important; 
                background: black !important; /* Zwarte balk voor naam */
                border: none !important;
                text-align: center !important;
                padding: 5px !important;
                border-radius: 4px;
                margin-bottom: 10px !important;
                -webkit-print-color-adjust: exact;
            }

            /* Items */
            .ticket-row { color: black !important; border-bottom: 1px dotted #ccc; padding-bottom: 2px; margin-bottom: 5px; }
            .ticket-qty { color: black !important; font-size: 18px !important; font-weight: 900 !important; }
            
            /* Checkbox */
            .print-checkbox { 
                display: inline-block !important; 
                width: 12px; height: 12px; 
                border: 1px solid #000; 
                margin-right: 8px; 
                position: relative; top: 2px;
            }

            /* Opmerking */
            .ticket-note { color: black !important; border-color: black !important; background: #eee !important; font-weight: bold; }
            
            /* Verberg lege tickets bij print */
            .empty-ticket { display: none !important; }
        }
    </style>`;

    container.innerHTML = `
    ${printStyles}
    <div class="max-w-[1600px] mx-auto animate-in fade-in zoom-in duration-300 print-container">
        
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 pb-6 gap-4 border-b border-gray-800 print:border-black">
            <div>
                <h2 class="text-3xl font-extrabold text-white print-header-title">Klaarzetten</h2>
                <p class="text-indigo-400 font-medium capitalize print-header-sub">${new Date(webshopDate).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div class="flex gap-2 no-print">
                <button onclick="navigator.clipboard.writeText('${copyText}').then(()=>showToast('Gekopieerd!','success'))" class="bg-[#2a3040] hover:bg-[#32394d] text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-lg border border-gray-700 transition-all"><i data-lucide="copy" class="w-5 h-5 mr-2"></i> Kopieer</button>
                <button onclick="window.print()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold flex items-center shadow-lg hover:scale-105 transition-all"><i data-lucide="printer" class="w-5 h-5 mr-2"></i> Print Lijst</button>
            </div>
        </div>
        
        <div class="mb-10">
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 ml-1 no-print">Aankoopsamenvatting</h3>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 no-print"> 
                ${renderBigCard('WIT BROOD', sum.white, '', 'bg-gray-100 text-black border-gray-300')}
                ${renderBigCard('BRUIN BROOD', sum.brown, '', 'bg-[#3e342e] text-[#d6c0a8] border-[#5a4b42]')}
                ${renderBigCard('CHOCO', sum.choco, '', 'bg-amber-900/40 text-amber-500 border-amber-500/30')}
                ${renderBigCard('CONFITUUR', sum.jam, '', 'bg-rose-900/40 text-rose-500 border-rose-500/30')}
            </div>

            <div class="summary-bar only-print">
                <div class="summary-item"><span class="summary-val">${sum.white}</span><span class="summary-lbl">Wit Brood</span></div>
                <div class="summary-item"><span class="summary-val">${sum.brown}</span><span class="summary-lbl">Bruin Brood</span></div>
                <div class="summary-item"><span class="summary-val">${sum.choco}</span><span class="summary-lbl">Choco</span></div>
                <div class="summary-item"><span class="summary-val">${sum.jam}</span><span class="summary-lbl">Confituur</span></div>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 tickets-grid">
            ${orders.map(o => {
                const i = o.items || {whiteBread:0, brownBread:0, choco:0, jam:0};
                const isEmpty = (i.whiteBread+i.brownBread+i.choco+i.jam)===0;
                
                // Lege tickets: Zichtbaar op web (grijs), weg op print
                if(isEmpty) return `
                <div class="ticket-card empty-ticket p-5 opacity-30 border-dashed border-gray-700 rounded-xl border no-print">
                    <h4 class="text-md font-bold text-gray-500 uppercase tracking-tight mb-2">${o.department}</h4>
                    <div class="text-center py-6 text-xs text-gray-600 italic">Geen bestelling</div>
                </div>`;

                // Normale tickets: Webstijl classes + Print classes (via CSS)
                return `
                <div class="ticket-card bg-[#181b25] border border-gray-800 p-5 rounded-2xl relative overflow-hidden shadow-sm flex flex-col h-full">
                    <div class="flex justify-between items-start mb-4 pl-1 header-row">
                        <h4 class="ticket-dept-title text-lg font-black text-white uppercase tracking-tight truncate border-l-4 border-indigo-500 pl-3 w-full">${o.department}</h4>
                        ${o.note ? `<i data-lucide="message-square" class="w-5 h-5 text-indigo-400 no-print" title="${o.note}"></i>` : ''}
                    </div>

                    <div class="space-y-1 flex-1">
                        ${i.whiteBread > 0 ? `<div class="ticket-row flex justify-between items-center text-gray-300"><div><span class="print-checkbox only-print"></span><span>Wit Brood</span></div> <span class="ticket-qty text-xl font-black text-white">${i.whiteBread}</span></div>` : ''}
                        ${i.brownBread > 0 ? `<div class="ticket-row flex justify-between items-center text-[#d6c0a8]"><div><span class="print-checkbox only-print"></span><span>Bruin Brood</span></div> <span class="ticket-qty text-xl font-black">${i.brownBread}</span></div>` : ''}
                        
                        ${(i.choco > 0 || i.jam > 0) && (i.whiteBread > 0 || i.brownBread > 0) ? '<div class="h-px bg-gray-700/50 my-2 print:my-1 print:bg-black"></div>' : ''}
                        
                        ${i.choco > 0 ? `<div class="ticket-row flex justify-between items-center text-amber-500"><div><span class="print-checkbox only-print"></span><span>Choco</span></div> <span class="ticket-qty text-xl font-black">${i.choco}</span></div>` : ''}
                        ${i.jam > 0 ? `<div class="ticket-row flex justify-between items-center text-rose-500"><div><span class="print-checkbox only-print"></span><span>Confituur</span></div> <span class="ticket-qty text-xl font-black">${i.jam}</span></div>` : ''}
                    </div>

                    ${o.note ? `<div class="ticket-note mt-4 pt-3 border-t border-dashed border-gray-700 text-xs italic text-gray-400">Opmerking: "${o.note}"</div>` : ''}
                </div>`;
            }).join('')}
        </div>
    </div>`;
}

// Helper functie voor de grote kaarten (Web weergave)
function renderBigCard(label, val, icon, classes) { 
    return `
    <div class="flex flex-col items-center justify-center p-6 rounded-2xl border ${classes} shadow-sm print-card">
        <span class="text-3xl mb-2 print-hidden">${icon}</span>
        <span class="text-5xl font-black tracking-tighter">${val}</span>
        <span class="text-[11px] font-bold mt-2 opacity-70 uppercase tracking-widest">${label}</span>
    </div>`; 
}
// =============================================================================
// VIEW 3: INSTELLINGEN
// =============================================================================
async function renderStockView(container) {
    container.innerHTML = `
    <div class="max-w-3xl mx-auto animate-in fade-in zoom-in duration-300">
        <h2 class="text-2xl font-bold text-white mb-6">Instellingen</h2>
        <form onsubmit="saveStockAndPrices(event)" class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 shadow-md">
                <h3 class="text-indigo-400 font-bold mb-4 uppercase text-xs tracking-wider flex items-center"><i data-lucide="tag" class="w-4 h-4 mr-2"></i> Prijzen (€)</h3>
                <div class="space-y-4">
                    ${renderInputRow('Wit Brood', 'price-white', webshopPrices.whiteBread, '€')}
                    ${renderInputRow('Bruin Brood', 'price-brown', webshopPrices.brownBread, '€')}
                    ${renderInputRow('Pot Choco', 'price-choco', webshopPrices.choco, '€')}
                    ${renderInputRow('Pot Confituur', 'price-jam', webshopPrices.jam, '€')}
                </div>
            </div>
            <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 shadow-md">
                <h3 class="text-emerald-400 font-bold mb-4 uppercase text-xs tracking-wider flex items-center"><i data-lucide="package" class="w-4 h-4 mr-2"></i> Huidige Voorraad</h3>
                <div class="space-y-4">
                    ${renderInputRow('Choco (Potten)', 'stock-choco', webshopStock.choco, '#')}
                    ${renderInputRow('Confituur (Potten)', 'stock-jam', webshopStock.jam, '#')}
                </div>
            </div>
            <div class="md:col-span-2"><button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all hover:scale-[1.01] active:scale-95">Wijzigingen Opslaan</button></div>
        </form>
    </div>`;
}

function renderInputRow(label, id, val, prefix) { return `<div class="flex justify-between items-center group"><label class="text-sm text-gray-400 font-medium group-hover:text-gray-300 transition-colors">${label}</label><div class="relative w-28"><span class="absolute left-3 top-2 text-gray-600 text-xs font-bold">${prefix}</span><input type="number" step="0.01" id="${id}" value="${parseFloat(val)}" class="w-full bg-[#0f111a] border border-gray-700 rounded-lg py-1.5 pl-6 pr-3 text-right text-white font-bold font-mono text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"></div></div>`; }

async function saveStockAndPrices(e) {
    e.preventDefault();
    const s = { choco: parseInt(document.getElementById('stock-choco').value), jam: parseInt(document.getElementById('stock-jam').value) };
    const p = { whiteBread: parseFloat(document.getElementById('price-white').value), brownBread: parseFloat(document.getElementById('price-brown').value), choco: parseFloat(document.getElementById('price-choco').value), jam: parseFloat(document.getElementById('price-jam').value) };
    await supabaseClient.from(COLLECTION_NAMES.BROOD_STOCK_DOC).upsert({ id: 1, ...s });
    await supabaseClient.from(COLLECTION_NAMES.BROOD_PRICES_DOC).upsert({ id: 1, ...p });
    showToast("Instellingen opgeslagen", "success"); fetchPricesAndStock();
}

// =============================================================================
// VIEW 4: KOSTEN & SYNC (VIEW SWITCHER)
// =============================================================================
async function renderCostsView(container) {
    let query = supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select('*');
    let titleDate = "";

    if (costViewMode === 'month') {
        const start = `${costMonth}-01`;
        const [y, m] = costMonth.split('-').map(Number);
        const end = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1).toISOString().split('T')[0];
        query = query.gte('date', start).lt('date', end).order('date', {ascending: true});
        titleDate = new Date(start).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' });
    } else {
        query = query.eq('date', costDate);
        titleDate = new Date(costDate).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    }

    const { data } = await query;
    const grouped = {};
    let grandTotal = 0;

    if(data) {
        data.forEach(o => {
            const normalizedDept = normalizeDepartment(o.department);
            if(!grouped[normalizedDept]) grouped[normalizedDept] = { orders: [], total: 0 };
            const i = o.items || {whiteBread:0, brownBread:0, choco:0, jam:0};
            const cost = (i.whiteBread * webshopPrices.whiteBread) + (i.brownBread * webshopPrices.brownBread) + (i.choco * webshopPrices.choco) + (i.jam * webshopPrices.jam);
            grouped[normalizedDept].total += cost;
            grandTotal += cost;
            grouped[normalizedDept].orders.push({ date: o.date, cost: cost, items: i });
        });
    }

    const sortedDepts = Object.keys(grouped).sort();
    let contentHtml = '';

    if (sortedDepts.length === 0) {
        contentHtml = '<div class="p-10 text-center text-gray-500 border border-gray-800 rounded-xl bg-[#181b25]">Geen bestellingen gevonden.</div>';
    } else if (costViewMode === 'month') {
        sortedDepts.forEach(dept => {
            const g = grouped[dept];
            const detailRows = g.orders.map(o => `
                <div class="flex justify-between items-center text-xs text-gray-400 py-2 border-b border-gray-800/50 last:border-0 hover:bg-[#1f2330] px-2 rounded">
                    <span class="font-mono text-gray-300 w-24">${new Date(o.date).toLocaleDateString('nl-BE')}</span>
                    <span class="flex-1 truncate">${o.items.whiteBread}W, ${o.items.brownBread}B, ${o.items.choco}C, ${o.items.jam}J</span>
                    <span class="font-mono text-rose-400">€ -${o.cost.toFixed(2)}</span>
                </div>`).join('');

            contentHtml += `
            <details class="bg-[#181b25] border border-gray-800 rounded-xl overflow-hidden group mb-3 shadow-sm">
                <summary class="flex justify-between items-center p-4 cursor-pointer bg-[#1f2330] hover:bg-[#2a3040] transition-colors select-none">
                    <div class="flex items-center gap-3"><i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 transition-transform group-open:rotate-90"></i><span class="font-bold text-white">${dept}</span></div>
                    <span class="font-mono font-bold text-rose-400">€ -${g.total.toFixed(2)}</span>
                </summary>
                <div class="p-4 bg-[#181b25] border-t border-gray-800 space-y-1"><div class="text-[10px] uppercase font-bold text-gray-600 mb-2 pl-2">Details</div>${detailRows}</div>
            </details>`;
        });
    } else {
        const tableRows = sortedDepts.map(dept => {
            const g = grouped[dept];
            const i = g.orders.reduce((acc, o) => ({ w: acc.w+o.items.whiteBread, b: acc.b+o.items.brownBread, c: acc.c+o.items.choco, j: acc.j+o.items.jam }), {w:0,b:0,c:0,j:0});
            return `<tr class="border-b border-gray-800/50 hover:bg-[#1f2330]"><td class="p-3 text-white font-bold">${dept}</td><td class="p-3 text-center text-gray-400 text-xs">${i.w}W, ${i.b}B, ${i.c}C, ${i.j}J</td><td class="p-3 text-right font-mono text-rose-400 font-bold">€ -${g.total.toFixed(2)}</td></tr>`;
        }).join('');
        contentHtml = `<div class="bg-[#181b25] border border-gray-800 rounded-xl overflow-hidden"><table class="w-full text-sm"><thead class="bg-[#1f2330] text-xs font-bold text-gray-500 text-left"><tr><th class="p-3">Afdeling</th><th class="p-3 text-center">Items</th><th class="p-3 text-right">Kost</th></tr></thead><tbody>${tableRows}</tbody></table></div>`;
    }

    container.innerHTML = `
    <div class="max-w-4xl mx-auto animate-in fade-in zoom-in duration-300">
        <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div>
                <h2 class="text-2xl font-bold text-white">Financieel Overzicht</h2>
                <div class="flex items-center gap-2 mt-1">
                    <div class="flex bg-[#181b25] p-1 rounded-lg border border-gray-700">
                        <button onclick="costViewMode='month'; renderWebshop('costs')" class="px-3 py-1 text-xs font-bold rounded-md transition-all ${costViewMode==='month' ? 'bg-[#2a3040] text-white shadow' : 'text-gray-500 hover:text-white'}">Maand</button>
                        <button onclick="costViewMode='day'; renderWebshop('costs')" class="px-3 py-1 text-xs font-bold rounded-md transition-all ${costViewMode==='day' ? 'bg-[#2a3040] text-white shadow' : 'text-gray-500 hover:text-white'}">Dag</button>
                    </div>
                    <span class="text-sm text-gray-400 ml-2 capitalize">${titleDate}</span>
                </div>
            </div>
            
            <div class="flex gap-3">
                ${costViewMode === 'month' 
                    ? `<input type="month" value="${costMonth}" onchange="costMonth=this.value; renderWebshop('costs')" class="bg-[#181b25] border border-gray-700 text-white rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500">`
                    : `<input type="date" value="${costDate}" onchange="costDate=this.value; renderWebshop('costs')" class="bg-[#181b25] border border-gray-700 text-white rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500">`
                }
                ${costViewMode === 'month' 
                    ? `<button id="sync-btn" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-lg"><i data-lucide="arrow-left-right" class="w-4 h-4 mr-2"></i> Verrekenen</button>`
                    : `<span class="text-xs text-gray-500 italic self-center">Verrekenen enkel per maand</span>`
                }
            </div>
        </div>

        <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 mb-8 flex justify-between items-center shadow-lg">
            <span class="text-gray-400 font-bold uppercase text-xs tracking-widest">Totaal Selectie</span><span class="text-3xl font-black text-rose-400">€ -${grandTotal.toFixed(2)}</span>
        </div>
        
        <div class="space-y-2">${contentHtml}</div>
        
        <div class="mt-8 text-center"><button onclick="exportCostsCSV('${costViewMode}')" class="text-gray-500 hover:text-white text-sm underline">Download CSV Export</button></div>
    </div>`;
    
    if(document.getElementById('sync-btn')) document.getElementById('sync-btn').onclick = () => syncCostsToFinances(grouped);
}

// --- SYNC FUNCTIE (SMART UPDATE) ---
async function syncCostsToFinances(groupedData) {
    if(!await askConfirmation(`Wil je de kosten van ${Object.keys(groupedData).length} afdelingen synchroniseren met het kasboek voor ${costMonth}?`)) return;

    let inserted = 0; let updated = 0;
    const monthName = new Date(`${costMonth}-01`).toLocaleDateString('nl-BE', { month: 'long' });
    const description = `Webshop Afrekening ${monthName}`;

    for (const [dept, data] of Object.entries(groupedData)) {
        if (data.total > 0) {
            const { data: existing } = await supabaseClient.from(COLLECTION_NAMES.FINANCES).select('*').eq('afdeling', dept).eq('description', description).eq('type', 'expense').maybeSingle();

            if (existing) {
                if (Math.abs(existing.amount - data.total) > 0.01) {
                    await supabaseClient.from(COLLECTION_NAMES.FINANCES).update({ amount: data.total, user: currentUser.name }).eq('id', existing.id);
                    updated++;
                }
            } else {
                await supabaseClient.from(COLLECTION_NAMES.FINANCES).insert({
                    description: description, amount: data.total, type: 'expense', category: 'Webshop',
                    afdeling: dept, user: currentUser.name, created_at: new Date().toISOString()
                });
                inserted++;
            }
        }
    }
    if (inserted === 0 && updated === 0) showToast("Alles was al up-to-date.", "info");
    else showToast(`${inserted} nieuw, ${updated} geüpdatet!`, "success");
}

function exportCostsCSV(mode) {
    if(mode !== 'month') { alert("Exporteren kan voorlopig alleen in maandoverzicht."); return; }
    
    // Trigger render om data op te halen (snel trucje, beter is data cachen)
    // Voor nu alert omdat de data in de render-functie zit
    alert("Gebruik de 'Maand' weergave om de maand CSV te downloaden.");
}

// =============================================================================
// HELPER: NORMALISATIE & CONFIRMATION
// =============================================================================
function normalizeDepartment(rawName) {
    if (!rawName) return "Onbekend";
    const clean = rawName.trim();
    const mapping = { 
        "Tip10's": "Tiptiens", 
        "Aspi's": "Aspis", "Aspis": "Aspis",
        "Speelclub meisjes": "Speelclub Meisjes", "Speelclub Meisjes": "Speelclub Meisjes",
        "Speelclub jongens": "Speelclub Jongens", "Speelclub Jongens": "Speelclub Jongens",
        "Kerels": "Kerels", 
        "Tippers": "Tippers", 
        "Toppers": "Toppers", 
        "Rakkers": "Rakkers", 
        "Kwiks": "Kwiks", 
        "Sloebers": "Sloebers"
    };
    return mapping[clean] || mapping[clean.toLowerCase()] || clean;
}

function askConfirmation(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmation-modal');
        const msg = document.getElementById('confirm-message');
        const yesBtn = document.getElementById('confirm-yes-btn');
        const noBtn = document.getElementById('confirm-cancel-btn');
        
        if(!modal) return resolve(confirm(message));

        msg.innerText = message;
        modal.classList.remove('hidden');

        const close = (result) => {
            modal.classList.add('hidden');
            yesBtn.onclick = null;
            noBtn.onclick = null;
            resolve(result);
        };
        yesBtn.onclick = () => close(true);
        noBtn.onclick = () => close(false);
    });
}

// =============================================================================
// MODAL & CSV & DELETE
// =============================================================================
function openEditModal(id) {
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-id').value = id;
    const select = document.getElementById('edit-dept');
    select.innerHTML = '<option value="" disabled selected>Kies Afdeling...</option>' + AFDELINGEN_CONFIG.map(a => `<option value="${a.naam}">${a.naam}</option>`).join('');
    
    if (id === 'new') {
        select.disabled = false; select.value = "";
        ['white','brown','choco','jam'].forEach(k => document.getElementById(`edit-${k}`).value = 0);
    } else {
        const order = webshopOrders.find(o => o.id === id);
        if (order) {
            select.value = normalizeDepartment(order.department);
            select.disabled = true;
            document.getElementById('edit-white').value = order.items?.whiteBread||0;
            document.getElementById('edit-brown').value = order.items?.brownBread||0;
            document.getElementById('edit-choco').value = order.items?.choco||0;
            document.getElementById('edit-jam').value = order.items?.jam||0;
        }
    }
}
function closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); }
async function saveEditedOrder(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const dept = document.getElementById('edit-dept').value;
    if(!dept) { showToast("Kies een afdeling", "error"); return; }
    const items = { whiteBread: parseInt(document.getElementById('edit-white').value)||0, brownBread: parseInt(document.getElementById('edit-brown').value)||0, choco: parseInt(document.getElementById('edit-choco').value)||0, jam: parseInt(document.getElementById('edit-jam').value)||0 };
    await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).upsert({ id: id==='new' ? `${webshopDate}_${dept}` : id, date: webshopDate, department: dept, items: items, lastEditedBy: currentUser.name });
    showToast("Opgeslagen", "success"); closeEditModal(); renderWebshop('order');
}
async function deleteOrder(dept, date) { 
    if(await askConfirmation(`Bestelling van ${dept} verwijderen?`)) { 
        await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).delete().eq('id', `${date}_${dept}`); 
        renderWebshop('order'); 
    } 
}
async function deleteAllOrders() {
    if(await askConfirmation(`Weet je zeker dat je ALLE bestellingen voor ${new Date(webshopDate).toLocaleDateString('nl-BE')} wilt verwijderen?`)) {
        await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).delete().eq('date', webshopDate);
        showToast("Alles gewist", "success");
        renderWebshop('order');
    }
}

function handleDrop(e) { e.preventDefault(); e.currentTarget.classList.remove('drag-active'); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }
function handleFileSelect(input) { if(input.files[0]) processFile(input.files[0]); }

function processFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const rows = text.split('\n');
        pendingImport = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i].trim();
            if(!row) continue;
            
            // CSV Parser die rekening houdt met quotes en lege velden
            const cols = [];
            let current = '';
            let inQuote = false;
            
            for(let j=0; j<row.length; j++) {
                const char = row[j];
                if(char === '"') {
                    inQuote = !inQuote;
                } else if(char === ',' && !inQuote) {
                    cols.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            cols.push(current.trim());
            const cleanCols = cols.map(c => c.replace(/^"|"$/g, '').trim());

            // Index check: 2=Ja/Nee, 3=Afdeling, 4=Bruin, 5=Wit, 6=Choco, 7=Jam, 8=Opmerking
            if (cleanCols.length < 5) continue;
            
            if (cleanCols[2]?.toLowerCase() === 'ja') {
                const dept = normalizeDepartment(cleanCols[3]);
                pendingImport.push({ 
                    department: dept, 
                    items: { 
                        brownBread: parseInt(cleanCols[4])||0, 
                        whiteBread: parseInt(cleanCols[5])||0, 
                        choco: parseInt(cleanCols[6])||0, 
                        jam: parseInt(cleanCols[7])||0 
                    }, 
                    note: cleanCols[8] || '' 
                });
            }
        }
        showPreviewUI();
    };
    reader.readAsText(file);
}

function showPreviewUI() {
    document.getElementById('upload-step').classList.add('hidden');
    document.getElementById('preview-step').classList.remove('hidden');
    document.getElementById('preview-count').innerText = pendingImport.length;
    document.getElementById('preview-table-body').innerHTML = pendingImport.map(o => `<tr><td class="p-2 text-white font-bold">${o.department}</td><td class="p-2">W:${o.items.whiteBread} B:${o.items.brownBread}</td></tr>`).join('');
}
function cancelImport() { pendingImport=[]; document.getElementById('preview-step').classList.add('hidden'); document.getElementById('upload-step').classList.remove('hidden'); }
async function confirmImport() {
    for(const o of pendingImport) { if(o.department) await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).upsert({ id: `${webshopDate}_${o.department}`, date: webshopDate, department: o.department, items: o.items, note: o.note, lastEditedBy: 'Import' }); }
    showToast("Geïmporteerd!", "success"); cancelImport(); renderWebshop('order');
}