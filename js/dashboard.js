window.onload = async () => {
    renderLayout();
    const user = await requireAuth();
    if(user) renderDashboard();
};

async function renderDashboard() {
    const nextSunday = getNextSunday();
    const nextSundayDate = new Date(nextSunday);
    const formattedSunday = nextSundayDate.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });

    // Fetch Stats
    const { count: orderCount } = await supabaseClient.from(COLLECTION_NAMES.BROOD_ORDERS).select('*', { count: 'exact', head: true }).eq('date', nextSunday);
    const { data: attendanceData } = await supabaseClient.from(COLLECTION_NAMES.AANWEZIGHEDEN).select('totaalAantal, datum').order('datum', { ascending: false }).limit(2);
    
    let attendanceLabel = "Nog geen data";
    let attendanceTrend = "Geen trend";
    let isPos = true;
    if (attendanceData && attendanceData.length > 0) {
        const latest = attendanceData[0].totaalAantal;
        attendanceLabel = `${latest} aanw.`;
        if (attendanceData.length > 1) {
            const prev = attendanceData[1].totaalAantal;
            const diff = latest - prev;
            attendanceTrend = diff >= 0 ? `+${diff} vs vorig` : `${diff} vs vorig`;
            isPos = diff >= 0;
        }
    }

    const html = `
    <div class="mb-8 p-6 sm:p-10 rounded-[2rem] bg-gradient-to-br from-[#1e2330] to-[#12141c] border border-gray-800/50 relative overflow-hidden shadow-2xl group animate-in fade-in zoom-in duration-300">
        <div class="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none animate-pulse-slow"></div>
        <div class="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div class="max-w-2xl">
                <div class="inline-block px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold mb-3 uppercase tracking-wider">Dashboard</div>
                <h1 class="text-3xl sm:text-4xl font-extrabold mb-3 text-white leading-tight tracking-tight">Welkom terug, ${currentUser.name || 'Leiding'}! 👋</h1>
                <p class="text-gray-400 text-base sm:text-lg leading-relaxed max-w-xl">
                    Alles staat klaar voor de volgende Chiro-zondag. Check je bestellingen en bereid de telling voor.
                </p>
            </div>
            <div class="flex flex-wrap gap-3 sm:flex-nowrap">
                <a href="aanwezigheden.html" class="flex-1 sm:flex-none px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg hover:-translate-y-0.5 flex justify-center items-center">
                    <i data-lucide="clipboard-list" class="w-4 h-4 mr-2"></i> Telling
                </a>
                <a href="bestellingen.html" class="flex-1 sm:flex-none px-6 py-3.5 bg-[#2a3040] hover:bg-[#32394d] text-gray-200 hover:text-white rounded-xl font-bold transition-all border border-gray-700/50 hover:border-gray-600 hover:-translate-y-0.5 flex justify-center items-center">
                    <i data-lucide="shopping-cart" class="w-4 h-4 mr-2 text-emerald-400"></i> Bestellen
                </a>
            </div>
        </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        ${renderQuickStat('Volgende Chiro', formattedSunday, 'Zondag', true, 'calendar', 'text-blue-400', 'bg-blue-400/10')}
        ${renderQuickStat('Brood Bestellingen', orderCount || 0, 'Voor zondag', true, 'shopping-bag', 'text-rose-400', 'bg-rose-400/10')}
        ${renderQuickStat('Laatste Telling', attendanceLabel, attendanceTrend, isPos, 'users', 'text-amber-400', 'bg-amber-400/10')}
    </div>
    
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="glass-card rounded-[2rem] p-6 shadow-xl flex flex-col h-full hover:border-indigo-500/30 transition-all duration-300 group hover:-translate-y-1">
            <div class="flex justify-between items-start mb-5">
                <div class="p-3.5 rounded-2xl bg-indigo-400/10 text-indigo-400 shadow-lg group-hover:bg-indigo-500 group-hover:text-white transition-all"><i data-lucide="clipboard-list" class="w-6 h-6"></i></div>
            </div>
            <h2 class="text-xl font-bold text-white mb-2.5">Administratie</h2>
            <p class="text-gray-400 text-sm mb-6">Voer de wekelijkse aanwezigheidstelling in en bekijk statistieken.</p>
            <div class="mt-auto space-y-2">
                ${renderLinkItem('edit-3', 'Nieuwe Telling', 'aanwezigheden.html')}
                ${renderLinkItem('bar-chart-3', 'Statistieken', 'aanwezigheden.html')} </div>
        </div>

        <div class="glass-card rounded-[2rem] p-6 shadow-xl flex flex-col h-full hover:border-rose-500/30 transition-all duration-300 group hover:-translate-y-1">
             <div class="flex justify-between items-start mb-5">
                <div class="p-3.5 rounded-2xl bg-rose-400/10 text-rose-400 shadow-lg group-hover:bg-rose-500 group-hover:text-white transition-all"><i data-lucide="shopping-bag" class="w-6 h-6"></i></div>
            </div>
            <h2 class="text-xl font-bold text-white mb-2.5">Webshop</h2>
            <p class="text-gray-400 text-sm mb-6">Bestel broodjes voor zondag, beheer voorraad en bekijk bestellingen.</p>
            <div class="mt-auto space-y-2">
                ${renderLinkItem('shopping-cart', 'Bestellen & Klaarzetten', 'bestellingen.html')}
                ${renderLinkItem('euro', 'Kosten Overzicht', 'bestellingen.html')}
            </div>
        </div>
    </div>
    `;
    document.getElementById('main-content').innerHTML = html;
    lucide.createIcons();
}

function renderQuickStat(label, value, trend, isPos, icon, colorClass, bgClass) {
    return `
    <div class="bg-[#181b25] border border-gray-800/50 p-5 rounded-2xl hover:border-gray-700 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group">
        <div class="flex justify-between items-start mb-4">
            <div class="p-2.5 rounded-xl ${bgClass} ${colorClass} group-hover:scale-110 transition-transform"><i data-lucide="${icon}" class="w-5 h-5"></i></div>
            <div class="flex items-center text-xs font-medium px-2.5 py-1 rounded-lg ${isPos ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
                ${isPos ? '<i data-lucide="trending-up" class="w-3 h-3 mr-1"></i>' : '<i data-lucide="alert-circle" class="w-3 h-3 mr-1"></i>'}
                ${trend}
            </div>
        </div>
        <div>
            <p class="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">${label}</p>
            <h3 class="text-2xl font-bold text-white">${value}</h3>
        </div>
    </div>`;
}

function renderLinkItem(icon, text, href) {
    return `
    <a href="${href}" class="w-full flex items-center justify-between py-3.5 px-4 rounded-xl transition-all duration-200 group border border-transparent hover:bg-[#1f2330] hover:border-gray-800/80 cursor-pointer">
        <div class="flex items-center">
            <i data-lucide="${icon}" class="w-4 h-4 mr-4 text-gray-400 group-hover:text-indigo-400"></i>
            <span class="text-sm font-medium text-gray-300 group-hover:text-white">${text}</span>
        </div>
        <i data-lucide="chevron-right" class="w-4 h-4 text-gray-600 group-hover:text-indigo-400"></i>
    </a>`;
}