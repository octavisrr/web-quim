// Genera la web a la carpeta dist/: una pàgina per idioma amb els textos ja
// escrits dins l'HTML, perquè Google pugui llegir i indexar cada idioma.
// Netlify l'executa sol cada vegada que hi ha un canvi (per exemple, quan
// en Quim desa un text des de /admin). No necessita cap dependència.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";

const SITE = "https://joaquimcoma.com";
const LANGS = ["ca", "es", "sv", "en"];
const PATHS = { ca: "/", es: "/es/", sv: "/sv/", en: "/en/" };
const LOCALES = { ca: "ca_ES", es: "es_ES", sv: "sv_SE", en: "en_GB" };
const ROOM_ALT = {
  ca: "La consulta a Göteborg",
  es: "La consulta en Gotemburgo",
  sv: "Mottagningen i Göteborg",
  en: "The practice in Gothenburg",
};
const LANG_NAMES = ["Catalan", "Spanish", "Swedish", "English"];
const SECTIONS = ["portada", "qui_soc", "formacio", "preguntes", "contacte", "formulari", "menu", "general"];

const data = {};
for (const id of SECTIONS) data[id] = JSON.parse(readFileSync(`content/${id}.json`, "utf8"));

const TEXTS = {};
for (const sec of Object.values(data)) {
  for (const [k, v] of Object.entries(sec)) if (k !== "llista") TEXTS[k] = v;
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tr = (v, lang) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return (v[lang] && String(v[lang]).trim()) || v.ca || "";
};
const paras = (text) => text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
  .map((s) => `<p>${esc(s.replace(/\n/g, " "))}</p>`).join("");
const abs = (u) => (!u ? "" : /^https?:/.test(u) ? u : SITE + (u.startsWith("/") ? u : "/" + u));

// Afegeix o substitueix un atribut a l'etiqueta que té id="..."
function setAttr(html, id, attr, value) {
  const re = new RegExp(`<([a-z0-9]+)([^>]*\\sid="${id}")([^>]*)>`);
  return html.replace(re, (m, tag, a, b) => {
    const rest = (a + b).replace(new RegExp(`\\s${attr}="[^"]*"`), "");
    return `<${tag}${rest} ${attr}="${esc(value)}">`;
  });
}
// Omple el contingut d'una etiqueta buida que té id="..."
function fillId(html, id, inner) {
  const re = new RegExp(`(<([a-z0-9]+)[^>]*\\sid="${id}"[^>]*>)(</\\2>)`);
  return html.replace(re, (m, open, tag, close) => open + inner + close);
}

const template = readFileSync("src/plantilla.html", "utf8");

function page(lang) {
  const t = (k) => tr(TEXTS[k], lang);
  const url = SITE + PATHS[lang];
  let html = template;

  html = html.replace('<html lang="ca">', `<html lang="${lang}">`);

  // Capçalera: títol, descripció, idiomes alternatius, xarxes socials i fitxa per a Google
  const photo = abs(t("foto"));
  const ld = {
    "@context": "https://schema.org",
    "@type": ["MedicalBusiness", "LocalBusiness"],
    "@id": SITE + "/#consulta",
    name: `${t("hero_name")} · ${t("hero_role")}`,
    description: t("meta_description"),
    url,
    image: photo || undefined,
    telephone: t("contact_phone").replace(/\s+/g, ""),
    email: t("contact_email") || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Götabergsgatan 7",
      postalCode: "411 34",
      addressLocality: "Göteborg",
      addressCountry: "SE",
    },
    hasMap: t("contact_map_url") || undefined,
    areaServed: ["Göteborg", "Online"],
    availableLanguage: LANG_NAMES,
    medicalSpecialty: "Psychiatric",
    founder: {
      "@type": "Person",
      name: t("hero_name"),
      jobTitle: t("hero_role"),
      image: photo || undefined,
      knowsLanguage: LANG_NAMES,
    },
  };
  // L'adreça del carrer surt del panell; si en Quim la canvia, la fitxa la segueix
  const addr = t("contact_address").match(/^(.*?),\s*(\d{3}\s?\d{2})\s+(.+)$/);
  if (addr) Object.assign(ld.address, { streetAddress: addr[1], postalCode: addr[2], addressLocality: addr[3] });

  const head = [
    `<title>${esc(t("meta_title"))}</title>`,
    `<meta name="description" content="${esc(t("meta_description"))}">`,
    `<link rel="canonical" href="${url}">`,
    ...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE + PATHS[l]}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${esc(t("meta_title"))}">`,
    `<meta property="og:description" content="${esc(t("meta_description"))}">`,
    `<meta property="og:locale" content="${LOCALES[lang]}">`,
    ...LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${LOCALES[l]}">`),
    photo ? `<meta property="og:image" content="${photo}">` : "",
    `<meta name="twitter:card" content="summary">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean).join("\n");
  html = html.replace("<!--HEAD-->", head);

  // Textos simples i paràgrafs
  html = html.replace(/(<([a-z0-9]+)([^>]*)\sdata-t="(\w+)"([^>]*)>)(<\/\2>)/g,
    (m, open, tag, a, key, b, close) => open + esc(t(key)) + close);
  html = html.replace(/(<([a-z0-9]+)[^>]*\sdata-p="(\w+)"[^>]*>)(<\/\2>)/g,
    (m, open, tag, key, close) => open + paras(t(key)) + close);

  // Llistes: formació i preguntes freqüents
  const creds = (data.formacio.llista || []).filter((f) => tr(f.titol, lang))
    .map((f) => `<li><span class="t">${esc(tr(f.titol, lang))}</span><span class="p">${esc(tr(f.lloc, lang))}</span></li>`).join("");
  html = fillId(html, "creds", creds);
  const faqs = (data.preguntes.llista || []).filter((f) => tr(f.pregunta, lang));
  html = fillId(html, "faq", faqs
    .map((f) => `<details><summary>${esc(tr(f.pregunta, lang))}</summary><div class="a">${paras(tr(f.resposta, lang))}</div></details>`).join(""));
  if (faqs.length) {
    const faqLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: lang,
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: tr(f.pregunta, lang),
        acceptedAnswer: { "@type": "Answer", text: tr(f.resposta, lang) },
      })),
    };
    html = html.replace("</head>", `<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, "\\u003c")}</script>\n</head>`);
  }

  // Enllaços i imatges
  html = setAttr(html, "phone-link", "href", "tel:" + t("contact_phone").replace(/[^\d+]/g, ""));
  html = setAttr(html, "wa-link", "href", t("contact_whatsapp_url"));
  html = setAttr(html, "mail-link", "href", "mailto:" + t("contact_email"));
  html = setAttr(html, "map-link", "href", t("contact_map_url"));
  html = setAttr(html, "f-lang", "value", lang);
  if (t("foto")) {
    html = setAttr(html, "portrait", "src", t("foto"));
    html = setAttr(html, "portrait", "alt", `${t("hero_name")}, ${t("hero_role")}`);
  } else {
    html = setAttr(html, "portrait", "hidden", "");
  }
  if (t("foto_consulta")) {
    html = setAttr(html, "room", "src", t("foto_consulta"));
    html = setAttr(html, "room", "alt", ROOM_ALT[lang]);
  } else {
    html = html.replace('<div class="wrap room-wrap">', '<div class="wrap room-wrap" hidden>');
  }
  html = fillId(html, "year", "© " + new Date().getFullYear());

  // Botons d'idioma: enllaços reals a cada versió
  html = html.replace(/<a data-lang="(\w\w)" lang="\1" hreflang="\1">/g,
    (m, l) => `<a data-lang="${l}" lang="${l}" hreflang="${l}" href="${PATHS[l]}"${l === lang ? ' aria-current="page"' : ""}>`);
  html = html.replace(/<a class="brand" href="#inici"/, `<a class="brand" href="${PATHS[lang]}#inici"`);

  // Els textos també van al codi de la pàgina (per als missatges del formulari)
  html = html.replace("/*__DATA__*/null", JSON.stringify(data).replace(/</g, "\\u003c"));
  return html;
}

// Construcció
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const l of LANGS) {
  const dir = "dist" + PATHS[l];
  mkdirSync(dir, { recursive: true });
  writeFileSync(dir + "index.html", page(l));
}
for (const d of ["img", "admin", "content"]) if (existsSync(d)) cpSync(d, "dist/" + d, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE + PATHS[l]}"/>`).join("\n")
  + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`;
writeFileSync("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map((l) => `  <url>\n    <loc>${SITE + PATHS[l]}</loc>\n    <lastmod>${today}</lastmod>\n${alts}\n  </url>`).join("\n")}
</urlset>
`);
writeFileSync("dist/robots.txt", `User-agent: *
Disallow: /admin/
Disallow: /content/

Sitemap: ${SITE}/sitemap.xml
`);
console.log("Web generada a dist/:", LANGS.map((l) => PATHS[l]).join(" "));
