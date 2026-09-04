const normalizeAudioUrl = (value: string) => value.startsWith("//") ? `https:${value}` : value;

async function audioResponse(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "audio/mpeg, audio/*;q=0.9, */*;q=0.1" },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body || !contentType.startsWith("audio/")) {
    throw new Error(`audio ${response.status}`);
  }
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const word = (url.searchParams.get("word") ?? "").trim().toLowerCase();
  if (!/^[a-z]+(?:[-'][a-z]+)*$|^a\/an$/.test(word)) {
    return Response.json({ error: "单词格式不正确" }, { status: 400 });
  }
  const query = word === "a/an" ? "an" : word;
  try {
    let recording;
    try {
      recording = await audioResponse(
        `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(query)}&type=2`,
      );
    } catch {
      const dictionaryResponse = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!dictionaryResponse.ok) throw new Error(`dictionary ${dictionaryResponse.status}`);
      const entries = await dictionaryResponse.json() as Array<{
        phonetics?: Array<{ audio?: string }>;
      }>;
      const recordings = entries.flatMap((entry) => entry.phonetics ?? []).filter((item) => item.audio);
      const selected = recordings.find((item) => /-(uk|gb)\.mp3/i.test(item.audio ?? "")) ?? recordings[0];
      if (!selected?.audio) throw new Error("no recording");
      recording = await audioResponse(normalizeAudioUrl(selected.audio));
    }
    return new Response(recording.body, { headers: {
      "Content-Type": recording.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "public, max-age=604800, immutable",
      "X-Audio-Source": "Free Dictionary API",
    }});
  } catch (error) {
    console.error("human recording unavailable", query, error);
    return Response.json({ error: "这个词暂时没有真人录音" }, { status: 404 });
  }
}
