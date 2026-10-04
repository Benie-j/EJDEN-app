// src/ui.ts
// Petits outils d'affichage partagés par les pages Clients, Dépenses
// et Caisse. Les textes venant des données passent toujours par
// textContent (jamais innerHTML) : aucune injection possible.

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
}

export function money(value: number): string {
    return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

export function dayLabel(date: Date): string {
    if (Number.isNaN(date.getTime())) {
        return "Date inconnue";
    }

    const now = new Date();
    const yesterday = new Date();

    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(date, now)) return "Aujourd'hui";
    if (isSameDay(date, yesterday)) return "Hier";

    return date.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

export function timeLabel(date: Date): string {
    return date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

export function shortDateLabel(date: Date): string {
    return date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

/** Affiche un message court en bas de l'écran (#toast). */
export function createToast(selector = "#toast"): (message: string) => void {
    const toast = document.querySelector<HTMLElement>(selector);
    let timer: number | undefined;

    return (message: string): void => {
        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.classList.add("is-visible");

        if (timer !== undefined) {
            window.clearTimeout(timer);
        }

        timer = window.setTimeout(() => {
            toast.classList.remove("is-visible");
        }, 3000);
    };
}

export interface DeleteControlOptions {
    // Texte du bouton de départ, ex. « Supprimer ».
    label: string;
    // Question affichée avant la confirmation.
    question: string;
    onConfirm: () => void;
}

/**
 * Bouton de suppression en deux temps : un premier appui demande
 * confirmation, un second appui supprime. Pas de suppression par erreur.
 */
export function createDeleteControl(
    options: DeleteControlOptions
): HTMLElement {
    const wrapper = el("div", "delete-control");

    const start = el("button", "action-button is-danger", options.label);
    const box = el("div", "confirm-box");
    const question = el("p", undefined, options.question);
    const yes = el("button", "action-button is-danger is-solid", "Oui, supprimer");
    const no = el("button", "action-button", "Non, garder");

    start.type = "button";
    yes.type = "button";
    no.type = "button";
    box.hidden = true;

    start.addEventListener("click", () => {
        start.hidden = true;
        box.hidden = false;
    });

    no.addEventListener("click", () => {
        box.hidden = true;
        start.hidden = false;
    });

    yes.addEventListener("click", () => {
        yes.disabled = true;
        options.onConfirm();
    });

    box.append(question, yes, no);
    wrapper.append(start, box);

    return wrapper;
}

/** Date locale d'aujourd'hui sous forme AAAA-MM-JJ (pour <input type="date">). */
export function todayInputValue(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${now.getFullYear()}-${month}-${day}`;
}
