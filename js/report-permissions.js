// src/report-permissions.ts
// Permissions du module Rapports. EJDEN n'a pas encore de backend ni de rôles :
// l'utilisateur unique est propriétaire (toutes les permissions). Quand les rôles
// existeront, seul getReportPermissions() devra lire le rôle réel ; toute l'interface
// et les exports passent déjà par can().
export function getReportPermissions() {
    return {
        view_reports: true,
        export_reports: true,
        print_reports: true,
        view_financial_reports: true,
        view_team_reports: true,
        view_advanced_analytics: true
    };
}
export function can(permission) {
    return getReportPermissions()[permission] === true;
}
//# sourceMappingURL=report-permissions.js.map