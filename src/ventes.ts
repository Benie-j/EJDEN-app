import {
    type Product,
    type Sale,
    type SaleItem,
    type PaymentMethod,
    type Client,
    MODULE_LIMITS,
    getProducts,
    findProductByBarcode,
    recordSale,
    getClients,
    getClientDebt,
    addClient,
    newId
} from "./storage.js";
import {
    BarcodeScanner,
    normalizeBarcode,
    type ScannerErrorCode
} from "./scanner.js";


/* ========================================
   TYPES ET ÉTAT
======================================== */

interface CartItem {
    product: Product;
    quantity: number;
}

let products: Product[] = [];
let cart: CartItem[] = [];
let discount = 0;
let selectedPaymentMethod: PaymentMethod = "cash";
let paymentValue = 0;


/* ========================================
   ÉLÉMENTS HTML
======================================== */

function $<T extends HTMLElement>(selector: string): T | null {
    return document.querySelector<T>(selector);
}

// En-tête
const salesBackButton = $<HTMLButtonElement>("#salesBackButton");
const salesHistoryButton = $<HTMLButtonElement>("#salesHistoryButton");
const salesStatus = $<HTMLElement>("#salesStatus");

// Catalogue
const productSearch = $<HTMLInputElement>("#productSearch");
const clearProductSearch = $<HTMLButtonElement>("#clearProductSearch");
const scanProductButton = $<HTMLButtonElement>("#scanProductButton");
const productResultCount = $<HTMLElement>("#productResultCount");
const productList = $<HTMLElement>("#productList");

// Panier
const openCartButton = $<HTMLButtonElement>("#openCartButton");
const closeCartButton = $<HTMLButtonElement>("#closeCartButton");
const cartOverlay = $<HTMLElement>("#cartOverlay");
const cartPanel = $<HTMLElement>("#cartPanel");
const cartList = $<HTMLElement>("#cartList");
const cartCount = $<HTMLElement>("#cartCount");
const cartPanelCount = $<HTMLElement>("#cartPanelCount");
const cartBarTotal = $<HTMLElement>("#cartBarTotal");

// Détails de la vente
const customerSelector = $<HTMLSelectElement>("#customerSelector");
const discountButton = $<HTMLButtonElement>("#discountButton");
const discountAmount = $<HTMLElement>("#discountAmount");
const subtotalElement = $<HTMLElement>("#subtotal");
const summaryDiscount = $<HTMLElement>("#summaryDiscount");
const saleTotal = $<HTMLElement>("#saleTotal");
const checkoutButton = $<HTMLButtonElement>("#checkoutButton");
const checkoutAmount = $<HTMLElement>("#checkoutAmount");

// Encaissement
const checkoutOverlay = $<HTMLElement>("#checkoutOverlay");
const checkoutPanel = $<HTMLElement>("#checkoutPanel");
const closeCheckoutButton = $<HTMLButtonElement>("#closeCheckoutButton");
const checkoutPanelTotal = $<HTMLElement>("#checkoutPanelTotal");
const paymentMethodButtons =
    document.querySelectorAll<HTMLButtonElement>(".payment-method");
const borrowerSection = $<HTMLElement>("#borrowerSection");
const borrowerName = $<HTMLInputElement>("#borrowerName");
const borrowerClient = $<HTMLSelectElement>("#borrowerClient");
const borrowerNewBlock = $<HTMLElement>("#borrowerNewBlock");
const borrowerSave = $<HTMLInputElement>("#borrowerSave");
const borrowerDebtHint = $<HTMLElement>("#borrowerDebtHint");
const paymentAmount = $<HTMLInputElement>("#paymentAmount");
const paymentRemaining = $<HTMLElement>("#paymentRemaining");
const paymentChange = $<HTMLElement>("#paymentChange");
const confirmPaymentButton = $<HTMLButtonElement>("#confirmPaymentButton");
const confirmPaymentAmount = $<HTMLElement>("#confirmPaymentAmount");

// Scanner
const scannerOverlay = $<HTMLElement>("#scannerOverlay");
const closeScannerButton = $<HTMLButtonElement>("#closeScannerButton");
const scannerVideo = $<HTMLVideoElement>("#scannerVideo");
const scannerMessage = $<HTMLElement>("#scannerMessage");
const scannerTorchButton = $<HTMLButtonElement>("#scannerTorchButton");
const scannerManualForm = $<HTMLFormElement>("#scannerManualForm");
const scannerManualInput = $<HTMLInputElement>("#scannerManualInput");

// Notification
const salesNotification = $<HTMLElement>("#salesNotification");
const salesNotificationText = $<HTMLElement>("#salesNotificationText");


/* ========================================
   OUTILS
======================================== */

function formatMoney(value: number): string {
    return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

function pluralize(count: number, word: string): string {
    return `${count} ${word}${count > 1 ? "s" : ""}`;
}

let notificationTimer: number | undefined;

function showNotification(message: string): void {
    if (!salesNotification || !salesNotificationText) {
        return;
    }

    salesNotificationText.textContent = message;
    salesNotification.hidden = false;

    if (notificationTimer !== undefined) {
        window.clearTimeout(notificationTimer);
    }

    notificationTimer = window.setTimeout(() => {
        salesNotification.hidden = true;
    }, 2800);
}

function setSalesStatus(message: string): void {
    if (salesStatus) {
        salesStatus.textContent = message;
    }
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Crée une icône SVG (même style que le reste de l'application). */
function createIcon(paths: string[], size?: number): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    if (size) {
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
    }

    for (const d of paths) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", d);
        svg.appendChild(path);
    }

    return svg;
}

const ICON_PLUS = ["M12 5v14", "M5 12h14"];
const ICON_MINUS = ["M5 12h14"];
const ICON_TRASH = [
    "M4 7h16",
    "M9 7V4h6v3",
    "M7 7l1 13h8l1-13",
    "M10 11v5",
    "M14 11v5"
];
const ICON_BOX = ["M4 5h16v14H4z", "M8 9h8", "M8 13h5"];
const ICON_CART = ["M4 5h2l2 11h10l2-8H7"];

function createPhoto(
    product: Product,
    className: string,
    placeholderSize: number
): HTMLDivElement {
    const photo = document.createElement("div");
    photo.className = className;

    if (product.photo) {
        const image = document.createElement("img");
        image.src = product.photo;
        image.alt = product.name;
        image.loading = "lazy";
        photo.appendChild(image);
        return photo;
    }

    const icon = createIcon(ICON_BOX, placeholderSize);
    icon.style.color = "var(--primary)";
    icon.style.margin = `${(54 - placeholderSize) / 2}px`;
    photo.appendChild(icon);

    return photo;
}

function createEmptyState(
    className: string,
    iconPaths: string[],
    title: string,
    description: string
): HTMLDivElement {
    const empty = document.createElement("div");
    empty.className = className;

    const iconBox = document.createElement("div");
    iconBox.className = "empty-icon";
    iconBox.appendChild(createIcon(iconPaths));

    const strong = document.createElement("strong");
    strong.textContent = title;

    const span = document.createElement("span");
    span.textContent = description;

    empty.append(iconBox, strong, span);

    return empty;
}


/* ========================================
   PANNEAUX (panier + encaissement)
======================================== */

function isOpen(panel: HTMLElement | null): boolean {
    return panel?.classList.contains("is-open") ?? false;
}

function syncBodyScroll(): void {
    document.body.style.overflow =
        isOpen(cartPanel) || isOpen(checkoutPanel) ? "hidden" : "";
}

function openCart(): void {
    if (!cartPanel || !cartOverlay) {
        return;
    }

    cartOverlay.hidden = false;
    cartPanel.classList.add("is-open");
    cartPanel.setAttribute("aria-hidden", "false");
    openCartButton?.setAttribute("aria-expanded", "true");

    syncBodyScroll();
}

function closeCart(): void {
    if (!cartPanel || !cartOverlay) {
        return;
    }

    cartPanel.classList.remove("is-open");
    cartPanel.setAttribute("aria-hidden", "true");
    openCartButton?.setAttribute("aria-expanded", "false");

    syncBodyScroll();

    window.setTimeout(() => {
        if (!isOpen(cartPanel)) {
            cartOverlay.hidden = true;
        }
    }, 280);
}

function openCheckout(): void {
    if (!checkoutPanel || !checkoutOverlay) {
        return;
    }

    if (cart.length === 0) {
        showNotification("Ajoutez au moins un produit.");
        return;
    }

    if (!refreshCartProducts()) {
        return;
    }

    if (getTotal() <= 0) {
        showNotification("Le montant de la vente est invalide.");
        return;
    }

    // Remet le montant proposé et l'affichage à jour
    // pour le moyen de paiement actuellement choisi.
    selectPaymentMethod(selectedPaymentMethod);

    checkoutOverlay.hidden = false;
    checkoutPanel.classList.add("is-open");
    checkoutPanel.setAttribute("aria-hidden", "false");

    syncBodyScroll();

    window.setTimeout(() => {
        paymentAmount?.focus();
        paymentAmount?.select();
    }, 300);
}

function closeCheckout(): void {
    if (!checkoutPanel || !checkoutOverlay) {
        return;
    }

    checkoutPanel.classList.remove("is-open");
    checkoutPanel.setAttribute("aria-hidden", "true");

    syncBodyScroll();

    window.setTimeout(() => {
        if (!isOpen(checkoutPanel)) {
            checkoutOverlay.hidden = true;
        }
    }, 280);
}


/* ========================================
   PRODUITS
======================================== */

function loadProducts(): void {
    products = getProducts();
}

/**
 * Relit le stock réel dans le stockage et resynchronise le panier.
 * Retourne false si la vente ne peut pas continuer.
 */
function refreshCartProducts(): boolean {
    const latestProducts = getProducts();
    const refreshedCart: CartItem[] = [];

    for (const item of cart) {
        const latest = latestProducts.find(
            (product) => product.id === item.product.id
        );

        if (!latest) {
            showNotification(`« ${item.product.name} » n'existe plus.`);
            return false;
        }

        if (latest.stock < item.quantity) {
            showNotification(`Stock insuffisant pour « ${latest.name} ».`);
            return false;
        }

        refreshedCart.push({ product: latest, quantity: item.quantity });
    }

    products = latestProducts;
    cart = refreshedCart;

    renderProducts();
    renderCart();

    return true;
}

function getStockLabel(product: Product): {
    text: string;
    state: "" | "low" | "out";
} {
    if (product.stock <= 0) {
        return { text: "Rupture de stock", state: "out" };
    }

    if (
        product.stockThreshold > 0 &&
        product.stock <= product.stockThreshold
    ) {
        return { text: `Stock faible : ${product.stock}`, state: "low" };
    }

    return { text: `Stock : ${product.stock}`, state: "" };
}

function createProductCard(product: Product): HTMLElement {
    const card = document.createElement("article");
    card.className = "product-card";

    const photo = createPhoto(product, "product-card-photo", 24);

    const info = document.createElement("div");
    info.className = "product-card-info";

    const name = document.createElement("span");
    name.className = "product-card-name";
    name.textContent = product.name;

    const stockInfo = getStockLabel(product);
    const stock = document.createElement("span");
    stock.className = `product-card-stock ${stockInfo.state}`.trim();
    stock.textContent = stockInfo.text;

    const price = document.createElement("span");
    price.className = "product-card-price";
    price.textContent = formatMoney(product.salePrice);

    info.append(name, stock, price);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "product-add-button";
    addButton.dataset.productId = product.id;
    addButton.disabled = product.stock <= 0;
    addButton.setAttribute("aria-label", `Ajouter ${product.name}`);
    addButton.appendChild(createIcon(ICON_PLUS, 19));

    card.append(photo, info, addButton);

    return card;
}

function renderProducts(): void {
    if (!productList) {
        return;
    }

    const search = (productSearch?.value ?? "")
        .trim()
        .toLocaleLowerCase("fr-FR");

    const filtered = products.filter((product) => {
        if (!search) {
            return true;
        }

        const name = product.name.toLocaleLowerCase("fr-FR");
        const barcode = product.barcode?.toLocaleLowerCase("fr-FR") ?? "";

        return name.includes(search) || barcode.includes(search);
    });

    productList.replaceChildren();

    if (productResultCount) {
        if (products.length === 0) {
            productResultCount.textContent = "Aucun produit";
        } else if (search) {
            productResultCount.textContent = pluralize(
                filtered.length,
                "résultat"
            );
        } else {
            productResultCount.textContent = pluralize(
                filtered.length,
                "produit"
            );
        }
    }

    if (filtered.length === 0) {
        const hasSearch = search.length > 0;

        const empty = createEmptyState(
            "products-empty",
            ICON_BOX,
            hasSearch ? "Aucun produit trouvé" : "Aucun produit disponible",
            hasSearch
                ? "Essayez un autre nom ou code-barres."
                : "Ajoutez d'abord vos produits pour commencer une vente."
        );

        if (!hasSearch) {
            const link = document.createElement("a");
            link.className = "empty-action";
            link.href = "ajouter-produit.html";
            link.textContent = "Ajouter un produit";
            empty.appendChild(link);
        }

        productList.appendChild(empty);

        return;
    }

    for (const product of filtered) {
        productList.appendChild(createProductCard(product));
    }
}


/* ========================================
   PANIER
======================================== */

function getSubtotal(): number {
    return cart.reduce(
        (total, item) => total + item.product.salePrice * item.quantity,
        0
    );
}

function getCartQuantity(): number {
    return cart.reduce((total, item) => total + item.quantity, 0);
}

function getTotal(): number {
    return Math.max(0, getSubtotal() - discount);
}

function addToCart(productId: string): void {
    const product = products.find((item) => item.id === productId);

    if (!product) {
        showNotification("Produit introuvable.");
        return;
    }

    if (product.stock <= 0) {
        showNotification("Ce produit est en rupture de stock.");
        return;
    }

    const existing = cart.find((item) => item.product.id === productId);

    if (existing) {
        if (existing.quantity >= product.stock) {
            showNotification("Stock disponible atteint.");
            return;
        }

        existing.quantity += 1;
    } else {
        cart.push({ product, quantity: 1 });
    }

    renderCart();
    showNotification(`${product.name} ajouté au panier.`);
}

function changeQuantity(productId: string, amount: number): void {
    const item = cart.find((cartItem) => cartItem.product.id === productId);

    if (!item) {
        return;
    }

    const newQuantity = item.quantity + amount;

    if (newQuantity <= 0) {
        removeFromCart(productId);
        return;
    }

    if (newQuantity > item.product.stock) {
        showNotification("Stock disponible atteint.");
        return;
    }

    item.quantity = newQuantity;

    renderCart();
}

function removeFromCart(productId: string): void {
    const item = cart.find((cartItem) => cartItem.product.id === productId);

    if (!item) {
        return;
    }

    cart = cart.filter((cartItem) => cartItem.product.id !== productId);

    renderCart();
    showNotification(`${item.product.name} retiré du panier.`);
}

function createQuantityButton(
    action: "increase" | "decrease",
    productId: string,
    productName: string
): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "quantity-button";
    button.dataset.action = action;
    button.dataset.productId = productId;
    button.setAttribute(
        "aria-label",
        `${action === "increase" ? "Augmenter" : "Diminuer"} ${productName}`
    );
    button.appendChild(
        createIcon(action === "increase" ? ICON_PLUS : ICON_MINUS)
    );

    return button;
}

function createCartItem(item: CartItem): HTMLElement {
    const { product, quantity } = item;

    const wrapper = document.createElement("article");
    wrapper.className = "cart-item";

    const photo = createPhoto(product, "cart-item-photo", 22);

    const info = document.createElement("div");
    info.className = "cart-item-info";

    const name = document.createElement("span");
    name.className = "cart-item-name";
    name.textContent = product.name;

    const unitPrice = document.createElement("span");
    unitPrice.className = "cart-item-price";
    unitPrice.textContent = `${formatMoney(product.salePrice)} / unité`;

    const total = document.createElement("span");
    total.className = "cart-item-total";
    total.textContent = formatMoney(product.salePrice * quantity);

    const controls = document.createElement("div");
    controls.className = "cart-item-controls";

    const quantityValue = document.createElement("span");
    quantityValue.className = "quantity-value";
    quantityValue.textContent = String(quantity);

    controls.append(
        createQuantityButton("decrease", product.id, product.name),
        quantityValue,
        createQuantityButton("increase", product.id, product.name)
    );

    info.append(name, unitPrice, total, controls);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "cart-item-delete";
    deleteButton.dataset.action = "remove";
    deleteButton.dataset.productId = product.id;
    deleteButton.setAttribute("aria-label", `Supprimer ${product.name}`);
    deleteButton.appendChild(createIcon(ICON_TRASH));

    wrapper.append(photo, info, deleteButton);

    return wrapper;
}

function renderCart(): void {
    if (!cartList) {
        return;
    }

    cartList.replaceChildren();

    if (cart.length === 0) {
        cartList.appendChild(
            createEmptyState(
                "cart-empty",
                ICON_CART,
                "Votre panier est vide",
                "Ajoutez des produits pour commencer la vente."
            )
        );
    } else {
        for (const item of cart) {
            cartList.appendChild(createCartItem(item));
        }
    }

    updateCartSummary();
}

function updateCartSummary(): void {
    const subtotal = getSubtotal();

    // La remise ne peut jamais dépasser le sous-total.
    if (discount > subtotal) {
        discount = subtotal;
    }

    const total = getTotal();
    const quantityLabel = pluralize(getCartQuantity(), "article");

    if (cartCount) cartCount.textContent = quantityLabel;
    if (cartPanelCount) cartPanelCount.textContent = quantityLabel;
    if (cartBarTotal) cartBarTotal.textContent = formatMoney(total);

    if (subtotalElement) subtotalElement.textContent = formatMoney(subtotal);
    if (discountAmount) discountAmount.textContent = formatMoney(discount);
    if (summaryDiscount) summaryDiscount.textContent = formatMoney(discount);
    if (saleTotal) saleTotal.textContent = formatMoney(total);

    if (checkoutAmount) checkoutAmount.textContent = formatMoney(total);
    if (checkoutPanelTotal) {
        checkoutPanelTotal.textContent = formatMoney(total);
    }

    if (checkoutButton) {
        checkoutButton.disabled = cart.length === 0;
    }

    if (isOpen(checkoutPanel)) {
        updatePaymentCalculation();
    }
}

function handleDiscount(): void {
    const subtotal = getSubtotal();

    if (subtotal <= 0) {
        showNotification("Le panier est vide.");
        return;
    }

    const input = window.prompt(
        "Montant de la remise en FCFA :",
        discount > 0 ? String(discount) : ""
    );

    if (input === null) {
        return;
    }

    const value = Number(input.trim().replace(",", "."));

    if (!Number.isFinite(value) || value < 0) {
        showNotification("Montant de remise invalide.");
        return;
    }

    if (value > subtotal) {
        showNotification("La remise ne peut pas dépasser le sous-total.");
        return;
    }

    discount = Math.round(value);

    updateCartSummary();
}


/* ========================================
   CLIENT D'UNE VENTE À CRÉDIT
   - client déjà enregistré : choisi dans la liste
   - nouveau client : nom saisi (et enregistré si la case est cochée)
======================================== */

const NEW_CLIENT_VALUE = "__new__";

function formatDebt(amount: number): string {
    return `${Math.round(amount).toLocaleString("fr-FR")} F`;
}

/** (Re)remplit la liste avec les clients enregistrés. */
function refreshBorrowerClients(): void {
    if (!borrowerClient) {
        return;
    }

    const previous = borrowerClient.value;
    const clients = getClients().sort((a, b) =>
        a.name.localeCompare(b.name, "fr")
    );

    const options: HTMLOptionElement[] = [];

    if (clients.length > 0) {
        const placeholder = document.createElement("option");

        placeholder.value = "";
        placeholder.textContent = "Choisir un client…";
        options.push(placeholder);
    }

    for (const client of clients) {
        const option = document.createElement("option");
        const debt = getClientDebt(client).amount;

        option.value = client.id;
        option.textContent =
            debt > 0
                ? `${client.name} (doit ${formatDebt(debt)})`
                : client.name;
        options.push(option);
    }

    const created = document.createElement("option");

    created.value = NEW_CLIENT_VALUE;
    created.textContent = "＋ Nouveau client";
    options.push(created);

    borrowerClient.replaceChildren(...options);

    // Garde le choix précédent s'il existe encore ; sinon valeur par défaut :
    // liste vide => saisie directe, sinon on invite à choisir.
    const stillThere = options.some((option) => option.value === previous);

    borrowerClient.value = stillThere
        ? previous
        : clients.length === 0
          ? NEW_CLIENT_VALUE
          : "";

    updateBorrowerMode();
}

/** Client choisi dans la liste (null si « nouveau » ou rien). */
function getChosenClient(): Client | null {
    const id = borrowerClient?.value ?? "";

    if (id === "" || id === NEW_CLIENT_VALUE) {
        return null;
    }

    return getClients().find((client) => client.id === id) ?? null;
}

/** Affiche la saisie du nom seulement pour un nouveau client. */
function updateBorrowerMode(): void {
    const isNew = (borrowerClient?.value ?? NEW_CLIENT_VALUE) === NEW_CLIENT_VALUE;

    if (borrowerNewBlock) {
        borrowerNewBlock.hidden = !isNew;
    }

    if (!isNew && borrowerName) {
        borrowerName.value = "";
    }

    // Rappel de ce que le client doit déjà.
    const chosen = getChosenClient();
    const debt = chosen ? getClientDebt(chosen).amount : 0;

    if (borrowerDebtHint) {
        borrowerDebtHint.hidden = debt <= 0;
        borrowerDebtHint.textContent =
            debt > 0
                ? `${chosen?.name} doit déjà ${formatDebt(debt)}.`
                : "";
    }
}

function resetBorrower(): void {
    if (borrowerName) {
        borrowerName.value = "";
    }

    if (borrowerSave) {
        borrowerSave.checked = true;
    }

    if (borrowerClient) {
        borrowerClient.value = "";
    }

    refreshBorrowerClients();
}

borrowerClient?.addEventListener("change", () => {
    updateBorrowerMode();

    if (borrowerClient.value === NEW_CLIENT_VALUE) {
        borrowerName?.focus();
    }
});


/* ========================================
   PAIEMENT
======================================== */

function selectPaymentMethod(method: PaymentMethod): void {
    selectedPaymentMethod = method;

    paymentMethodButtons.forEach((button) => {
        const isSelected = button.dataset.paymentMethod === method;

        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
    });

    const isCredit = method === "credit";

    if (borrowerSection) {
        borrowerSection.hidden = !isCredit;
    }

    if (isCredit) {
        // La liste est relue : un client a pu être ajouté entre-temps.
        refreshBorrowerClients();
    } else {
        resetBorrower();
    }

    // Crédit : rien n'est encaissé par défaut.
    // Autres moyens : le total complet est proposé.
    if (paymentAmount) {
        paymentAmount.value = isCredit ? "0" : String(getTotal());
    }

    updatePaymentCalculation();
}

function updatePaymentCalculation(): void {
    const total = getTotal();
    const raw = Number(paymentAmount?.value ?? 0);

    paymentValue = Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 0;

    const isCredit = selectedPaymentMethod === "credit";
    const remaining = Math.max(0, total - paymentValue);
    const change = isCredit ? 0 : Math.max(0, paymentValue - total);

    if (paymentRemaining) {
        paymentRemaining.textContent = formatMoney(remaining);
    }

    if (paymentChange) {
        paymentChange.textContent = formatMoney(change);
    }

    if (confirmPaymentAmount) {
        confirmPaymentAmount.textContent = formatMoney(paymentValue);
    }

    if (confirmPaymentButton) {
        // Paiement classique : le montant doit couvrir la vente.
        // Crédit : le montant versé ne doit pas dépasser le total.
        const canValidate = isCredit
            ? paymentValue <= total
            : paymentValue >= total;

        confirmPaymentButton.disabled = total <= 0 || !canValidate;
    }
}

function confirmSale(): void {
    if (cart.length === 0) {
        showNotification("Le panier est vide.");
        return;
    }

    // Relecture du stock réel avant validation.
    if (!refreshCartProducts()) {
        return;
    }

    const total = getTotal();

    if (total <= 0) {
        showNotification("Le montant de la vente est invalide.");
        return;
    }

    updatePaymentCalculation();

    const isCredit = selectedPaymentMethod === "credit";
    const amountPaid = paymentValue;

    // Client du crédit : enregistré (choisi) ou nouveau (nom saisi).
    const chosenClient = isCredit ? getChosenClient() : null;
    const typedName = isCredit
        ? (borrowerName?.value ?? "").replace(/\s+/g, " ").trim()
        : "";
    const borrower = chosenClient ? chosenClient.name : typedName;

    if (isCredit) {
        if (!chosenClient && !typedName) {
            showNotification(
                (borrowerClient?.value ?? "") === ""
                    ? "Choisissez un client."
                    : "Indiquez le nom du client."
            );

            if ((borrowerClient?.value ?? "") === "") {
                borrowerClient?.focus();
            } else {
                borrowerName?.focus();
            }

            return;
        }

        if (borrower.length > MODULE_LIMITS.textMax) {
            showNotification(
                `Le nom est trop long (${MODULE_LIMITS.textMax} caractères max).`
            );
            borrowerName?.focus();
            return;
        }

        if (amountPaid > total) {
            showNotification(
                "Le montant versé ne peut pas dépasser le total."
            );
            return;
        }
    } else if (amountPaid < total) {
        showNotification("Le montant payé est insuffisant.");
        paymentAmount?.focus();
        return;
    }

    const saleItems: SaleItem[] = cart.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        unitPrice: item.product.salePrice,
        unitCost: item.product.purchasePrice,
        quantity: item.quantity,
        total: item.product.salePrice * item.quantity
    }));

    // Nouveau nom : lié à la fiche existante du même nom, sinon (case cochée)
    // une fiche sera créée APRÈS l'enregistrement réussi de la vente.
    let creditClientId: string | null = chosenClient?.id ?? null;
    let clientToCreate: Client | null = null;

    if (isCredit && !chosenClient) {
        const sameName = getClients().find(
            (client) => client.name.toLowerCase() === typedName.toLowerCase()
        );

        if (sameName) {
            creditClientId = sameName.id;
        } else if (borrowerSave?.checked) {
            clientToCreate = {
                id: newId(),
                name: typedName,
                phone: "",
                createdAt: new Date().toISOString()
            };
            creditClientId = clientToCreate.id;
        }
    }

    const sale: Sale = {
        id: newId(),
        createdAt: new Date().toISOString(),
        items: saleItems,
        subtotal: getSubtotal(),
        discount,
        total,
        paymentMethod: selectedPaymentMethod,
        amountPaid,
        change: isCredit ? 0 : Math.max(0, amountPaid - total),
        remaining: Math.max(0, total - amountPaid),
        customerId: isCredit ? creditClientId : customerSelector?.value || null,
        borrowerName: isCredit ? borrower : null
    };

    // storage.ts enregistre la vente et diminue le stock en une seule opération.
    const result = recordSale(sale);

    if (!result.ok) {
        if (result.reason === "stock") {
            showNotification(`Stock insuffisant : ${result.productName}.`);
            refreshCartProducts();
            renderProducts();
        } else {
            showNotification("La vente n'a pas pu être enregistrée.");
        }

        return;
    }

    // Vente réussie : on crée la fiche du nouveau client si demandé.
    if (clientToCreate && !addClient(clientToCreate)) {
        showNotification(
            "Vente enregistrée, mais la fiche client n'a pas pu être créée."
        );
    }

    loadProducts();
    cart = [];
    discount = 0;

    closeCheckout();
    closeCart();

    selectPaymentMethod("cash");

    renderProducts();
    renderCart();

    setSalesStatus("Vente enregistrée");
    showNotification(`Vente enregistrée : ${formatMoney(total)}`);

    window.setTimeout(() => setSalesStatus("En cours"), 2500);
}


/* ========================================
   SCANNER
======================================== */

const DEFAULT_SCANNER_MESSAGE = "Placez le code-barres dans le cadre.";

let scanner: BarcodeScanner | null = null;
let torchOn = false;
let scannerMessageTimer: number | undefined;

function setScannerMessage(
    message: string,
    kind: "info" | "success" | "error" = "info"
): void {
    if (!scannerMessage) {
        return;
    }

    scannerMessage.textContent = message;
    scannerMessage.classList.toggle("is-success", kind === "success");
    scannerMessage.classList.toggle("is-error", kind === "error");
}

function flashScannerMessage(
    message: string,
    kind: "success" | "error"
): void {
    setScannerMessage(message, kind);

    if (scannerMessageTimer !== undefined) {
        window.clearTimeout(scannerMessageTimer);
    }

    scannerMessageTimer = window.setTimeout(() => {
        setScannerMessage(DEFAULT_SCANNER_MESSAGE);
    }, 2000);
}

function setTorchState(on: boolean): void {
    torchOn = on;

    scannerTorchButton?.classList.toggle("is-on", on);
    scannerTorchButton?.setAttribute("aria-pressed", String(on));
    scannerTorchButton?.setAttribute(
        "aria-label",
        on ? "Éteindre la lampe" : "Allumer la lampe"
    );
}

/**
 * Cherche le produit correspondant au code et l'ajoute au panier.
 * Retourne true si le produit existe.
 */
function addProductByBarcode(rawCode: string): boolean {
    const code = normalizeBarcode(rawCode);

    if (!code) {
        return false;
    }

    const product = findProductByBarcode(code);

    // Le catalogue affiché doit contenir ce produit.
    loadProducts();

    if (!product) {
        flashScannerMessage(`Code inconnu : ${code}`, "error");
        return false;
    }

    if (product.stock <= 0) {
        flashScannerMessage(
            `${product.name} : rupture de stock.`,
            "error"
        );
        return false;
    }

    const inCart =
        cart.find((item) => item.product.id === product.id)?.quantity ?? 0;

    if (inCart >= product.stock) {
        flashScannerMessage(
            `${product.name} : stock disponible atteint.`,
            "error"
        );
        return false;
    }

    addToCart(product.id);
    flashScannerMessage(`${product.name} ajouté`, "success");

    return true;
}

function handleScannerError(
    code: ScannerErrorCode,
    message: string
): void {
    setScannerMessage(
        code === "no-detector" || code === "unsupported"
            ? `${message} Saisissez le code ci-dessous.`
            : message,
        "error"
    );
}

async function openScanner(): Promise<void> {
    if (!scannerOverlay || !scannerVideo) {
        return;
    }

    scannerOverlay.hidden = false;
    scannerOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    setScannerMessage(DEFAULT_SCANNER_MESSAGE);
    setTorchState(false);

    if (scannerTorchButton) {
        scannerTorchButton.hidden = true;
    }

    if (!scanner) {
        scanner = new BarcodeScanner({
            video: scannerVideo,
            onDetect: (code) => {
                addProductByBarcode(code);
            },
            onError: handleScannerError
        });
    }

    await scanner.start();

    // La lampe n'est proposée que si le téléphone la gère.
    if (scanner.isRunning && scannerTorchButton) {
        scannerTorchButton.hidden = !scanner.isTorchSupported();
    }
}

function closeScanner(): void {
    scanner?.stop();
    setTorchState(false);

    if (scannerOverlay) {
        scannerOverlay.hidden = true;
        scannerOverlay.setAttribute("aria-hidden", "true");
    }

    if (scannerManualInput) {
        scannerManualInput.value = "";
    }

    syncBodyScroll();
}

async function toggleTorch(): Promise<void> {
    if (!scanner) {
        return;
    }

    const next = !torchOn;

    if (await scanner.setTorch(next)) {
        setTorchState(next);
    } else {
        flashScannerMessage("Lampe indisponible.", "error");
    }
}


/* ========================================
   ÉVÉNEMENTS
======================================== */

productSearch?.addEventListener("input", () => {
    if (clearProductSearch) {
        clearProductSearch.hidden = productSearch.value.length === 0;
    }

    renderProducts();
});

clearProductSearch?.addEventListener("click", () => {
    if (!productSearch) {
        return;
    }

    productSearch.value = "";
    clearProductSearch.hidden = true;
    productSearch.focus();

    renderProducts();
});

scanProductButton?.addEventListener("click", () => {
    void openScanner();
});

closeScannerButton?.addEventListener("click", closeScanner);

scannerTorchButton?.addEventListener("click", () => {
    void toggleTorch();
});

scannerManualForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!scannerManualInput) {
        return;
    }

    if (addProductByBarcode(scannerManualInput.value)) {
        scannerManualInput.value = "";
    }
});

// La caméra doit s'arrêter si l'application passe en arrière-plan.
document.addEventListener("visibilitychange", () => {
    if (document.hidden && scanner?.isRunning) {
        closeScanner();
    }
});

window.addEventListener("pagehide", () => scanner?.stop());

salesBackButton?.addEventListener("click", () => {
    window.location.href = "dashboard.html";
});

salesHistoryButton?.addEventListener("click", () => {
    window.location.href = "historique-ventes.html";
});

productList?.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
        return;
    }

    const button = target.closest<HTMLButtonElement>(".product-add-button");
    const productId = button?.dataset.productId;

    if (productId) {
        addToCart(productId);
    }
});

cartList?.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
        return;
    }

    const button = target.closest<HTMLButtonElement>("button[data-action]");

    if (!button) {
        return;
    }

    const { action, productId } = button.dataset;

    if (!productId) {
        return;
    }

    if (action === "increase") changeQuantity(productId, 1);
    if (action === "decrease") changeQuantity(productId, -1);
    if (action === "remove") removeFromCart(productId);
});

openCartButton?.addEventListener("click", openCart);
closeCartButton?.addEventListener("click", closeCart);
cartOverlay?.addEventListener("click", closeCart);

discountButton?.addEventListener("click", handleDiscount);
checkoutButton?.addEventListener("click", openCheckout);
closeCheckoutButton?.addEventListener("click", closeCheckout);
checkoutOverlay?.addEventListener("click", closeCheckout);

paymentMethodButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const method = button.dataset.paymentMethod;

        if (
            method === "cash" ||
            method === "mobile_money" ||
            method === "card" ||
            method === "other" ||
            method === "credit"
        ) {
            selectPaymentMethod(method);
        }
    });
});

paymentAmount?.addEventListener("input", updatePaymentCalculation);
confirmPaymentButton?.addEventListener("click", confirmSale);

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
        return;
    }

    if (scannerOverlay && !scannerOverlay.hidden) {
        closeScanner();
        return;
    }

    if (isOpen(checkoutPanel)) {
        closeCheckout();
        return;
    }

    if (isOpen(cartPanel)) {
        closeCart();
    }
});


/* ========================================
   INITIALISATION
======================================== */

function initialize(): void {
    loadProducts();
    selectPaymentMethod("cash");
    renderProducts();
    renderCart();
}

initialize();
