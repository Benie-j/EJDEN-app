// src/modules.ts
// Liste unique des modules de l'application, par catégorie.
// href = null : module pas encore construit (affiche « Bientôt »).
// Pour ouvrir un module, il suffit de renseigner son href ici.

export interface AppModule {
    label: string;
    description: string;
    href: string | null;
}

export interface ModuleCategory {
    label: string;
    modules: AppModule[];
}

export const MODULE_CATEGORIES: readonly ModuleCategory[] = [
    {
        label: "Gestion",
        modules: [
            {
                label: "Produits",
                description: "Catalogue et prix",
                href: "produits.html"
            },
            {
                label: "Clients",
                description: "Fiches et crédits",
                href: "clients.html"
            },
            {
                label: "Stock",
                description: "Niveaux et mouvements",
                href: "stock.html"
            },
            {
                label: "Fournisseurs",
                description: "Achats et dettes",
                href: "fournisseurs.html"
            },
            {
                label: "Commandes",
                description: "Clients et fournisseurs",
                href: "commandes.html"
            }
        ]
    },
    {
        label: "Finances",
        modules: [
            {
                label: "Caisse",
                description: "Solde et mouvements",
                href: "caisse.html"
            },
            {
                label: "Dépenses",
                description: "Charges du commerce",
                href: "depenses.html"
            },
            {
                label: "Crédits",
                description: "Sommes à encaisser",
                href: "credits.html"
            },
            {
                label: "Finances",
                description: "Vue d'ensemble",
                href: null
            }
        ]
    },
    {
        label: "Documents",
        modules: [
            { label: "Devis", description: "Propositions de prix", href: null },
            { label: "Factures", description: "Documents de vente", href: null },
            { label: "Reçus", description: "Preuves de paiement", href: null }
        ]
    },
    {
        label: "Analyse",
        modules: [
            { label: "Rapports", description: "Jour, mois, année", href: null },
            {
                label: "Statistiques",
                description: "Performances",
                href: null
            }
        ]
    },
    {
        label: "Système",
        modules: [
            {
                label: "Notifications",
                description: "Alertes et rappels",
                href: null
            },
            {
                label: "Sauvegarde",
                description: "Copie des données",
                href: null
            },
            {
                label: "Paramètres",
                description: "Boutique et reçus",
                href: "parametres.html"
            },
            { label: "Aide", description: "Questions fréquentes", href: null }
        ]
    }
];
