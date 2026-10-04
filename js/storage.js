// src/storage.ts
// Accès centralisé au localStorage pour EJDEN.
/* ========================================
   OUTILS DE SÉCURITÉ
======================================== */
// Limites : elles protègent l'affichage et le stockage (5 Mo max).
export const LIMITS = {
    nameMax: 80,
    barcodeMax: 64,
    moneyMax: 100_000_000,
    stockMax: 1_000_000,
    // ~ 450 Ko de texte pour une photo (JPEG 600 px ≈ 60-120 Ko)
    photoMax: 450_000,
    categoryMax: 40
};
// Une photo ne peut être qu'une image encodée en base64 (data URL).
// Interdit : javascript:, http(s): (pistage), guillemets (injection HTML).
const SAFE_PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export function isSafePhoto(value) {
    return (typeof value === "string" &&
        value.length <= LIMITS.photoMax &&
        SAFE_PHOTO.test(value));
}
/** Identifiant unique (UUID quand disponible). */
export function newId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `id-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}
const PRODUCTS_KEY = "ejden_products";
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function cleanBarcode(value) {
    if (typeof value !== "string") {
        return null;
    }
    const code = value.replace(/\s+/g, "").slice(0, LIMITS.barcodeMax);
    return code === "" ? null : code;
}
/**
 * Valide ET nettoie un produit (venant du disque ou d'un formulaire).
 * Les produits d'une ancienne version (barcode/photo absents) sont
 * acceptés au lieu d'être supprimés. Retourne null si inutilisable.
 */
/** Nom de catégorie propre : sans caractères de contrôle, 40 caractères max. */
export function cleanCategory(value) {
    if (typeof value !== "string") {
        return null;
    }
    const category = value
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, LIMITS.categoryMax)
        .trim();
    return category === "" ? null : category;
}
export function normalizeProduct(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const p = value;
    if (typeof p.id !== "string" || p.id === "" || p.id.length > 100) {
        return null;
    }
    const name = typeof p.name === "string"
        ? p.name.trim().slice(0, LIMITS.nameMax)
        : "";
    if (name === "" ||
        !isFiniteNumber(p.purchasePrice) ||
        !isFiniteNumber(p.salePrice) ||
        !isFiniteNumber(p.stock)) {
        return null;
    }
    const threshold = isFiniteNumber(p.stockThreshold) ? p.stockThreshold : 0;
    const clamp = (n, max) => Math.min(Math.max(n, 0), max);
    return {
        id: p.id,
        name,
        purchasePrice: clamp(p.purchasePrice, LIMITS.moneyMax),
        salePrice: clamp(p.salePrice, LIMITS.moneyMax),
        stock: Math.floor(clamp(p.stock, LIMITS.stockMax)),
        stockThreshold: Math.floor(clamp(threshold, LIMITS.stockMax)),
        barcode: cleanBarcode(p.barcode),
        photo: isSafePhoto(p.photo) ? p.photo : null,
        category: cleanCategory(p.category)
    };
}
/**
 * Lecture d'une liste. Si des éléments sont illisibles, on garde une
 * copie brute (clé *_backup) AVANT qu'une prochaine sauvegarde ne les
 * efface : aucune perte de données silencieuse.
 */
function readList(key, parse, label) {
    let stored;
    try {
        stored = localStorage.getItem(key);
    }
    catch (error) {
        console.error(`Impossible de lire ${label}.`, error);
        return [];
    }
    if (!stored) {
        return [];
    }
    try {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            backupRaw(key, stored);
            return [];
        }
        const valid = [];
        for (const entry of parsed) {
            const item = parse(entry);
            if (item !== null) {
                valid.push(item);
            }
        }
        if (valid.length !== parsed.length) {
            backupRaw(key, stored);
        }
        return valid;
    }
    catch (error) {
        console.error(`Les données (${label}) sont invalides.`, error);
        backupRaw(key, stored);
        return [];
    }
}
function backupRaw(key, raw) {
    try {
        const backupKey = `${key}_backup`;
        if (localStorage.getItem(backupKey) === null) {
            localStorage.setItem(backupKey, raw);
        }
    }
    catch {
        // Stockage plein : on ne peut pas faire mieux.
    }
}
function writeList(key, list, label) {
    try {
        localStorage.setItem(key, JSON.stringify(list));
        return true;
    }
    catch (error) {
        console.error(`Impossible d'enregistrer ${label}.`, error);
        return false;
    }
}
export function getProducts() {
    return readList(PRODUCTS_KEY, normalizeProduct, "les produits");
}
export function getProductById(productId) {
    return getProducts().find((item) => item.id === productId) ?? null;
}
export function saveProducts(products) {
    return writeList(PRODUCTS_KEY, products, "les produits");
}
export function addProduct(product) {
    const clean = normalizeProduct(product);
    if (!clean) {
        return false;
    }
    const products = getProducts();
    products.push(clean);
    return saveProducts(products);
}
export function updateProduct(product) {
    const clean = normalizeProduct(product);
    if (!clean) {
        return false;
    }
    const products = getProducts();
    const index = products.findIndex((item) => item.id === clean.id);
    if (index === -1) {
        return false;
    }
    products[index] = clean;
    return saveProducts(products);
}
export function deleteProduct(productId) {
    const products = getProducts();
    const remaining = products.filter((item) => item.id !== productId);
    if (remaining.length === products.length) {
        return false;
    }
    return saveProducts(remaining);
}
/* ========================================
   PRODUIT EN COURS DE MODIFICATION
   Filet de sécurité : si le serveur supprime « ?id=… » de l'adresse
   (URL propres), la page de modification retrouve quand même le produit.
======================================== */
const EDITING_KEY = "ejden_editing_product";
export function rememberEditingProduct(productId) {
    try {
        sessionStorage.setItem(EDITING_KEY, productId.slice(0, 100));
    }
    catch {
        // Stockage indisponible : l'adresse (?id=) reste utilisée.
    }
}
export function getRememberedEditingProduct() {
    try {
        const saved = sessionStorage.getItem(EDITING_KEY);
        return saved && saved.length <= 100 ? saved : null;
    }
    catch {
        return null;
    }
}
export function forgetEditingProduct() {
    try {
        sessionStorage.removeItem(EDITING_KEY);
    }
    catch {
        // Rien à faire.
    }
}
/* ========================================
   AFFICHAGE DE LA PAGE PRODUITS
======================================== */
export const UNCATEGORIZED_LABEL = "Sans catégorie";
/** Clé de comparaison : « Boissons », « boissons » et « Boîssons » sont la même catégorie. */
export function categoryKey(category) {
    return (category ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
/** Catégories existantes, sans doublon, triées par ordre alphabétique. */
export function getCategories(products = getProducts()) {
    const seen = new Map();
    for (const product of products) {
        const key = categoryKey(product.category);
        if (product.category !== null && key !== "" && !seen.has(key)) {
            seen.set(key, product.category);
        }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr"));
}
/**
 * Catégorie saisie → catégorie à enregistrer.
 * Si elle existe déjà (à la casse près), on reprend l'écriture existante :
 * « boissons » devient « Boissons » au lieu de créer un doublon.
 */
export function resolveCategory(input) {
    const cleaned = cleanCategory(input);
    if (cleaned === null) {
        return null;
    }
    const key = categoryKey(cleaned);
    return getCategories().find((item) => categoryKey(item) === key) ?? cleaned;
}
const PRODUCTS_GROUPING_KEY = "ejden_products_grouping";
export function getProductsGrouping() {
    try {
        const saved = localStorage.getItem(PRODUCTS_GROUPING_KEY);
        if (saved === "all" || saved === "category") {
            return saved;
        }
    }
    catch (error) {
        console.error("Impossible de lire le regroupement.", error);
    }
    return "all";
}
export function saveProductsGrouping(grouping) {
    try {
        localStorage.setItem(PRODUCTS_GROUPING_KEY, grouping);
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer le regroupement.", error);
        return false;
    }
}
const PRODUCTS_VIEW_KEY = "ejden_products_view";
export function getProductsViewMode() {
    try {
        const saved = localStorage.getItem(PRODUCTS_VIEW_KEY);
        if (saved === "grid" || saved === "list") {
            return saved;
        }
    }
    catch (error) {
        console.error("Impossible de lire le mode d'affichage.", error);
    }
    return "grid";
}
export function saveProductsViewMode(mode) {
    try {
        localStorage.setItem(PRODUCTS_VIEW_KEY, mode);
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer le mode d'affichage.", error);
        return false;
    }
}
const SALES_KEY = "ejden_sales";
function isPaymentMethod(value) {
    return (value === "cash" ||
        value === "mobile_money" ||
        value === "card" ||
        value === "other" ||
        value === "credit");
}
function isSaleItem(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const item = value;
    return (typeof item.productId === "string" &&
        typeof item.productName === "string" &&
        isFiniteNumber(item.unitPrice) &&
        (item.unitCost === undefined || isFiniteNumber(item.unitCost)) &&
        isFiniteNumber(item.quantity) &&
        item.quantity > 0 &&
        isFiniteNumber(item.total));
}
function isSale(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const s = value;
    return (typeof s.id === "string" &&
        typeof s.createdAt === "string" &&
        Array.isArray(s.items) &&
        s.items.every(isSaleItem) &&
        isFiniteNumber(s.subtotal) &&
        isFiniteNumber(s.discount) &&
        isFiniteNumber(s.total) &&
        isPaymentMethod(s.paymentMethod) &&
        isFiniteNumber(s.amountPaid) &&
        isFiniteNumber(s.change) &&
        isFiniteNumber(s.remaining) &&
        (typeof s.customerId === "string" || s.customerId === null) &&
        (typeof s.borrowerName === "string" || s.borrowerName === null) &&
        (s.cancelledAt === undefined || typeof s.cancelledAt === "string"));
}
export function getSales() {
    return readList(SALES_KEY, (value) => (isSale(value) ? value : null), "les ventes");
}
export function saveSales(sales) {
    return writeList(SALES_KEY, sales, "les ventes");
}
export function addSale(sale) {
    const sales = getSales();
    sales.push(sale);
    return saveSales(sales);
}
/* ========================================
   RECHERCHE PRODUIT
======================================== */
function normalizeBarcode(value) {
    return value.replace(/\s+/g, "").trim();
}
export function findProductByBarcode(barcode) {
    const code = normalizeBarcode(barcode);
    if (!code) {
        return null;
    }
    return (getProducts().find((product) => product.barcode !== null &&
        normalizeBarcode(product.barcode) === code) ?? null);
}
export function recordSale(sale) {
    const originalProducts = getProducts();
    // Le stock est revérifié ici, au dernier moment.
    for (const item of sale.items) {
        const product = originalProducts.find((candidate) => candidate.id === item.productId);
        if (!product || product.stock < item.quantity) {
            return {
                ok: false,
                reason: "stock",
                productName: product?.name ?? item.productName
            };
        }
    }
    const updatedProducts = originalProducts.map((product) => {
        const sold = sale.items
            .filter((item) => item.productId === product.id)
            .reduce((sum, item) => sum + item.quantity, 0);
        return sold > 0
            ? { ...product, stock: product.stock - sold }
            : product;
    });
    if (!saveProducts(updatedProducts)) {
        return { ok: false, reason: "storage" };
    }
    if (!addSale(sale)) {
        // Annulation : le stock revient comme avant.
        saveProducts(originalProducts);
        return { ok: false, reason: "storage" };
    }
    return { ok: true };
}
export function cancelSale(saleId) {
    const sales = getSales();
    const index = sales.findIndex((item) => item.id === saleId);
    if (index === -1) {
        return { ok: false, reason: "not_found" };
    }
    const sale = sales[index];
    if (sale.cancelledAt) {
        return { ok: false, reason: "already_cancelled" };
    }
    // L'argent déjà reçu sur ce crédit doit d'abord être annulé,
    // sinon la caisse et le stock ne seraient plus d'accord.
    if (getCreditPayments().some((payment) => payment.saleId === sale.id && !payment.cancelledAt)) {
        return { ok: false, reason: "has_payments" };
    }
    const toRestore = new Map();
    for (const item of sale.items) {
        toRestore.set(item.productId, (toRestore.get(item.productId) ?? 0) + item.quantity);
    }
    const originalProducts = getProducts();
    const knownIds = new Set(originalProducts.map((product) => product.id));
    // Produits supprimés depuis la vente : rien à remettre en stock.
    let missingProducts = 0;
    for (const productId of toRestore.keys()) {
        if (!knownIds.has(productId)) {
            missingProducts += 1;
        }
    }
    const restoredProducts = originalProducts.map((product) => {
        const quantity = toRestore.get(product.id);
        return quantity
            ? {
                ...product,
                stock: Math.min(product.stock + quantity, LIMITS.stockMax)
            }
            : product;
    });
    if (!saveProducts(restoredProducts)) {
        return { ok: false, reason: "storage" };
    }
    sales[index] = { ...sale, cancelledAt: new Date().toISOString() };
    if (!saveSales(sales)) {
        saveProducts(originalProducts);
        return { ok: false, reason: "storage" };
    }
    return { ok: true, missingProducts };
}
function isSameLocalDay(a, b) {
    return (a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate());
}
/** Ventes non annulées dont la date est comprise entre start et end (inclus). */
export function getSalesSummaryBetween(start, end) {
    const from = start.getTime();
    const to = end.getTime();
    const periodSales = getSales().filter((sale) => {
        const at = new Date(sale.createdAt).getTime();
        return !sale.cancelledAt && at >= from && at <= to;
    });
    let revenue = 0;
    let margin = 0;
    let marginKnown = false;
    for (const sale of periodSales) {
        revenue += sale.total;
        if (sale.items.every((item) => item.unitCost !== undefined)) {
            const saleMargin = sale.items.reduce((sum, item) => sum + (item.unitPrice - (item.unitCost ?? 0)) * item.quantity, 0);
            margin += saleMargin - sale.discount;
            marginKnown = true;
        }
    }
    return {
        salesCount: periodSales.length,
        revenue,
        margin: marginKnown ? margin : null
    };
}
export function getTodaySummary(now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return getSalesSummaryBetween(start, end);
}
/** Argent entré et sorti de la caisse sur une période. */
export function getCashFlowBetween(start, end) {
    const from = start.getTime();
    const to = end.getTime();
    let cashIn = 0;
    let cashOut = 0;
    for (const movement of getCashSummary().movements) {
        const at = new Date(movement.createdAt).getTime();
        if (at < from || at > to) {
            continue;
        }
        if (movement.amount > 0) {
            cashIn += movement.amount;
        }
        else {
            cashOut += -movement.amount;
        }
    }
    return { cashIn, cashOut };
}
const PERIOD_KEY = "ejden_dashboard_period";
const PRESETS = ["today", "7d", "1m", "3m", "6m", "custom"];
export function isValidDay(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return (y >= 2000 &&
        y <= 2100 &&
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d);
}
export function getDashboardPeriod() {
    const fallback = { preset: "today", from: null, to: null };
    try {
        const stored = localStorage.getItem(PERIOD_KEY);
        if (!stored) {
            return fallback;
        }
        const parsed = JSON.parse(stored);
        if (typeof parsed !== "object" || parsed === null) {
            return fallback;
        }
        const p = parsed;
        if (!PRESETS.includes(p.preset)) {
            return fallback;
        }
        if (p.preset === "custom") {
            return isValidDay(p.from) && isValidDay(p.to) && p.from <= p.to
                ? { preset: "custom", from: p.from, to: p.to }
                : fallback;
        }
        return { preset: p.preset, from: null, to: null };
    }
    catch {
        return fallback;
    }
}
export function saveDashboardPeriod(choice) {
    try {
        localStorage.setItem(PERIOD_KEY, JSON.stringify(choice));
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer la période.", error);
        return false;
    }
}
/* ========================================
   DONNÉES DU TABLEAU DE BORD
======================================== */
/** Les ventes les plus récentes d'abord. */
export function getRecentSales(limit = 5) {
    return getSales()
        .filter((sale) => !sale.cancelledAt)
        .sort((a, b) => new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime())
        .slice(0, limit);
}
export function getStockSummary(watchLimit = 4) {
    const products = getProducts();
    const isOut = (p) => p.stock <= 0;
    const isLow = (p) => p.stock > 0 && p.stockThreshold > 0 && p.stock <= p.stockThreshold;
    const watchList = products
        .filter((p) => isOut(p) || isLow(p))
        .sort((a, b) => a.stock - b.stock)
        .slice(0, watchLimit);
    return {
        productsCount: products.length,
        lowCount: products.filter(isLow).length,
        outCount: products.filter(isOut).length,
        watchList
    };
}
export function getReceivables() {
    const debtors = new Set();
    const sales = getSales();
    const remaining = getRemainingMap(sales);
    let amount = 0;
    for (const sale of sales) {
        const due = remaining.get(sale.id) ?? 0;
        if (due > 0) {
            amount += due;
            debtors.add(sale.customerId ?? sale.borrowerName ?? sale.id);
        }
    }
    return { amount, debtorsCount: debtors.size };
}
export const CREDIT_PAYMENT_METHODS = [
    "cash",
    "mobile_money",
    "card",
    "other"
];
const CREDIT_PAYMENTS_KEY = "ejden_credit_payments";
function isCreditPaymentMethod(value) {
    return (typeof value === "string" &&
        CREDIT_PAYMENT_METHODS.includes(value));
}
export function normalizeCreditPayment(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const p = value;
    const amount = cleanAmount(p.amount);
    const createdAt = validDate(p.createdAt);
    if (typeof p.id !== "string" ||
        p.id === "" ||
        p.id.length > 100 ||
        typeof p.saleId !== "string" ||
        p.saleId === "" ||
        p.saleId.length > 100 ||
        !isCreditPaymentMethod(p.method) ||
        amount === null ||
        createdAt === null) {
        return null;
    }
    const payment = {
        id: p.id,
        saleId: p.saleId,
        amount,
        method: p.method,
        createdAt
    };
    if (typeof p.cancelledAt === "string" && validDate(p.cancelledAt) !== null) {
        payment.cancelledAt = p.cancelledAt;
    }
    return payment;
}
export function getCreditPayments() {
    return readList(CREDIT_PAYMENTS_KEY, normalizeCreditPayment, "les paiements de crédit");
}
/** Reste à payer de chaque vente (clé = id de la vente). */
export function getRemainingMap(sales = getSales(), payments = getCreditPayments()) {
    const paid = new Map();
    for (const payment of payments) {
        if (!payment.cancelledAt) {
            paid.set(payment.saleId, (paid.get(payment.saleId) ?? 0) + payment.amount);
        }
    }
    const remaining = new Map();
    for (const sale of sales) {
        remaining.set(sale.id, sale.cancelledAt
            ? 0
            : Math.max(0, Math.round(sale.remaining - (paid.get(sale.id) ?? 0))));
    }
    return remaining;
}
/** Reste à payer d'une vente (0 si annulée ou soldée). */
export function getSaleRemaining(sale) {
    return getRemainingMap([sale]).get(sale.id) ?? 0;
}
/** Paiements d'une vente, du plus récent au plus ancien (annulés compris). */
export function getSalePayments(saleId) {
    return getCreditPayments()
        .filter((payment) => payment.saleId === saleId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
/**
 * Enregistre un remboursement. Le montant est réparti sur les ventes
 * indiquées dans l'ordre donné (la plus ancienne d'abord).
 * Tout est écrit en une seule opération : tout passe ou rien.
 */
export function recordCreditPayment(saleIds, amount, method) {
    const cleanPaid = cleanAmount(amount);
    if (cleanPaid === null) {
        return { ok: false, reason: "invalid_amount" };
    }
    if (!isCreditPaymentMethod(method)) {
        return { ok: false, reason: "invalid_method" };
    }
    const sales = getSales();
    const payments = getCreditPayments();
    const remaining = getRemainingMap(sales, payments);
    // Seules les ventes qui existent vraiment et qui doivent encore de l'argent.
    const targets = [...new Set(saleIds)].filter((id) => (remaining.get(id) ?? 0) > 0);
    const totalDue = targets.reduce((sum, id) => sum + (remaining.get(id) ?? 0), 0);
    if (targets.length === 0) {
        return { ok: false, reason: "no_debt" };
    }
    if (cleanPaid > totalDue) {
        return { ok: false, reason: "too_much", due: totalDue };
    }
    const now = new Date().toISOString();
    const applied = [];
    let left = cleanPaid;
    for (const saleId of targets) {
        if (left <= 0) {
            break;
        }
        const part = Math.min(left, remaining.get(saleId) ?? 0);
        if (part > 0) {
            applied.push({ saleId, amount: part });
            payments.push({
                id: newId(),
                saleId,
                amount: part,
                method,
                createdAt: now
            });
            left -= part;
        }
    }
    if (!writeList(CREDIT_PAYMENTS_KEY, payments, "les paiements de crédit")) {
        return { ok: false, reason: "storage" };
    }
    return { ok: true, applied };
}
/** Annule un paiement saisi par erreur : il reste visible, barré. */
export function cancelCreditPayment(paymentId) {
    const payments = getCreditPayments();
    const index = payments.findIndex((item) => item.id === paymentId);
    if (index === -1) {
        return { ok: false, reason: "not_found" };
    }
    if (payments[index].cancelledAt) {
        return { ok: false, reason: "already_cancelled" };
    }
    payments[index] = { ...payments[index], cancelledAt: new Date().toISOString() };
    return writeList(CREDIT_PAYMENTS_KEY, payments, "les paiements de crédit")
        ? { ok: true }
        : { ok: false, reason: "storage" };
}
/** Dernières régularisations d'un client (pour sa fiche). */
export function getClientPayments(client, limit = 5) {
    const name = client.name.trim().toLowerCase();
    const ids = new Set(getSales()
        .filter((sale) => sale.customerId === client.id ||
        (sale.borrowerName !== null &&
            sale.borrowerName.trim().toLowerCase() === name))
        .map((sale) => sale.id));
    return getCreditPayments()
        .filter((payment) => ids.has(payment.saleId) && !payment.cancelledAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, Math.max(0, limit));
}
const SHOP_KEY = "ejden_shop";
export const SHOP_LIMITS = { nameMax: 60, phoneMax: 20 };
// Chiffres, +, espaces, tirets, points, parenthèses uniquement.
const PHONE_PATTERN = /^[0-9+().\-\s]*$/;
export function isValidPhone(value) {
    return value.length <= SHOP_LIMITS.phoneMax && PHONE_PATTERN.test(value);
}
function cleanShopText(value, max) {
    return typeof value === "string"
        // eslint-disable-next-line no-control-regex
        ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max)
        : "";
}
export function getShopSettings() {
    try {
        const stored = localStorage.getItem(SHOP_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (typeof parsed === "object" && parsed !== null) {
                const data = parsed;
                const phone = cleanShopText(data.phone, SHOP_LIMITS.phoneMax);
                return {
                    name: cleanShopText(data.name, SHOP_LIMITS.nameMax),
                    phone: isValidPhone(phone) ? phone : ""
                };
            }
        }
    }
    catch (error) {
        console.error("Impossible de lire les réglages de la boutique.", error);
    }
    return { name: "", phone: "" };
}
export function saveShopSettings(settings) {
    const name = cleanShopText(settings.name, SHOP_LIMITS.nameMax);
    const phone = cleanShopText(settings.phone, SHOP_LIMITS.phoneMax);
    // Contrôle sur le texte d'origine : un numéro trop long est refusé,
    // pas coupé en silence.
    if (typeof settings.phone !== "string" ||
        settings.phone.trim().length > SHOP_LIMITS.phoneMax ||
        !isValidPhone(phone)) {
        return false;
    }
    try {
        localStorage.setItem(SHOP_KEY, JSON.stringify({ name, phone }));
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer les réglages.", error);
        return false;
    }
}
const USER_KEY = "ejden_user";
export const USER_LIMITS = { nameMax: 40, phoneMax: 20 };
export function getUserProfile() {
    const empty = { firstName: "", lastName: "", phone: "" };
    try {
        const stored = localStorage.getItem(USER_KEY);
        if (!stored) {
            return empty;
        }
        const parsed = JSON.parse(stored);
        if (typeof parsed !== "object" || parsed === null) {
            return empty;
        }
        const data = parsed;
        const phone = cleanShopText(data.phone, USER_LIMITS.phoneMax);
        return {
            firstName: cleanShopText(data.firstName, USER_LIMITS.nameMax),
            lastName: cleanShopText(data.lastName, USER_LIMITS.nameMax),
            phone: isValidPhone(phone) ? phone : ""
        };
    }
    catch (error) {
        console.error("Impossible de lire le profil de l'utilisateur.", error);
        return empty;
    }
}
export function saveUserProfile(profile) {
    const raw = [profile.firstName, profile.lastName, profile.phone];
    if (raw.some((value) => typeof value !== "string")) {
        return false;
    }
    // Contrôle sur le texte d'origine : trop long = refusé, pas coupé.
    if (profile.firstName.trim().length > USER_LIMITS.nameMax ||
        profile.lastName.trim().length > USER_LIMITS.nameMax ||
        profile.phone.trim().length > USER_LIMITS.phoneMax) {
        return false;
    }
    const clean = {
        firstName: cleanShopText(profile.firstName, USER_LIMITS.nameMax),
        lastName: cleanShopText(profile.lastName, USER_LIMITS.nameMax),
        phone: cleanShopText(profile.phone, USER_LIMITS.phoneMax)
    };
    if (!isValidPhone(clean.phone)) {
        return false;
    }
    try {
        localStorage.setItem(USER_KEY, JSON.stringify(clean));
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer le profil.", error);
        return false;
    }
}
/* ========================================
   OUTILS COMMUNS (clients, dépenses, caisse)
======================================== */
export const MODULE_LIMITS = {
    textMax: 80,
    phoneMax: 20,
    amountMax: 100_000_000
};
/** Texte sûr : sans caractères de contrôle, coupé à la limite. */
function cleanLabel(value, max) {
    return typeof value === "string"
        // eslint-disable-next-line no-control-regex
        ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
        : "";
}
/** Montant en FCFA : entier, > 0, borné. Sinon null. */
export function cleanAmount(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    const rounded = Math.round(value);
    return rounded > 0 && rounded <= MODULE_LIMITS.amountMax ? rounded : null;
}
function validDate(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
        ? value
        : null;
}
const CLIENTS_KEY = "ejden_clients";
export function normalizeClient(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const c = value;
    const name = cleanLabel(c.name, MODULE_LIMITS.textMax);
    const phone = cleanLabel(c.phone, MODULE_LIMITS.phoneMax);
    const createdAt = validDate(c.createdAt);
    if (typeof c.id !== "string" ||
        c.id === "" ||
        c.id.length > 100 ||
        name === "" ||
        createdAt === null ||
        !isValidPhone(phone)) {
        return null;
    }
    return { id: c.id, name, phone, createdAt };
}
export function getClients() {
    return readList(CLIENTS_KEY, normalizeClient, "les clients");
}
export function getClientById(clientId) {
    return getClients().find((client) => client.id === clientId) ?? null;
}
/** Deux clients ne peuvent pas porter exactement le même nom. */
export function clientNameExists(name, exceptId) {
    const wanted = name.trim().toLowerCase();
    return getClients().some((client) => client.id !== exceptId && client.name.toLowerCase() === wanted);
}
export function addClient(client) {
    const clean = normalizeClient(client);
    if (!clean) {
        return false;
    }
    const clients = getClients();
    clients.push(clean);
    return writeList(CLIENTS_KEY, clients, "les clients");
}
export function updateClient(client) {
    const clean = normalizeClient(client);
    if (!clean) {
        return false;
    }
    const clients = getClients();
    const index = clients.findIndex((item) => item.id === clean.id);
    if (index === -1) {
        return false;
    }
    clients[index] = clean;
    return writeList(CLIENTS_KEY, clients, "les clients");
}
/** Supprime la fiche client. Les ventes déjà faites ne sont pas touchées. */
export function deleteClient(clientId) {
    const clients = getClients();
    const remaining = clients.filter((client) => client.id !== clientId);
    if (remaining.length === clients.length) {
        return false;
    }
    return writeList(CLIENTS_KEY, remaining, "les clients");
}
/**
 * Ce que doit un client : ventes non annulées avec un reste à payer,
 * reliées par l'identifiant client ou, à défaut, par le nom du débiteur.
 */
export function getClientDebt(client) {
    const name = client.name.toLowerCase();
    const allSales = getSales();
    const remaining = getRemainingMap(allSales);
    const sales = allSales
        .filter((sale) => (remaining.get(sale.id) ?? 0) > 0 &&
        (sale.customerId === client.id ||
            (sale.borrowerName !== null &&
                sale.borrowerName.trim().toLowerCase() === name)))
        .sort((a, b) => new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime());
    return {
        amount: sales.reduce((sum, sale) => sum + (remaining.get(sale.id) ?? 0), 0),
        sales
    };
}
/* ========================================
   DÉPENSES
======================================== */
export const EXPENSE_CATEGORIES = [
    { id: "marchandises", label: "Marchandises" },
    { id: "transport", label: "Transport" },
    { id: "loyer", label: "Loyer" },
    { id: "energie", label: "Électricité / Eau" },
    { id: "salaires", label: "Salaires" },
    { id: "autre", label: "Autre" }
];
const EXPENSES_KEY = "ejden_expenses";
function isExpenseCategory(value) {
    return EXPENSE_CATEGORIES.some((category) => category.id === value);
}
export function normalizeExpense(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const e = value;
    const label = cleanLabel(e.label, MODULE_LIMITS.textMax);
    const amount = cleanAmount(e.amount);
    const createdAt = validDate(e.createdAt);
    if (typeof e.id !== "string" ||
        e.id === "" ||
        e.id.length > 100 ||
        label === "" ||
        amount === null ||
        createdAt === null ||
        !isExpenseCategory(e.category)) {
        return null;
    }
    return { id: e.id, label, amount, category: e.category, createdAt };
}
export function getExpenses() {
    return readList(EXPENSES_KEY, normalizeExpense, "les dépenses");
}
export function addExpense(expense) {
    const clean = normalizeExpense(expense);
    if (!clean) {
        return false;
    }
    const expenses = getExpenses();
    expenses.push(clean);
    return writeList(EXPENSES_KEY, expenses, "les dépenses");
}
export function deleteExpense(expenseId) {
    const expenses = getExpenses();
    const remaining = expenses.filter((item) => item.id !== expenseId);
    if (remaining.length === expenses.length) {
        return false;
    }
    return writeList(EXPENSES_KEY, remaining, "les dépenses");
}
export function getExpensesTotals(now = new Date()) {
    let today = 0;
    let month = 0;
    for (const expense of getExpenses()) {
        const date = new Date(expense.createdAt);
        if (date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()) {
            month += expense.amount;
            if (date.getDate() === now.getDate()) {
                today += expense.amount;
            }
        }
    }
    return { today, month };
}
const CASH_KEY = "ejden_cash";
export function normalizeCashEntry(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const c = value;
    const reason = cleanLabel(c.reason, MODULE_LIMITS.textMax);
    const amount = cleanAmount(c.amount);
    const createdAt = validDate(c.createdAt);
    if (typeof c.id !== "string" ||
        c.id === "" ||
        c.id.length > 100 ||
        (c.type !== "in" && c.type !== "out") ||
        reason === "" ||
        amount === null ||
        createdAt === null) {
        return null;
    }
    return { id: c.id, type: c.type, amount, reason, createdAt };
}
export function getCashEntries() {
    return readList(CASH_KEY, normalizeCashEntry, "les mouvements de caisse");
}
export function addCashEntry(entry) {
    const clean = normalizeCashEntry(entry);
    if (!clean) {
        return false;
    }
    const entries = getCashEntries();
    entries.push(clean);
    return writeList(CASH_KEY, entries, "les mouvements de caisse");
}
export function deleteCashEntry(entryId) {
    const entries = getCashEntries();
    const remaining = entries.filter((item) => item.id !== entryId);
    if (remaining.length === entries.length) {
        return false;
    }
    return writeList(CASH_KEY, remaining, "les mouvements de caisse");
}
export function getCashSummary(now = new Date()) {
    const movements = [];
    const salesByMethod = {
        cash: 0,
        mobile_money: 0,
        card: 0,
        other: 0,
        credit: 0
    };
    for (const sale of getSales()) {
        if (sale.cancelledAt) {
            continue;
        }
        const collected = Math.max(0, sale.total - sale.remaining);
        if (collected > 0) {
            salesByMethod[sale.paymentMethod] += collected;
            movements.push({
                id: `sale-${sale.id}`,
                source: "sale",
                amount: collected,
                label: `Vente N° ${sale.id.slice(-6).toUpperCase()}`,
                createdAt: sale.createdAt,
                method: sale.paymentMethod
            });
        }
    }
    // Remboursements de crédits reçus (paiements non annulés).
    const salesById = new Map(getSales().map((sale) => [sale.id, sale]));
    for (const payment of getCreditPayments()) {
        const sale = salesById.get(payment.saleId);
        if (payment.cancelledAt || !sale || sale.cancelledAt) {
            continue;
        }
        salesByMethod[payment.method] += payment.amount;
        movements.push({
            id: `credit-payment-${payment.id}`,
            source: "credit_payment",
            amount: payment.amount,
            label: `Remboursement${sale.borrowerName ? ` · ${sale.borrowerName}` : ""}`,
            createdAt: payment.createdAt,
            method: payment.method
        });
    }
    for (const entry of getCashEntries()) {
        movements.push({
            id: `cash-${entry.id}`,
            source: entry.type === "in" ? "entry" : "exit",
            amount: entry.type === "in" ? entry.amount : -entry.amount,
            label: entry.reason,
            createdAt: entry.createdAt,
            deletableId: entry.id
        });
    }
    for (const expense of getExpenses()) {
        movements.push({
            id: `expense-${expense.id}`,
            source: "expense",
            amount: -expense.amount,
            label: expense.label,
            createdAt: expense.createdAt
        });
    }
    // Achats payés à la livraison et paiements aux fournisseurs : sorties.
    const purchases = getPurchases();
    const purchasesById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
    for (const purchase of purchases) {
        if (!purchase.cancelledAt && purchase.paid > 0) {
            movements.push({
                id: `purchase-${purchase.id}`,
                source: "purchase",
                amount: -purchase.paid,
                label: `Achat · ${purchase.supplierName}`,
                createdAt: purchase.createdAt
            });
        }
    }
    for (const payment of getSupplierPayments()) {
        const purchase = purchasesById.get(payment.purchaseId);
        if (payment.cancelledAt || !purchase || purchase.cancelledAt) {
            continue;
        }
        movements.push({
            id: `supplier-payment-${payment.id}`,
            source: "supplier_payment",
            amount: -payment.amount,
            label: `Paiement fournisseur · ${purchase.supplierName}`,
            createdAt: payment.createdAt,
            method: payment.method
        });
    }
    movements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    let balance = 0;
    let todayIn = 0;
    let todayOut = 0;
    for (const movement of movements) {
        balance += movement.amount;
        if (isSameLocalDay(new Date(movement.createdAt), now)) {
            if (movement.amount > 0) {
                todayIn += movement.amount;
            }
            else {
                todayOut += -movement.amount;
            }
        }
    }
    return { balance, todayIn, todayOut, salesByMethod, movements };
}
/** Variation en % entre deux totaux (null si la base est nulle). */
export function percentChange(current, previous) {
    if (previous <= 0) {
        return null;
    }
    return Math.round(((current - previous) / previous) * 100);
}
export function getSalesTrend(period, now = new Date()) {
    const byMonth = period === "12m";
    const length = period === "7d" ? 7 : period === "30d" ? 30 : 12;
    // Début de chaque tranche, du plus ancien au plus récent.
    const buckets = [];
    for (let i = length - 1; i >= 0; i -= 1) {
        buckets.push({
            start: byMonth
                ? new Date(now.getFullYear(), now.getMonth() - i, 1)
                : new Date(now.getFullYear(), now.getMonth(), now.getDate() - i),
            value: 0,
            count: 0
        });
    }
    const first = buckets[0].start;
    // Numéro de tranche d'une date (0 = première tranche affichée,
    // négatif = période précédente). Sans calcul d'heures : pas de souci
    // de changement d'heure.
    const indexOf = (date) => byMonth
        ? date.getFullYear() * 12 +
            date.getMonth() -
            (first.getFullYear() * 12 + first.getMonth())
        : Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
            Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) /
            86_400_000);
    let total = 0;
    let count = 0;
    let previousTotal = 0;
    for (const sale of getSales()) {
        if (sale.cancelledAt) {
            continue;
        }
        const date = new Date(sale.createdAt);
        if (Number.isNaN(date.getTime())) {
            continue;
        }
        const index = indexOf(date);
        if (index >= 0 && index < length) {
            buckets[index].value += sale.total;
            buckets[index].count += 1;
            total += sale.total;
            count += 1;
        }
        else if (index < 0 && index >= -length) {
            previousTotal += sale.total;
        }
    }
    return { buckets, total, count, previousTotal };
}
export const STOCK_REASONS = {
    in: ["Réapprovisionnement", "Retour client", "Autre"],
    out: ["Perte", "Casse", "Produit périmé", "Usage personnel", "Autre"],
    adjust: ["Inventaire"]
};
const STOCK_MOVEMENTS_KEY = "ejden_stock_movements";
const STOCK_MOVEMENTS_KEPT = 2000;
function isStockQuantity(value) {
    return (typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= LIMITS.stockMax);
}
export function normalizeStockMovement(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const m = value;
    const productName = cleanLabel(m.productName, LIMITS.nameMax);
    const reason = cleanLabel(m.reason, MODULE_LIMITS.textMax);
    const createdAt = validDate(m.createdAt);
    if (typeof m.id !== "string" ||
        m.id === "" ||
        m.id.length > 100 ||
        typeof m.productId !== "string" ||
        m.productId === "" ||
        m.productId.length > 100 ||
        productName === "" ||
        reason === "" ||
        createdAt === null ||
        (m.type !== "in" && m.type !== "out" && m.type !== "adjust") ||
        !isStockQuantity(m.before) ||
        !isStockQuantity(m.after) ||
        typeof m.quantity !== "number" ||
        !Number.isInteger(m.quantity) ||
        m.quantity === 0 ||
        m.after - m.before !== m.quantity) {
        return null;
    }
    return {
        id: m.id,
        productId: m.productId,
        productName,
        type: m.type,
        quantity: m.quantity,
        before: m.before,
        after: m.after,
        reason,
        createdAt
    };
}
export function getStockMovements() {
    return readList(STOCK_MOVEMENTS_KEY, normalizeStockMovement, "les mouvements de stock");
}
/**
 * Entrée (+), sortie (−) ou inventaire (stock compté = quantité donnée).
 * Le stock du produit et l'historique sont écrits ensemble : si la
 * seconde écriture échoue, le stock est remis comme avant.
 */
export function recordStockMovement(productId, type, quantity, reason) {
    const products = getProducts();
    const index = products.findIndex((item) => item.id === productId);
    if (index === -1) {
        return { ok: false, reason: "not_found" };
    }
    const product = products[index];
    const cleanReason = cleanLabel(reason, MODULE_LIMITS.textMax);
    if (cleanReason === "") {
        return { ok: false, reason: "invalid_reason" };
    }
    if (typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < (type === "adjust" ? 0 : 1)) {
        return { ok: false, reason: "invalid_quantity" };
    }
    let after;
    if (type === "in") {
        after = product.stock + quantity;
        if (after > LIMITS.stockMax) {
            return { ok: false, reason: "too_high" };
        }
    }
    else if (type === "out") {
        if (quantity > product.stock) {
            return { ok: false, reason: "too_much" };
        }
        after = product.stock - quantity;
    }
    else {
        if (quantity > LIMITS.stockMax) {
            return { ok: false, reason: "too_high" };
        }
        after = quantity;
        if (after === product.stock) {
            return { ok: false, reason: "unchanged" };
        }
    }
    const movement = {
        id: newId(),
        productId: product.id,
        productName: product.name,
        type,
        quantity: after - product.stock,
        before: product.stock,
        after,
        reason: cleanReason,
        createdAt: new Date().toISOString()
    };
    const originalProducts = products.map((item) => ({ ...item }));
    products[index] = { ...product, stock: after };
    if (!saveProducts(products)) {
        return { ok: false, reason: "storage" };
    }
    const movements = [...getStockMovements(), movement].slice(-STOCK_MOVEMENTS_KEPT);
    if (!writeList(STOCK_MOVEMENTS_KEY, movements, "les mouvements de stock")) {
        saveProducts(originalProducts);
        return { ok: false, reason: "storage" };
    }
    return { ok: true, movement };
}
/**
 * Historique complet, du plus récent au plus ancien : mouvements
 * enregistrés + ventes + annulations de ventes.
 */
export function getStockHistory(productId) {
    const entries = [];
    for (const movement of getStockMovements()) {
        if (productId === undefined || movement.productId === productId) {
            entries.push({
                id: `m-${movement.id}`,
                productId: movement.productId,
                productName: movement.productName,
                delta: movement.quantity,
                label: movement.reason,
                source: "manual",
                createdAt: movement.createdAt,
                after: movement.after
            });
        }
    }
    for (const sale of getSales()) {
        const number = sale.id.slice(-6).toUpperCase();
        for (const [position, item] of sale.items.entries()) {
            if (productId !== undefined && item.productId !== productId) {
                continue;
            }
            entries.push({
                id: `s-${sale.id}-${position}`,
                productId: item.productId,
                productName: item.productName,
                delta: -item.quantity,
                label: `Vente N° ${number}`,
                source: "sale",
                createdAt: sale.createdAt
            });
            if (sale.cancelledAt) {
                entries.push({
                    id: `c-${sale.id}-${position}`,
                    productId: item.productId,
                    productName: item.productName,
                    delta: item.quantity,
                    label: `Annulation vente N° ${number}`,
                    source: "sale_cancel",
                    createdAt: sale.cancelledAt
                });
            }
        }
    }
    // Achats fournisseurs (et leurs annulations)
    for (const purchase of getPurchases()) {
        for (const [position, item] of purchase.items.entries()) {
            if (productId !== undefined && item.productId !== productId) {
                continue;
            }
            entries.push({
                id: `p-${purchase.id}-${position}`,
                productId: item.productId,
                productName: item.productName,
                delta: item.quantity,
                label: `Achat · ${purchase.supplierName}`,
                source: "purchase",
                createdAt: purchase.createdAt
            });
            if (purchase.cancelledAt) {
                entries.push({
                    id: `pc-${purchase.id}-${position}`,
                    productId: item.productId,
                    productName: item.productName,
                    delta: -item.quantity,
                    label: `Annulation achat · ${purchase.supplierName}`,
                    source: "purchase_cancel",
                    createdAt: purchase.cancelledAt
                });
            }
        }
    }
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export function getStockValue() {
    let cost = 0;
    let retail = 0;
    for (const product of getProducts()) {
        cost += product.stock * product.purchasePrice;
        retail += product.stock * product.salePrice;
    }
    return { cost, retail };
}
const SUPPLIERS_KEY = "ejden_suppliers";
export function normalizeSupplier(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const c = value;
    const name = cleanLabel(c.name, MODULE_LIMITS.textMax);
    const phone = cleanLabel(c.phone, MODULE_LIMITS.phoneMax);
    const createdAt = validDate(c.createdAt);
    if (typeof c.id !== "string" ||
        c.id === "" ||
        c.id.length > 100 ||
        name === "" ||
        createdAt === null ||
        !isValidPhone(phone)) {
        return null;
    }
    return { id: c.id, name, phone, createdAt };
}
export function getSuppliers() {
    return readList(SUPPLIERS_KEY, normalizeSupplier, "les fournisseurs");
}
export function getSupplierById(supplierId) {
    return getSuppliers().find((item) => item.id === supplierId) ?? null;
}
export function supplierNameExists(name, exceptId) {
    const wanted = name.trim().toLowerCase();
    return getSuppliers().some((item) => item.id !== exceptId && item.name.toLowerCase() === wanted);
}
export function addSupplier(supplier) {
    const clean = normalizeSupplier(supplier);
    if (!clean) {
        return false;
    }
    const suppliers = getSuppliers();
    suppliers.push(clean);
    return writeList(SUPPLIERS_KEY, suppliers, "les fournisseurs");
}
export function updateSupplier(supplier) {
    const clean = normalizeSupplier(supplier);
    if (!clean) {
        return false;
    }
    const suppliers = getSuppliers();
    const index = suppliers.findIndex((item) => item.id === clean.id);
    if (index === -1) {
        return false;
    }
    suppliers[index] = clean;
    return writeList(SUPPLIERS_KEY, suppliers, "les fournisseurs");
}
/**
 * Supprime la fiche. Refusé tant qu'on lui doit de l'argent.
 * Les achats déjà faits restent dans l'historique (nom conservé).
 */
export function deleteSupplier(supplierId) {
    const suppliers = getSuppliers();
    const remaining = suppliers.filter((item) => item.id !== supplierId);
    if (remaining.length === suppliers.length) {
        return { ok: false, reason: "not_found" };
    }
    if (getSupplierDebt(supplierId).amount > 0) {
        return { ok: false, reason: "has_debt" };
    }
    return writeList(SUPPLIERS_KEY, remaining, "les fournisseurs")
        ? { ok: true }
        : { ok: false, reason: "storage" };
}
const PURCHASES_KEY = "ejden_purchases";
const PURCHASE_ITEMS_MAX = 50;
function normalizePurchaseItem(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const i = value;
    const productName = cleanLabel(i.productName, LIMITS.nameMax);
    const unitCost = cleanAmount(i.unitCost);
    if (typeof i.productId !== "string" ||
        i.productId === "" ||
        i.productId.length > 100 ||
        productName === "" ||
        unitCost === null ||
        typeof i.quantity !== "number" ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > LIMITS.stockMax) {
        return null;
    }
    return { productId: i.productId, productName, quantity: i.quantity, unitCost };
}
export function normalizePurchase(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const p = value;
    const supplierName = cleanLabel(p.supplierName, MODULE_LIMITS.textMax);
    const createdAt = validDate(p.createdAt);
    if (typeof p.id !== "string" ||
        p.id === "" ||
        p.id.length > 100 ||
        typeof p.supplierId !== "string" ||
        p.supplierId === "" ||
        p.supplierId.length > 100 ||
        supplierName === "" ||
        createdAt === null ||
        !Array.isArray(p.items) ||
        p.items.length < 1 ||
        p.items.length > PURCHASE_ITEMS_MAX) {
        return null;
    }
    const items = [];
    for (const entry of p.items) {
        const item = normalizePurchaseItem(entry);
        if (!item) {
            return null;
        }
        items.push(item);
    }
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    if (p.total !== total ||
        typeof p.paid !== "number" ||
        !Number.isInteger(p.paid) ||
        p.paid < 0 ||
        p.paid > total) {
        return null;
    }
    const purchase = {
        id: p.id,
        supplierId: p.supplierId,
        supplierName,
        items,
        total,
        paid: p.paid,
        note: cleanLabel(p.note, MODULE_LIMITS.textMax),
        createdAt
    };
    if (typeof p.cancelledAt === "string" && validDate(p.cancelledAt) !== null) {
        purchase.cancelledAt = p.cancelledAt;
    }
    return purchase;
}
export function getPurchases() {
    return readList(PURCHASES_KEY, normalizePurchase, "les achats");
}
export function recordPurchase(input) {
    const supplier = getSupplierById(input.supplierId);
    if (!supplier) {
        return { ok: false, reason: "supplier_not_found" };
    }
    if (input.items.length < 1 || input.items.length > PURCHASE_ITEMS_MAX) {
        return { ok: false, reason: "no_items" };
    }
    const products = getProducts();
    const originalProducts = products.map((item) => ({ ...item }));
    const seen = new Set();
    const items = [];
    for (const line of input.items) {
        const unitCost = cleanAmount(line.unitCost);
        if (typeof line.quantity !== "number" ||
            !Number.isInteger(line.quantity) ||
            line.quantity < 1 ||
            unitCost === null) {
            return { ok: false, reason: "invalid_item" };
        }
        const index = products.findIndex((item) => item.id === line.productId);
        if (index === -1) {
            return { ok: false, reason: "unknown_product" };
        }
        if (seen.has(line.productId)) {
            return { ok: false, reason: "duplicate_product" };
        }
        seen.add(line.productId);
        const product = products[index];
        const stock = product.stock + line.quantity;
        if (stock > LIMITS.stockMax) {
            return { ok: false, reason: "too_high" };
        }
        products[index] = {
            ...product,
            stock,
            purchasePrice: input.updatePrices ? unitCost : product.purchasePrice
        };
        items.push({
            productId: product.id,
            productName: product.name,
            quantity: line.quantity,
            unitCost
        });
    }
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    if (total > MODULE_LIMITS.amountMax) {
        return { ok: false, reason: "too_high" };
    }
    if (typeof input.paid !== "number" ||
        !Number.isInteger(input.paid) ||
        input.paid < 0 ||
        input.paid > total) {
        return { ok: false, reason: "invalid_paid" };
    }
    const purchase = {
        id: newId(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        items,
        total,
        paid: input.paid,
        note: cleanLabel(input.note, MODULE_LIMITS.textMax),
        createdAt: new Date().toISOString()
    };
    if (!saveProducts(products)) {
        return { ok: false, reason: "storage" };
    }
    if (!writeList(PURCHASES_KEY, [...getPurchases(), purchase], "les achats")) {
        saveProducts(originalProducts);
        return { ok: false, reason: "storage" };
    }
    return { ok: true, purchase };
}
/**
 * Annule un achat : le stock livré est retiré (seulement s'il est encore
 * en rayon), l'argent payé à la livraison sort des dépenses de caisse.
 * Refusé si des paiements ont déjà été faits dessus : annulez-les d'abord.
 */
export function cancelPurchase(purchaseId) {
    const purchases = getPurchases();
    const index = purchases.findIndex((item) => item.id === purchaseId);
    if (index === -1) {
        return { ok: false, reason: "not_found" };
    }
    const purchase = purchases[index];
    if (purchase.cancelledAt) {
        return { ok: false, reason: "already_cancelled" };
    }
    if (getSupplierPayments().some((payment) => payment.purchaseId === purchase.id && !payment.cancelledAt)) {
        return { ok: false, reason: "has_payments" };
    }
    const products = getProducts();
    const originalProducts = products.map((item) => ({ ...item }));
    let missingProducts = 0;
    for (const line of purchase.items) {
        const position = products.findIndex((item) => item.id === line.productId);
        if (position === -1) {
            missingProducts += 1;
            continue;
        }
        if (products[position].stock < line.quantity) {
            return {
                ok: false,
                reason: "stock_used",
                productName: products[position].name
            };
        }
        products[position] = {
            ...products[position],
            stock: products[position].stock - line.quantity
        };
    }
    if (!saveProducts(products)) {
        return { ok: false, reason: "storage" };
    }
    purchases[index] = { ...purchase, cancelledAt: new Date().toISOString() };
    if (!writeList(PURCHASES_KEY, purchases, "les achats")) {
        saveProducts(originalProducts);
        return { ok: false, reason: "storage" };
    }
    return { ok: true, missingProducts };
}
const SUPPLIER_PAYMENTS_KEY = "ejden_supplier_payments";
export function normalizeSupplierPayment(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const p = value;
    const amount = cleanAmount(p.amount);
    const createdAt = validDate(p.createdAt);
    const text = (v) => typeof v === "string" && v !== "" && v.length <= 100;
    if (!text(p.id) ||
        !text(p.batchId) ||
        !text(p.purchaseId) ||
        !text(p.supplierId) ||
        !isCreditPaymentMethod(p.method) ||
        amount === null ||
        createdAt === null) {
        return null;
    }
    const payment = {
        id: p.id,
        batchId: p.batchId,
        purchaseId: p.purchaseId,
        supplierId: p.supplierId,
        amount,
        method: p.method,
        createdAt
    };
    if (typeof p.cancelledAt === "string" && validDate(p.cancelledAt) !== null) {
        payment.cancelledAt = p.cancelledAt;
    }
    return payment;
}
export function getSupplierPayments() {
    return readList(SUPPLIER_PAYMENTS_KEY, normalizeSupplierPayment, "les paiements fournisseurs");
}
/** Reste dû par achat (achats non annulés seulement). */
export function getPurchaseRemainingMap(purchases = getPurchases(), payments = getSupplierPayments()) {
    const paid = new Map();
    for (const payment of payments) {
        if (!payment.cancelledAt) {
            paid.set(payment.purchaseId, (paid.get(payment.purchaseId) ?? 0) + payment.amount);
        }
    }
    const remaining = new Map();
    for (const purchase of purchases) {
        if (!purchase.cancelledAt) {
            remaining.set(purchase.id, Math.max(0, purchase.total - purchase.paid - (paid.get(purchase.id) ?? 0)));
        }
    }
    return remaining;
}
export function getSupplierDebt(supplierId) {
    const purchases = getPurchases();
    const remaining = getPurchaseRemainingMap(purchases);
    const open = purchases
        .filter((purchase) => purchase.supplierId === supplierId &&
        (remaining.get(purchase.id) ?? 0) > 0)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((purchase) => ({
        purchase,
        remaining: remaining.get(purchase.id) ?? 0
    }));
    return {
        amount: open.reduce((sum, entry) => sum + entry.remaining, 0),
        purchases: open
    };
}
/** Total dû à tous les fournisseurs. */
export function getSuppliersDebtTotal() {
    let total = 0;
    for (const value of getPurchaseRemainingMap().values()) {
        total += value;
    }
    return total;
}
/**
 * Paiement au fournisseur, appliqué d'abord à ses achats les plus
 * anciens. Écrit en une seule fois : tout ou rien.
 */
export function recordSupplierPayment(supplierId, amount, method) {
    const clean = cleanAmount(amount);
    if (clean === null) {
        return { ok: false, reason: "invalid_amount" };
    }
    if (!isCreditPaymentMethod(method)) {
        return { ok: false, reason: "invalid_method" };
    }
    const debt = getSupplierDebt(supplierId);
    if (debt.amount <= 0) {
        return { ok: false, reason: "no_debt" };
    }
    if (clean > debt.amount) {
        return { ok: false, reason: "too_much", debt: debt.amount };
    }
    const batchId = newId();
    const createdAt = new Date().toISOString();
    const created = [];
    let left = clean;
    for (const entry of debt.purchases) {
        if (left <= 0) {
            break;
        }
        const part = Math.min(left, entry.remaining);
        created.push({
            id: newId(),
            batchId,
            purchaseId: entry.purchase.id,
            supplierId,
            amount: part,
            method,
            createdAt
        });
        left -= part;
    }
    return writeList(SUPPLIER_PAYMENTS_KEY, [...getSupplierPayments(), ...created], "les paiements fournisseurs")
        ? { ok: true }
        : { ok: false, reason: "storage" };
}
/** Versements d'un fournisseur (regroupés), du plus récent au plus ancien. */
export function getSupplierPaymentBatches(supplierId) {
    const batches = new Map();
    for (const payment of getSupplierPayments()) {
        if (payment.supplierId !== supplierId) {
            continue;
        }
        const existing = batches.get(payment.batchId);
        if (existing) {
            existing.amount += payment.amount;
        }
        else {
            batches.set(payment.batchId, {
                batchId: payment.batchId,
                amount: payment.amount,
                method: payment.method,
                createdAt: payment.createdAt,
                cancelledAt: payment.cancelledAt
            });
        }
    }
    return [...batches.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
/** Annule un versement entier : la dette remonte, la caisse est corrigée. */
export function cancelSupplierPayment(batchId) {
    const payments = getSupplierPayments();
    const batch = payments.filter((payment) => payment.batchId === batchId);
    if (batch.length === 0) {
        return { ok: false, reason: "not_found" };
    }
    if (batch.every((payment) => payment.cancelledAt)) {
        return { ok: false, reason: "already_cancelled" };
    }
    const now = new Date().toISOString();
    const updated = payments.map((payment) => payment.batchId === batchId && !payment.cancelledAt
        ? { ...payment, cancelledAt: now }
        : payment);
    return writeList(SUPPLIER_PAYMENTS_KEY, updated, "les paiements fournisseurs")
        ? { ok: true }
        : { ok: false, reason: "storage" };
}
const ORDERS_KEY = "ejden_orders";
const ORDER_ITEMS_MAX = 50;
export const WALK_IN_CLIENT = "Client de passage";
function normalizeOrderItem(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const i = value;
    const productName = cleanLabel(i.productName, LIMITS.nameMax);
    const unitPrice = cleanAmount(i.unitPrice);
    if (typeof i.productId !== "string" ||
        i.productId === "" ||
        i.productId.length > 100 ||
        productName === "" ||
        unitPrice === null ||
        typeof i.quantity !== "number" ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > LIMITS.stockMax) {
        return null;
    }
    return { productId: i.productId, productName, quantity: i.quantity, unitPrice };
}
export function normalizeOrder(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const o = value;
    const partyName = cleanLabel(o.partyName, MODULE_LIMITS.textMax);
    const createdAt = validDate(o.createdAt);
    if (typeof o.id !== "string" ||
        o.id === "" ||
        o.id.length > 100 ||
        (o.kind !== "customer" && o.kind !== "supplier") ||
        (o.partyId !== null && (typeof o.partyId !== "string" || o.partyId === "" || o.partyId.length > 100)) ||
        partyName === "" ||
        createdAt === null ||
        (o.status !== "pending" && o.status !== "ready" && o.status !== "completed" && o.status !== "cancelled") ||
        (o.expectedDate !== null && !isValidDay(o.expectedDate)) ||
        !Array.isArray(o.items) ||
        o.items.length < 1 ||
        o.items.length > ORDER_ITEMS_MAX) {
        return null;
    }
    // Une commande fournisseur a toujours un fournisseur enregistré ;
    // « prête » n'existe que pour les commandes clients.
    if (o.kind === "supplier" && (o.partyId === null || o.status === "ready")) {
        return null;
    }
    const items = [];
    for (const entry of o.items) {
        const item = normalizeOrderItem(entry);
        if (!item) {
            return null;
        }
        items.push(item);
    }
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (o.total !== total) {
        return null;
    }
    const order = {
        id: o.id,
        kind: o.kind,
        partyId: o.partyId,
        partyName,
        items,
        total,
        note: cleanLabel(o.note, MODULE_LIMITS.textMax),
        expectedDate: o.expectedDate,
        status: o.status,
        createdAt
    };
    if (typeof o.completedAt === "string" && validDate(o.completedAt) !== null) {
        order.completedAt = o.completedAt;
    }
    if (typeof o.cancelledAt === "string" && validDate(o.cancelledAt) !== null) {
        order.cancelledAt = o.cancelledAt;
    }
    if (typeof o.linkId === "string" && o.linkId.length <= 100) {
        order.linkId = o.linkId;
    }
    return order;
}
export function getOrders() {
    return readList(ORDERS_KEY, normalizeOrder, "les commandes");
}
export function addOrder(input) {
    if (input.kind !== "customer" && input.kind !== "supplier") {
        return { ok: false, reason: "party_required" };
    }
    // --- Client ou fournisseur ---
    let partyName = WALK_IN_CLIENT;
    let partyId = null;
    if (input.kind === "supplier") {
        const supplier = input.partyId ? getSupplierById(input.partyId) : null;
        if (!input.partyId) {
            return { ok: false, reason: "party_required" };
        }
        if (!supplier) {
            return { ok: false, reason: "party_not_found" };
        }
        partyId = supplier.id;
        partyName = supplier.name;
    }
    else if (input.partyId) {
        const client = getClientById(input.partyId);
        if (!client) {
            return { ok: false, reason: "party_not_found" };
        }
        partyId = client.id;
        partyName = client.name;
    }
    // --- Date prévue ---
    if (input.expectedDate !== null && !isValidDay(input.expectedDate)) {
        return { ok: false, reason: "invalid_date" };
    }
    // --- Articles ---
    if (input.items.length < 1 || input.items.length > ORDER_ITEMS_MAX) {
        return { ok: false, reason: "no_items" };
    }
    const products = getProducts();
    const seen = new Set();
    const items = [];
    for (const line of input.items) {
        const unitPrice = cleanAmount(line.unitPrice);
        if (typeof line.quantity !== "number" ||
            !Number.isInteger(line.quantity) ||
            line.quantity < 1 ||
            line.quantity > LIMITS.stockMax ||
            unitPrice === null) {
            return { ok: false, reason: "invalid_item" };
        }
        const product = products.find((item) => item.id === line.productId);
        if (!product) {
            return { ok: false, reason: "unknown_product" };
        }
        if (seen.has(product.id)) {
            return { ok: false, reason: "duplicate_product" };
        }
        seen.add(product.id);
        items.push({
            productId: product.id,
            productName: product.name,
            quantity: line.quantity,
            unitPrice
        });
    }
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (total > MODULE_LIMITS.amountMax) {
        return { ok: false, reason: "too_high" };
    }
    const order = {
        id: newId(),
        kind: input.kind,
        partyId,
        partyName,
        items,
        total,
        note: cleanLabel(input.note, MODULE_LIMITS.textMax),
        expectedDate: input.expectedDate,
        status: "pending",
        createdAt: new Date().toISOString()
    };
    return writeList(ORDERS_KEY, [...getOrders(), order], "les commandes")
        ? { ok: true, order }
        : { ok: false, reason: "storage" };
}
function changeOrder(orderId, allowed, change) {
    const orders = getOrders();
    const index = orders.findIndex((item) => item.id === orderId);
    if (index === -1) {
        return { ok: false, reason: "not_found" };
    }
    if (!allowed(orders[index])) {
        return { ok: false, reason: "not_allowed" };
    }
    orders[index] = change(orders[index]);
    return writeList(ORDERS_KEY, orders, "les commandes")
        ? { ok: true }
        : { ok: false, reason: "storage" };
}
/** Commande client prête à être livrée (en attente → prête). */
export function markOrderReady(orderId) {
    return changeOrder(orderId, (order) => order.kind === "customer" && order.status === "pending", (order) => ({ ...order, status: "ready" }));
}
/** Annule une commande en cours : aucun effet sur le stock ni la caisse. */
export function cancelOrder(orderId) {
    return changeOrder(orderId, (order) => order.status === "pending" || order.status === "ready", (order) => ({
        ...order,
        status: "cancelled",
        cancelledAt: new Date().toISOString()
    }));
}
function findOpenOrder(orderId, kind) {
    const order = getOrders().find((item) => item.id === orderId);
    if (!order) {
        return "not_found";
    }
    return order.kind === kind && (order.status === "pending" || order.status === "ready")
        ? order
        : "not_allowed";
}
function markOrderCompleted(orderId, linkId) {
    return changeOrder(orderId, () => true, (order) => ({
        ...order,
        status: "completed",
        completedAt: new Date().toISOString(),
        linkId
    })).ok;
}
/**
 * Livre une commande client : crée la vente (stock diminué, argent en
 * caisse). Si le client paie moins que le total, le reste devient un
 * crédit (client enregistré obligatoire).
 */
export function completeCustomerOrder(orderId, paymentMethod, amountPaid) {
    const found = findOpenOrder(orderId, "customer");
    if (typeof found === "string") {
        return { ok: false, reason: found };
    }
    const order = found;
    if (!isCreditPaymentMethod(paymentMethod)) {
        return { ok: false, reason: "invalid_method" };
    }
    if (typeof amountPaid !== "number" ||
        !Number.isInteger(amountPaid) ||
        amountPaid < 0 ||
        amountPaid > order.total) {
        return { ok: false, reason: "invalid_amount" };
    }
    const onCredit = amountPaid < order.total;
    if (onCredit && order.partyId === null) {
        return { ok: false, reason: "credit_needs_client" };
    }
    const products = getProducts();
    const items = order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        unitCost: products.find((product) => product.id === item.productId)?.purchasePrice,
        quantity: item.quantity,
        total: item.quantity * item.unitPrice
    }));
    const sale = {
        id: newId(),
        createdAt: new Date().toISOString(),
        items,
        subtotal: order.total,
        discount: 0,
        total: order.total,
        paymentMethod: onCredit ? "credit" : paymentMethod,
        amountPaid,
        change: 0,
        remaining: order.total - amountPaid,
        customerId: order.partyId,
        borrowerName: onCredit ? order.partyName : null
    };
    const result = recordSale(sale);
    if (!result.ok) {
        return result.reason === "stock"
            ? { ok: false, reason: "stock", productName: result.productName }
            : { ok: false, reason: "storage" };
    }
    if (!markOrderCompleted(order.id, sale.id)) {
        // Retour en arrière : la vente est annulée, le stock revient.
        cancelSale(sale.id);
        return { ok: false, reason: "storage" };
    }
    return { ok: true, linkId: sale.id };
}
/**
 * Réceptionne une commande fournisseur : crée l'achat (stock augmenté,
 * dette ou paiement). Les prix de la commande deviennent les prix d'achat
 * de la livraison.
 */
export function receiveSupplierOrder(orderId, paid, updatePrices) {
    const found = findOpenOrder(orderId, "supplier");
    if (typeof found === "string") {
        return { ok: false, reason: found };
    }
    const order = found;
    const result = recordPurchase({
        supplierId: order.partyId ?? "",
        items: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitPrice
        })),
        paid,
        note: "Commande reçue",
        updatePrices
    });
    if (!result.ok) {
        return { ok: false, reason: result.reason };
    }
    if (!markOrderCompleted(order.id, result.purchase.id)) {
        // Retour en arrière : l'achat est annulé, le stock revient.
        cancelPurchase(result.purchase.id);
        return { ok: false, reason: "storage" };
    }
    return { ok: true, linkId: result.purchase.id };
}
/** Une commande en cours dont la date prévue est dépassée. */
export function isOrderOverdue(order, now = new Date()) {
    if (order.expectedDate === null ||
        (order.status !== "pending" && order.status !== "ready")) {
        return false;
    }
    const [y, m, d] = order.expectedDate.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime() < now.getTime();
}
export function getOrdersSummary(now = new Date()) {
    const summary = { customerOpen: 0, supplierOpen: 0, overdue: 0 };
    for (const order of getOrders()) {
        if (order.status !== "pending" && order.status !== "ready") {
            continue;
        }
        if (order.kind === "customer") {
            summary.customerOpen += 1;
        }
        else {
            summary.supplierOpen += 1;
        }
        if (isOrderOverdue(order, now)) {
            summary.overdue += 1;
        }
    }
    return summary;
}
/* ========================================
   CRÉDITS : sommes à encaisser, par débiteur
======================================== */
export const CREDIT_OVERDUE_DAYS = 30;
/** Tous les crédits non soldés, regroupés par débiteur (plus gros d'abord). */
export function getCreditsSummary(now = new Date()) {
    const sales = getSales();
    const remaining = getRemainingMap(sales);
    const clients = new Map(getClients().map((client) => [client.id, client]));
    const groups = new Map();
    const open = sales
        .filter((sale) => (remaining.get(sale.id) ?? 0) > 0)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const sale of open) {
        const client = sale.customerId ? clients.get(sale.customerId) : undefined;
        const name = client?.name ?? sale.borrowerName?.trim() ?? "";
        if (name === "") {
            continue;
        }
        // Un nom saisi qui correspond à une fiche est rattaché à cette fiche.
        const byName = client
            ? client
            : [...clients.values()].find((item) => item.name.toLowerCase() === name.toLowerCase());
        const key = byName ? byName.id : `name:${name.toLowerCase()}`;
        const entry = { sale, remaining: remaining.get(sale.id) ?? 0 };
        const existing = groups.get(key);
        if (existing) {
            existing.sales.push(entry);
            existing.amount += entry.remaining;
            // Sans fiche : on garde l'orthographe de la vente la plus récente
            // (les ventes sont lues de la plus ancienne à la plus récente).
            if (!byName) {
                existing.name = name;
            }
        }
        else {
            groups.set(key, {
                key,
                clientId: byName ? byName.id : null,
                name: byName ? byName.name : name,
                amount: entry.remaining,
                sales: [entry],
                oldestAt: sale.createdAt,
                oldestDays: 0,
                overdue: false
            });
        }
    }
    const list = [...groups.values()];
    for (const group of list) {
        const age = now.getTime() - new Date(group.oldestAt).getTime();
        group.oldestDays = Math.max(0, Math.floor(age / 86_400_000));
        group.overdue = group.oldestDays > CREDIT_OVERDUE_DAYS;
    }
    list.sort((a, b) => b.amount - a.amount);
    const overdue = list.filter((group) => group.overdue);
    return {
        total: list.reduce((sum, group) => sum + group.amount, 0),
        debtors: list.length,
        overdueAmount: overdue.reduce((sum, group) => sum + group.amount, 0),
        overdueDebtors: overdue.length,
        groups: list
    };
}
//# sourceMappingURL=storage.js.map