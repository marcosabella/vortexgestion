export type TelemetriaMuestra = {
  timestamp: string; sequence: number; latitude: number | null; longitude: number | null;
  altitude_m: number | null; accuracy_m: number | null; speed_kmh: number | null;
  heading_deg: number | null; engine_hours: number | null; fuel_liters: number | null;
  distance_km: number | null; area_ha: number | null; engine_on: boolean | null;
  working: boolean | null; external_id: string | null; extra: Record<string, never>;
};
export type TelemetriaParseResult = { format: "csv" | "gpx"; samples: TelemetriaMuestra[]; errors: string[] };

const columns = ["timestamp","latitude","longitude","altitude_m","accuracy_m","speed_kmh","heading_deg","engine_hours","fuel_liters","distance_km","area_ha","engine_on","working","external_id"] as const;
const bool = (value: string, row: number, name: string): boolean | null => {
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Fila ${row}: ${name} debe ser true o false.`);
};
const number = (value: string, row: number, name: string): number | null => {
  if (value === "") return null;
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) throw new Error(`Fila ${row}: ${name} debe usar un numero finito con punto decimal.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Fila ${row}: ${name} no es finito.`);
  return parsed;
};
const validate = (sample: TelemetriaMuestra, row: number) => {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(sample.timestamp) || Number.isNaN(Date.parse(sample.timestamp))) throw new Error(`Fila ${row}: timestamp ISO 8601 obligatorio.`);
  if ((sample.latitude === null) !== (sample.longitude === null)) throw new Error(`Fila ${row}: latitude y longitude deben informarse juntas.`);
  if (sample.latitude !== null && (sample.latitude < -90 || sample.latitude > 90)) throw new Error(`Fila ${row}: latitude fuera de rango.`);
  if (sample.longitude !== null && (sample.longitude < -180 || sample.longitude > 180)) throw new Error(`Fila ${row}: longitude fuera de rango.`);
  for (const key of ["accuracy_m","speed_kmh","heading_deg","engine_hours","fuel_liters","distance_km","area_ha"] as const) if (sample[key] !== null && sample[key]! < 0) throw new Error(`Fila ${row}: ${key} no puede ser negativo.`);
  if (sample.speed_kmh !== null && sample.speed_kmh > 500) throw new Error(`Fila ${row}: speed_kmh fuera de rango.`);
  if (sample.heading_deg !== null && sample.heading_deg >= 360) throw new Error(`Fila ${row}: heading_deg fuera de rango.`);
};
function parseCsvLine(line: string): string[] {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; } else if (char === "," && !quoted) { values.push(value); value = ""; } else value += char; }
  if (quoted) throw new Error("Comillas CSV sin cerrar."); values.push(value); return values;
}
export function parseCsv(content: string): TelemetriaParseResult {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) return { format: "csv", samples: [], errors: ["El CSV esta vacio."] };
  try {
    const header = parseCsvLine(lines[0]).map((x) => x.trim());
    if (header.length !== columns.length || new Set(header).size !== header.length || header.some((x, i) => x !== columns[i])) throw new Error("Encabezados CSV invalidos: deben coincidir exactamente con el formato canonico.");
    const samples = lines.slice(1).map((line, index) => {
      const row = index + 2, values = parseCsvLine(line); if (values.length !== header.length) throw new Error(`Fila ${row}: cantidad de columnas invalida.`);
      const record = Object.fromEntries(header.map((name, i) => [name, values[i].trim()]));
      const sample: TelemetriaMuestra = { timestamp: record.timestamp, sequence: index + 1, latitude: number(record.latitude,row,"latitude"), longitude:number(record.longitude,row,"longitude"), altitude_m:number(record.altitude_m,row,"altitude_m"), accuracy_m:number(record.accuracy_m,row,"accuracy_m"), speed_kmh:number(record.speed_kmh,row,"speed_kmh"), heading_deg:number(record.heading_deg,row,"heading_deg"), engine_hours:number(record.engine_hours,row,"engine_hours"), fuel_liters:number(record.fuel_liters,row,"fuel_liters"), distance_km:number(record.distance_km,row,"distance_km"), area_ha:number(record.area_ha,row,"area_ha"), engine_on:bool(record.engine_on,row,"engine_on"), working:bool(record.working,row,"working"), external_id:record.external_id || null, extra:{} };
      validate(sample,row); return sample;
    });
    return { format:"csv", samples, errors:[] };
  } catch (error) { return { format:"csv", samples:[], errors:[error instanceof Error ? error.message : "CSV invalido."] }; }
}
export function parseGpx(content: string): TelemetriaParseResult {
  if (/<!DOCTYPE/i.test(content)) return { format:"gpx", samples:[], errors:["GPX con DOCTYPE no permitido."] };
  const xml = new DOMParser().parseFromString(content,"application/xml");
  if (xml.querySelector("parsererror")) return { format:"gpx", samples:[], errors:["XML GPX invalido."] };
  try {
    const samples = Array.from(xml.getElementsByTagName("trkpt")).map((point,index) => {
      const row=index+1, lat=number(point.getAttribute("lat") ?? "",row,"latitude"), lon=number(point.getAttribute("lon") ?? "",row,"longitude"), time=point.getElementsByTagName("time")[0]?.textContent?.trim() ?? "", ele=point.getElementsByTagName("ele")[0]?.textContent?.trim() ?? "";
      const sample:TelemetriaMuestra={timestamp:time,sequence:row,latitude:lat,longitude:lon,altitude_m:number(ele,row,"altitude_m"),accuracy_m:null,speed_kmh:null,heading_deg:null,engine_hours:null,fuel_liters:null,distance_km:null,area_ha:null,engine_on:null,working:null,external_id:null,extra:{}};
      validate(sample,row); return sample;
    });
    if (!samples.length) throw new Error("GPX sin puntos trkpt."); return {format:"gpx",samples,errors:[]};
  } catch(error) { return {format:"gpx",samples:[],errors:[error instanceof Error?error.message:"GPX invalido."]}; }
}
export async function sha256(file: File) { const bytes=await crypto.subtle.digest("SHA-256",await file.arrayBuffer()); return Array.from(new Uint8Array(bytes)).map((x)=>x.toString(16).padStart(2,"0")).join(""); }
export const canonicalColumns = columns;
