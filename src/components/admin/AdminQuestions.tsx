import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  History,
  ImagePlus,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import {
  ADMISSION_CATEGORIES,
  type QuestionHistoryEntry,
  type QuestionItem,
  type QuestionStatus,
  type SubjectId,
  type SubjectSummary,
  type TopicInfo,
  type UniversityTrack,
} from '../../types';
import { MathText } from '../ui/MathText';
import { AdminQuestionImporter } from './AdminQuestionImporter';

interface AdminQuestionsProps {
  subjects: SubjectSummary[];
  onSubjectsUpdated: (subjects: SubjectSummary[]) => void;
  onQuestionsChanged: () => void;
  onToast: (
    tone: 'success' | 'warning' | 'info',
    title: string,
    detail?: string
  ) => void;
}

const SUBJECT_OPTIONS: Array<{ id: SubjectId; label: string }> = [
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'math', label: 'Mathematics' },
  { id: 'biology', label: 'Biology' },
  { id: 'english', label: 'English' },
  { id: 'ict', label: 'ICT' },
  { id: 'gk', label: 'General Knowledge' },
];

const STATUS_STYLE: Record<string, string> = {
  Published: 'bg-[#ECFDF5] text-[#059669]',
  Approved: 'bg-[#EEF2FF] text-[#4F46E5]',
  Draft: 'bg-[#F1F5F9] text-[#475569]',
  'Needs Review': 'bg-[#FEF3C7] text-[#B45309]',
  Rejected: 'bg-[#FEF2F2] text-red-600',
};

export function AdminQuestions({
  subjects,
  onSubjectsUpdated,
  onQuestionsChanged,
  onToast,
}: AdminQuestionsProps) {
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterChapter, setFilterChapter] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');

  const [entryMode, setEntryMode] = useState<'single' | 'bulk'>('single');
  const [bulkCarryoverText, setBulkCarryoverText] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<SubjectId>('physics');
  const [chapter, setChapter] = useState('Vector & Kinematics');
  const [topic, setTopic] = useState('Relative Velocity');
  const [universityTag, setUniversityTag] =
    useState<UniversityTrack>('DU Ka');
  const [admissionCategory, setAdmissionCategory] =
    useState<string>('DU Ka');
  const [difficulty, setDifficulty] = useState<
    'Foundation' | 'Standard' | 'Admission Hard'
  >('Standard');
  const [status, setStatus] = useState<QuestionStatus>('Published');
  const [marks, setMarks] = useState(1);
  const [negativeMarking, setNegativeMarking] = useState(0.25);
  const [prompt, setPrompt] = useState('');
  const [promptBn, setPromptBn] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanationEn, setExplanationEn] = useState('');
  const [explanationBn, setExplanationBn] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceYear, setSourceYear] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [newChapName, setNewChapName] = useState('');
  const [newChapNameBn, setNewChapNameBn] = useState('');
  const [newTopicChapterId, setNewTopicChapterId] = useState('');
  const [newTopicName, setNewTopicName] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<QuestionItem | null>(null);
  const [historyQuestion, setHistoryQuestion] = useState<QuestionItem | null>(
    null
  );
  const [historyEntries, setHistoryEntries] = useState<QuestionHistoryEntry[]>(
    []
  );
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listAdminQuestions({
        search: search.trim(),
        subjectId: filterSubject,
        chapter: filterChapter,
        admissionCategory: filterCategory,
        status: filterStatus,
        difficulty: filterDifficulty,
        page,
        limit: 12,
      });
      setQuestions(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      onToast(
        'warning',
        'প্রশ্ন লোড করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [
    search,
    filterSubject,
    filterChapter,
    filterCategory,
    filterStatus,
    filterDifficulty,
    page,
    onToast,
  ]);

  const fetchTaxonomy = useCallback(async () => {
    try {
      const res = await api.getAdminSubjects();
      onSubjectsUpdated(res.subjects);
      setTopics(res.topics);
    } catch {
      // ignore initial taxonomy refresh failure
    }
  }, [onSubjectsUpdated]);

  useEffect(() => {
    fetchTaxonomy();
  }, [fetchTaxonomy]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchQuestions();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [fetchQuestions]);

  const activeSubjectObj = subjects.find((s) => s.id === subjectId);
  const subjectChapters = activeSubjectObj?.chapters ?? [];

  const resetForm = () => {
    setEditingId(null);
    setPrompt('');
    setPromptBn('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setCorrectIndex(0);
    setMarks(1);
    setNegativeMarking(0.25);
    setStatus('Published');
    setExplanationEn('');
    setExplanationBn('');
    setSourceName('');
    setSourceYear('');
    setImageUrl(undefined);
  };

  const handleLoadForEdit = (q: QuestionItem) => {
    setEditingId(q.id);
    setSubjectId(q.subjectId);
    setChapter(q.chapter);
    setTopic(q.topic || q.chapter);
    setUniversityTag(q.universityTag);
    setAdmissionCategory(q.admissionCategory || 'DU Ka');
    setDifficulty(q.difficulty);
    setStatus(q.status ?? 'Published');
    setMarks(q.marks ?? 1);
    setNegativeMarking(q.negativeMarking ?? 0.25);
    setPrompt(q.prompt);
    setPromptBn(q.promptBn || '');
    setOptA(q.options[0]);
    setOptB(q.options[1]);
    setOptC(q.options[2]);
    setOptD(q.options[3]);
    setCorrectIndex(q.correctIndex >= 0 ? q.correctIndex : 0);
    setExplanationEn(q.explanationEn);
    setExplanationBn(q.explanationBn);
    setSourceName(q.sourceName || '');
    setSourceYear(q.sourceYear || '');
    setImageUrl(q.imageUrl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTogglePublishStatus = async (q: QuestionItem) => {
    const nextStatus: QuestionStatus =
      q.status === 'Published' ? 'Draft' : 'Published';
    try {
      await api.setQuestionStatus(q.id, nextStatus);
      onToast(
        'info',
        nextStatus === 'Published'
          ? 'প্রশ্নটি শিক্ষার্থীদের জন্য প্রকাশিত হয়েছে'
          : 'প্রশ্নটি ড্রাফট অবস্থায় নেওয়া হয়েছে'
      );
      fetchQuestions();
      onQuestionsChanged();
    } catch (err) {
      onToast(
        'warning',
        'অবস্থা পরিবর্তন করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleOpenHistory = async (q: QuestionItem) => {
    setHistoryQuestion(q);
    setLoadingHistory(true);
    try {
      const res = await api.getQuestionHistory(q.id);
      setHistoryEntries(res.history);
    } catch {
      setHistoryEntries([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const res = await api.uploadQuestionImage(file);
      setImageUrl(res.imageUrl);
      onToast('success', 'প্রশ্নের চিত্র আপলোড সম্পন্ন');
    } catch (err) {
      onToast(
        'warning',
        'ছবি আপলোড ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !prompt.trim() ||
      !optA.trim() ||
      !optB.trim() ||
      !optC.trim() ||
      !optD.trim()
    ) {
      onToast(
        'warning',
        'তথ্য অসম্পূর্ণ',
        'প্রশ্নের বিবরণ এবং ৪টি MCQ অপশন পূরণ করুন।'
      );
      return;
    }

    setSaving(true);
    const subjLabel =
      SUBJECT_OPTIONS.find((s) => s.id === subjectId)?.label ?? 'Physics';
    const payload = {
      subjectId,
      subjectName: subjLabel,
      chapter: chapter.trim() || 'General',
      topic: topic.trim() || chapter.trim() || 'General',
      universityTag,
      admissionCategory: admissionCategory.trim() || 'DU Ka',
      difficulty,
      status,
      marks,
      negativeMarking,
      prompt: prompt.trim(),
      promptBn: promptBn.trim() || undefined,
      options: [optA.trim(), optB.trim(), optC.trim(), optD.trim()] as [
        string,
        string,
        string,
        string,
      ],
      correctIndex,
      explanationEn: explanationEn.trim(),
      explanationBn: explanationBn.trim(),
      imageUrl,
      sourceName: sourceName.trim() || undefined,
      sourceYear: sourceYear.trim() || undefined,
    };

    try {
      if (editingId) {
        await api.updateQuestion(editingId, payload);
        onToast('success', 'প্রশ্ন হালনাগাদ হয়েছে');
      } else {
        await api.createQuestion(payload);
        onToast('success', 'প্রশ্ন ব্যাংকে যুক্ত হয়েছে');
      }
      resetForm();
      fetchQuestions();
      fetchTaxonomy();
      onQuestionsChanged();
    } catch (err) {
      onToast(
        'warning',
        'সংরক্ষণ ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (q: QuestionItem) => {
    try {
      await api.duplicateQuestion(q.id);
      onToast('success', 'প্রশ্ন ডুপ্লিকেট করা হয়েছে');
      fetchQuestions();
      onQuestionsChanged();
    } catch (err) {
      onToast(
        'warning',
        'ডুপ্লিকেট ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteQuestion(confirmDelete.id);
      if (editingId === confirmDelete.id) resetForm();
      setConfirmDelete(null);
      onToast('info', 'প্রশ্ন ব্যাংক থেকে মুছে ফেলা হয়েছে');
      fetchQuestions();
      onQuestionsChanged();
    } catch (err) {
      onToast(
        'warning',
        'মুছে ফেলা ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleAddChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapName.trim()) return;
    try {
      const res = await api.addChapter({
        subjectId,
        name: newChapName.trim(),
        banglaName: newChapNameBn.trim() || newChapName.trim(),
      });
      onSubjectsUpdated(res.subjects);
      setChapter(newChapName.trim());
      setNewChapName('');
      setNewChapNameBn('');
      onToast('success', 'অধ্যায় যুক্ত হয়েছে');
    } catch (err) {
      onToast(
        'warning',
        'অধ্যায় যুক্ত করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicChapterId || !newTopicName.trim()) return;
    try {
      const res = await api.addTopic({
        subjectId,
        chapterId: newTopicChapterId,
        name: newTopicName.trim(),
      });
      setTopics(res.topics);
      setTopic(newTopicName.trim());
      setNewTopicName('');
      onToast('success', 'টপিক যুক্ত হয়েছে');
    } catch (err) {
      onToast(
        'warning',
        'টপিক যুক্ত করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const combinedSinglePaste = useMemo(
    () => [prompt, promptBn, optA].filter((s) => s.trim().length > 0).join('\n'),
    [prompt, promptBn, optA]
  );

  const detectedBulkPaste = useMemo(() => {
    if (editingId) return false;
    const text = combinedSinglePaste;
    if (text.length < 30) return false;
    const numberedLines = text.match(/^\s*(?:\d+|[১-৯][০-৯]*)[\.\)\:\-]\s*\S/gm) ?? [];
    const optionMarkers = text.match(/(?:^|\n|\s)(?:\(?[A-Da-dকখগঘ]\)|\([A-Da-dকখগঘ]\))/gm) ?? [];
    return numberedLines.length >= 2 || optionMarkers.length >= 2;
  }, [combinedSinglePaste, editingId]);

  const handleMovePasteToBulk = () => {
    setBulkCarryoverText(combinedSinglePaste);
    resetForm();
    setEntryMode('bulk');
    onToast(
      'info',
      'লেখাটি বাল্ক AI মোডে নেওয়া হয়েছে',
      'চাইলে নিচের উত্তরমালা বক্সে উত্তর পেস্ট করে একসাথে সব প্রশ্ন সাজিয়ে নিন।'
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#172033]">
            প্রশ্ন ব্যাংক পরিচালনা
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            একটি প্রশ্ন যোগ করুন অথবা একসাথে অনেক প্রশ্ন ও উত্তরমালা পেস্ট করে AI দিয়ে সাজিয়ে নিন।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-[#E8ECF3]">
            <button
              type="button"
              onClick={() => setEntryMode('single')}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                entryMode === 'single'
                  ? 'bg-[#4F46E5] text-white'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>একটি প্রশ্ন ও তালিকা</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('bulk')}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                entryMode === 'bulk'
                  ? 'bg-[#4F46E5] text-white'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>একসাথে অনেক প্রশ্ন ও উত্তরমালা (Bulk)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewTopicChapterId(subjectChapters[0]?.id ?? '');
              setTaxonomyOpen(true);
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#172033] flex items-center gap-2 whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4 text-[#4F46E5]" />
            <span>অধ্যায় ও টপিক</span>
          </button>
        </div>
      </div>

      {entryMode === 'bulk' ? (
        <AdminQuestionImporter
          embedded
          initialRawText={bulkCarryoverText}
          onQuestionsApproved={() => {
            fetchQuestions();
            fetchTaxonomy();
            onQuestionsChanged();
          }}
          onToast={onToast}
        />
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Create / Edit Question Form */}
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-5 bg-white border border-[#E8ECF3] rounded-2xl p-5 space-y-3.5 h-fit"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-[#172033]">
              {editingId ? 'প্রশ্ন সম্পাদনা করুন' : 'নতুন প্রশ্ন যুক্ত করুন'}
            </h2>
            <div className="flex items-center gap-2">
              {!editingId && (
                <button
                  type="button"
                  onClick={() => setEntryMode('bulk')}
                  className="text-xs font-semibold text-[#4F46E5] hover:underline flex items-center gap-1"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>অনেক প্রশ্ন একসাথে দেবেন?</span>
                </button>
              )}
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
          </div>

          {detectedBulkPaste && (
            <div className="rounded-xl bg-[#EEF2FF] border border-[#4F46E5]/30 p-3.5 space-y-2">
              <p className="text-xs font-semibold text-[#172033]">
                এখানে একসাথে একাধিক প্রশ্ন বা অপশন পেস্ট করা হয়েছে!
              </p>
              <p className="text-[11px] text-[#475569] leading-relaxed">
                একটি করে লেখার বদলে বাল্ক মোডে যান — AI সবগুলো প্রশ্ন আলাদা করে গণিত ফরম্যাট করবে এবং আপনি আলাদাভাবে উত্তরমালাও পেস্ট করতে পারবেন।
              </p>
              <button
                type="button"
                onClick={handleMovePasteToBulk}
                className="min-h-[34px] px-3.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>সব প্রশ্ন বাল্ক AI মোডে নিয়ে সাজান</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                বিষয়
              </label>
              <select
                value={subjectId}
                onChange={(e) => {
                  const nextSubj = e.target.value as SubjectId;
                  setSubjectId(nextSubj);
                  const firstCh = subjects.find((s) => s.id === nextSubj)
                    ?.chapters[0]?.name;
                  if (firstCh) setChapter(firstCh);
                }}
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              >
                {SUBJECT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                বিশ্ববিদ্যালয় ট্যাগ
              </label>
              <select
                value={universityTag}
                onChange={(e) => {
                  const val = e.target.value as UniversityTrack;
                  setUniversityTag(val);
                  setAdmissionCategory(val);
                }}
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              >
                <option value="DU Ka">DU Ka (ঢাবি ক)</option>
                <option value="DU Kha">DU Kha (ঢাবি খ)</option>
                <option value="GST">GST</option>
                <option value="Rajshahi University">Rajshahi University</option>
                <option value="Jahangirnagar University">Jahangirnagar University</option>
                <option value="Chittagong University">Chittagong University</option>
                <option value="Medical">Medical</option>
                <option value="Engineering">Engineering</option>
                <option value="BUET">BUET</option>
                <option value="CKRUET">CKRUET</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                অধ্যায়
              </label>
              <input
                list="chapter-suggestions"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="যেমন: Electrostatics"
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              />
              <datalist id="chapter-suggestions">
                {subjectChapters.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                টপিক
              </label>
              <input
                list="topic-suggestions"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="যেমন: Gauss Law"
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              />
              <datalist id="topic-suggestions">
                {topics
                  .filter((t) => t.subjectId === subjectId)
                  .map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                কঠিনতা
              </label>
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(
                    e.target.value as
                      | 'Foundation'
                      | 'Standard'
                      | 'Admission Hard'
                  )
                }
                className="w-full min-h-[38px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              >
                <option value="Foundation">Foundation</option>
                <option value="Standard">Standard</option>
                <option value="Admission Hard">Admission Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                অবস্থা
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as QuestionStatus)}
                className="w-full min-h-[38px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              >
                <option value="Published">Published</option>
                <option value="Approved">Approved</option>
                <option value="Draft">Draft</option>
                <option value="Needs Review">Needs Review</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                নম্বর
              </label>
              <input
                type="number"
                step={0.5}
                min={0.5}
                value={marks}
                onChange={(e) => setMarks(Number(e.target.value))}
                className="w-full min-h-[38px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                নেগেটিভ
              </label>
              <input
                type="number"
                step={0.05}
                min={0}
                value={negativeMarking}
                onChange={(e) => setNegativeMarking(Number(e.target.value))}
                className="w-full min-h-[38px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
              />
            </div>
          </div>

          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="প্রশ্ন লিখুন (অনেক প্রশ্ন একসাথে দিতে চাইলে উপরের 'একসাথে অনেক প্রশ্ন' বাটনে যান)..."
            className="w-full p-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
          />

          <textarea
            rows={2}
            value={promptBn}
            onChange={(e) => setPromptBn(e.target.value)}
            placeholder="বাংলা অনুবাদ বা বিকল্প লেখা (ঐচ্ছিক)..."
            className="w-full p-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
          />

          {/* Image / Diagram Upload */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3]">
            <label className="flex items-center gap-2 text-xs font-medium text-[#172033] cursor-pointer">
              <ImagePlus className="w-4 h-4 text-[#4F46E5]" />
              <span>
                {uploadingImage ? 'আপলোড হচ্ছে...' : 'প্রশ্নের চিত্র যুক্ত করুন'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
            {imageUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={imageUrl}
                  alt="চিত্র প্রিভিউ"
                  className="w-8 h-8 rounded object-cover border border-[#E8ECF3]"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl(undefined)}
                  className="text-xs text-red-600 hover:underline"
                >
                  মুছুন
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={optA}
              onChange={(e) => setOptA(e.target.value)}
              placeholder="অপশন A"
              className="min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
            />
            <input
              type="text"
              value={optB}
              onChange={(e) => setOptB(e.target.value)}
              placeholder="অপশন B"
              className="min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
            />
            <input
              type="text"
              value={optC}
              onChange={(e) => setOptC(e.target.value)}
              placeholder="অপশন C"
              className="min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
            />
            <input
              type="text"
              value={optD}
              onChange={(e) => setOptD(e.target.value)}
              placeholder="অপশন D"
              className="min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                সঠিক উত্তর
              </label>
              <select
                value={correctIndex}
                onChange={(e) => setCorrectIndex(Number(e.target.value))}
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              >
                <option value={0}>অপশন A</option>
                <option value={1}>অপশন B</option>
                <option value={2}>অপশন C</option>
                <option value={3}>অপশন D</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                উৎস
              </label>
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="যেমন: DU Ka Unit"
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                বছর
              </label>
              <input
                type="text"
                value={sourceYear}
                onChange={(e) => setSourceYear(e.target.value)}
                placeholder="যেমন: 2023-24"
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033] font-mono-num"
              />
            </div>
          </div>

          <input
            type="text"
            value={explanationEn}
            onChange={(e) => setExplanationEn(e.target.value)}
            placeholder="ইংরেজি সমাধান ব্যাখ্যা"
            className="w-full min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
          />
          <input
            type="text"
            value={explanationBn}
            onChange={(e) => setExplanationBn(e.target.value)}
            placeholder="বাংলা সমাধান ব্যাখ্যা"
            className="w-full min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
          />

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
                  : 'প্রশ্ন ব্যাংকে যুক্ত করুন'}
            </span>
          </button>
        </form>

        {/* Searchable Question Directory */}
        <div className="xl:col-span-7 bg-white border border-[#E8ECF3] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-[#E8ECF3]">
            {(
              [
                ['all', 'সব অবস্থা'],
                ['Published', 'Published'],
                ['Approved', 'Approved'],
                ['Draft', 'Draft'],
                ['Needs Review', 'Needs Review'],
                ['Rejected', 'Rejected'],
              ] as const
            ).map(([stKey, stLabel]) => (
              <button
                key={stKey}
                type="button"
                onClick={() => {
                  setFilterStatus(stKey);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === stKey
                    ? 'bg-[#4F46E5] text-white'
                    : 'bg-[#F7F8FC] text-[#64748B] hover:text-[#172033] border border-[#E8ECF3]'
                }`}
              >
                {stLabel}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="sm:col-span-2 relative">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="প্রশ্ন, অধ্যায়, টপিক বা উৎস খুঁজুন..."
                className="w-full min-h-[38px] pl-8 pr-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              />
            </div>

            <select
              value={filterSubject}
              onChange={(e) => {
                setFilterSubject(e.target.value);
                setFilterChapter('all');
                setPage(1);
              }}
              className="min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
            >
              <option value="all">সকল বিষয়</option>
              {SUBJECT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setPage(1);
              }}
              className="min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
            >
              <option value="all">সকল ভর্তি ক্যাটাগরি</option>
              {ADMISSION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'DU Ka' ? 'DU Ka (ঢাবি ক)' : cat === 'DU Kha' ? 'DU Kha (ঢাবি খ)' : cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>
              ফিল্টার অনুযায়ী{' '}
              <strong className="text-[#172033] font-mono-num">{total}</strong>টি প্রশ্ন পাওয়া গেছে
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterChapter}
                onChange={(e) => {
                  setFilterChapter(e.target.value);
                  setPage(1);
                }}
                aria-label="অধ্যায় অনুযায়ী ফিল্টার"
                className="px-2.5 py-1 rounded-lg bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033] max-w-[190px]"
              >
                <option value="all">সকল অধ্যায়</option>
                {Array.from(
                  new Set([
                    ...subjects
                      .filter((s) => filterSubject === 'all' || s.id === filterSubject)
                      .flatMap((s) => s.chapters.map((c) => c.name)),
                    ...questions.map((q) => q.chapter),
                  ])
                )
                  .filter(Boolean)
                  .sort()
                  .map((chapName) => (
                    <option key={chapName} value={chapName}>
                      {chapName}
                    </option>
                  ))}
              </select>
              <select
                value={filterDifficulty}
                onChange={(e) => {
                  setFilterDifficulty(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
              >
                <option value="all">যেকোনো কঠিনতা</option>
                <option value="Foundation">Foundation</option>
                <option value="Standard">Standard</option>
                <option value="Admission Hard">Admission Hard</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-[#64748B]">
              প্রশ্ন লোড হচ্ছে...
            </div>
          ) : questions.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#64748B] bg-[#F7F8FC] rounded-xl border border-[#E8ECF3]">
              {search.trim() ||
              filterSubject !== 'all' ||
              filterChapter !== 'all' ||
              filterCategory !== 'all' ||
              filterStatus !== 'all' ||
              filterDifficulty !== 'all'
                ? 'বর্তমান ফিল্টারে কোনো প্রশ্ন পাওয়া যায়নি।'
                : 'No questions available yet · এখনো প্রশ্ন ব্যাংকে কোনো প্রশ্ন যুক্ত করা হয়নি।'}
            </div>
          ) : (
            <div className="divide-y divide-[#E8ECF3]">
              {questions.map((q) => {
                const st = q.status ?? 'Published';
                const isPublished = st === 'Published';
                return (
                  <div
                    key={q.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            STATUS_STYLE[st] ?? 'bg-[#F1F5F9] text-[#475569]'
                          }`}
                        >
                          {st}
                        </span>
                        <span className="text-[#4F46E5] font-medium">
                          {q.subjectName} · {q.chapter}
                          {q.topic && q.topic !== q.chapter ? ` (${q.topic})` : ''}
                        </span>
                        <span className="text-[#64748B]">
                          · {q.admissionCategory || q.universityTag} · {q.difficulty}
                        </span>
                        {q.duplicateCount && q.duplicateCount > 0 ? (
                          <span className="text-red-600 font-semibold">
                            · {q.duplicateCount}টি সম্ভাব্য ডুপ্লিকেট
                          </span>
                        ) : null}
                      </div>

                      <div className="text-sm text-[#172033] font-medium leading-snug">
                        <MathText text={q.prompt} />
                      </div>
                      {q.promptBn && (
                        <div className="text-xs text-[#64748B] leading-relaxed">
                          <MathText text={q.promptBn} />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {q.correctIndex >= 0 && q.correctIndex <= 3 ? (
                          <span className="text-[#059669] font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            উত্তর: {String.fromCharCode(65 + q.correctIndex)}.{' '}
                            <MathText text={q.options[q.correctIndex] ?? ''} />
                          </span>
                        ) : (
                          <span className="text-[#B45309] font-semibold">
                            উত্তর অনিশ্চিত — রিভিউ প্রয়োজন
                          </span>
                        )}
                        {q.sourceName && (
                          <span className="text-[#64748B]">
                            উৎস: {q.sourceName} {q.sourceYear}
                          </span>
                        )}
                        {q.imageUrl && (
                          <span className="text-[#0891B2] font-medium">
                            চিত্র যুক্ত আছে
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleTogglePublishStatus(q)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-[#059669] hover:bg-[#ECFDF5]"
                        title={
                          isPublished ? 'আনপাবলিশ (Draft) করুন' : 'লাইভ প্রকাশ করুন'
                        }
                      >
                        {isPublished ? (
                          <Eye className="w-4 h-4 text-[#059669]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[#D97706]" />
                        )}
                      </button>
                      <button
                        onClick={() => handleOpenHistory(q)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-[#4F46E5] hover:bg-[#EEF2FF]"
                        title="সম্পাদনা ইতিহাস"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleLoadForEdit(q)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-[#4F46E5] hover:bg-[#EEF2FF]"
                        title="প্রশ্ন সম্পাদনা"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(q)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-[#0891B2] hover:bg-[#ECFEFF]"
                        title="প্রশ্ন ডুপ্লিকেট"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(q)}
                        className="p-2 rounded-lg text-[#64748B] hover:text-red-600 hover:bg-[#FEF2F2]"
                        title="প্রশ্ন মুছুন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="pt-3 border-t border-[#E8ECF3] flex items-center justify-between text-xs">
              <span className="text-[#64748B] font-mono-num">
                পৃষ্ঠা {page} / {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-[#E8ECF3] font-medium disabled:opacity-40"
                >
                  পূর্ববর্তী
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-[#E8ECF3] font-medium disabled:opacity-40"
                >
                  পরবর্তী
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Chapters & Topics Modal */}
      {taxonomyOpen && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8ECF3] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8ECF3]">
              <h3 className="font-display text-base font-semibold text-[#172033]">
                {SUBJECT_OPTIONS.find((s) => s.id === subjectId)?.label}-এর অধ্যায় ও টপিক
              </h3>
              <button
                onClick={() => setTaxonomyOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#172033]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddChapter} className="space-y-2.5">
              <p className="text-xs font-semibold text-[#172033]">
                নতুন অধ্যায় যোগ করুন
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newChapName}
                  onChange={(e) => setNewChapName(e.target.value)}
                  placeholder="অধ্যায়ের নাম (ইংরেজি)"
                  className="min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                />
                <input
                  type="text"
                  value={newChapNameBn}
                  onChange={(e) => setNewChapNameBn(e.target.value)}
                  placeholder="অধ্যায়ের নাম (বাংলা)"
                  className="min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                />
              </div>
              <button
                type="submit"
                className="px-4 min-h-[36px] rounded-xl bg-[#4F46E5] text-white text-xs font-semibold"
              >
                অধ্যায় যোগ করুন
              </button>
            </form>

            <form
              onSubmit={handleAddTopic}
              className="space-y-2.5 pt-3 border-t border-[#E8ECF3]"
            >
              <p className="text-xs font-semibold text-[#172033]">
                অধ্যায়ের অধীনে নতুন টপিক যোগ করুন
              </p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newTopicChapterId}
                  onChange={(e) => setNewTopicChapterId(e.target.value)}
                  className="min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                >
                  {subjectChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  placeholder="টপিকের নাম"
                  className="min-h-[38px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                />
              </div>
              <button
                type="submit"
                className="px-4 min-h-[36px] rounded-xl bg-[#059669] text-white text-xs font-semibold"
              >
                টপিক যোগ করুন
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit History Modal */}
      {historyQuestion && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8ECF3] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E8ECF3]">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-[#172033]">
                  প্রশ্ন সম্পাদনা ইতিহাস (Edit History)
                </h3>
                <div className="text-xs text-[#64748B] mt-0.5 line-clamp-2">
                  <MathText text={historyQuestion.prompt} />
                </div>
              </div>
              <button
                onClick={() => setHistoryQuestion(null)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#172033]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingHistory ? (
              <p className="py-6 text-center text-xs text-[#64748B]">
                ইতিহাস লোড হচ্ছে...
              </p>
            ) : historyEntries.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#64748B]">
                এই প্রশ্নের এখনো কোনো সম্পাদনা ইতিহাস রেকর্ড হয়নি।
              </p>
            ) : (
              <div className="divide-y divide-[#E8ECF3] max-h-80 overflow-y-auto pr-1">
                {historyEntries.map((entry) => (
                  <div key={entry.id} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#4F46E5]">
                        {entry.changeSummary}
                      </span>
                      <span className="font-mono-num text-[#64748B]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[#64748B]">
                      সম্পাদনকারী: {entry.changedBy}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Question Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8ECF3] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-lg font-semibold text-[#172033]">
                  প্রশ্নটি মুছে ফেলবেন?
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed line-clamp-3">
                  {confirmDelete.prompt}
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
