/**
 * Minimal, dependency-free .xlsx writer.
 *
 * Produces a valid Office Open XML workbook (inline strings, a bold frozen
 * header row, column widths) packed into an uncompressed ZIP container.
 * Runs in the browser and in Node. No third-party library needed.
 */

const encoder = new TextEncoder();
const MAX_CELL_CHARS = 32767;

/* ----------------------------- CRC32 ------------------------------ */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Update(crc, bytes) {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------ ZIP ------------------------------- */
function u16(v) {
  return [v & 0xff, (v >>> 8) & 0xff];
}
function u32(v) {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

/**
 * @param {{ name: string, chunks: Uint8Array[] }[]} files
 * @returns {Uint8Array[]} parts suitable for new Blob(parts)
 */
function zipStore(files) {
  const out = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    let crc = 0;
    let size = 0;
    for (const chunk of file.chunks) {
      crc = crc32Update(crc, chunk);
      size += chunk.length;
    }
    const DOS_TIME = 0;
    const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01

    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(DOS_TIME), ...u16(DOS_DATE),
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0),
    ]);
    out.push(local, nameBytes, ...file.chunks);

    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
        ...u16(DOS_TIME), ...u16(DOS_DATE),
        ...u32(crc), ...u32(size), ...u32(size),
        ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(offset),
      ]),
      nameBytes,
    );
    offset += local.length + nameBytes.length + size;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  return [...out, ...central, end];
}

/* ------------------------------ XML ------------------------------- */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function xmlEscape(value) {
  return String(value)
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cellXml(value, ref, style) {
  const s = style ? ` s="${style}"` : "";
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}" t="b"${s}><v>${value ? 1 : 0}</v></c>`;
  }
  let text = String(value);
  if (text.length > MAX_CELL_CHARS) text = text.slice(0, MAX_CELL_CHARS - 1) + "\u2026";
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function sheetChunks(columns, rows) {
  const chunks = [];
  const widths = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`)
    .join("");
  const lastCol = columnName(Math.max(columns.length - 1, 0));

  chunks.push(
    encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
        `<cols>${widths}</cols><sheetData>` +
        `<row r="1">${columns.map((c, i) => cellXml(c.header, `${columnName(i)}1`, 1)).join("")}</row>`,
    ),
  );

  const BATCH = 500;
  for (let start = 0; start < rows.length; start += BATCH) {
    let xml = "";
    const end = Math.min(start + BATCH, rows.length);
    for (let r = start; r < end; r++) {
      const rowNum = r + 2;
      const row = rows[r];
      let cells = "";
      for (let c = 0; c < columns.length; c++) {
        cells += cellXml(row[c], `${columnName(c)}${rowNum}`, 0);
      }
      xml += `<row r="${rowNum}">${cells}</row>`;
    }
    chunks.push(encoder.encode(xml));
  }

  chunks.push(
    encoder.encode(
      `</sheetData><autoFilter ref="A1:${lastCol}${rows.length + 1}"/></worksheet>`,
    ),
  );
  return chunks;
}

function sheetName(name) {
  return String(name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

/**
 * @param {{ name: string, columns: { header: string, width?: number }[], rows: any[][] }[]} sheets
 * @returns {Blob | Uint8Array[]} Blob in the browser, raw parts elsewhere
 */
export function buildXlsx(sheets) {
  const sheetEntries = sheets.map((s, i) => ({
    id: i + 1,
    name: sheetName(s.name),
    chunks: sheetChunks(s.columns, s.rows),
  }));

  const text = (str) => [encoder.encode(str)];

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheetEntries
      .map(
        (s) =>
          `<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    sheetEntries
      .map((s) => `<sheet name="${xmlEscape(s.name)}" sheetId="${s.id}" r:id="rId${s.id}"/>`)
      .join("") +
    `</sheets>` +
    `<definedNames>` +
    sheetEntries
      .map((s, i) => {
        const cols = sheets[i].columns.length;
        const last = columnName(Math.max(cols - 1, 0));
        return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEscape(s.name).replace(/'/g, "''")}'!$A$1:$${last}$${sheets[i].rows.length + 1}</definedName>`;
      })
      .join("") +
    `</definedNames>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheetEntries
      .map(
        (s) =>
          `<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${sheetEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F4"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const parts = zipStore([
    { name: "[Content_Types].xml", chunks: text(contentTypes) },
    { name: "_rels/.rels", chunks: text(rootRels) },
    { name: "xl/workbook.xml", chunks: text(workbook) },
    { name: "xl/_rels/workbook.xml.rels", chunks: text(workbookRels) },
    { name: "xl/styles.xml", chunks: text(styles) },
    ...sheetEntries.map((s) => ({ name: `xl/worksheets/sheet${s.id}.xml`, chunks: s.chunks })),
  ]);

  if (typeof Blob !== "undefined") {
    return new Blob(parts, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  return parts;
}
