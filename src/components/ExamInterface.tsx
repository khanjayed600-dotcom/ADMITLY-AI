import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Clock,
  Grid,
  Send,
  X,
} from 'lucide-react';
import type { ExamConfig, StudentQuestionItem } from '../types';
import { MathText } from './ui/MathText';

interface ExamInterfaceProps {
  exam: ExamConfig;
  questions: StudentQuestionItem[];
  onCancel: () => void;
  onSubmitExam: (payload: {
    examId: string;
    answers: Record<string, number | null>;
    markedForReview: string[];
    durationSecondsSpent: number;
    submissionId?: string;
  }) => Promise<void>;
}

export function ExamInterface({
  exam,
  questions,
  onCancel,
  onSubmitExam,
}: ExamInterfaceProps) {
  const examQuestions = useMemo(() => {
    const map = new Map(questions.map((q) => [q.id, q]));
    return exam.questionIds
      .map((id) => map.get(id))
      .filter((q): q is StudentQuestionItem => Boolean(q));
  }, [exam, questions]);

  const submissionId = useMemo(
    () =>
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    [exam.id]
  );

  const totalDurationSeconds = exam.durationMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalDurationSeconds);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [markedIds, setMarkedIds] = useState<string[]>([]);
  const [bilingual, setBilingual] = useState(true);
  const [paletteOpenMobile, setPaletteOpenMobile] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const questionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const answeredCount = examQuestions.filter(
    (q) => answers[q.id] !== undefined && answers[q.id] !== null
  ).length;
  const unansweredCount = examQuestions.length - answeredCount;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSelectOption = (questionId: string, idx: number, optionIndex: number) => {
    setActiveIndex(idx);
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleClearChoice = (questionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: null,
    }));
  };

  const toggleMarkForReview = (questionId: string, idx: number) => {
    setActiveIndex(idx);
    setMarkedIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId]
    );
  };

  const scrollToQuestion = (idx: number, questionId: string) => {
    setActiveIndex(idx);
    const el = questionRefs.current[questionId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleFinalSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const elapsed = Math.max(1, totalDurationSeconds - secondsLeft);
      await onSubmitExam({
        examId: exam.id,
        answers,
        markedForReview: markedIds,
        durationSecondsSpent: elapsed,
        submissionId,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'পরীক্ষা জমা দেওয়া যায়নি।'
      );
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [answers, exam.id, markedIds, onSubmitExam, secondsLeft, submissionId, totalDurationSeconds]);

  useEffect(() => {
    if (secondsLeft === 0 && !autoSubmittedRef.current && examQuestions.length > 0) {
      autoSubmittedRef.current = true;
      setConfirmOpen(true);
      void handleFinalSubmit();
    }
  }, [secondsLeft, examQuestions.length, handleFinalSubmit]);

  if (examQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center p-6">
        <div className="card-surface max-w-md w-full rounded-2xl p-6 text-center">
          <p className="text-base font-semibold text-[#172033]">
            এই পরীক্ষার জন্য কোনো প্রশ্ন পাওয়া যায়নি
          </p>
          <button
            onClick={onCancel}
            className="mt-4 min-h-[44px] px-4 py-2 rounded-xl bg-[#4F46E5] text-white text-sm font-medium"
          >
            ড্যাশবোর্ডে ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  const timerLow = secondsLeft <= 120;

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#172033] flex flex-col">
      {/* Distraction-Free Light Examination Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E8ECF3] px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <span className="text-[#4F46E5] font-semibold">
                {exam.universityTrack}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num font-medium">
                মোট {examQuestions.length}টি প্রশ্ন
              </span>
            </div>
            <h1 className="font-display text-[15px] sm:text-base font-bold text-[#172033] truncate">
              {exam.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setBilingual((b) => !b)}
              className="hidden sm:inline-flex min-h-[38px] items-center px-3 py-1.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-medium text-[#64748B] hover:text-[#172033] transition-colors whitespace-nowrap"
            >
              {bilingual ? 'বাংলা + EN' : 'শুধু EN'}
            </button>

            <div
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono-num text-sm sm:text-base font-bold ${
                timerLow
                  ? 'bg-[#FEF3C7] border-[#F59E0B]/50 text-[#B45309]'
                  : 'bg-[#F7F8FC] border-[#E8ECF3] text-[#172033]'
              }`}
              aria-label="অবশিষ্ট সময়"
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimer(secondsLeft)}</span>
            </div>

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>জমা দিন</span>
            </button>
          </div>
        </div>
      </header>

      {/* Two-Zone Exam Body: Full Vertical Question Paper + Sticky Palette */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-28 lg:pb-12">
        <div className="lg:col-span-8 space-y-5">
          {/* Exam Paper Intro & Mobile Bilingual Switch */}
          <div className="card-surface rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>
              সকল প্রশ্ন নিচে একসাথে দেওয়া হলো — প্রতিটি প্রশ্নের সঠিক অপশন বেছে নিয়ে শেষে{' '}
              <strong className="text-[#172033]">জমা দিন</strong> বাটনে ক্লিক করুন।
            </span>
            <button
              type="button"
              onClick={() => setBilingual((b) => !b)}
              className="sm:hidden px-2.5 py-1 rounded-lg bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-medium text-[#64748B]"
            >
              {bilingual ? 'বাংলা + EN' : 'শুধু EN'}
            </button>
          </div>

          {examQuestions.map((q, qIdx) => {
            const selectedOption = answers[q.id];
            const isAnswered =
              selectedOption !== undefined && selectedOption !== null;
            const isMarked = markedIds.includes(q.id);
            const hasDistinctPromptBn =
              Boolean(q.promptBn?.trim()) &&
              q.promptBn?.trim() !== q.prompt.trim();

            return (
              <article
                key={q.id}
                id={`exam-q-${q.id}`}
                ref={(el) => {
                  questionRefs.current[q.id] = el;
                }}
                className={`card-surface rounded-2xl p-5 sm:p-7 transition-colors ${
                  isAnswered
                    ? 'border-[#4F46E5]/35'
                    : isMarked
                      ? 'border-[#F59E0B]/45'
                      : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E8ECF3]">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                    <span className="font-mono-num text-sm font-bold text-[#172033]">
                      প্রশ্ন {String(qIdx + 1).padStart(2, '0')} / {examQuestions.length}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-[#334155]">
                      {q.subjectName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{q.chapter}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleMarkForReview(q.id, qIdx)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      isMarked
                        ? 'bg-[#FEF3C7] border-[#F59E0B]/50 text-[#B45309]'
                        : 'bg-[#F7F8FC] border-[#E8ECF3] text-[#64748B] hover:text-[#172033]'
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>{isMarked ? 'চিহ্নিত' : 'পর্যালোচনার জন্য রাখুন'}</span>
                  </button>
                </div>

                <div className="mt-5 space-y-2.5">
                  <div className="text-[16.5px] sm:text-[18px] font-medium text-[#172033] leading-[1.6]">
                    <MathText text={q.prompt} />
                  </div>
                  {bilingual && hasDistinctPromptBn && (
                    <div className="text-[15px] sm:text-[15.5px] text-[#64748B] leading-[1.65]">
                      <MathText text={q.promptBn!} />
                    </div>
                  )}
                  {q.imageUrl && (
                    <img
                      src={q.imageUrl}
                      alt={`প্রশ্ন ${qIdx + 1}-এর চিত্র`}
                      className="max-h-60 rounded-xl border border-[#E8ECF3] object-contain bg-[#F7F8FC] p-2 mt-2"
                    />
                  )}
                </div>

                <div className="mt-5 space-y-2.5">
                  {q.options.map((opt, idx) => {
                    const selected = selectedOption === idx;
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleSelectOption(q.id, qIdx, idx)}
                        className={`w-full min-h-[52px] px-4 py-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.995] ${
                          selected
                            ? 'bg-[#EEF2FF] border-[#4F46E5] text-[#172033] ring-1 ring-[#4F46E5]/30'
                            : 'bg-[#F7F8FC] border-[#E8ECF3] text-[#172033] hover:bg-white hover:border-[#CBD5E1]'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span
                            className={`w-7 h-7 rounded-lg font-mono-num text-xs font-semibold flex items-center justify-center shrink-0 transition-colors ${
                              selected
                                ? 'bg-[#4F46E5] text-white'
                                : 'bg-white text-[#64748B] border border-[#E8ECF3]'
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span
                            className={`text-[15px] sm:text-base leading-[1.45] ${
                              selected ? 'font-semibold' : 'font-normal'
                            }`}
                          >
                            <MathText text={opt} />
                          </span>
                        </div>
                        {selected && (
                          <Check className="w-4 h-4 text-[#4F46E5] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-[#64748B]">
                  <span>প্রতি ভুল উত্তরে নেগেটিভ মার্কিং: -{exam.negativeMarking}</span>
                  {isAnswered && (
                    <button
                      type="button"
                      onClick={() => handleClearChoice(q.id)}
                      className="text-[#4F46E5] hover:underline underline-offset-2 font-medium"
                    >
                      উত্তর মুছে ফেলুন
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {/* Desktop Bottom Submit Bar */}
          <div className="hidden lg:flex items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#E8ECF3] text-xs font-semibold text-[#64748B] hover:text-[#172033] whitespace-nowrap"
            >
              পরীক্ষা থেকে বের হন
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-[#64748B] font-mono-num">
                {answeredCount}/{examQuestions.length} উত্তরিত
              </span>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shadow-xs"
              >
                <Send className="w-4 h-4" />
                <span>পর্যালোচনা ও জমা দিন</span>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Question Palette */}
        <aside className="hidden lg:block lg:col-span-4">
          <div className="card-surface rounded-2xl p-5 sticky top-24">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-sm font-semibold text-[#172033]">
                প্রশ্ন প্যালেট
              </h2>
              <span className="font-mono-num text-xs text-[#4F46E5] font-medium">
                {answeredCount}/{examQuestions.length} উত্তরিত
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {examQuestions.map((q, idx) => {
                const isCurr = idx === activeIndex;
                const isAns =
                  answers[q.id] !== undefined && answers[q.id] !== null;
                const isRev = markedIds.includes(q.id);

                let btnClass =
                  'bg-[#F7F8FC] border-[#E8ECF3] text-[#64748B] hover:text-[#172033]';
                if (isRev) {
                  btnClass =
                    'bg-[#FEF3C7] border-[#F59E0B]/50 text-[#B45309]';
                } else if (isAns) {
                  btnClass =
                    'bg-[#ECFDF5] border-[#059669]/50 text-[#059669]';
                }
                if (isCurr) {
                  btnClass += ' ring-2 ring-[#4F46E5] text-[#172033]';
                }

                return (
                  <button
                    type="button"
                    key={q.id}
                    onClick={() => scrollToQuestion(idx, q.id)}
                    className={`h-10 rounded-xl border font-mono-num text-xs font-semibold transition-all ${btnClass}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-[#E8ECF3] space-y-2 text-xs text-[#64748B]">
              <div className="flex items-center justify-between">
                <span>উত্তর দেওয়া হয়েছে</span>
                <span className="font-mono-num text-[#059669] font-semibold">
                  {answeredCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>পর্যালোচনার জন্য চিহ্নিত</span>
                <span className="font-mono-num text-[#D97706] font-semibold">
                  {markedIds.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>বাকি আছে</span>
                <span className="font-mono-num text-[#172033]">
                  {unansweredCount}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="mt-5 w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span>পরীক্ষা জমা দিন</span>
            </button>
          </div>
        </aside>
      </main>

      {/* Mobile Bottom Action Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8ECF3] px-4 py-2.5 flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setPaletteOpenMobile(true)}
          className="min-h-[44px] px-4 rounded-xl bg-[#EEF2FF] text-xs font-semibold text-[#4F46E5] flex items-center gap-2 whitespace-nowrap"
        >
          <Grid className="w-4 h-4" />
          <span className="font-mono-num">
            প্রশ্ন তালিকা ({answeredCount}/{examQuestions.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <Send className="w-3.5 h-3.5" />
          <span>পর্যালোচনা ও জমা দিন</span>
        </button>
      </div>

      {/* Mobile Palette Sheet */}
      {paletteOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-40 bg-[#172033]/40 backdrop-blur-xs flex items-end">
          <div className="w-full rounded-t-3xl bg-white border-t border-[#E8ECF3] p-5 pb-8 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-[#172033]">
                প্রশ্ন প্যালেট ({answeredCount}/{examQuestions.length})
              </h3>
              <button
                type="button"
                onClick={() => setPaletteOpenMobile(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#64748B]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2.5">
              {examQuestions.map((q, idx) => {
                const isCurr = idx === activeIndex;
                const isAns =
                  answers[q.id] !== undefined && answers[q.id] !== null;
                const isRev = markedIds.includes(q.id);
                let cls = 'bg-[#F7F8FC] border-[#E8ECF3] text-[#64748B]';
                if (isRev)
                  cls = 'bg-[#FEF3C7] border-[#F59E0B]/50 text-[#B45309]';
                else if (isAns)
                  cls = 'bg-[#ECFDF5] border-[#059669]/50 text-[#059669]';
                if (isCurr) cls += ' ring-2 ring-[#4F46E5] text-[#172033]';

                return (
                  <button
                    type="button"
                    key={q.id}
                    onClick={() => {
                      setPaletteOpenMobile(false);
                      scrollToQuestion(idx, q.id);
                    }}
                    className={`h-11 rounded-xl border font-mono-num text-sm font-semibold ${cls}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-medium text-[#64748B]"
            >
              জমা না দিয়ে বের হয়ে যান
            </button>
          </div>
        </div>
      )}

      {/* Submission Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-surface max-w-md w-full rounded-2xl p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-lg font-semibold text-[#172033]">
                  পরীক্ষা জমা দেবেন?
                </h3>
                <p className="text-sm text-[#64748B] mt-1">
                  প্রতি ভুল MCQ-এর জন্য -{exam.negativeMarking} নেগেটিভ মার্কিং অনুযায়ী উত্তর মূল্যায়ন করা হবে।
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                <p className="font-mono-num text-xl font-bold text-[#172033]">
                  {examQuestions.length}
                </p>
                <p className="text-xs font-medium text-[#64748B] mt-0.5">
                  মোট প্রশ্ন
                </p>
              </div>
              <div className="rounded-xl bg-[#ECFDF5] border border-[#059669]/20 p-3">
                <p className="font-mono-num text-xl font-bold text-[#059669]">
                  {answeredCount}
                </p>
                <p className="text-xs font-medium text-[#065F46] mt-0.5">
                  উত্তরিত
                </p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] p-3">
                <p className="font-mono-num text-xl font-bold text-[#475569]">
                  {unansweredCount}
                </p>
                <p className="text-xs font-medium text-[#64748B] mt-0.5">
                  উত্তর দেওয়া হয়নি
                </p>
              </div>
            </div>

            {markedIds.length > 0 && (
              <p className="mt-3 text-xs text-[#B45309] bg-[#FEF3C7]/60 border border-[#F59E0B]/30 rounded-lg px-3 py-2">
                পর্যালোচনার জন্য চিহ্নিত প্রশ্ন: {markedIds.length}টি
              </p>
            )}

            {submitError && (
              <p className="mt-3 text-xs text-red-600">{submitError}</p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm font-semibold text-[#64748B] hover:text-[#172033]"
              >
                পরীক্ষা চালিয়ে যান
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSubmit}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? 'মূল্যায়ন হচ্ছে...' : 'নিশ্চিত করে জমা দিন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
