"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_WORDS, CORE_WORDS, SEED_LEXICON } from "./data/words";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { BookOpen, Check, ChevronLeft, ChevronRight, Cloud, Eye, EyeOff, Flame, Gamepad2,
  Lightbulb, ListChecks, Loader2, RotateCcw, ShieldCheck, Sparkles, SpellCheck2, Target, Trophy, Volume2, X } from "lucide-react";

type Lexicon = { word: string; ipa: string; meaning: string; source?: string };
type ProgressRow = { word: string; attempts: number; correctCount: number; spellingErrors: number; readingErrors: number;
  mastery: number; intervalDays: number; dueAt: string; lastSeenAt: string };
type Mode = "daily" | "full" | "wrong";

const initialLexicon: Record<string, Lexicon> = Object.fromEntries(
  Object.entries(SEED_LEXICON).map(([word, [ipa, meaning]]) => [word, { word, ipa, meaning, source: "curated" }]),
);
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const spellMatches = (input: string, expected: string) => expected === "a/an"
  ? ["a", "an", "a/an"].includes(normalize(input)) : normalize(input) === expected;

export function WordQuest() {
  const [progressMap, setProgressMap] = useState<Record<string, ProgressRow>>({});
  const [lexicon, setLexicon] = useState<Record<string, Lexicon>>(initialLexicon);
  const [mode, setMode] = useState<Mode>("daily");
  const [queue, setQueue] = useState<string[]>(() => [...ALL_WORDS.slice(0, 25)]);
  const [position, setPosition] = useState(0);
  const [input, setInput] = useState("");
  const [showChinese, setShowChinese] = useState(false);
  const [spellingCorrect, setSpellingCorrect] = useState<boolean | null>(null);
  const [xp, setXp] = useState(0); const [streak, setStreak] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false); const [startedAt, setStartedAt] = useState(Date.now());
  const [playingAudio, setPlayingAudio] = useState(false);
  const [tablePage, setTablePage] = useState(0); const [tableHideChinese, setTableHideChinese] = useState(true);
  const [tableInputs, setTableInputs] = useState<Record<string, string>>({}); const [tableChecked, setTableChecked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentWord = queue[position]; const current = currentWord ? lexicon[currentWord] : undefined;
  const wrongWords = useMemo(() => Object.values(progressMap).filter((r) => r.spellingErrors + r.readingErrors > 0 && r.mastery < 5)
    .sort((a,b)=>(b.spellingErrors+b.readingErrors)-(a.spellingErrors+a.readingErrors)), [progressMap]);
  const mastered = useMemo(() => Object.values(progressMap).filter((r) => r.mastery >= 3).length, [progressMap]);
  const checked = Object.keys(progressMap).length; const overallPercent = Math.round((checked / ALL_WORDS.length) * 100);

  const loadLexicon = useCallback(async (words: readonly string[]) => {
    const missing = words.filter((word) => !lexicon[word]).slice(0, 20); if (!missing.length) return;
    try { const response = await fetch(`/api/lexicon?words=${encodeURIComponent(missing.join(","))}`); const data = await response.json();
      if (data.items) setLexicon((old) => ({ ...old, ...Object.fromEntries(data.items.map((item: Lexicon) => [item.word, item])) }));
    } catch { toast.error("读音资料加载失败，请稍后再试"); }
  }, [lexicon]);

  useEffect(() => { fetch("/api/progress").then((r)=>r.json()).then((data)=>{
    if(data.progress) setProgressMap(Object.fromEntries(data.progress.map((row:ProgressRow)=>[row.word,row])));
  }).catch(()=>toast.error("云端学习记录暂时无法读取")); }, []);
  useEffect(() => { if (currentWord) loadLexicon(queue.slice(position, position + 5)); }, [currentWord, loadLexicon, position, queue]);
  const resetCard = () => { setInput(""); setShowChinese(false); setSpellingCorrect(null); setStartedAt(Date.now()); window.setTimeout(()=>inputRef.current?.focus(),80); };
  const buildQueue = (nextMode: Mode) => { let words:string[];
    if(nextMode==="wrong") words=wrongWords.map((r)=>r.word);
    else if(nextMode==="full") words=ALL_WORDS.filter((w)=>!progressMap[w]||progressMap[w].mastery<3);
    else { const due=Object.values(progressMap).filter((r)=>new Date(r.dueAt)<=new Date()).map((r)=>r.word); const unseen=ALL_WORDS.filter((w)=>!progressMap[w]); words=[...new Set([...due,...unseen])].slice(0,25); }
    setMode(nextMode); setQueue(words); setPosition(0); setSessionCorrect(0); setSessionWrong([]); resetCard(); };
  const checkSpelling = () => { if(!input.trim()||!currentWord)return; const okay=spellMatches(input,currentWord); setSpellingCorrect(okay); setShowChinese(true);
    if(!okay)setSessionWrong((old)=>old.includes(currentWord)?old:[...old,currentWord]); if(okay)toast.success("拼写正确，继续确认朗读"); };
  const speak = async () => {
    if (!currentWord || playingAudio) return;
    setPlayingAudio(true);
    try {
      const audio = new Audio(`/api/audio?word=${encodeURIComponent(currentWord)}`);
      audio.preload = "auto";
      audio.playbackRate = 0.92;
      audio.onended = () => setPlayingAudio(false);
      audio.onerror = () => { setPlayingAudio(false); toast.error("这个词暂时没有真人录音"); };
      await audio.play();
    } catch {
      setPlayingAudio(false);
      toast.error("真人录音加载失败，请稍后再试");
    }
  };
  const recordAndNext = async (readingCorrect:boolean) => { if(spellingCorrect===null||!currentWord)return; const both=spellingCorrect&&readingCorrect;
    setXp((x)=>x+(both?10:3));setStreak((s)=>both?s+1:0);if(both)setSessionCorrect((n)=>n+1);else setSessionWrong((old)=>old.includes(currentWord)?old:[...old,currentWord]);setSyncing(true);
    try{const response=await fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({word:currentWord,spellingCorrect,readingCorrect,responseMs:Date.now()-startedAt})});const data=await response.json();if(data.progress)setProgressMap((old)=>({...old,[currentWord]:data.progress}));if(!response.ok)throw new Error(data.error);}catch{toast.error("本题尚未同步，稍后再试");}finally{setSyncing(false);}setPosition((p)=>p+1);resetCard(); };
  const tableWords=ALL_WORDS.slice(tablePage*10,tablePage*10+10);
  useEffect(()=>{loadLexicon(tableWords)},[tablePage,loadLexicon]);
  const checkTable=()=>{setTableChecked(true);const misses=tableWords.filter((w)=>!spellMatches(tableInputs[w]??"",w));toast[misses.length?"warning":"success"](misses.length?`本页有 ${misses.length} 个需要再练`:"本页全部正确！");};

  return <main className="min-h-screen overflow-x-hidden bg-background text-foreground"><Toaster richColors position="top-center"/>
    <header className="quest-header"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6"><div className="flex items-center gap-3"><div className="logo-tile"><SpellCheck2/></div><div><p className="text-sm font-black tracking-[.18em] text-amber-300">WORD QUEST</p><h1 className="text-lg font-bold text-white sm:text-xl">译林 2000 词闯关</h1></div></div><div className="flex items-center gap-2"><div className="stat-chip"><Flame className="text-orange-400"/><span>{streak}</span><small>连胜</small></div><div className="stat-chip"><Sparkles className="text-amber-300"/><span>{xp}</span><small>XP</small></div></div></div></header>
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7"><Tabs defaultValue="play" className="gap-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><TabsList className="h-12 w-full rounded-2xl bg-white/90 p-1 shadow-sm ring-1 ring-slate-200 sm:w-auto"><TabsTrigger value="play" className="h-10 rounded-xl px-4"><Gamepad2/>闯关</TabsTrigger><TabsTrigger value="table" className="h-10 rounded-xl px-4"><ListChecks/>表格默写</TabsTrigger><TabsTrigger value="wrong" className="h-10 rounded-xl px-4"><RotateCcw/>错词本 <Badge className="ml-1 bg-rose-100 text-rose-700">{wrongWords.length}</Badge></TabsTrigger></TabsList><div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Cloud className="size-4 text-emerald-500"/>{syncing?"正在保存…":"进度已云端保存"}</div></div>
      <TabsContent value="play"><div className="play-layout"><aside className="dashboard-panel"><div className="flex items-center justify-between"><span className="eyebrow">总进度</span><Target className="size-5 text-violet-500"/></div><div className="mt-3 flex items-end gap-2"><strong className="text-4xl font-black">{overallPercent}%</strong><span className="pb-1 text-sm text-slate-500">已诊断 {checked}/2000</span></div><Progress value={overallPercent} className="mt-4 h-3 bg-slate-200 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-violet-500 [&_[data-slot=progress-indicator]]:to-cyan-400"/><div className="mini-stats"><div><ShieldCheck/><strong>{mastered}</strong><span>已掌握</span></div><div><RotateCcw/><strong>{wrongWords.length}</strong><span>待强化</span></div></div><div className="mt-6 border-t border-slate-200 pt-5"><p className="eyebrow mb-3">选择任务</p><div className="grid gap-2"><button onClick={()=>buildQueue("daily")} className={`mode-button ${mode==="daily"?"active":""}`}><span><Sparkles/>今日 25 词</span><small>到期词优先</small></button><button onClick={()=>buildQueue("full")} className={`mode-button ${mode==="full"?"active":""}`}><span><BookOpen/>全量诊断</span><small>课标 + 译林</small></button><button onClick={()=>buildQueue("wrong")} className={`mode-button ${mode==="wrong"?"active":""}`}><span><RotateCcw/>错词强化</span><small>{wrongWords.length} 个待练</small></button></div></div><div className="tip-box"><Lightbulb/><p><strong>三步走</strong><br/>看音标读 → 拼出单词 → 再听真人词典录音核对。中文只在同音词或卡壳时看。</p></div></aside>
        <section className="challenge-card" aria-live="polite">{currentWord?<><div className="flex items-center justify-between gap-4"><div><span className="eyebrow">{mode==="daily"?"今日任务":mode==="full"?"全量诊断":"错词强化"}</span><p className="mt-1 text-sm text-slate-500">第 {position+1} / {queue.length} 题</p></div><Badge className="tier-badge">{ALL_WORDS.indexOf(currentWord)<CORE_WORDS.length?"课标核心":"译林拓展"}</Badge></div><Progress value={(position/queue.length)*100} className="mt-4 h-2 bg-slate-100 [&_[data-slot=progress-indicator]]:bg-amber-400"/><div className="question-zone"><p className="text-sm font-bold tracking-[.2em] text-violet-500">只看音标，大声读出来</p><div className="ipa-display">{current?.ipa??<Loader2 className="mx-auto size-10 animate-spin"/>}</div><button className="meaning-reveal" onClick={()=>setShowChinese((v)=>!v)}>{showChinese?<EyeOff/>:<Eye/>}<span className={showChinese?"":"blur-sm select-none"}>{current?.meaning??"中文释义加载中"}</span>{!showChinese&&<em>同音词或卡壳时再看</em>}</button></div><div className="answer-zone"><label htmlFor="spell-input">第三列 · 拼写单词</label><div className="spell-row"><Input ref={inputRef} id="spell-input" value={input} disabled={spellingCorrect!==null} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&spellingCorrect===null&&checkSpelling()} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="在这里写出单词…" className={`spell-input ${spellingCorrect===true?"correct":spellingCorrect===false?"wrong":""}`}/>{spellingCorrect===null&&<Button onClick={checkSpelling} disabled={!input.trim()||!current} className="check-button"><Check/>检查拼写</Button>}</div>{spellingCorrect!==null&&<div className={`result-panel ${spellingCorrect?"ok":"miss"}`}><div className="flex items-start gap-3">{spellingCorrect?<Check/>:<X/>}<div><p>{spellingCorrect?"拼写正确！":"正确拼写是"}</p><strong>{currentWord}</strong></div></div><Button variant="outline" onClick={speak} disabled={playingAudio}>{playingAudio?<Loader2 className="animate-spin"/>:<Volume2/>}{playingAudio?"正在播放…":"英式真人发音"}</Button></div>}</div>{spellingCorrect!==null&&<div className="reading-check"><p>刚才朗读得怎么样？</p><div><Button variant="outline" onClick={()=>recordAndNext(false)}><X/>读错了</Button><Button onClick={()=>recordAndNext(true)} className="read-right"><Check/>读得准</Button></div></div>}</>:<div className="session-finish"><Trophy/><p className="eyebrow">本轮完成</p><h2>闯关结算</h2><div><span><strong>{sessionCorrect}</strong> 全对</span><span><strong>{sessionWrong.length}</strong> 待强化</span></div><p>{sessionWrong.length?"错词已经自动收进错词本，趁热再过一遍效果最好。":"这一轮全部掌握，漂亮！"}</p><Button onClick={()=>buildQueue(sessionWrong.length?"wrong":"daily")}><RotateCcw/>{sessionWrong.length?"马上强化错词":"开始下一轮"}</Button></div>}</section></div></TabsContent>
      <TabsContent value="table"><section className="table-panel"><div className="table-toolbar"><div><span className="eyebrow">传统方法 · 数字升级</span><h2>三列表格默写</h2><p>第一列音标，第二列中文，第三列留给拼写。默认遮住中文。</p></div><Button variant="outline" onClick={()=>setTableHideChinese((v)=>!v)}>{tableHideChinese?<Eye/>:<EyeOff/>}{tableHideChinese?"显示中文":"遮住中文"}</Button></div><div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block"><Table><TableHeader><TableRow><TableHead>音标</TableHead><TableHead>中文</TableHead><TableHead>写出单词</TableHead></TableRow></TableHeader><TableBody>{tableWords.map((word)=>{const item=lexicon[word];const okay=tableChecked&&spellMatches(tableInputs[word]??"",word);return <TableRow key={word}><TableCell className="font-serif text-lg font-semibold">{item?.ipa??"加载中…"}</TableCell><TableCell><span className={tableHideChinese?"blur-sm select-none":""}>{item?.meaning??"释义加载中"}</span></TableCell><TableCell><Input value={tableInputs[word]??""} onChange={(e)=>setTableInputs((old)=>({...old,[word]:e.target.value}))} className={tableChecked?(okay?"border-emerald-400 bg-emerald-50":"border-rose-400 bg-rose-50"):""}/>{tableChecked&&!okay&&<small className="mt-1 block font-bold text-rose-600">{word}</small>}</TableCell></TableRow>})}</TableBody></Table></div><div className="grid gap-3 md:hidden">{tableWords.map((word)=>{const item=lexicon[word];const okay=tableChecked&&spellMatches(tableInputs[word]??"",word);return <article className="mobile-word-row" key={word}><div><strong>{item?.ipa??"加载中…"}</strong><span className={tableHideChinese?"blur-sm select-none":""}>{item?.meaning??"释义加载中"}</span></div><Input value={tableInputs[word]??""} onChange={(e)=>setTableInputs((old)=>({...old,[word]:e.target.value}))} placeholder="写出单词" className={tableChecked?(okay?"border-emerald-400":"border-rose-400"):""}/>{tableChecked&&!okay&&<small>正确：{word}</small>}</article>})}</div><div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row"><div className="flex items-center gap-2"><Button variant="outline" size="icon" disabled={tablePage===0} onClick={()=>{setTablePage((p)=>p-1);setTableChecked(false)}}><ChevronLeft/></Button><span className="min-w-28 text-center text-sm font-bold">第 {tablePage+1} / 200 页</span><Button variant="outline" size="icon" disabled={tablePage>=199} onClick={()=>{setTablePage((p)=>p+1);setTableChecked(false)}}><ChevronRight/></Button></div><Button onClick={checkTable} className="check-button"><ListChecks/>批量核对本页</Button></div></section></TabsContent>
      <TabsContent value="wrong"><section className="table-panel"><div className="table-toolbar"><div><span className="eyebrow">自动筛选 · 集中复习</span><h2>错词强化营</h2><p>读错、拼错都会进入这里；连续答对后，复习间隔会自动拉长。</p></div><Button onClick={()=>buildQueue("wrong")} disabled={!wrongWords.length}><Gamepad2/>开始错词闯关</Button></div>{wrongWords.length?<div className="wrong-grid">{wrongWords.slice(0,50).map((row)=><article key={row.word} className="wrong-card"><div><span>{row.spellingErrors>0?"拼写":"朗读"}</span><strong>{row.word}</strong></div><p>拼错 {row.spellingErrors} 次 · 读错 {row.readingErrors} 次</p><Progress value={row.mastery*20}/></article>)}</div>:<div className="empty-state"><Trophy/><h3>还没有错词</h3><p>先去完成一轮诊断，读错或拼错的词会自动集中到这里。</p></div>}</section></TabsContent>
    </Tabs></div><footer><span>课标核心 1600</span><i/><span>译林同步拓展 400</span><i/><span>云端长期记忆</span></footer></main>;
}
