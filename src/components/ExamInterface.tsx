import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [markedIds, setMarkedIds] = useState<string[]>([]);
  const [bilingual, setBilingual] = useState(true);
  const [paletteOpenMobile, setPaletteOpenMobile] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const autoSubmittedRef = useRef(false);

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

  const currentQ = examQuestions[currentIndex];

  const answeredCount = examQuestions.filter(
    (q) => answers[q.id] !== undefined && answers[q.id] !== null
  ).length;
  const unansweredCount = examQuestions.length - answeredCount;
  const isMarked = currentQ ? markedIds.includes(currentQ.id) : false;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSelectOption = (optionIndex: number) => {
    if (!currentQ) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: optionIndex,
    }));
  };

  const handleClearChoice = () => {
    if (!currentQ) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: null,
    }));
  };

  const toggleMarkForReview = () => {
    if (!currentQ) return;
    setMarkedIds((prev) =>
      prev.includes(currentQ.id)
        ? prev.filter((id) => id !== currentQ.id)
        : [...prev, currentQ.id]
    );
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

  if (!currentQ) {
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
              <span className="truncate font-medium">{currentQ.subjectName}</span>
            </div>
            <h1 className="font-display text-[15px] sm:text-base font-bold text-[#172033] truncate">
              {exam.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
              onClick={() => setConfirmOpen(true)}
              className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>জমা দিন</span>
            </button>
          </div>
        </div>
      </header>

      {/* Two-Zone Exam Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-28 lg:pb-10">
        <div className="lg:col-span-8 flex flex-col justify-between gap-6">
          <div className="card-surface rounded-2xl p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E8ECF3]">
              <div className="flex items-center gap-2 text-xs text-[#64748B]">
                <span className="font-mono-num text-sm font-semibold text-[#172033]">
                  প্রশ্ন {currentIndex + 1} / {examQuestions.length}
                </span>
                <span aria-hidden="true">·</span>
                <span>{currentQ.subjectName}</span>
                <span aria-hidden="true">·</span>
                <span>{currentQ.chapter}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBilingual((b) => !b)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#64748B] hover:text-[#172033] transition-colors"
                >
                  {bilingual ? 'বাংলা + EN' : 'শুধু EN'}
                </button>
                <button
                  onClick={toggleMarkForReview}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    isMarked
                      ? 'bg-[#FEF3C7] border-[#F59E0B]/50 text-[#B45309]'
                      : 'bg-[#F7F8FC] border-[#E8ECF3] text-[#64748B] hover:text-[#172033]'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{isMarked ? 'চিহ্নিত' : 'পর্যালোচনার জন্য রাখুন'}</span>
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              <div className="text-[17px] sm:text-[19px] font-medium text-[#172033] leading-[1.55]">
                <MathText text={currentQ.prompt} />
              </div>
              {bilingual && currentQ.promptBn && (
                <div className="text-[15px] sm:text-[16px] text-[#64748B] leading-[1.65]">
                  <MathText text={currentQ.promptBn} />
                </div>
              )}
              {currentQ.imageUrl && (
                <img
                  src={currentQ.imageUrl}
                  alt="প্রশ্নের চিত্র"
                  className="max-h-60 rounded-xl border border-[#E8ECF3] object-contain bg-[#F7F8FC] p-2 mt-2"
                />
              )}
            </div>

            <div className="mt-6 space-y-3">
              {currentQ.options.map((opt, idx) => {
                const selected = answers[currentQ.id] === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx)}
                    className={`w-full min-h-[54px] px-4 py-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.995] ${
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

            <div className="mt-5 flex items-center justify-between text-xs text-[#64748B]">
              <span>প্রতি ভুল উত্তরে নেগেটিভ মার্কিং: -{exam.negativeMarking}</span>
              {answers[currentQ.id] !== undefined &&
                answers[currentQ.id] !== null && (
                  <button
                    onClick={handleClearChoice}
                    className="text-[#4F46E5] hover:underline underline-offset-2 font-medium"
                  >
                    উত্তর মুছে ফেলুন
                  </button>
                )}
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-between gap-4">
            <button
              onClick={onCancel}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#E8ECF3] text-xs font-semibold text-[#64748B] hover:text-[#172033]"
            >
              পরীক্ষা থেকে বের হন
            </button>
            <div className="flex items-center gap-3">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#E8ECF3] text-sm font-semibold text-[#172033] disabled:opacity-40 flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>পূর্ববর্তী</span>
              </button>
              {currentIndex < examQuestions.length - 1 ? (
                <button
                  onClick={() =>
                    setCurrentIndex((i) =>
                      Math.min(examQuestions.length - 1, i + 1)
                    )
                  }
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-sm font-semibold flex items-center gap-1.5"
                >
                  <span>পরবর্তী</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>পর্যালোচনা ও জমা দিন</span>
                </button>
              )}
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
                const isCurr = idx === currentIndex;
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
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
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
          </div>
        </aside>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8ECF3] px-4 py-2.5 flex items-center justify-between gap-2">
        <button
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          className="min-h-[44px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-medium text-[#172033] disabled:opacity-40 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>আগের</span>
        </button>

        <button
          onClick={() => setPaletteOpenMobile(true)}
          className="min-h-[44px] px-3.5 rounded-xl bg-[#EEF2FF] text-xs font-medium text-[#4F46E5] flex items-center gap-1.5"
        >
          <Grid className="w-4 h-4" />
          <span className="font-mono-num">
            {answeredCount}/{examQuestions.length}
          </span>
        </button>

        {currentIndex < examQuestions.length - 1 ? (
          <button
            onClick={() =>
              setCurrentIndex((i) =>
                Math.min(examQuestions.length - 1, i + 1)
              )
            }
            className="min-h-[44px] px-4 rounded-xl bg-[#4F46E5] text-white text-xs font-medium flex items-center gap-1"
          >
            <span>পরবর্তী</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            className="min-h-[44px] px-4 rounded-xl bg-[#059669] text-white text-xs font-medium flex items-center gap-1"
          >
            <Send className="w-3.5 h-3.5" />
            <span>জমা দিন</span>
          </button>
        )}
      </div>

      {/* Mobile Palette Sheet */}
      {paletteOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-40 bg-[#172033]/40 backdrop-blur-xs flex items-end">
          <div className="w-full rounded-t-3xl bg-white border-t border-[#E8ECF3] p-5 pb-8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-[#172033]">
                প্রশ্ন প্যালেট
              </h3>
              <button
                onClick={() => setPaletteOpenMobile(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#64748B]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2.5">
              {examQuestions.map((q, idx) => {
                const isCurr = idx === currentIndex;
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
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setPaletteOpenMobile(false);
                    }}
                    className={`h-11 rounded-xl border font-mono-num text-sm font-semibold ${cls}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <button
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
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm font-semibold text-[#64748B] hover:text-[#172033]"
              >
                পরীক্ষা চালিয়ে যান
              </button>
              <button
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
