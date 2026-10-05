// src/backup.ts
// Sauvegarde et restauration de toutes les données d'EJDEN.
// Une sauvegarde est un fichier JSON : { app, version, createdAt, data }.
// À la restauration, seules les clés connues sont acceptées et chaque
// valeur doit être un JSON valide : un fichier étranger ne peut rien injecter.
export const BACKUP_KEYS = [
    "ejden_products",
    "ejden_sales",
    "ejden_clients",
    "ejden_credit_payments",
    "ejden_expenses",
    "ejden_cash",
    "ejden_stock_movements",
    "ejden_suppliers",
    "ejden_purchases",
    "ejden_supplier_payments",
    "ejden_orders",
    "ejden_quotes",
    "ejden_invoices",
    "ejden_doc_counters",
    "ejden_doc_settings",
    "ejden_shop",
    "ejden_user",
    "ejden_notif_settings",
    "ejden_notif_state",
    "ejden_products_grouping",
    "ejden_products_view",
    "ejden_dashboard_period",
    "ejden_finances_period",
    "ejden_theme",
    "ejden_lang"
];
const KEY_SET = new Set(BACKUP_KEYS);
const VALUE_MAX = 5_000_000;
const FILE_MAX = 25_000_000;
/* ---------- Création ---------- */
export function createBackup() {
    const data = {};
    for (const key of BACKUP_KEYS) {
        const value = localStorage.getItem(key);
        if (value !== null) {
            data[key] = value;
        }
    }
    return { app: "EJDEN", version: 1, createdAt: new Date().toISOString(), data };
}
export function backupFileName(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `ejden-sauvegarde-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
/* ---------- Lecture / validation ---------- */
function countItems(backup, key) {
    try {
        const parsed = JSON.parse(backup.data[key] ?? "[]");
        return Array.isArray(parsed) ? parsed.length : 0;
    }
    catch {
        return 0;
    }
}
export function parseBackup(text) {
    if (text.length > FILE_MAX) {
        return { ok: false, error: "Fichier trop volumineux." };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return { ok: false, error: "Ce fichier n'est pas une sauvegarde valide." };
    }
    if (typeof parsed !== "object" || parsed === null) {
        return { ok: false, error: "Ce fichier n'est pas une sauvegarde valide." };
    }
    const file = parsed;
    if (file.app !== "EJDEN" || file.version !== 1) {
        return { ok: false, error: "Ce fichier n'est pas une sauvegarde EJDEN." };
    }
    const createdAt = typeof file.createdAt === "string" && !Number.isNaN(new Date(file.createdAt).getTime())
        ? file.createdAt
        : null;
    if (createdAt === null || typeof file.data !== "object" || file.data === null) {
        return { ok: false, error: "Sauvegarde incomplète ou corrompue." };
    }
    const data = {};
    for (const [key, value] of Object.entries(file.data)) {
        if (!KEY_SET.has(key)) {
            continue;
        }
        if (typeof value !== "string" || value.length > VALUE_MAX) {
            return { ok: false, error: "Sauvegarde corrompue." };
        }
        try {
            JSON.parse(value);
        }
        catch {
            return { ok: false, error: "Sauvegarde corrompue." };
        }
        data[key] = value;
    }
    if (Object.keys(data).length === 0) {
        return { ok: false, error: "Cette sauvegarde ne contient aucune donnée." };
    }
    const backup = { app: "EJDEN", version: 1, createdAt, data };
    return {
        ok: true,
        backup,
        summary: {
            products: countItems(backup, "ejden_products"),
            sales: countItems(backup, "ejden_sales"),
            clients: countItems(backup, "ejden_clients")
        }
    };
}
/* ---------- Restauration ---------- */
/** Remplace les données actuelles. En cas d'échec, l'état précédent est remis. */
export function applyBackup(backup) {
    const previous = createBackup().data;
    try {
        for (const key of BACKUP_KEYS) {
            const value = backup.data[key];
            if (value === undefined) {
                localStorage.removeItem(key);
            }
            else {
                localStorage.setItem(key, value);
            }
        }
        return true;
    }
    catch (error) {
        console.error("Restauration impossible, retour à l'état précédent.", error);
        try {
            for (const key of BACKUP_KEYS) {
                const value = previous[key];
                if (value === undefined) {
                    localStorage.removeItem(key);
                }
                else {
                    localStorage.setItem(key, value);
                }
            }
        }
        catch (rollbackError) {
            console.error("Retour à l'état précédent impossible.", rollbackError);
        }
        return false;
    }
}
const META_KEY = "ejden_backup_meta";
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{10,120}\.apps\.googleusercontent\.com$/;
function validDate(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
        ? value
        : null;
}
export function getBackupMeta() {
    try {
        const stored = localStorage.getItem(META_KEY);
        const parsed = stored ? JSON.parse(stored) : null;
        if (typeof parsed === "object" && parsed !== null) {
            const data = parsed;
            const id = typeof data.clientId === "string" ? data.clientId.trim() : "";
            return {
                lastFile: validDate(data.lastFile),
                lastDrive: validDate(data.lastDrive),
                clientId: CLIENT_ID_PATTERN.test(id) ? id : ""
            };
        }
    }
    catch (error) {
        console.error("Impossible de lire l'état des sauvegardes.", error);
    }
    return { lastFile: null, lastDrive: null, clientId: "" };
}
export function saveBackupMeta(patch) {
    try {
        localStorage.setItem(META_KEY, JSON.stringify({ ...getBackupMeta(), ...patch }));
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer l'état des sauvegardes.", error);
        return false;
    }
}
/** Efface toutes les données de l'application (les préférences d'affichage sont conservées). */
export function resetAllData() {
    try {
        for (const key of BACKUP_KEYS) {
            if (key !== "ejden_theme" && key !== "ejden_lang") {
                localStorage.removeItem(key);
            }
        }
        localStorage.removeItem(META_KEY);
        localStorage.removeItem("ejden_editing_product");
        return true;
    }
    catch (error) {
        console.error("Impossible d'effacer les données.", error);
        return false;
    }
}
//# sourceMappingURL=backup.js.map