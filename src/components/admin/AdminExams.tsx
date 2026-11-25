import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import type { ExamConfig, QuestionItem, UniversityTrack } from '../../types';
import { MathText } from '../ui/MathText';

interface AdminExamsProps {
  onExamsChanged: () => void;
  onToast: (
    tone: 'success' | 'warning' | 'info',
    title: string,
    detail?: string
  ) => void;
}

export function AdminExams({ onExamsChanged, onToast }: AdminExamsProps) {
  const [exams, setExams] = useState<ExamConfig[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [track, setTrack] = useState<UniversityTrack>('DU Ka');
  const [examType, setExamType] = useState<'mock' | 'university'>('mock');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [totalMarks, setTotalMarks] = useState(10);
  const [negativeMarking, setNegativeMarking] = useState(0.25);
  const [scheduledAt, setScheduledAt] = useState('Live Now');
  const [status, setStatus] = useState<'available' | 'upcoming' | 'completed'>(
    'available'
  );
  const [isPublished, setIsPublished] = useState(true);
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [qPickerSearch, setQPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<ExamConfig | null>(null);
  const [attemptsModalExam, setAttemptsModalExam] =
    useState<ExamConfig | null>(null);
  const [examAttempts, setExamAttempts] = useState<
    Array<{
      id: string;
      userName: string;
      userEmail: string;
      rawScore: number;
      maxScore: number;
      accuracy: number;
      durationSecondsSpent: number;
      submittedAt: string;
    }>
  >([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [exRes, qRes] = await Promise.all([
        api.listAdminExams(),
        api.listAdminQuestions({ limit: 100 }),
      ]);
      setExams(exRes.exams);
      setQuestions(qRes.items);
      if (selectedQIds.length === 0 && qRes.items.length > 0 && !editingId) {
        setSelectedQIds(qRes.items.slice(0, 4).map((q) => q.id));
        setTotalMarks(Math.min(4, qRes.items.length));
      }
    } catch (err) {
      onToast(
        'warning',
        'পরীক্ষা তালিকা লোড করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [onToast, editingId, selectedQIds.length]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setTrack('DU Ka');
    setExamType('mock');
    setDurationMinutes(15);
    setNegativeMarking(0.25);
    setScheduledAt('Live Now');
    setStatus('available');
    setIsPublished(true);
    const defaultIds = questions.slice(0, 4).map((q) => q.id);
    setSelectedQIds(defaultIds);
    setTotalMarks(defaultIds.length);
  };

  const handleEditExam = (ex: ExamConfig) => {
    setEditingId(ex.id);
    setTitle(ex.title);
    setSubtitle(ex.subtitle);
    setTrack(ex.universityTrack);
    setExamType(ex.examType ?? 'mock');
    setDurationMinutes(ex.durationMinutes);
    setTotalMarks(ex.totalMarks ?? ex.questionIds.length);
    setNegativeMarking(ex.negativeMarking);
    setScheduledAt(ex.scheduledAt);
    setStatus(ex.status);
    setIsPublished(ex.isPublished !== false);
    setSelectedQIds(ex.questionIds);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selectedQIds.length === 0) {
      onToast(
        'warning',
        'তথ্য অসম্পূর্ণ',
        'পরীক্ষার শিরোনাম লিখুন এবং কমপক্ষে ১টি প্রশ্ন নির্বাচন করুন।'
      );
      return;
    }

    setSaving(true);
    const chosenQuestions = questions.filter((q) =>
      selectedQIds.includes(q.id)
    );
    const uniqueSections = Array.from(
      new Set(chosenQuestions.map((q) => q.subjectName))
    );

    const payload = {
      title: title.trim(),
      subtitle:
        subtitle.trim() ||
        `${uniqueSections.join(', ')} — নেগেটিভ মার্কিং -${negativeMarking}`,
      universityTrack: track,
      examType,
      durationMinutes,
      totalMarks: totalMarks || selectedQIds.length,
      negativeMarking,
      scheduledAt: scheduledAt.trim() || 'Live Now',
      status,
      isPublished,
      questionIds: selectedQIds,
      sections:
        uniqueSections.length > 0 ? uniqueSections : ['Physics', 'Mathematics'],
    };

    try {
      if (editingId) {
        await api.updateExam(editingId, payload);
        onToast('success', 'পরীক্ষা হালনাগাদ হয়েছে');
      } else {
        await api.createExam(payload);
        onToast(
          'success',
          isPublished ? 'পরীক্ষা প্রকাশিত হয়েছে' : 'পরীক্ষা ড্রাফট হিসেবে সংরক্ষিত',
          title.trim()
        );
      }
      resetForm();
      await loadData();
      onExamsChanged();
    } catch (err) {
      onToast(
        'warning',
        'পরীক্ষা সংরক্ষণ ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (ex: ExamConfig) => {
    const nextPublished = !(ex.isPublished !== false);
    try {
      const res = await api.updateExam(ex.id, { isPublished: nextPublished });
      setExams((prev) => prev.map((e) => (e.id === ex.id ? res.exam : e)));
      onToast(
        'info',
        nextPublished
          ? 'শিক্ষার্থীদের জন্য পরীক্ষা প্রকাশিত হয়েছে'
          : 'পরীক্ষাটি অপ্রকাশিত করা হয়েছে',
        ex.title
      );
      onExamsChanged();
    } catch (err) {
      onToast(
        'warning',
        'প্রকাশ অবস্থা পরিবর্তন করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleViewAttempts = async (ex: ExamConfig) => {
    setAttemptsModalExam(ex);
    try {
      const res = await api.getExamAttempts(ex.id);
      setExamAttempts(res.attempts);
    } catch {
      setExamAttempts([]);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteExam(confirmDelete.id);
      setExams((prev) => prev.filter((e) => e.id !== confirmDelete.id));
      if (editingId === confirmDelete.id) resetForm();
      setConfirmDelete(null);
      onToast('info', 'পরীক্ষা মুছে ফেলা হয়েছে');
      onExamsChanged();
    } catch (err) {
      onToast(
        'warning',
        'পরীক্ষা মুছে ফেলা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const filteredPickerQuestions = qPickerSearch.trim()
    ? questions.filter(
        (q) =>
          q.prompt.toLowerCase().includes(qPickerSearch.toLowerCase()) ||
          q.subjectName.toLowerCase().includes(qPickerSearch.toLowerCase()) ||
          q.chapter.toLowerCase().includes(qPickerSearch.toLowerCase())
      )
    : questions;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#172033]">
          পরীক্ষা ও Mock Test পরিচালনা
        </h1>
        <p className="text-sm text-[#64748B] mt-1">
          বিশ্ববিদ্যালয়ভিত্তিক Mock Test তৈরি করুন, লাইভ প্রকাশ নিয়ন্ত্রণ করুন এবং শিক্ষার্থীদের ফলাফল দেখুন।
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Create / Edit Exam Form */}
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-6 bg-white border border-[#E8ECF3] rounded-2xl p-5 space-y-4 h-fit"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#172033]">
              {editingId ? 'পরীক্ষার তথ্য সম্পাদনা' : 'নতুন পরীক্ষা / Mock Test তৈরি'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-[#4F46E5] hover:underline"
              >
                সম্পাদনা বাতিল
              </button>
            )}
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="পরীক্ষার নাম (যেমন: BUET Engineering Model Test 09)"
            className="w-full min-h-[40px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
          />

          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="বিবরণ বা নির্দেশনা (ঐচ্ছিক)"
            className="w-full min-h-[40px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                বিশ্ববিদ্যালয়
              </label>
              <select
                value={track}
                onChange={(e) => setTrack(e.target.value as UniversityTrack)}
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
              >
                <option value="BUET">BUET</option>
                <option value="DU Ka">DU Ka (ঢাবি ক)</option>
                <option value="DU Kha">DU Kha (ঢাবি খ)</option>
                <option value="Medical">Medical</option>
                <option value="CKRUET">CKRUET</option>
                <option value="GST">GST</option>
                <option value="Rajshahi University">Rajshahi University</option>
                <option value="Jahangirnagar University">Jahangirnagar University</option>
                <option value="Chittagong University">Chittagong University</option>
                <option value="Engineering">Engineering</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                পরীক্ষার ধরন
              </label>
              <select
                value={examType}
                onChange={(e) =>
                  setExamType(e.target.value as 'mock' | 'university')
                }
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
              >
                <option value="mock">Mock Test</option>
                <option value="university">বিশ্ববিদ্যালয় পরীক্ষা</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                সময় (মিনিট)
              </label>
              <input
                type="number"
                min={1}
                max={240}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                নেগেটিভ মার্কিং
              </label>
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={negativeMarking}
                onChange={(e) => setNegativeMarking(Number(e.target.value))}
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                প্রাপ্যতা
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(
                    e.target.value as 'available' | 'upcoming' | 'completed'
                  )
                }
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
              >
                <option value="available">এখনই চালু</option>
                <option value="upcoming">আসন্ন / শিডিউলড</option>
                <option value="completed">আর্কাইভ / সম্পন্ন</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                সময়সূচি লেবেল
              </label>
              <input
                type="text"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                placeholder="Live Now বা শুক্রবার রাত ৮টা"
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
              />
            </div>
            <label className="flex items-center gap-2 min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] cursor-pointer text-xs font-semibold text-[#172033]">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="accent-[#4F46E5]"
              />
              <span>লাইভ প্রকাশ করুন</span>
            </label>
          </div>

          {/* Question Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#172033]">
                প্রশ্ন নির্বাচন ({selectedQIds.length}টি নির্বাচিত · {totalMarks} নম্বর)
              </span>
              <div className="relative w-44">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={qPickerSearch}
                  onChange={(e) => setQPickerSearch(e.target.value)}
                  placeholder="প্রশ্ন ফিল্টার করুন..."
                  className="w-full min-h-[32px] pl-7 pr-2 rounded-lg bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {filteredPickerQuestions.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-center text-xs text-[#64748B]">
                  No questions available yet · প্রশ্ন ব্যাংক বা AI Question Builder থেকে প্রশ্ন যোগ করুন।
                </div>
              ) : (
                filteredPickerQuestions.map((q) => {
                  const checked = selectedQIds.includes(q.id);
                  const st = q.status ?? 'Published';
                  return (
                    <label
                      key={q.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs ${
                        checked
                          ? 'bg-[#EEF2FF] border-[#4F46E5]/40'
                          : 'bg-[#F7F8FC] border-[#E8ECF3]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? selectedQIds.filter((id) => id !== q.id)
                            : [...selectedQIds, q.id];
                          setSelectedQIds(next);
                          setTotalMarks(next.length);
                        }}
                        className="mt-0.5 accent-[#4F46E5]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-[#4F46E5]">
                            {q.subjectName} · {q.chapter}
                          </strong>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              st === 'Published'
                                ? 'bg-[#ECFDF5] text-[#059669]'
                                : 'bg-[#FEF3C7] text-[#B45309]'
                            }`}
                          >
                            {st}
                          </span>
                        </div>
                        <div className="text-[#172033] line-clamp-2 mt-0.5">
                          <MathText text={q.prompt} />
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[42px] rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>
              {saving
                ? 'সংরক্ষণ হচ্ছে...'
                : editingId
                  ? 'পরিবর্তন সংরক্ষণ করুন'
                  : 'পরীক্ষা তৈরি করুন'}
            </span>
          </button>
        </form>

        {/* Exam Directory */}
        <div className="xl:col-span-6 bg-white border border-[#E8ECF3] rounded-2xl p-5">
          <h2 className="font-display text-base font-semibold text-[#172033] mb-4">
            তৈরিকৃত পরীক্ষা ও Mock Test ({exams.length})
          </h2>

          {loading ? (
            <div className="py-8 text-center text-xs text-[#64748B]">
              পরীক্ষা লোড হচ্ছে...
            </div>
          ) : exams.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#64748B]">
              No exams created yet · এখনো কোনো পরীক্ষা তৈরি করা হয়নি।
            </div>
          ) : (
            <div className="divide-y divide-[#E8ECF3]">
              {exams.map((ex) => {
                const published = ex.isPublished !== false;
                return (
                  <div
                    key={ex.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#4F46E5]">
                          {ex.universityTrack}
                        </span>
                        <span className="text-[#64748B] font-mono-num">
                          · {ex.durationMinutes} মিনিট · {ex.questionIds.length} MCQ
                        </span>
                        <span
                          className={`font-semibold ${
                            published ? 'text-[#059669]' : 'text-[#D97706]'
                          }`}
                        >
                          · {published ? 'প্রকাশিত' : 'অপ্রকাশিত'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[#172033] truncate">
                        {ex.title}
                      </p>
                      <p className="text-xs text-[#64748B]">
                        {ex.scheduledAt} · {ex.participantsCount.toLocaleString()} জন অংশগ্রহণকারী
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleTogglePublish(ex)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-[#4F46E5] hover:bg-[#EEF2FF]"
                        title={
                          published ? 'অপ্রকাশিত করুন' : 'শিক্ষার্থীদের জন্য প্রকাশ করুন'
                        }
                      >
                        {published ? (
                          <Eye className="w-4 h-4 text-[#059669]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[#D97706]" />
                        )}
                      </button>
                      <button
                        onClick={() => handleViewAttempts(ex)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-[#0891B2] hover:bg-[#ECFEFF]"
                        title="শিক্ষার্থীদের ফলাফল দেখুন"
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditExam(ex)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-[#4F46E5] hover:bg-[#EEF2FF]"
                        title="পরীক্ষা সম্পাদনা"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(ex)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-red-600 hover:bg-[#FEF2F2]"
                        title="পরীক্ষা মুছুন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Participation & Results Modal */}
      {attemptsModalExam && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8ECF3] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E8ECF3]">
              <div>
                <h3 className="font-display text-base font-semibold text-[#172033]">
                  অংশগ্রহণ ও ফলাফল
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {attemptsModalExam.title}
                </p>
              </div>
              <button
                onClick={() => setAttemptsModalExam(null)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#172033]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {examAttempts.length === 0 ? (
              <p className="text-xs text-[#64748B] py-6 text-center">
                এই পরীক্ষায় এখনো কোনো শিক্ষার্থী অংশগ্রহণ করেননি।
              </p>
            ) : (
              <div className="divide-y divide-[#E8ECF3] max-h-80 overflow-y-auto">
                {examAttempts.map((a) => (
                  <div
                    key={a.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[#172033]">
                        {a.userName}
                      </p>
                      <p className="text-[#64748B]">
                        {a.userEmail} · {Math.round(a.durationSecondsSpent / 60)}{' '}
                        মিনিট
                      </p>
                    </div>
                    <div className="text-right font-mono-num">
                      <p className="font-bold text-[#059669]">
                        {a.rawScore}/{a.maxScore} ({a.accuracy}%)
                      </p>
                      <p className="text-[#64748B]">
                        {new Date(a.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8ECF3] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-lg font-semibold text-[#172033]">
                  পরীক্ষাটি মুছে ফেলবেন?
                </h3>
                <p className="text-xs text-[#64748B] mt-1">
                  এর ফলে <strong>{confirmDelete.title}</strong> এবং এর প্রশ্ন সংযোগ স্থায়ীভাবে মুছে যাবে।
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="min-h-[40px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#64748B]"
              >
                বাতিল করুন
              </button>
              <button
                onClick={handleConfirmDelete}
                className="min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                হ্যাঁ, মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
