import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  Languages,
  Loader2,
  Send,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import type {
  AiGeneratedQuestion,
  AiStatusInfo,
  AiStudyPlanResponse,
  StudentProfile,
  SubjectSummary,
  UniversityTrack,
} from '../types';
import { api } from '../services/api';
import { MathText } from './ui/MathText';

interface AiMentorViewProps {
  student: StudentProfile;
  subjects: SubjectSummary[];
  aiStatus: AiStatusInfo;
  initialPrompt?: string;
  initialMode?: 'chat' | 'plan' | 'practice';
  onClearInitialPrompt?: () => void;
}

interface MentorMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
}

export function AiMentorView({
  student,
  subjects,
  aiStatus,
  initialPrompt,
  initialMode = 'chat',
  onClearInitialPrompt,
}: AiMentorViewProps) {
  const activeSubjects = subjects.filter((s) => s.solvedCount > 0);
  const weakestSorted = [...activeSubjects].sort((a, b) => a.accuracy - b.accuracy);
  const defaultGoal =
    weakestSorted.length > 0
      ? `${student.targetTrack} ভর্তির জন্য ${weakestSorted[0].name}${
          weakestSorted[0].weakestTopic ? ` (${weakestSorted[0].weakestTopic})` : ''
        }-এ সঠিকতা বাড়ানো`
      : `${student.targetTrack} ভর্তি পরীক্ষার মৌলিক সিলেবাস প্রস্তুতি`;

  const [mode, setMode] = useState<'chat' | 'plan' | 'practice'>(initialMode);
  const [language, setLanguage] = useState<'bilingual' | 'bangla' | 'english'>(
    'bilingual'
  );
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [focusGoal, setFocusGoal] = useState(defaultGoal);
  const [studyPlan, setStudyPlan] = useState<AiStudyPlanResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [practiceSubject, setPracticeSubject] = useState(
    subjects[0]?.name ?? 'Physics'
  );
  const [practiceTopic, setPracticeTopic] = useState(
    weakestSorted[0]?.weakestTopic ?? ''
  );
  const [practiceTrack, setPracticeTrack] = useState<UniversityTrack>(
    student.targetTrack
  );
  const [practiceQuestions, setPracticeQuestions] = useState<
    AiGeneratedQuestion[]
  >([]);
  const [practiceAnswers, setPracticeAnswers] = useState<
    Record<number, number>
  >({});
  const [loadingPractice, setLoadingPractice] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialPrompt) {
      setMode('chat');
      setInput(initialPrompt);
      onClearInitialPrompt?.();
    }
  }, [initialPrompt, onClearInitialPrompt]);

  const weakestSubjects = weakestSorted;

  const sendMentorMessage = async (textOverride?: string) => {
    const query = (textOverride ?? input).trim();
    if (!query || loadingChat) return;

    setChatError(null);
    const userMsg: MentorMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: query,
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!textOverride) setInput('');
    setLoadingChat(true);

    try {
      const res = await api.askMentor(query, language);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.reply,
          model: res.model,
        },
      ]);
    } catch (err) {
      setChatError(
        err instanceof Error
          ? err.message
          : 'AI মেন্টরের সাথে সংযোগ স্থাপন করা যায়নি।'
      );
    } finally {
      setLoadingChat(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (loadingPlan) return;
    setLoadingPlan(true);
    setPlanError(null);
    try {
      const res = await api.generateStudyPlan(focusGoal);
      setStudyPlan(res);
    } catch (err) {
      setPlanError(
        err instanceof Error
          ? err.message
          : 'স্টাডি প্ল্যান তৈরি করা যায়নি।'
      );
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleGeneratePractice = async () => {
    if (loadingPractice) return;
    setLoadingPractice(true);
    setPracticeError(null);
    setPracticeAnswers({});
    try {
      const res = await api.generatePracticeQuestions({
        subject: practiceSubject,
        topic: practiceTopic,
        universityTrack: practiceTrack,
        count: 3,
      });
      setPracticeQuestions(res.questions);
    } catch (err) {
      setPracticeError(
        err instanceof Error
          ? err.message
          : 'অনুশীলনী MCQ তৈরি করা যায়নি।'
      );
    } finally {
      setLoadingPractice(false);
    }
  };

  const quickPrompts = [
    `Definite Integrals-এর King's Property সহজ বাংলায় একটি শর্টকাট উদাহরণসহ বুঝিয়ে দাও`,
    `কিটোন কেন Tollens পরীক্ষা দেয় না? DU Ka Unit পরীক্ষার উপযোগী সহজ ট্রিক বলো`,
    `${student.targetTrack} Mock Test-এ নেগেটিভ মার্কিং কমানোর কার্যকর কৌশল কী?`,
  ];

  return (
    <div className="space-y-6">
      {/* Header & Workspace Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#4F46E5] font-semibold">
            <Brain className="w-3.5 h-3.5" />
            <span>
              ADMITLY AI মেন্টর · {aiStatus.model} ·{' '}
              {aiStatus.configured ? 'সংযুক্ত' : 'API কী প্রয়োজন'}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold leading-[1.25] text-[#172033] mt-1">
            ব্যক্তিগত ভর্তি AI মেন্টর
          </h1>
          <p className="text-[14px] leading-[1.65] text-[#64748B] mt-1">
            সহজ বাংলায় যেকোনো কনসেপ্ট বোঝা, দুর্বল অধ্যায় নির্ণয় এবং বিষয়ভিত্তিক MCQ অনুশীলন।
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-[#E8ECF3] self-start shadow-xs overflow-x-auto max-w-full">
          <button
            onClick={() => setMode('chat')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              mode === 'chat'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            AI-কে জিজ্ঞাসা করুন
          </button>
          <button
            onClick={() => setMode('plan')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              mode === 'plan'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            স্টাডি সাজেশন
          </button>
          <button
            onClick={() => setMode('practice')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              mode === 'practice'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            অনুশীলন প্র্যাকটিস
          </button>
        </div>
      </div>

      {!aiStatus.configured && (
        <div className="rounded-2xl bg-[#FEF3C7] border border-[#F59E0B]/30 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-[#172033]">
            <p className="font-semibold">
              সার্ভারে লাইভ Gemini AI কী সেট করা হয়নি
            </p>
            <p className="text-[#64748B] mt-0.5 leading-relaxed">
              লাইভ AI উত্তর ও অনুশীলনী প্রশ্ন তৈরির জন্য{' '}
              <code className="font-mono-num text-[#172033]">GEMINI_API_KEY</code>{' '}
              যোগ করুন। তবে আপনার পরীক্ষার দুর্বলতা বিশ্লেষণ আগের মতোই চলবে।
            </p>
          </div>
        </div>
      )}

      {/* Intelligent Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8">
          {mode === 'chat' && (
            <div className="card-surface rounded-2xl p-5 sm:p-6 flex flex-col min-h-[500px]">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E8ECF3]">
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <Languages className="w-4 h-4 text-[#4F46E5]" />
                  <span>ব্যাখ্যার ভাষা</span>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3]">
                  {(
                    [
                      ['bilingual', 'বাংলা + EN'],
                      ['bangla', 'সহজ বাংলা'],
                      ['english', 'English'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setLanguage(val)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        language === val
                          ? 'bg-white text-[#172033] shadow-xs'
                          : 'text-[#64748B] hover:text-[#172033]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 py-5 space-y-4 overflow-y-auto max-h-[420px]">
                {messages.length === 0 ? (
                  <div className="space-y-5">
                    <div>
                      <h2 className="font-display text-[17px] font-semibold text-[#172033]">
                        যেকোনো ভর্তি কনসেপ্ট বা সূত্র নিয়ে AI-কে প্রশ্ন করুন
                      </h2>
                      <p className="text-[13px] text-[#64748B] mt-1">
                        {weakestSubjects.length > 0 && weakestSubjects[0].weakestTopic ? (
                          <>
                            আপনার অগ্রাধিকার অধ্যায়:{' '}
                            <span className="text-[#172033] font-semibold">
                              {weakestSubjects[0].weakestTopic}
                            </span>
                            {weakestSubjects[1]?.weakestTopic ? (
                              <>
                                {' '}এবং{' '}
                                <span className="text-[#172033] font-semibold">
                                  {weakestSubjects[1].weakestTopic}
                                </span>
                              </>
                            ) : null}
                            ।
                          </>
                        ) : (
                          'ভর্তি পরীক্ষার যেকোনো সূত্র, বিক্রিয়া বা সমস্যা সহজ বাংলায় জানতে নিচে লিখুন।'
                        )}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-[#64748B]">
                        প্রস্তাবিত প্রশ্ন
                      </p>
                      {quickPrompts.map((p) => (
                        <button
                          key={p}
                          onClick={() => sendMentorMessage(p)}
                          className="w-full text-left px-4 py-3 rounded-xl bg-[#F7F8FC] hover:bg-[#EEF2FF] border border-[#E8ECF3] text-[14px] font-medium text-[#172033] transition-colors flex items-center justify-between gap-3"
                        >
                          <span>{p}</span>
                          <Sparkles className="w-4 h-4 text-[#4F46E5] shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${
                        m.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-4 py-3 text-[14.5px] leading-[1.7] whitespace-pre-wrap ${
                          m.role === 'user'
                            ? 'bg-[#4F46E5] text-white'
                            : 'bg-[#F7F8FC] border border-[#E8ECF3] text-[#172033]'
                        }`}
                      >
                        {m.role === 'user' ? m.text : <MathText text={m.text} />}
                      </div>
                    </div>
                  ))
                )}

                {loadingChat && (
                  <div className="flex items-center gap-2 text-xs text-[#4F46E5] py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>সহজ ব্যাখ্যা তৈরি হচ্ছে...</span>
                  </div>
                )}

                {chatError && (
                  <div className="rounded-xl bg-[#FEF2F2] border border-red-200 p-3 text-xs text-red-700">
                    {chatError}
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMentorMessage();
                }}
                className="pt-4 border-t border-[#E8ECF3] flex items-center gap-2.5"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Physics, Chemistry, Math, Biology বা English নিয়ে প্রশ্ন লিখুন..."
                  className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white transition-colors"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loadingChat}
                  className="min-h-[46px] px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">জিজ্ঞাসা করুন</span>
                </button>
              </form>
            </div>
          )}

          {mode === 'plan' && (
            <div className="card-surface rounded-2xl p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-[17px] sm:text-lg font-semibold text-[#172033]">
                  ব্যক্তিগত স্টাডি প্ল্যান
                </h2>
                <p className="text-[13px] text-[#64748B] mt-1">
                  আপনার বিষয়ভিত্তিক সঠিকতা ও {student.targetTrack} লক্ষ্য অনুযায়ী তৈরি রুটিন।
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={focusGoal}
                  onChange={(e) => setFocusGoal(e.target.value)}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                  placeholder="আপনার পড়ার লক্ষ্য লিখুন..."
                />
                <button
                  onClick={handleGeneratePlan}
                  disabled={loadingPlan}
                  className="min-h-[44px] px-5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 shrink-0"
                >
                  {loadingPlan ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CalendarDays className="w-4 h-4" />
                  )}
                  <span>
                    {loadingPlan ? 'তৈরি হচ্ছে...' : 'স্টাডি প্ল্যান তৈরি করুন'}
                  </span>
                </button>
              </div>

              {planError && (
                <div className="rounded-xl bg-[#FEF2F2] border border-red-200 p-3.5 text-xs text-red-700">
                  {planError}
                </div>
              )}

              {studyPlan ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-4">
                    <p className="text-[14px] text-[#172033] leading-[1.65]">
                      {studyPlan.summary}
                    </p>
                    <p className="text-[14px] text-[#4F46E5] mt-2 font-medium leading-[1.65]">
                      {studyPlan.focusMessageBn}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {studyPlan.dailyBlocks.map((b, i) => (
                      <div
                        key={i}
                        className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#4F46E5]">
                            {b.day} · {b.subject}
                          </span>
                          <span className="font-mono-num font-medium text-[#64748B]">
                            {b.durationMinutes} মিনিট
                          </span>
                        </div>
                        <p className="text-[14px] font-semibold text-[#172033]">
                          {b.topic}
                        </p>
                        <p className="text-[13px] text-[#64748B] leading-[1.6]">
                          {b.actionItem}
                        </p>
                        <p className="text-[13.5px] text-[#059669] pt-2 border-t border-[#E8ECF3] leading-[1.65]">
                          {b.banglaTip}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-8 text-center">
                  <CalendarDays className="w-8 h-8 text-[#4F46E5] mx-auto mb-2" />
                  <p className="text-sm font-medium text-[#172033]">
                    ৪ দিনের লক্ষ্যভিত্তিক স্টাডি রুটিন তৈরি করতে প্রস্তুত
                  </p>
                  <p className="text-xs text-[#64748B] mt-1">
                    &ldquo;স্টাডি প্ল্যান তৈরি করুন&rdquo; বাটনে ক্লিক করে আপনার অধ্যায়ভিত্তিক সময়সূচি ও বাংলা টিপস পান।
                  </p>
                </div>
              )}
            </div>
          )}

          {mode === 'practice' && (
            <div className="card-surface rounded-2xl p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#172033]">
                  AI ভিত্তিক MCQ অনুশীলন
                </h2>
                <p className="text-xs text-[#64748B] mt-1">
                  বিষয় ও অধ্যায় নির্বাচন করে তাৎক্ষণিক বাংলা ও ইংরেজি ব্যাখ্যাসহ ভর্তি MCQ প্র্যাকটিস করুন।
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={practiceSubject}
                  onChange={(e) => setPracticeSubject(e.target.value)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033]"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.banglaName} ({s.name === 'Higher Math' ? 'Mathematics' : s.name})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={practiceTopic}
                  onChange={(e) => setPracticeTopic(e.target.value)}
                  placeholder="অধ্যায় বা টপিকের নাম..."
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033]"
                />
                <select
                  value={practiceTrack}
                  onChange={(e) =>
                    setPracticeTrack(e.target.value as UniversityTrack)
                  }
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033]"
                >
                  <option value="BUET">BUET Standard</option>
                  <option value="DU Ka">DU Ka Unit (ঢাবি ক)</option>
                  <option value="DU Kha">DU Kha Unit (ঢাবি খ)</option>
                  <option value="Medical">Medical Admission</option>
                  <option value="GST">GST Cluster</option>
                </select>
              </div>

              <button
                onClick={handleGeneratePractice}
                disabled={loadingPractice}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2"
              >
                {loadingPractice ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>
                  {loadingPractice
                    ? '৩টি MCQ তৈরি হচ্ছে...'
                    : '৩টি অনুশীলনী MCQ তৈরি করুন'}
                </span>
              </button>

              {practiceError && (
                <div className="rounded-xl bg-[#FEF2F2] border border-red-200 p-3.5 text-xs text-red-700">
                  {practiceError}
                </div>
              )}

              {practiceQuestions.length > 0 ? (
                <div className="space-y-4">
                  {practiceQuestions.map((q, qIdx) => {
                    const picked = practiceAnswers[qIdx];
                    const answered = picked !== undefined;
                    return (
                      <div
                        key={qIdx}
                        className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-4 sm:p-5 space-y-3"
                      >
                        <div className="text-xs text-[#4F46E5] font-semibold">
                          প্রশ্ন {qIdx + 1} · {q.topic}
                        </div>
                        <div className="text-[15px] font-medium text-[#172033] leading-[1.6]">
                          <MathText text={q.prompt} />
                        </div>
                        <div className="text-[14.5px] text-[#64748B] leading-[1.65]">
                          <MathText text={q.promptBn} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {q.options.map((opt, optIdx) => {
                            const isPick = picked === optIdx;
                            const isRight = q.correctIndex === optIdx;
                            let cls =
                              'bg-white border-[#E8ECF3] text-[#172033] hover:border-[#4F46E5]/50';
                            if (answered) {
                              if (isRight)
                                cls =
                                  'bg-[#ECFDF5] border-[#059669]/50 text-[#065F46] font-semibold';
                              else if (isPick)
                                cls =
                                  'bg-[#FEF2F2] border-red-300 text-red-900';
                              else
                                cls =
                                  'bg-white/60 border-[#E8ECF3] text-[#64748B]';
                            }

                            return (
                              <button
                                key={optIdx}
                                disabled={answered}
                                onClick={() =>
                                  setPracticeAnswers((prev) => ({
                                    ...prev,
                                    [qIdx]: optIdx,
                                  }))
                                }
                                className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-left text-[13.5px] sm:text-sm flex items-center justify-between gap-2 ${cls}`}
                              >
                                <span className="flex items-start gap-2 min-w-0">
                                  <span className="font-mono-num font-semibold shrink-0">
                                    {String.fromCharCode(65 + optIdx)}.
                                  </span>
                                  <span className="break-words">
                                    <MathText text={opt} />
                                  </span>
                                </span>
                                {answered && isRight && (
                                  <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                                )}
                                {answered && isPick && !isRight && (
                                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {answered && (
                          <div className="pt-3 border-t border-[#E8ECF3] space-y-1.5">
                            <div className="text-[13.5px] text-[#172033] leading-[1.6]">
                              <MathText text={q.explanationEn} />
                            </div>
                            <div className="text-[14px] text-[#0891B2] leading-[1.65]">
                              সহজ বাংলায়: <MathText text={q.explanationBn} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-8 text-center">
                  <BookOpen className="w-8 h-8 text-[#06B6D4] mx-auto mb-2" />
                  <p className="text-sm font-semibold text-[#172033]">
                    অনুশীলনের জন্য বিষয় ও অধ্যায় নির্বাচন করুন
                  </p>
                  <p className="text-[13px] text-[#64748B] mt-1">
                    AI আপনার {practiceTrack} মানের নতুন MCQ এবং বাংলা ব্যাখ্যা তৈরি করে দেবে।
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Weakness Analysis & Personalized Suggestions Rail */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="card-surface rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-[16px] font-semibold text-[#172033]">
                দুর্বলতা বিশ্লেষণ
              </h2>
              <Target className="w-4 h-4 text-[#F59E0B]" />
            </div>

            {weakestSubjects.length === 0 ? (
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-4 text-xs text-[#64748B] leading-relaxed">
                এখনো কোনো Mock Test দেওয়া হয়নি। পরীক্ষা সম্পন্ন করলে এখানে আপনার বিষয়ভিত্তিক দুর্বল অধ্যায় ও সঠিকতার বিশ্লেষণ তৈরি হবে।
              </div>
            ) : (
              <>
                <p className="text-[13px] text-[#64748B] mb-3.5">
                  আপনার Mock Test ফলাফল অনুযায়ী কম দখল থাকা অধ্যায়সমূহ।
                </p>

                <div className="space-y-3">
                  {weakestSubjects.slice(0, 4).map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#172033]">
                          {s.banglaName}
                        </span>
                        <span
                          className={`font-mono-num font-semibold ${
                            s.accuracy < 70 ? 'text-[#D97706]' : 'text-[#4F46E5]'
                          }`}
                        >
                          {s.accuracy}% সঠিকতা
                        </span>
                      </div>
                      <p className="text-[13px] text-[#64748B] mt-1">
                        গুরুত্ব দিন:{' '}
                        <span className="font-medium text-[#172033]">
                          {s.weakestTopic || s.name}
                        </span>
                      </p>
                      <button
                        onClick={() => {
                          setMode('chat');
                          sendMentorMessage(
                            `${s.name}-এর ${s.weakestTopic || 'গুরুত্বপূর্ণ'} অধ্যায়টি একদম মৌলিক থেকে ${student.targetTrack} পরীক্ষার মান পর্যন্ত সহজ বাংলায় বুঝিয়ে দাও।`
                          );
                        }}
                        className="mt-2 text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA]"
                      >
                        AI দিয়ে বুঝে নিন →
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card-surface rounded-2xl p-5">
            <h2 className="font-display text-[16px] font-semibold text-[#172033] mb-2.5">
              ব্যক্তিগত স্টাডি সাজেশন
            </h2>
            {weakestSubjects.length === 0 ? (
              <p className="text-xs text-[#64748B] leading-relaxed">
                প্রথম Mock Test দিলে আপনার দুর্বল অধ্যায় ও ব্যক্তিগত সাজেশন এখানে স্বয়ংক্রিয়ভাবে তৈরি হবে।
              </p>
            ) : (
              <ul className="space-y-2.5 text-xs text-[#64748B] leading-relaxed">
                {weakestSubjects.slice(0, 3).map((subj, idx) => (
                  <li
                    key={subj.id}
                    className={
                      idx < Math.min(2, weakestSubjects.length - 1)
                        ? 'pb-2.5 border-b border-[#E8ECF3]'
                        : ''
                    }
                  >
                    <span className="text-[#172033] font-medium block">
                      {subj.banglaName} ({subj.accuracy}% সঠিকতা)
                    </span>
                    {subj.weakestTopic
                      ? `${subj.weakestTopic} অধ্যায়ের সূত্র ও বিগত বছরের প্রশ্ন পুনরায় অনুশীলন করুন।`
                      : `${subj.name} বিষয়ে অনুশীলন বাড়িয়ে ${student.targetTrack} প্রস্তুতি জোরদার করুন।`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
