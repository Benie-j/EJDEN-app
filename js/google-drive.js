// src/google-drive.ts
// Sauvegarde dans Google Drive, dans le dossier privé de l'application
// (portée « drive.appdata » : EJDEN ne voit aucun autre fichier du Drive).
// Connexion via Google Identity Services ; le jeton reste en mémoire.
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const SCRIPT_URL = "https://accounts.google.com/gsi/client";
const FILE_NAME = "ejden-sauvegarde.json";
const API = "https://www.googleapis.com";
export class DriveError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
let scriptPromise = null;
let token = null;
/** À appeler dès l'ouverture de la page : la fenêtre de connexion doit s'ouvrir sans délai au clic. */
export function loadGoogleScript() {
    if (window.google?.accounts?.oauth2) {
        return Promise.resolve();
    }
    scriptPromise ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            scriptPromise = null;
            reject(new DriveError("Connexion à Google impossible. Vérifiez Internet.", "network"));
        };
        document.head.append(script);
    });
    return scriptPromise;
}
function requestToken(clientId) {
    if (token && token.expiresAt > Date.now() + 30_000) {
        return Promise.resolve(token.value);
    }
    return new Promise((resolve, reject) => {
        const oauth = window.google?.accounts?.oauth2;
        if (!oauth) {
            reject(new DriveError("Google n'est pas encore chargé. Réessayez.", "network"));
            return;
        }
        oauth
            .initTokenClient({
            client_id: clientId,
            scope: SCOPE,
            callback: (response) => {
                if (!response.access_token) {
                    reject(new DriveError("Connexion Google refusée.", "denied"));
                    return;
                }
                token = {
                    value: response.access_token,
                    expiresAt: Date.now() + (response.expires_in ?? 3000) * 1000
                };
                resolve(token.value);
            },
            error_callback: () => reject(new DriveError("Connexion Google annulée.", "denied"))
        })
            .requestAccessToken({ prompt: token ? "" : "select_account" });
    });
}
async function call(clientId, url, init = {}) {
    const accessToken = await requestToken(clientId);
    let response;
    try {
        response = await fetch(url, {
            ...init,
            headers: { ...init.headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    catch {
        throw new DriveError("Pas de connexion Internet.", "network");
    }
    if (response.status === 401 || response.status === 403) {
        token = null;
        throw new DriveError("Accès Google Drive refusé. Reconnectez-vous.", "auth");
    }
    if (!response.ok) {
        throw new DriveError(`Erreur Google Drive (${response.status}).`, "api");
    }
    return response;
}
async function findFile(clientId) {
    const query = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
    const response = await call(clientId, `${API}/drive/v3/files?spaces=appDataFolder&q=${query}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,modifiedTime)`);
    const body = (await response.json());
    const file = body.files?.[0];
    return file && typeof file.id === "string" ? file : null;
}
/** Envoie la sauvegarde (remplace la précédente). */
export async function uploadBackup(clientId, content) {
    const existing = await findFile(clientId);
    if (existing) {
        await call(clientId, `${API}/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: content
        });
        return;
    }
    const boundary = `ejden${Date.now().toString(36)}`;
    const metadata = JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    await call(clientId, `${API}/upload/drive/v3/files?uploadType=multipart`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body
    });
}
/** Télécharge la dernière sauvegarde, ou null s'il n'y en a pas. */
export async function downloadBackup(clientId) {
    const file = await findFile(clientId);
    if (!file) {
        return null;
    }
    const response = await call(clientId, `${API}/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
    return response.text();
}
export function forgetGoogleToken() {
    token = null;
}
//# sourceMappingURL=google-drive.js.map