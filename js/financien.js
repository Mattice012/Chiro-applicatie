// js/financien.js
// Enterprise Grade Finance Module - Chiro Applicatie

// --- STATE MANAGEMENT ---
let activeTab = "overview";
let cachedFinances = [];
let availableMonths = new Set();
let filterState = {
  search: "",
  month: "all",
  year: "all",
  department: "all",
};

// Categorie Icoontjes voor naadloze integratie met de rest van de app
const CATEGORY_ICONS = {
  Materiaal: "package",
  Eten: "utensils",
  Drank: "coffee",
  Activiteit: "ticket",
  Verhuur: "key",
  Lidgeld: "users",
  Kamp: "tent",
  Webshop: "shopping-cart",
  Overige: "tag",
};

// --- FORMATTERS ---
const moneyFormatter = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

// --- INITIALISATIE ---
window.onload = async () => {
  try {
    if (typeof renderLayout === "function") await renderLayout();
    const user = await requireAuth();
    if (!user) return;

    const role = USER_ROLES[currentUser.role];
    if (!role.canViewFinances) {
      renderNoAccess();
      return;
    }

    await loadData();
    initFilters();
    renderView();
  } catch (e) {
    console.error("System Error:", e);
    showToast("Fout bij laden financiële module.", "error");
  }
};

function renderNoAccess() {
  document.getElementById("fin-content").innerHTML = `
        <div class="flex flex-col items-center justify-center h-[60vh] text-center animate-in fade-in zoom-in duration-300">
            <div class="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mb-6 border border-rose-500/20 shadow-xl">
                <i data-lucide="lock" class="w-10 h-10 text-rose-500"></i>
            </div>
            <h2 class="text-3xl font-bold text-white mb-2">Toegang Geweigerd</h2>
            <p class="text-gray-400 max-w-md text-lg">Je accountrechten (${currentUser.role}) staan het beheren van de financiën niet toe.</p>
        </div>`;
  lucide.createIcons();
}

// --- DATA LAYER ---
async function loadData() {
  // BELANGRIJK: ".order('created_at')" IS VERWIJDERD OMDAT DIT DE CRASH VEROORZAAKTE!
  const { data, error } = await supabaseClient
    .from(COLLECTION_NAMES.FINANCES)
    .select("*")
    .order("datum", { ascending: false });

  if (error) {
    console.error("Database error bij laden financiën:", error);
    showToast("Kon data niet laden.", "error");
  } else {
    cachedFinances = data || [];

    availableMonths.clear();
    cachedFinances.forEach((t) => {
      if (t.datum) availableMonths.add(t.datum.substring(0, 7)); // YYYY-MM
    });
  }
}

function initFilters() {
  // Start met "Alle Periodes" standaard geselecteerd
}

// --- VIEW CONTROLLER ---
window.switchTab = (tabName) => {
  activeTab = tabName;
  updateTabUI();
  renderView();
};

function updateTabUI() {
  const tabs = ["overview", "budgets", "add"];
  tabs.forEach((t) => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) {
      const isActive = t === activeTab;
      btn.className = isActive
        ? "px-6 py-2.5 text-sm font-bold rounded-xl transition-all bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 flex items-center gap-2 transform scale-[1.02]"
        : "px-6 py-2.5 text-sm font-bold rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2";
    }
  });
}

function renderView() {
  const container = document.getElementById("fin-content");

  if (activeTab === "overview") container.innerHTML = renderOverviewHtml();
  else if (activeTab === "add") container.innerHTML = renderAddFormHtml();
  else if (activeTab === "budgets") renderBudgetsView(container);

  lucide.createIcons();

  if (activeTab === "overview") restoreFilterUI();
}

// =============================================================================
// 1. DASHBOARD OVERVIEW (FILTERABLE)
// =============================================================================
function getFilteredData() {
  return cachedFinances.filter((t) => {
    const search = filterState.search.toLowerCase();
    const matchesSearch =
      !search ||
      (t.description || "").toLowerCase().includes(search) ||
      (t.category || "").toLowerCase().includes(search) ||
      (t.user || "").toLowerCase().includes(search) ||
      t.amount.toString().includes(search);

    const tMonth = t.datum ? t.datum.substring(0, 7) : "";
    const matchesMonth =
      filterState.month === "all" || tMonth === filterState.month;

    let tDepts = t.afdelingen || (t.afdeling ? [t.afdeling] : ["Algemeen"]);
    if (typeof tDepts === "string") tDepts = [tDepts];
    const matchesDept =
      filterState.department === "all" ||
      tDepts.includes(filterState.department);

    return matchesSearch && matchesMonth && matchesDept;
  });
}

function renderOverviewHtml() {
  const data = getFilteredData();

  // BEREKENINGEN: Zorg dat alles getallen zijn
  const income = data
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = data
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const balance = income - expense;

  const sortedMonths = Array.from(availableMonths).sort().reverse();
  const monthOptions = sortedMonths
    .map((m) => {
      const [y, mn] = m.split("-");
      const date = new Date(y, mn - 1);
      const label = date.toLocaleDateString("nl-BE", {
        month: "long",
        year: "numeric",
      });
      return `<option value="${m}">${label}</option>`;
    })
    .join("");

  const deptOptions =
    AFDELINGEN_CONFIG.map(
      (a) => `<option value="${a.naam}">${a.naam}</option>`,
    ).join("") + `<option value="Algemeen">Algemeen</option>`;

  return `
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div class="bg-[#181b25] border border-gray-800 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between shadow-lg">
            <div class="flex items-center gap-2 w-full md:w-auto">
                <div class="relative w-full md:w-64 group">
                    <i data-lucide="search" class="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-indigo-400 transition-colors"></i>
                    <input type="text" id="filter-search" oninput="window.updateFilter('search', this.value)" placeholder="Zoek op omschrijving..." 
                        class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-indigo-500 outline-none transition-all">
                </div>
            </div>
            
            <div class="flex gap-3 w-full md:w-auto overflow-x-auto">
                <div class="relative min-w-[140px]">
                    <i data-lucide="calendar" class="absolute left-3 top-3 w-4 h-4 text-gray-500 z-10"></i>
                    <select id="filter-month" onchange="window.updateFilter('month', this.value)" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-2.5 pl-10 pr-8 text-sm text-white focus:border-indigo-500 outline-none appearance-none cursor-pointer">
                        <option value="all">Alle Periodes</option>
                        ${monthOptions}
                    </select>
                    <i data-lucide="chevron-down" class="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none"></i>
                </div>

                <div class="relative min-w-[140px]">
                    <i data-lucide="users" class="absolute left-3 top-3 w-4 h-4 text-gray-500 z-10"></i>
                    <select id="filter-dept" onchange="window.updateFilter('department', this.value)" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-2.5 pl-10 pr-8 text-sm text-white focus:border-indigo-500 outline-none appearance-none cursor-pointer">
                        <option value="all">Alle Afdelingen</option>
                        ${deptOptions}
                    </select>
                    <i data-lucide="chevron-down" class="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none"></i>
                </div>

                <button onclick="window.exportFinances()" class="px-4 py-2.5 bg-[#0f111a] border border-gray-700 hover:bg-[#1f2330] hover:text-white text-gray-400 rounded-xl transition-all flex items-center justify-center" title="Exporteer Selectie">
                    <i data-lucide="download" class="w-4 h-4"></i>
                </button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${renderKPICard("Saldo Selectie", balance, "Netto resultaat", "wallet", balance >= 0 ? "indigo" : "rose")}
            ${renderKPICard("Inkomsten", income, "Totaal ontvangen", "arrow-down-to-line", "emerald")}
            ${renderKPICard("Uitgaven", expense, "Totaal uitgegeven", "arrow-up-from-line", "rose")}
        </div>

        <div class="bg-[#181b25] border border-gray-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[600px]">
            <div class="p-4 border-b border-gray-800 bg-[#1f2330]/50 backdrop-blur flex justify-between items-center">
                <h3 class="font-bold text-white text-sm flex items-center gap-2"><i data-lucide="list" class="w-4 h-4 text-indigo-400"></i> Transacties</h3>
                <span class="text-xs text-gray-500 bg-[#0f111a] px-2 py-1 rounded border border-gray-700">${data.length} resultaten</span>
            </div>
            <div class="overflow-y-auto custom-scrollbar flex-1 bg-[#0f111a]/30">
                <div class="divide-y divide-gray-800/50">
                    ${renderTransactionList(data)}
                </div>
            </div>
        </div>
    </div>`;
}

function renderKPICard(title, amount, sub, icon, color) {
  return `
    <div class="bg-[#181b25] border border-gray-800 p-6 rounded-2xl relative overflow-hidden group hover:border-${color}-500/30 transition-all duration-300">
        <div class="absolute -right-6 -top-6 w-32 h-32 bg-${color}-500/10 rounded-full blur-2xl group-hover:bg-${color}-500/20 transition-all"></div>
        <div class="flex justify-between items-start mb-4 relative z-10">
            <div>
                <p class="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">${title}</p>
                <h3 class="text-3xl font-black text-white tracking-tight">${moneyFormatter.format(amount)}</h3>
            </div>
            <div class="p-3 rounded-xl bg-${color}-500/10 text-${color}-400 border border-${color}-500/20">
                <i data-lucide="${icon}" class="w-6 h-6"></i>
            </div>
        </div>
        <div class="flex items-center gap-2 text-xs font-medium text-gray-400 relative z-10">
            <span class="w-2 h-2 rounded-full bg-${color}-500"></span> ${sub}
        </div>
    </div>`;
}

function renderTransactionList(data) {
  if (data.length === 0)
    return `<div class="flex flex-col items-center justify-center h-64 opacity-50"><i data-lucide="search-x" class="w-12 h-12 text-gray-600 mb-3"></i><p class="text-gray-400">Geen transacties gevonden.</p></div>`;

  if (filterState.month === "all") {
    const groups = {};
    data.forEach((t) => {
      const mKey = t.datum ? t.datum.substring(0, 7) : "Onbekend";
      if (!groups[mKey]) groups[mKey] = [];
      groups[mKey].push(t);
    });

    return Object.keys(groups)
      .sort()
      .reverse()
      .map((mKey) => {
        let label = "Onbekende Datum";
        if (mKey !== "Onbekend") {
          const [y, m] = mKey.split("-");
          label = new Date(y, m - 1).toLocaleDateString("nl-BE", {
            month: "long",
            year: "numeric",
          });
        }
        return `
            <div>
                <div class="bg-[#1f2330] px-6 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider sticky top-0 z-10 border-y border-gray-800">${label}</div>
                ${groups[mKey].map((t) => renderTransactionRow(t)).join("")}
            </div>`;
      })
      .join("");
  } else {
    return data.map((t) => renderTransactionRow(t)).join("");
  }
}

function renderTransactionRow(t) {
  const isIncome = t.type === "income";
  const amountClass = isIncome ? "text-emerald-400" : "text-rose-400";
  const sign = isIncome ? "+" : "-";
  const depts = (t.afdelingen || [t.afdeling || "Algemeen"])
    .map(
      (d) =>
        `<span class="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700">${d}</span>`,
    )
    .join(" ");
  const canDelete = ["ADMIN", "KASSIER"].includes(currentUser.role);

  // SLIMME HERKENNING VAN WEBSHOP BESTELLINGEN
  const catIcon = CATEGORY_ICONS[t.category] || "tag";
  const isAutoSync =
    t.user === "Systeem (Auto-Sync)" || t.category === "Webshop";

  // Valideren van datum weergave
  let day = "??";
  let weekDay = "???";
  if (t.datum) {
    const d = new Date(t.datum);
    day = d.getDate();
    weekDay = d.toLocaleDateString("nl-BE", { weekday: "short" });
  }

  return `
    <div class="group flex items-center justify-between px-6 py-4 hover:bg-[#1f2330] transition-colors ${isAutoSync ? "border-l-2 border-indigo-500 bg-indigo-500/5" : ""}">
        <div class="flex items-center gap-4 overflow-hidden">
            <div class="min-w-[50px] text-center">
                <div class="text-sm font-bold text-white">${day}</div>
                <div class="text-[10px] text-gray-500 uppercase">${weekDay}</div>
            </div>
            <div class="flex flex-col truncate">
                <span class="text-sm font-medium text-white truncate flex items-center gap-2" title="${t.description}">
                    ${t.description}
                    ${isAutoSync ? `<span class="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 uppercase tracking-wider"><i data-lucide="zap" class="w-3 h-3 inline"></i> Auto</span>` : ""}
                </span>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1"><i data-lucide="${catIcon}" class="w-3 h-3"></i> ${t.category || "Overige"}</span>
                    <div class="flex gap-1 ml-2">${depts}</div>
                </div>
            </div>
        </div>
        <div class="flex items-center gap-6 pl-4">
            <div class="text-right">
                <div class="font-mono font-bold ${amountClass}">${sign} ${moneyFormatter.format(Number(t.amount)).replace("€", "").trim()}</div>
                <div class="text-[10px] ${isAutoSync ? "text-indigo-400/70 font-bold" : "text-gray-600"}">${t.user || "Systeem"}</div>
            </div>
            ${canDelete ? `<button onclick="window.deleteTransaction(${t.id})" class="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : `<div class="w-8"></div>`}
        </div>
    </div>`;
}

window.updateFilter = (key, value) => {
  filterState[key] = value;
  const container = document.getElementById("fin-content");
  container.innerHTML = renderOverviewHtml();
  restoreFilterUI();
  lucide.createIcons();
};

function restoreFilterUI() {
  const s = document.getElementById("filter-search");
  const m = document.getElementById("filter-month");
  const d = document.getElementById("filter-dept");
  if (s) {
    s.value = filterState.search;
    s.focus();
  }
  if (m) m.value = filterState.month;
  if (d) d.value = filterState.department;
}

// =============================================================================
// 2. ACTIONS (CRUD)
// =============================================================================
window.deleteTransaction = async (id) => {
  const tx = cachedFinances.find((t) => t.id === id);

  // Waarschuwing als iemand een Webshop-kost probeert te wissen
  if (tx && (tx.user === "Systeem (Auto-Sync)" || tx.category === "Webshop")) {
    const waarschuwing =
      "⚠️ Dit is een automatische webshop-kost.\n\nAls je deze hier verwijdert, zal het systeem hem bij de volgende automatische update van de webshop gewoon terugzetten.\n\nWil je dit bedrag aanpassen? Wijzig dan de bestellingen zelf in het 'Bestellingen' menu.\n\nWil je hem nu toch tijdelijk verwijderen?";
    if (
      !(await window.askConfirmation("Automatische Transactie", waarschuwing))
    )
      return;
  } else {
    if (
      !(await window.askConfirmation(
        "Verwijderen",
        "Wil je deze transactie definitief verwijderen?",
      ))
    )
      return;
  }

  const { error } = await supabaseClient
    .from(COLLECTION_NAMES.FINANCES)
    .delete()
    .eq("id", id);
  if (error) showToast("Kon niet verwijderen.", "error");
  else {
    showToast("Transactie verwijderd.", "success");
    await loadData();
    renderView();
  }
};

window.exportFinances = () => {
  const data = getFilteredData();
  if (data.length === 0) return showToast("Niets om te exporteren.", "warning");

  let csvContent =
    "Datum;Type;Bedrag;Categorie;Omschrijving;Afdelingen;Gebruiker\n";
  data.forEach((row) => {
    const d = row.datum
      ? new Date(row.datum).toLocaleDateString("nl-BE")
      : "Onbekend";
    const amount = Number(row.amount || 0)
      .toString()
      .replace(".", ",");
    const depts = (row.afdelingen || [row.afdeling]).join(", ");
    const desc = `"${(row.description || "").replace(/"/g, '""')}"`;
    csvContent += `${d};${row.type};${amount};${row.category};${desc};${depts};${row.user}\n`;
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Chiro_Financien_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
};

window.askConfirmation = (title, msg) => {
  return new Promise((resolve) => {
    if (window.askConfirmationGlobal)
      return window.askConfirmationGlobal(title, msg).then(resolve);
    resolve(confirm(`${title}\n\n${msg}`));
  });
};

// =============================================================================
// 3. VIRTUELE REKENINGEN (BUDGET VIEW) - IN/UIT OVERZICHT
// =============================================================================
function renderBudgetsView(container) {
  const deptBalances = {};
  AFDELINGEN_CONFIG.forEach(
    (a) =>
      (deptBalances[a.naam] = {
        balance: 0,
        income: 0,
        expense: 0,
        count: 0,
        color: a.kleur,
      }),
  );
  deptBalances["Algemeen"] = {
    balance: 0,
    income: 0,
    expense: 0,
    count: 0,
    color: "gray",
  };

  cachedFinances.forEach((t) => {
    const amount = Number(t.amount || 0);
    let depts = t.afdelingen || (t.afdeling ? [t.afdeling] : ["Algemeen"]);
    if (!Array.isArray(depts)) depts = [depts];

    const splitAmount = amount / depts.length;
    depts.forEach((d) => {
      if (deptBalances[d]) {
        if (t.type === "income") {
          deptBalances[d].income += splitAmount;
          deptBalances[d].balance += splitAmount;
        } else {
          deptBalances[d].expense += splitAmount;
          deptBalances[d].balance -= splitAmount;
        }
        deptBalances[d].count++;
      } else if (deptBalances["Algemeen"]) {
        if (t.type === "income") {
          deptBalances["Algemeen"].income += splitAmount;
          deptBalances["Algemeen"].balance += splitAmount;
        } else {
          deptBalances["Algemeen"].expense += splitAmount;
          deptBalances["Algemeen"].balance -= splitAmount;
        }
        deptBalances["Algemeen"].count++;
      }
    });
  });

  const cards = [...AFDELINGEN_CONFIG, { naam: "Algemeen", kleur: "gray" }]
    .map((afd) => {
      const data = deptBalances[afd.naam] || {
        balance: 0,
        income: 0,
        expense: 0,
        count: 0,
      };
      const color = afd.kleur || "gray";
      const isPos = data.balance >= 0;

      return `
        <div onclick="window.openBudgetDetail('${afd.naam}')" class="cursor-pointer group bg-[#181b25] border border-gray-800 p-6 rounded-2xl relative overflow-hidden hover:-translate-y-1 hover:shadow-2xl hover:shadow-${color}-500/10 transition-all duration-300 flex flex-col justify-between">
            <div class="absolute right-0 top-0 w-32 h-32 bg-${color}-500/5 rounded-bl-full group-hover:bg-${color}-500/10 transition-all"></div>
            <div class="relative z-10 flex-1">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-white text-lg">${afd.naam}</h3>
                    <div class="p-2 rounded-lg bg-${color}-500/10 text-${color}-400"><i data-lucide="piggy-bank" class="w-5 h-5"></i></div>
                </div>
                <p class="text-xs font-bold text-gray-500 uppercase mb-1">Beschikbaar Saldo</p>
                <p class="text-3xl font-black ${isPos ? "text-white" : "text-rose-400"} tracking-tight">${moneyFormatter.format(data.balance)}</p>
                
                <div class="flex justify-between text-[10px] uppercase font-bold mt-4 p-2.5 bg-black/20 rounded-xl border border-white/5">
                    <div class="text-emerald-400 flex flex-col"><span>In</span> <span class="text-sm">${moneyFormatter.format(data.income)}</span></div>
                    <div class="text-rose-400 flex flex-col text-right"><span>Uit</span> <span class="text-sm">${moneyFormatter.format(data.expense)}</span></div>
                </div>
            </div>
            
            <div class="relative z-10 mt-5 space-y-3">
                ${
                  afd.naam !== "Algemeen"
                    ? `
                <button onclick="event.stopPropagation(); window.openAttendanceIncomeModal('${afd.naam}')" class="w-full py-2.5 bg-[#1f2330] hover:bg-[#2a3040] border border-gray-700 rounded-xl text-gray-300 hover:text-white transition-all flex items-center justify-center gap-2 text-xs font-bold shadow-sm">
                    <i data-lucide="coins" class="w-4 h-4 text-${color}-400"></i> Inkomst via Telling
                </button>
                `
                    : ""
                }
                <div class="pt-3 border-t border-gray-800 flex justify-between items-center text-xs text-gray-500">
                    <span>${data.count} verrichtingen</span>
                    <span class="group-hover:translate-x-1 transition-transform flex items-center gap-1 text-${color}-400">Details <i data-lucide="arrow-right" class="w-3 h-3"></i></span>
                </div>
            </div>
        </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
        <div class="mb-6 flex items-center gap-4">
            <div class="p-3 bg-indigo-500/20 rounded-xl text-indigo-400"><i data-lucide="layout-grid" class="w-6 h-6"></i></div>
            <div><h2 class="text-2xl font-bold text-white">Virtuele Rekeningen</h2><p class="text-gray-400 text-sm">Huidige stand van zaken per afdeling, incl. Webshop aankopen.</p></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">${cards}</div>
    </div>`;
}

// =============================================================================
// 4. TOEVOEGEN (ADD FORM)
// =============================================================================
function renderAddFormHtml() {
  const today = new Date().toISOString().split("T")[0];

  return `
    <div class="max-w-3xl mx-auto animate-in fade-in zoom-in duration-300">
        <div class="bg-[#181b25] border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div class="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-bl-full pointer-events-none"></div>
            
            <h2 class="text-2xl font-bold text-white mb-8 flex items-center gap-3 relative z-10">
                <div class="p-2.5 bg-indigo-500/20 rounded-xl text-indigo-400"><i data-lucide="plus" class="w-6 h-6"></i></div>
                Nieuwe Transactie
            </h2>

            <form onsubmit="window.handleTransactionSubmit(event)" class="space-y-8 relative z-10">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="space-y-3">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider">Soort Verrichting</label>
                        <div class="flex bg-[#0f111a] p-1.5 rounded-xl border border-gray-700">
                            <label class="flex-1 cursor-pointer">
                                <input type="radio" name="t-type" value="expense" class="peer hidden" checked>
                                <div class="py-3 text-center rounded-lg text-sm font-bold text-gray-400 peer-checked:bg-rose-500/20 peer-checked:text-rose-400 transition-all hover:text-white">Uitgave</div>
                            </label>
                            <label class="flex-1 cursor-pointer">
                                <input type="radio" name="t-type" value="income" class="peer hidden">
                                <div class="py-3 text-center rounded-lg text-sm font-bold text-gray-400 peer-checked:bg-emerald-500/20 peer-checked:text-emerald-400 transition-all hover:text-white">Inkomst</div>
                            </label>
                        </div>
                    </div>
                    <div class="space-y-3">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider">Bedrag</label>
                        <div class="relative group">
                            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xl group-focus-within:text-indigo-400 transition-colors">€</span>
                            <input type="number" id="t-amount" step="0.01" required placeholder="0.00" 
                                class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3.5 pl-10 pr-4 text-xl font-bold text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all">
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="space-y-3">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider">Omschrijving</label>
                        <input type="text" id="t-desc" required placeholder="bv. Aankoop materiaal" 
                            class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3.5 text-white focus:border-indigo-500 outline-none transition-all">
                    </div>
                    <div class="space-y-3">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider">Datum</label>
                        <input type="date" id="t-date" value="${today}" required 
                            class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3.5 text-white focus:border-indigo-500 outline-none transition-all">
                    </div>
                </div>

                <div class="space-y-3">
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider">Categorie</label>
                    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        ${[
                          "Materiaal",
                          "Eten",
                          "Drank",
                          "Activiteit",
                          "Verhuur",
                          "Lidgeld",
                          "Kamp",
                          "Webshop",
                          "Overige",
                        ]
                          .map(
                            (c) => `
                            <label class="cursor-pointer">
                                <input type="radio" name="t-cat" value="${c}" class="peer hidden" ${c === "Materiaal" ? "checked" : ""}>
                                <div class="px-2 py-2.5 rounded-xl border border-gray-700 bg-[#0f111a] text-center text-sm font-medium text-gray-400 peer-checked:border-indigo-500 peer-checked:bg-indigo-500/10 peer-checked:text-indigo-400 hover:border-gray-600 transition-all">${c}</div>
                            </label>
                        `,
                          )
                          .join("")}
                    </div>
                </div>

                <div class="space-y-3">
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider">Verrekenen aan</label>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3" id="dept-checkboxes">
                        ${AFDELINGEN_CONFIG.map(
                          (afd) => `
                            <label class="flex items-center p-3 bg-[#0f111a] border border-gray-700 rounded-xl cursor-pointer hover:border-gray-600 transition-all group">
                                <input type="checkbox" value="${afd.naam}" class="w-5 h-5 rounded border-gray-600 bg-[#181b25] text-indigo-500 focus:ring-offset-0 focus:ring-0 mr-3">
                                <span class="text-sm font-medium text-gray-300 group-hover:text-white">${afd.naam}</span>
                            </label>
                        `,
                        ).join("")}
                        <label class="flex items-center p-3 bg-[#0f111a] border border-gray-700 rounded-xl cursor-pointer hover:border-gray-600 transition-all group">
                            <input type="checkbox" value="Algemeen" checked class="w-5 h-5 rounded border-gray-600 bg-[#181b25] text-indigo-500 focus:ring-offset-0 focus:ring-0 mr-3">
                            <span class="text-sm font-medium text-gray-300 group-hover:text-white">Algemeen</span>
                        </label>
                    </div>
                    <p class="text-xs text-gray-500 mt-2 flex items-center gap-1"><i data-lucide="info" class="w-3 h-3"></i> Het bedrag wordt gelijk verdeeld over de geselecteerde afdelingen.</p>
                </div>

                <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transform active:scale-[0.99] transition-all">
                    <i data-lucide="save" class="w-5 h-5"></i> Transactie Opslaan
                </button>
            </form>
        </div>
    </div>`;
}

window.handleTransactionSubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const originalContent = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML =
    '<div class="loader w-5 h-5 border-white mr-2"></div> Bezig...';

  const type = document.querySelector('input[name="t-type"]:checked').value;
  const amount = document.getElementById("t-amount").value;
  const desc = document.getElementById("t-desc").value;
  const date = document.getElementById("t-date").value;
  const cat = document.querySelector('input[name="t-cat"]:checked').value;

  const checkboxes = document.querySelectorAll(
    "#dept-checkboxes input:checked",
  );
  let afdelingen = Array.from(checkboxes).map((cb) => cb.value);
  if (afdelingen.length === 0) afdelingen = ["Algemeen"];

  const { error } = await supabaseClient
    .from(COLLECTION_NAMES.FINANCES)
    .insert({
      type,
      amount: parseFloat(amount),
      description: desc,
      category: cat,
      datum: date,
      afdelingen: afdelingen,
      afdeling: afdelingen[0],
      user: currentUser.name || currentUser.email,
    });

  if (error) {
    showToast("Er ging iets mis: " + error.message, "error");
    btn.disabled = false;
    btn.innerHTML = originalContent;
  } else {
    showToast("Transactie toegevoegd!", "success");
    await loadData();
    activeTab = "overview";
    updateTabUI();
    renderView();
  }
};

// --- BUDGET DETAILS MODAL (Pop-up) ---
window.openBudgetDetail = (deptName) => {
  const txs = cachedFinances.filter((t) => {
    const depts = t.afdelingen || [t.afdeling];
    return depts.includes(deptName);
  });

  const rows = txs.map((t) => {
    const depts = t.afdelingen || [t.afdeling];
    const share = Number(t.amount || 0) / depts.length;
    return { ...t, share };
  });

  const totalInc = rows
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.share, 0);
  const totalExp = rows
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.share, 0);
  const total = totalInc - totalExp;

  const modal = document.createElement("div");
  modal.id = "budget-modal";
  modal.className = "fixed inset-0 z-50 flex items-center justify-center p-4";
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onclick="document.getElementById('budget-modal').remove()"></div>
    <div class="relative w-full max-w-2xl bg-[#181b25] border border-gray-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
        <div class="bg-[#1f2330] p-6 border-b border-gray-800 flex justify-between items-start">
            <div class="w-full pr-4">
                <h3 class="text-2xl font-bold text-white mb-4">${deptName}</h3>
                <div class="grid grid-cols-3 gap-3">
                    <div class="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-center">
                        <div class="text-[10px] text-emerald-500 uppercase font-bold tracking-wider mb-1">Inkomsten</div>
                        <div class="text-emerald-400 font-black">${moneyFormatter.format(totalInc)}</div>
                    </div>
                    <div class="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-center">
                        <div class="text-[10px] text-rose-500 uppercase font-bold tracking-wider mb-1">Uitgaven</div>
                        <div class="text-rose-400 font-black">${moneyFormatter.format(totalExp)}</div>
                    </div>
                    <div class="bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-xl text-center">
                        <div class="text-[10px] text-indigo-400 uppercase font-bold tracking-wider mb-1">Balans</div>
                        <div class="text-indigo-400 font-black">${moneyFormatter.format(total)}</div>
                    </div>
                </div>
            </div>
            <button onclick="document.getElementById('budget-modal').remove()" class="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"><i data-lucide="x" class="w-6 h-6"></i></button>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar bg-[#0f111a]">
            <table class="w-full text-left text-sm text-gray-400">
                <thead class="bg-[#13151c] sticky top-0 z-10 text-xs font-bold uppercase text-gray-500">
                    <tr><th class="px-6 py-3">Datum</th><th class="px-6 py-3">Omschrijving</th><th class="px-6 py-3 text-right">Bedrag</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-800/50">
                    ${
                      rows.length
                        ? rows
                            .map((t) => {
                              const dateStr = t.datum
                                ? new Date(t.datum).toLocaleDateString("nl-BE")
                                : "??";
                              return `
                        <tr class="hover:bg-white/5 transition-colors">
                            <td class="px-6 py-4 font-mono text-xs whitespace-nowrap">${dateStr}</td>
                            <td class="px-6 py-4">
                                <div class="text-white font-medium flex items-center gap-2">
                                    ${t.description} 
                                    ${t.user === "Systeem (Auto-Sync)" || t.category === "Webshop" ? '<span title="Automatische Webshop Kost" class="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 uppercase tracking-wider"><i data-lucide="zap" class="w-3 h-3 inline"></i> Auto</span>' : ""}
                                </div>
                                <div class="text-[10px] text-gray-500">${t.category}</div>
                            </td>
                            <td class="px-6 py-4 text-right font-mono font-bold ${t.type === "income" ? "text-emerald-400" : "text-rose-400"}">
                                ${t.type === "income" ? "+" : "-"} ${moneyFormatter.format(t.share)}
                            </td>
                        </tr>`;
                            })
                            .join("")
                        : `<tr><td colspan="3" class="text-center p-12 text-gray-500">Geen transacties</td></tr>`
                    }
                </tbody>
            </table>
        </div>
    </div>`;

  document.body.appendChild(modal);
  lucide.createIcons();
};

// =============================================================================
// 5. LEDEN TELLING INKOMSTEN MODAL
// =============================================================================
window.openAttendanceIncomeModal = async (deptName) => {
  const { data } = await supabaseClient
    .from(COLLECTION_NAMES.AANWEZIGHEDEN)
    .select("datum")
    .order("datum", { ascending: false })
    .limit(1);

  let lastDate = new Date().toISOString().split("T")[0];
  if (data && data.length > 0) lastDate = data[0].datum;

  const modal = document.createElement("div");
  modal.id = "attendance-income-modal";
  modal.className =
    "fixed inset-0 z-[100] flex items-center justify-center p-4";
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onclick="document.getElementById('attendance-income-modal').remove()"></div>
    <div class="relative w-full max-w-md bg-[#181b25] border border-gray-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div class="bg-[#1f2330] p-6 border-b border-gray-800 flex justify-between items-center">
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
                <i data-lucide="users" class="w-5 h-5 text-indigo-400"></i> ${deptName} Inkomst
            </h3>
            <button onclick="document.getElementById('attendance-income-modal').remove()" class="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="p-6 space-y-5">
            <div>
                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Datum van telling</label>
                <input type="date" id="att-inc-date" value="${lastDate}" onchange="window.loadAttendanceForIncome('${deptName}')" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none transition-all">
            </div>
            
            <div class="bg-[#0f111a] border border-gray-800 rounded-xl p-4 shadow-inner">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-sm font-medium text-gray-400">Aantal Aanwezigen:</span>
                    <span id="att-inc-count" class="text-2xl font-black text-white" data-count="0">...</span>
                </div>
                <div class="text-sm bg-[#181b25] p-3 rounded-lg border border-gray-800/50">
                    <span class="text-indigo-400 flex items-center gap-1 text-xs uppercase font-bold mb-1"><i data-lucide="message-square" class="w-3 h-3"></i> Mededeling leiding:</span>
                    <span id="att-inc-note" class="text-gray-300 italic">-</span>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Prijs per lid (€)</label>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">€</span>
                        <input type="number" id="att-inc-price" value="2" step="0.5" min="0" oninput="window.calcAttendanceIncome()" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 pl-8 pr-3 text-white focus:border-indigo-500 outline-none transition-all font-bold">
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Niet betaald (aantal)</label>
                    <input type="number" id="att-inc-unpaid" value="0" min="0" oninput="window.calcAttendanceIncome()" class="w-full bg-[#0f111a] border border-gray-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none transition-all font-bold">
                </div>
            </div>

            <div class="bg-gradient-to-r from-indigo-600/20 to-indigo-500/10 border border-indigo-500/30 rounded-xl p-5 flex justify-between items-center shadow-inner">
                <div>
                    <span class="font-bold text-indigo-400 block">Totaal Inkomst:</span>
                    <span class="text-xs text-gray-400" id="att-inc-calc-text">0 leden x € 0.00</span>
                </div>
                <span id="att-inc-total" class="text-3xl font-black text-white" data-amount="0">€ 0.00</span>
            </div>

            <button onclick="window.saveAttendanceIncome('${deptName}')" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-indigo-500/25 transition-all flex justify-center items-center gap-2 transform active:scale-[0.99]">
                <i data-lucide="plus-circle" class="w-5 h-5"></i> Toevoegen aan Rekening
            </button>
        </div>
    </div>`;
  document.body.appendChild(modal);
  lucide.createIcons();

  window.loadAttendanceForIncome(deptName);
};

window.loadAttendanceForIncome = async (deptName) => {
  const date = document.getElementById("att-inc-date").value;
  const countEl = document.getElementById("att-inc-count");
  const noteEl = document.getElementById("att-inc-note");

  countEl.innerText = "...";
  noteEl.innerText = "Laden...";

  const { data } = await supabaseClient
    .from(COLLECTION_NAMES.AANWEZIGHEDEN)
    .select("*")
    .eq("datum", date)
    .maybeSingle();

  let count = 0;
  let note = "Geen mededeling genoteerd.";

  if (data && data.afdelingen) {
    const afdData = data.afdelingen.find((a) => a.naam === deptName);
    if (afdData) {
      count = afdData.aantal || 0;
      if (afdData.opmerking && afdData.opmerking.trim() !== "") {
        note = afdData.opmerking;
      }
    }
  } else if (!data) {
    note = "Geen telling gevonden voor deze specifieke datum.";
  }

  countEl.dataset.count = count;
  countEl.innerText = count;
  noteEl.innerText = note;

  document.getElementById("att-inc-unpaid").value = 0;
  window.calcAttendanceIncome();
};

window.calcAttendanceIncome = () => {
  const countEl = document.getElementById("att-inc-count");
  const totalCount = parseInt(countEl.dataset.count) || 0;
  const price = parseFloat(document.getElementById("att-inc-price").value) || 0;
  const unpaid = parseInt(document.getElementById("att-inc-unpaid").value) || 0;

  const payingMembers = Math.max(0, totalCount - unpaid);
  const totalAmount = payingMembers * price;

  document.getElementById("att-inc-calc-text").innerText =
    `${payingMembers} betalende leden x € ${price.toFixed(2)}`;
  document.getElementById("att-inc-total").innerText =
    moneyFormatter.format(totalAmount);
  document.getElementById("att-inc-total").dataset.amount = totalAmount;
};

window.saveAttendanceIncome = async (deptName) => {
  const amount =
    parseFloat(document.getElementById("att-inc-total").dataset.amount) || 0;
  const date = document.getElementById("att-inc-date").value;

  if (amount <= 0)
    return showToast("Bedrag moet groter zijn dan € 0.", "warning");

  const unpaid = parseInt(document.getElementById("att-inc-unpaid").value) || 0;
  const count = document.getElementById("att-inc-count").dataset.count;

  let desc = `Activiteit/Drankje ${new Date(date).toLocaleDateString("nl-BE")}`;
  if (unpaid > 0) desc += ` (${unpaid} van de ${count} leden niet betaald)`;

  const btn = document.querySelector(
    "#attendance-income-modal button.bg-indigo-600",
  );
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="loader w-5 h-5 border-white"></div>';

  const { error } = await supabaseClient
    .from(COLLECTION_NAMES.FINANCES)
    .insert({
      type: "income",
      amount: amount,
      description: desc,
      category: "Activiteit",
      datum: date,
      afdelingen: [deptName],
      afdeling: deptName,
      user: currentUser.name || currentUser.email,
    });

  if (error) {
    showToast("Kon inkomst niet opslaan: " + error.message, "error");
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  } else {
    showToast("Inkomst succesvol toegevoegd aan " + deptName + "!", "success");
    document.getElementById("attendance-income-modal").remove();
    await loadData();
    renderView();
  }
};
