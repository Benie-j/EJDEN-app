// src/category-field.ts
// Champ « Catégorie » des formulaires produit : saisie libre + choix rapide
// parmi les catégories déjà utilisées. Aucun HTML n'est injecté (textContent).

import { LIMITS, getCategories } from "./storage.js";

export function setupCategoryField(
    input: HTMLInputElement | null,
    chips: HTMLElement | null
): void {
    if (!input) {
        return;
    }

    input.maxLength = LIMITS.categoryMax;

    const categories = getCategories();

    if (!chips || categories.length === 0) {
        chips?.remove();
        return;
    }

    function refresh(): void {
        const current = input?.value.trim().toLowerCase() ?? "";

        chips?.querySelectorAll<HTMLButtonElement>(".category-chip").forEach((chip) => {
            const selected = chip.dataset.category?.toLowerCase() === current;

            chip.classList.toggle("is-selected", selected);
            chip.setAttribute("aria-pressed", String(selected));
        });
    }

    for (const category of categories) {
        const chip = document.createElement("button");

        chip.type = "button";
        chip.className = "category-chip";
        chip.textContent = category;
        chip.dataset.category = category;

        chip.addEventListener("click", () => {
            if (input) {
                // Un second appui sur la catégorie choisie la retire.
                input.value =
                    input.value.trim().toLowerCase() === category.toLowerCase()
                        ? ""
                        : category;
            }

            refresh();
        });

        chips.append(chip);
    }

    input.addEventListener("input", refresh);
    refresh();
}
