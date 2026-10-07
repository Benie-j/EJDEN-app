// src/report-permissions.ts
// Permissions du module Rapports. EJDEN n'a pas encore de backend ni de rôles :
// l'utilisateur unique est propriétaire (toutes les permissions). Quand les rôles
// existeront, seul getReportPermissions() devra lire le rôle réel ; toute l'interface
// et les exports passent déjà par can().

export type ReportPermission =
    | "view_reports"
    | "export_reports"
    | "print_reports"
    | "view_financial_reports"
    | "view_team_reports"
    | "view_advanced_analytics";

export type ReportPermissions = Record<ReportPermission, boolean>;

export function getReportPermissions(): ReportPermissions {
    return {
        view_reports: true,
        export_reports: true,
        print_reports: true,
        view_financial_reports: true,
        view_team_reports: true,
        view_advanced_analytics: true
    };
}

export function can(permission: ReportPermission): boolean {
    return getReportPermissions()[permission] === true;
}
