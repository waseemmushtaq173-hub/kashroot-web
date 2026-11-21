/**
 * The name of a language on its button ("کٲشُر", "اردو", "हिन्दी", "डोगरी"), drawn in the phone's own fonts.
 *
 * KashRoot's web fonts for Kashmiri / Urdu (Noto Nastaliq Urdu, 233 KB) and Hindi (Noto Sans Devanagari, 117 KB) are fetched
 * the moment any text in those scripts is drawn with them — even a five-letter button label. The language picker on the
 * home page, in the page guide and on Help is shown to everyone, so every visit paid about 350 KB to draw a few labels.
 * These names are drawn in the phone's own fonts instead, and the web fonts still load where Kashmiri, Urdu or Hindi text
 * is really shown. Careful: "Noto Sans Devanagari" is also the web font's own name, so naming it here would fetch it again;
 * the Devanagari names rely on the phone's system font for the script (the `lang` tells it which).
 */
const OWN: Record<string, string> = {
  ur: '"Noto Naskh Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, system-ui, sans-serif',
  ks: '"Noto Naskh Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, system-ui, sans-serif',
  hi: '"Nirmala UI", Mangal, system-ui, sans-serif',
  doi: '"Nirmala UI", Mangal, system-ui, sans-serif',
};

export function LangName({ lang, label }: { lang: string; label: string }) {
  const family = OWN[lang];
  return family ? (
    <span lang={lang} style={{ fontFamily: family }}>
      {label}
    </span>
  ) : (
    <>{label}</>
  );
}
