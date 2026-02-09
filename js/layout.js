// js/layout.js

async function renderLayout() {
    const user = await requireAuth(); 
    
    // 1. Sidebar Injecteren
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = `
        <div id="sidebar-overlay" class="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300"></div>
        <aside id="sidebar" class="fixed top-0 left-0 z-50 h-full w-72 lg:w-64 bg-[#181b25]/95 backdrop-blur-xl border-r border-gray-800/50 transition-transform duration-300 -translate-x-full lg:translate-x-0 shadow-2xl">
            <div class="flex flex-col h-full">
                <div class="h-20 flex items-center px-6 border-b border-gray-800/50 bg-[#181b25]/50">
                    <div class="w-10 h-10 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                        <span class="font-bold text-xl text-white">C</span>
                    </div>
                    <div>
                        <span class="font-bold text-lg text-white">CHIRO</span>
                        <span class="text-xs font-semibold text-indigo-400 block uppercase">Portaal</span>
                    </div>
                    <button id="close-sidebar" class="ml-auto lg:hidden text-gray-400"><i data-lucide="x"></i></button>
                </div>

                <nav class="flex-1 overflow-y-auto py-6 px-4 space-y-1.5" id="sidebar-nav"></nav>

                <div class="p-4 m-4 rounded-xl bg-[#13161f] border border-gray-800/50">
                    <div class="flex items-center">
                        <div id="user-avatar" class="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold text-white">
                            ${(user?.user_metadata?.full_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div class="ml-3 overflow-hidden">
                            <p id="user-name-display" class="text-sm font-semibold truncate text-white">Laden...</p>
                            <p id="user-role-display" class="text-xs text-amber-400 font-bold truncate">...</p>
                        </div>
                    </div>
                </div>
            </div>
        </aside>`;
    }

    // 2. Header Injecteren
    const headerContainer = document.getElementById('header-container');
    if (headerContainer) {
        headerContainer.innerHTML = `
        <header class="h-20 bg-[#0f111a]/80 backdrop-blur-xl border-b border-gray-800/50 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
            <button id="open-sidebar" class="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white"><i data-lucide="menu"></i></button>
            <div class="hidden md:flex items-center bg-[#181b25] rounded-xl px-4 py-2.5 border border-gray-800 w-96">
                <i data-lucide="search" class="text-gray-500 mr-3 h-4 w-4"></i>
                <input type="text" placeholder="Zoek..." class="bg-transparent border-none focus:outline-none text-sm w-full text-gray-200">
            </div>
            <div class="flex items-center space-x-3">
                <div class="hidden md:flex items-center px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                    <span class="w-1.5 h-1.5 bg-amber-500 rounded-full mr-2 animate-pulse"></span>
                    <span id="header-role-badge" class="text-xs font-medium text-amber-500">Rol: ...</span>
                </div>
                <button onclick="handleLogout()" class="p-2.5 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all" title="Afmelden">
                    <i data-lucide="log-out" class="w-5 h-5"></i>
                </button>
            </div>
        </header>`;
    }

    // 3. Globale Modals Injecteren (NIEUW)
    if (!document.getElementById('global-confirmation-modal')) {
        const modalHTML = `
        <div id="global-confirmation-modal" class="fixed inset-0 z-[150] hidden">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"></div>
            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-[#181b25] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden p-6 text-center animate-in fade-in zoom-in duration-200">
                <div class="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
                    <i data-lucide="alert-triangle" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-bold text-white mb-2" id="g-confirm-title">Bevestigen</h3>
                <p class="text-gray-400 text-sm mb-6" id="g-confirm-message">Weet je het zeker?</p>
                <div class="flex gap-3">
                    <button id="g-confirm-no" class="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-800 font-bold text-sm transition-colors">Nee</button>
                    <button id="g-confirm-yes" class="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg transition-all">Ja</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        lucide.createIcons(); // Zorg dat iconen werken in modal
    }
    
    // 4. Mobiele menu logica
    setTimeout(() => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const openBtn = document.getElementById('open-sidebar');
        const closeBtn = document.getElementById('close-sidebar');

        const openMenu = () => {
            if(sidebar) sidebar.classList.remove('-translate-x-full');
            if(overlay) {
                overlay.classList.remove('opacity-0', 'pointer-events-none');
                overlay.classList.add('opacity-100', 'pointer-events-auto');
            }
        };
        const closeMenu = () => {
            if(sidebar) sidebar.classList.add('-translate-x-full');
            if(overlay) {
                overlay.classList.remove('opacity-100', 'pointer-events-auto');
                overlay.classList.add('opacity-0', 'pointer-events-none');
            }
        };

        if(openBtn) openBtn.onclick = openMenu;
        if(closeBtn) closeBtn.onclick = closeMenu;
        if(overlay) overlay.onclick = closeMenu;
    }, 100);
    
    renderNavLinks();
    updateUserDisplay();
}

function renderNavLinks() {
    const container = document.getElementById('sidebar-nav');
    if(!container) return;
    
    const path = window.location.pathname.split("/").pop(); 
    
    const items = [
        { href: 'dashboard.html', icon: 'layout-grid', label: 'Dashboard' },
        { href: 'aanwezigheden.html', icon: 'clipboard-list', label: 'Aanwezigheden' },
        { href: 'bestellingen.html', icon: 'shopping-bag', label: 'Webshop' },
        { href: 'financien.html', icon: 'wallet', label: 'Financiën' },
        { href: 'statistieken.html', icon: 'bar-chart-3', label: 'Statistieken' }, 
        { href: 'profiel.html', icon: 'user', label: 'Mijn Profiel', spacer: true },
    ];

    let html = '';
    items.forEach(item => {
        if (item.spacer) {
            html += `<div class="pt-8 pb-3 px-2 text-xs font-bold text-gray-600 uppercase tracking-widest">Instellingen</div>`;
        }
        
        const isActive = path === item.href || (path === '' && item.href === 'dashboard.html');
        
        html += `
        <a href="${item.href}" class="w-full flex items-center px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive ? 'bg-indigo-500/10 text-indigo-400 shadow-[inset_3px_0_0_0_#6366f1]' : 'hover:bg-[#1f2330] text-gray-400 hover:text-gray-200'}">
            <i data-lucide="${item.icon}" class="w-5 h-5 mr-3 transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-indigo-400' : 'text-gray-500'}"></i>
            <span>${item.label}</span>
        </a>`;
    });
    
    container.innerHTML = html;
    lucide.createIcons();
}

function updateUserDisplay() {
    if(currentUser) {
        const roleLabel = USER_ROLES[currentUser.role]?.label || 'Lid';
        const name = currentUser.user_metadata?.full_name || 'Gebruiker';
        
        const nameDisplay = document.getElementById('user-name-display');
        const roleDisplay = document.getElementById('user-role-display');
        const avatarDisplay = document.getElementById('user-avatar');
        
        if(nameDisplay) nameDisplay.innerText = name;
        if(roleDisplay) roleDisplay.innerText = roleLabel;
        if(avatarDisplay) avatarDisplay.innerText = name.charAt(0).toUpperCase();
        
        const headerBadge = document.getElementById('header-role-badge');
        if(headerBadge) headerBadge.innerText = `Rol: ${roleLabel}`;
    }
}

async function handleLogout() {
    localStorage.removeItem('chiro_last_active');
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}