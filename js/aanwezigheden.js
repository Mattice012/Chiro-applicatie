// js/aanwezigheden.js

let counts = {};
let notes = {};

window.onload = async () => {
    renderLayout(); // Ingebouwd in layout.js
    const user = await requireAuth(); // Beveiliging checken
    if(user) renderOverview();
};

/**
 * Toont de geschiedenis van alle aanwezigheden, gegroepeerd per maand.
 */
async function renderOverview() {
    const container = document.getElementById('attendance-content');
    container.innerHTML = '<div class="flex justify-center p-10"><div class="loader"></div></div>';

    const { data, error } = await supabaseClient
        .from(COLLECTION_NAMES.AANWEZIGHEDEN)
        .select('*')
        .order('datum', { ascending: false });

    if (error) { 
        showToast("Fout bij laden", "error"); 
        return; 
    }
    
    if (!data || data.length === 0) { 
        container.innerHTML = '<div class="text-center text-gray-500">Geen historiek gevonden.</div>'; 
        return; 
    }

    const grouped = {};
    data.forEach(item => {
        const monthName = new Date(item.datum).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' });
        if (!grouped[monthName]) grouped[monthName] = [];
        grouped[monthName].push(item);
    });

    let html = '<div class="space-y-6 animate-in fade-in zoom-in duration-300">';
    Object.keys(grouped).forEach(month => {
        const items = grouped[month];
        const monthTotal = items.reduce((acc, curr) => acc + (curr.totaalAantal || 0), 0);
        html += `
        <div class="rounded-2xl border border-gray-700/50 shadow-xl overflow-hidden">
            <details class="group"> 
                <summary class="flex cursor-pointer items-center justify-between bg-[#1e2330] px-6 py-4 transition-colors hover:bg-[#1f2536] select-none">
                    <div class="flex items-center gap-3">
                        <i data-lucide="chevron-down" class="text-indigo-400 transition-transform group-open:rotate-180 w-5 h-5"></i>
                        <h3 class="text-xl font-bold text-white capitalize">${month}</h3>
                    </div>
                    <div class="flex items-center gap-4">
                        <span class="text-sm font-normal text-gray-400">Totaal: ${items.length} tell.</span>
                        <div class="h-10 px-4 flex items-center justify-center rounded-xl bg-indigo-500 text-lg font-bold text-white shadow-md">${monthTotal}</div>
                    </div>
                </summary>
                <div class="p-6 space-y-4 bg-[#13161f]"> 
                    ${items.map(item => {
                        const dateStr = new Date(item.datum).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
                        const canDelete = currentUser.role === 'ADMIN' || currentUser.role === 'STATISTIEKEN';
                        return `
                        <div class="bg-[#181b25] border border-gray-700/50 rounded-xl overflow-hidden shadow-sm">
                            <div class="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-700/50">
                                <h4 class="text-lg font-bold text-white">${dateStr}</h4>
                                <div class="flex items-center gap-4">
                                    <div class="bg-emerald-500/10 text-emerald-300 px-3 py-1 rounded-full text-sm font-bold border border-emerald-500/20">${item.totaalAantal} totaal</div>
                                    ${canDelete ? `<button onclick="deleteAttendance('${item.datum}')" class="text-gray-600 hover:text-rose-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
                                </div>
                            </div>
                            <div class="p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                                ${item.afdelingen.filter(a => a.aantal > 0).map(a => `<div class="bg-[#1f2330] p-2 rounded text-xs text-gray-300 flex justify-between"><span>${a.naam}</span><span class="font-bold text-white">${a.aantal}</span></div>`).join('')}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </details>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    lucide.createIcons();
}

/**
 * Rendert de invoer-interface voor een nieuwe of bestaande telling.
 */
function renderInput() {
    AFDELINGEN_CONFIG.forEach(a => { counts[a.naam] = 0; notes[a.naam] = ""; });
    const nextSunday = getNextSunday();
    const container = document.getElementById('attendance-content');
    
    let html = `
    <div class="animate-in fade-in zoom-in duration-300">
        <div class="bg-[#181b25] border border-gray-800/50 rounded-2xl p-6 mb-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div class="flex items-center gap-4">
                <div class="bg-[#1f2330] p-3 rounded-xl border border-gray-700/50"><i data-lucide="calendar" class="text-indigo-400 w-6 h-6"></i></div>
                <div><label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Datum</label><input id="att-date" type="date" value="${nextSunday}" onchange="loadAttendanceDate(this.value)" class="bg-transparent text-white font-bold text-lg border-none focus:ring-0 p-0"></div>
            </div>
            <div class="flex items-center gap-6 bg-indigo-500/10 px-6 py-3 rounded-xl border border-indigo-500/20"><span class="text-sm font-bold text-indigo-300">TOTAAL</span><span id="total-count-display" class="text-3xl font-extrabold text-white">0</span></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            ${AFDELINGEN_CONFIG.map(afd => `
            <div class="bg-[#181b25] border-t-4 ${afd.border} rounded-xl shadow-lg p-5 flex flex-col hover:-translate-y-1 transition-transform border-x border-b border-gray-800/50">
                <h3 class="text-lg font-bold text-white text-center mb-4">${afd.naam}</h3>
                <div class="flex items-center justify-center gap-4 mb-4">
                    <button onclick="updateCount('${afd.naam}', -1)" class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg active:scale-95 ${afd.btn}">-</button>
                    <span id="count-${afd.naam.replace(/\s/g, '')}" class="text-4xl font-extrabold text-gray-200 w-16 text-center tabular-nums">0</span>
                    <button onclick="updateCount('${afd.naam}', 1)" class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg active:scale-95 ${afd.btn}">+</button>
                </div>
                <textarea id="note-${afd.naam.replace(/\s/g, '')}" placeholder="Opmerking..." rows="2" class="w-full bg-[#0f111a] border border-gray-700/50 rounded-lg p-2 text-sm text-gray-300 focus:outline-none resize-none mt-auto"></textarea>
            </div>`).join('')}
        </div>
        <div class="bg-[#181b25] border border-gray-800/50 rounded-2xl p-6 shadow-xl">
            <h3 class="text-lg font-bold text-white mb-3">Algemene Mededeling</h3>
            <textarea id="general-note" placeholder="Type hier..." class="w-full bg-[#0f111a] border border-gray-700/50 rounded-xl p-4 text-gray-300 focus:outline-none min-h-[100px] mb-6"></textarea>
            <div class="flex justify-end"><button onclick="saveAttendance()" class="flex items-center justify-center px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg transition-all"><i data-lucide="save" class="w-5 h-5 mr-2"></i> Opslaan</button></div>
        </div>
    </div>`;
    
    container.innerHTML = html;
    loadAttendanceDate(nextSunday, false); // Stille load bij initialisatie
    lucide.createIcons();
}

/**
 * Past de teller voor een specifieke afdeling aan.
 */
function updateCount(naam, delta) {
    counts[naam] = Math.max(0, (counts[naam] || 0) + delta);
    let total = 0;
    AFDELINGEN_CONFIG.forEach(a => {
        const safeName = a.naam.replace(/\s/g, '');
        const val = counts[a.naam];
        const el = document.getElementById(`count-${safeName}`);
        if(el) el.innerText = val;
        total += val;
    });
    const totalDisplay = document.getElementById('total-count-display');
    if(totalDisplay) totalDisplay.innerText = total;
}

/**
 * Laadt bestaande data voor een geselecteerde datum.
 * @param {string} date - De geselecteerde datum.
 * @param {boolean} showFeedback - Of er een toast getoond moet worden (default: true).
 */
async function loadAttendanceDate(date, showFeedback = true) {
    const { data } = await supabaseClient.from(COLLECTION_NAMES.AANWEZIGHEDEN).select('*').eq('datum', date).maybeSingle();
    
    // Reset alles eerst
    AFDELINGEN_CONFIG.forEach(a => { counts[a.naam] = 0; });
    const noteEl = document.getElementById('general-note');
    if(noteEl) noteEl.value = "";
    
    AFDELINGEN_CONFIG.forEach(a => {
        const el = document.getElementById(`note-${a.naam.replace(/\s/g, '')}`);
        if(el) el.value = "";
    });
    
    if (data) {
        if(noteEl) noteEl.value = data.algemeneMededeling || "";
        if(data.afdelingen) {
            data.afdelingen.forEach(item => { 
                counts[item.naam] = item.aantal; 
                const el = document.getElementById(`note-${item.naam.replace(/\s/g, '')}`);
                if(el) el.value = item.opmerking || "";
            });
        }
        // Feedback verbetering: Alleen tonen als showFeedback true is
        if(showFeedback) showToast(`Bestaande gegevens van ${new Date(date).toLocaleDateString('nl-BE')} geladen ✔️`, "info");
    }
    
    updateCount(AFDELINGEN_CONFIG[0].naam, 0); // Trigger UI update voor de eerste afdeling
}

/**
 * Slaat de huidige telling op in de database.
 */
async function saveAttendance() {
    const date = document.getElementById('att-date').value;
    const generalNote = document.getElementById('general-note').value;
    const totalDisplay = document.getElementById('total-count-display');
    const total = totalDisplay ? parseInt(totalDisplay.innerText) : 0;
    
    const afdelingenData = AFDELINGEN_CONFIG.map(afd => {
        const safeName = afd.naam.replace(/\s/g, '');
        const el = document.getElementById(`note-${safeName}`);
        return { 
            naam: afd.naam, 
            aantal: counts[afd.naam] || 0, 
            opmerking: el ? el.value : "" 
        };
    });

    const { error } = await supabaseClient.from(COLLECTION_NAMES.AANWEZIGHEDEN).upsert({
        datum: date, 
        timestamp: new Date().toISOString(), 
        algemeneMededeling: generalNote, 
        totaalAantal: total, 
        afdelingen: afdelingenData
    }, { onConflict: 'datum' });

    if (error) {
        showToast("Fout bij opslaan: " + error.message, "error");
    } else { 
        showToast("Telling opgeslagen!", "success"); 
        renderOverview(); 
    }
}

/**
 * Verwijdert een telling na bevestiging.
 */
async function deleteAttendance(date) {
    // Gebruik de robuuste globale confirmation modal uit layout.js
    const confirmed = await window.askConfirmation(
        "Telling verwijderen", 
        `Ben je zeker dat je de telling van ${new Date(date).toLocaleDateString('nl-BE')} wilt wissen?`
    );

    if(confirmed) {
        const { error } = await supabaseClient
            .from(COLLECTION_NAMES.AANWEZIGHEDEN)
            .delete()
            .eq('datum', date);

        if(!error) { 
            showToast("Verwijderd", "success"); 
            renderOverview(); 
        } else {
            showToast("Kon niet verwijderen: " + error.message, "error");
        }
    }
}