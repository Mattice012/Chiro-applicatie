window.onload = async () => {
    renderLayout();
    const user = await requireAuth();
    if(user) renderProfile();
};

function renderProfile() {
    const html = `
    <div class="max-w-4xl mx-auto animate-in fade-in zoom-in duration-300">
        <div class="mb-8"><h2 class="text-2xl font-bold text-white">Mijn Profiel</h2></div>
        <div class="bg-[#181b25] border border-gray-800/50 rounded-2xl p-6 shadow-xl flex flex-col items-center text-center">
            <div class="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-3xl font-bold ring-4 ring-[#0f111a] shadow-2xl text-white mb-4">
                ${(currentUser.name || 'U').charAt(0)}
            </div>
            <h3 class="text-xl font-bold text-white">${currentUser.name}</h3>
            <p class="text-gray-500 text-sm mt-1">${currentUser.email}</p>
            <div class="flex items-center mt-4 px-3 py-1 rounded-full border border-gray-700 text-white">
                <span class="text-xs font-bold uppercase tracking-wide">${USER_ROLES[currentUser.role].label}</span>
            </div>
             <button onclick="handleLogout()" class="mt-6 px-6 py-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors font-bold text-sm">
                Afmelden
            </button>
        </div>
    </div>`;
    document.getElementById('profile-content').innerHTML = html;
}