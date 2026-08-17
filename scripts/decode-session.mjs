// Decode a multi-frame zstd session file and print event type order + user/turn positions.
import { readFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";

const file = process.argv[2];
const raw = readFileSync(file);
const MAGIC = 0xfd2fb528;
const out = [];
let i = 0;
while (i + 4 <= raw.length) {
  const magic = raw.readUInt32LE(i);
  if (magic !== MAGIC) { i++; continue; }
  // find next frame start
  let end = raw.length;
  for (let j = i + 4; j + 4 <= raw.length; j++) {
    if (raw.readUInt32LE(j) === MAGIC) { end = j; break; }
  }
  try {
    const decoded = zstdDecompressSync(raw.subarray(i, end));
    out.push(decoded);
  } catch (e) {
    console.error("frame decode error at", i, e.message);
  }
  i = end;
}
const text = Buffer.concat(out).toString("utf8");
const lines = text.split("\n").filter((l) => l.trim() !== "");
console.log("TOTAL LINES:", lines.length);

// Print every event type + turn markers
let seq = 0;
for (const line of lines) {
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (e && typeof e === "object" && e.type) {
    const d = e.data ?? {};
    const turn = d.turn !== undefined ? `turn=${d.turn}` : "";
    const id = d.id ? ` id=${String(d.id).slice(0, 20)}` : "";
    const source = d.source && d.source.kind ? ` src=${d.source.kind}` : "";
    console.log(`seq=${e.seq ?? seq} type=${e.type} ${turn}${id}${source}`);
    seq = (e.seq ?? seq) + 1;
  }
}
