import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const wordProgress = sqliteTable("word_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(), word: text("word").notNull(),
  attempts: integer("attempts").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  spellingErrors: integer("spelling_errors").notNull().default(0),
  readingErrors: integer("reading_errors").notNull().default(0),
  mastery: integer("mastery").notNull().default(0),
  intervalDays: integer("interval_days").notNull().default(0),
  dueAt: text("due_at").notNull(), lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [
  uniqueIndex("uq_word_progress_user_word").on(table.userId, table.word),
  index("idx_word_progress_user_due").on(table.userId, table.dueAt),
]);

export const practiceAttempts = sqliteTable("practice_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(), word: text("word").notNull(),
  spellingCorrect: integer("spelling_correct", { mode: "boolean" }).notNull(),
  readingCorrect: integer("reading_correct", { mode: "boolean" }).notNull(),
  responseMs: integer("response_ms").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_attempts_user_created").on(table.userId, table.createdAt)]);

export const lexiconCache = sqliteTable("lexicon_cache", {
  word: text("word").primaryKey(), ipa: text("ipa").notNull(),
  meaning: text("meaning").notNull(), source: text("source").notNull().default("dictionary"),
  updatedAt: text("updated_at").notNull(),
});
