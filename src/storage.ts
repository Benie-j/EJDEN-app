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
} as const;

// Une photo ne peut être qu'une image encodée en base64 (data URL).
// Interdit : javascript:, http(s): (pistage), guillemets (injection HTML).
const SAFE_PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function isSafePhoto(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.length <= LIMITS.photoMax &&
        SAFE_PHOTO.test(value)
    );
}

/** Identifiant unique (UUID quand disponible). */
export function newId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return `id-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

/* ========================================
   PRODUITS
======================================== */

export interface Product {
    id: string;
    name: string;
    purchasePrice: number;
    salePrice: number;
    stock: number;
    stockThreshold: number;
    barcode: string | null;
    photo: string | null;
    // Catégorie libre (facultative). null = « Sans catégorie ».
    category: string | null;
}

const PRODUCTS_KEY = "ejden_products";

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function cleanBarcode(value: unknown): string | null {
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
export function cleanCategory(value: unknown): string | null {
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

export function normalizeProduct(value: unknown): Product | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const p = value as Record<string, unknown>;

    if (typeof p.id !== "string" || p.id === "" || p.id.length > 100) {
        return null;
    }

    const name =
        typeof p.name === "string"
            ? p.name.trim().slice(0, LIMITS.nameMax)
            : "";

    if (
        name === "" ||
        !isFiniteNumber(p.purchasePrice) ||
        !isFiniteNumber(p.salePrice) ||
        !isFiniteNumber(p.stock)
    ) {
        return null;
    }

    const threshold = isFiniteNumber(p.stockThreshold) ? p.stockThreshold : 0;
    const clamp = (n: number, max: number): number =>
        Math.min(Math.max(n, 0), max);

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
function readList<T>(
    key: string,
    parse: (value: unknown) => T | null,
    label: string
): T[] {
    let stored: string | null;

    try {
        stored = localStorage.getItem(key);
    } catch (error) {
        console.error(`Impossible de lire ${label}.`, error);
        return [];
    }

    if (!stored) {
        return [];
    }

    try {
        const parsed: unknown = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            backupRaw(key, stored);
            return [];
        }

        const valid: T[] = [];

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
    } catch (error) {
        console.error(`Les données (${label}) sont invalides.`, error);
        backupRaw(key, stored);
        return [];
    }
}

function backupRaw(key: string, raw: string): void {
    try {
        const backupKey = `${key}_backup`;

        if (localStorage.getItem(backupKey) === null) {
            localStorage.setItem(backupKey, raw);
        }
    } catch {
        // Stockage plein : on ne peut pas faire mieux.
    }
}

function writeList(key: string, list: unknown[], label: string): boolean {
    try {
        localStorage.setItem(key, JSON.stringify(list));
        return true;
    } catch (error) {
        console.error(`Impossible d'enregistrer ${label}.`, error);
        return false;
    }
}

export function getProducts(): Product[] {
    return readList(PRODUCTS_KEY, normalizeProduct, "les produits");
}

export function getProductById(productId: string): Product | null {
    return getProducts().find((item) => item.id === productId) ?? null;
}

export function saveProducts(products: Product[]): boolean {
    return writeList(PRODUCTS_KEY, products, "les produits");
}

export function addProduct(product: Product): boolean {
    const clean = normalizeProduct(product);

    if (!clean) {
        return false;
    }

    const products = getProducts();

    products.push(clean);

    return saveProducts(products);
}

export function updateProduct(product: Product): boolean {
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

export function deleteProduct(productId: string): boolean {
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

export function rememberEditingProduct(productId: string): void {
    try {
        sessionStorage.setItem(EDITING_KEY, productId.slice(0, 100));
    } catch {
        // Stockage indisponible : l'adresse (?id=) reste utilisée.
    }
}

export function getRememberedEditingProduct(): string | null {
    try {
        const saved = sessionStorage.getItem(EDITING_KEY);

        return saved && saved.length <= 100 ? saved : null;
    } catch {
        return null;
    }
}

export function forgetEditingProduct(): void {
    try {
        sessionStorage.removeItem(EDITING_KEY);
    } catch {
        // Rien à faire.
    }
}


/* ========================================
   AFFICHAGE DE LA PAGE PRODUITS
======================================== */

export const UNCATEGORIZED_LABEL = "Sans catégorie";

/** Clé de comparaison : « Boissons », « boissons » et « Boîssons » sont la même catégorie. */
export function categoryKey(category: string | null): string {
    return (category ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/** Catégories existantes, sans doublon, triées par ordre alphabétique. */
export function getCategories(products: Product[] = getProducts()): string[] {
    const seen = new Map<string, string>();

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
export function resolveCategory(input: string): string | null {
    const cleaned = cleanCategory(input);

    if (cleaned === null) {
        return null;
    }

    const key = categoryKey(cleaned);

    return getCategories().find((item) => categoryKey(item) === key) ?? cleaned;
}

export type ProductsGrouping = "all" | "category";

const PRODUCTS_GROUPING_KEY = "ejden_products_grouping";

export function getProductsGrouping(): ProductsGrouping {
    try {
        const saved = localStorage.getItem(PRODUCTS_GROUPING_KEY);

        if (saved === "all" || saved === "category") {
            return saved;
        }
    } catch (error) {
        console.error("Impossible de lire le regroupement.", error);
    }

    return "all";
}

export function saveProductsGrouping(grouping: ProductsGrouping): boolean {
    try {
        localStorage.setItem(PRODUCTS_GROUPING_KEY, grouping);
        return true;
    } catch (error) {
        console.error("Impossible d'enregistrer le regroupement.", error);
        return false;
    }
}


export type ProductsViewMode = "grid" | "list";

const PRODUCTS_VIEW_KEY = "ejden_products_view";

export function getProductsViewMode(): ProductsViewMode {
    try {
        const saved = localStorage.getItem(PRODUCTS_VIEW_KEY);

        if (saved === "grid" || saved === "list") {
            return saved;
        }
    } catch (error) {
        console.error("Impossible de lire le mode d'affichage.", error);
    }

    return "grid";
}

export function saveProductsViewMode(mode: ProductsViewMode): boolean {
    try {
        localStorage.setItem(PRODUCTS_VIEW_KEY, mode);
        return true;
    } catch (error) {
        console.error("Impossible d'enregistrer le mode d'affichage.", error);
        return false;
    }
}

/* ========================================
   VENTES
======================================== */

export type PaymentMethod =
    | "cash"
    | "mobile_money"
    | "card"
    | "other"
    | "credit";

export interface SaleItem {
    productId: string;
    productName: string;
    unitPrice: number;
    // Prix d'achat au moment de la vente (pour calculer la marge).
    // Optionnel : les ventes plus anciennes ne l'ont pas.
    unitCost?: number;
    quantity: number;
    total: number;
}

export interface Sale {
    id: string;
    createdAt: string;
    items: SaleItem[];
    subtotal: number;
    discount: number;
    total: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
    change: number;
    remaining: number;
    customerId: string | null;
    borrowerName: string | null;
    // Présent si la vente a été annulée (elle reste dans l'historique).
    cancelledAt?: string;
}

const SALES_KEY = "ejden_sales";

function isPaymentMethod(value: unknown): value is PaymentMethod {
    return (
        value === "cash" ||
        value === "mobile_money" ||
        value === "card" ||
        value === "other" ||
        value === "credit"
    );
}

function isSaleItem(value: unknown): value is SaleItem {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const item = value as Record<string, unknown>;

    return (
        typeof item.productId === "string" &&
        typeof item.productName === "string" &&
        isFiniteNumber(item.unitPrice) &&
        (item.unitCost === undefined || isFiniteNumber(item.unitCost)) &&
        isFiniteNumber(item.quantity) &&
        item.quantity > 0 &&
        isFiniteNumber(item.total)
    );
}

function isSale(value: unknown): value is Sale {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const s = value as Record<string, unknown>;

    return (
        typeof s.id === "string" &&
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
        (s.cancelledAt === undefined || typeof s.cancelledAt === "string")
    );
}

export function getSales(): Sale[] {
    return readList(
        SALES_KEY,
        (value) => (isSale(value) ? value : null),
        "les ventes"
    );
}

export function saveSales(sales: Sale[]): boolean {
    return writeList(SALES_KEY, sales, "les ventes");
}

export function addSale(sale: Sale): boolean {
    const sales = getSales();

    sales.push(sale);

    return saveSales(sales);
}


/* ========================================
   RECHERCHE PRODUIT
======================================== */

function normalizeBarcode(value: string): string {
    return value.replace(/\s+/g, "").trim();
}

export function findProductByBarcode(barcode: string): Product | null {
    const code = normalizeBarcode(barcode);

    if (!code) {
        return null;
    }

    return (
        getProducts().find(
            (product) =>
                product.barcode !== null &&
                normalizeBarcode(product.barcode) === code
        ) ?? null
    );
}


/* ========================================
   ENREGISTREMENT D'UNE VENTE
   Vente + baisse du stock en une seule opération :
   si l'une des deux échoue, tout est annulé.
======================================== */

export type RecordSaleResult =
    | { ok: true }
    | { ok: false; reason: "stock"; productName: string }
    | { ok: false; reason: "storage" };

export function recordSale(sale: Sale): RecordSaleResult {
    const originalProducts = getProducts();

    // Le stock est revérifié ici, au dernier moment.
    for (const item of sale.items) {
        const product = originalProducts.find(
            (candidate) => candidate.id === item.productId
        );

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


/* ========================================
   ANNULATION D'UNE VENTE
   La vente reste dans l'historique (marquée « annulée »),
   le stock est remis, et elle sort des statistiques.
   Les deux écritures sont faites ensemble : si la seconde
   échoue, la première est annulée.
======================================== */

export type CancelSaleResult =
    | { ok: true; missingProducts: number }
    | {
          ok: false;
          reason: "not_found" | "already_cancelled" | "has_payments" | "storage";
      };

export function cancelSale(saleId: string): CancelSaleResult {
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
    if (
        getCreditPayments().some(
            (payment) => payment.saleId === sale.id && !payment.cancelledAt
        )
    ) {
        return { ok: false, reason: "has_payments" };
    }

    const toRestore = new Map<string, number>();

    for (const item of sale.items) {
        toRestore.set(
            item.productId,
            (toRestore.get(item.productId) ?? 0) + item.quantity
        );
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


/* ========================================
   STATISTIQUES (calculées sur les vraies ventes)
======================================== */

export interface SalesSummary {
    salesCount: number;
    revenue: number;
    // null si aucune vente de la période n'a de prix d'achat connu.
    margin: number | null;
}

function isSameLocalDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/** Ventes non annulées dont la date est comprise entre start et end (inclus). */
export function getSalesSummaryBetween(start: Date, end: Date): SalesSummary {
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
            const saleMargin = sale.items.reduce(
                (sum, item) =>
                    sum + (item.unitPrice - (item.unitCost ?? 0)) * item.quantity,
                0
            );

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

export function getTodaySummary(now: Date = new Date()): SalesSummary {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return getSalesSummaryBetween(start, end);
}

/** Argent entré et sorti de la caisse sur une période. */
export function getCashFlowBetween(
    start: Date,
    end: Date
): { cashIn: number; cashOut: number } {
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
        } else {
            cashOut += -movement.amount;
        }
    }

    return { cashIn, cashOut };
}


/* ========================================
   PÉRIODE AFFICHÉE AU TABLEAU DE BORD
======================================== */

export type PeriodPreset = "today" | "7d" | "1m" | "3m" | "6m" | "custom";

export interface PeriodChoice {
    preset: PeriodPreset;
    // Pour « custom » seulement : jours inclus, au format AAAA-MM-JJ.
    from: string | null;
    to: string | null;
}

const PERIOD_KEY = "ejden_dashboard_period";
const PRESETS: PeriodPreset[] = ["today", "7d", "1m", "3m", "6m", "custom"];

export function isValidDay(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);

    return (
        y >= 2000 &&
        y <= 2100 &&
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d
    );
}

export function getDashboardPeriod(): PeriodChoice {
    const fallback: PeriodChoice = { preset: "today", from: null, to: null };

    try {
        const stored = localStorage.getItem(PERIOD_KEY);

        if (!stored) {
            return fallback;
        }

        const parsed: unknown = JSON.parse(stored);

        if (typeof parsed !== "object" || parsed === null) {
            return fallback;
        }

        const p = parsed as Record<string, unknown>;

        if (!PRESETS.includes(p.preset as PeriodPreset)) {
            return fallback;
        }

        if (p.preset === "custom") {
            return isValidDay(p.from) && isValidDay(p.to) && p.from <= p.to
                ? { preset: "custom", from: p.from, to: p.to }
                : fallback;
        }

        return { preset: p.preset as PeriodPreset, from: null, to: null };
    } catch {
        return fallback;
    }
}

export function saveDashboardPeriod(choice: PeriodChoice): boolean {
    try {
        localStorage.setItem(PERIOD_KEY, JSON.stringify(choice));
        return true;
    } catch (error) {
        console.error("Impossible d'enregistrer la période.", error);
        return false;
    }
}


/* ========================================
   DONNÉES DU TABLEAU DE BORD
======================================== */

/** Les ventes les plus récentes d'abord. */
export function getRecentSales(limit = 5): Sale[] {
    return getSales()
        .filter((sale) => !sale.cancelledAt)
        .sort(
            (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
        )
        .slice(0, limit);
}

export interface StockSummary {
    productsCount: number;
    lowCount: number;
    outCount: number;
    // Produits à surveiller (rupture d'abord, puis stock le plus bas).
    watchList: Product[];
}

export function getStockSummary(watchLimit = 4): StockSummary {
    const products = getProducts();

    const isOut = (p: Product): boolean => p.stock <= 0;
    const isLow = (p: Product): boolean =>
        p.stock > 0 && p.stockThreshold > 0 && p.stock <= p.stockThreshold;

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

export interface ReceivablesSummary {
    // Total encore dû par les clients (ventes à crédit non soldées).
    amount: number;
    debtorsCount: number;
}

export function getReceivables(): ReceivablesSummary {
    const debtors = new Set<string>();
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


/* ========================================
   RÉGULARISATION DES CRÉDITS
   Un client qui rembourse (en partie ou en totalité) crée un paiement
   rattaché à la vente à crédit. La vente d'origine n'est jamais modifiée :
   le reste à payer = reste initial − paiements non annulés.
======================================== */

export type CreditPaymentMethod = Exclude<PaymentMethod, "credit">;

export const CREDIT_PAYMENT_METHODS: CreditPaymentMethod[] = [
    "cash",
    "mobile_money",
    "card",
    "other"
];

export interface CreditPayment {
    id: string;
    saleId: string;
    amount: number;
    method: CreditPaymentMethod;
    createdAt: string;
    // Présent si le paiement a été annulé (il reste dans l'historique).
    cancelledAt?: string;
}

const CREDIT_PAYMENTS_KEY = "ejden_credit_payments";

function isCreditPaymentMethod(value: unknown): value is CreditPaymentMethod {
    return (
        typeof value === "string" &&
        (CREDIT_PAYMENT_METHODS as string[]).includes(value)
    );
}

export function normalizeCreditPayment(value: unknown): CreditPayment | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const p = value as Record<string, unknown>;
    const amount = cleanAmount(p.amount);
    const createdAt = validDate(p.createdAt);

    if (
        typeof p.id !== "string" ||
        p.id === "" ||
        p.id.length > 100 ||
        typeof p.saleId !== "string" ||
        p.saleId === "" ||
        p.saleId.length > 100 ||
        !isCreditPaymentMethod(p.method) ||
        amount === null ||
        createdAt === null
    ) {
        return null;
    }

    const payment: CreditPayment = {
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

export function getCreditPayments(): CreditPayment[] {
    return readList(
        CREDIT_PAYMENTS_KEY,
        normalizeCreditPayment,
        "les paiements de crédit"
    );
}

/** Reste à payer de chaque vente (clé = id de la vente). */
export function getRemainingMap(
    sales: Sale[] = getSales(),
    payments: CreditPayment[] = getCreditPayments()
): Map<string, number> {
    const paid = new Map<string, number>();

    for (const payment of payments) {
        if (!payment.cancelledAt) {
            paid.set(payment.saleId, (paid.get(payment.saleId) ?? 0) + payment.amount);
        }
    }

    const remaining = new Map<string, number>();

    for (const sale of sales) {
        remaining.set(
            sale.id,
            sale.cancelledAt
                ? 0
                : Math.max(0, Math.round(sale.remaining - (paid.get(sale.id) ?? 0)))
        );
    }

    return remaining;
}

/** Reste à payer d'une vente (0 si annulée ou soldée). */
export function getSaleRemaining(sale: Sale): number {
    return getRemainingMap([sale]).get(sale.id) ?? 0;
}

/** Paiements d'une vente, du plus récent au plus ancien (annulés compris). */
export function getSalePayments(saleId: string): CreditPayment[] {
    return getCreditPayments()
        .filter((payment) => payment.saleId === saleId)
        .sort(
            (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
}

export type CreditPaymentResult =
    | { ok: true; applied: { saleId: string; amount: number }[] }
    | {
          ok: false;
          reason: "invalid_amount" | "invalid_method" | "no_debt" | "too_much" | "storage";
          // Pour « too_much » : ce qui reste réellement dû.
          due?: number;
      };

/**
 * Enregistre un remboursement. Le montant est réparti sur les ventes
 * indiquées dans l'ordre donné (la plus ancienne d'abord).
 * Tout est écrit en une seule opération : tout passe ou rien.
 */
export function recordCreditPayment(
    saleIds: string[],
    amount: number,
    method: CreditPaymentMethod
): CreditPaymentResult {
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
    const targets = [...new Set(saleIds)].filter(
        (id) => (remaining.get(id) ?? 0) > 0
    );

    const totalDue = targets.reduce((sum, id) => sum + (remaining.get(id) ?? 0), 0);

    if (targets.length === 0) {
        return { ok: false, reason: "no_debt" };
    }

    if (cleanPaid > totalDue) {
        return { ok: false, reason: "too_much", due: totalDue };
    }

    const now = new Date().toISOString();
    const applied: { saleId: string; amount: number }[] = [];
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

export type CancelCreditPaymentResult =
    | { ok: true }
    | { ok: false; reason: "not_found" | "already_cancelled" | "storage" };

/** Annule un paiement saisi par erreur : il reste visible, barré. */
export function cancelCreditPayment(paymentId: string): CancelCreditPaymentResult {
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
export function getClientPayments(client: Client, limit = 5): CreditPayment[] {
    const name = client.name.trim().toLowerCase();

    const ids = new Set(
        getSales()
            .filter(
                (sale) =>
                    sale.customerId === client.id ||
                    (sale.borrowerName !== null &&
                        sale.borrowerName.trim().toLowerCase() === name)
            )
            .map((sale) => sale.id)
    );

    return getCreditPayments()
        .filter((payment) => ids.has(payment.saleId) && !payment.cancelledAt)
        .sort(
            (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, Math.max(0, limit));
}


/* ========================================
   RÉGLAGES DE LA BOUTIQUE (nom + téléphone des reçus)
======================================== */

export interface ShopSettings {
    name: string;
    phone: string;
}

const SHOP_KEY = "ejden_shop";

export const SHOP_LIMITS = { nameMax: 60, phoneMax: 20 } as const;

// Chiffres, +, espaces, tirets, points, parenthèses uniquement.
const PHONE_PATTERN = /^[0-9+().\-\s]*$/;

export function isValidPhone(value: string): boolean {
    return value.length <= SHOP_LIMITS.phoneMax && PHONE_PATTERN.test(value);
}

function cleanShopText(value: unknown, max: number): string {
    return typeof value === "string"
        // eslint-disable-next-line no-control-regex
        ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max)
        : "";
}

export function getShopSettings(): ShopSettings {
    try {
        const stored = localStorage.getItem(SHOP_KEY);

        if (stored) {
            const parsed: unknown = JSON.parse(stored);

            if (typeof parsed === "object" && parsed !== null) {
                const data = parsed as Record<string, unknown>;
                const phone = cleanShopText(data.phone, SHOP_LIMITS.phoneMax);

                return {
                    name: cleanShopText(data.name, SHOP_LIMITS.nameMax),
                    phone: isValidPhone(phone) ? phone : ""
                };
            }
        }
    } catch (error) {
        console.error("Impossible de lire les réglages de la boutique.", error);
    }

    return { name: "", phone: "" };
}

export function saveShopSettings(settings: ShopSettings): boolean {
    const name = cleanShopText(settings.name, SHOP_LIMITS.nameMax);
    const phone = cleanShopText(settings.phone, SHOP_LIMITS.phoneMax);

    // Contrôle sur le texte d'origine : un numéro trop long est refusé,
    // pas coupé en silence.
    if (
        typeof settings.phone !== "string" ||
        settings.phone.trim().length > SHOP_LIMITS.phoneMax ||
        !isValidPhone(phone)
    ) {
        return false;
    }

    try {
        localStorage.setItem(SHOP_KEY, JSON.stringify({ name, phone }));
        return true;
    } catch (error) {
        console.error("Impossible d'enregistrer les réglages.", error);
        return false;
    }
}


/* ========================================
   PROFIL DE L'UTILISATEUR (prénom, nom, téléphone)
   Ces informations servent à saluer l'utilisateur dans l'application.
   Elles ne sont JAMAIS utilisées sur les reçus : seules les
   informations de l'entreprise (ShopSettings) le sont.
======================================== */

export interface UserProfile {
    firstName: string;
    lastName: string;
    phone: string;
}

const USER_KEY = "ejden_user";

export const USER_LIMITS = { nameMax: 40, phoneMax: 20 } as const;

export function getUserProfile(): UserProfile {
    const empty: UserProfile = { firstName: "", lastName: "", phone: "" };

    try {
        const stored = localStorage.getItem(USER_KEY);

        if (!stored) {
            return empty;
        }

        const parsed: unknown = JSON.parse(stored);

        if (typeof parsed !== "object" || parsed === null) {
            return empty;
        }

        const data = parsed as Record<string, unknown>;
        const phone = cleanShopText(data.phone, USER_LIMITS.phoneMax);

        return {
            firstName: cleanShopText(data.firstName, USER_LIMITS.nameMax),
            lastName: cleanShopText(data.lastName, USER_LIMITS.nameMax),
            phone: isValidPhone(phone) ? phone : ""
        };
    } catch (error) {
        console.error("Impossible de lire le profil de l'utilisateur.", error);

        return empty;
    }
}

export function saveUserProfile(profile: UserProfile): boolean {
    const raw = [profile.firstName, profile.lastName, profile.phone];

    if (raw.some((value) => typeof value !== "string")) {
        return false;
    }

    // Contrôle sur le texte d'origine : trop long = refusé, pas coupé.
    if (
        profile.firstName.trim().length > USER_LIMITS.nameMax ||
        profile.lastName.trim().length > USER_LIMITS.nameMax ||
        profile.phone.trim().length > USER_LIMITS.phoneMax
    ) {
        return false;
    }

    const clean: UserProfile = {
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
    } catch (error) {
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
} as const;

/** Texte sûr : sans caractères de contrôle, coupé à la limite. */
function cleanLabel(value: unknown, max: number): string {
    return typeof value === "string"
        // eslint-disable-next-line no-control-regex
        ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
        : "";
}

/** Montant en FCFA : entier, > 0, borné. Sinon null. */
export function cleanAmount(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }

    const rounded = Math.round(value);

    return rounded > 0 && rounded <= MODULE_LIMITS.amountMax ? rounded : null;
}

function validDate(value: unknown): string | null {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
        ? value
        : null;
}


/* ========================================
   CLIENTS
======================================== */

export interface Client {
    id: string;
    name: string;
    phone: string;
    createdAt: string;
}

const CLIENTS_KEY = "ejden_clients";

export function normalizeClient(value: unknown): Client | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const c = value as Record<string, unknown>;
    const name = cleanLabel(c.name, MODULE_LIMITS.textMax);
    const phone = cleanLabel(c.phone, MODULE_LIMITS.phoneMax);
    const createdAt = validDate(c.createdAt);

    if (
        typeof c.id !== "string" ||
        c.id === "" ||
        c.id.length > 100 ||
        name === "" ||
        createdAt === null ||
        !isValidPhone(phone)
    ) {
        return null;
    }

    return { id: c.id, name, phone, createdAt };
}

export function getClients(): Client[] {
    return readList(CLIENTS_KEY, normalizeClient, "les clients");
}

export function getClientById(clientId: string): Client | null {
    return getClients().find((client) => client.id === clientId) ?? null;
}

/** Deux clients ne peuvent pas porter exactement le même nom. */
export function clientNameExists(name: string, exceptId?: string): boolean {
    const wanted = name.trim().toLowerCase();

    return getClients().some(
        (client) =>
            client.id !== exceptId && client.name.toLowerCase() === wanted
    );
}

export function addClient(client: Client): boolean {
    const clean = normalizeClient(client);

    if (!clean) {
        return false;
    }

    const clients = getClients();

    clients.push(clean);

    return writeList(CLIENTS_KEY, clients, "les clients");
}

export function updateClient(client: Client): boolean {
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
export function deleteClient(clientId: string): boolean {
    const clients = getClients();
    const remaining = clients.filter((client) => client.id !== clientId);

    if (remaining.length === clients.length) {
        return false;
    }

    return writeList(CLIENTS_KEY, remaining, "les clients");
}

export interface ClientDebt {
    amount: number;
    // Ventes à crédit non soldées (récentes d'abord).
    sales: Sale[];
}

/**
 * Ce que doit un client : ventes non annulées avec un reste à payer,
 * reliées par l'identifiant client ou, à défaut, par le nom du débiteur.
 */
export function getClientDebt(client: Client): ClientDebt {
    const name = client.name.toLowerCase();

    const allSales = getSales();
    const remaining = getRemainingMap(allSales);

    const sales = allSales
        .filter(
            (sale) =>
                (remaining.get(sale.id) ?? 0) > 0 &&
                (sale.customerId === client.id ||
                    (sale.borrowerName !== null &&
                        sale.borrowerName.trim().toLowerCase() === name))
        )
        .sort(
            (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
        );

    return {
        amount: sales.reduce(
            (sum, sale) => sum + (remaining.get(sale.id) ?? 0),
            0
        ),
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
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["id"];

export interface Expense {
    id: string;
    label: string;
    amount: number;
    category: ExpenseCategory;
    createdAt: string;
}

const EXPENSES_KEY = "ejden_expenses";

function isExpenseCategory(value: unknown): value is ExpenseCategory {
    return EXPENSE_CATEGORIES.some((category) => category.id === value);
}

export function normalizeExpense(value: unknown): Expense | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const e = value as Record<string, unknown>;
    const label = cleanLabel(e.label, MODULE_LIMITS.textMax);
    const amount = cleanAmount(e.amount);
    const createdAt = validDate(e.createdAt);

    if (
        typeof e.id !== "string" ||
        e.id === "" ||
        e.id.length > 100 ||
        label === "" ||
        amount === null ||
        createdAt === null ||
        !isExpenseCategory(e.category)
    ) {
        return null;
    }

    return { id: e.id, label, amount, category: e.category, createdAt };
}

export function getExpenses(): Expense[] {
    return readList(EXPENSES_KEY, normalizeExpense, "les dépenses");
}

export function addExpense(expense: Expense): boolean {
    const clean = normalizeExpense(expense);

    if (!clean) {
        return false;
    }

    const expenses = getExpenses();

    expenses.push(clean);

    return writeList(EXPENSES_KEY, expenses, "les dépenses");
}

export function deleteExpense(expenseId: string): boolean {
    const expenses = getExpenses();
    const remaining = expenses.filter((item) => item.id !== expenseId);

    if (remaining.length === expenses.length) {
        return false;
    }

    return writeList(EXPENSES_KEY, remaining, "les dépenses");
}

export function getExpensesTotals(now: Date = new Date()): {
    today: number;
    month: number;
} {
    let today = 0;
    let month = 0;

    for (const expense of getExpenses()) {
        const date = new Date(expense.createdAt);

        if (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
        ) {
            month += expense.amount;

            if (date.getDate() === now.getDate()) {
                today += expense.amount;
            }
        }
    }

    return { today, month };
}


/* ========================================
   CAISSE
   Solde = argent encaissé sur les ventes (non annulées)
         + entrées manuelles − sorties manuelles − dépenses.
======================================== */

export interface CashEntry {
    id: string;
    type: "in" | "out";
    amount: number;
    reason: string;
    createdAt: string;
}

const CASH_KEY = "ejden_cash";

export function normalizeCashEntry(value: unknown): CashEntry | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const c = value as Record<string, unknown>;
    const reason = cleanLabel(c.reason, MODULE_LIMITS.textMax);
    const amount = cleanAmount(c.amount);
    const createdAt = validDate(c.createdAt);

    if (
        typeof c.id !== "string" ||
        c.id === "" ||
        c.id.length > 100 ||
        (c.type !== "in" && c.type !== "out") ||
        reason === "" ||
        amount === null ||
        createdAt === null
    ) {
        return null;
    }

    return { id: c.id, type: c.type, amount, reason, createdAt };
}

export function getCashEntries(): CashEntry[] {
    return readList(CASH_KEY, normalizeCashEntry, "les mouvements de caisse");
}

export function addCashEntry(entry: CashEntry): boolean {
    const clean = normalizeCashEntry(entry);

    if (!clean) {
        return false;
    }

    const entries = getCashEntries();

    entries.push(clean);

    return writeList(CASH_KEY, entries, "les mouvements de caisse");
}

export function deleteCashEntry(entryId: string): boolean {
    const entries = getCashEntries();
    const remaining = entries.filter((item) => item.id !== entryId);

    if (remaining.length === entries.length) {
        return false;
    }

    return writeList(CASH_KEY, remaining, "les mouvements de caisse");
}

export type CashSource =
    | "sale"
    | "credit_payment"
    | "entry"
    | "exit"
    | "expense"
    | "purchase"
    | "supplier_payment"
    | "invoice_payment";

export interface CashMovement {
    id: string;
    source: CashSource;
    // Positif = entrée d'argent, négatif = sortie.
    amount: number;
    label: string;
    createdAt: string;
    // Pour une vente : mode de paiement.
    method?: PaymentMethod;
    // Pour une entrée/sortie manuelle ou une dépense : supprimable.
    deletableId?: string;
}

export interface CashSummary {
    balance: number;
    todayIn: number;
    todayOut: number;
    // Argent encaissé sur les ventes, par mode de paiement.
    salesByMethod: Record<PaymentMethod, number>;
    // Les plus récents d'abord.
    movements: CashMovement[];
}

export function getCashSummary(now: Date = new Date()): CashSummary {
    const movements: CashMovement[] = [];

    const salesByMethod: Record<PaymentMethod, number> = {
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

    // Paiements de factures émises : entrées de caisse (date du paiement).
    for (const invoice of getInvoices()) {
        if (invoice.status !== "issued") {
            continue;
        }

        for (const payment of invoice.payments) {
            salesByMethod[payment.method] += payment.amount;

            movements.push({
                id: `invoice-payment-${invoice.id}-${payment.id}`,
                source: "invoice_payment",
                amount: payment.amount,
                label: `Facture ${invoice.number} · ${invoice.clientName}`,
                createdAt: invoicePaymentTime(payment),
                method: payment.method
            });
        }
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
    const purchasesById = new Map(
        purchases.map((purchase) => [purchase.id, purchase])
    );

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

    movements.sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    let balance = 0;
    let todayIn = 0;
    let todayOut = 0;

    for (const movement of movements) {
        balance += movement.amount;

        if (isSameLocalDay(new Date(movement.createdAt), now)) {
            if (movement.amount > 0) {
                todayIn += movement.amount;
            } else {
                todayOut += -movement.amount;
            }
        }
    }

    return { balance, todayIn, todayOut, salesByMethod, movements };
}


/* ========================================
   PROGRESSION DES VENTES
   Chiffre d'affaires (ventes non annulées) par jour ou par mois,
   comparé à la période précédente de même durée.
======================================== */

export type SalesPeriod = "7d" | "30d" | "12m";

export interface SalesBucket {
    // Début du jour ou du mois (heure locale).
    start: Date;
    value: number;
    count: number;
}

export interface SalesTrend {
    buckets: SalesBucket[];
    total: number;
    count: number;
    previousTotal: number;
}

/** Variation en % entre deux totaux (null si la base est nulle). */
export function percentChange(current: number, previous: number): number | null {
    if (previous <= 0) {
        return null;
    }

    return Math.round(((current - previous) / previous) * 100);
}

export function getSalesTrend(
    period: SalesPeriod,
    now: Date = new Date()
): SalesTrend {
    const byMonth = period === "12m";
    const length = period === "7d" ? 7 : period === "30d" ? 30 : 12;

    // Début de chaque tranche, du plus ancien au plus récent.
    const buckets: SalesBucket[] = [];

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
    const indexOf = (date: Date): number =>
        byMonth
            ? date.getFullYear() * 12 +
              date.getMonth() -
              (first.getFullYear() * 12 + first.getMonth())
            : Math.round(
                  (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
                      Date.UTC(
                          first.getFullYear(),
                          first.getMonth(),
                          first.getDate()
                      )) /
                      86_400_000
              );

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
        } else if (index < 0 && index >= -length) {
            previousTotal += sale.total;
        }
    }

    return { buckets, total, count, previousTotal };
}


/* ========================================
   STOCK : MOUVEMENTS, INVENTAIRE, VALEUR
   Entrées, sorties et inventaires sont enregistrés ici.
   Les ventes (et leurs annulations) sont relues depuis les ventes :
   aucune double écriture, l'historique reste toujours cohérent.
======================================== */

export type StockMovementType = "in" | "out" | "adjust";

export const STOCK_REASONS: Record<StockMovementType, readonly string[]> = {
    in: ["Réapprovisionnement", "Retour client", "Autre"],
    out: ["Perte", "Casse", "Produit périmé", "Usage personnel", "Autre"],
    adjust: ["Inventaire"]
};

export interface StockMovement {
    id: string;
    productId: string;
    // Gardé : l'historique reste lisible même si le produit est supprimé.
    productName: string;
    type: StockMovementType;
    // Variation signée (+ entrée, − sortie).
    quantity: number;
    before: number;
    after: number;
    reason: string;
    createdAt: string;
}

const STOCK_MOVEMENTS_KEY = "ejden_stock_movements";
const STOCK_MOVEMENTS_KEPT = 2000;

function isStockQuantity(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= LIMITS.stockMax
    );
}

export function normalizeStockMovement(value: unknown): StockMovement | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const m = value as Record<string, unknown>;
    const productName = cleanLabel(m.productName, LIMITS.nameMax);
    const reason = cleanLabel(m.reason, MODULE_LIMITS.textMax);
    const createdAt = validDate(m.createdAt);

    if (
        typeof m.id !== "string" ||
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
        m.after - m.before !== m.quantity
    ) {
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

export function getStockMovements(): StockMovement[] {
    return readList(
        STOCK_MOVEMENTS_KEY,
        normalizeStockMovement,
        "les mouvements de stock"
    );
}

export type StockMovementResult =
    | { ok: true; movement: StockMovement }
    | {
          ok: false;
          reason:
              | "not_found"
              | "invalid_quantity"
              | "too_much"
              | "too_high"
              | "unchanged"
              | "invalid_reason"
              | "storage";
      };

/**
 * Entrée (+), sortie (−) ou inventaire (stock compté = quantité donnée).
 * Le stock du produit et l'historique sont écrits ensemble : si la
 * seconde écriture échoue, le stock est remis comme avant.
 */
export function recordStockMovement(
    productId: string,
    type: StockMovementType,
    quantity: number,
    reason: string
): StockMovementResult {
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

    if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < (type === "adjust" ? 0 : 1)
    ) {
        return { ok: false, reason: "invalid_quantity" };
    }

    let after: number;

    if (type === "in") {
        after = product.stock + quantity;

        if (after > LIMITS.stockMax) {
            return { ok: false, reason: "too_high" };
        }
    } else if (type === "out") {
        if (quantity > product.stock) {
            return { ok: false, reason: "too_much" };
        }

        after = product.stock - quantity;
    } else {
        if (quantity > LIMITS.stockMax) {
            return { ok: false, reason: "too_high" };
        }

        after = quantity;

        if (after === product.stock) {
            return { ok: false, reason: "unchanged" };
        }
    }

    const movement: StockMovement = {
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

    const movements = [...getStockMovements(), movement].slice(
        -STOCK_MOVEMENTS_KEPT
    );

    if (!writeList(STOCK_MOVEMENTS_KEY, movements, "les mouvements de stock")) {
        saveProducts(originalProducts);
        return { ok: false, reason: "storage" };
    }

    return { ok: true, movement };
}

export interface StockHistoryEntry {
    id: string;
    productId: string;
    productName: string;
    // Variation signée (+ entrée, − sortie).
    delta: number;
    label: string;
    source:
        | "manual"
        | "sale"
        | "sale_cancel"
        | "purchase"
        | "purchase_cancel";
    createdAt: string;
    // Stock après le mouvement (mouvements manuels seulement).
    after?: number;
}

/**
 * Historique complet, du plus récent au plus ancien : mouvements
 * enregistrés + ventes + annulations de ventes.
 */
export function getStockHistory(productId?: string): StockHistoryEntry[] {
    const entries: StockHistoryEntry[] = [];

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

    return entries.sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export interface StockValue {
    // Ce que le stock a coûté (prix d'achat).
    cost: number;
    // Ce qu'il rapporterait au prix de vente.
    retail: number;
}

export function getStockValue(): StockValue {
    let cost = 0;
    let retail = 0;

    for (const product of getProducts()) {
        cost += product.stock * product.purchasePrice;
        retail += product.stock * product.salePrice;
    }

    return { cost, retail };
}



/* ========================================
   FOURNISSEURS
======================================== */

export interface Supplier {
    id: string;
    name: string;
    phone: string;
    createdAt: string;
}

const SUPPLIERS_KEY = "ejden_suppliers";

export function normalizeSupplier(value: unknown): Supplier | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const c = value as Record<string, unknown>;
    const name = cleanLabel(c.name, MODULE_LIMITS.textMax);
    const phone = cleanLabel(c.phone, MODULE_LIMITS.phoneMax);
    const createdAt = validDate(c.createdAt);

    if (
        typeof c.id !== "string" ||
        c.id === "" ||
        c.id.length > 100 ||
        name === "" ||
        createdAt === null ||
        !isValidPhone(phone)
    ) {
        return null;
    }

    return { id: c.id, name, phone, createdAt };
}

export function getSuppliers(): Supplier[] {
    return readList(SUPPLIERS_KEY, normalizeSupplier, "les fournisseurs");
}

export function getSupplierById(supplierId: string): Supplier | null {
    return getSuppliers().find((item) => item.id === supplierId) ?? null;
}

export function supplierNameExists(name: string, exceptId?: string): boolean {
    const wanted = name.trim().toLowerCase();

    return getSuppliers().some(
        (item) => item.id !== exceptId && item.name.toLowerCase() === wanted
    );
}

export function addSupplier(supplier: Supplier): boolean {
    const clean = normalizeSupplier(supplier);

    if (!clean) {
        return false;
    }

    const suppliers = getSuppliers();

    suppliers.push(clean);

    return writeList(SUPPLIERS_KEY, suppliers, "les fournisseurs");
}

export function updateSupplier(supplier: Supplier): boolean {
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

export type DeleteSupplierResult =
    | { ok: true }
    | { ok: false; reason: "not_found" | "has_debt" | "storage" };

/**
 * Supprime la fiche. Refusé tant qu'on lui doit de l'argent.
 * Les achats déjà faits restent dans l'historique (nom conservé).
 */
export function deleteSupplier(supplierId: string): DeleteSupplierResult {
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


/* ========================================
   ACHATS FOURNISSEURS
   Un achat augmente le stock des produits livrés. Ce qui n'est pas
   payé à la livraison devient une dette envers le fournisseur.
======================================== */

export interface PurchaseItem {
    productId: string;
    productName: string;
    quantity: number;
    // Prix d'achat unitaire de cette livraison.
    unitCost: number;
}

export interface Purchase {
    id: string;
    supplierId: string;
    // Gardé : l'historique reste lisible si la fiche est supprimée.
    supplierName: string;
    items: PurchaseItem[];
    total: number;
    // Payé à la livraison (le reste est dû).
    paid: number;
    note: string;
    createdAt: string;
    cancelledAt?: string;
}

const PURCHASES_KEY = "ejden_purchases";
const PURCHASE_ITEMS_MAX = 50;

function normalizePurchaseItem(value: unknown): PurchaseItem | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const i = value as Record<string, unknown>;
    const productName = cleanLabel(i.productName, LIMITS.nameMax);
    const unitCost = cleanAmount(i.unitCost);

    if (
        typeof i.productId !== "string" ||
        i.productId === "" ||
        i.productId.length > 100 ||
        productName === "" ||
        unitCost === null ||
        typeof i.quantity !== "number" ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > LIMITS.stockMax
    ) {
        return null;
    }

    return { productId: i.productId, productName, quantity: i.quantity, unitCost };
}

export function normalizePurchase(value: unknown): Purchase | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const p = value as Record<string, unknown>;
    const supplierName = cleanLabel(p.supplierName, MODULE_LIMITS.textMax);
    const createdAt = validDate(p.createdAt);

    if (
        typeof p.id !== "string" ||
        p.id === "" ||
        p.id.length > 100 ||
        typeof p.supplierId !== "string" ||
        p.supplierId === "" ||
        p.supplierId.length > 100 ||
        supplierName === "" ||
        createdAt === null ||
        !Array.isArray(p.items) ||
        p.items.length < 1 ||
        p.items.length > PURCHASE_ITEMS_MAX
    ) {
        return null;
    }

    const items: PurchaseItem[] = [];

    for (const entry of p.items) {
        const item = normalizePurchaseItem(entry);

        if (!item) {
            return null;
        }

        items.push(item);
    }

    const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

    if (
        p.total !== total ||
        typeof p.paid !== "number" ||
        !Number.isInteger(p.paid) ||
        p.paid < 0 ||
        p.paid > total
    ) {
        return null;
    }

    const purchase: Purchase = {
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

export function getPurchases(): Purchase[] {
    return readList(PURCHASES_KEY, normalizePurchase, "les achats");
}

export interface PurchaseInput {
    supplierId: string;
    items: Array<{ productId: string; quantity: number; unitCost: number }>;
    paid: number;
    note: string;
    // Met à jour le prix d'achat des produits avec celui de cette livraison.
    updatePrices: boolean;
}

export type RecordPurchaseResult =
    | { ok: true; purchase: Purchase }
    | {
          ok: false;
          reason:
              | "supplier_not_found"
              | "no_items"
              | "invalid_item"
              | "unknown_product"
              | "duplicate_product"
              | "invalid_paid"
              | "too_high"
              | "storage";
      };

export function recordPurchase(input: PurchaseInput): RecordPurchaseResult {
    const supplier = getSupplierById(input.supplierId);

    if (!supplier) {
        return { ok: false, reason: "supplier_not_found" };
    }

    if (input.items.length < 1 || input.items.length > PURCHASE_ITEMS_MAX) {
        return { ok: false, reason: "no_items" };
    }

    const products = getProducts();
    const originalProducts = products.map((item) => ({ ...item }));
    const seen = new Set<string>();
    const items: PurchaseItem[] = [];

    for (const line of input.items) {
        const unitCost = cleanAmount(line.unitCost);

        if (
            typeof line.quantity !== "number" ||
            !Number.isInteger(line.quantity) ||
            line.quantity < 1 ||
            unitCost === null
        ) {
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

    if (
        typeof input.paid !== "number" ||
        !Number.isInteger(input.paid) ||
        input.paid < 0 ||
        input.paid > total
    ) {
        return { ok: false, reason: "invalid_paid" };
    }

    const purchase: Purchase = {
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

export type CancelPurchaseResult =
    | { ok: true; missingProducts: number }
    | {
          ok: false;
          reason:
              | "not_found"
              | "already_cancelled"
              | "has_payments"
              | "stock_used"
              | "storage";
          // Produit dont le stock ne permet plus de retirer la livraison.
          productName?: string;
      };

/**
 * Annule un achat : le stock livré est retiré (seulement s'il est encore
 * en rayon), l'argent payé à la livraison sort des dépenses de caisse.
 * Refusé si des paiements ont déjà été faits dessus : annulez-les d'abord.
 */
export function cancelPurchase(purchaseId: string): CancelPurchaseResult {
    const purchases = getPurchases();
    const index = purchases.findIndex((item) => item.id === purchaseId);

    if (index === -1) {
        return { ok: false, reason: "not_found" };
    }

    const purchase = purchases[index];

    if (purchase.cancelledAt) {
        return { ok: false, reason: "already_cancelled" };
    }

    if (
        getSupplierPayments().some(
            (payment) => payment.purchaseId === purchase.id && !payment.cancelledAt
        )
    ) {
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


/* ========================================
   DETTES ENVERS LES FOURNISSEURS
   Reste dû sur un achat = total − payé à la livraison − paiements
   non annulés. L'achat d'origine n'est jamais modifié.
======================================== */

export interface SupplierPayment {
    id: string;
    // Les paiements créés ensemble (un versement) partagent le même lot.
    batchId: string;
    purchaseId: string;
    supplierId: string;
    amount: number;
    method: CreditPaymentMethod;
    createdAt: string;
    cancelledAt?: string;
}

const SUPPLIER_PAYMENTS_KEY = "ejden_supplier_payments";

export function normalizeSupplierPayment(value: unknown): SupplierPayment | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const p = value as Record<string, unknown>;
    const amount = cleanAmount(p.amount);
    const createdAt = validDate(p.createdAt);
    const text = (v: unknown): v is string =>
        typeof v === "string" && v !== "" && v.length <= 100;

    if (
        !text(p.id) ||
        !text(p.batchId) ||
        !text(p.purchaseId) ||
        !text(p.supplierId) ||
        !isCreditPaymentMethod(p.method) ||
        amount === null ||
        createdAt === null
    ) {
        return null;
    }

    const payment: SupplierPayment = {
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

export function getSupplierPayments(): SupplierPayment[] {
    return readList(
        SUPPLIER_PAYMENTS_KEY,
        normalizeSupplierPayment,
        "les paiements fournisseurs"
    );
}

/** Reste dû par achat (achats non annulés seulement). */
export function getPurchaseRemainingMap(
    purchases: Purchase[] = getPurchases(),
    payments: SupplierPayment[] = getSupplierPayments()
): Map<string, number> {
    const paid = new Map<string, number>();

    for (const payment of payments) {
        if (!payment.cancelledAt) {
            paid.set(
                payment.purchaseId,
                (paid.get(payment.purchaseId) ?? 0) + payment.amount
            );
        }
    }

    const remaining = new Map<string, number>();

    for (const purchase of purchases) {
        if (!purchase.cancelledAt) {
            remaining.set(
                purchase.id,
                Math.max(
                    0,
                    purchase.total - purchase.paid - (paid.get(purchase.id) ?? 0)
                )
            );
        }
    }

    return remaining;
}

export interface SupplierDebt {
    amount: number;
    // Achats encore à payer, du plus ancien au plus récent.
    purchases: Array<{ purchase: Purchase; remaining: number }>;
}

export function getSupplierDebt(supplierId: string): SupplierDebt {
    const purchases = getPurchases();
    const remaining = getPurchaseRemainingMap(purchases);

    const open = purchases
        .filter(
            (purchase) =>
                purchase.supplierId === supplierId &&
                (remaining.get(purchase.id) ?? 0) > 0
        )
        .sort(
            (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
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
export function getSuppliersDebtTotal(): number {
    let total = 0;

    for (const value of getPurchaseRemainingMap().values()) {
        total += value;
    }

    return total;
}

export type SupplierPaymentResult =
    | { ok: true }
    | {
          ok: false;
          reason: "invalid_amount" | "invalid_method" | "no_debt" | "too_much" | "storage";
          // Pour « too_much » : ce qui est réellement dû.
          debt?: number;
      };

/**
 * Paiement au fournisseur, appliqué d'abord à ses achats les plus
 * anciens. Écrit en une seule fois : tout ou rien.
 */
export function recordSupplierPayment(
    supplierId: string,
    amount: number,
    method: CreditPaymentMethod
): SupplierPaymentResult {
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
    const created: SupplierPayment[] = [];
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

    return writeList(
        SUPPLIER_PAYMENTS_KEY,
        [...getSupplierPayments(), ...created],
        "les paiements fournisseurs"
    )
        ? { ok: true }
        : { ok: false, reason: "storage" };
}

export interface SupplierPaymentBatch {
    batchId: string;
    amount: number;
    method: CreditPaymentMethod;
    createdAt: string;
    cancelledAt?: string;
}

/** Versements d'un fournisseur (regroupés), du plus récent au plus ancien. */
export function getSupplierPaymentBatches(supplierId: string): SupplierPaymentBatch[] {
    const batches = new Map<string, SupplierPaymentBatch>();

    for (const payment of getSupplierPayments()) {
        if (payment.supplierId !== supplierId) {
            continue;
        }

        const existing = batches.get(payment.batchId);

        if (existing) {
            existing.amount += payment.amount;
        } else {
            batches.set(payment.batchId, {
                batchId: payment.batchId,
                amount: payment.amount,
                method: payment.method,
                createdAt: payment.createdAt,
                cancelledAt: payment.cancelledAt
            });
        }
    }

    return [...batches.values()].sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export type CancelSupplierPaymentResult =
    | { ok: true }
    | { ok: false; reason: "not_found" | "already_cancelled" | "storage" };

/** Annule un versement entier : la dette remonte, la caisse est corrigée. */
export function cancelSupplierPayment(batchId: string): CancelSupplierPaymentResult {
    const payments = getSupplierPayments();
    const batch = payments.filter((payment) => payment.batchId === batchId);

    if (batch.length === 0) {
        return { ok: false, reason: "not_found" };
    }

    if (batch.every((payment) => payment.cancelledAt)) {
        return { ok: false, reason: "already_cancelled" };
    }

    const now = new Date().toISOString();

    const updated = payments.map((payment) =>
        payment.batchId === batchId && !payment.cancelledAt
            ? { ...payment, cancelledAt: now }
            : payment
    );

    return writeList(SUPPLIER_PAYMENTS_KEY, updated, "les paiements fournisseurs")
        ? { ok: true }
        : { ok: false, reason: "storage" };
}


/* ========================================
   COMMANDES (clients et fournisseurs)
   Une commande réserve une demande avant qu'elle soit livrée :
   - commande client : « Livrer » crée une vente (stock diminué, caisse)
   - commande fournisseur : « Réceptionner » crée un achat (stock augmenté)
   Tant qu'elle n'est pas livrée/reçue, elle n'a aucun effet sur le
   stock ni sur la caisse.
======================================== */

export type OrderKind = "customer" | "supplier";
export type OrderStatus = "pending" | "ready" | "completed" | "cancelled";

export interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    // Prix de vente (commande client) ou prix d'achat (commande fournisseur).
    unitPrice: number;
}

export interface Order {
    id: string;
    kind: OrderKind;
    // Client ou fournisseur enregistré ; null = client de passage.
    partyId: string | null;
    // Gardé : l'historique reste lisible si la fiche est supprimée.
    partyName: string;
    items: OrderItem[];
    total: number;
    note: string;
    // Date de livraison prévue (AAAA-MM-JJ), ou null.
    expectedDate: string | null;
    status: OrderStatus;
    createdAt: string;
    completedAt?: string;
    cancelledAt?: string;
    // Vente (commande client) ou achat (commande fournisseur) créé à la fin.
    linkId?: string;
}

const ORDERS_KEY = "ejden_orders";
const ORDER_ITEMS_MAX = 50;
export const WALK_IN_CLIENT = "Client de passage";

function normalizeOrderItem(value: unknown): OrderItem | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const i = value as Record<string, unknown>;
    const productName = cleanLabel(i.productName, LIMITS.nameMax);
    const unitPrice = cleanAmount(i.unitPrice);

    if (
        typeof i.productId !== "string" ||
        i.productId === "" ||
        i.productId.length > 100 ||
        productName === "" ||
        unitPrice === null ||
        typeof i.quantity !== "number" ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > LIMITS.stockMax
    ) {
        return null;
    }

    return { productId: i.productId, productName, quantity: i.quantity, unitPrice };
}

export function normalizeOrder(value: unknown): Order | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const o = value as Record<string, unknown>;
    const partyName = cleanLabel(o.partyName, MODULE_LIMITS.textMax);
    const createdAt = validDate(o.createdAt);

    if (
        typeof o.id !== "string" ||
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
        o.items.length > ORDER_ITEMS_MAX
    ) {
        return null;
    }

    // Une commande fournisseur a toujours un fournisseur enregistré ;
    // « prête » n'existe que pour les commandes clients.
    if (o.kind === "supplier" && (o.partyId === null || o.status === "ready")) {
        return null;
    }

    const items: OrderItem[] = [];

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

    const order: Order = {
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

export function getOrders(): Order[] {
    return readList(ORDERS_KEY, normalizeOrder, "les commandes");
}

export interface OrderInput {
    kind: OrderKind;
    partyId: string | null;
    items: Array<{ productId: string; quantity: number; unitPrice: number }>;
    note: string;
    expectedDate: string | null;
}

export type OrderResult =
    | { ok: true; order: Order }
    | {
          ok: false;
          reason:
              | "party_not_found"
              | "party_required"
              | "no_items"
              | "invalid_item"
              | "unknown_product"
              | "duplicate_product"
              | "too_high"
              | "invalid_date"
              | "storage";
      };

export function addOrder(input: OrderInput): OrderResult {
    if (input.kind !== "customer" && input.kind !== "supplier") {
        return { ok: false, reason: "party_required" };
    }

    // --- Client ou fournisseur ---
    let partyName: string = WALK_IN_CLIENT;
    let partyId: string | null = null;

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
    } else if (input.partyId) {
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
    const seen = new Set<string>();
    const items: OrderItem[] = [];

    for (const line of input.items) {
        const unitPrice = cleanAmount(line.unitPrice);

        if (
            typeof line.quantity !== "number" ||
            !Number.isInteger(line.quantity) ||
            line.quantity < 1 ||
            line.quantity > LIMITS.stockMax ||
            unitPrice === null
        ) {
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

    const order: Order = {
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

export type OrderChangeResult =
    | { ok: true }
    | { ok: false; reason: "not_found" | "not_allowed" | "storage" };

function changeOrder(
    orderId: string,
    allowed: (order: Order) => boolean,
    change: (order: Order) => Order
): OrderChangeResult {
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
export function markOrderReady(orderId: string): OrderChangeResult {
    return changeOrder(
        orderId,
        (order) => order.kind === "customer" && order.status === "pending",
        (order) => ({ ...order, status: "ready" })
    );
}

/** Annule une commande en cours : aucun effet sur le stock ni la caisse. */
export function cancelOrder(orderId: string): OrderChangeResult {
    return changeOrder(
        orderId,
        (order) => order.status === "pending" || order.status === "ready",
        (order) => ({
            ...order,
            status: "cancelled",
            cancelledAt: new Date().toISOString()
        })
    );
}

export type CompleteOrderResult =
    | { ok: true; linkId: string }
    | {
          ok: false;
          reason:
              | "not_found"
              | "not_allowed"
              | "invalid_amount"
              | "invalid_method"
              | "credit_needs_client"
              | "stock"
              | "storage"
              | RecordPurchaseFailure;
          // Produit en cause pour « stock ».
          productName?: string;
      };

type RecordPurchaseFailure = Extract<RecordPurchaseResult, { ok: false }>["reason"];

function findOpenOrder(orderId: string, kind: OrderKind): Order | "not_found" | "not_allowed" {
    const order = getOrders().find((item) => item.id === orderId);

    if (!order) {
        return "not_found";
    }

    return order.kind === kind && (order.status === "pending" || order.status === "ready")
        ? order
        : "not_allowed";
}

function markOrderCompleted(orderId: string, linkId: string): boolean {
    return changeOrder(
        orderId,
        () => true,
        (order) => ({
            ...order,
            status: "completed",
            completedAt: new Date().toISOString(),
            linkId
        })
    ).ok;
}

/**
 * Livre une commande client : crée la vente (stock diminué, argent en
 * caisse). Si le client paie moins que le total, le reste devient un
 * crédit (client enregistré obligatoire).
 */
export function completeCustomerOrder(
    orderId: string,
    paymentMethod: CreditPaymentMethod,
    amountPaid: number
): CompleteOrderResult {
    const found = findOpenOrder(orderId, "customer");

    if (typeof found === "string") {
        return { ok: false, reason: found };
    }

    const order = found;

    if (!isCreditPaymentMethod(paymentMethod)) {
        return { ok: false, reason: "invalid_method" };
    }

    if (
        typeof amountPaid !== "number" ||
        !Number.isInteger(amountPaid) ||
        amountPaid < 0 ||
        amountPaid > order.total
    ) {
        return { ok: false, reason: "invalid_amount" };
    }

    const onCredit = amountPaid < order.total;

    if (onCredit && order.partyId === null) {
        return { ok: false, reason: "credit_needs_client" };
    }

    const products = getProducts();
    const items: SaleItem[] = order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        unitCost: products.find((product) => product.id === item.productId)?.purchasePrice,
        quantity: item.quantity,
        total: item.quantity * item.unitPrice
    }));

    const sale: Sale = {
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
export function receiveSupplierOrder(
    orderId: string,
    paid: number,
    updatePrices: boolean
): CompleteOrderResult {
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
export function isOrderOverdue(order: Order, now: Date = new Date()): boolean {
    if (
        order.expectedDate === null ||
        (order.status !== "pending" && order.status !== "ready")
    ) {
        return false;
    }

    const [y, m, d] = order.expectedDate.split("-").map(Number);

    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime() < now.getTime();
}

export interface OrdersSummary {
    customerOpen: number;
    supplierOpen: number;
    overdue: number;
}

export function getOrdersSummary(now: Date = new Date()): OrdersSummary {
    const summary: OrdersSummary = { customerOpen: 0, supplierOpen: 0, overdue: 0 };

    for (const order of getOrders()) {
        if (order.status !== "pending" && order.status !== "ready") {
            continue;
        }

        if (order.kind === "customer") {
            summary.customerOpen += 1;
        } else {
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

export interface CreditSaleEntry {
    sale: Sale;
    remaining: number;
}

export interface CreditGroup {
    // Client enregistré, ou « name:… » pour un nom saisi sans fiche.
    key: string;
    clientId: string | null;
    name: string;
    amount: number;
    // Ventes à encaisser, la plus ancienne d'abord.
    sales: CreditSaleEntry[];
    oldestAt: string;
    // Jours depuis la plus ancienne vente non soldée.
    oldestDays: number;
    overdue: boolean;
}

export interface CreditsSummary {
    total: number;
    debtors: number;
    overdueAmount: number;
    overdueDebtors: number;
    groups: CreditGroup[];
}

/** Tous les crédits non soldés, regroupés par débiteur (plus gros d'abord). */
export function getCreditsSummary(now: Date = new Date()): CreditsSummary {
    const sales = getSales();
    const remaining = getRemainingMap(sales);
    const clients = new Map(getClients().map((client) => [client.id, client]));
    const groups = new Map<string, CreditGroup>();

    const open = sales
        .filter((sale) => (remaining.get(sale.id) ?? 0) > 0)
        .sort(
            (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

    for (const sale of open) {
        const client = sale.customerId ? clients.get(sale.customerId) : undefined;
        const name = client?.name ?? sale.borrowerName?.trim() ?? "";

        if (name === "") {
            continue;
        }

        // Un nom saisi qui correspond à une fiche est rattaché à cette fiche.
        const byName = client
            ? client
            : [...clients.values()].find(
                  (item) => item.name.toLowerCase() === name.toLowerCase()
              );

        const key = byName ? byName.id : `name:${name.toLowerCase()}`;
        const entry: CreditSaleEntry = { sale, remaining: remaining.get(sale.id) ?? 0 };
        const existing = groups.get(key);

        if (existing) {
            existing.sales.push(entry);
            existing.amount += entry.remaining;

            // Sans fiche : on garde l'orthographe de la vente la plus récente
            // (les ventes sont lues de la plus ancienne à la plus récente).
            if (!byName) {
                existing.name = name;
            }
        } else {
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


/* ========================================
   DOCUMENTS (devis, factures, reçus)
   Socle commun : réglages d'impression, numérotation, calcul des totaux.
   Le module Devis s'appuie dessus ; Factures et Reçus le réutiliseront.
======================================== */

export type DocumentType = "quote" | "invoice" | "receipt";

export const DOCUMENT_PREFIX: Record<DocumentType, string> = {
    quote: "DEV",
    invoice: "FAC",
    receipt: "REC"
};

export const DOC_LIMITS = {
    shortMax: 80,
    addressMax: 160,
    longMax: 600,
    linesMax: 60,
    descriptionMax: 120,
    unitMax: 12,
    totalMax: 100_000_000_000
} as const;

/** Texte sûr (plusieurs lignes permises) : sans caractères de contrôle. */
function cleanText(value: unknown, max: number): string {
    return typeof value === "string"
        ? value
              .replace(/\r\n?/g, "\n")
              // eslint-disable-next-line no-control-regex
              .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
              .trim()
              .slice(0, max)
        : "";
}

const EMAIL_PATTERN = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export function isValidEmail(value: string): boolean {
    return value === "" || (value.length <= DOC_LIMITS.shortMax && EMAIL_PATTERN.test(value));
}

/** Ajoute des jours à une date AAAA-MM-JJ (heure locale). */
export function addDaysToDay(day: string, days: number): string {
    const [year, month, date] = day.split("-").map(Number);
    const result = new Date(year, month - 1, date + days);
    const m = String(result.getMonth() + 1).padStart(2, "0");
    const d = String(result.getDate()).padStart(2, "0");

    return `${result.getFullYear()}-${m}-${d}`;
}

function localToday(): string {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");

    return `${now.getFullYear()}-${m}-${d}`;
}

/* ---------- Réglages des documents ---------- */

export interface DocumentSettings {
    address: string;
    email: string;
    website: string;
    // Identifiant fiscal (NIF / IFU) et registre du commerce (RCCM).
    taxId: string;
    registry: string;
    // Moyens de paiement affichés (ex. numéro Mobile Money, banque).
    paymentInfo: string;
    logo: string | null;
    defaultTaxRate: number;
    defaultValidityDays: number;
    quoteTerms: string;
    // Facture : délai de paiement par défaut et mentions (pénalités…).
    defaultDueDays: number;
    invoiceTerms: string;
    footer: string;
}

const DOC_SETTINGS_KEY = "ejden_doc_settings";

export const DEFAULT_QUOTE_TERMS =
    "Devis valable pour la durée indiquée. Les prix sont exprimés en FCFA. " +
    "La commande est ferme après acceptation écrite (signature) et, le cas échéant, " +
    "versement de l'acompte.";

export const DEFAULT_INVOICE_TERMS =
    "Paiement à réception ou avant la date d'échéance. En cas de retard, des " +
    "pénalités pourront être appliquées. Marchandises vendues non reprises ni échangées sauf accord écrit.";

export function normalizeDocumentSettings(value: unknown): DocumentSettings {
    const data = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
    const email = cleanText(data.email, DOC_LIMITS.shortMax);
    const rate = typeof data.defaultTaxRate === "number" && Number.isFinite(data.defaultTaxRate)
        ? Math.min(100, Math.max(0, Math.round(data.defaultTaxRate * 100) / 100))
        : 0;
    const days = typeof data.defaultValidityDays === "number" && Number.isFinite(data.defaultValidityDays)
        ? Math.min(365, Math.max(1, Math.round(data.defaultValidityDays)))
        : 30;

    return {
        address: cleanText(data.address, DOC_LIMITS.addressMax),
        email: isValidEmail(email) ? email : "",
        website: cleanText(data.website, DOC_LIMITS.shortMax),
        taxId: cleanText(data.taxId, 40),
        registry: cleanText(data.registry, 40),
        paymentInfo: cleanText(data.paymentInfo, DOC_LIMITS.longMax),
        logo: isSafePhoto(data.logo) ? data.logo : null,
        defaultTaxRate: rate,
        defaultValidityDays: days,
        quoteTerms: typeof data.quoteTerms === "string"
            ? cleanText(data.quoteTerms, DOC_LIMITS.longMax)
            : DEFAULT_QUOTE_TERMS,
        defaultDueDays: typeof data.defaultDueDays === "number" && Number.isFinite(data.defaultDueDays)
            ? Math.min(365, Math.max(0, Math.round(data.defaultDueDays)))
            : 30,
        invoiceTerms: typeof data.invoiceTerms === "string"
            ? cleanText(data.invoiceTerms, DOC_LIMITS.longMax)
            : DEFAULT_INVOICE_TERMS,
        footer: cleanText(data.footer, DOC_LIMITS.addressMax)
    };
}

export function getDocumentSettings(): DocumentSettings {
    try {
        const stored = localStorage.getItem(DOC_SETTINGS_KEY);

        if (stored) {
            return normalizeDocumentSettings(JSON.parse(stored));
        }
    } catch (error) {
        console.error("Impossible de lire les réglages des documents.", error);
    }

    return normalizeDocumentSettings({});
}

export function saveDocumentSettings(settings: DocumentSettings): boolean {
    try {
        localStorage.setItem(
            DOC_SETTINGS_KEY,
            JSON.stringify(normalizeDocumentSettings(settings))
        );
        return true;
    } catch (error) {
        console.error("Impossible d'enregistrer les réglages des documents.", error);
        return false;
    }
}

/* ---------- Numérotation (DEV-2026-0001) ---------- */

const DOC_COUNTERS_KEY = "ejden_doc_counters";

function readCounters(): Record<string, number> {
    try {
        const stored = localStorage.getItem(DOC_COUNTERS_KEY);
        const parsed: unknown = stored ? JSON.parse(stored) : {};
        const result: Record<string, number> = {};

        if (typeof parsed === "object" && parsed !== null) {
            for (const [key, count] of Object.entries(parsed)) {
                if (typeof count === "number" && Number.isInteger(count) && count >= 0) {
                    result[key] = count;
                }
            }
        }

        return result;
    } catch {
        return {};
    }
}

/** Réserve le numéro suivant d'un type de document pour l'année de la date. */
export function reserveDocumentNumber(type: DocumentType, day: string): string {
    const year = isValidDay(day) ? day.slice(0, 4) : String(new Date().getFullYear());
    const key = `${type}-${year}`;
    const counters = readCounters();
    const next = (counters[key] ?? 0) + 1;

    counters[key] = next;

    try {
        localStorage.setItem(DOC_COUNTERS_KEY, JSON.stringify(counters));
    } catch (error) {
        console.error("Impossible d'enregistrer la numérotation.", error);
    }

    return `${DOCUMENT_PREFIX[type]}-${year}-${String(next).padStart(4, "0")}`;
}

/* ---------- Lignes et totaux (communs devis / factures) ---------- */

export interface DocumentLine {
    productId: string | null;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    // Remise de la ligne en % (0 à 100).
    discountPct: number;
}

export function normalizeDocumentLine(value: unknown): DocumentLine | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const l = value as Record<string, unknown>;
    const description = cleanLabel(l.description, DOC_LIMITS.descriptionMax);
    const unit = cleanLabel(l.unit, DOC_LIMITS.unitMax);

    if (
        description === "" ||
        typeof l.quantity !== "number" ||
        !Number.isFinite(l.quantity) ||
        l.quantity <= 0 ||
        l.quantity > 1_000_000 ||
        typeof l.unitPrice !== "number" ||
        !Number.isFinite(l.unitPrice) ||
        l.unitPrice < 0 ||
        l.unitPrice > MODULE_LIMITS.amountMax
    ) {
        return null;
    }

    const pct = typeof l.discountPct === "number" && Number.isFinite(l.discountPct)
        ? Math.min(100, Math.max(0, Math.round(l.discountPct * 100) / 100))
        : 0;

    return {
        productId: typeof l.productId === "string" && l.productId !== "" && l.productId.length <= 100
            ? l.productId
            : null,
        description,
        unit,
        quantity: Math.round(l.quantity * 100) / 100,
        unitPrice: Math.round(l.unitPrice),
        discountPct: pct
    };
}

export function documentLineTotal(line: DocumentLine): number {
    return Math.round(line.quantity * line.unitPrice * (1 - line.discountPct / 100));
}

export interface DocumentTotals {
    subtotal: number;
    discount: number;
    net: number;
    tax: number;
    total: number;
    deposit: number;
    balance: number;
}

export function computeDocumentTotals(
    lines: readonly DocumentLine[],
    discount: number,
    taxRate: number,
    depositPct: number
): DocumentTotals {
    const subtotal = lines.reduce((sum, line) => sum + documentLineTotal(line), 0);
    const disc = Math.min(Math.max(0, Math.round(discount)), subtotal);
    const net = subtotal - disc;
    const tax = Math.round((net * taxRate) / 100);
    const total = net + tax;
    const deposit = Math.round((total * depositPct) / 100);

    return { subtotal, discount: disc, net, tax, total, deposit, balance: total - deposit };
}

/* ========================================
   DEVIS
======================================== */

export type QuoteStatus = "draft" | "sent" | "accepted" | "refused";
export type QuoteDisplayStatus = QuoteStatus | "expired";

export const QUOTE_STATUS_LABELS: Record<QuoteDisplayStatus, string> = {
    draft: "Brouillon",
    sent: "Envoyé",
    accepted: "Accepté",
    refused: "Refusé",
    expired: "Expiré"
};

export interface Quote {
    id: string;
    number: string;
    status: QuoteStatus;
    createdAt: string;
    updatedAt: string;
    issueDate: string;
    validUntil: string;
    // Client : copie des informations au moment du devis (le devis reste
    // identique même si la fiche client change ou est supprimée).
    clientId: string | null;
    clientName: string;
    clientPhone: string;
    clientEmail: string;
    clientAddress: string;
    subject: string;
    lines: DocumentLine[];
    // Remise globale en FCFA, TVA en %, acompte demandé en %.
    discount: number;
    taxRate: number;
    depositPct: number;
    deliveryTerms: string;
    paymentTerms: string;
    notes: string;
    terms: string;
    // Facture créée à partir de ce devis (une seule).
    invoiceId: string | null;
}

const QUOTES_KEY = "ejden_quotes";

export function normalizeQuote(value: unknown): Quote | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const q = value as Record<string, unknown>;
    const createdAt = validDate(q.createdAt);
    const updatedAt = validDate(q.updatedAt) ?? createdAt;
    const clientName = cleanLabel(q.clientName, DOC_LIMITS.shortMax);
    const clientPhone = cleanLabel(q.clientPhone, MODULE_LIMITS.phoneMax);
    const clientEmail = cleanText(q.clientEmail, DOC_LIMITS.shortMax);
    const number = cleanLabel(q.number, 30);

    if (
        typeof q.id !== "string" ||
        q.id === "" ||
        q.id.length > 100 ||
        number === "" ||
        createdAt === null ||
        updatedAt === null ||
        !isValidDay(q.issueDate) ||
        !isValidDay(q.validUntil) ||
        clientName === "" ||
        !isValidPhone(clientPhone) ||
        !Array.isArray(q.lines) ||
        q.lines.length === 0 ||
        q.lines.length > DOC_LIMITS.linesMax ||
        (q.status !== "draft" && q.status !== "sent" && q.status !== "accepted" && q.status !== "refused")
    ) {
        return null;
    }

    const lines: DocumentLine[] = [];

    for (const raw of q.lines) {
        const line = normalizeDocumentLine(raw);

        if (line === null) {
            return null;
        }

        lines.push(line);
    }

    const num = (input: unknown, min: number, max: number, fallback: number): number =>
        typeof input === "number" && Number.isFinite(input)
            ? Math.min(max, Math.max(min, Math.round(input * 100) / 100))
            : fallback;

    const discount = Math.round(num(q.discount, 0, MODULE_LIMITS.amountMax, 0));
    const taxRate = num(q.taxRate, 0, 100, 0);
    const depositPct = num(q.depositPct, 0, 100, 0);

    if (computeDocumentTotals(lines, discount, taxRate, depositPct).total > DOC_LIMITS.totalMax) {
        return null;
    }

    return {
        id: q.id,
        number,
        status: q.status,
        createdAt,
        updatedAt: updatedAt ?? createdAt,
        issueDate: q.issueDate,
        validUntil: q.validUntil,
        clientId: typeof q.clientId === "string" && q.clientId !== "" && q.clientId.length <= 100
            ? q.clientId
            : null,
        clientName,
        clientPhone,
        clientEmail: isValidEmail(clientEmail) ? clientEmail : "",
        clientAddress: cleanText(q.clientAddress, DOC_LIMITS.addressMax),
        subject: cleanLabel(q.subject, DOC_LIMITS.descriptionMax),
        lines,
        discount,
        taxRate,
        depositPct,
        deliveryTerms: cleanText(q.deliveryTerms, DOC_LIMITS.addressMax),
        paymentTerms: cleanText(q.paymentTerms, DOC_LIMITS.addressMax),
        notes: cleanText(q.notes, DOC_LIMITS.longMax),
        terms: cleanText(q.terms, DOC_LIMITS.longMax),
        invoiceId: typeof q.invoiceId === "string" && q.invoiceId !== "" && q.invoiceId.length <= 100
            ? q.invoiceId
            : null
    };
}

export function getQuotes(): Quote[] {
    return readList(QUOTES_KEY, normalizeQuote, "les devis").sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
    );
}

export function getQuoteById(quoteId: string): Quote | null {
    return getQuotes().find((item) => item.id === quoteId) ?? null;
}

/** Ajoute le devis, ou le remplace s'il existe déjà (même id). */
export function saveQuote(quote: Quote): boolean {
    const clean = normalizeQuote(quote);

    if (clean === null) {
        return false;
    }

    const quotes = getQuotes();
    const index = quotes.findIndex((item) => item.id === clean.id);

    if (index === -1) {
        quotes.push(clean);
    } else {
        quotes[index] = clean;
    }

    return writeList(QUOTES_KEY, quotes, "les devis");
}

export function deleteQuote(quoteId: string): boolean {
    const quotes = getQuotes();
    const remaining = quotes.filter((item) => item.id !== quoteId);

    return remaining.length === quotes.length
        ? false
        : writeList(QUOTES_KEY, remaining, "les devis");
}

export function setQuoteStatus(quoteId: string, status: QuoteStatus): boolean {
    const quote = getQuoteById(quoteId);

    return quote === null
        ? false
        : saveQuote({ ...quote, status, updatedAt: new Date().toISOString() });
}

/** Copie d'un devis : nouveau numéro, brouillon, dates d'aujourd'hui. */
export function duplicateQuote(quoteId: string): Quote | null {
    const source = getQuoteById(quoteId);

    if (source === null) {
        return null;
    }

    const today = localToday();
    const span = Math.max(
        1,
        Math.round(
            (new Date(source.validUntil).getTime() - new Date(source.issueDate).getTime()) /
                86_400_000
        )
    );
    const now = new Date().toISOString();
    const copy: Quote = {
        ...source,
        id: newId(),
        number: reserveDocumentNumber("quote", today),
        status: "draft",
        invoiceId: null,
        createdAt: now,
        updatedAt: now,
        issueDate: today,
        validUntil: addDaysToDay(today, span)
    };

    return saveQuote(copy) ? copy : null;
}

/** Un devis envoyé ou en brouillon dont la validité est dépassée est « expiré ». */
export function getQuoteDisplayStatus(quote: Quote, today: string = localToday()): QuoteDisplayStatus {
    return (quote.status === "draft" || quote.status === "sent") && quote.validUntil < today
        ? "expired"
        : quote.status;
}

export function getQuoteTotals(quote: Quote): DocumentTotals {
    return computeDocumentTotals(quote.lines, quote.discount, quote.taxRate, quote.depositPct);
}


/* ========================================
   FACTURES
   Numéro attribué à l'émission (suite continue, sans trou).
   Une facture émise ne se supprime pas : elle s'annule.
======================================== */

export type InvoiceStatus = "draft" | "issued" | "cancelled";
export type InvoiceDisplayStatus = "draft" | "unpaid" | "partial" | "overdue" | "paid" | "cancelled";

export const INVOICE_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
    draft: "Brouillon",
    unpaid: "À payer",
    partial: "Partiellement payée",
    overdue: "En retard",
    paid: "Payée",
    cancelled: "Annulée"
};

export interface InvoicePayment {
    id: string;
    date: string;
    amount: number;
    method: CreditPaymentMethod;
    note: string;
    // Numéro du reçu (REC-AAAA-0001). Vide pour les anciens paiements.
    receiptNumber: string;
    // Moment de l'enregistrement (sert à l'heure dans la caisse).
    createdAt: string;
}

export interface Invoice {
    id: string;
    // Vide tant que la facture est un brouillon.
    number: string;
    status: InvoiceStatus;
    createdAt: string;
    updatedAt: string;
    issueDate: string;
    dueDate: string;
    quoteId: string | null;
    quoteNumber: string;
    clientId: string | null;
    clientName: string;
    clientPhone: string;
    clientEmail: string;
    clientAddress: string;
    subject: string;
    lines: DocumentLine[];
    discount: number;
    taxRate: number;
    paymentTerms: string;
    notes: string;
    terms: string;
    payments: InvoicePayment[];
}

const INVOICES_KEY = "ejden_invoices";

function normalizeInvoicePayment(value: unknown): InvoicePayment | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const p = value as Record<string, unknown>;
    const amount = cleanAmount(p.amount);

    if (
        typeof p.id !== "string" ||
        p.id === "" ||
        p.id.length > 100 ||
        amount === null ||
        !isValidDay(p.date) ||
        typeof p.method !== "string" ||
        !(CREDIT_PAYMENT_METHODS as string[]).includes(p.method)
    ) {
        return null;
    }

    return {
        id: p.id,
        date: p.date,
        amount,
        method: p.method as CreditPaymentMethod,
        note: cleanLabel(p.note, DOC_LIMITS.shortMax),
        receiptNumber: cleanLabel(p.receiptNumber, 30),
        createdAt: validDate(p.createdAt) ?? `${p.date}T12:00:00.000Z`
    };
}

/** Moment d'un paiement de facture, pour la caisse et les finances. */
function invoicePaymentTime(payment: InvoicePayment): string {
    // Le jour saisi fait foi ; l'heure vient de l'enregistrement si c'est le même jour.
    const saved = new Date(payment.createdAt);

    if (!Number.isNaN(saved.getTime()) && localDayOf(saved) === payment.date) {
        return saved.toISOString();
    }

    return new Date(`${payment.date}T12:00:00`).toISOString();
}

function localDayOf(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${month}-${day}`;
}

export function normalizeInvoice(value: unknown): Invoice | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const v = value as Record<string, unknown>;
    const createdAt = validDate(v.createdAt);
    const updatedAt = validDate(v.updatedAt) ?? createdAt;
    const clientName = cleanLabel(v.clientName, DOC_LIMITS.shortMax);
    const clientPhone = cleanLabel(v.clientPhone, MODULE_LIMITS.phoneMax);
    const clientEmail = cleanText(v.clientEmail, DOC_LIMITS.shortMax);
    const number = cleanLabel(v.number, 30);

    if (
        typeof v.id !== "string" ||
        v.id === "" ||
        v.id.length > 100 ||
        (v.status !== "draft" && v.status !== "issued" && v.status !== "cancelled") ||
        (v.status !== "draft" && number === "") ||
        createdAt === null ||
        updatedAt === null ||
        !isValidDay(v.issueDate) ||
        !isValidDay(v.dueDate) ||
        clientName === "" ||
        !isValidPhone(clientPhone) ||
        !Array.isArray(v.lines) ||
        v.lines.length === 0 ||
        v.lines.length > DOC_LIMITS.linesMax
    ) {
        return null;
    }

    const lines: DocumentLine[] = [];

    for (const raw of v.lines) {
        const line = normalizeDocumentLine(raw);

        if (line === null) {
            return null;
        }

        lines.push(line);
    }

    const payments: InvoicePayment[] = [];

    if (Array.isArray(v.payments)) {
        for (const raw of v.payments) {
            const payment = normalizeInvoicePayment(raw);

            if (payment !== null) {
                payments.push(payment);
            }
        }
    }

    const num = (input: unknown, max: number): number =>
        typeof input === "number" && Number.isFinite(input)
            ? Math.min(max, Math.max(0, Math.round(input * 100) / 100))
            : 0;
    const discount = Math.round(num(v.discount, MODULE_LIMITS.amountMax));
    const taxRate = num(v.taxRate, 100);

    if (computeDocumentTotals(lines, discount, taxRate, 0).total > DOC_LIMITS.totalMax) {
        return null;
    }

    return {
        id: v.id,
        number,
        status: v.status,
        createdAt,
        updatedAt: updatedAt ?? createdAt,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        quoteId: typeof v.quoteId === "string" && v.quoteId !== "" && v.quoteId.length <= 100 ? v.quoteId : null,
        quoteNumber: cleanLabel(v.quoteNumber, 30),
        clientId: typeof v.clientId === "string" && v.clientId !== "" && v.clientId.length <= 100 ? v.clientId : null,
        clientName,
        clientPhone,
        clientEmail: isValidEmail(clientEmail) ? clientEmail : "",
        clientAddress: cleanText(v.clientAddress, DOC_LIMITS.addressMax),
        subject: cleanLabel(v.subject, DOC_LIMITS.descriptionMax),
        lines,
        discount,
        taxRate,
        paymentTerms: cleanText(v.paymentTerms, DOC_LIMITS.addressMax),
        notes: cleanText(v.notes, DOC_LIMITS.longMax),
        terms: cleanText(v.terms, DOC_LIMITS.longMax),
        payments
    };
}

export function getInvoices(): Invoice[] {
    return readList(INVOICES_KEY, normalizeInvoice, "les factures").sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
    );
}

export function getInvoiceById(invoiceId: string): Invoice | null {
    return getInvoices().find((item) => item.id === invoiceId) ?? null;
}

export function saveInvoice(invoice: Invoice): boolean {
    const clean = normalizeInvoice(invoice);

    if (clean === null) {
        return false;
    }

    const invoices = getInvoices();
    const index = invoices.findIndex((item) => item.id === clean.id);

    if (index === -1) {
        invoices.push(clean);
    } else {
        invoices[index] = clean;
    }

    return writeList(INVOICES_KEY, invoices, "les factures");
}

/** Seuls les brouillons se suppriment (une facture émise s'annule). */
export function deleteInvoice(invoiceId: string): boolean {
    const invoices = getInvoices();
    const target = invoices.find((item) => item.id === invoiceId);

    if (!target || target.status !== "draft") {
        return false;
    }

    return writeList(INVOICES_KEY, invoices.filter((item) => item.id !== invoiceId), "les factures");
}

export function getInvoiceTotals(invoice: Invoice): DocumentTotals {
    return computeDocumentTotals(invoice.lines, invoice.discount, invoice.taxRate, 0);
}

export function getInvoicePaid(invoice: Invoice): number {
    return invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function getInvoiceRemaining(invoice: Invoice): number {
    return Math.max(0, getInvoiceTotals(invoice).total - getInvoicePaid(invoice));
}

export function getInvoiceDisplayStatus(invoice: Invoice, today: string = localToday()): InvoiceDisplayStatus {
    if (invoice.status !== "issued") {
        return invoice.status;
    }

    if (getInvoiceRemaining(invoice) === 0) {
        return "paid";
    }

    if (invoice.dueDate < today) {
        return "overdue";
    }

    return getInvoicePaid(invoice) > 0 ? "partial" : "unpaid";
}

/** Émet un brouillon : attribue le numéro définitif. */
export function issueInvoice(invoiceId: string): Invoice | null {
    const invoice = getInvoiceById(invoiceId);

    if (invoice === null || invoice.status !== "draft") {
        return null;
    }

    const issued: Invoice = {
        ...invoice,
        status: "issued",
        number: reserveDocumentNumber("invoice", invoice.issueDate),
        updatedAt: new Date().toISOString()
    };

    return saveInvoice(issued) ? issued : null;
}

export function cancelInvoice(invoiceId: string): boolean {
    const invoice = getInvoiceById(invoiceId);

    // Une facture déjà payée en partie ne s'annule pas : retirez d'abord les
    // paiements, sinon la caisse et la facture ne seraient plus d'accord.
    return invoice !== null && invoice.status === "issued" && invoice.payments.length === 0
        ? saveInvoice({ ...invoice, status: "cancelled", updatedAt: new Date().toISOString() })
        : false;
}

export type InvoicePaymentResult = "ok" | "not-found" | "not-issued" | "too-much" | "invalid" | "error";

export function addInvoicePayment(
    invoiceId: string,
    amount: number,
    method: CreditPaymentMethod,
    date: string,
    note: string
): InvoicePaymentResult {
    const invoice = getInvoiceById(invoiceId);

    if (invoice === null) return "not-found";
    if (invoice.status !== "issued") return "not-issued";

    const clean = normalizeInvoicePayment({
        id: newId(),
        date,
        amount,
        method,
        note,
        createdAt: new Date().toISOString()
    });

    if (clean === null) return "invalid";
    if (clean.amount > getInvoiceRemaining(invoice)) return "too-much";

    clean.receiptNumber = reserveDocumentNumber("receipt", date);

    return saveInvoice({
        ...invoice,
        payments: [...invoice.payments, clean],
        updatedAt: new Date().toISOString()
    })
        ? "ok"
        : "error";
}

export function removeInvoicePayment(invoiceId: string, paymentId: string): boolean {
    const invoice = getInvoiceById(invoiceId);

    return invoice !== null && invoice.status === "issued"
        ? saveInvoice({ ...invoice, payments: invoice.payments.filter((p) => p.id !== paymentId) })
        : false;
}

/** Crée un brouillon de facture à partir d'un devis accepté (une seule fois). */
export function createInvoiceFromQuote(quoteId: string): Invoice | null {
    const quote = getQuoteById(quoteId);

    if (quote === null || quote.status !== "accepted" || quote.invoiceId !== null) {
        return null;
    }

    const today = localToday();
    const now = new Date().toISOString();
    const invoice: Invoice = {
        id: newId(),
        number: "",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        issueDate: today,
        dueDate: addDaysToDay(today, getDocumentSettings().defaultDueDays),
        quoteId: quote.id,
        quoteNumber: quote.number,
        clientId: quote.clientId,
        clientName: quote.clientName,
        clientPhone: quote.clientPhone,
        clientEmail: quote.clientEmail,
        clientAddress: quote.clientAddress,
        subject: quote.subject,
        lines: quote.lines,
        discount: quote.discount,
        taxRate: quote.taxRate,
        paymentTerms: quote.paymentTerms,
        notes: quote.notes,
        terms: getDocumentSettings().invoiceTerms,
        payments: []
    };

    if (!saveInvoice(invoice)) {
        return null;
    }

    return saveQuote({ ...quote, invoiceId: invoice.id }) ? invoice : null;
}


/* ---------- Factures : liens avec les finances et les reçus ---------- */

/** Paiements de factures encaissés sur une période. */
export function getInvoiceCollectedBetween(start: Date, end: Date): { amount: number; count: number } {
    const from = start.getTime();
    const to = end.getTime();
    let amount = 0;
    let count = 0;

    for (const invoice of getInvoices()) {
        if (invoice.status !== "issued") continue;

        for (const payment of invoice.payments) {
            const at = new Date(invoicePaymentTime(payment)).getTime();

            if (at >= from && at <= to) {
                amount += payment.amount;
                count += 1;
            }
        }
    }

    return { amount, count };
}

/** Factures émises restant à encaisser (dont celles en retard). */
export function getInvoicesReceivable(): { total: number; count: number; overdueTotal: number; overdueCount: number } {
    const result = { total: 0, count: 0, overdueTotal: 0, overdueCount: 0 };

    for (const invoice of getInvoices()) {
        if (invoice.status !== "issued") continue;

        const remaining = getInvoiceRemaining(invoice);

        if (remaining === 0) continue;

        result.total += remaining;
        result.count += 1;

        if (invoice.dueDate < localToday()) {
            result.overdueTotal += remaining;
            result.overdueCount += 1;
        }
    }

    return result;
}

export interface Receipt {
    // « idFacture:idPaiement »
    key: string;
    number: string;
    invoice: Invoice;
    payment: InvoicePayment;
    // Reste à payer sur la facture juste après ce paiement.
    remainingAfter: number;
}

/** Tous les reçus (un par paiement de facture émise), le plus récent d'abord. */
export function getReceipts(): Receipt[] {
    const receipts: Receipt[] = [];

    for (const invoice of getInvoices()) {
        if (invoice.status !== "issued") continue;

        const ordered = [...invoice.payments].sort((a, b) =>
            a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)
        );
        const total = getInvoiceTotals(invoice).total;
        let paid = 0;

        ordered.forEach((payment, index) => {
            paid += payment.amount;
            receipts.push({
                key: `${invoice.id}:${payment.id}`,
                number: payment.receiptNumber || `REC-${invoice.number}-${index + 1}`,
                invoice,
                payment,
                remainingAfter: Math.max(0, total - paid)
            });
        });
    }

    return receipts.sort((a, b) =>
        a.payment.date === b.payment.date
            ? b.payment.createdAt.localeCompare(a.payment.createdAt)
            : b.payment.date.localeCompare(a.payment.date)
    );
}

export function getReceiptByKey(key: string): Receipt | null {
    return getReceipts().find((receipt) => receipt.key === key) ?? null;
}


/* ========================================
   NOTIFICATIONS
   Les alertes ne sont jamais stockées : elles sont recalculées à partir
   des vraies données (stock, crédits, commandes, dettes, factures, devis).
   Seuls sont gardés les réglages et l'état « lu / ignoré » (par identifiant).
   L'identifiant contient l'état de la situation (ex. montant dû) : si elle
   change, l'alerte revient comme nouvelle.
======================================== */

export type NotificationCategory =
    | "stock"
    | "credits"
    | "orders"
    | "suppliers"
    | "invoices"
    | "quotes";

export type NotificationSeverity = "danger" | "warning" | "info";

export const NOTIFICATION_CATEGORIES: ReadonlyArray<{
    id: NotificationCategory;
    label: string;
    description: string;
}> = [
    { id: "stock", label: "Stock", description: "Ruptures et stock faible" },
    { id: "credits", label: "Crédits clients", description: `Impayés de plus de ${CREDIT_OVERDUE_DAYS} jours` },
    { id: "orders", label: "Commandes", description: "Livraisons prévues dépassées" },
    { id: "suppliers", label: "Dettes fournisseurs", description: "Achats restant à payer" },
    { id: "invoices", label: "Factures", description: "Échues ou à échéance proche" },
    { id: "quotes", label: "Devis", description: "Devis envoyés bientôt expirés" }
];

export type NotificationSettings = Record<NotificationCategory, boolean>;

export interface AppNotification {
    id: string;
    category: NotificationCategory;
    severity: NotificationSeverity;
    title: string;
    message: string;
    // Page à ouvrir pour traiter l'alerte.
    href: string;
    read: boolean;
}

const NOTIF_SETTINGS_KEY = "ejden_notif_settings";
const NOTIF_STATE_KEY = "ejden_notif_state";
const NOTIF_ID_MAX = 200;
const NOTIF_STATE_MAX = 1000;
// Nombre de jours avant l'échéance (facture) ou l'expiration (devis).
const NOTIF_SOON_DAYS = 3;

function defaultNotificationSettings(): NotificationSettings {
    return {
        stock: true,
        credits: true,
        orders: true,
        suppliers: true,
        invoices: true,
        quotes: true
    };
}

export function getNotificationSettings(): NotificationSettings {
    const settings = defaultNotificationSettings();

    try {
        const stored = localStorage.getItem(NOTIF_SETTINGS_KEY);
        const parsed: unknown = stored ? JSON.parse(stored) : null;

        if (typeof parsed === "object" && parsed !== null) {
            const data = parsed as Record<string, unknown>;

            for (const { id } of NOTIFICATION_CATEGORIES) {
                if (typeof data[id] === "boolean") {
                    settings[id] = data[id];
                }
            }
        }
    } catch (error) {
        console.error("Impossible de lire les réglages des notifications.", error);
    }

    return settings;
}

export function saveNotificationSettings(settings: NotificationSettings): boolean {
    try {
        const clean = defaultNotificationSettings();

        for (const { id } of NOTIFICATION_CATEGORIES) {
            clean[id] = settings[id] === true;
        }

        localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(clean));

        return true;
    } catch (error) {
        console.error("Impossible d'enregistrer les réglages des notifications.", error);

        return false;
    }
}

interface NotificationState {
    read: string[];
    dismissed: string[];
}

function cleanIdList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(
            (item): item is string =>
                typeof item === "string" && item !== "" && item.length <= NOTIF_ID_MAX
        )
        .slice(0, NOTIF_STATE_MAX);
}

function getNotificationState(): NotificationState {
    try {
        const stored = localStorage.getItem(NOTIF_STATE_KEY);
        const parsed: unknown = stored ? JSON.parse(stored) : null;

        if (typeof parsed === "object" && parsed !== null) {
            const data = parsed as Record<string, unknown>;

            return {
                read: cleanIdList(data.read),
                dismissed: cleanIdList(data.dismissed)
            };
        }
    } catch (error) {
        console.error("Impossible de lire l'état des notifications.", error);
    }

    return { read: [], dismissed: [] };
}

function saveNotificationState(state: NotificationState): boolean {
    try {
        localStorage.setItem(
            NOTIF_STATE_KEY,
            JSON.stringify({
                read: cleanIdList(state.read),
                dismissed: cleanIdList(state.dismissed)
            })
        );

        return true;
    } catch (error) {
        console.error("Impossible d'enregistrer l'état des notifications.", error);

        return false;
    }
}

function notifMoney(value: number): string {
    return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

function notifDays(count: number): string {
    return `${count} jour${count > 1 ? "s" : ""}`;
}

function notifDate(day: string): string {
    const [y, m, d] = day.split("-").map(Number);

    return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long"
    });
}

/** Toutes les alertes actuelles (sans tenir compte des réglages ni de l'état). */
function collectNotifications(now: Date): Array<Omit<AppNotification, "read">> {
    const list: Array<Omit<AppNotification, "read">> = [];

    // --- Stock ---
    for (const product of getProducts()) {
        if (product.stock <= 0) {
            list.push({
                id: `stock-out:${product.id}`,
                category: "stock",
                severity: "danger",
                title: `Rupture : ${product.name}`,
                message: "Plus aucune unité en stock. Pensez à réapprovisionner.",
                href: "stock.html?filter=out"
            });
        } else if (product.stockThreshold > 0 && product.stock <= product.stockThreshold) {
            list.push({
                id: `stock-low:${product.id}:${product.stock}`,
                category: "stock",
                severity: "warning",
                title: `Stock faible : ${product.name}`,
                message: `Il reste ${product.stock} unité${product.stock > 1 ? "s" : ""} (seuil d'alerte : ${product.stockThreshold}).`,
                href: "stock.html?filter=low"
            });
        }
    }

    // --- Crédits clients en retard ---
    for (const group of getCreditsSummary(now).groups) {
        if (!group.overdue) continue;

        list.push({
            id: `credit:${group.key}:${group.amount}`,
            category: "credits",
            severity: "danger",
            title: `Crédit en retard : ${group.name}`,
            message: `${notifMoney(group.amount)} à encaisser, dette la plus ancienne depuis ${notifDays(group.oldestDays)}.`,
            href: "credits.html?filter=overdue"
        });
    }

    // --- Commandes en retard ---
    for (const order of getOrders()) {
        if (!isOrderOverdue(order, now) || order.expectedDate === null) continue;

        const supplier = order.kind === "supplier";

        list.push({
            id: `order:${order.id}:${order.status}`,
            category: "orders",
            severity: "warning",
            title: `${supplier ? "Réception" : "Livraison"} en retard : ${order.partyName}`,
            message: `Prévue le ${notifDate(order.expectedDate)} — ${notifMoney(order.total)}.`,
            href: supplier ? "commandes.html?kind=supplier" : "commandes.html"
        });
    }

    // --- Dettes fournisseurs ---
    for (const supplier of getSuppliers()) {
        const debt = getSupplierDebt(supplier.id);

        if (debt.amount <= 0) continue;

        const count = debt.purchases.length;

        list.push({
            id: `supplier:${supplier.id}:${debt.amount}`,
            category: "suppliers",
            severity: "warning",
            title: `À payer : ${supplier.name}`,
            message: `${notifMoney(debt.amount)} dus sur ${count} achat${count > 1 ? "s" : ""}.`,
            href: "fournisseurs.html"
        });
    }

    // --- Factures échues ou proches de l'échéance ---
    const today = localToday();
    const soon = addDaysToDay(today, NOTIF_SOON_DAYS);

    for (const invoice of getInvoices()) {
        if (invoice.status !== "issued") continue;

        const remaining = getInvoiceRemaining(invoice);

        if (remaining <= 0) continue;

        const label = invoice.clientName
            ? `${invoice.number} — ${invoice.clientName}`
            : invoice.number;

        if (invoice.dueDate < today) {
            list.push({
                id: `invoice-late:${invoice.id}:${remaining}`,
                category: "invoices",
                severity: "danger",
                title: `Facture échue : ${label}`,
                message: `${notifMoney(remaining)} restant dû, échéance du ${notifDate(invoice.dueDate)}.`,
                href: `factures.html?open=${encodeURIComponent(invoice.id)}`
            });
        } else if (invoice.dueDate <= soon) {
            list.push({
                id: `invoice-soon:${invoice.id}:${remaining}`,
                category: "invoices",
                severity: "info",
                title: `Facture bientôt due : ${label}`,
                message: `${notifMoney(remaining)} à encaisser avant le ${notifDate(invoice.dueDate)}.`,
                href: `factures.html?open=${encodeURIComponent(invoice.id)}`
            });
        }
    }

    // --- Devis envoyés qui expirent bientôt ---
    for (const quote of getQuotes()) {
        if (quote.status !== "sent" || quote.validUntil < today || quote.validUntil > soon) {
            continue;
        }

        list.push({
            id: `quote:${quote.id}:${quote.validUntil}`,
            category: "quotes",
            severity: "info",
            title: `Devis bientôt expiré : ${quote.number}${quote.clientName ? ` — ${quote.clientName}` : ""}`,
            message: `Valable jusqu'au ${notifDate(quote.validUntil)}. Relancez le client.`,
            href: "devis.html"
        });
    }

    return list;
}

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
    danger: 0,
    warning: 1,
    info: 2
};

/**
 * Alertes à afficher : types activés, non ignorées, les plus urgentes
 * (puis les non lues) en premier. Nettoie au passage l'état des alertes
 * qui n'existent plus.
 */
export function getNotifications(now: Date = new Date()): AppNotification[] {
    const all = collectNotifications(now);
    const settings = getNotificationSettings();
    const state = getNotificationState();
    const activeIds = new Set(all.map((item) => item.id));

    // Les alertes disparues (problème réglé) n'ont plus besoin d'être retenues.
    const read = state.read.filter((id) => activeIds.has(id));
    const dismissed = state.dismissed.filter((id) => activeIds.has(id));

    if (read.length !== state.read.length || dismissed.length !== state.dismissed.length) {
        saveNotificationState({ read, dismissed });
    }

    const readSet = new Set(read);
    const dismissedSet = new Set(dismissed);

    return all
        .filter((item) => settings[item.category] && !dismissedSet.has(item.id))
        .map((item) => ({ ...item, read: readSet.has(item.id) }))
        .sort(
            (a, b) =>
                Number(a.read) - Number(b.read) ||
                SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
        )
        .slice(0, 200);
}

export function getUnreadNotificationsCount(): number {
    return getNotifications().filter((item) => !item.read).length;
}

export function markNotificationsRead(ids: string[]): boolean {
    const state = getNotificationState();

    return saveNotificationState({
        read: [...new Set([...state.read, ...cleanIdList(ids)])],
        dismissed: state.dismissed
    });
}

export function dismissNotifications(ids: string[]): boolean {
    const state = getNotificationState();

    return saveNotificationState({
        read: state.read,
        dismissed: [...new Set([...state.dismissed, ...cleanIdList(ids)])]
    });
}

/** Réaffiche les alertes ignorées. */
export function restoreDismissedNotifications(): boolean {
    const state = getNotificationState();

    return saveNotificationState({ read: state.read, dismissed: [] });
}

export function getDismissedNotificationsCount(): number {
    const settings = getNotificationSettings();
    const dismissed = new Set(getNotificationState().dismissed);

    return collectNotifications(new Date()).filter(
        (item) => dismissed.has(item.id) && settings[item.category]
    ).length;
}
