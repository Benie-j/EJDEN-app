import {
    type Product,
    getProducts,
    getProductsViewMode,
    saveProductsViewMode,
    getProductsGrouping,
    saveProductsGrouping,
    type ProductsGrouping,
    UNCATEGORIZED_LABEL,
    categoryKey,
    rememberEditingProduct
} from "./storage.js";
import { setupBarcodeScanner } from "./barcode-field.js";


/* =========================================================
   ÉLÉMENTS PRINCIPAUX
   ========================================================= */

const productListElement =
    document.querySelector<HTMLDivElement>(
        "#productList"
    );

if (!productListElement) {
    throw new Error(
        "EJDEN : #productList est introuvable."
    );
}

const productList: HTMLDivElement =
    productListElement;


const productSearch =
    document.querySelector<HTMLInputElement>(
        "#productSearch"
    );


const productsCount =
    document.querySelector<HTMLElement>(
        "#productsCount"
    );


const groupAllButton =
    document.querySelector<HTMLButtonElement>(
        "#groupAllButton"
    );


const groupCategoryButton =
    document.querySelector<HTMLButtonElement>(
        "#groupCategoryButton"
    );


const emptyState =
    document.querySelector<HTMLElement>(
        "#emptyState"
    );


const noResults =
    document.querySelector<HTMLElement>(
        "#noResults"
    );


const addProductButton =
    document.querySelector<HTMLButtonElement>(
        "#addProductButton"
    );


const addFirstProduct =
    document.querySelector<HTMLButtonElement>(
        "#addFirstProduct"
    );


const addProductHeader =
    document.querySelector<HTMLButtonElement>(
        "#addProductHeader"
    );


const scanBarcodeButton =
    document.querySelector<HTMLButtonElement>(
        "#scanBarcode"
    );


const filterButtons =
    document.querySelectorAll<HTMLButtonElement>(
        ".filter-button"
    );


const gridViewButton =
    document.querySelector<HTMLButtonElement>(
        "#gridViewButton"
    );


const listViewButton =
    document.querySelector<HTMLButtonElement>(
        "#listViewButton"
    );


const notification =
    document.querySelector<HTMLDivElement>(
        "#productsNotification"
    );


const notificationText =
    document.querySelector<HTMLSpanElement>(
        "#productsNotificationText"
    );


/* =========================================================
   PRIX
   ========================================================= */

function formatPrice(
    price: number
): string {

    return (
        new Intl.NumberFormat(
            "fr-FR"
        ).format(price) +
        " FCFA"
    );
}


/* =========================================================
   NOTIFICATION
   ========================================================= */

let notificationTimer:
    number | undefined;


function showNotification(
    message: string
): void {

    if (
        !notification ||
        !notificationText
    ) {
        return;
    }

    notificationText.textContent =
        message;

    notification.classList.add(
        "is-visible"
    );

    if (
        notificationTimer !==
        undefined
    ) {
        window.clearTimeout(
            notificationTimer
        );
    }

    notificationTimer =
        window.setTimeout(
            () => {

                notification.classList.remove(
                    "is-visible"
                );

            },
            2500
        );
}


/* =========================================================
   ÉTAT DU STOCK
   ========================================================= */

type StockStatus =
    "normal" |
    "low" |
    "out";


function getStockStatus(
    product: Product
): StockStatus {

    if (product.stock <= 0) {
        return "out";
    }

    if (
        product.stockThreshold > 0 &&
        product.stock <=
            product.stockThreshold
    ) {
        return "low";
    }

    return "normal";
}


/* =========================================================
   MODE D'AFFICHAGE
   ========================================================= */

type ViewMode =
    "grid" |
    "list";


function getSavedViewMode():
    ViewMode {

    return getProductsViewMode();
}


function updateViewButtons(
    mode: ViewMode
): void {

    const isGrid =
        mode === "grid";


    gridViewButton?.classList.toggle(
        "active",
        isGrid
    );


    listViewButton?.classList.toggle(
        "active",
        !isGrid
    );


    gridViewButton?.setAttribute(
        "aria-pressed",
        String(isGrid)
    );


    listViewButton?.setAttribute(
        "aria-pressed",
        String(!isGrid)
    );
}


function setViewMode(
    mode: ViewMode
): void {

    productList.classList.toggle(
        "grid-view",
        mode === "grid"
    );


    productList.classList.toggle(
        "list-view",
        mode === "list"
    );


    saveProductsViewMode(
        mode
    );


    updateViewButtons(
        mode
    );
}


/* =========================================================
   CRÉATION DE L'IMAGE
   ========================================================= */

function createProductImage(
    product: Product
): HTMLDivElement {

    const container =
        document.createElement(
            "div"
        );

    container.className =
        "product-image";


    if (product.photo) {

        const image =
            document.createElement(
                "img"
            );

        image.src =
            product.photo;

        image.alt =
            product.name;

        image.loading =
            "lazy";

        container.appendChild(
            image
        );

        return container;
    }


    const placeholder =
        document.createElement(
            "div"
        );

    placeholder.className =
        "product-placeholder";


    const svg =
        document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );

    svg.setAttribute(
        "viewBox",
        "0 0 24 24"
    );

    svg.setAttribute(
        "aria-hidden",
        "true"
    );


    const path =
        document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );

    path.setAttribute(
        "d",
        "M4 5h16v14H4z"
    );


    const imagePath =
        document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );

    imagePath.setAttribute(
        "d",
        "M8 14l2.5-3 2.5 2 2-2 3 3"
    );


    const circle =
        document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle"
        );

    circle.setAttribute(
        "cx",
        "9"
    );

    circle.setAttribute(
        "cy",
        "9"
    );

    circle.setAttribute(
        "r",
        "1.5"
    );


    svg.appendChild(path);
    svg.appendChild(imagePath);
    svg.appendChild(circle);

    placeholder.appendChild(svg);

    container.appendChild(
        placeholder
    );


    return container;
}


/* =========================================================
   CRÉATION D'UNE CARTE PRODUIT
   ========================================================= */

function createProductCard(
    product: Product
): HTMLElement {

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "product-card";


    const image =
        createProductImage(
            product
        );


    const info =
        document.createElement(
            "div"
        );

    info.className =
        "product-info";


    const name =
        document.createElement(
            "h3"
        );

    name.textContent =
        product.name;


    const price =
        document.createElement(
            "p"
        );

    price.className =
        "product-price";

    price.textContent =
        formatPrice(
            product.salePrice
        );


    const stock =
        document.createElement(
            "span"
        );

    stock.className =
        "product-stock";


    const stockStatus =
        getStockStatus(
            product
        );


    const stockDot =
        document.createElement(
            "span"
        );

    stockDot.className =
        "stock-dot";


    const stockText =
        document.createElement(
            "span"
        );


    if (
        stockStatus ===
        "out"
    ) {

        stock.classList.add(
            "out"
        );

        stockText.textContent =
            "Rupture de stock";

    } else if (
        stockStatus ===
        "low"
    ) {

        stock.classList.add(
            "low"
        );

        stockText.textContent =
            `Stock faible · ${product.stock}`;

    } else {

        stockText.textContent =
            `${product.stock} en stock`;
    }


    stock.appendChild(
        stockDot
    );

    stock.appendChild(
        stockText
    );


    const editButton =
        document.createElement(
            "button"
        );

    editButton.type =
        "button";

    editButton.className =
        "edit-product-button";

    editButton.dataset.productId =
        product.id;

    editButton.textContent =
        "Modifier";


    info.appendChild(
        name
    );

    info.appendChild(
        price
    );

    info.appendChild(
        stock
    );

    info.appendChild(
        editButton
    );


    card.appendChild(
        image
    );

    card.appendChild(
        info
    );


    return card;
}


/* =========================================================
   ÉTAT VIDE / RÉSULTAT
   ========================================================= */

function updateEmptyStates(
    totalProducts: number,
    displayedProducts: number
): void {

    const hasProducts =
        totalProducts > 0;

    const hasResults =
        displayedProducts > 0;


    if (emptyState) {

        emptyState.style.display =
            !hasProducts
                ? "block"
                : "none";
    }


    if (noResults) {

        // Visible seulement s'il existe des produits
        // mais qu'aucun ne correspond à la recherche / au filtre.
        const showNoResults =
            hasProducts &&
            !hasResults;

        noResults.hidden =
            !showNoResults;

        noResults.style.display =
            showNoResults
                ? ""
                : "none";
    }


    productList.style.display =
        hasResults
            ? ""
            : "none";
}


/* =========================================================
   AFFICHAGE
   ========================================================= */

function renderProducts(
    products: Product[]
): void {

    const totalProducts =
        getProducts().length;


    productList.innerHTML =
        "";


    if (productsCount) {

        productsCount.textContent =
            `${totalProducts} produit${
                totalProducts > 1
                    ? "s"
                    : ""
            }`;
    }


    updateEmptyStates(
        totalProducts,
        products.length
    );


    if (
        products.length === 0
    ) {
        return;
    }


    productList.classList.toggle(
        "is-grouped",
        grouping === "category"
    );

    if (grouping === "category") {

        renderGroups(
            products
        );

        return;
    }

    products.forEach(
        (product) => {

            productList.appendChild(
                createProductCard(
                    product
                )
            );
        }
    );
}


/* =========================================================
   AFFICHAGE PAR CATÉGORIE
   ========================================================= */

let grouping: ProductsGrouping =
    getProductsGrouping();

// Catégories repliées par l'utilisateur (pendant la visite).
const collapsedGroups =
    new Set<string>();


interface ProductGroup {
    key: string;
    name: string;
    products: Product[];
}


function groupByCategory(
    products: Product[]
): ProductGroup[] {

    const groups =
        new Map<string, ProductGroup>();

    for (const product of products) {

        const key =
            categoryKey(
                product.category
            );

        let group =
            groups.get(
                key
            );

        if (!group) {

            group = {
                key,
                name:
                    product.category ??
                    UNCATEGORIZED_LABEL,
                products: []
            };

            groups.set(
                key,
                group
            );
        }

        group.products.push(
            product
        );
    }

    // Ordre alphabétique ; « Sans catégorie » toujours en dernier.
    return [...groups.values()].sort(
        (a, b) => {

            if (a.key === "") return 1;
            if (b.key === "") return -1;

            return a.name.localeCompare(
                b.name,
                "fr"
            );
        }
    );
}


function createGroup(
    group: ProductGroup
): HTMLElement {

    const section =
        document.createElement(
            "section"
        );

    section.className =
        "category-group";


    const header =
        document.createElement(
            "button"
        );

    header.type =
        "button";

    header.className =
        "category-header";


    const name =
        document.createElement(
            "span"
        );

    name.className =
        "category-name";

    name.textContent =
        group.name;


    const count =
        document.createElement(
            "span"
        );

    count.className =
        "category-count";

    count.textContent =
        String(
            group.products.length
        );


    const arrow =
        document.createElement(
            "span"
        );

    arrow.className =
        "category-arrow";

    arrow.setAttribute(
        "aria-hidden",
        "true"
    );


    header.append(
        name,
        count,
        arrow
    );


    const items =
        document.createElement(
            "div"
        );

    items.className =
        "category-items";

    for (const product of group.products) {

        items.appendChild(
            createProductCard(
                product
            )
        );
    }


    const applyState = (): void => {

        const collapsed =
            collapsedGroups.has(
                group.key
            );

        items.hidden =
            collapsed;

        section.classList.toggle(
            "is-collapsed",
            collapsed
        );

        header.setAttribute(
            "aria-expanded",
            String(
                !collapsed
            )
        );
    };

    header.addEventListener(
        "click",
        () => {

            if (collapsedGroups.has(group.key)) {
                collapsedGroups.delete(group.key);
            } else {
                collapsedGroups.add(group.key);
            }

            applyState();
        }
    );

    applyState();

    section.append(
        header,
        items
    );

    return section;
}


function renderGroups(
    products: Product[]
): void {

    for (const group of groupByCategory(products)) {

        productList.appendChild(
            createGroup(
                group
            )
        );
    }
}


function updateGroupingButtons(): void {

    const isAll =
        grouping === "all";

    groupAllButton?.classList.toggle(
        "active",
        isAll
    );

    groupCategoryButton?.classList.toggle(
        "active",
        !isAll
    );

    groupAllButton?.setAttribute(
        "aria-pressed",
        String(isAll)
    );

    groupCategoryButton?.setAttribute(
        "aria-pressed",
        String(!isAll)
    );
}


function setGrouping(
    mode: ProductsGrouping
): void {

    grouping =
        mode;

    saveProductsGrouping(
        mode
    );

    updateGroupingButtons();

    filterProducts();
}


groupAllButton?.addEventListener(
    "click",
    () => setGrouping("all")
);

groupCategoryButton?.addEventListener(
    "click",
    () => setGrouping("category")
);


/* =========================================================
   FILTRAGE
   ========================================================= */

function filterProducts(): void {

    const products =
        getProducts();


    const search =
        productSearch?.value
            .trim()
            .toLowerCase() ??
        "";


    // Même recherche, mais sans espaces : « 611 000 123 » trouve 611000123.
    const searchCode =
        search.replace(/\s+/g, "");

    const activeFilter =
        document.querySelector<HTMLButtonElement>(
            ".filter-button.active"
        );


    const filter =
        activeFilter?.dataset.filter ??
        "all";


    const filtered =
        products.filter(
            (product) => {

                const name =
                    product.name
                        .toLowerCase();


                const barcode =
                    product.barcode
                        ?.toLowerCase() ??
                    "";


                // La recherche trouve aussi le nom d'une catégorie.
                const category =
                    (product.category ?? "")
                        .toLowerCase();


                const matchesSearch =
                    name.includes(search) ||
                    category.includes(search) ||
                    barcode.includes(search) ||
                    (searchCode !== "" && barcode.includes(searchCode));


                if (
                    !matchesSearch
                ) {
                    return false;
                }


                if (
                    filter ===
                    "available"
                ) {

                    return (
                        product.stock > 0
                    );
                }


                if (
                    filter ===
                    "low"
                ) {

                    return (
                        product.stock > 0 &&
                        product.stockThreshold > 0 &&
                        product.stock <=
                            product.stockThreshold
                    );
                }


                if (
                    filter ===
                    "out"
                ) {

                    return (
                        product.stock <= 0
                    );
                }


                return true;
            }
        );


    renderProducts(
        filtered
    );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function goToAddProduct(): void {

    window.location.href =
        "ajouter-produit.html";
}


/* =========================================================
   BOUTON MODIFIER
   ========================================================= */

productList.addEventListener(
    "click",
    (event) => {

        const target =
            event.target;


        if (
            !(target instanceof
                Element)
        ) {
            return;
        }


        const button =
            target.closest<HTMLButtonElement>(
                ".edit-product-button"
            );


        if (!button) {
            return;
        }


        const productId =
            button.dataset.productId;


        if (!productId) {
            return;
        }


        // Mémorisé aussi à part : certains serveurs suppriment « ?id=… ».
        rememberEditingProduct(
            productId
        );

        window.location.href =
            `modifier-produit.html?id=${encodeURIComponent(
                productId
            )}`;
    }
);


/* =========================================================
   RECHERCHE
   ========================================================= */

productSearch?.addEventListener(
    "input",
    () => {

        filterProducts();
    }
);


/* =========================================================
   FILTRES
   ========================================================= */

filterButtons.forEach(
    (button) => {

        button.addEventListener(
            "click",
            () => {

                filterButtons.forEach(
                    (item) => {

                        item.classList.remove(
                            "active"
                        );
                    }
                );


                button.classList.add(
                    "active"
                );


                filterProducts();
            }
        );
    }
);


/* =========================================================
   AJOUTER UN PRODUIT
   ========================================================= */

addProductButton?.addEventListener(
    "click",
    goToAddProduct
);


addFirstProduct?.addEventListener(
    "click",
    goToAddProduct
);


addProductHeader?.addEventListener(
    "click",
    goToAddProduct
);


/* =========================================================
   MODE GRILLE
   ========================================================= */

gridViewButton?.addEventListener(
    "click",
    () => {

        setViewMode(
            "grid"
        );
    }
);


/* =========================================================
   MODE LISTE
   ========================================================= */

listViewButton?.addEventListener(
    "click",
    () => {

        setViewMode(
            "list"
        );
    }
);


/* =========================================================
   SCANNER : le code scanné est placé dans la recherche
   ========================================================= */

setupBarcodeScanner({
    trigger: scanBarcodeButton,
    input: productSearch,
    allowExisting: true,
    notify: (message) => {

        // Après le scan, on indique si le produit existe.
        const code =
            productSearch?.value
                .replace(/\s+/g, "") ?? "";

        const found =
            code !== "" &&
            getProducts().some(
                (product) =>
                    product.barcode === code
            );

        if (message.startsWith("Code scanné")) {

            showNotification(
                found
                    ? "Produit trouvé."
                    : "Aucun produit avec ce code-barres."
            );

            return;
        }

        showNotification(message);
    }
});


/* =========================================================
   INITIALISATION
   ========================================================= */

updateGroupingButtons();

setViewMode(
    getSavedViewMode()
);


// Liens venant du dashboard : ?q=recherche  /  ?filter=low|out|available
const params =
    new URLSearchParams(
        window.location.search
    );

const initialQuery =
    params.get("q");

if (
    initialQuery &&
    productSearch
) {
    productSearch.value =
        initialQuery.slice(0, 80);
}

const initialFilter =
    params.get("filter");

if (
    initialFilter &&
    ["all", "available", "low", "out"]
        .includes(initialFilter)
) {

    filterButtons.forEach(
        (item) => {

            item.classList.toggle(
                "active",
                item.dataset.filter ===
                    initialFilter
            );
        }
    );
}


filterProducts();

window.addEventListener(
    "pageshow",
    (event) => {

        if (event.persisted) {
            filterProducts();
        }
    }
);
