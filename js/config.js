// js/config.js

// --- CONFIGURATIE ---
const SUPABASE_URL = 'https://bqplzquqmfxqobfkmwua.supabase.co'; 
// LET OP: De anon key is publiek toegankelijk in de frontend. 
// Zorg ervoor dat Row Level Security (RLS) in het Supabase dashboard is ingeschakeld 
// voor alle tabellen (bread_orders, finances, etc.) om ongeautoriseerde toegang te voorkomen.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcGx6cXVxbWZ4cW9iZmttd3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMDM5NjAsImV4cCI6MjA4MDc3OTk2MH0.638_AjXjp_p4E9kDjWkLbUry5gphb1X9Q6Fglp2ZjOI';

// Globals
let supabaseClient;
let currentUser = null;
let authPromise = null;   // Voorkomt dubbele auth-checks (race conditions)
let timerStarted = false; // Voorkomt dubbele timers

const COLLECTION_NAMES = {
    PORTAL_USERS: 'portal_users',
    LEDEN: 'leden',
    BROOD_ORDERS: 'bread_orders',
    FINANCES: 'finances',
    BROOD_STOCK_DOC: 'bread_stock',
    BROOD_PRICES_DOC: 'bread_prices',
    AANWEZIGHEDEN: 'aanwezigheden',
    WEBSHOP_COSTS: 'webshop_monthly_costs' 
};

const USER_ROLES = {
    LEIDING: { label: 'Leiding', color: 'bg-blue-500/10 text-blue-400', canDoAttendance: false, canDoAdmin: false, canViewFinances: false, canDoWebshopAdmin: false },
    STATISTIEKEN: { label: 'Statistieken', color: 'bg-teal-500/10 text-teal-400', canDoAttendance: true, canDoAdmin: true, canViewFinances: false, canDoWebshopAdmin: false },
    KASSIER: { label: 'Kassier', color: 'bg-emerald-500/10 text-emerald-400', canDoAttendance: true, canDoAdmin: false, canViewFinances: true, canDoWebshopAdmin: true },
    VB: { label: 'VB', color: 'bg-purple-500/10 text-purple-400', canDoAttendance: true, canDoAdmin: false, canViewFinances: true, canDoWebshopAdmin: false },
    ADMIN: { label: 'Admin', color: 'bg-rose-500/10 text-rose-400', canDoAttendance: true, canDoAdmin: true, canViewFinances: true, canDoWebshopAdmin: true },
    KOOKOUDER: { label: 'Kookouder', color: 'bg-orange-500/10 text-orange-400', canDoAttendance: false, canDoAdmin: false, canViewFinances: false, canDoWebshopAdmin: true }
};

const AFDELINGEN_CONFIG = [
    { naam: "Sloebers", kleur: "purple", border: "border-purple-500", bg: "bg-purple-500", text: "text-purple-400", btn: "bg-purple-600 hover:bg-purple-500" },
    { naam: "Speelclub Jongens", kleur: "yellow", border: "border-yellow-500", bg: "bg-yellow-500", text: "text-yellow-400", btn: "bg-yellow-600 hover:bg-yellow-500" },
    { naam: "Speelclub Meisjes", kleur: "yellow", border: "border-yellow-500", bg: "bg-yellow-500", text: "text-yellow-400", btn: "bg-yellow-600 hover:bg-yellow-500" },
    { naam: "Rakkers", kleur: "green", border: "border-emerald-500", bg: "bg-emerald-500", text: "text-emerald-400", btn: "bg-emerald-600 hover:bg-emerald-500" },
    { naam: "Kwiks", kleur: "green", border: "border-emerald-500", bg: "bg-emerald-500", text: "text-emerald-400", btn: "bg-emerald-600 hover:bg-emerald-500" },
    { naam: "Toppers", kleur: "red", border: "border-rose-500", bg: "bg-rose-500", text: "text-rose-400", btn: "bg-rose-600 hover:bg-rose-500" },
    { naam: "Tippers", kleur: "red", border: "border-rose-500", bg: "bg-rose-500", text: "text-rose-400", btn: "bg-rose-600 hover:bg-rose-500" },
    { naam: "Kerels", kleur: "blue", border: "border-blue-500", bg: "bg-blue-500", text: "text-blue-400", btn: "bg-blue-600 hover:bg-blue-500" },
    { naam: "Tip10's", kleur: "blue", border: "border-blue-500", bg: "bg-blue-500", text: "text-blue-400", btn: "bg-blue-600 hover:bg-blue-500" },
    { naam: "Aspis", kleur: "orange", border: "border-orange-500", bg: "bg-orange-500", text: "text-orange-400", btn: "bg-orange-600 hover:bg-orange-500" },
];

// Init Client
if (typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Helpers
function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const el = document.createElement('div');
    el.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 w-full sm:w-auto transform translate-y-0 opacity-100 ${type === 'success' ? 'bg-[#0f111a]/95 border-emerald-500/30 text-emerald-400' : 'bg-[#0f111a]/95 border-rose-500/30 text-rose-400'}`;
    el.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle-2' : 'alert-circle'}" class="w-5 h-5"></i><div class="text-sm font-medium pr-2">${msg}</div>`;
    container.appendChild(el);
    lucide.createIcons();
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}

function formatCurrency(amount) {
    return `€ ${parseFloat(amount).toFixed(2)}`;
}

function getNextSunday() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    return nextSunday.toISOString().split('T')[0];
}

async function handleLogout() {
    localStorage.removeItem('chiro_last_active');
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}

// ================================================================
// VERBETERDE AUTO-LOGOUT (SINGLETON PATTERN)
// ================================================================

const TIMEOUT_MS = 60 * 60 * 1000; // 60 minuten

function startInactivityTimer() {
    if (timerStarted) return;
    timerStarted = true;

    const registerActivity = () => {
        localStorage.setItem('chiro_last_active', Date.now());
    };

    setInterval(() => {
        const now = Date.now();
        const lastActive = parseInt(localStorage.getItem('chiro_last_active') || now);
        
        if (now - lastActive > TIMEOUT_MS) {
            console.warn("Te lang inactief. Uitloggen...");
            handleLogout();
        }
    }, 5000);

    ['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
        window.addEventListener(event, registerActivity);
    });
    
    registerActivity();
}

// ================================================================
// AUTH CHECK (MET PROMISE CACHING)
// ================================================================

function requireAuth() {
    if (authPromise) return authPromise;

    authPromise = (async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (!session) {
            if (!window.location.href.includes('index.html')) {
                window.location.href = 'index.html';
            }
            return null;
        }

        const { data: userRole } = await supabaseClient
            .from(COLLECTION_NAMES.PORTAL_USERS)
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

        if (userRole) {
            currentUser = { ...userRole, email: session.user.email };
            if (typeof updateUserDisplay === 'function') updateUserDisplay(); 
            startInactivityTimer();
            return currentUser;
        } else {
            console.warn("Gebruiker heeft sessie, maar geen record in portal_users.");
            return null;
        }
    })();

    return authPromise;
}

// ================================================================
// GLOBAL MODAL HELPER (Met opschoning van event listeners)
// ================================================================

window.askConfirmation = (title, message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('global-confirmation-modal');
        
        if (!modal) {
            resolve(confirm(`${title}\n\n${message}`));
            return;
        }
        
        const titleEl = document.getElementById('g-confirm-title');
        const msgEl = document.getElementById('g-confirm-message');
        const btnYes = document.getElementById('g-confirm-yes');
        const btnNo = document.getElementById('g-confirm-no');
        
        if(titleEl) titleEl.innerText = title;
        if(msgEl) msgEl.innerText = message;
        
        if(btnYes && btnNo) {
            // Maak clones om gestapelde event listeners te voorkomen
            const newYes = btnYes.cloneNode(true);
            const newNo = btnNo.cloneNode(true);
            btnYes.replaceWith(newYes);
            btnNo.replaceWith(newNo);

            const close = (res) => {
                modal.classList.add('hidden');
                resolve(res);
            };
            
            newYes.onclick = () => close(true);
            newNo.onclick = () => close(false);
            modal.classList.remove('hidden');
        } else {
             resolve(confirm(`${title}\n\n${message}`));
        }
    });
};