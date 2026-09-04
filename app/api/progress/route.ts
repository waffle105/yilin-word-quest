import { headers } from "next/headers";
import database from "@/lib/tencent-db";

async function userId() {
  const h = await headers();
  const raw = h.get("x-word-quest-user");
  if (!raw) throw new Error("missing user");
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* keep the original value */ }
  const normalized = decoded.normalize("NFKC").trim().toLowerCase();
  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(normalized)) throw new Error("invalid user");
  return normalized;
}

export async function GET() {
  try {
    const uid = await userId();
    const rows = database.prepare(`SELECT word, attempts, correct_count AS correctCount,
      spelling_errors AS spellingErrors, reading_errors AS readingErrors, mastery,
      interval_days AS intervalDays, due_at AS dueAt, last_seen_at AS lastSeenAt
      FROM word_progress WHERE user_id = ? ORDER BY last_seen_at DESC`).all(uid);
    return Response.json({ progress: rows });
  } catch (error) {
    console.error("progress load failed", error);
    return Response.json({ progress: [], warning: "学习记录暂时无法读取" });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await userId();
    const body = (await request.json()) as { word?: string; spellingCorrect?: boolean; readingCorrect?: boolean; responseMs?: number };
    const word = body.word?.trim().toLowerCase();
    if (!word || typeof body.spellingCorrect !== "boolean" || typeof body.readingCorrect !== "boolean") {
      return Response.json({ error: "练习结果不完整" }, { status: 400 });
    }
    const now = new Date();
    const existing = database.prepare(`SELECT attempts, correct_count AS correctCount,
      spelling_errors AS spellingErrors, reading_errors AS readingErrors, mastery,
      interval_days AS intervalDays FROM word_progress WHERE user_id = ? AND word = ?`)
      .get(uid, word) as Record<string, number> | undefined;
    const bothCorrect = body.spellingCorrect && body.readingCorrect;
    const mastery = bothCorrect ? Math.min(5, Number(existing?.mastery ?? 0) + 1) : Math.max(0, Number(existing?.mastery ?? 0) - 1);
    const oldInterval = Number(existing?.intervalDays ?? 0);
    const intervalDays = bothCorrect ? Math.max(1, oldInterval === 0 ? 1 : Math.round(oldInterval * 2.2)) : 0;
    const due = new Date(now); if (bothCorrect) due.setUTCDate(due.getUTCDate() + intervalDays);
    const next = {
      attempts: Number(existing?.attempts ?? 0) + 1,
      correctCount: Number(existing?.correctCount ?? 0) + (bothCorrect ? 1 : 0),
      spellingErrors: Number(existing?.spellingErrors ?? 0) + (body.spellingCorrect ? 0 : 1),
      readingErrors: Number(existing?.readingErrors ?? 0) + (body.readingCorrect ? 0 : 1),
    };
    const upsert = database.prepare(`INSERT INTO word_progress
      (user_id, word, attempts, correct_count, spelling_errors, reading_errors, mastery, interval_days, due_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, word) DO UPDATE SET attempts = excluded.attempts,
      correct_count = excluded.correct_count, spelling_errors = excluded.spelling_errors,
      reading_errors = excluded.reading_errors, mastery = excluded.mastery,
      interval_days = excluded.interval_days, due_at = excluded.due_at, last_seen_at = excluded.last_seen_at`)
      .run(uid, word, next.attempts, next.correctCount, next.spellingErrors, next.readingErrors,
        mastery, intervalDays, due.toISOString(), now.toISOString());
    database.prepare(`INSERT INTO practice_attempts
      (user_id, word, spelling_correct, reading_correct, response_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uid, word, body.spellingCorrect ? 1 : 0, body.readingCorrect ? 1 : 0,
        Math.max(0, Math.min(300000, Number(body.responseMs ?? 0))), now.toISOString());
    return Response.json({ progress: { word, ...next, mastery, intervalDays, dueAt: due.toISOString(), lastSeenAt: now.toISOString() } });
  } catch (error) {
    console.error("progress save failed", error);
    return Response.json({ error: "学习记录暂时无法保存，请稍后重试" }, { status: 500 });
  }
}
