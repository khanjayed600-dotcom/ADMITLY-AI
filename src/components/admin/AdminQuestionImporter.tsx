import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BookCheck,
  Check,
  CheckCheck,
  CopyCheck,
  Edit3,
  Eye,
  FileText,
  FileUp,
  KeyRound,
  Layers,
  Loader2,
  Save,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../../services/api';
import {
  ADMISSION_CATEGORIES,
  type AdmissionCategory,
  type ExamConfig,
  type QuestionStatus,
  type StagedImportQuestion,
  type SubjectId,
  type UniversityTrack,
} from '../../types';
import { MathText } from '../ui/MathText';

interface AdminQuestionImporterProps {
  onQuestionsApproved: () => void;
  onToast: (
    tone: 'success' | 'warning' | 'info',
    title: string,
    detail?: string
  ) => void;
  initialRawText?: string;
  embedded?: boolean;
}

type QueueTab = 'active' | 'Needs Review' | 'Draft' | 'Approved' | 'Rejected';

const STATUS_BADGE: Record<QuestionStatus, { label: string; cls: string }> = {
  Published: { label: 'Published', cls: 'bg-[#ECFDF5] text-[#059669] border-[#059669]/25' },
  Approved: { label: 'Approved', cls: 'bg-[#EEF2FF] text-[#4F46E5] border-[#4F46E5]/25' },
  Draft: { label: 'Draft', cls: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]' },
  Processing: { label: 'Processing', cls: 'bg-[#ECFEFF] text-[#0891B2] border-[#0891B2]/25' },
  'Needs Review': {
    label: 'Needs Review',
    cls: 'bg-[#FEF3C7] text-[#B45309] border-[#F59E0B]/40',
  },
  Rejected: { label: 'Rejected', cls: 'bg-[#FEF2F2] text-red-600 border-red-200' },
};

export function AdminQuestionImporter({
  onQuestionsApproved,
  onToast,
  initialRawText,
  embedded = false,
}: AdminQuestionImporterProps) {
  const [rawText, setRawText] = useState(initialRawText ?? '');
  const [answerKeyText, setAnswerKeyText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [defaultSubjectId, setDefaultSubjectId] = useState<SubjectId>('physics');
  const [defaultAdmissionCategory, setDefaultAdmissionCategory] =
    useState<AdmissionCategory>('DU Ka');
  const [defaultUniversityTag, setDefaultUniversityTag] =
    useState<UniversityTrack>('DU Ka');
  const [defaultMarks, setDefaultMarks] = useState(1);
  const [defaultNegativeMarking, setDefaultNegativeMarking] = useState(0.25);
  const [defaultSourceName, setDefaultSourceName] = useState('');
  const [defaultSourceYear, setDefaultSourceYear] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queue, setQueue] = useState<StagedImportQuestion[]>([]);
  const [queueTab, setQueueTab] = useState<QueueTab>('active');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [cardMode, setCardMode] = useState<
    Record<string, 'preview' | 'raw' | 'edit'>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Batch Paste Answer Key modal/drawer for existing queue
  const [answerDrawerOpen, setAnswerDrawerOpen] = useState(false);
  const [queueAnswerKeyText, setQueueAnswerKeyText] = useState('');

  // Assign to Exam Modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [exams, setExams] = useState<ExamConfig[]>([]);
  const [assignMode, setAssignMode] = useState<'existing' | 'new'>('new');
  const [targetExamId, setTargetExamId] = useState('');
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamTrack, setNewExamTrack] =
    useState<UniversityTrack>('DU Ka');
  const [newExamDuration, setNewExamDuration] = useState(30);
  const [newExamNegMark, setNewExamNegMark] = useState(0.25);
  const [newExamPublish, setNewExamPublish] = useState(true);

  useEffect(() => {
    if (initialRawText && initialRawText.trim()) {
      setRawText(initialRawText);
    }
  }, [initialRawText]);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const res = await api.getImportQueue('all');
      setQueue(res.items);
    } catch (err) {
      onToast(
        'warning',
        'রিভিউ কিউ লোড করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoadingQueue(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim() && !selectedFile) {
      onToast(
        'warning',
        'তথ্য প্রয়োজন',
        'প্রশ্নের লেখা পেস্ট করুন অথবা PDF, DOCX বা TXT ফাইল আপলোড করুন।'
      );
      return;
    }

    setAnalyzing(true);
    try {
      const res = await api.analyzeImportInput({
        rawText: rawText.trim() || undefined,
        answerKeyText: answerKeyText.trim() || undefined,
        file: selectedFile,
        defaultSubjectId,
        defaultUniversityTag,
        defaultAdmissionCategory,
        defaultMarks,
        defaultNegativeMarking,
        defaultSourceName: defaultSourceName.trim() || undefined,
        defaultSourceYear: defaultSourceYear.trim() || undefined,
      });
      setRawText('');
      setAnswerKeyText('');
      setSelectedFile(null);
      setQueue((prev) => [...res.items, ...prev]);
      setSelectedIds(res.items.map((i) => i.id));
      setQueueTab('active');
      const readyCount = res.items.filter((i) => !i.needsManualReview).length;
      onToast(
        'success',
        `${res.items.length}টি প্রশ্ন AI দিয়ে সাজানো হয়েছে (${readyCount}টি সম্পূর্ণ প্রস্তুত)`,
        'প্রিভিউ ও সঠিক উত্তর যাচাই করে প্রকাশ করুন বা সরাসরি পরীক্ষায় যুক্ত করুন।'
      );
    } catch (err) {
      onToast(
        'warning',
        'প্রশ্ন বিশ্লেষণ ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const updateLocalItem = (
    id: string,
    patch: Partial<StagedImportQuestion>
  ) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleSaveItem = async (
    item: StagedImportQuestion,
    dismissDuplicate = false
  ) => {
    setSavingId(item.id);
    try {
      const res = await api.updateStagedImportItem(item.id, {
        ...item,
        dismissDuplicate,
      });
      setQueue((prev) => prev.map((q) => (q.id === item.id ? res.item : q)));
      setCardMode((prev) => ({ ...prev, [item.id]: 'preview' }));
      onToast('success', 'সম্পাদনা সংরক্ষিত হয়েছে');
    } catch (err) {
      onToast(
        'warning',
        'পরিবর্তন সংরক্ষণ ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleRejectItem = async (id: string) => {
    setBusyAction(true);
    try {
      await api.rejectStagedImportItem(id);
      await loadQueue();
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      onToast('info', 'প্রশ্নটি প্রত্যাখ্যান (Reject) করা হয়েছে');
    } catch (err) {
      onToast(
        'warning',
        'প্রত্যাখ্যান করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    setBusyAction(true);
    try {
      await api.deleteStagedImportItem(id);
      setQueue((prev) => prev.filter((item) => item.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      onToast('info', 'কিউ থেকে মুছে ফেলা হয়েছে');
    } catch (err) {
      onToast(
        'warning',
        'মুছে ফেলা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setBusyAction(false);
    }
  };

  const isItemValid = (item: StagedImportQuestion) =>
    item.correctIndex !== null &&
    item.correctIndex >= 0 &&
    item.correctIndex <= 3 &&
    item.prompt.trim().length > 0 &&
    item.options.every((o) => o.trim().length > 0) &&
    item.status !== 'Needs Review' &&
    item.status !== 'Rejected' &&
    !item.needsManualReview &&
    !item.isIncomplete;

  const handleApproveSingle = async (
    item: StagedImportQuestion,
    publishImmediately: boolean
  ) => {
    if (
      item.correctIndex === null ||
      item.correctIndex < 0 ||
      item.correctIndex > 3 ||
      !item.prompt.trim() ||
      item.options.some((o) => !o.trim())
    ) {
      onToast(
        'warning',
        'ম্যানুয়াল যাচাই প্রয়োজন',
        'সঠিক উত্তর (A-D) নির্বাচন করুন এবং প্রশ্ন ও ৪টি অপশন পূরণ করুন।'
      );
      return;
    }

    setBusyAction(true);
    try {
      await api.updateStagedImportItem(item.id, item);
      const res = await api.approveImportItems([item.id], {
        publishImmediately,
        excludeNeedsReview: false,
      });
      await loadQueue();
      if (res.approvedQuestions.length > 0) {
        onToast(
          'success',
          publishImmediately
            ? 'প্রশ্নটি অনুমোদিত ও লাইভ প্রকাশিত হয়েছে'
            : 'প্রশ্নটি Approved হিসেবে প্রশ্ন ব্যাংকে সংরক্ষিত হয়েছে'
        );
        onQuestionsApproved();
      } else if (res.skipped.length > 0) {
        onToast('warning', 'অনুমোদন এড়িয়ে যাওয়া হয়েছে', res.skipped[0].reason);
      }
    } catch (err) {
      onToast(
        'warning',
        'অনুমোদন ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setBusyAction(false);
    }
  };

  const activeItems = queue.filter(
    (q) => q.status !== 'Rejected' && q.status !== 'Published'
  );
  const needsReviewItems = queue.filter((q) => q.status === 'Needs Review');
  const draftItems = queue.filter((q) => q.status === 'Draft');
  const approvedStagedItems = queue.filter((q) => q.status === 'Approved');
  const rejectedItems = queue.filter((q) => q.status === 'Rejected');
  const validDraftItems = queue.filter(
    (q) => q.status === 'Draft' && isItemValid(q)
  );

  const visibleItems =
    queueTab === 'active'
      ? activeItems
      : queue.filter((q) => q.status === queueTab);

  const handleBulkApproveValid = async (publishImmediately = false) => {
    if (validDraftItems.length === 0) {
      onToast(
        'warning',
        'বৈধ কোনো Draft প্রশ্ন নেই',
        'Needs Review প্রশ্নগুলোতে উত্তরমালা পেস্ট বা নির্বাচন করে প্রস্তুত করুন।'
      );
      return;
    }
    setBusyAction(true);
    try {
      const targetIds = validDraftItems.map((i) => i.id);
      const res = await api.approveImportItems(targetIds, {
        publishImmediately,
        excludeNeedsReview: true,
      });
      await loadQueue();
      onToast(
        'success',
        publishImmediately
          ? `${res.approvedQuestions.length}টি বৈধ প্রশ্ন অনুমোদিত ও লাইভ প্রকাশিত হয়েছে`
          : `${res.approvedQuestions.length}টি বৈধ প্রশ্ন অনুমোদিত (Approved) হয়েছে`,
        res.skipped.length > 0
          ? `${res.skipped.length}টি Needs Review প্রশ্ন নিরাপদে আলাদা রাখা হয়েছে।`
          : undefined
      );
      if (res.approvedQuestions.length > 0) {
        onQuestionsApproved();
      }
    } catch (err) {
      onToast(
        'warning',
        'বাল্ক অনুমোদন ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleApplyQueueAnswerKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetItems =
      selectedIds.length > 0
        ? visibleItems.filter((item) => selectedIds.includes(item.id))
        : visibleItems;
    const targetIds = targetItems.map((i) => i.id);

    if (targetIds.length === 0) {
      onToast('warning', 'উত্তর ম্যাচ করার জন্য কিউতে কোনো প্রশ্ন নেই');
      return;
    }
    if (!queueAnswerKeyText.trim()) {
      onToast('warning', 'উত্তরমালা (Answer Key) পেস্ট করুন');
      return;
    }

    setBusyAction(true);
    try {
      const res = await api.applyAnswerKeyToImportItems(
        targetIds,
        queueAnswerKeyText.trim()
      );
      await loadQueue();
      setAnswerDrawerOpen(false);
      setQueueAnswerKeyText('');
      onToast(
        'success',
        `${res.updatedCount}টি প্রশ্নে সঠিক উত্তর ও ব্যাখ্যা যুক্ত হয়েছে`,
        res.unmatchedCount > 0
          ? `${res.unmatchedCount}টি প্রশ্নের নম্বর বা ক্রম উত্তরমালার সাথে মেলেনি।`
          : 'এখন প্রশ্নগুলো অনুমোদন ও প্রকাশ করতে বা পরীক্ষায় যুক্ত করতে পারেন।'
      );
    } catch (err) {
      onToast(
        'warning',
        'উত্তরমালা ম্যাচ করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleQuickPickAnswer = async (
    item: StagedImportQuestion,
    optIdx: number
  ) => {
    setSavingId(item.id);
    try {
      const res = await api.updateStagedImportItem(item.id, {
        ...item,
        correctIndex: optIdx,
        answerConfidence: 'explicit',
      });
      setQueue((prev) => prev.map((q) => (q.id === item.id ? res.item : q)));
      onToast(
        'success',
        `সঠিক উত্তর অপশন ${String.fromCharCode(65 + optIdx)} সংরক্ষিত হয়েছে`
      );
    } catch (err) {
      onToast(
        'warning',
        'উত্তর সংরক্ষণ করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleBulkPublishApproved = async () => {
    const idsToPublish =
      selectedIds.length > 0
        ? selectedIds.filter((id) =>
            approvedStagedItems.some((a) => a.id === id)
          )
        : approvedStagedItems.map((a) => a.id);

    if (idsToPublish.length === 0) {
      onToast(
        'warning',
        'প্রকাশের জন্য অনুমোদিত প্রশ্ন নেই',
        'প্রথমে প্রশ্নগুলো Approved অবস্থায় অনুমোদন করুন।'
      );
      return;
    }

    setBusyAction(true);
    try {
      const res = await api.publishImportItems(idsToPublish);
      await loadQueue();
      setSelectedIds([]);
      onToast(
        'success',
        `${res.publishedCount}টি প্রশ্ন শিক্ষার্থীদের জন্য লাইভ প্রকাশিত হয়েছে`
      );
      onQuestionsApproved();
    } catch (err) {
      onToast(
        'warning',
        'প্রকাশ ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setBusyAction(false);
    }
  };

  const openAssignModal = async () => {
    const assignableIds =
      selectedIds.length > 0
        ? selectedIds
        : queue
            .filter((q) => q.status === 'Approved' || isItemValid(q))
            .map((q) => q.id);

    if (assignableIds.length === 0) {
      onToast(
        'warning',
        'কোনো বৈধ প্রশ্ন নির্বাচিত নেই',
        'পরীক্ষায় যুক্ত করতে অন্তত ১টি বৈধ প্রশ্ন নির্বাচন বা অনুমোদন করুন।'
      );
      return;
    }

    if (selectedIds.length === 0) {
      setSelectedIds(assignableIds);
    }

    try {
      const exRes = await api.listAdminExams();
      setExams(exRes.exams);
      if (exRes.exams.length > 0) {
        setTargetExamId(exRes.exams[0].id);
      }
    } catch {
      setExams([]);
    }
    setAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    if (assignMode === 'new' && !newExamTitle.trim()) {
      onToast('warning', 'নতুন পরীক্ষার শিরোনাম লিখুন');
      return;
    }
    if (assignMode === 'existing' && !targetExamId) {
      onToast('warning', 'একটি বিদ্যমান পরীক্ষা নির্বাচন করুন');
      return;
    }

    setBusyAction(true);
    try {
      const res = await api.assignImportItemsToExam({
        stagedIds: selectedIds,
        examId: assignMode === 'existing' ? targetExamId : undefined,
        newExam:
          assignMode === 'new'
            ? {
                title: newExamTitle.trim(),
                universityTrack: newExamTrack,
                durationMinutes: newExamDuration,
                negativeMarking: newExamNegMark,
                isPublished: newExamPublish,
              }
            : undefined,
        publishQuestions: true,
      });
      await loadQueue();
      setAssignModalOpen(false);
      setSelectedIds([]);
      setNewExamTitle('');
      onToast(
        'success',
        `${res.assignedQuestionIds.length}টি প্রশ্ন পরীক্ষায় যুক্ত ও প্রকাশিত হয়েছে`,
        res.exam.title
      );
      onQuestionsApproved();
    } catch (err) {
      onToast(
        'warning',
        'পরীক্ষায় যুক্ত করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setBusyAction(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="font-display text-2xl font-bold text-[#172033]">
            AI Question Builder · একসাথে অনেক প্রশ্ন ও উত্তরমালা যুক্ত করুন
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            একসাথে ২০–৫০টি বাংলা/ইংরেজি MCQ এবং আলাদা উত্তরমালা (Answer Key) পেস্ট করুন। গণিত ও সূত্র স্বয়ংক্রিয়ভাবে KaTeX LaTeX-এ সাজানো হবে এবং শিক্ষার্থীরা পরীক্ষা জমা দেওয়ার পর সঠিক উত্তর ও ব্যাখ্যা দেখতে পাবে।
          </p>
        </div>
      )}

      {/* Input Workbench */}
      <form
        onSubmit={handleAnalyze}
        className="bg-white border border-[#E8ECF3] rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-[#172033]">
                বাল্ক প্রশ্ন ও উত্তরমালা পেস্ট করুন (Bulk Paste + Answer Key)
              </h2>
              <p className="text-xs text-[#64748B]">
                একসাথে অনেক প্রশ্ন + আলাদা উত্তরমালা দিলে AI সবগুলো প্রশ্ন আলাদা করে KaTeX-এ সাজিয়ে দেবে
              </p>
            </div>
          </div>

          {analyzing && (
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border inline-flex items-center gap-1.5 ${STATUS_BADGE.Processing.cls}`}
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{STATUS_BADGE.Processing.label}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#172033]">
                ১. সব প্রশ্ন একসাথে পেস্ট করুন (বাংলা/ইংরেজি, (ক)-(ঘ) বা (A)-(D), সূত্র ও LaTeX সহ)
              </label>
              <textarea
                rows={8}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={'১৩. বলের মাত্রা কোনটি?\n(ক) [MLT^-1]\n(খ) [MLT^-2]\n...\n১৪. কোনো বৃত্তের ব্যাসার্ধ পরিমাপে ২% ত্রুটি থাকলে ক্ষেত্রফল নির্ণয়ে শতকরা ত্রুটি কত হবে?\n(ক) ২%\n(খ) ৪%\n...'}
                className="w-full p-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs sm:text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white leading-relaxed"
              />
            </div>

            <div className="space-y-1.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[#172033] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#059669]" />
                  <span>২. উত্তরমালা পেস্ট করুন (Paste Answer Key — ঐচ্ছিক, পরেও দেওয়া যাবে)</span>
                </label>
                <span className="text-[11px] text-[#64748B]">
                  ফরম্যাট: ১৩. খ, ১৪. খ অথবা 1. C, 2. A অথবা ক, গ, খ
                </span>
              </div>
              <textarea
                rows={3}
                value={answerKeyText}
                onChange={(e) => setAnswerKeyText(e.target.value)}
                placeholder={'এখানে সব প্রশ্নের উত্তর ও চাইলে ব্যাখ্যা পেস্ট করুন...\nযেমন:\n১৩. খ — বল = ভর × ত্বরণ = [MLT^-2]\n১৪. খ (ক্ষেত্রফলের ত্রুটি = ২ × ২% = ৪%)'}
                className="w-full p-3 rounded-xl bg-white border border-[#E8ECF3] text-xs text-[#172033] focus:outline-none focus:border-[#059669] leading-relaxed"
              />
            </div>
          </div>

          <div className="lg:col-span-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">
                অথবা ফাইল আপলোড (.pdf, .docx, .txt)
              </label>
              <label className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F7F8FC] hover:bg-[#EEF2FF]/50 cursor-pointer text-center transition-colors min-h-[86px]">
                <Upload className="w-4 h-4 text-[#4F46E5] mb-1" />
                <span className="text-xs font-semibold text-[#172033] truncate max-w-full">
                  {selectedFile ? selectedFile.name : 'PDF, DOCX বা TXT বেছে নিন'}
                </span>
                <span className="text-[11px] text-[#64748B]">সর্বোচ্চ ১০ MB</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-xs text-red-600 hover:underline mt-1"
                >
                  ফাইল সরান
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  বিষয়
                </label>
                <select
                  value={defaultSubjectId}
                  onChange={(e) =>
                    setDefaultSubjectId(e.target.value as SubjectId)
                  }
                  className="w-full min-h-[36px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
                >
                  <option value="physics">Physics</option>
                  <option value="chemistry">Chemistry</option>
                  <option value="math">Mathematics</option>
                  <option value="biology">Biology</option>
                  <option value="english">English</option>
                  <option value="ict">ICT</option>
                  <option value="gk">General Knowledge</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  ভর্তি ক্যাটাগরি
                </label>
                <select
                  value={defaultAdmissionCategory}
                  onChange={(e) => {
                    const cat = e.target.value as AdmissionCategory;
                    setDefaultAdmissionCategory(cat);
                    setDefaultUniversityTag(cat as UniversityTrack);
                  }}
                  className="w-full min-h-[36px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
                >
                  {ADMISSION_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'DU Ka' ? 'DU Ka (ঢাবি ক)' : cat === 'DU Kha' ? 'DU Kha (ঢাবি খ)' : cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  নম্বর (Marks)
                </label>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={10}
                  value={defaultMarks}
                  onChange={(e) => setDefaultMarks(Number(e.target.value))}
                  className="w-full min-h-[36px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
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
                  max={2}
                  value={defaultNegativeMarking}
                  onChange={(e) =>
                    setDefaultNegativeMarking(Number(e.target.value))
                  }
                  className="w-full min-h-[36px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={defaultSourceName}
                onChange={(e) => setDefaultSourceName(e.target.value)}
                placeholder="উৎস (যেমন: DU Ka)"
                className="min-h-[36px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
              />
              <input
                type="text"
                value={defaultSourceYear}
                onChange={(e) => setDefaultSourceYear(e.target.value)}
                placeholder="বছর (2023-24)"
                className="min-h-[36px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E8ECF3]">
          <p className="text-xs text-[#64748B]">
            নির্ভুলতা নিয়ম: উত্তর না থাকলে প্রশ্ন{' '}
            <span className="font-semibold text-[#B45309]">Needs Review</span>{' '}
            হিসেবে আলাদা থাকবে এবং কখনোই শিক্ষার্থী অ্যাপে স্বয়ংক্রিয়ভাবে প্রকাশিত হবে না।
          </p>
          <button
            type="submit"
            disabled={analyzing}
            className="min-h-[42px] px-5 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileUp className="w-4 h-4" />
            )}
            <span>
              {analyzing
                ? 'Processing · AI দিয়ে প্রশ্ন বিশ্লেষণ চলছে...'
                : 'Generate Questions · AI দিয়ে প্রশ্ন তৈরি করুন'}
            </span>
          </button>
        </div>

        {analyzing && (
          <div className="rounded-xl bg-[#ECFEFF] border border-[#0891B2]/25 px-4 py-3 text-xs text-[#0E7490] flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>
              <strong>Processing:</strong> প্রশ্ন আলাদা করা, KaTeX গণিত ফরম্যাটিং এবং উৎস উত্তরমালা যাচাই চলছে...
            </span>
          </div>
        )}
      </form>

      {/* Queue Filter & Bulk Action Toolbar */}
      <div className="bg-white border border-[#E8ECF3] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['active', `সক্রিয় কিউ (${activeItems.length})`],
                ['Needs Review', `রিভিউ প্রয়োজন (${needsReviewItems.length})`],
                ['Draft', `ড্রাফট (${draftItems.length})`],
                ['Approved', `অনুমোদিত (${approvedStagedItems.length})`],
                ['Rejected', `প্রত্যাখ্যাত (${rejectedItems.length})`],
              ] as Array<[QueueTab, string]>
            ).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                onClick={() => setQueueTab(tabId)}
                className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-semibold transition-colors ${
                  queueTab === tabId
                    ? 'bg-[#4F46E5] text-white'
                    : 'bg-[#F7F8FC] text-[#64748B] hover:text-[#172033] border border-[#E8ECF3]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {visibleItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const visibleIds = visibleItems.map((i) => i.id);
                  const allSelected = visibleIds.every((id) =>
                    selectedIds.includes(id)
                  );
                  setSelectedIds(allSelected ? [] : visibleIds);
                }}
                className="min-h-[36px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#172033]"
              >
                {visibleItems.every((i) => selectedIds.includes(i.id))
                  ? 'নির্বাচন বাতিল'
                  : 'সব নির্বাচন করুন'}
              </button>
            )}

            <button
              type="button"
              disabled={busyAction || visibleItems.length === 0}
              onClick={() => setAnswerDrawerOpen((o) => !o)}
              className="min-h-[36px] px-3.5 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A]/70 disabled:opacity-45 border border-[#F59E0B]/40 text-[#92400E] text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="কিউতে থাকা প্রশ্নগুলোর জন্য একসাথে উত্তরমালা পেস্ট করুন"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>উত্তরমালা পেস্ট করে ম্যাচ করুন</span>
            </button>

            <button
              type="button"
              disabled={busyAction || validDraftItems.length === 0}
              onClick={() => handleBulkApproveValid(false)}
              className="min-h-[36px] px-3.5 rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] disabled:opacity-45 text-[#4F46E5] border border-[#4F46E5]/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Needs Review প্রশ্ন বাদ রেখে সব বৈধ Draft অনুমোদন করে"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>সব বৈধ অনুমোদন ({validDraftItems.length})</span>
            </button>

            <button
              type="button"
              disabled={busyAction || validDraftItems.length === 0}
              onClick={() => handleBulkApproveValid(true)}
              className="min-h-[36px] px-3.5 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-45 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="সব বৈধ প্রশ্ন অনুমোদন করে সরাসরি লাইভ প্রশ্ন ব্যাংকে প্রকাশ করে"
            >
              <Send className="w-3.5 h-3.5" />
              <span>সব অনুমোদন ও প্রকাশ ({validDraftItems.length})</span>
            </button>

            {approvedStagedItems.length > 0 && (
              <button
                type="button"
                disabled={busyAction}
                onClick={handleBulkPublishApproved}
                className="min-h-[36px] px-3.5 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-45 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>অনুমোদিত প্রকাশ ({approvedStagedItems.length})</span>
              </button>
            )}

            <button
              type="button"
              disabled={busyAction || activeItems.length === 0}
              onClick={openAssignModal}
              className="min-h-[36px] px-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-45 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                পরীক্ষায় যুক্ত করুন
                {selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
              </span>
            </button>
          </div>
        </div>

        {/* Batch Answer Key Matcher Drawer */}
        {answerDrawerOpen && (
          <form
            onSubmit={handleApplyQueueAnswerKey}
            className="rounded-xl bg-[#FFFDF7] border border-[#F59E0B]/40 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[#172033] flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#B45309]" />
                  <span>
                    উত্তরমালা পেস্ট করুন (
                    {selectedIds.length > 0
                      ? `নির্বাচিত ${selectedIds.length}টি প্রশ্ন`
                      : `বর্তমান তালিকার ${visibleItems.length}টি প্রশ্ন`}
                    )
                  </span>
                </h3>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  প্রশ্ন নম্বর অনুযায়ী (যেমন ১৩. খ, ১৪. গ) অথবা তালিকার ক্রম অনুযায়ী (A, C, B, D বা ক, খ, গ, ঘ) পেস্ট করলে সব প্রশ্নে সঠিক উত্তর ও ব্যাখ্যা যুক্ত হয়ে যাবে।
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAnswerDrawerOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#172033]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={4}
              value={queueAnswerKeyText}
              onChange={(e) => setQueueAnswerKeyText(e.target.value)}
              placeholder={'১. ক  ২. গ  ৩. খ  ৪. ঘ\nঅথবা:\n১৩. খ — ব্যাখ্যা: [MLT^-2]\n১৪. খ — ক্ষেত্রফলের ত্রুটি ৪%'}
              className="w-full p-3 rounded-xl bg-white border border-[#E8ECF3] text-xs text-[#172033] focus:outline-none focus:border-[#4F46E5]"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnswerDrawerOpen(false)}
                className="min-h-[36px] px-3.5 rounded-xl bg-white border border-[#E8ECF3] text-xs font-semibold text-[#64748B]"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="min-h-[36px] px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>সব প্রশ্নে উত্তর যুক্ত করুন</span>
              </button>
            </div>
          </form>
        )}

        {/* Staged Questions List */}
        {loadingQueue ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            রিভিউ কিউ লোড হচ্ছে...
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="p-10 text-center bg-[#F7F8FC] rounded-xl border border-[#E8ECF3]">
            <CopyCheck className="w-8 h-8 text-[#059669] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#172033]">
              এই ফিল্টারে কোনো প্রশ্ন নেই
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              নতুন প্রশ্ন আনতে উপরে টেক্সট পেস্ট করুন অথবা PDF/DOCX/TXT ফাইল আপলোড করুন।
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleItems.map((item, idx) => {
              const mode = cardMode[item.id] ?? 'preview';
              const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.Draft;
              const isChecked = selectedIds.includes(item.id);
              const hasAnswer =
                item.correctIndex !== null &&
                item.correctIndex >= 0 &&
                item.correctIndex <= 3;

              return (
                <div
                  key={item.id}
                  className={`border rounded-2xl p-4 sm:p-5 space-y-3.5 transition-colors ${
                    item.isDuplicate
                      ? 'border-red-300 bg-[#FFFBFB]'
                      : item.status === 'Needs Review'
                        ? 'border-[#F59E0B]/60 bg-[#FFFDF7]'
                        : 'border-[#E8ECF3] bg-white'
                  }`}
                >
                  {/* Card Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E8ECF3]">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(item.id)}
                        className="accent-[#4F46E5] w-4 h-4"
                        aria-label={`প্রশ্ন ${idx + 1} নির্বাচন`}
                      />
                      <span className="font-mono-num font-bold text-[#172033]">
                        প্রশ্ন #{idx + 1}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[#4F46E5] font-semibold">
                        {item.subjectName} · {item.admissionCategory}
                      </span>
                      <span className="text-[#64748B]">
                        {item.chapter}
                        {item.topic ? ` (${item.topic})` : ''}
                      </span>
                      {item.isDuplicate && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                          সম্ভাব্য ডুপ্লিকেট
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#F7F8FC] border border-[#E8ECF3]">
                        <button
                          type="button"
                          onClick={() =>
                            setCardMode((p) => ({ ...p, [item.id]: 'preview' }))
                          }
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                            mode === 'preview'
                              ? 'bg-white text-[#4F46E5] shadow-xs'
                              : 'text-[#64748B]'
                          }`}
                        >
                          <Eye className="w-3 h-3" />
                          <span>প্রিভিউ</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCardMode((p) => ({ ...p, [item.id]: 'raw' }))
                          }
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                            mode === 'raw'
                              ? 'bg-white text-[#4F46E5] shadow-xs'
                              : 'text-[#64748B]'
                          }`}
                        >
                          <FileText className="w-3 h-3" />
                          <span>মূল লেখা</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCardMode((p) => ({ ...p, [item.id]: 'edit' }))
                          }
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                            mode === 'edit'
                              ? 'bg-white text-[#4F46E5] shadow-xs'
                              : 'text-[#64748B]'
                          }`}
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>এডিট</span>
                        </button>
                      </div>

                      {item.status !== 'Approved' &&
                        item.status !== 'Published' && (
                          <button
                            type="button"
                            disabled={busyAction || !hasAnswer}
                            onClick={() => handleApproveSingle(item, false)}
                            className="min-h-[30px] px-2.5 rounded-lg bg-[#EEF2FF] hover:bg-[#E0E7FF] disabled:opacity-45 text-[#4F46E5] text-xs font-semibold flex items-center gap-1"
                          >
                            <BookCheck className="w-3.5 h-3.5" />
                            <span>অনুমোদন</span>
                          </button>
                        )}

                      {item.status !== 'Published' && (
                        <button
                          type="button"
                          disabled={busyAction || !hasAnswer}
                          onClick={() => handleApproveSingle(item, true)}
                          className="min-h-[30px] px-2.5 rounded-lg bg-[#059669] hover:bg-[#047857] disabled:opacity-45 text-white text-xs font-semibold flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>অনুমোদন ও প্রকাশ</span>
                        </button>
                      )}

                      {item.status !== 'Rejected' && (
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => handleRejectItem(item.id)}
                          className="min-h-[30px] px-2.5 rounded-lg bg-[#FEF2F2] hover:bg-red-100 text-red-600 text-xs font-semibold flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>প্রত্যাখ্যান</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-red-600 hover:bg-[#FEF2F2]"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Warnings */}
                  {(item.reviewReason || item.validationWarnings.length > 0) && (
                    <div className="rounded-xl bg-[#FEF3C7]/70 border border-[#F59E0B]/30 px-3.5 py-2.5 text-xs text-[#92400E] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {item.reviewReason || 'রিভিউ সতর্কতা'}
                        </span>
                        {item.isDuplicate && (
                          <button
                            type="button"
                            onClick={() => handleSaveItem(item, true)}
                            className="text-[11px] font-semibold text-[#4F46E5] hover:underline"
                          >
                            ডুপ্লিকেট নয় — চিহ্ন সরান
                          </button>
                        )}
                      </div>
                      {item.duplicateMatchPrompt && (
                        <p className="text-[11px] text-[#78350F]">
                          মিল পাওয়া প্রশ্ন: &ldquo;{item.duplicateMatchPrompt.slice(0, 140)}&rdquo;
                        </p>
                      )}
                      {item.validationWarnings.length > 0 && (
                        <p className="text-[11px] text-[#78350F]">
                          {item.validationWarnings.join(' · ')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Mode 1: Exam-Paper KaTeX Preview */}
                  {mode === 'preview' && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-[#E8ECF3] bg-[#FDFEFF] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-dashed border-[#CBD5E1] text-xs">
                          <span className="font-display font-bold text-[#172033]">
                            প্রশ্ন {idx + 1}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
                            <span>{item.difficulty}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`font-semibold ${
                                item.answerConfidence === 'explicit' && hasAnswer
                                  ? 'text-[#059669]'
                                  : 'text-[#B45309]'
                              }`}
                            >
                              {item.answerConfidence === 'explicit' && hasAnswer
                                ? 'উৎস-নিশ্চিত (Explicit Answer)'
                                : 'অনিশ্চিত — ম্যানুয়াল রিভিউ প্রয়োজন'}
                            </span>
                          </div>
                        </div>

                        <div className="text-[15px] font-medium text-[#172033] leading-[1.7]">
                          <MathText text={item.prompt} />
                        </div>
                        {item.promptBn && item.promptBn !== item.prompt && (
                          <div className="text-xs text-[#64748B] leading-relaxed">
                            <MathText text={item.promptBn} />
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {item.options.map((opt, oIdx) => {
                            const isAns = item.correctIndex === oIdx;
                            return (
                              <div
                                key={oIdx}
                                className={`px-3 py-2 rounded-xl border text-xs sm:text-[13px] flex items-center gap-2.5 ${
                                  isAns
                                    ? 'bg-[#ECFDF5] border-[#059669]/50 text-[#065F46] font-semibold'
                                    : 'bg-[#F7F8FC] border-[#E8ECF3] text-[#172033]'
                                }`}
                              >
                                <span className="font-mono-num font-bold shrink-0">
                                  {isAns ? '◉' : '◯'} {String.fromCharCode(65 + oIdx)}.
                                </span>
                                <span className="break-words">
                                  <MathText text={opt || '—'} />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] px-3.5 py-2.5 text-xs space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[#172033]">
                            সঠিক উত্তর (শুধু অ্যাডমিনের জন্য):{' '}
                            {hasAnswer ? (
                              <span className="text-[#059669]">
                                অপশন {String.fromCharCode(65 + (item.correctIndex as number))}
                              </span>
                            ) : (
                              <span className="text-[#B45309]">
                                উত্তর নেই — নিচ থেকে বাছাই করুন বা উত্তরমালা পেস্ট করুন
                              </span>
                            )}
                          </span>
                          <span className="font-mono-num text-[#64748B]">
                            নম্বর: +{item.marks} / -{item.negativeMarking}
                            {item.sourceName ? ` · ${item.sourceName}` : ''}
                            {item.sourceYear ? ` (${item.sourceYear})` : ''}
                          </span>
                        </div>
                        {!hasAnswer && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#E8ECF3]">
                            <span className="text-[11px] font-semibold text-[#64748B] mr-1">
                              দ্রুত সঠিক উত্তর সেট করুন:
                            </span>
                            {[0, 1, 2, 3].map((optIdx) => (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={savingId === item.id}
                                onClick={() => handleQuickPickAnswer(item, optIdx)}
                                className="min-h-[30px] px-3 rounded-lg bg-white hover:bg-[#ECFDF5] hover:border-[#059669] hover:text-[#059669] border border-[#E8ECF3] font-mono-num text-xs font-bold text-[#172033] transition-colors"
                              >
                                {String.fromCharCode(65 + optIdx)} ({['ক', 'খ', 'গ', 'ঘ'][optIdx]})
                              </button>
                            ))}
                          </div>
                        )}
                        {(item.explanationBn || item.explanationEn) && (
                          <div className="text-[#64748B] leading-relaxed pt-1 border-t border-[#E8ECF3]">
                            <MathText
                              text={item.explanationBn || item.explanationEn}
                            />
                          </div>
                        )}
                        {item.rawOriginal && (
                          <details className="pt-1 border-t border-[#E8ECF3]">
                            <summary className="cursor-pointer text-[11px] font-semibold text-[#4F46E5] select-none">
                              মূল প্রশ্ন (Raw Original) দেখুন
                            </summary>
                            <pre className="mt-1.5 text-[11px] text-[#475569] whitespace-pre-wrap font-mono-num leading-relaxed bg-white border border-[#E8ECF3] rounded-lg p-2.5">
                              {item.rawOriginal}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Raw Original Text */}
                  {mode === 'raw' && (
                    <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-4 space-y-2">
                      <p className="text-xs font-semibold text-[#64748B]">
                        ইনপুট থেকে প্রাপ্ত মূল টেক্সট (Raw Original):
                      </p>
                      <pre className="text-xs text-[#172033] whitespace-pre-wrap font-mono-num leading-relaxed">
                        {item.rawOriginal || item.prompt}
                      </pre>
                    </div>
                  )}

                  {/* Mode 3: Full Inline Editor */}
                  {mode === 'edit' && (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                        <select
                          value={item.subjectId}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              subjectId: e.target.value as SubjectId,
                            })
                          }
                          className="min-h-[36px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                        >
                          <option value="physics">Physics</option>
                          <option value="chemistry">Chemistry</option>
                          <option value="math">Mathematics</option>
                          <option value="biology">Biology</option>
                          <option value="english">English</option>
                          <option value="ict">ICT</option>
                          <option value="gk">General Knowledge</option>
                        </select>

                        <select
                          value={item.admissionCategory}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              admissionCategory: e.target.value,
                              universityTag: e.target.value as UniversityTrack,
                            })
                          }
                          className="min-h-[36px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                        >
                          {ADMISSION_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c === 'DU Ka' ? 'DU Ka (ঢাবি ক)' : c === 'DU Kha' ? 'DU Kha (ঢাবি খ)' : c}
                            </option>
                          ))}
                        </select>

                        <select
                          value={item.difficulty}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              difficulty: e.target.value as
                                | 'Foundation'
                                | 'Standard'
                                | 'Admission Hard',
                            })
                          }
                          aria-label="কঠিনতার স্তর"
                          className="min-h-[36px] px-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                        >
                          <option value="Foundation">Foundation</option>
                          <option value="Standard">Standard</option>
                          <option value="Admission Hard">Admission Hard</option>
                        </select>

                        <input
                          type="text"
                          value={item.chapter}
                          onChange={(e) =>
                            updateLocalItem(item.id, { chapter: e.target.value })
                          }
                          placeholder="অধ্যায়"
                          className="min-h-[36px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                        />

                        <input
                          type="text"
                          value={item.topic}
                          onChange={(e) =>
                            updateLocalItem(item.id, { topic: e.target.value })
                          }
                          placeholder="টপিক"
                          className="min-h-[36px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                        />

                        <input
                          type="number"
                          step={0.5}
                          min={0.5}
                          value={item.marks}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              marks: Number(e.target.value),
                            })
                          }
                          placeholder="নম্বর"
                          className="min-h-[36px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
                        />

                        <input
                          type="number"
                          step={0.05}
                          min={0}
                          value={item.negativeMarking}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              negativeMarking: Number(e.target.value),
                            })
                          }
                          placeholder="নেগেটিভ"
                          className="min-h-[36px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
                        />
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                        <textarea
                          rows={2}
                          value={item.prompt}
                          onChange={(e) =>
                            updateLocalItem(item.id, { prompt: e.target.value })
                          }
                          placeholder="মূল প্রশ্ন (LaTeX $...$ সহ)..."
                          className="w-full p-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
                        />
                        <textarea
                          rows={2}
                          value={item.promptBn}
                          onChange={(e) =>
                            updateLocalItem(item.id, { promptBn: e.target.value })
                          }
                          placeholder="বাংলা প্রশ্ন (ঐচ্ছিক)..."
                          className="w-full p-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {item.options.map((opt, optIdx) => {
                          const isCorrect = item.correctIndex === optIdx;
                          return (
                            <div
                              key={optIdx}
                              className={`flex items-center gap-2 p-2 rounded-xl border ${
                                isCorrect
                                  ? 'bg-[#ECFDF5] border-[#059669]/50'
                                  : 'bg-[#F7F8FC] border-[#E8ECF3]'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  updateLocalItem(item.id, {
                                    correctIndex: optIdx,
                                    answerConfidence: 'explicit',
                                  })
                                }
                                className={`w-7 h-7 rounded-lg font-mono-num text-xs font-bold shrink-0 transition-colors ${
                                  isCorrect
                                    ? 'bg-[#059669] text-white'
                                    : 'bg-white border border-[#E8ECF3] text-[#64748B] hover:border-[#4F46E5]'
                                }`}
                                title="সঠিক উত্তর হিসেবে চিহ্নিত করুন"
                              >
                                {String.fromCharCode(65 + optIdx)}
                              </button>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const nextOpts = [...item.options] as [
                                    string,
                                    string,
                                    string,
                                    string,
                                  ];
                                  nextOpts[optIdx] = e.target.value;
                                  updateLocalItem(item.id, { options: nextOpts });
                                }}
                                placeholder={`অপশন ${String.fromCharCode(65 + optIdx)}`}
                                className="flex-1 bg-transparent text-xs text-[#172033] focus:outline-none"
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={item.sourceName}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              sourceName: e.target.value,
                            })
                          }
                          placeholder="উৎস"
                          className="min-h-[36px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                        />
                        <input
                          type="text"
                          value={item.sourceYear}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              sourceYear: e.target.value,
                            })
                          }
                          placeholder="বছর"
                          className="min-h-[36px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
                        />
                        <input
                          type="text"
                          value={item.explanationEn}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              explanationEn: e.target.value,
                            })
                          }
                          placeholder="ইংরেজি ব্যাখ্যা"
                          className="min-h-[36px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                        />
                        <input
                          type="text"
                          value={item.explanationBn}
                          onChange={(e) =>
                            updateLocalItem(item.id, {
                              explanationBn: e.target.value,
                            })
                          }
                          placeholder="বাংলা ব্যাখ্যা"
                          className="min-h-[36px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {item.correctIndex !== null && (
                          <button
                            type="button"
                            onClick={() =>
                              updateLocalItem(item.id, {
                                correctIndex: null,
                                answerConfidence: 'uncertain',
                              })
                            }
                            className="min-h-[36px] px-3 rounded-xl bg-[#FEF3C7] border border-[#F59E0B]/40 text-xs font-semibold text-[#B45309]"
                          >
                            উত্তর অনিশ্চিত করুন (Needs Review)
                          </button>
                        )}
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            type="button"
                            onClick={() =>
                              setCardMode((p) => ({ ...p, [item.id]: 'preview' }))
                            }
                            className="min-h-[36px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#64748B]"
                          >
                            বাতিল
                          </button>
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            onClick={() => handleSaveItem(item)}
                            className="min-h-[36px] px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>
                              {savingId === item.id ? 'সংরক্ষণ হচ্ছে...' : 'পরিবর্তন সংরক্ষণ করুন'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign to Exam Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAssignSubmit}
            className="bg-white border border-[#E8ECF3] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E8ECF3]">
              <div>
                <h3 className="font-display text-base font-semibold text-[#172033]">
                  নির্বাচিত প্রশ্ন পরীক্ষায় যুক্ত করুন ({selectedIds.length}টি)
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  যুক্ত করার সাথে সাথে প্রশ্নগুলো Published অবস্থায় প্রকাশিত হবে।
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 p-1 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3]">
              <button
                type="button"
                onClick={() => setAssignMode('new')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
                  assignMode === 'new'
                    ? 'bg-white text-[#4F46E5] shadow-xs'
                    : 'text-[#64748B]'
                }`}
              >
                নতুন পরীক্ষা তৈরি করুন
              </button>
              <button
                type="button"
                onClick={() => setAssignMode('existing')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
                  assignMode === 'existing'
                    ? 'bg-white text-[#4F46E5] shadow-xs'
                    : 'text-[#64748B]'
                }`}
              >
                বিদ্যমান পরীক্ষায় যোগ করুন
              </button>
            </div>

            {assignMode === 'existing' ? (
              exams.length === 0 ? (
                <p className="text-xs text-[#64748B] bg-[#F7F8FC] rounded-xl p-4">
                  এখনো কোনো বিদ্যমান পরীক্ষা নেই। নতুন পরীক্ষা তৈরি ট্যাব ব্যবহার করুন।
                </p>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    পরীক্ষা নির্বাচন করুন
                  </label>
                  <select
                    value={targetExamId}
                    onChange={(e) => setTargetExamId(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({ex.universityTrack} · {ex.questionIds.length} প্রশ্ন)
                      </option>
                    ))}
                  </select>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  required
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  placeholder="নতুন পরীক্ষার নাম (যেমন: DU Ka Unit Model Test 01)"
                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={newExamTrack}
                    onChange={(e) =>
                      setNewExamTrack(e.target.value as UniversityTrack)
                    }
                    className="min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs"
                  >
                    <option value="DU Ka">DU Ka (ঢাবি ক)</option>
                    <option value="DU Kha">DU Kha (ঢাবি খ)</option>
                    <option value="GST">GST</option>
                    <option value="BUET">BUET</option>
                    <option value="Medical">Medical</option>
                    <option value="Rajshahi University">Rajshahi University</option>
                    <option value="Jahangirnagar University">
                      Jahangirnagar University
                    </option>
                    <option value="Chittagong University">
                      Chittagong University
                    </option>
                    <option value="Engineering">Engineering</option>
                    <option value="Physics 1st Paper">Physics 1st Paper</option>
                    <option value="Physics 2nd Paper">Physics 2nd Paper</option>
                    <option value="Chemistry 1st Paper">Chemistry 1st Paper</option>
                    <option value="Chemistry 2nd Paper">Chemistry 2nd Paper</option>
                    <option value="Biology 1st Paper">Biology 1st Paper</option>
                    <option value="Biology 2nd Paper">Biology 2nd Paper</option>
                    <option value="Mathematics 1st Paper">Mathematics 1st Paper</option>
                    <option value="Mathematics 2nd Paper">Mathematics 2nd Paper</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={newExamDuration}
                    onChange={(e) => setNewExamDuration(Number(e.target.value))}
                    placeholder="সময় (মিনিট)"
                    className="min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
                  />
                  <input
                    type="number"
                    step={0.05}
                    min={0}
                    max={2}
                    value={newExamNegMark}
                    onChange={(e) => setNewExamNegMark(Number(e.target.value))}
                    placeholder="নেগেটিভ"
                    className="min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-mono-num"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#172033]">
                  <input
                    type="checkbox"
                    checked={newExamPublish}
                    onChange={(e) => setNewExamPublish(e.target.checked)}
                    className="accent-[#4F46E5]"
                  />
                  <span>পরীক্ষাটি এখনই লাইভ প্রকাশ করুন</span>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="min-h-[40px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#64748B]"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="min-h-[40px] px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold"
              >
                {busyAction ? 'যুক্ত হচ্ছে...' : 'পরীক্ষায় যুক্ত করুন'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
