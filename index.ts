import { createClient } from "npm:@supabase/supabase-js@2";

// My Heise App – E-Mail-Versand über Microsoft Graph (Absender: Postfach aus MAIL_ABSENDER).
// Das Senderecht ist in Exchange Online auf genau dieses Postfach beschränkt (RBAC für Anwendungen).
// Secrets in Supabase: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_ABSENDER.
// Aufruf aus der App mit dem Login-Token im Header 'x-user-token'.
// Aktionen (Stand 13.10.2026 abends):
//   lauf     – ohne Anmeldung (Zeitplan pg_cron alle 15 Min.): verschickt fällige Erinnerungen.
//              Jede Erinnerung läuft pro Zeitfenster nur einmal (letzter_lauf), doppelte Aufrufe schaden nicht.
//   test     – nur Admin: Testmail an die eigene E-Mail-Adresse (oder body.an)
//   vorschau – nur Admin: wer bekäme jetzt eine Erinnerung (body.typ)
//   jetzt    – nur Admin: Erinnerung sofort verschicken (body.typ), unabhängig vom Zeitplan
//   ereignis – angemeldete Nutzer Projekte: „Bautagebuch/Aufmaß unterschrieben“ mit PDF (body.typ, objekt_id, projekt_id, titel, pdf)
//              body.ohne_ag = true: nur der Monteur hat unterschrieben, niemand vor Ort (body.notiz); eigene Mail, Unterschrift wird nachgeholt
//   nachricht– nur Admin: neue Nachricht aus der App zusätzlich per E-Mail (body.gruppe_id)
//   zugang   – nur Admin: Zugangsdaten an neuen Benutzer / nach Passwort-Zurücksetzen (body.an, name, benutzername, passwort, neu)
// Erinnerungen: unterweisung, pruefung (Leitern/Geräte), fuhrpark.
// Jede gesendete E-Mail wird in mail_protokoll eingetragen.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const APP_URL = "https://myheiseapp.pages.dev/";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const mailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/* ---------- Microsoft Graph ---------- */
let tokenCache: { t: string; exp: number } | null = null;
async function graphToken(): Promise<string> {
  if (tokenCache && tokenCache.exp - Date.now() > 60_000) return tokenCache.t;
  const tenant = Deno.env.get("MS_TENANT_ID"), id = Deno.env.get("MS_CLIENT_ID"), secret = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenant || !id || !secret) throw new Error("Microsoft-Zugang fehlt: MS_TENANT_ID, MS_CLIENT_ID oder MS_CLIENT_SECRET ist in Supabase nicht eingetragen.");
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "https://graph.microsoft.com/.default" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Anmeldung bei Microsoft fehlgeschlagen: ${j.error || r.status}${j.error === "invalid_client" ? " (geheimer Clientschlüssel falsch oder abgelaufen)" : ""}`);
  tokenCache = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.t;
}

type Anhang = { name: string; typ: string; base64: string };
async function sendMail(an: string, betreff: string, html: string, anhaenge: Anhang[] = []) {
  const absender = Deno.env.get("MAIL_ABSENDER");
  if (!absender) throw new Error("MAIL_ABSENDER ist in Supabase nicht eingetragen.");
  const tok = await graphToken();
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(absender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: betreff,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: an } }],
        attachments: anhaenge.map((a) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.typ, contentBytes: a.base64 })),
      },
      saveToSentItems: true,
    }),
  });
  if (r.status !== 202) {
    const j = await r.json().catch(() => ({}));
    const code = j?.error?.code || r.status;
    throw new Error(`Versand abgelehnt (${code})${code === "ErrorAccessDenied" ? ": Die App darf aus diesem Postfach nicht senden. MAIL_ABSENDER und Exchange-Recht prüfen." : ""}`);
  }
}

/* ---------- E-Mail im Heise-Design ---------- */
function layout(titel: string, inhalt: string, knopf?: { text: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Montserrat,Segoe UI,Arial,sans-serif;color:#1f2633">
<tr><td style="background:#2f3b53;padding:18px 24px;color:#ffffff;font-size:13px;letter-spacing:.08em;font-weight:700">MY HEISE APP<span style="color:#e25304"> ·</span> HEISE HAUSTECHNIK</td></tr>
<tr><td style="height:4px;background:#e25304;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 24px 8px"><h1 style="margin:0 0 12px;font-size:21px;line-height:1.25;color:#2f3b53">${esc(titel)}</h1>
<div style="font-size:15px;line-height:1.55;color:#1f2633">${inhalt}</div>
${knopf ? `<p style="margin:22px 0 6px"><a href="${esc(knopf.url)}" style="display:inline-block;background:#e25304;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${esc(knopf.text)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 24px 22px;font-size:12px;line-height:1.5;color:#868d9b;border-top:1px solid #e1e4e9">Diese E-Mail wurde automatisch von der My Heise App verschickt.<br>Heise Haustechnik GmbH &amp; Co. KG · Braunlage</td></tr>
</table></td></tr></table></body></html>`;
}


/* ---------- Zeitplan (Uhrzeit Deutschland) ---------- */
type Einst = { typ: string; titel: string; art: string; aktiv: boolean; rhythmus: string; tag: number; uhrzeit: string; empfaenger: string[]; letzter_lauf: string | null };
function berlinJetzt() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1; // 1 = Montag
  return { y: +p.year, m: +p.month, d: +p.day, hm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, wd };
}
// Berliner Ortszeit (Datum + HH:MM) als Zeitpunkt
function berlinZeitpunkt(y: number, m: number, d: number, hm: string) {
  const [h, mi] = hm.split(":").map(Number);
  const utc = Date.UTC(y, m - 1, d, h, mi);
  const off = new Date(new Date(utc).toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime() - new Date(new Date(utc).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(utc - off);
}
function ersterWerktag(y: number, m: number) {
  for (let d = 1; d <= 7; d++) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (w >= 1 && w <= 5) return d; }
  return 1;
}
// Liefert den Beginn des aktuellen Zeitfensters, wenn die Erinnerung heute fällig ist und die Uhrzeit erreicht ist
function faelligAb(e: Einst): Date | null {
  const n = berlinJetzt();
  let heute = false;
  if (e.rhythmus === "monatlich") heute = n.d === (e.tag === 0 ? ersterWerktag(n.y, n.m) : e.tag);
  else if (e.rhythmus === "woechentlich") heute = n.wd === (e.tag || 1);
  else if (e.rhythmus === "taeglich") heute = n.wd <= 5;
  if (!heute || n.hm < (e.uhrzeit || "07:00")) return null;
  return berlinZeitpunkt(n.y, n.m, n.d, e.uhrzeit || "07:00");
}

/* ---------- Inhalte der Erinnerungen ---------- */
type Offen = { benutzer_id: string; name: string; email: string | null; punkte: string[]; datum?: string; stufe?: string; schluessel?: string };
type Db = ReturnType<typeof createClient>;
const ladeRpc = (fn: string, was: string) => async (db: Db): Promise<Offen[]> => {
  const { data, error } = await db.rpc(fn);
  if (error) throw new Error(`${was} konnten nicht gelesen werden: ${error.message}`);
  return (data || []).map((r: { benutzer_id: string; name: string; email: string | null; themen: string[] }) => ({ benutzer_id: r.benutzer_id, name: r.name, email: r.email, punkte: r.themen || [] }));
};
const liste = (p: string[]) => `<ul style="margin:0 0 12px;padding-left:20px">${p.map((t) => `<li style="margin:0 0 4px">${esc(t)}</li>`).join("")}</ul>`;
/* Führerscheinkontrolle: E-Mail an den Fahrer selbst (automatisch 3 Wochen vorher / bei Fälligkeit oder von Hand aus dem Fuhrpark) */
const datumDe = (d?: string | null) => d ? String(d).slice(0, 10).split("-").reverse().join(".") : "";
function fsBetreff(datum: string | null, faellig: boolean) {
  return !datum ? "Führerscheinkontrolle: bitte Führerschein vorlegen" : faellig ? `Führerscheinkontrolle fällig seit ${datumDe(datum)}` : `Führerscheinkontrolle: läuft am ${datumDe(datum)} ab`;
}
function fsHtml(name: string, datum: string | null, faellig: boolean, von?: string) {
  const satz = !datum ? "dein Führerschein wurde für die Firmenfahrzeuge noch nicht kontrolliert."
    : faellig ? `deine Führerscheinkontrolle ist seit dem <b>${datumDe(datum)}</b> fällig.`
    : `deine Führerscheinkontrolle läuft am <b>${datumDe(datum)}</b> ab.`;
  return layout(faellig || !datum ? "Bitte Führerschein vorlegen" : "Deine Führerscheinkontrolle läuft ab",
    `<p style="margin:0 0 10px">Hallo ${esc((name || "").split(" ")[0])},</p>
<p style="margin:0 0 10px">${satz}</p>
<p style="margin:0 0 10px"><b>Bitte melde dich mit deinem Führerschein im Lager oder bei den Admins im Büro zur Kontrolle.</b></p>
<p style="margin:0 0 10px">Die Kontrolle dauert nur eine Minute: Original-Führerschein zeigen, kurz unterschreiben, fertig. Ohne gültige Kontrolle darfst du keine Firmenfahrzeuge fahren.</p>
${von ? `<p style="margin:0;color:#868d9b;font-size:13px">Erinnerung von ${esc(von)}</p>` : ""}`,
    { text: "Meinen Stand ansehen", url: APP_URL + "fahrzeuge.html#/fahrer" });
}
type ErDef = {
  laden: (db: Db) => Promise<Offen[]>; betreff: (o: Offen) => string; html: (o: Offen) => string;
  vorher?: (db: Db, o: Offen) => Promise<boolean>;   // false = überspringen (z. B. schon verschickt)
  stillWennLeer?: boolean;                          // keine Zusammenfassung, wenn niemand etwas bekam
};
const ERINNERUNG: Record<string, ErDef> = {
  unterweisung: {
    laden: ladeRpc("mail_offen_unterweisung", "Unterweisungen"),
    betreff: (o) => `Erinnerung: ${o.punkte.length} offene ${o.punkte.length === 1 ? "Unterweisung" : "Unterweisungen"}`,
    html: (o) => {
      const jahr = berlinJetzt().y;
      return layout(`Du hast noch ${o.punkte.length} offene ${o.punkte.length === 1 ? "Unterweisung" : "Unterweisungen"}`,
        `<p style="margin:0 0 10px">Hallo ${esc((o.name || "").split(" ")[0])},</p>
<p style="margin:0 0 10px">für ${jahr} fehlen dir noch diese Sicherheitsunterweisungen:</p>
${liste(o.punkte)}
<p style="margin:0">Jede Unterweisung dauert nur ein paar Minuten: Folien ansehen, Fragen beantworten, unterschreiben. Frist ist der 31.12.${jahr}.</p>`,
        { text: "Unterweisungen öffnen", url: APP_URL + "unterweisung.html" });
    },
  },
  pruefung: {
    laden: ladeRpc("mail_offen_pruefung", "Prüffristen"),
    betreff: (o) => `Prüffristen: ${o.punkte.length} ${o.punkte.length === 1 ? "Termin" : "Termine"} in den nächsten 30 Tagen`,
    html: (o) => layout(`${o.punkte.length} ${o.punkte.length === 1 ? "Prüftermin steht" : "Prüftermine stehen"} an`,
      `<p style="margin:0 0 10px">Hallo ${esc((o.name || "").split(" ")[0])},</p>
<p style="margin:0 0 10px">diese Prüfungen und Fristen sind überfällig oder in den nächsten 30 Tagen fällig:</p>
${liste(o.punkte)}
<p style="margin:0">Bitte kümmere dich rechtzeitig darum. Erledigte Prüfungen trägst du in der App ein, dann verschwinden sie aus dieser Liste.</p>`,
      { text: "My Heise App öffnen", url: APP_URL }),
  },
  fuhrpark: {
    laden: ladeRpc("mail_offen_fuhrpark", "Fuhrpark-Termine"),
    betreff: (o) => `Fuhrpark: ${o.punkte.length} ${o.punkte.length === 1 ? "Termin" : "Termine"} in den nächsten 30 Tagen`,
    html: (o) => layout(`${o.punkte.length} Fuhrpark-${o.punkte.length === 1 ? "Termin steht" : "Termine stehen"} an`,
      `<p style="margin:0 0 10px">Hallo ${esc((o.name || "").split(" ")[0])},</p>
<p style="margin:0 0 10px">diese Termine sind überfällig oder in den nächsten 30 Tagen fällig:</p>
${liste(o.punkte)}
<p style="margin:0">Erledigte Termine trägst du im Fuhrpark ein, dann verschwinden sie aus dieser Liste.</p>`,
      { text: "Fuhrpark öffnen", url: APP_URL + "fahrzeuge.html" }),
  },
  // täglich: wer in 3 Wochen (oder schon) fällig ist und diese Stufe noch nicht bekommen hat
  fuehrerschein: {
    laden: async (db) => {
      const { data, error } = await db.rpc("mail_fs_faellig");
      if (error) throw new Error(`Führerscheinkontrollen konnten nicht gelesen werden: ${error.message}`);
      return (data || []).map((r: { benutzer_id: string; name: string; email: string | null; themen: string[]; datum: string; stufe: string; schluessel: string }) =>
        ({ benutzer_id: r.benutzer_id, name: r.name, email: r.email, punkte: r.themen || [], datum: r.datum, stufe: r.stufe, schluessel: r.schluessel }));
    },
    betreff: (o) => fsBetreff(o.datum || null, o.stufe === "faellig"),
    html: (o) => fsHtml(o.name, o.datum || null, o.stufe === "faellig"),
    vorher: async (db, o) => {
      if (!o.schluessel) return false;
      const { data: neu } = await db.from("mail_ereignisse").upsert({ schluessel: o.schluessel }, { onConflict: "schluessel", ignoreDuplicates: true }).select("schluessel");
      if (!neu?.length) return false;
      const faellig = o.stufe === "faellig";
      await db.from("benachrichtigungen").insert({
        titel: "Führerscheinkontrolle", wichtig: true, empfaenger_id: o.benutzer_id, absender: "My Heise App", gruppe_id: crypto.randomUUID(),
        nachricht: `${faellig ? `Deine Führerscheinkontrolle ist seit ${datumDe(o.datum)} fällig.` : `Deine Führerscheinkontrolle läuft am ${datumDe(o.datum)} ab.`} Bitte melde dich mit deinem Führerschein im Lager oder bei den Admins im Büro zur Kontrolle!`,
      });
      return true;
    },
    stillWennLeer: true,
  },
};

async function erinnerungSenden(db: Db, e: Einst, protokoll: (typ: string, an: string, name: string, betreff: string, ok: boolean, fehler?: string) => unknown) {
  const def = ERINNERUNG[e.typ];
  const liste = (await def.laden(db)).filter((o) => o.punkte.length);
  const erg: { name: string; anzahl: number; status: string }[] = [];
  for (const o of liste) {
    if (def.vorher && !(await def.vorher(db, o))) continue;
    if (!o.email || !mailOk(o.email)) { erg.push({ name: o.name, anzahl: o.punkte.length, status: "keine E-Mail" }); continue; }
    const betreff = def.betreff(o);
    try { await sendMail(o.email, betreff, def.html(o)); await protokoll(e.typ, o.email, o.name, betreff, true); erg.push({ name: o.name, anzahl: o.punkte.length, status: "gesendet" }); }
    catch (err) { const m = String((err as Error).message ?? err); await protokoll(e.typ, o.email, o.name, betreff, false, m); erg.push({ name: o.name, anzahl: o.punkte.length, status: "Fehler" }); }
  }
  if (!(def.stillWennLeer && !erg.length)) await zusammenfassung(db, e, erg, protokoll);
  return erg;
}

async function zusammenfassung(db: Db, e: Einst, erg: { name: string; anzahl: number; status: string }[], protokoll: (typ: string, an: string, name: string, betreff: string, ok: boolean, fehler?: string) => unknown) {
  const { data: z } = await db.from("mail_einstellungen").select("aktiv,empfaenger").eq("typ", "zusammenfassung").maybeSingle();
  if (!z?.aktiv || !(z.empfaenger || []).length) return;
  const { data: leute } = await db.from("benutzer").select("id,name,email").in("id", z.empfaenger);
  const betreff = `Zusammenfassung: ${e.titel}`;
  const zeilen = erg.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
<tr><th align="left" style="padding:6px 8px;border-bottom:2px solid #2f3b53">Name</th><th align="right" style="padding:6px 8px;border-bottom:2px solid #2f3b53">offen</th><th align="left" style="padding:6px 8px;border-bottom:2px solid #2f3b53">E-Mail</th></tr>
${erg.map((r) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e1e4e9">${esc(r.name)}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #e1e4e9">${r.anzahl}</td><td style="padding:6px 8px;border-bottom:1px solid #e1e4e9;color:${r.status === "gesendet" ? "#15803d" : "#c32328"}">${esc(r.status)}</td></tr>`).join("")}</table>`
    : `<p style="margin:0">Niemand hat etwas offen. Es wurden keine Erinnerungen verschickt.</p>`;
  const html = layout(betreff, `<p style="margin:0 0 12px">${erg.length} ${erg.length === 1 ? "Person hat" : "Personen haben"} noch etwas offen.</p>${zeilen}`, { text: "My Heise App öffnen", url: APP_URL });
  for (const p of leute || []) {
    if (!p.email || !mailOk(p.email)) continue;
    try { await sendMail(p.email, betreff, html); await protokoll("zusammenfassung", p.email, p.name, betreff, true); }
    catch (err) { await protokoll("zusammenfassung", p.email, p.name, betreff, false, String((err as Error).message ?? err)); }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const protokoll = (typ: string, an: string, name: string, betreff: string, ok: boolean, fehler?: string) =>
    db.from("mail_protokoll").insert({ typ, an, name, betreff, ok, fehler: fehler ?? null });

  try {
    const body = await req.json().catch(() => ({}));

    // --- Zeitplan: fällige Erinnerungen (ohne Anmeldung, verschickt jede nur einmal pro Zeitfenster) ---
    if (body.action === "lauf") {
      const { data: liste } = await db.from("mail_einstellungen").select("*").eq("art", "erinnerung").eq("aktiv", true);
      const gelaufen: string[] = [];
      for (const e of (liste || []) as Einst[]) {
        if (!ERINNERUNG[e.typ]) continue;
        const ab = faelligAb(e);
        if (!ab) continue;
        // Zeitfenster beanspruchen: nur ein Aufruf gewinnt
        const { data: claim } = await db.from("mail_einstellungen").update({ letzter_lauf: new Date().toISOString() })
          .eq("typ", e.typ).or(`letzter_lauf.is.null,letzter_lauf.lt.${ab.toISOString()}`).select("typ");
        if (!claim?.length) continue;
        await erinnerungSenden(db, e, protokoll);
        gelaufen.push(e.typ);
      }
      return json({ ok: true, gelaufen });
    }

    // --- Aufrufer prüfen ---
    const token = (req.headers.get("x-user-token") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Nicht angemeldet" }, 401);
    const { data: ud, error: ue } = await db.auth.getUser(token);
    if (ue || !ud?.user) return json({ error: "Anmeldung ungültig oder abgelaufen" }, 401);
    const { data: caller } = await db.from("benutzer").select("id,name,email,rolle").eq("auth_id", ud.user.id).maybeSingle();
    if (!caller) return json({ error: "Kein Benutzerprofil" }, 403);

    // --- Testmail (Admin) ---
    if (body.action === "test") {
      if (caller.rolle !== "admin") return json({ error: "Nur für Administratoren" }, 403);
      const an = String(body.an || caller.email || "").trim();
      if (!mailOk(an)) return json({ error: "Für dich ist keine E-Mail-Adresse hinterlegt. Bitte in Benutzer & Zugriff eintragen." }, 400);
      const betreff = "Testmail der My Heise App";
      const html = layout("Der E-Mail-Versand funktioniert",
        `<p style="margin:0 0 10px">Hallo ${esc((caller.name || "").split(" ")[0])},</p><p style="margin:0 0 10px">diese Testmail kommt automatisch aus der My Heise App, ohne Outlook. Absender ist das Postfach ${esc(Deno.env.get("MAIL_ABSENDER") || "")}.</p><p style="margin:0">Erinnerungen und Benachrichtigungen kommen künftig in diesem Aussehen.</p>`,
        { text: "My Heise App öffnen", url: APP_URL });
      try { await sendMail(an, betreff, html); } catch (e) {
        const m = String((e as Error).message ?? e); await protokoll("test", an, caller.name, betreff, false, m); return json({ error: m }, 502);
      }
      await protokoll("test", an, caller.name, betreff, true);
      return json({ ok: true, an });
    }

    // --- Zugangsdaten an neuen Benutzer oder nach Passwort-Zurücksetzen (Admin) ---
    if (body.action === "zugang") {
      if (caller.rolle !== "admin") return json({ error: "Nur für Administratoren" }, 403);
      const an = String(body.an || "").trim(), name = String(body.name || ""), user = String(body.benutzername || ""), pw = String(body.passwort || "");
      const neu = !!body.neu;
      if (!mailOk(an)) return json({ error: "Bitte eine gültige E-Mail-Adresse eingeben." }, 400);
      if (!user || pw.length < 8) return json({ error: "Benutzername oder Startpasswort fehlt." }, 400);
      const betreff = neu ? "Dein Zugang zur My Heise App" : "My Heise App: neues Startpasswort";
      const zeile = (k: string, v: string) => `<tr><td style="padding:8px 12px;color:#5b6475;font-size:14px;border-bottom:1px solid #e1e4e9">${k}</td><td style="padding:8px 12px;font-size:16px;font-weight:700;font-family:Consolas,Menlo,monospace;border-bottom:1px solid #e1e4e9">${esc(v)}</td></tr>`;
      const html = layout(neu ? "Dein Zugang zur My Heise App" : "Dein Passwort wurde zurückgesetzt",
        `<p style="margin:0 0 10px">Hallo ${esc(name.split(" ")[0])},</p>
<p style="margin:0 0 14px">${neu ? "hier sind deine Zugangsdaten für die My Heise App." : "dein Passwort für die My Heise App wurde zurückgesetzt. Hier ist dein neues Startpasswort."}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4f5f7;border-radius:10px;margin:0 0 14px">
${zeile("Adresse", APP_URL)}${zeile("Benutzername", user)}${zeile("Startpasswort", pw)}</table>
<p style="margin:0 0 10px">Beim ersten Anmelden vergibst du dir ein eigenes Passwort. Das Startpasswort gilt nur bis dahin.</p>
<p style="margin:0 0 10px;color:#868d9b;font-size:13px">Tipp: Auf dem Handy die Adresse öffnen und „Zum Startbildschirm hinzufügen“ wählen, dann hast du die App als Symbol.</p>
<p style="margin:0">Viele Grüße<br>${esc(caller.name || "")}</p>`,
        { text: "My Heise App öffnen", url: APP_URL });
      try { await sendMail(an, betreff, html); } catch (e) {
        const m = String((e as Error).message ?? e); await protokoll("zugang", an, name, betreff, false, m); return json({ error: m }, 502);
      }
      await protokoll("zugang", an, name, betreff, true);
      return json({ ok: true, an });
    }

    // --- Ereignis: Bautagebuch/Aufmaß unterschrieben (mit PDF) ---
    if (body.action === "ereignis") {
      const typ = String(body.typ || "");
      // Protokolle und Zusätzliche Arbeiten laufen über die Einstellung „Bautagebuch unterschrieben“ (gleiche Empfänger)
      const ARTEN: Record<string, { einst: string; art: string; link: (pid: string, id: string) => string }> = {
        btb_unterschrift: { einst: "btb_unterschrift", art: "Bautagebuch", link: (p, i) => `projekte/bautagebuch.html?p=${p}&id=${i}` },
        aufmass_unterschrift: { einst: "aufmass_unterschrift", art: "Aufmaß", link: (_p, i) => `projekte/aufmass.html?id=${i}` },
        protokoll_unterschrift: { einst: "btb_unterschrift", art: "Protokoll", link: (p, i) => `projekte/protokoll.html?p=${p}&pr=${i}` },
        zusatz_unterschrift: { einst: "btb_unterschrift", art: "Zusatzauftrag", link: (p, i) => `projekte/zusatz.html?p=${p}&za=${i}` },
        stunden_unterschrift: { einst: "btb_unterschrift", art: "Stundennachweis", link: (p, i) => `projekte/zusatz.html?p=${p}&sn=${i}` },
      };
      const A = ARTEN[typ];
      if (!A) return json({ error: "Unbekanntes Ereignis" }, 400);
      if (caller.rolle !== "admin") {
        const { data: z } = await db.from("app_zugriff").select("rolle").eq("benutzer_id", caller.id).eq("app", "projekte").maybeSingle();
        if (!z) return json({ error: "Keine Berechtigung für Projekte" }, 403);
      }
      const { data: e } = await db.from("mail_einstellungen").select("*").eq("typ", A.einst).maybeSingle();
      if (!e?.aktiv) return json({ ok: true, aus: true });
      const objekt = String(body.objekt_id || ""), pid = String(body.projekt_id || "");
      if (!objekt || !pid) return json({ error: "Objekt oder Projekt fehlt" }, 400);
      const ohne = body.ohne_ag === true, notiz = String(body.notiz || "").trim().slice(0, 1000);
      const { data: neu } = await db.from("mail_ereignisse").upsert({ schluessel: `${typ}:${objekt}${ohne ? ":ohne" : ""}` }, { onConflict: "schluessel", ignoreDuplicates: true }).select("schluessel");
      if (!neu?.length) return json({ ok: true, schon: true });
      const { data: pj } = await db.from("pj_projekte").select("nr,name,adresse").eq("id", pid).maybeSingle();
      const ids = new Set<string>(e.empfaenger || []);
      if (e.bauleitung) { const { data: bl } = await db.rpc("mail_projekt_bauleitung", { p_projekt: pid }); (bl || []).forEach((b: { benutzer_id: string }) => ids.add(b.benutzer_id)); }
      const { data: leute } = ids.size ? await db.from("benutzer").select("id,name,email").in("id", [...ids]) : { data: [] };
      const art = A.art;
      const projekt = [pj?.nr, pj?.name].filter(Boolean).join(" · ") || "Projekt";
      const titel = String(body.titel || art);
      const pdf = body.pdf && typeof body.pdf.base64 === "string" ? body.pdf : null;
      const mitPdf = !!pdf && pdf.base64.length <= 3_000_000;
      const link = APP_URL + A.link(encodeURIComponent(pid), encodeURIComponent(objekt));
      const wer = String(body.unterschrieben || "").trim().slice(0, 300);
      const datum = body.datum ? " · " + String(body.datum).split("-").reverse().join(".") : "";
      const betreff = ohne ? `${art} ohne Unterschrift Auftraggeber: ${projekt}${datum}` : `${art} unterschrieben: ${projekt}${datum}`;
      const html = layout(ohne ? `${art}: Unterschrift des Auftraggebers fehlt` : `${art} unterschrieben`,
        `<p style="margin:0 0 10px"><b>${esc(titel)}</b><br>${esc(projekt)}${pj?.adresse ? "<br>" + esc(pj.adresse) : ""}</p>
${ohne
  ? `<p style="margin:0 0 10px">${esc(caller.name || "Der Monteur")} hat ${art === "Aufmaß" ? "das Aufmaß" : "das " + art} abgeschlossen und selbst unterschrieben. Vor Ort war niemand, der für den Auftraggeber unterschreiben konnte.</p>
${notiz ? `<p style="margin:0 0 10px;padding:10px 12px;background:#f4f5f7;border-radius:8px"><b>Hinweis vom Monteur:</b><br>${esc(notiz).replace(/\n/g, "<br>")}</p>` : ""}
<p style="margin:0 0 10px;color:#b54203;font-weight:700">Bitte das PDF an den Auftraggeber bzw. seinen Vertreter weiterleiten und die Unterschrift einholen.</p>`
  : `<p style="margin:0 0 10px">${wer ? esc(wer) : "Unterschrieben vom Auftraggeber"}, erfasst von ${esc(caller.name || "")}.</p>`}
<p style="margin:0">${mitPdf ? "Das unterschriebene PDF hängt an dieser E-Mail." : pdf ? "Das PDF ist zu groß für den Anhang. Du findest es in der App." : "Das PDF findest du in der App."}</p>`,
        { text: `${art} in der App öffnen`, url: link });
      let n = 0;
      for (const p of leute || []) {
        if (!p.email || !mailOk(p.email)) continue;
        try { await sendMail(p.email, betreff, html, mitPdf ? [{ name: String(pdf.name || art + ".pdf"), typ: "application/pdf", base64: pdf.base64 }] : []); await protokoll(A.einst, p.email, p.name, betreff, true); n++; }
        catch (err) { await protokoll(A.einst, p.email, p.name, betreff, false, String((err as Error).message ?? err)); }
      }
      return json({ ok: true, gesendet: n });
    }

    // --- Neue Nachricht aus der App zusätzlich per E-Mail (Admin) ---
    if (body.action === "nachricht") {
      if (caller.rolle !== "admin") return json({ error: "Nur für Administratoren" }, 403);
      const { data: e } = await db.from("mail_einstellungen").select("aktiv").eq("typ", "nachricht").maybeSingle();
      if (!e?.aktiv) return json({ ok: true, aus: true });
      const gid = String(body.gruppe_id || "");
      const { data: rows } = await db.from("benachrichtigungen").select("titel,nachricht,wichtig,empfaenger_id,absender").eq("gruppe_id", gid);
      if (!rows?.length) return json({ error: "Nachricht nicht gefunden" }, 404);
      const { data: neu } = await db.from("mail_ereignisse").upsert({ schluessel: `nachricht:${gid}` }, { onConflict: "schluessel", ignoreDuplicates: true }).select("schluessel");
      if (!neu?.length) return json({ ok: true, schon: true });
      const anAlle = rows.some((r: { empfaenger_id: string | null }) => !r.empfaenger_id);
      const q = db.from("benutzer").select("id,name,email");
      const { data: leute } = anAlle ? await q : await q.in("id", rows.map((r: { empfaenger_id: string }) => r.empfaenger_id));
      const m = rows[0];
      const betreff = `${m.wichtig ? "Wichtig: " : ""}${m.titel}`;
      const text = esc(m.nachricht || "").replace(/\n/g, "<br>");
      let n = 0;
      for (const p of leute || []) {
        if (p.id === caller.id || !p.email || !mailOk(p.email)) continue;
        const html = layout(m.titel, `<p style="margin:0 0 10px">Hallo ${esc((p.name || "").split(" ")[0])},</p>${m.wichtig ? '<p style="margin:0 0 10px;color:#c32328;font-weight:700">Wichtige Nachricht</p>' : ""}<p style="margin:0 0 10px">${text}</p><p style="margin:0;color:#868d9b;font-size:13px">Von ${esc(m.absender || caller.name || "")}</p>`,
          { text: "In der App lesen", url: APP_URL + "#/nachrichten" });
        try { await sendMail(p.email, betreff, html); await protokoll("nachricht", p.email, p.name, betreff, true); n++; }
        catch (err) { await protokoll("nachricht", p.email, p.name, betreff, false, String((err as Error).message ?? err)); }
      }
      return json({ ok: true, gesendet: n });
    }

    // --- Führerscheinkontrolle: Erinnerung von Hand (Admin, Rolle Fuhrpark, Lageristen) ---
    // Die App legt vorher per fuhr_fs_erinnern die Nachrichten an und schickt deren gruppe_id.
    if (body.action === "fs_erinnern") {
      let darf = caller.rolle === "admin";
      if (!darf) {
        const { data: z } = await db.from("app_zugriff").select("rolle").eq("benutzer_id", caller.id).eq("app", "fuhrpark").maybeSingle();
        if (z) {
          darf = ["fuhrpark", "admin"].includes(z.rolle);
          if (!darf) { const { data: l } = await db.from("fuhr_adblue_lager").select("benutzer_id").eq("benutzer_id", caller.id).maybeSingle(); darf = !!l; }
        }
      }
      if (!darf) return json({ error: "Erinnern dürfen nur Admins und das Lager." }, 403);
      const gid = String(body.gruppe_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(gid)) return json({ error: "Nachricht fehlt" }, 400);
      const { data: rows } = await db.from("benachrichtigungen").select("empfaenger_id").eq("gruppe_id", gid).eq("absender_id", caller.id).eq("titel", "Führerscheinkontrolle");
      if (!rows?.length) return json({ error: "Erinnerung nicht gefunden" }, 404);
      const { data: neu } = await db.from("mail_ereignisse").upsert({ schluessel: `fs_hand:${gid}` }, { onConflict: "schluessel", ignoreDuplicates: true }).select("schluessel");
      if (!neu?.length) return json({ ok: true, schon: true });
      const ids = rows.map((r: { empfaenger_id: string }) => r.empfaenger_id).filter(Boolean);
      const [{ data: leute }, { data: fs }] = await Promise.all([
        db.from("benutzer").select("id,name,email").in("id", ids),
        db.from("fuhr_fahrer").select("benutzer_id,naechste_kontrolle").in("benutzer_id", ids),
      ]);
      const heute = (() => { const n = berlinJetzt(); return `${n.y}-${String(n.m).padStart(2, "0")}-${String(n.d).padStart(2, "0")}`; })();
      let n = 0; const ohne: string[] = [];
      for (const p of leute || []) {
        if (!p.email || !mailOk(p.email)) { ohne.push(p.name); continue; }
        const d = (fs || []).find((x: { benutzer_id: string }) => x.benutzer_id === p.id)?.naechste_kontrolle || null;
        const faellig = !!d && String(d).slice(0, 10) <= heute;
        const betreff = fsBetreff(d, faellig);
        try { await sendMail(p.email, betreff, fsHtml(p.name, d, faellig, caller.name)); await protokoll("fuehrerschein", p.email, p.name, betreff, true); n++; }
        catch (err) { await protokoll("fuehrerschein", p.email, p.name, betreff, false, String((err as Error).message ?? err)); ohne.push(p.name); }
      }
      return json({ ok: true, gesendet: n, ohne_mail: ohne });
    }

    // --- Vorschau / sofort senden (Admin) ---
    if (body.action === "vorschau" || body.action === "jetzt") {
      if (caller.rolle !== "admin") return json({ error: "Nur für Administratoren" }, 403);
      const { data: e } = await db.from("mail_einstellungen").select("*").eq("typ", String(body.typ || "")).maybeSingle();
      if (!e || !ERINNERUNG[e.typ]) return json({ error: "Diese Erinnerung gibt es (noch) nicht." }, 400);
      if (body.action === "vorschau") {
        const liste = (await ERINNERUNG[e.typ].laden(db)).filter((o) => o.punkte.length);
        return json({ ok: true, liste: liste.map((o) => ({ name: o.name, email: o.email || "", anzahl: o.punkte.length, punkte: o.punkte })) });
      }
      await db.from("mail_einstellungen").update({ letzter_lauf: new Date().toISOString() }).eq("typ", e.typ);
      const erg = await erinnerungSenden(db, e as Einst, protokoll);
      return json({ ok: true, ergebnis: erg });
    }

    return json({ error: "Unbekannte Aktion" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
