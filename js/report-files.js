// src/report-files.ts
// Générateurs de fichiers sans bibliothèque externe (le CSP n'autorise que 'self') :
//  - XLSX (ZIP non compressé + SpreadsheetML)
//  - PDF (Helvetica standard, texte, tableaux et barres)
// + enregistrement/partage du fichier.
/* ---------- Utilitaires ---------- */
const enc = new TextEncoder();
function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}
const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(data) {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++)
        c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function zip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
        const name = enc.encode(f.name);
        const crc = crc32(f.data);
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true);
        local.setUint16(8, 0, true);
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, f.data.length, true);
        local.setUint32(22, f.data.length, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        chunks.push(new Uint8Array(local.buffer), name, f.data);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, 0, true);
        c.setUint16(12, time, true);
        c.setUint16(14, date, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, f.data.length, true);
        c.setUint32(24, f.data.length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        central.push(new Uint8Array(c.buffer), name);
        offset += 30 + name.length + f.data.length;
    }
    const cd = concat(central);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cd.length, true);
    end.setUint32(16, offset, true);
    return concat([...chunks, cd, new Uint8Array(end.buffer)]);
}
/* ---------- XLSX ---------- */
function xml(s) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function colName(i) {
    let s = "";
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
        s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
}
// Styles : 0 normal, 1 titre de feuille, 2 en-tête de tableau, 3 nombre, 4 gras, 5 note grise
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF176B87"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF68777D"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B87"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;
function sheetXml(sheet, title) {
    const rows = [];
    let r = 0;
    let maxCols = 2;
    const widths = [];
    const cell = (c, v, style) => {
        const ref = `${colName(c)}${r}`;
        widths[c] = Math.min(60, Math.max(widths[c] ?? 10, String(v).length + 2));
        return typeof v === "number" && Number.isFinite(v)
            ? `<c r="${ref}" s="${style === 0 ? 3 : style}"><v>${v}</v></c>`
            : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
    };
    const push = (cells) => rows.push(`<row r="${r}">${cells.join("")}</row>`);
    r++;
    push([cell(0, title, 1)]);
    widths[0] = 10;
    for (const line of sheet.lines ?? []) {
        r++;
        push([cell(0, line, 5)]);
        widths[0] = 10;
    }
    if (sheet.kpis?.length) {
        r++;
        push([]);
        for (const [k, v] of sheet.kpis) {
            r++;
            push([cell(0, k, 0), cell(1, v, 0)]);
        }
    }
    for (const t of sheet.tables) {
        r++;
        push([]);
        r++;
        push([cell(0, t.title, 4)]);
        if (t.rows.length === 0) {
            r++;
            push([cell(0, t.note ?? "Aucune donnée disponible pour cette période.", 5)]);
            continue;
        }
        r++;
        push(t.headers.map((h, i) => cell(i, h, 2)));
        maxCols = Math.max(maxCols, t.headers.length);
        for (const row of t.rows) {
            r++;
            push(row.map((v, i) => cell(i, v, 0)));
        }
        if (t.note) {
            r++;
            push([cell(0, t.note, 5)]);
        }
    }
    const cols = Array.from({ length: maxCols }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(12, widths[i] ?? 12)}" customWidth="1"/>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
}
export function buildXlsx(sheets, titlePrefix) {
    const names = sheets.map((s, i) => s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || `Feuille ${i + 1}`);
    const files = [
        { name: "[Content_Types].xml", x: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
        { name: "_rels/.rels", x: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
        { name: "xl/workbook.xml", x: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
        { name: "xl/_rels/workbook.xml.rels", x: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
        { name: "xl/styles.xml", x: STYLES },
        ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, x: sheetXml(s, `${titlePrefix} — ${s.name}`) }))
    ];
    return zip(files.map((f) => ({ name: f.name, data: enc.encode(f.x) })));
}
const WIN = { "’": 0x92, "‘": 0x91, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97, "…": 0x85, "€": 0x80, "œ": 0x9c, "Œ": 0x8c, "•": 0x95 };
function pdfBytes(text) {
    let s = "";
    for (const ch of text.replace(/[\u202f\u00a0]/g, " ").replace(/→/g, "->").replace(/[−]/g, "-").replace(/[↑▲↓▼]\s?/g, "")) {
        const code = ch.codePointAt(0);
        const b = WIN[ch] ?? (code < 256 ? code : 0x3f);
        s += b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b < 32 ? " " : String.fromCharCode(b);
    }
    return s;
}
const hex = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
export function buildPdf(blocks, o) {
    const W = o.landscape ? 842 : 595;
    const H = o.landscape ? 595 : 842;
    const M = 36;
    const pages = [[]];
    let y = H - M - 20;
    const cw = (s, size) => s.length * size * 0.5;
    const cur = () => pages[pages.length - 1];
    const newPage = () => { pages.push([]); y = H - M - 20; };
    const ensure = (h) => { if (y - h < M + 14)
        newPage(); };
    const text = (s, x, yy, size, bold = false, color = "#172126", right = false) => {
        const t = pdfBytes(s);
        cur().push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${hex(color)} rg ${(right ? x - cw(s, size) : x).toFixed(1)} ${yy.toFixed(1)} Td (${t}) Tj ET`);
    };
    const rect = (x, yy, w, h, color) => cur().push(`${hex(color)} rg ${x.toFixed(1)} ${yy.toFixed(1)} ${Math.max(0, w).toFixed(1)} ${h.toFixed(1)} re f`);
    const fit = (s, width, size) => { const max = Math.max(3, Math.floor(width / (size * 0.5))); return s.length > max ? `${s.slice(0, max - 1)}…` : s; };
    // En-tête
    rect(0, H - 8, W, 8, "#176B87");
    text(o.shop || "EJDEN", M, y, 11, true, "#176B87");
    y -= 24;
    text(o.title, M, y, 20, true);
    for (const l of o.subtitle) {
        y -= 15;
        text(fit(l, W - 2 * M, 10), M, y, 10, false, "#68777D");
    }
    y -= 10;
    rect(M, y, W - 2 * M, 1.2, "#176B87");
    y -= 22;
    for (const b of blocks) {
        if (b.kind === "h") {
            ensure(40);
            y -= 6;
            text(b.text, M, y, 13, true, "#176B87");
            y -= 16;
        }
        else if (b.kind === "text") {
            for (const l of b.lines) {
                ensure(14);
                text(fit(l, W - 2 * M, 9.5), M, y, 9.5, false, "#172126");
                y -= 13;
            }
            y -= 4;
        }
        else if (b.kind === "kpis") {
            const cols = o.landscape ? 4 : 3;
            const w = (W - 2 * M - (cols - 1) * 8) / cols;
            for (let i = 0; i < b.items.length; i += cols) {
                ensure(46);
                b.items.slice(i, i + cols).forEach(([k, v], j) => {
                    const x = M + j * (w + 8);
                    rect(x, y - 36, w, 40, "#EAF4F7");
                    text(fit(k, w - 12, 8), x + 8, y - 10, 8, false, "#68777D");
                    text(fit(v, w - 12, 12), x + 8, y - 28, 12, true, "#12566C");
                });
                y -= 48;
            }
            y -= 4;
        }
        else if (b.kind === "bars") {
            if (!o.charts || b.values.length === 0)
                continue;
            const h = 110;
            ensure(h + 30);
            text(b.title, M, y, 10, true);
            y -= 12;
            const max = Math.max(...b.values, 1);
            const bw = (W - 2 * M) / b.values.length;
            b.values.forEach((v, i) => rect(M + i * bw + bw * 0.1, y - h, bw * 0.8, (v / max) * h, "#176B87"));
            rect(M, y - h - 1, W - 2 * M, 0.8, "#E3EAED");
            text(b.labels[0] ?? "", M, y - h - 11, 7.5, false, "#68777D");
            text(b.labels[b.labels.length - 1] ?? "", W - M, y - h - 11, 7.5, false, "#68777D", true);
            text(`max ${Math.round(max).toLocaleString("fr-FR")}`, W - M, y - 2, 7.5, false, "#68777D", true);
            y -= h + 26;
        }
        else {
            const t = b.table;
            const limit = o.summary ? 10 : Infinity;
            const rows = t.rows.slice(0, limit);
            const n = t.headers.length;
            const w = (W - 2 * M) / n;
            ensure(48);
            text(t.title, M, y, 11, true);
            y -= 14;
            if (rows.length === 0) {
                text(t.note ?? "Aucune donnée disponible pour cette période.", M, y, 9, false, "#68777D");
                y -= 18;
                continue;
            }
            const head = () => {
                rect(M, y - 4, W - 2 * M, 16, "#176B87");
                t.headers.forEach((h, i) => text(fit(h, w - 6, 8), i === 0 ? M + 4 : M + (i + 1) * w - 4, y, 8, true, "#FFFFFF", i > 0));
                y -= 18;
            };
            head();
            rows.forEach((row, ri) => {
                if (y - 14 < M + 14) {
                    newPage();
                    head();
                }
                if (ri % 2)
                    rect(M, y - 4, W - 2 * M, 14, "#F6F9FA");
                row.forEach((v, i) => {
                    const s = typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : v;
                    text(fit(s, w - 6, 8.5), i === 0 ? M + 4 : M + (i + 1) * w - 4, y, 8.5, false, "#172126", i > 0 && typeof v === "number" || i > 0 && /^[-+−]?[\d\s.,]+\s?(%|FCFA)?$/.test(s));
                });
                y -= 14;
            });
            if (t.rows.length > rows.length) {
                text(`… ${t.rows.length - rows.length} ligne(s) supplémentaire(s) dans le rapport détaillé`, M, y, 8, false, "#68777D");
                y -= 12;
            }
            y -= 10;
        }
    }
    // Assemblage PDF
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add("");
    const pagesObj = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = [];
    pages.forEach((p, i) => {
        p.push(`BT /F1 8 Tf 0.4 0.46 0.49 rg ${M} 22 Td (${pdfBytes(o.footer)}) Tj ET`);
        p.push(`BT /F1 8 Tf 0.4 0.46 0.49 rg ${W - M - 40} 22 Td (${pdfBytes(`Page ${i + 1}/${pages.length}`)}) Tj ET`);
        const content = p.join("\n");
        const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
        const pg = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`);
        kids.push(pg);
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    let out = "%PDF-1.4\n";
    const offsets = [];
    objs.forEach((o2, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o2}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((x) => `${String(x).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    // Contenu en latin-1 : 1 caractère = 1 octet
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++)
        bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
}
/* ---------- Enregistrement ---------- */
export async function saveFile(name, data, mime) {
    const file = new File([data], name, { type: mime });
    try {
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: name });
            return "shared";
        }
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
            return "cancelled";
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
}
//# sourceMappingURL=report-files.js.map