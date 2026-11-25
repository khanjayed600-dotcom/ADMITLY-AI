import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Database,
  Edit3,
  Loader2,
  Lock,
  LogOut,
  Save,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  AiStatusInfo,
  ExamAttempt,
  LeaderboardEntry,
  StudentProfile,
  UniversityTrack,
} from '../types';
import { api } from '../services/api';
import { getFirebaseIntegrationState } from '../services/firebaseReady';
import { Avatar, ProgressRing } from './ui/Primitives';
import { LeaderboardView } from './LeaderboardView';

interface ProfileViewProps {
  student: StudentProfile;
  leaderboard: LeaderboardEntry[];
  attempts?: ExamAttempt[];
  aiStatus: AiStatusInfo;
  initialSubTab?: 'overview' | 'leaderboard';
  onChangeTrack: (track: UniversityTrack) => Promise<void>;
  onStudentUpdated: (student: StudentProfile) => void;
  onRequestLogout: () => void;
  onOpenAdminPortal: () => void;
  onToast?: (
    tone: 'success' | 'warning' | 'info',
    title: string,
    detail?: string
  ) => void;
}

const TRACKS: UniversityTrack[] = [
  'BUET',
  'DU Ka',
  'DU Kha',
  'Medical',
  'CKRUET',
  'GST',
];

const DIVISIONS = [
  'Dhaka',
  'Chattogram',
  'Rajshahi',
  'Sylhet',
  'Khulna',
  'Barishal',
  'Rangpur',
  'Mymensingh',
];

const HSC_BATCHES = ['HSC 2025', 'HSC 2026', 'HSC 2027'];

export function ProfileView({
  student,
  leaderboard,
  attempts = [],
  aiStatus,
  initialSubTab = 'overview',
  onChangeTrack,
  onStudentUpdated,
  onRequestLogout,
  onOpenAdminPortal,
  onToast,
}: ProfileViewProps) {
  const [subTab, setSubTab] = useState<'overview' | 'leaderboard'>(
    initialSubTab
  );
  const firebaseStatus = getFirebaseIntegrationState();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(student.name);
  const [editPhone, setEditPhone] = useState(student.phone ?? '');
  const [editCollege, setEditCollege] = useState(student.college ?? '');
  const [editDivision, setEditDivision] = useState(student.division || 'Dhaka');
  const [editBatch, setEditBatch] = useState(student.hscBatch || 'HSC 2026');
  const [editTrack, setEditTrack] = useState<UniversityTrack>(
    student.targetTrack
  );
  const [editSecondaryTrack, setEditSecondaryTrack] = useState<UniversityTrack>(
    student.secondaryTrack
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    setEditName(student.name);
    setEditPhone(student.phone ?? '');
    setEditCollege(student.college ?? '');
    setEditDivision(student.division || 'Dhaka');
    setEditBatch(student.hscBatch || 'HSC 2026');
    setEditTrack(student.targetTrack);
    setEditSecondaryTrack(student.secondaryTrack);
  }, [student]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await api.uploadStudentAvatar(file);
      onStudentUpdated(res.student);
      onToast?.('success', 'প্রোফাইল ছবি আপডেট হয়েছে');
    } catch (err) {
      onToast?.(
        'warning',
        'ছবি আপলোড করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    if (editName.trim().length < 2) {
      setEditError('পূর্ণ নাম কমপক্ষে ২ অক্ষরের হতে হবে।');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.updateStudentProfile({
        name: editName.trim(),
        phone: editPhone.trim(),
        college: editCollege.trim(),
        division: editDivision,
        hscBatch: editBatch,
        targetTrack: editTrack,
        secondaryTrack: editSecondaryTrack,
      });
      onStudentUpdated(res.student);
      setEditing(false);
      onToast?.('success', 'প্রোফাইল তথ্য সংরক্ষিত হয়েছে');
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'প্রোফাইল আপডেট ব্যর্থ হয়েছে।'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const formattedCreatedDate = student.createdAt
    ? new Date(student.createdAt).toLocaleDateString('bn-BD', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'তথ্য নেই';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold leading-[1.25] text-[#172033]">
            শিক্ষার্থীর প্রোফাইল ও অবস্থান
          </h1>
          <p className="text-[14px] leading-[1.65] text-[#64748B] mt-1">
            ব্যক্তিগত তথ্য সম্পাদনা, Target University নির্বাচন, পড়াশোনার পরিসংখ্যান ও জাতীয় লিডারবোর্ড দেখুন।
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-[#E8ECF3] self-start shadow-xs">
          <button
            onClick={() => setSubTab('overview')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              subTab === 'overview'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            প্রোফাইল ও সেটিংস
          </button>
          <button
            onClick={() => setSubTab('leaderboard')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              subTab === 'leaderboard'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>লিডারবোর্ড</span>
          </button>
        </div>
      </div>

      {subTab === 'leaderboard' ? (
        <LeaderboardView leaderboard={leaderboard} student={student} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Student Identity, Photo Upload & Editable Profile */}
          <div className="lg:col-span-7 space-y-5">
            <div className="card-surface rounded-2xl p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <Avatar
                      src={student.avatarUrl}
                      name={student.name}
                      size={72}
                    />
                    <label
                      className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#4F46E5] hover:bg-[#4338CA] text-white flex items-center justify-center cursor-pointer shadow-sm border-2 border-white transition-colors"
                      title="ছবি পরিবর্তন করুন"
                      aria-label="প্রোফাইল ছবি পরিবর্তন করুন"
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleAvatarChange}
                        disabled={uploadingAvatar}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-bold text-[#172033] truncate">
                      {student.name}
                    </h2>
                    <p className="text-[13.5px] text-[#64748B] truncate">
                      {student.college || 'কলেজের নাম যুক্ত করা হয়নি'} ·{' '}
                      {student.hscBatch}
                    </p>
                    <p className="text-xs text-[#4F46E5] font-semibold mt-1">
                      মূল লক্ষ্য: {student.targetTrack} · বিকল্প:{' '}
                      {student.secondaryTrack}
                    </p>
                  </div>
                </div>

                <ProgressRing
                  percent={student.overallProgress}
                  size={84}
                  strokeWidth={7}
                  sublabel="সিলেবাস"
                />
              </div>

              {/* Account Metadata */}
              <div className="mt-5 pt-4 border-t border-[#E8ECF3] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                  <span className="text-[#64748B]">ইমেইল</span>
                  <p className="font-semibold text-[#172033] mt-0.5 truncate">
                    {student.email || 'তথ্য নেই'}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                  <span className="text-[#64748B]">মোবাইল নম্বর</span>
                  <p className="font-mono-num font-semibold text-[#172033] mt-0.5">
                    {student.phone || 'যুক্ত করা হয়নি'}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                  <span className="text-[#64748B]">বিভাগ ও কলেজ</span>
                  <p className="font-semibold text-[#172033] mt-0.5 truncate">
                    {student.division} · {student.college || '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                  <span className="text-[#64748B]">অ্যাকাউন্ট তৈরির তারিখ</span>
                  <p className="font-semibold text-[#172033] mt-0.5">
                    {formattedCreatedDate}
                  </p>
                </div>
              </div>

              {/* Toggle Edit Form */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing((e) => !e);
                    setEditError(null);
                  }}
                  className="min-h-[42px] px-4 rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#4F46E5] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {editing ? (
                    <>
                      <X className="w-3.5 h-3.5" />
                      <span>সম্পাদনা বাতিল করুন</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>প্রোফাইল তথ্য এডিট করুন</span>
                    </>
                  )}
                </button>

                <label className="min-h-[42px] px-4 rounded-xl bg-[#F7F8FC] hover:bg-[#EEF2FF] border border-[#E8ECF3] text-[#172033] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">
                  <Camera className="w-3.5 h-3.5 text-[#4F46E5]" />
                  <span>
                    {uploadingAvatar ? 'আপলোড হচ্ছে...' : 'ছবি পরিবর্তন করুন'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleAvatarChange}
                    disabled={uploadingAvatar}
                    className="hidden"
                  />
                </label>
              </div>

              {editing && (
                <form
                  onSubmit={handleSaveProfile}
                  className="mt-5 pt-5 border-t border-[#E8ECF3] space-y-3.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#172033] mb-1">
                        পূর্ণ নাম
                      </label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#172033] mb-1">
                        মোবাইল নম্বর
                      </label>
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm font-mono-num text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#172033] mb-1">
                        কলেজের নাম
                      </label>
                      <input
                        type="text"
                        value={editCollege}
                        onChange={(e) => setEditCollege(e.target.value)}
                        placeholder="যেমন: Notre Dame College"
                        className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#172033] mb-1">
                        বিভাগ
                      </label>
                      <select
                        value={editDivision}
                        onChange={(e) => setEditDivision(e.target.value)}
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033]"
                      >
                        {DIVISIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#172033] mb-1">
                        HSC Batch
                      </label>
                      <select
                        value={editBatch}
                        onChange={(e) => setEditBatch(e.target.value)}
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033]"
                      >
                        {HSC_BATCHES.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#172033] mb-1">
                        Target University
                      </label>
                      <select
                        value={editTrack}
                        onChange={(e) =>
                          setEditTrack(e.target.value as UniversityTrack)
                        }
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033]"
                      >
                        {TRACKS.map((t) => (
                          <option key={t} value={t}>
                            {t === 'DU Ka' ? 'DU Ka (ঢাবি ক)' : t === 'DU Kha' ? 'DU Kha (ঢাবি খ)' : t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#172033] mb-1">
                        বিকল্প লক্ষ্য
                      </label>
                      <select
                        value={editSecondaryTrack}
                        onChange={(e) =>
                          setEditSecondaryTrack(
                            e.target.value as UniversityTrack
                          )
                        }
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033]"
                      >
                        {TRACKS.map((t) => (
                          <option key={t} value={t}>
                            {t === 'DU Ka' ? 'DU Ka (ঢাবি ক)' : t === 'DU Kha' ? 'DU Kha (ঢাবি খ)' : t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {editError && (
                    <p className="text-xs text-red-700 bg-[#FEF2F2] border border-red-200 rounded-xl px-3.5 py-2">
                      {editError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="min-h-[44px] px-5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
                  >
                    {savingProfile ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>
                      {savingProfile ? 'সংরক্ষণ হচ্ছে...' : 'পরিবর্তন সংরক্ষণ করুন'}
                    </span>
                  </button>
                </form>
              )}

              <div className="mt-6 pt-5 border-t border-[#E8ECF3]">
                <p className="text-xs font-semibold text-[#64748B] mb-2.5">
                  দ্রুত Target University পরিবর্তন করুন
                </p>
                <div className="flex flex-wrap gap-2">
                  {TRACKS.map((track) => (
                    <button
                      key={track}
                      onClick={() => onChangeTrack(track)}
                      className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold transition-colors ${
                        student.targetTrack === track
                          ? 'bg-[#4F46E5] text-white'
                          : 'bg-[#F7F8FC] text-[#64748B] hover:text-[#172033] border border-[#E8ECF3]'
                      }`}
                    >
                      {track}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Exam History Summary */}
            <div className="card-surface rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[16px] font-semibold text-[#172033]">
                  সম্প্রতি সম্পন্ন পরীক্ষা ({attempts.length})
                </h3>
              </div>
              {attempts.length === 0 ? (
                <p className="text-xs text-[#64748B] rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-4">
                  আপনি এখনো কোনো Mock Test সম্পন্ন করেননি। একটি পরীক্ষা দিলে আপনার স্কোর ও বিশ্লেষণ এখানে দেখা যাবে।
                </p>
              ) : (
                <div className="divide-y divide-[#E8ECF3]">
                  {attempts.slice(0, 5).map((att) => (
                    <div
                      key={att.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#172033] truncate">
                          {att.examTitle}
                        </p>
                        <p className="text-[#64748B] mt-0.5">
                          {att.universityTrack} ·{' '}
                          {new Date(att.submittedAt).toLocaleDateString('bn-BD')}
                        </p>
                      </div>
                      <div className="text-right font-mono-num shrink-0">
                        <p className="font-bold text-[#059669]">
                          {att.rawScore}/{att.maxScore}
                        </p>
                        <p className="text-[#64748B]">{att.accuracy}% সঠিকতা</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Platform Connections Status */}
            <div className="card-surface rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="font-display text-[16px] font-semibold text-[#172033]">
                সংযুক্ত প্ল্যাটফর্ম সেবা
              </h3>

              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#172033]">
                      Gemini AI মেন্টর ({aiStatus.model})
                    </p>
                    <p className="text-xs text-[#64748B]">
                      সার্ভার-সাইড API প্রক্সি (/api/ai/*)
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold flex items-center gap-1 shrink-0 ${
                    aiStatus.configured ? 'text-[#059669]' : 'text-[#D97706]'
                  }`}
                >
                  {aiStatus.configured && (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {aiStatus.configured ? 'সংযুক্ত' : 'API কী প্রয়োজন'}
                </span>
              </div>

              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#ECFEFF] text-[#0891B2] flex items-center justify-center shrink-0">
                    <Database className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#172033]">
                      ডাটাবেজ ও সেশন নিরাপত্তা
                    </p>
                    <p className="text-xs text-[#64748B]">
                      {firebaseStatus.configured
                        ? `সংযুক্ত: ${firebaseStatus.projectId}`
                        : 'সুরক্ষিত SQLite ডেটাবেজ ও সেশন সক্রিয়'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#4F46E5] shrink-0">
                  {firebaseStatus.configured ? 'সক্রিয়' : 'প্রস্তুত'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Snapshot, Logout & Admin Console */}
          <div className="lg:col-span-5 space-y-5">
            <div className="card-surface rounded-2xl p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-display text-[16px] font-semibold text-[#172033]">
                    প্রস্তুতির সারসংক্ষেপ
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    পরীক্ষা ও সঠিকতার পরিসংখ্যান
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[#E8ECF3] text-sm">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#64748B]">জাতীয় র‍্যাঙ্ক</span>
                  <span className="font-mono-num font-bold text-[#172033]">
                    {student.nationalRank > 0 ? `#${student.nationalRank}` : '—'}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#64748B]">গড় সঠিকতা</span>
                  <span className="font-mono-num font-bold text-[#059669]">
                    {student.averageAccuracy}%
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#64748B]">সম্পন্ন পরীক্ষা</span>
                  <span className="font-mono-num font-bold text-[#172033]">
                    {student.totalExamsCompleted}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#64748B]">সক্রিয় স্ট্রিক</span>
                  <span className="font-mono-num font-bold text-[#D97706]">
                    {student.streakDays} দিন
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onRequestLogout}
                className="mt-5 w-full min-h-[44px] px-4 rounded-xl bg-[#FEF2F2] hover:bg-red-100 border border-red-200 text-red-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>লগআউট (Logout)</span>
              </button>
            </div>

            <div className="card-surface rounded-2xl p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#F1F4FA] text-[#172033] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-display text-[16px] font-semibold text-[#172033]">
                    অ্যাডমিনিস্ট্রেটর পোর্টাল
                  </h3>
                  <p className="text-[13px] text-[#64748B] mt-1 leading-[1.65]">
                    প্রশ্ন ব্যাংক পরিচালনা, Mock Test প্রকাশ এবং ব্যবহারকারী নিয়ন্ত্রণ আলাদা সুরক্ষিত অ্যাডমিন কনসোলে সংরক্ষিত।
                  </p>
                </div>
              </div>

              <button
                onClick={onOpenAdminPortal}
                className="mt-4 w-full min-h-[44px] px-4 rounded-xl bg-[#F7F8FC] hover:bg-[#EEF2FF] border border-[#E8ECF3] text-[#172033] hover:text-[#4F46E5] text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span>অ্যাডমিন কনসোল খুলুন</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
