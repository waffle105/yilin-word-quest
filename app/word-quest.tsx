"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEED_LEXICON } from "./data/words";
import { ORDERED_WORDS, ORDER_INDEX, wordLocationLabel } from "./data/curriculum";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  BookOpen, Check, ChevronLeft, ChevronRight, Cloud, ExternalLink, Eye, EyeOff, Flame,
  Gamepad2, GraduationCap, Headphones, Lightbulb, ListChecks, Loader2, LogOut,
  RotateCcw, ShieldCheck, Sparkles, SpellCheck2, Target, Trophy, User, Volume2, X,
} from "lucide-react";

type Lexicon = { word: string; ipa: string; meaning: string; source?: string };
type ProgressRow = {
  word: string; attempts: number; correctCount: number; spellingErrors: number; readingErrors: number;
  mastery: number; intervalDays: number; dueAt: string; lastSeenAt: string;
};
type Mode = "daily" | "full" | "wrong";
type Phase = "learn" | "challenge";
type IpaItem = { symbol: string; word: string; hint: string };

const BILIBILI_IPA_URL = "https://www.bilibili.com/video/BV1Y4411M7Ac?spm_id_from=333.788.videopod.episodes&vd_source=a83839717d0054d5746fed0d4992f283";
const IPA_GROUPS: { title: string; subtitle: string; items: IpaItem[] }[] = [
  {
    title: "元音", subtitle: "20 个常用元音：先听示范词，再轻声模仿",
    items: [
      { symbol: "/iː/", word: "see", hint: "长音" }, { symbol: "/ɪ/", word: "sit", hint: "短音" },
      { symbol: "/e/", word: "bed", hint: "短音" }, { symbol: "/æ/", word: "cat", hint: "张大嘴" },
      { symbol: "/ɑː/", word: "car", hint: "长音" }, { symbol: "/ɒ/", word: "hot", hint: "短音" },
      { symbol: "/ɔː/", word: "saw", hint: "长音" }, { symbol: "/ʊ/", word: "book", hint: "短音" },
      { symbol: "/uː/", word: "blue", hint: "长音" }, { symbol: "/ʌ/", word: "cup", hint: "短音" },
      { symbol: "/ɜː/", word: "bird", hint: "长音" }, { symbol: "/ə/", word: "about", hint: "弱读音" },
      { symbol: "/eɪ/", word: "name", hint: "双元音" }, { symbol: "/aɪ/", word: "time", hint: "双元音" },
      { symbol: "/ɔɪ/", word: "boy", hint: "双元音" }, { symbol: "/əʊ/", word: "go", hint: "双元音" },
      { symbol: "/aʊ/", word: "now", hint: "双元音" }, { symbol: "/ɪə/", word: "near", hint: "双元音" },
      { symbol: "/eə/", word: "hair", hint: "双元音" }, { symbol: "/ʊə/", word: "tour", hint: "双元音" },
    ],
  },
  {
    title: "辅音", subtitle: "28 个常用辅音：注意清浊、舌位和气流",
    items: [
      { symbol: "/p/", word: "pen", hint: "清辅音" }, { symbol: "/b/", word: "bag", hint: "浊辅音" },
      { symbol: "/t/", word: "tea", hint: "清辅音" }, { symbol: "/d/", word: "dog", hint: "浊辅音" },
      { symbol: "/k/", word: "cat", hint: "清辅音" }, { symbol: "/g/", word: "go", hint: "浊辅音" },
      { symbol: "/f/", word: "fish", hint: "清辅音" }, { symbol: "/v/", word: "very", hint: "浊辅音" },
      { symbol: "/θ/", word: "think", hint: "咬舌音" }, { symbol: "/ð/", word: "this", hint: "咬舌音" },
      { symbol: "/s/", word: "see", hint: "清辅音" }, { symbol: "/z/", word: "zoo", hint: "浊辅音" },
      { symbol: "/ʃ/", word: "she", hint: "清辅音" }, { symbol: "/ʒ/", word: "vision", hint: "浊辅音" },
      { symbol: "/h/", word: "hat", hint: "呼气" }, { symbol: "/tʃ/", word: "chair", hint: "清辅音" },
      { symbol: "/dʒ/", word: "jump", hint: "浊辅音" }, { symbol: "/m/", word: "man", hint: "鼻音" },
      { symbol: "/n/", word: "no", hint: "鼻音" }, { symbol: "/ŋ/", word: "sing", hint: "鼻音" },
      { symbol: "/l/", word: "leg", hint: "舌侧音" }, { symbol: "/r/", word: "red", hint: "卷舌音" },
      { symbol: "/j/", word: "yes", hint: "半元音" }, { symbol: "/w/", word: "we", hint: "半元音" },
      { symbol: "/tr/", word: "tree", hint: "辅音连缀" }, { symbol: "/dr/", word: "dress", hint: "辅音连缀" },
      { symbol: "/ts/", word: "cats", hint: "辅音连缀" }, { symbol: "/dz/", word: "beds", hint: "辅音连缀" },
    ],
  },
];

const initialLexicon: Record<string, Lexicon> = Object.fromEntries(
  Object.entries(SEED_LEXICON).map(([word, [ipa, meaning]]) => [word, { word, ipa, meaning, source: "curated" }]),
);
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeAccount = (value: string) => value.normalize("NFKC").trim().toLowerCase();
const accountIsValid = (value: string) => /^[\p{L}\p{N}_-]{2,24}$/u.test(value);
const spellMatches = (input: string, expected: string) => expected === "a/an"
  ? ["a", "an", "a/an"].includes(normalize(input)) : normalize(input) === expected;
const progressKey = (accountId: string) => `word-quest-progress:${accountId}`;
const metaKey = (accountId: string) => `word-quest-meta:${accountId}`;

function readStoredProgress(accountId: string) {
  try { return JSON.parse(localStorage.getItem(progressKey(accountId)) ?? "{}") as Record<string, ProgressRow>; }
  catch { return {}; }
}

function wordsForMode(nextMode: Mode, progress: Record<string, ProgressRow>) {
  if (nextMode === "wrong") return Object.values(progress)
    .filter((row) => row.spellingErrors + row.readingErrors > 0 && row.mastery < 5)
    .sort((a, b) => (ORDER_INDEX.get(a.word) ?? Number.MAX_SAFE_INTEGER) - (ORDER_INDEX.get(b.word) ?? Number.MAX_SAFE_INTEGER))
    .map((row) => row.word);
  if (nextMode === "full") return ORDERED_WORDS.filter((word) => !progress[word] || progress[word].mastery < 3);
  const due = new Set(Object.values(progress).filter((row) => new Date(row.dueAt) <= new Date()).map((row) => row.word));
  return ORDERED_WORDS.filter((word) => due.has(word) || !progress[word]).slice(0, 25);
}

export function WordQuest() {
  const [accountId, setAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("play");
  const [progressMap, setProgressMap] = useState<Record<string, ProgressRow>>({});
  const [lexicon, setLexicon] = useState<Record<string, Lexicon>>(initialLexicon);
  const [mode, setMode] = useState<Mode>("daily");
  const [phase, setPhase] = useState<Phase>("learn");
  const [queue, setQueue] = useState<string[]>(() => [...ORDERED_WORDS.slice(0, 25)]);
  const [learningPosition, setLearningPosition] = useState(0);
  const [position, setPosition] = useState(0);
  const [input, setInput] = useState("");
  const [showChinese, setShowChinese] = useState(false);
  const [spellingCorrect, setSpellingCorrect] = useState<boolean | null>(null);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(0);
  const [tableHideChinese, setTableHideChinese] = useState(true);
  const [tableInputs, setTableInputs] = useState<Record<string, string>>({});
  const [tableChecked, setTableChecked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = queue[position];
  const current = currentWord ? lexicon[currentWord] : undefined;
  const learningWord = queue[learningPosition];
  const learningItem = learningWord ? lexicon[learningWord] : undefined;
  const wrongWords = useMemo(() => Object.values(progressMap)
    .filter((row) => row.spellingErrors + row.readingErrors > 0 && row.mastery < 5)
    .sort((a, b) => (ORDER_INDEX.get(a.word) ?? Number.MAX_SAFE_INTEGER) - (ORDER_INDEX.get(b.word) ?? Number.MAX_SAFE_INTEGER)), [progressMap]);
  const mastered = useMemo(() => Object.values(progressMap).filter((row) => row.mastery >= 3).length, [progressMap]);
  const checked = Object.keys(progressMap).length;
  const overallPercent = Math.round((checked / ORDERED_WORDS.length) * 100);

  useEffect(() => { setLoginName(localStorage.getItem("word-quest-last-user") ?? ""); }, []);
  useEffect(() => {
    if (accountId && recordsLoaded) localStorage.setItem(progressKey(accountId), JSON.stringify(progressMap));
  }, [accountId, progressMap, recordsLoaded]);
  useEffect(() => {
    if (accountId) localStorage.setItem(metaKey(accountId), JSON.stringify({ xp, streak }));
  }, [accountId, xp, streak]);

  const loadLexicon = useCallback(async (words: readonly string[]) => {
    const missing = words.filter((word) => !lexicon[word]).slice(0, 20);
    if (!missing.length) return;
    try {
      const response = await fetch(`/api/lexicon?words=${encodeURIComponent(missing.join(","))}`);
      const data = await response.json();
      if (data.items) setLexicon((old) => ({ ...old, ...Object.fromEntries(data.items.map((item: Lexicon) => [item.word, item])) }));
    } catch { toast.error("读音资料加载失败，请稍后再试"); }
  }, [lexicon]);

  useEffect(() => {
    const words = phase === "learn" ? queue.slice(learningPosition, learningPosition + 5) : queue.slice(position, position + 5);
    if (words.length) loadLexicon(words);
  }, [learningPosition, loadLexicon, phase, position, queue]);

  const enterAccount = async () => {
    const id = normalizeAccount(loginName);
    if (!accountIsValid(id)) { toast.error("用户名请使用 2–24 个中文、字母、数字、下划线或短横线"); return; }
    setLoadingAccount(true);
    const localProgress = readStoredProgress(id);
    let mergedProgress = localProgress;
    try {
      const response = await fetch("/api/progress", { headers: { "X-Word-Quest-User": encodeURIComponent(id) } });
      const data = await response.json();
      if (data.progress) {
        const serverProgress = Object.fromEntries(data.progress.map((row: ProgressRow) => [row.word, row]));
        mergedProgress = { ...serverProgress, ...localProgress };
      }
    } catch { toast.info("已读取本机记录，云端同步稍后会自动重试"); }
    try {
      const meta = JSON.parse(localStorage.getItem(metaKey(id)) ?? "{}") as { xp?: number; streak?: number };
      setXp(Number(meta.xp ?? 0)); setStreak(Number(meta.streak ?? 0));
    } catch { setXp(0); setStreak(0); }
    const shownName = loginName.normalize("NFKC").trim();
    setProgressMap(mergedProgress); setDisplayName(shownName); setAccountId(id); setRecordsLoaded(true);
    setMode("daily"); setQueue(wordsForMode("daily", mergedProgress)); setLearningPosition(0); setPosition(0);
    setPhase("learn"); setActiveTab("play"); localStorage.setItem("word-quest-last-user", shownName); setLoadingAccount(false);
  };

  const switchAccount = () => {
    setAccountId(""); setDisplayName(""); setProgressMap({}); setRecordsLoaded(false); setXp(0); setStreak(0);
    setQueue([...ORDERED_WORDS.slice(0, 25)]); setPhase("learn"); setLearningPosition(0); setPosition(0);
    setInput(""); setSpellingCorrect(null);
  };
  const resetCard = () => {
    setInput(""); setShowChinese(false); setSpellingCorrect(null); setStartedAt(Date.now());
    window.setTimeout(() => inputRef.current?.focus(), 80);
  };
  const buildQueue = (nextMode: Mode) => {
    const words = wordsForMode(nextMode, progressMap);
    if (nextMode === "wrong" && !words.length) { setActiveTab("wrong"); toast.info("目前还没有需要强化的错词"); return; }
    setMode(nextMode); setQueue(words); setLearningPosition(0); setPosition(0); setPhase("learn");
    setSessionCorrect(0); setSessionWrong([]); setActiveTab("play"); resetCard();
  };
  const startChallenge = () => { setPosition(0); setPhase("challenge"); resetCard(); };
  const checkSpelling = () => {
    if (!input.trim() || !currentWord) return;
    const okay = spellMatches(input, currentWord); setSpellingCorrect(okay); setShowChinese(true);
    if (!okay) setSessionWrong((old) => old.includes(currentWord) ? old : [...old, currentWord]);
    if (okay) toast.success("拼写正确，继续确认朗读");
  };
  const speakWord = async (word: string) => {
    if (!word || playingAudio) return;
    setPlayingAudio(word);
    try {
      const audio = new Audio(`/api/audio?word=${encodeURIComponent(word)}`);
      audio.preload = "auto"; audio.playbackRate = 0.92;
      audio.onended = () => setPlayingAudio(null);
      audio.onerror = () => { setPlayingAudio(null); toast.error("这个示范词暂时没有真人录音"); };
      await audio.play();
    } catch { setPlayingAudio(null); toast.error("真人录音加载失败，请稍后再试"); }
  };
  const makeLocalProgress = (word: string, spellingOkay: boolean, readingOkay: boolean): ProgressRow => {
    const existing = progressMap[word]; const bothCorrect = spellingOkay && readingOkay;
    const oldInterval = existing?.intervalDays ?? 0;
    const intervalDays = bothCorrect ? Math.max(1, oldInterval === 0 ? 1 : Math.round(oldInterval * 2.2)) : 0;
    const now = new Date(); const due = new Date(now); if (bothCorrect) due.setDate(due.getDate() + intervalDays);
    return { word, attempts: (existing?.attempts ?? 0) + 1, correctCount: (existing?.correctCount ?? 0) + (bothCorrect ? 1 : 0),
      spellingErrors: (existing?.spellingErrors ?? 0) + (spellingOkay ? 0 : 1), readingErrors: (existing?.readingErrors ?? 0) + (readingOkay ? 0 : 1),
      mastery: bothCorrect ? Math.min(5, (existing?.mastery ?? 0) + 1) : Math.max(0, (existing?.mastery ?? 0) - 1),
      intervalDays, dueAt: due.toISOString(), lastSeenAt: now.toISOString() };
  };
  const recordAndNext = async (readingCorrect: boolean) => {
    if (spellingCorrect === null || !currentWord || !accountId) return;
    const both = spellingCorrect && readingCorrect;
    setProgressMap((old) => ({ ...old, [currentWord]: makeLocalProgress(currentWord, spellingCorrect, readingCorrect) }));
    setXp((value) => value + (both ? 10 : 3)); setStreak((value) => both ? value + 1 : 0);
    if (both) setSessionCorrect((value) => value + 1); else setSessionWrong((old) => old.includes(currentWord) ? old : [...old, currentWord]);
    setSyncing(true);
    try {
      const response = await fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json", "X-Word-Quest-User": encodeURIComponent(accountId) },
        body: JSON.stringify({ word: currentWord, spellingCorrect, readingCorrect, responseMs: Date.now() - startedAt }) });
      const data = await response.json();
      if (data.progress) setProgressMap((old) => ({ ...old, [currentWord]: data.progress }));
      if (!response.ok) throw new Error(data.error);
    } catch { toast.info("本题已保存在这个账号的本机记录中"); }
    finally { setSyncing(false); }
    setPosition((value) => value + 1); resetCard();
  };

  const tableWords = ORDERED_WORDS.slice(tablePage * 10, tablePage * 10 + 10);
  useEffect(() => { loadLexicon(tableWords); }, [loadLexicon, tablePage]);
  const checkTable = () => {
    setTableChecked(true); const misses = tableWords.filter((word) => !spellMatches(tableInputs[word] ?? "", word));
    toast[misses.length ? "warning" : "success"](misses.length ? `本页有 ${misses.length} 个需要再练` : "本页全部正确！");
  };

  const header = <header className="quest-header"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
    <div className="flex items-center gap-3"><div className="logo-tile"><SpellCheck2 /></div><div><p className="text-sm font-black tracking-[.18em] text-amber-300">WORD QUEST</p><h1 className="text-lg font-bold text-white sm:text-xl">译林 2000 词闯关</h1></div></div>
    {accountId ? <div className="flex items-center gap-2"><div className="user-chip"><User /><span>{displayName}</span></div><div className="stat-chip"><Flame className="text-orange-400" /><span>{streak}</span><small>连胜</small></div><div className="stat-chip"><Sparkles className="text-amber-300" /><span>{xp}</span><small>XP</small></div></div> : <span className="header-note">用户名即学习档案</span>}
  </div></header>;

  if (!accountId) return <main className="login-shell min-h-screen bg-background text-foreground"><Toaster richColors position="top-center" />{header}<section className="login-stage"><div className="login-card">
    <div className="login-icon"><User /></div><span className="eyebrow">个人学习档案</span><h2>输入用户名，继续你的挑战</h2>
    <p>不需要密码，也不需要注册。不同用户名的学习进度会分别保存，使用时请始终输入同一个名字。</p>
    <label htmlFor="username">用户名</label><Input id="username" value={loginName} onChange={(event) => setLoginName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && enterAccount()} placeholder="例如：小林 或 lin2026" autoComplete="username" maxLength={24} />
    <Button onClick={enterAccount} disabled={loadingAccount || !loginName.trim()}>{loadingAccount ? <Loader2 className="animate-spin" /> : <Gamepad2 />}{loadingAccount ? "正在读取记录…" : "进入学习"}</Button>
    <div className="login-features"><span><ShieldCheck />记录跟随用户名</span><span><GraduationCap />先学习再挑战</span><span><Headphones />48 个音标练习</span></div>
  </div></section></main>;

  return <main className="min-h-screen overflow-x-hidden bg-background text-foreground"><Toaster richColors position="top-center" />{header}
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7"><Tabs value={activeTab} onValueChange={setActiveTab} className="gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><TabsList className="h-auto w-full flex-wrap rounded-2xl bg-white/90 p-1 shadow-sm ring-1 ring-slate-200 sm:w-auto">
        <TabsTrigger value="play" className="h-10 rounded-xl px-4"><Gamepad2 />闯关</TabsTrigger><TabsTrigger value="ipa" className="h-10 rounded-xl px-4"><Headphones />音标学习</TabsTrigger><TabsTrigger value="table" className="h-10 rounded-xl px-4"><ListChecks />表格默写</TabsTrigger><TabsTrigger value="wrong" className="h-10 rounded-xl px-4"><RotateCcw />错词本 <Badge className="ml-1 bg-rose-100 text-rose-700">{wrongWords.length}</Badge></TabsTrigger>
      </TabsList><div className="account-actions"><span><Cloud className="size-4 text-emerald-500" />{syncing ? "正在保存…" : `已保存到 ${displayName} 的记录`}</span><Button variant="ghost" size="sm" onClick={switchAccount}><LogOut />切换账号</Button></div></div>

      <TabsContent value="play"><div className="play-layout"><aside className="dashboard-panel">
        <div className="flex items-center justify-between"><span className="eyebrow">总进度</span><Target className="size-5 text-violet-500" /></div><div className="mt-3 flex items-end gap-2"><strong className="text-4xl font-black">{overallPercent}%</strong><span className="pb-1 text-sm text-slate-500">已诊断 {checked}/2000</span></div><Progress value={overallPercent} className="mt-4 h-3 bg-slate-200 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-violet-500 [&_[data-slot=progress-indicator]]:to-cyan-400" />
        <div className="mini-stats"><div><ShieldCheck /><strong>{mastered}</strong><span>已掌握</span></div><div><RotateCcw /><strong>{wrongWords.length}</strong><span>待强化</span></div></div>
        <div className="mt-6 border-t border-slate-200 pt-5"><p className="eyebrow mb-3">选择任务</p><div className="grid gap-2"><button onClick={() => buildQueue("daily")} className={`mode-button ${mode === "daily" ? "active" : ""}`}><span><Sparkles />教材顺序 25 词</span><small>七上开始</small></button><button onClick={() => buildQueue("full")} className={`mode-button ${mode === "full" ? "active" : ""}`}><span><BookOpen />六册顺序诊断</span><small>按 Unit 推进</small></button><button onClick={() => buildQueue("wrong")} className={`mode-button ${mode === "wrong" ? "active" : ""}`}><span><RotateCcw />错词强化</span><small>{wrongWords.length} 个待练</small></button></div></div>
        <div className="tip-box"><Lightbulb /><p><strong>教材顺序</strong><br />七上 → 七下 → 八上 → 八下 → 九上 → 九下；每册按 Unit 生词顺序推进。</p></div>
      </aside><section className="challenge-card" aria-live="polite">
        {phase === "learn" && learningWord ? <div className="learning-phase"><div className="flex items-center justify-between gap-4"><div><span className="eyebrow">测试前预习</span><p className="mt-1 text-sm text-slate-500">第 {learningPosition + 1} / {queue.length} 个</p></div><Badge className="learn-badge"><GraduationCap />{wordLocationLabel(learningWord)}</Badge></div><Progress value={((learningPosition + 1) / queue.length) * 100} className="mt-4 h-2 bg-slate-100 [&_[data-slot=progress-indicator]]:bg-emerald-400" />
          <div className="learning-word-card"><p>看单词、认音标、记意思，再跟读一遍</p><h2>{learningWord}</h2><strong>{learningItem?.ipa ?? <Loader2 className="mx-auto animate-spin" />}</strong><span>{learningItem?.meaning ?? "释义加载中…"}</span><Button variant="outline" onClick={() => speakWord(learningWord)} disabled={Boolean(playingAudio)}>{playingAudio === learningWord ? <Loader2 className="animate-spin" /> : <Volume2 />}{playingAudio === learningWord ? "正在播放…" : "听真人发音并跟读"}</Button></div>
          <div className="learning-nav"><Button variant="outline" disabled={learningPosition === 0} onClick={() => setLearningPosition((value) => value - 1)}><ChevronLeft />上一个</Button>{learningPosition < queue.length - 1 ? <Button onClick={() => setLearningPosition((value) => value + 1)}>下一个<ChevronRight /></Button> : <Button className="start-challenge" onClick={startChallenge}><Gamepad2 />预习完成，开始挑战</Button>}</div>
        </div> : currentWord ? <><div className="flex items-center justify-between gap-4"><div><span className="eyebrow">{mode === "daily" ? "教材顺序任务" : mode === "full" ? "六册顺序诊断" : "错词强化"}</span><p className="mt-1 text-sm text-slate-500">第 {position + 1} / {queue.length} 题</p></div><Badge className="tier-badge">{wordLocationLabel(currentWord)}</Badge></div><Progress value={(position / queue.length) * 100} className="mt-4 h-2 bg-slate-100 [&_[data-slot=progress-indicator]]:bg-amber-400" />
          <div className="question-zone"><p className="text-sm font-bold tracking-[.2em] text-violet-500">只看音标，大声读出来</p><div className="ipa-display">{current?.ipa ?? <Loader2 className="mx-auto size-10 animate-spin" />}</div><button className="meaning-reveal" onClick={() => setShowChinese((value) => !value)}>{showChinese ? <EyeOff /> : <Eye />}<span className={showChinese ? "" : "blur-sm select-none"}>{current?.meaning ?? "中文释义加载中"}</span>{!showChinese && <em>同音词或卡壳时再看</em>}</button></div>
          <div className="answer-zone"><label htmlFor="spell-input">第三列 · 拼写单词</label><div className="spell-row"><Input ref={inputRef} id="spell-input" value={input} disabled={spellingCorrect !== null} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && spellingCorrect === null && checkSpelling()} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="在这里写出单词…" className={`spell-input ${spellingCorrect === true ? "correct" : spellingCorrect === false ? "wrong" : ""}`} />{spellingCorrect === null && <Button onClick={checkSpelling} disabled={!input.trim() || !current} className="check-button"><Check />检查拼写</Button>}</div>{spellingCorrect !== null && <div className={`result-panel ${spellingCorrect ? "ok" : "miss"}`}><div className="flex items-start gap-3">{spellingCorrect ? <Check /> : <X />}<div><p>{spellingCorrect ? "拼写正确！" : "正确拼写是"}</p><strong>{currentWord}</strong></div></div><Button variant="outline" onClick={() => speakWord(currentWord)} disabled={Boolean(playingAudio)}>{playingAudio === currentWord ? <Loader2 className="animate-spin" /> : <Volume2 />}{playingAudio === currentWord ? "正在播放…" : "英式真人发音"}</Button></div>}</div>
          {spellingCorrect !== null && <div className="reading-check"><p>刚才朗读得怎么样？</p><div><Button variant="outline" onClick={() => recordAndNext(false)}><X />读错了</Button><Button onClick={() => recordAndNext(true)} className="read-right"><Check />读得准</Button></div></div>}</> : <div className="session-finish"><Trophy /><p className="eyebrow">本轮完成</p><h2>闯关结算</h2><div><span><strong>{sessionCorrect}</strong> 全对</span><span><strong>{sessionWrong.length}</strong> 待强化</span></div><p>{sessionWrong.length ? "错词已经自动收进这个账号的错词本，趁热再过一遍效果最好。" : "这一轮全部掌握，漂亮！"}</p><Button onClick={() => buildQueue(sessionWrong.length ? "wrong" : "daily")}><RotateCcw />{sessionWrong.length ? "先复习再强化" : "开始下一轮"}</Button></div>}
      </section></div></TabsContent>

      <TabsContent value="ipa"><section className="table-panel ipa-school"><div className="ipa-school-hero"><div><span className="eyebrow">International Phonetic Alphabet</span><h2>英语音标学习</h2><p>点击任意音标卡，听示范词并自愿跟读。建议先学元音，再学辅音。</p></div><a className="video-link" href={BILIBILI_IPA_URL} target="_blank" rel="noreferrer"><ExternalLink />打开 B 站音标视频</a></div>
        {IPA_GROUPS.map((group) => <div className="ipa-group" key={group.title}><div className="ipa-group-title"><h3>{group.title}</h3><p>{group.subtitle}</p></div><div className="ipa-grid">{group.items.map((item) => <button className={`ipa-card ${playingAudio === item.word ? "playing" : ""}`} key={`${item.symbol}-${item.word}`} onClick={() => speakWord(item.word)} disabled={Boolean(playingAudio)}><strong>{item.symbol}</strong><span>{item.word}</span><small>{playingAudio === item.word ? "正在播放…" : `${item.hint} · 点击试听`}</small>{playingAudio === item.word ? <Loader2 className="animate-spin" /> : <Volume2 />}</button>)}</div></div>)}
      </section></TabsContent>

      <TabsContent value="table"><section className="table-panel"><div className="table-toolbar"><div><span className="eyebrow">六册教材 · Unit 顺序</span><h2>三列表格默写</h2><p>当前：{tableWords[0] ? wordLocationLabel(tableWords[0]) : "课标补充词"}。第一列音标，第二列中文，第三列留给拼写。</p></div><Button variant="outline" onClick={() => setTableHideChinese((value) => !value)}>{tableHideChinese ? <Eye /> : <EyeOff />}{tableHideChinese ? "显示中文" : "遮住中文"}</Button></div>
        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block"><Table><TableHeader><TableRow><TableHead>音标</TableHead><TableHead>中文</TableHead><TableHead>写出单词</TableHead></TableRow></TableHeader><TableBody>{tableWords.map((word) => { const item = lexicon[word]; const okay = tableChecked && spellMatches(tableInputs[word] ?? "", word); return <TableRow key={word}><TableCell className="font-serif text-lg font-semibold">{item?.ipa ?? "加载中…"}</TableCell><TableCell><span className={tableHideChinese ? "blur-sm select-none" : ""}>{item?.meaning ?? "释义加载中"}</span></TableCell><TableCell><Input value={tableInputs[word] ?? ""} onChange={(event) => setTableInputs((old) => ({ ...old, [word]: event.target.value }))} className={tableChecked ? (okay ? "border-emerald-400 bg-emerald-50" : "border-rose-400 bg-rose-50") : ""} />{tableChecked && !okay && <small className="mt-1 block font-bold text-rose-600">{word}</small>}</TableCell></TableRow>; })}</TableBody></Table></div>
        <div className="grid gap-3 md:hidden">{tableWords.map((word) => { const item = lexicon[word]; const okay = tableChecked && spellMatches(tableInputs[word] ?? "", word); return <article className="mobile-word-row" key={word}><div><strong>{item?.ipa ?? "加载中…"}</strong><span className={tableHideChinese ? "blur-sm select-none" : ""}>{item?.meaning ?? "释义加载中"}</span></div><Input value={tableInputs[word] ?? ""} onChange={(event) => setTableInputs((old) => ({ ...old, [word]: event.target.value }))} placeholder="写出单词" className={tableChecked ? (okay ? "border-emerald-400" : "border-rose-400") : ""} />{tableChecked && !okay && <small>正确：{word}</small>}</article>; })}</div>
        <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row"><div className="flex items-center gap-2"><Button variant="outline" size="icon" disabled={tablePage === 0} onClick={() => { setTablePage((value) => value - 1); setTableChecked(false); }}><ChevronLeft /></Button><span className="min-w-28 text-center text-sm font-bold">第 {tablePage + 1} / {Math.ceil(ORDERED_WORDS.length / 10)} 页</span><Button variant="outline" size="icon" disabled={tablePage >= Math.ceil(ORDERED_WORDS.length / 10) - 1} onClick={() => { setTablePage((value) => value + 1); setTableChecked(false); }}><ChevronRight /></Button></div><Button onClick={checkTable} className="check-button"><ListChecks />批量核对本页</Button></div>
      </section></TabsContent>

      <TabsContent value="wrong"><section className="table-panel"><div className="table-toolbar"><div><span className="eyebrow">{displayName} 的专属记录</span><h2>错词强化营</h2><p>读错、拼错都会进入这里；连续答对后，复习间隔会自动拉长。</p></div><Button onClick={() => buildQueue("wrong")} disabled={!wrongWords.length}><Gamepad2 />先复习再闯关</Button></div>{wrongWords.length ? <div className="wrong-grid">{wrongWords.slice(0, 50).map((row) => <article key={row.word} className="wrong-card"><div><span>{row.spellingErrors > 0 ? "拼写" : "朗读"}</span><strong>{row.word}</strong></div><p>拼错 {row.spellingErrors} 次 · 读错 {row.readingErrors} 次</p><Progress value={row.mastery * 20} /></article>)}</div> : <div className="empty-state"><Trophy /><h3>还没有错词</h3><p>先去完成一轮诊断，读错或拼错的词会自动集中到这里。</p></div>}</section></TabsContent>
    </Tabs></div><footer><span>课标核心 1600</span><i /><span>译林同步拓展 400</span><i /><span>按用户名独立保存</span></footer>
  </main>;
}
