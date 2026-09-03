import { env } from "cloudflare:workers";
import { SEED_LEXICON } from "@/app/data/words";

type LexiconItem = { word: string; ipa: string; meaning: string; source: string };
const clean = (value: string) => value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

async function lookup(word: string): Promise<LexiconItem> {
  const seeded = SEED_LEXICON[word];
  if (seeded) return { word, ipa: seeded[0], meaning: seeded[1], source: "curated" };
  const cached = await env.DB.prepare("SELECT word, ipa, meaning, source FROM lexicon_cache WHERE word = ?")
    .bind(word).first<LexiconItem>();
  if (cached) return cached;
  try {
    const response = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`, { headers: { "User-Agent": "Yilin-Word-Quest/1.0" } });
    if (!response.ok) throw new Error(`dictionary ${response.status}`);
    const data = await response.json() as any;
    const entry = data?.ec?.word?.[0];
    const phone = entry?.ukphone || entry?.usphone || entry?.phone;
    const meanings = (entry?.trs ?? []).map((row: any) => row?.tr?.[0]?.l?.i?.[0])
      .filter((value: unknown): value is string => typeof value === "string").map(clean).slice(0, 3);
    if (!phone || meanings.length === 0) throw new Error("dictionary entry incomplete");
    const item = { word, ipa: `/${phone}/`, meaning: meanings.join("；"), source: "dictionary" };
    await env.DB.prepare(`INSERT INTO lexicon_cache (word, ipa, meaning, source, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(word) DO UPDATE SET ipa = excluded.ipa,
      meaning = excluded.meaning, source = excluded.source, updated_at = excluded.updated_at`)
      .bind(word, item.ipa, item.meaning, item.source, new Date().toISOString()).run();
    return item;
  } catch (error) {
    console.error("dictionary lookup failed", word, error);
    return { word, ipa: "/读音待校准/", meaning: "释义待校准", source: "pending" };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const words = (url.searchParams.get("words") ?? url.searchParams.get("word") ?? "").split(",")
    .map((word) => word.trim().toLowerCase()).filter((word) => /^[a-z]+(?:[-'][a-z]+)*$|^a\/an$/.test(word)).slice(0, 20);
  if (words.length === 0) return Response.json({ error: "缺少单词" }, { status: 400 });
  const items: LexiconItem[] = [];
  for (const word of words) items.push(await lookup(word));
  return Response.json({ items });
}
