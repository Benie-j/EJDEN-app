// src/notifications.ts
// Page Notifications : alertes calculées depuis les vraies données,
// lecture / effacement, réglages par type. Textes via textContent
// (jamais innerHTML) : aucune injection possible.
import { NOTIFICATION_CATEGORIES, dismissNotifications, getDismissedNotificationsCount, getNotificationSettings, getNotifications, markNotificationsRead, restoreDismissedNotifications, saveNotificationSettings } from "./storage.js";
import { createToast, el } from "./ui.js";
const listElement = document.querySelector("#notificationsList");
const settingsElement = document.querySelector("#settingsList");
const emptyElement = document.querySelector("#notificationsEmpty");
const emptyTitle = document.querySelector("#emptyTitle");
const emptyText = document.querySelector("#emptyText");
const restoreButton = document.querySelector("#restoreButton");
const readAllButton = document.querySelector("#readAllButton");
const clearAllButton = document.querySelector("#clearAllButton");
const filterButtons = document.querySelectorAll(".filter-button");
if (!listElement || !settingsElement) {
    throw new Error("EJDEN : éléments de la page Notifications introuvables.");
}
const list = listElement;
const settingsList = settingsElement;
const toast = createToast();
let activeFilter = "all";
const SEVERITY_LABEL = {
    danger: "Urgent",
    warning: "À surveiller",
    info: "Info"
};
const CATEGORY_LABEL = new Map(NOTIFICATION_CATEGORIES.map((item) => [item.id, item.label]));
function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) {
        node.textContent = text;
    }
}
function createItem(item) {
    const card = el("article", `nt-item is-${item.severity}${item.read ? "" : " is-unread"}`);
    const link = el("a", "nt-link");
    const dot = el("span", "nt-dot");
    const body = el("span", "nt-body");
    const meta = el("span", "nt-meta");
    link.href = item.href;
    dot.setAttribute("aria-hidden", "true");
    meta.append(el("span", `nt-tag is-${item.severity}`, SEVERITY_LABEL[item.severity]), el("span", "nt-category", CATEGORY_LABEL.get(item.category) ?? ""));
    body.append(meta, el("strong", undefined, item.title), el("span", "nt-message", item.message));
    link.append(dot, body);
    // Ouvrir l'alerte la marque comme lue.
    link.addEventListener("click", () => {
        markNotificationsRead([item.id]);
    });
    const dismiss = el("button", "nt-dismiss", "✕");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", `Effacer : ${item.title}`);
    dismiss.addEventListener("click", () => {
        dismissNotifications([item.id]);
        render();
        toast("Notification effacée.");
    });
    card.append(link, dismiss);
    return card;
}
function renderSettings() {
    const settings = getNotificationSettings();
    settingsList.replaceChildren();
    for (const category of NOTIFICATION_CATEGORIES) {
        const row = el("label", "nt-setting");
        const text = el("span", "nt-setting-text");
        const input = el("input");
        const track = el("span", "nt-switch");
        input.type = "checkbox";
        input.checked = settings[category.id];
        input.setAttribute("aria-label", category.label);
        text.append(el("strong", undefined, category.label), el("small", undefined, category.description));
        track.setAttribute("aria-hidden", "true");
        input.addEventListener("change", () => {
            const next = getNotificationSettings();
            next[category.id] = input.checked;
            if (!saveNotificationSettings(next)) {
                input.checked = !input.checked;
                toast("Impossible d'enregistrer le réglage.");
                return;
            }
            render();
        });
        row.append(text, input, track);
        settingsList.append(row);
    }
}
function render() {
    const all = getNotifications();
    const unread = all.filter((item) => !item.read);
    const shown = activeFilter === "unread" ? unread : all;
    setText("#summaryUnread", String(unread.length));
    setText("#summaryUrgent", String(all.filter((item) => item.severity === "danger").length));
    list.replaceChildren(...shown.map(createItem));
    if (emptyElement) {
        emptyElement.hidden = shown.length > 0;
    }
    if (emptyTitle && emptyText) {
        const filtered = activeFilter === "unread" && all.length > 0;
        emptyTitle.textContent = filtered
            ? "Tout est lu"
            : "Aucune notification";
        emptyText.textContent = filtered
            ? "Aucune notification non lue."
            : "Tout est en ordre : rien à signaler pour le moment.";
    }
    if (readAllButton)
        readAllButton.disabled = unread.length === 0;
    if (clearAllButton)
        clearAllButton.disabled = all.length === 0;
    if (restoreButton) {
        const hidden = getDismissedNotificationsCount();
        restoreButton.hidden = hidden === 0;
        restoreButton.textContent = `Réafficher les alertes effacées (${hidden})`;
    }
}
for (const button of filterButtons) {
    button.addEventListener("click", () => {
        activeFilter = button.dataset.filter === "unread" ? "unread" : "all";
        for (const other of filterButtons) {
            other.classList.toggle("active", other === button);
        }
        render();
    });
}
readAllButton?.addEventListener("click", () => {
    markNotificationsRead(getNotifications().map((item) => item.id));
    render();
    toast("Toutes les notifications sont lues.");
});
// Effacement en deux temps : un premier appui demande confirmation.
let clearTimer;
clearAllButton?.addEventListener("click", () => {
    if (!clearAllButton.classList.contains("is-confirming")) {
        clearAllButton.classList.add("is-confirming");
        clearAllButton.textContent = "Confirmer ?";
        clearTimer = window.setTimeout(resetClearButton, 3000);
        return;
    }
    resetClearButton();
    dismissNotifications(getNotifications().map((item) => item.id));
    render();
    toast("Notifications effacées.");
});
function resetClearButton() {
    if (clearTimer !== undefined) {
        window.clearTimeout(clearTimer);
    }
    clearAllButton?.classList.remove("is-confirming");
    if (clearAllButton) {
        clearAllButton.textContent = "Tout effacer";
    }
}
restoreButton?.addEventListener("click", () => {
    restoreDismissedNotifications();
    render();
    toast("Alertes réaffichées.");
});
// Retour arrière (cache) : on recalcule avec les données à jour.
window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        render();
    }
});
renderSettings();
render();
//# sourceMappingURL=notifications.js.map