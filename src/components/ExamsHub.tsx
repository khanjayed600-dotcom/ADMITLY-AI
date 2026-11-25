import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Loader2,
  Play,
  Users,
  XCircle,
} from 'lucide-react';
import type { ExamConfig, StudentQuestionItem, UniversityTrack } from '../types';
import { api } from '../services/api';
import { MathText } from './ui/MathText';

interface ExamsHubProps {
  exams: ExamConfig[];
  questions: StudentQuestionItem[];
  initialSubTab?: 'mocks' | 'previous';
  onStartExam: (exam: ExamConfig) => void;
}

const BASE_FILTERS: Array<'All' | UniversityTrack> = [
  'All',
  'BUET',
  'DU Ka',
  'DU Kha',
  'Medical',
  'CKRUET',
  'GST',
  'Rajshahi University',
  'Jahangirnagar University',
  'Chittagong University',
  'Engineering',
  'Physics 1st Paper',
  'Physics 2nd Paper',
  'Chemistry 1st Paper',
  'Chemistry 2nd Paper',
  'Biology 1st Paper',
  'Biology 2nd Paper',
  'Mathematics 1st Paper',
  'Mathematics 2nd Paper',
  'Other',
];

interface PracticeCheckState {
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanationEn: string;
  explanationBn: string;
}

export function ExamsHub({
  exams,
  questions,
  initialSubTab = 'mocks',
  onStartExam,
}: ExamsHubProps) {
  const [subTab, setSubTab] = useState<'mocks' | 'previous'>(initialSubTab);
  const [filter, setFilter] = useState<'All' | UniversityTrack>('All');
  const [checkedAnswers, setCheckedAnswers] = useState<
    Record<string, PracticeCheckState>
  >({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const activeFilters = BASE_FILTERS.filter(
    (f) =>
      f === 'All' ||
      ['BUET', 'DU Ka', 'DU Kha', 'Medical', 'CKRUET', 'GST'].includes(f) ||
      exams.some((e) => e.universityTrack === f) ||
      questions.some((q) => q.universityTag === f)
  );

  const filteredExams =
    filter === 'All'
      ? exams
      : exams.filter((e) => e.universityTrack === filter);

  const filteredQuestions =
    filter === 'All'
      ? questions
      : questions.filter(
          (q) =>
            q.universityTag === filter || q.admissionCategory === filter
        );

  const handleCheckPractice = async (
    questionId: string,
    selectedIdx: number | null,
    revealOnly = false
  ) => {
    if (checkingId) return;
    if (checkedAnswers[questionId]) {
      if (!revealedIds.includes(questionId)) {
        setRevealedIds((prev) => [...prev, questionId]);
      }
      return;
    }
    setCheckingId(questionId);
    try {
      const res = await api.checkPracticeAnswer(
        questionId,
        selectedIdx,
        revealOnly
      );
      setCheckedAnswers((prev) => ({
        ...prev,
        [questionId]: {
          selectedIndex: res.selectedIndex,
          correctIndex: res.correctIndex,
          isCorrect: res.isCorrect,
          explanationEn: res.explanationEn,
          explanationBn: res.explanationBn,
        },
      }));
      setRevealedIds((prev) =>
        prev.includes(questionId) ? prev : [...prev, questionId]
      );
    } finally {
      setCheckingId(null);
    }
  };

  const toggleReveal = async (id: string) => {
    if (revealedIds.includes(id)) {
      setRevealedIds((prev) => prev.filter((x) => x !== id));
      return;
    }
    if (!checkedAnswers[id]) {
      await handleCheckPractice(id, null, true);
      return;
    }
    setRevealedIds((prev) => [...prev, id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold leading-[1.25] text-[#172033]">
            {subTab === 'mocks'
              ? 'মডেল টেস্ট ও Mock Test'
              : 'বিগত বছরের প্রশ্ন ব্যাংক'}
          </h1>
          <p className="text-[14px] leading-[1.65] text-[#64748B] mt-1">
            {subTab === 'mocks'
              ? 'নেগেটিভ মার্কিং, সময়বদ্ধ টাইমার এবং তাৎক্ষণিক ফলাফল বিশ্লেষণসহ ভর্তি পরীক্ষা অনুশীলন।'
              : 'প্রকাশিত প্রশ্ন ব্যাংক থেকে সরাসরি অপশন বাছাই করে তাৎক্ষণিক সঠিক উত্তর ও বাংলা সমাধান দেখুন।'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-[#E8ECF3] self-start shadow-xs">
          <button
            onClick={() => setSubTab('mocks')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              subTab === 'mocks'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            Mock Test সমূহ
          </button>
          <button
            onClick={() => setSubTab('previous')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              subTab === 'previous'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            বিগত বছরের প্রশ্ন
          </button>
        </div>
      </div>

      {/* University Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {activeFilters.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                filter === item
                  ? 'bg-[#4F46E5] text-white'
                  : 'bg-white text-[#64748B] hover:text-[#172033] border border-[#E8ECF3]'
              }`}
            >
              {item === 'All' ? 'সকল বিশ্ববিদ্যালয়' : item}
            </button>
          ))}
        </div>

        <span className="text-xs text-[#64748B] flex items-center gap-1.5 tabular-nums">
          <Filter className="w-3.5 h-3.5" />
          {subTab === 'mocks'
            ? `${filteredExams.length}টি পরীক্ষা`
            : `${filteredQuestions.length}টি প্রশ্ন`}
        </span>
      </div>

      {subTab === 'mocks' ? (
        filteredExams.length === 0 ? (
          <div className="card-surface rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold text-[#172033]">
              {filter === 'All'
                ? 'No exams available yet · এখনো কোনো প্রকাশিত Mock Test নেই'
                : `${filter}-এর জন্য কোনো Mock Test পাওয়া যায়নি`}
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              অ্যাডমিন নতুন পরীক্ষা প্রকাশ করলে এখানে সরাসরি অংশগ্রহণ করতে পারবেন।
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredExams.map((exam) => (
              <div
                key={exam.id}
                className="card-surface rounded-2xl p-5 sm:p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#4F46E5] font-semibold">
                      {exam.universityTrack}
                    </span>
                    <span className="font-mono-num font-medium text-[#64748B]">
                      {exam.questionIds.length}টি MCQ · -{exam.negativeMarking}{' '}
                      নেগেটিভ
                    </span>
                  </div>

                  <h2 className="font-display text-[17px] sm:text-lg font-semibold text-[#172033] mt-2">
                    {exam.title}
                  </h2>
                  <p className="text-[14px] text-[#64748B] mt-1 leading-[1.6]">
                    {exam.subtitle}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-[#64748B]">
                    <span className="flex items-center gap-1.5 tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-[#4F46E5]" />
                      {exam.durationMinutes} মিনিট
                    </span>
                    <span className="flex items-center gap-1.5 tabular-nums">
                      <Users className="w-3.5 h-3.5 text-[#06B6D4]" />
                      {exam.participantsCount.toLocaleString()} পরীক্ষার্থী
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {exam.scheduledAt}
                    </span>
                  </div>

                  <p className="text-xs text-[#64748B] mt-3">
                    বিষয়সমূহ: {exam.sections.join(' · ')}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-[#E8ECF3] flex items-center justify-between gap-3">
                  <span
                    className={`text-xs font-semibold ${
                      exam.status === 'available'
                        ? 'text-[#059669]'
                        : 'text-[#D97706]'
                    }`}
                  >
                    {exam.status === 'available'
                      ? 'পরীক্ষা দেওয়ার জন্য প্রস্তুত'
                      : 'আসন্ন সময়সূচি'}
                  </span>

                  {exam.status === 'available' ? (
                    <button
                      onClick={() => onStartExam(exam)}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[13px] sm:text-sm font-semibold flex items-center gap-2 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>মডেল টেস্ট শুরু করুন</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onStartExam(exam)}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F7F8FC] hover:bg-[#EEF2FF] border border-[#E8ECF3] text-[#172033] text-xs font-semibold transition-colors"
                    >
                      অনুশীলন দেখুন
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredQuestions.length === 0 ? (
        <div className="card-surface rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold text-[#172033]">
            No questions available yet · এখনো কোনো প্রশ্ন যুক্ত করা হয়নি
          </p>
          <p className="text-xs text-[#64748B] mt-1">
            {filter === 'All'
              ? 'অ্যাডমিন প্রশ্ন ব্যাংকে প্রশ্ন প্রকাশ করলে এখানে অনুশীলনের জন্য দেখা যাবে।'
              : `${filter} ক্যাটাগরিতে এখনো কোনো প্রকাশিত প্রশ্ন নেই।`}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredQuestions.map((q, idx) => {
            const check = checkedAnswers[q.id];
            const revealed = revealedIds.includes(q.id) && Boolean(check);
            const isLoadingThis = checkingId === q.id;
            return (
              <div
                key={q.id}
                className="card-surface rounded-2xl p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                  <span>
                    <strong className="text-[#4F46E5] font-semibold">
                      {q.universityTag}
                    </strong>{' '}
                    · {q.subjectName} · {q.chapter}
                    {q.sourceName ? ` · ${q.sourceName}` : ''}
                    {q.sourceYear ? ` (${q.sourceYear})` : ''}
                  </span>
                  <span className="font-mono-num font-semibold">
                    প্রশ্ন {idx + 1}
                  </span>
                </div>

                <div className="text-[15px] sm:text-base font-medium text-[#172033] leading-[1.6]">
                  <MathText text={q.prompt} />
                </div>
                {q.promptBn && q.promptBn.trim() !== q.prompt.trim() && (
                  <div className="text-[14.5px] sm:text-[15px] text-[#64748B] leading-[1.65]">
                    <MathText text={q.promptBn} />
                  </div>
                )}
                {q.imageUrl && (
                  <img
                    src={q.imageUrl}
                    alt="প্রশ্নের চিত্র"
                    className="max-h-52 rounded-xl border border-[#E8ECF3] object-contain bg-[#F7F8FC] p-2"
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options.map((opt, optIdx) => {
                    const isRight = revealed && optIdx === check?.correctIndex;
                    const isWrongPick =
                      revealed &&
                      check?.selectedIndex === optIdx &&
                      optIdx !== check?.correctIndex;
                    return (
                      <button
                        type="button"
                        key={optIdx}
                        disabled={Boolean(check) || isLoadingThis}
                        onClick={() => handleCheckPractice(q.id, optIdx)}
                        className={`px-3.5 py-2.5 rounded-xl border text-left text-[13.5px] sm:text-sm flex items-center justify-between gap-2 transition-colors ${
                          isRight
                            ? 'bg-[#ECFDF5] border-[#059669]/50 text-[#065F46] font-semibold'
                            : isWrongPick
                              ? 'bg-[#FEF2F2] border-red-300 text-red-900'
                              : 'bg-[#F7F8FC] border-[#E8ECF3] text-[#172033] hover:border-[#4F46E5]/50'
                        }`}
                      >
                        <span className="flex items-start gap-2 min-w-0">
                          <span className="font-mono-num font-semibold shrink-0">
                            {String.fromCharCode(65 + optIdx)}.
                          </span>
                          <span className="break-words">
                            <MathText text={opt} />
                          </span>
                        </span>
                        {isRight && (
                          <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                        )}
                        {isWrongPick && (
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => toggleReveal(q.id)}
                    disabled={isLoadingThis}
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#4F46E5] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60"
                  >
                    {isLoadingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {revealed
                        ? 'সমাধান লুকান'
                        : 'সঠিক উত্তর ও বাংলা ব্যাখ্যা দেখুন'}
                    </span>
                  </button>
                </div>

                {revealed && check && (
                  <div className="pt-3 border-t border-[#E8ECF3] space-y-2">
                    <p className="text-xs font-semibold text-[#059669]">
                      সঠিক উত্তর: {String.fromCharCode(65 + check.correctIndex)}
                    </p>
                    {check.explanationEn && (
                      <div className="text-[13.5px] text-[#172033] leading-[1.6]">
                        <MathText text={check.explanationEn} />
                      </div>
                    )}
                    {check.explanationBn && (
                      <div className="text-[14px] text-[#0891B2] leading-[1.65]">
                        সহজ বাংলায়: <MathText text={check.explanationBn} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
