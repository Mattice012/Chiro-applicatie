// js/financien.js

let activeTab = "overview";
let cachedFinances = [];

window.onload = async () => {
  try {
    if (typeof renderLayout === "function") renderLayout();
    const user = await requireAuth();
    if (!user) return;

    // Check rechten (Alleen Kassier, Admin, VB mogen dit zien)
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

    // Initialiseren
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
    .order("datum", { ascending: false }); // Nieuwste bovenaan

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

  // Update knoppen styling
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
  if (activeTab === "overview") {
    container.innerHTML = renderOverviewHtml();
  } else if (activeTab === "add") {
    container.innerHTML = renderAddFormHtml();
  }
  lucide.createIcons();
}

// --- VIEW: OVERZICHT ---
function renderOverviewHtml() {
  // 1. Berekeningen
  const totalIncome = cachedFinances
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = cachedFinances
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const balance = totalIncome - totalExpense;

  return `
    <div class="space-y-8 animate-in fade-in zoom-in duration-300">
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-[#181b25] border border-gray-800 p-6 rounded-2xl relative overflow-hidden group">
                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <i data-lucide="wallet" class="w-16 h-16 text-indigo-500"></i>
                </div>
                <p class="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Huidig Saldo</p>
                <p class="text-3xl font-black ${balance >= 0 ? "text-white" : "text-rose-400"} tracking-tight">
                    ${formatCurrency(balance)}
                </p>
            </div>

            <div class="bg-[#181b25] border border-gray-800 p-6 rounded-2xl relative overflow-hidden group">
                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <i data-lucide="trending-up" class="w-16 h-16 text-emerald-500"></i>
                </div>
                <p class="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Totaal Inkomsten</p>
                <p class="text-3xl font-black text-emerald-400 tracking-tight">+ ${formatCurrency(totalIncome)}</p>
            </div>

            <div class="bg-[#181b25] border border-gray-800 p-6 rounded-2xl relative overflow-hidden group">
                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <i data-lucide="trending-down" class="w-16 h-16 text-rose-500"></i>
                </div>
                <p class="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Totaal Uitgaven</p>
                <p class="text-3xl font-black text-rose-400 tracking-tight">- ${formatCurrency(totalExpense)}</p>
            </div>
        </div>

        <div class="bg-[#181b25] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
            <div class="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1f2330]/30">
                <h3 class="font-bold text-white flex items-center gap-2">
                    <i data-lucide="list" class="w-4 h-4 text-indigo-400"></i> Recente Transacties
                </h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-400">
                    <thead class="bg-[#13151c] text-xs uppercase font-bold text-gray-500">
                        <tr>
                            <th class="px-6 py-4">Datum</th>
                            <th class="px-6 py-4">Omschrijving</th>
                            <th class="px-6 py-4">Afdelingen</th>
                            <th class="px-6 py-4 text-right">Bedrag</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-800/50">
                        ${
                          cachedFinances.length > 0
                            ? cachedFinances
                                .map((t) => {
                                  // Afdelingen netjes weergeven
                                  let tags = "";
                                  if (
                                    t.afdelingen &&
                                    Array.isArray(t.afdelingen)
                                  ) {
                                    tags = t.afdelingen
                                      .map(
                                        (afd) =>
                                          `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mr-1">${afd}</span>`,
                                      )
                                      .join("");
                                  } else {
                                    tags = `<span class="text-xs italic text-gray-600">Algemeen</span>`;
                                  }

                                  return `
                            <tr class="hover:bg-[#1f2330]/50 transition-colors group">
                                <td class="px-6 py-4 font-mono text-gray-300 whitespace-nowrap">${new Date(t.datum).toLocaleDateString("nl-BE")}</td>
                                <td class="px-6 py-4 text-white font-medium">${t.description || "-"}</td>
                                <td class="px-6 py-4">${tags}</td>
                                <td class="px-6 py-4 text-right font-bold font-mono ${t.type === "income" ? "text-emerald-400" : "text-rose-400"}">
                                    ${t.type === "income" ? "+" : "-"} ${formatCurrency(t.amount)}
                                </td>
                            </tr>`;
                                })
                                .join("")
                            : `<tr><td colspan="4" class="p-8 text-center text-gray-500">Nog geen transacties.</td></tr>`
                        }
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// --- VIEW: TOEVOEGEN ---
function renderAddFormHtml() {
  return `
    <div class="max-w-2xl mx-auto animate-in fade-in zoom-in duration-300">
        
        <div class="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div>
                <h3 class="text-orange-400 font-bold text-sm flex items-center gap-2">
                    <i data-lucide="shopping-cart" class="w-4 h-4"></i> Webshop Koppeling
                </h3>
                <p class="text-xs text-gray-400 mt-1">Vul formulier met totale verkoop uit 'bread_orders'.</p>
            </div>
            <button type="button" onclick="importWebshopData()" 
                class="bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2">
                <i data-lucide="download-cloud" class="w-4 h-4"></i>
                Haal Totaal Op
            </button>
        </div>

        <div class="bg-[#181b25] border border-gray-800 rounded-2xl p-6 md:p-8 shadow-2xl">
            <h2 class="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <i data-lucide="plus-square" class="text-indigo-500"></i> Transactie Toevoegen
            </h2>

            <form id="finance-form" onsubmit="submitTransaction(event)" class="space-y-6">
                
                <div class="grid grid-cols-2 gap-4">
                    <label class="cursor-pointer">
                        <input type="radio" name="type" value="income" id="radio-income" class="peer sr-only" checked>
                        <div class="p-4 rounded-xl border border-gray-700 bg-[#1f2330]/50 peer-checked:border-emerald-500 peer-checked:bg-emerald-500/10 hover:border-gray-600 transition-all text-center">
                            <i data-lucide="arrow-up-circle" class="mx-auto mb-2 text-emerald-400"></i>
                            <span class="font-bold text-emerald-400">Inkomsten</span>
                        </div>
                    </label>
                    <label class="cursor-pointer">
                        <input type="radio" name="type" value="expense" id="radio-expense" class="peer sr-only">
                        <div class="p-4 rounded-xl border border-gray-700 bg-[#1f2330]/50 peer-checked:border-rose-500 peer-checked:bg-rose-500/10 hover:border-gray-600 transition-all text-center">
                            <i data-lucide="arrow-down-circle" class="mx-auto mb-2 text-rose-400"></i>
                            <span class="font-bold text-rose-400">Uitgaven</span>
                        </div>
                    </label>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Bedrag (€)</label>
                        <div class="relative">
                            <span class="absolute left-4 top-3 text-gray-400">€</span>
                            <input type="number" id="amount" step="0.01" min="0" required
                                class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 pl-8 pr-4 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-lg transition-all"
                                placeholder="0.00">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Datum</label>
                        <input type="date" id="date" required
                            class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                            value="${new Date().toISOString().split("T")[0]}">
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Omschrijving</label>
                    <input type="text" id="description" required
                        class="w-full bg-[#0f111a] border border-gray-700 rounded-xl py-3 px-4 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                        placeholder="Bv. Aankoop verf voor Rakkers">
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-3">Betrokken Afdeling(en)</label>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <label class="cursor-pointer select-none">
                            <input type="checkbox" name="afdeling" value="Algemeen" id="check-algemeen" class="peer sr-only" checked onchange="toggleAlgemeen(this)">
                            <div class="px-3 py-2 rounded-lg border border-gray-700 bg-[#1f2330] peer-checked:bg-white peer-checked:text-black peer-checked:border-white text-xs font-bold text-center transition-all">
                                Algemeen
                            </div>
                        </label>
                        ${AFDELINGEN_CONFIG.map(
                          (afd) => `
                            <label class="cursor-pointer select-none">
                                <input type="checkbox" name="afdeling" value="${afd.naam}" class="peer sr-only afd-check" onchange="checkAlgemeen()">
                                <div class="px-3 py-2 rounded-lg border border-gray-700 bg-[#1f2330] peer-checked:bg-${afd.kleur}-500 peer-checked:border-${afd.kleur}-500 peer-checked:text-white text-xs font-bold text-center transition-all hover:border-gray-500">
                                    ${afd.naam}
                                </div>
                            </label>
                        `,
                        ).join("")}
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2">* Selecteer 'Algemeen' als het voor de hele Chiro is.</p>
                </div>

                <button type="submit" id="submit-btn" 
                    class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2">
                    <span>Transactie Opslaan</span>
                    <i data-lucide="save" class="w-5 h-5"></i>
                </button>
            </form>
        </div>
    </div>`;
}

// --- LOGICA VOOR FORMULIER ---

window.toggleAlgemeen = (checkbox) => {
  if (checkbox.checked) {
    document.querySelectorAll(".afd-check").forEach((c) => (c.checked = false));
  }
};

window.checkAlgemeen = () => {
  const algemeen = document.querySelector('input[value="Algemeen"]');
  const others = document.querySelectorAll(".afd-check:checked");
  if (others.length > 0) {
    algemeen.checked = false;
  }
};

// --- WEBSHOP IMPORT LOGICA ---
window.importWebshopData = async () => {
  const btn = document.querySelector('button[onclick="importWebshopData()"]');
  const originalContent = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<div class="loader w-3 h-3 border-white"></div> Laden...`;

  try {
    // Haal data uit bread_orders (totaalprijs per bestelling)
    const { data: orders, error } = await supabaseClient
      .from(COLLECTION_NAMES.BROOD_ORDERS)
      .select("total_price");

    if (error) throw error;

    if (!orders || orders.length === 0) {
      showToast("Geen bestellingen gevonden.", "error");
      return;
    }

    // Totaal berekenen
    const total = orders.reduce(
      (sum, order) => sum + (parseFloat(order.total_price) || 0),
      0,
    );

    // Formulier invullen
    document.getElementById("amount").value = total.toFixed(2);
    document.getElementById("description").value =
      `Inkomsten Webshop (Totaal van ${orders.length} bestellingen)`;

    // Instellen op 'Inkomsten' en 'Algemeen'
    document.getElementById("radio-income").checked = true;

    const checkAlgemeen = document.getElementById("check-algemeen");
    if (checkAlgemeen) {
      checkAlgemeen.checked = true;
      window.toggleAlgemeen(checkAlgemeen);
    }

    showToast(`€ ${total.toFixed(2)} opgehaald uit webshop!`, "success");
  } catch (err) {
    console.error("Webshop import error:", err);
    showToast("Kon webshop data niet ophalen.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalContent;
    lucide.createIcons();
  }
};

// --- OPSLAAN ---
window.submitTransaction = async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submit-btn");
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = `<div class="loader w-5 h-5 border-white"></div> Opslaan...`;

  try {
    const type = document.querySelector('input[name="type"]:checked').value;
    const amount = document.getElementById("amount").value;
    const date = document.getElementById("date").value;
    const desc = document.getElementById("description").value;

    // Afdelingen Array
    const selectedDepts = Array.from(
      document.querySelectorAll('input[name="afdeling"]:checked'),
    ).map((cb) => cb.value);
    if (selectedDepts.length === 0) selectedDepts.push("Algemeen");

    const { error } = await supabaseClient
      .from(COLLECTION_NAMES.FINANCES)
      .insert([
        {
          type: type,
          amount: amount,
          description: desc,
          afdelingen: selectedDepts,
          datum: date,
        },
      ]);

    if (error) throw error;

    showToast("Transactie opgeslagen!", "success");

    // Terug naar overzicht
    await loadData();
    switchTab("overview");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Fout bij opslaan", "error");
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
};
