import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  MinusCircle,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import type {
  ExamAttempt,
  GradedQuestionReview,
  QuestionItem,
} from '../types';
import { api } from '../services/api';
import { ProgressRing } from './ui/Primitives';
import { MathText } from './ui/MathText';

interface ResultAnalyticsProps {
  attempts: ExamAttempt[];
  selectedAttemptId?: string | null;
  onAttemptUpdated: (updated: ExamAttempt) => void;
  onAskMentorTopic: (prompt: string) => void;
}

type ReviewFilter = 'all' | 'correct' | 'incorrect' | 'unanswered';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

export function ResultAnalytics({
  attempts,
  selectedAttemptId,
  onAttemptUpdated,
  onAskMentorTopic,
}: ResultAnalyticsProps) {
  const [activeId, setActiveId] = useState<string>(
    selectedAttemptId ?? attempts[0]?.id ?? ''
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showBanglaSolutions, setShowBanglaSolutions] = useState(true);
  const [reviewQuestions, setReviewQuestions] = useState<QuestionItem[]>([]);
  const [gradedReviews, setGradedReviews] = useState<GradedQuestionReview[]>(
    []
  );
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('all');

  // Per-question supplemental AI explanation state (keyed by `${attemptId}::${questionId}`)
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>(
    {}
  );
  const [aiExplainLoading, setAiExplainLoading] = useState<
    Record<string, boolean>
  >({});
  const [aiExplainErrors, setAiExplainErrors] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (selectedAttemptId) {
      setActiveId(selectedAttemptId);
      setActiveFilter('all');
    }
  }, [selectedAttemptId]);

  const attempt =
    attempts.find((a) => a.id === activeId) ?? attempts[0] ?? null;

  useEffect(() => {
    if (!attempt?.id) {
      setReviewQuestions([]);
      setGradedReviews([]);
      return;
    }
    let mounted = true;
    setLoadingReview(true);
    setReviewError(null);
    api
      .getAttemptReview(attempt.id)
      .then((res) => {
        if (!mounted) return;
        setReviewQuestions(res.questions);
        setGradedReviews(res.gradedQuestions);
      })
      .catch((err) => {
        if (!mounted) return;
        setReviewQuestions([]);
        setGradedReviews([]);
        setReviewError(
          err instanceof Error
            ? err.message
            : 'পরীক্ষার প্রশ্ন ও সমাধান লোড করা যায়নি।'
        );
      })
      .finally(() => {
        if (mounted) setLoadingReview(false);
      });
    return () => {
      mounted = false;
    };
  }, [attempt?.id]);

  const gradedMap = useMemo(
    () => new Map(gradedReviews.map((g) => [g.questionId, g])),
    [gradedReviews]
  );

  // Build ordered vertical review entries across ALL questions in the exam
  const orderedReviewItems = useMemo(() => {
    if (!attempt) return [];
    return reviewQuestions.map((q, index) => {
      const graded = gradedMap.get(q.id);
      const rawSelected =
        graded !== undefined
          ? graded.selectedIndex
          : (attempt.answers[q.id] ?? null);
      const selectedIndex =
        typeof rawSelected === 'number' &&
        Number.isInteger(rawSelected) &&
        rawSelected >= 0 &&
        rawSelected <= 3
          ? rawSelected
          : null;
      const correctIndex = graded ? graded.correctIndex : q.correctIndex;
      const isUnanswered = selectedIndex === null;
      const isCorrect = !isUnanswered && selectedIndex === correctIndex;
      const status: 'correct' | 'incorrect' | 'unanswered' = isUnanswered
        ? 'unanswered'
        : isCorrect
          ? 'correct'
          : 'incorrect';

      return {
        questionNumber: index + 1,
        question: q,
        selectedIndex,
        correctIndex,
        status,
        explanationEn: (graded?.explanationEn ?? q.explanationEn ?? '').trim(),
        explanationBn: (graded?.explanationBn ?? q.explanationBn ?? '').trim(),
      };
    });
  }, [attempt, gradedMap, reviewQuestions]);

  const filteredReviewItems = useMemo(() => {
    if (activeFilter === 'all') return orderedReviewItems;
    return orderedReviewItems.filter((item) => item.status === activeFilter);
  }, [activeFilter, orderedReviewItems]);

  if (!attempt) {
    return (
      <div className="card-surface rounded-2xl p-8 text-center">
        <p className="text-base font-semibold text-[#172033]">
          No exams attempted yet · এখনো কোনো পরীক্ষা সম্পন্ন হয়নি
        </p>
        <p className="text-sm text-[#64748B] mt-1">
          একটি Mock Test সম্পন্ন করলে এখানে আপনার পূর্ণাঙ্গ ফলাফল, বিষয়ভিত্তিক বিশ্লেষণ এবং প্রতিটি প্রশ্নের বিস্তারিত সমাধান দেখতে পাবেন।
        </p>
      </div>
    );
  }

  const attemptIdx = attempts.findIndex((a) => a.id === attempt.id);
  const previousAttempt =
    attemptIdx >= 0 && attemptIdx + 1 < attempts.length
      ? attempts[attemptIdx + 1]
      : null;

  const currentPct =
    attempt.maxScore > 0
      ? Math.max(0, Math.round((attempt.rawScore / attempt.maxScore) * 100))
      : 0;
  const prevPct =
    previousAttempt && previousAttempt.maxScore > 0
      ? Math.max(
          0,
          Math.round((previousAttempt.rawScore / previousAttempt.maxScore) * 100)
        )
      : null;
  const scoreDelta = prevPct !== null ? currentPct - prevPct : null;

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    if (mins === 0) return `${rem} সেকেন্ড`;
    return `${mins} মি. ${rem} সে.`;
  };

  const handleRunAiAnalysis = async () => {
    setAnalyzing(true);
    setAiError(null);
    try {
      const res = await api.analyzeAttempt(attempt.id);
      onAttemptUpdated(res.attempt);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'AI বিশ্লেষণ তৈরি করা যায়নি।'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExplainQuestionWithAi = async (questionId: string) => {
    const key = `${attempt.id}::${questionId}`;
    if (aiExplainLoading[key]) return;
    setAiExplainLoading((prev) => ({ ...prev, [key]: true }));
    setAiExplainErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const res = await api.explainReviewQuestion(attempt.id, questionId);
      setAiExplanations((prev) => ({ ...prev, [key]: res.explanation }));
    } catch (err) {
      setAiExplainErrors((prev) => ({
        ...prev,
        [key]:
          err instanceof Error
            ? err.message
            : 'AI ব্যাখ্যা তৈরি করা যায়নি।',
      }));
    } finally {
      setAiExplainLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const filterCounts = {
    all: orderedReviewItems.length || attempt.totalQuestions,
    correct:
      orderedReviewItems.length > 0
        ? orderedReviewItems.filter((i) => i.status === 'correct').length
        : attempt.correctCount,
    incorrect:
      orderedReviewItems.length > 0
        ? orderedReviewItems.filter((i) => i.status === 'incorrect').length
        : attempt.incorrectCount,
    unanswered:
      orderedReviewItems.length > 0
        ? orderedReviewItems.filter((i) => i.status === 'unanswered').length
        : attempt.skippedCount,
  };

  const filterOptions: Array<{
    id: ReviewFilter;
    label: string;
    count: number;
  }> = [
    { id: 'all', label: 'সব প্রশ্ন', count: filterCounts.all },
    { id: 'correct', label: 'সঠিক উত্তর', count: filterCounts.correct },
    { id: 'incorrect', label: 'ভুল উত্তর', count: filterCounts.incorrect },
    {
      id: 'unanswered',
      label: 'উত্তর দেওয়া হয়নি',
      count: filterCounts.unanswered,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Attempt Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold leading-[1.25] text-[#172033]">
            আপনার পরীক্ষার ফলাফল ও পর্যালোচনা
          </h1>
          <p className="text-[14px] text-[#64748B] mt-0.5">
            {attempt.examTitle} · {attempt.universityTrack}
          </p>
        </div>

        <select
          value={attempt.id}
          onChange={(e) => {
            setActiveId(e.target.value);
            setActiveFilter('all');
            setAiError(null);
          }}
          className="min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8ECF3] text-sm text-[#172033] shadow-xs"
          aria-label="পরীক্ষা নির্বাচন করুন"
        >
          {attempts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.examTitle} ({a.rawScore}/{a.maxScore})
            </option>
          ))}
        </select>
      </div>

      {/* Top Result Summary Card */}
      <section className="card-surface rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <ProgressRing
              percent={currentPct}
              size={108}
              strokeWidth={8}
              accentColor="#059669"
              secondaryColor="#4F46E5"
              label={`${attempt.rawScore}`}
              sublabel={`/ ${attempt.maxScore}`}
            />
            <div>
              <p className="text-xs font-semibold text-[#4F46E5]">
                আপনার পরীক্ষার ফলাফল
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#172033] mt-0.5 tabular-nums">
                প্রাপ্ত নম্বর: {attempt.rawScore} / {attempt.maxScore}
              </h2>
              <p className="text-xs text-[#64748B] mt-1 tabular-nums">
                সামগ্রিক স্কোর {currentPct}% · সঠিকতা {attempt.accuracy}%
              </p>
              {scoreDelta !== null && (
                <p
                  className={`text-xs mt-1.5 flex items-center gap-1 font-semibold tabular-nums ${
                    scoreDelta >= 0 ? 'text-[#059669]' : 'text-[#D97706]'
                  }`}
                >
                  {scoreDelta >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {scoreDelta >= 0 ? `+${scoreDelta}%` : `${scoreDelta}%`} (আগের{' '}
                    {previousAttempt?.examTitle}-এর তুলনায়)
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-1">
            <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3.5">
              <p className="text-xs font-medium text-[#64748B]">মোট প্রশ্ন</p>
              <p className="font-mono-num text-xl sm:text-2xl font-bold text-[#172033] mt-1">
                {attempt.totalQuestions}
              </p>
            </div>
            <div className="rounded-xl bg-[#ECFDF5] border border-[#059669]/25 p-3.5">
              <p className="text-xs font-medium text-[#065F46]">সঠিক উত্তর</p>
              <p className="font-mono-num text-xl sm:text-2xl font-bold text-[#059669] mt-1">
                {attempt.correctCount}
              </p>
            </div>
            <div className="rounded-xl bg-[#FEF2F2] border border-red-200 p-3.5">
              <p className="text-xs font-medium text-red-800">ভুল উত্তর</p>
              <p className="font-mono-num text-xl sm:text-2xl font-bold text-red-600 mt-1">
                {attempt.incorrectCount}
              </p>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] p-3.5">
              <p className="text-xs font-medium text-[#475569]">
                উত্তর দেওয়া হয়নি
              </p>
              <p className="font-mono-num text-xl sm:text-2xl font-bold text-[#475569] mt-1">
                {attempt.skippedCount}
              </p>
            </div>
            <div className="rounded-xl bg-[#EEF2FF] border border-[#4F46E5]/20 p-3.5">
              <p className="text-xs font-medium text-[#4F46E5]">সঠিকতার হার</p>
              <p className="font-mono-num text-xl sm:text-2xl font-bold text-[#4F46E5] mt-1">
                {attempt.accuracy}%
              </p>
            </div>
            <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3.5">
              <p className="text-xs font-medium text-[#64748B] flex items-center gap-1">
                <Clock className="w-3 h-3 shrink-0" />
                <span>ব্যয়িত সময়</span>
              </p>
              <p className="font-mono-num text-sm sm:text-base font-bold text-[#172033] mt-1.5 leading-tight">
                {formatDuration(attempt.durationSecondsSpent)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Subject-Wise Performance & AI Suggestions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 card-surface rounded-2xl p-5 sm:p-6">
          <h3 className="font-display text-[16px] font-semibold text-[#172033] mb-4">
            বিষয়ভিত্তিক পারফরম্যান্স
          </h3>

          <div className="space-y-4">
            {attempt.subjectBreakdown.map((sb) => (
              <div key={sb.subjectId} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#172033]">
                    {sb.subjectName === 'Higher Math'
                      ? 'Mathematics'
                      : sb.subjectName}
                  </span>
                  <div className="flex items-center gap-3 font-mono-num text-[#64748B]">
                    <span>
                      {sb.correct}/{sb.total} সঠিক
                    </span>
                    <span className="text-[#4F46E5] font-semibold">
                      {sb.accuracy}% সঠিকতা
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-[#F1F4FA] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      sb.accuracy >= 80
                        ? 'bg-[#059669]'
                        : sb.accuracy >= 60
                          ? 'bg-[#4F46E5]'
                          : 'bg-[#F59E0B]'
                    }`}
                    style={{ width: `${Math.max(4, sb.accuracy)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {attempts.length > 1 && (
            <div className="mt-6 pt-5 border-t border-[#E8ECF3]">
              <h4 className="text-xs font-semibold text-[#64748B] mb-3">
                পূর্ববর্তী পরীক্ষার তুলনা
              </h4>
              <div className="space-y-2">
                {attempts.slice(0, 4).map((hist) => {
                  const pct =
                    hist.maxScore > 0
                      ? Math.max(
                          0,
                          Math.round((hist.rawScore / hist.maxScore) * 100)
                        )
                      : 0;
                  const isCurr = hist.id === attempt.id;
                  return (
                    <button
                      key={hist.id}
                      onClick={() => {
                        setActiveId(hist.id);
                        setActiveFilter('all');
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors ${
                        isCurr
                          ? 'bg-[#EEF2FF] border border-[#4F46E5]/30 text-[#172033] font-medium'
                          : 'bg-[#F7F8FC] border border-[#E8ECF3] text-[#64748B] hover:text-[#172033]'
                      }`}
                    >
                      <span className="truncate">{hist.examTitle}</span>
                      <span className="font-mono-num shrink-0">
                        {pct}% · {hist.accuracy}% সঠিকতা
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="card-surface rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold text-[#172033]">
                অধ্যায়ভিত্তিক দুর্বলতা
              </h3>
              <Target className="w-4 h-4 text-[#F59E0B]" />
            </div>

            {attempt.topicWeaknesses.length === 0 ? (
              <p className="text-xs text-[#059669]">
                এই পরীক্ষায় কোনো অধ্যায়ে ভুল হয়নি। চমৎকার প্রস্তুতি!
              </p>
            ) : (
              <div className="space-y-2.5">
                {attempt.topicWeaknesses.map((w, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-[#172033] truncate">
                        {w.topic}
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {w.subjectName} · {w.missedCount}টি ভুল/বাদ
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        onAskMentorTopic(
                          `আমার Mock Test-এ ${w.subjectName}-এর ${w.topic} অধ্যায়ে ভুল হয়েছে। সহজ বাংলায় মূল ধারণা ও ১টি শর্টকাট বুঝিয়ে দাও।`
                        )
                      }
                      className="min-h-[36px] px-3 rounded-lg bg-[#EEF2FF] text-xs font-semibold text-[#4F46E5] shrink-0"
                    >
                      অনুশীলন করুন
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-surface rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display text-[16px] font-semibold text-[#172033]">
                AI উন্নতি পরামর্শ
              </h3>
              <button
                onClick={handleRunAiAnalysis}
                disabled={analyzing}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                {analyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {attempt.aiAnalysis ? 'পুনরায় বিশ্লেষণ' : 'AI বিশ্লেষণ দেখুন'}
                </span>
              </button>
            </div>

            {aiError && (
              <p className="text-xs text-red-700 bg-[#FEF2F2] border border-red-200 rounded-xl p-3 mb-3">
                {aiError}
              </p>
            )}

            {attempt.aiAnalysis ? (
              <div className="text-[14px] text-[#172033] leading-[1.7] whitespace-pre-wrap bg-[#F7F8FC] border border-[#E8ECF3] rounded-xl p-4">
                <MathText text={attempt.aiAnalysis} />
              </div>
            ) : (
              <p className="text-[13px] text-[#64748B] leading-[1.65]">
                &ldquo;AI বিশ্লেষণ দেখুন&rdquo; বাটনে ক্লিক করে এই পরীক্ষার ফলাফল অনুযায়ী সহজ বাংলায় করণীয় ও পরামর্শ পান।
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Detailed Vertical Question-by-Question Review */}
      <section className="space-y-4">
        <div className="card-surface rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-[#172033]">
                বিস্তারিত প্রশ্ন ও উত্তর পর্যালোচনা
              </h3>
              <p className="text-xs sm:text-[13px] text-[#64748B] mt-0.5">
                প্রতিটি প্রশ্নের চারটি অপশন, আপনার নির্বাচিত উত্তর, সঠিক উত্তর এবং ব্যাখ্যা নিচে ক্রমানুসারে দেওয়া হয়েছে।
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowBanglaSolutions((b) => !b)}
              className="self-start sm:self-auto min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#4F46E5] hover:bg-[#EEF2FF] transition-colors"
            >
              {showBanglaSolutions
                ? 'বাংলা + EN ব্যাখ্যা সক্রিয়'
                : 'বাংলা ব্যাখ্যা দেখুন'}
            </button>
          </div>

          {/* Filter Buttons */}
          <div
            className="flex flex-wrap items-center gap-2 pt-1"
            role="group"
            aria-label="প্রশ্ন ফিল্টার"
          >
            {filterOptions.map((opt) => {
              const active = activeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActiveFilter(opt.id)}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs sm:text-[13px] font-semibold flex items-center gap-2 transition-colors ${
                    active
                      ? 'bg-[#4F46E5] border-[#4F46E5] text-white shadow-xs'
                      : 'bg-[#F7F8FC] border-[#E8ECF3] text-[#475569] hover:text-[#172033] hover:bg-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`font-mono-num text-xs px-1.5 py-0.5 rounded-md ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-[#172033] border border-[#E8ECF3]'
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Vertical Single-Column Question Cards */}
        {loadingReview ? (
          <div className="card-surface rounded-2xl p-10 text-center text-sm text-[#64748B] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" />
            <span>সব প্রশ্ন ও সমাধান লোড হচ্ছে...</span>
          </div>
        ) : reviewError ? (
          <div className="card-surface rounded-2xl p-8 text-center text-sm text-red-600">
            {reviewError}
          </div>
        ) : orderedReviewItems.length === 0 ? (
          <div className="card-surface rounded-2xl p-8 text-center text-sm text-[#64748B]">
            এই পরীক্ষার প্রশ্ন পর্যালোচনা পাওয়া যায়নি।
          </div>
        ) : filteredReviewItems.length === 0 ? (
          <div className="card-surface rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-[#172033]">
              নির্বাচিত ফিল্টারে কোনো প্রশ্ন নেই
            </p>
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#EEF2FF] text-xs font-semibold text-[#4F46E5]"
            >
              সব প্রশ্ন দেখুন
            </button>
          </div>
        ) : (
          <div className="flex flex-col space-y-5">
            {filteredReviewItems.map((item) => {
              const {
                questionNumber,
                question: q,
                selectedIndex,
                correctIndex,
                status,
                explanationEn,
                explanationBn,
              } = item;

              const qLabel = `QUESTION ${String(questionNumber).padStart(2, '0')}`;
              const selectedLetter =
                selectedIndex !== null ? OPTION_LETTERS[selectedIndex] : null;
              const correctLetter = OPTION_LETTERS[correctIndex] ?? 'A';

              const aiKey = `${attempt.id}::${q.id}`;
              const extraAiExplanation = aiExplanations[aiKey];
              const isAiExplaining = Boolean(aiExplainLoading[aiKey]);
              const aiExplainErr = aiExplainErrors[aiKey];

              const cardBorderClass =
                status === 'correct'
                  ? 'border-[#059669]/40'
                  : status === 'incorrect'
                    ? 'border-red-300'
                    : 'border-[#CBD5E1]';

              const headerTintClass =
                status === 'correct'
                  ? 'bg-[#ECFDF5]/65 border-[#059669]/20'
                  : status === 'incorrect'
                    ? 'bg-[#FEF2F2]/75 border-red-200'
                    : 'bg-[#F8FAFC] border-[#E2E8F0]';

              const hasDistinctPromptBn =
                Boolean(q.promptBn?.trim()) &&
                q.promptBn?.trim() !== q.prompt.trim();

              const hasDistinctExplEn =
                Boolean(explanationEn) && explanationEn !== explanationBn;
              const hasAnyOfficialExplanation =
                Boolean(explanationBn) || Boolean(explanationEn);

              return (
                <article
                  key={q.id}
                  className={`w-full bg-white rounded-2xl border ${cardBorderClass} shadow-[0_1px_2px_rgba(23,32,51,0.04),0_6px_16px_rgba(23,32,51,0.03)] overflow-hidden`}
                >
                  {/* Card Top Status Header */}
                  <div
                    className={`px-5 sm:px-6 py-3.5 border-b ${headerTintClass} flex flex-wrap items-center justify-between gap-2.5`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#64748B]">
                      <span className="font-mono-num text-[13px] font-bold tracking-wide text-[#172033]">
                        {qLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-[#334155]">
                        {q.subjectName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{q.chapter}</span>
                    </div>

                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-bold ${
                        status === 'correct'
                          ? 'bg-white border-[#059669]/35 text-[#059669]'
                          : status === 'incorrect'
                            ? 'bg-white border-red-300 text-red-600'
                            : 'bg-white border-[#CBD5E1] text-[#475569]'
                      }`}
                    >
                      {status === 'correct' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>সঠিক উত্তর</span>
                        </>
                      ) : status === 'incorrect' ? (
                        <>
                          <XCircle className="w-4 h-4 shrink-0" />
                          <span>ভুল উত্তর</span>
                        </>
                      ) : (
                        <>
                          <MinusCircle className="w-4 h-4 shrink-0" />
                          <span>উত্তর দেওয়া হয়নি</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 sm:p-6 space-y-5">
                    {/* Question Text & Optional Diagram */}
                    <div className="space-y-2.5">
                      <div className="text-[16px] sm:text-[17px] font-semibold text-[#172033] leading-[1.65] break-words">
                        <MathText text={q.prompt} />
                      </div>
                      {showBanglaSolutions && hasDistinctPromptBn && (
                        <div className="text-[15px] text-[#475569] leading-[1.7] break-words">
                          <MathText text={q.promptBn} />
                        </div>
                      )}
                      {q.imageUrl && (
                        <img
                          src={q.imageUrl}
                          alt={`প্রশ্ন ${questionNumber}-এর চিত্র`}
                          className="max-h-64 rounded-xl border border-[#E8ECF3] object-contain bg-[#F7F8FC] p-2 mt-2"
                        />
                      )}
                    </div>

                    {/* All 4 MCQ Options Stacked Vertically */}
                    <div className="space-y-2.5">
                      {q.options.map((opt, optIdx) => {
                        const letter = OPTION_LETTERS[optIdx] ?? 'A';
                        const isOptionCorrect = optIdx === correctIndex;
                        const isOptionSelected = optIdx === selectedIndex;

                        let rowClass =
                          'bg-[#F8FAFC] border-[#E8ECF3] text-[#172033]';
                        let letterClass =
                          'bg-white text-[#64748B] border-[#E8ECF3]';

                        if (isOptionCorrect) {
                          rowClass =
                            'bg-[#ECFDF5] border-[#059669]/45 text-[#065F46]';
                          letterClass =
                            'bg-[#059669] text-white border-[#059669]';
                        } else if (isOptionSelected && !isOptionCorrect) {
                          rowClass =
                            'bg-[#FEF2F2] border-red-300 text-red-900';
                          letterClass =
                            'bg-red-600 text-white border-red-600';
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`w-full px-4 py-3 rounded-xl border flex items-start sm:items-center justify-between gap-3 ${rowClass}`}
                          >
                            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                              <span
                                className={`w-7 h-7 rounded-lg border font-mono-num text-xs font-bold flex items-center justify-center shrink-0 ${letterClass}`}
                              >
                                {letter}
                              </span>
                              <span className="text-[14.5px] sm:text-[15px] leading-[1.55] break-words">
                                <MathText text={opt} />
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isOptionCorrect && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#059669]">
                                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                                  <span>সঠিক উত্তর</span>
                                </span>
                              )}
                              {isOptionSelected && !isOptionCorrect && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                                  <XCircle className="w-4 h-4 shrink-0" />
                                  <span>আপনার উত্তর</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explicit Answer & Status Summary Bar */}
                    <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#64748B] font-medium">
                          আপনার নির্বাচিত উত্তর:
                        </span>
                        <span
                          className={`font-mono-num font-bold ${
                            status === 'correct'
                              ? 'text-[#059669]'
                              : status === 'incorrect'
                                ? 'text-red-600'
                                : 'text-[#475569]'
                          }`}
                        >
                          {selectedLetter ?? 'উত্তর দেওয়া হয়নি'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[#64748B] font-medium">
                          সঠিক উত্তর:
                        </span>
                        <span className="font-mono-num font-bold text-[#059669]">
                          {correctLetter}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[#64748B] font-medium">
                          অবস্থা:
                        </span>
                        <span
                          className={`font-semibold ${
                            status === 'correct'
                              ? 'text-[#059669]'
                              : status === 'incorrect'
                                ? 'text-red-600'
                                : 'text-[#475569]'
                          }`}
                        >
                          {status === 'correct'
                            ? 'সঠিক উত্তর'
                            : status === 'incorrect'
                              ? 'ভুল উত্তর'
                              : 'উত্তর দেওয়া হয়নি'}
                        </span>
                      </div>
                    </div>

                    {/* Official Explanation + Optional Supplemental AI Explanation */}
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#172033]">
                          <BookOpen className="w-3.5 h-3.5 text-[#4F46E5]" />
                          <span>ব্যাখ্যা:</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleExplainQuestionWithAi(q.id)}
                          disabled={isAiExplaining}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-white border border-[#E8ECF3] hover:border-[#4F46E5]/40 hover:bg-[#EEF2FF]/60 text-xs font-semibold text-[#4F46E5] inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
                        >
                          {isAiExplaining ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {extraAiExplanation
                              ? 'AI দিয়ে পুনরায় ব্যাখ্যা দেখুন'
                              : 'AI দিয়ে সহজ ব্যাখ্যা দেখুন'}
                          </span>
                        </button>
                      </div>

                      {hasAnyOfficialExplanation ? (
                        <div className="space-y-2 text-[14px] leading-[1.7] text-[#334155]">
                          {explanationBn && (
                            <div className="break-words">
                              <MathText text={explanationBn} />
                            </div>
                          )}
                          {hasDistinctExplEn && (
                            <div className="text-[13.5px] text-[#64748B] break-words">
                              <MathText text={explanationEn} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[13.5px] text-[#64748B] flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                          <span>ব্যাখ্যা এখনো যোগ করা হয়নি</span>
                        </p>
                      )}

                      {aiExplainErr && (
                        <p className="text-xs text-red-700 bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2">
                          {aiExplainErr}
                        </p>
                      )}

                      {extraAiExplanation && (
                        <div className="mt-2 pt-3 border-t border-[#E2E8F0] space-y-1.5">
                          <p className="text-xs font-semibold text-[#4F46E5] flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              অতিরিক্ত AI ব্যাখ্যা (সঠিক উত্তর {correctLetter} অনুযায়ী):
                            </span>
                          </p>
                          <div className="text-[14px] text-[#172033] leading-[1.7] whitespace-pre-wrap break-words">
                            <MathText text={extraAiExplanation} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
