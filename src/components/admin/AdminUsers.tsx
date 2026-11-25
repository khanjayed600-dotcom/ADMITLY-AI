import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  KeyRound,
  Search,
  ShieldBan,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import type {
  AdminUserDetail,
  AdminUserRecord,
  UniversityTrack,
} from '../../types';

interface AdminUsersProps {
  onToast: (
    tone: 'success' | 'warning' | 'info',
    title: string,
    detail?: string
  ) => void;
  onDataChanged: () => void;
}

export function AdminUsers({ onToast, onDataChanged }: AdminUsersProps) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [uniFilter, setUniFilter] = useState<'all' | UniversityTrack>('all');

  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(
    null
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resetPreview, setResetPreview] = useState<{
    email: string;
    expiresAt: string;
    resetLinkPreview: string;
  } | null>(null);

  const [confirmDeleteUser, setConfirmDeleteUser] =
    useState<AdminUserRecord | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listAdminUsers({
        search: search.trim(),
        status: statusFilter,
        dateRange: dateFilter,
        university: uniFilter,
        page,
        limit: 10,
      });
      setUsers(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      onToast(
        'warning',
        'ব্যবহারকারীর তালিকা লোড করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateFilter, uniFilter, page, onToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchUsers();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [fetchUsers]);

  const handleInspectUser = async (userId: string) => {
    setLoadingDetail(true);
    setResetPreview(null);
    try {
      const res = await api.getAdminUserDetail(userId);
      setSelectedUser(res.user);
    } catch (err) {
      onToast(
        'warning',
        'ব্যবহারকারীর প্রোফাইল লোড ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggleStatus = async (user: AdminUserRecord) => {
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    setMutatingId(user.id);
    try {
      const res = await api.updateAdminUserStatus(user.id, nextStatus);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      if (selectedUser?.id === user.id) {
        setSelectedUser((prev) =>
          prev ? { ...prev, status: nextStatus } : prev
        );
      }
      onToast(
        'success',
        nextStatus === 'suspended'
          ? 'অ্যাকাউন্ট স্থগিত করা হয়েছে'
          : 'অ্যাকাউন্ট সক্রিয় করা হয়েছে',
        user.email
      );
      onDataChanged();
    } catch (err) {
      onToast(
        'warning',
        'স্ট্যাটাস আপডেট ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setMutatingId(null);
    }
  };

  const handlePasswordReset = async (userId: string) => {
    setMutatingId(userId);
    try {
      const res = await api.resetUserPassword(userId);
      setResetPreview({
        email: res.email,
        expiresAt: res.expiresAt,
        resetLinkPreview: res.resetLinkPreview,
      });
      onToast(
        'info',
        'পাসওয়ার্ড রিসেট টোকেন তৈরি হয়েছে',
        `${res.email}-এর জন্য ১ ঘণ্টা মেয়াদ`
      );
      onDataChanged();
    } catch (err) {
      onToast(
        'warning',
        'রিসেট টোকেন তৈরি করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setMutatingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteUser) return;
    setMutatingId(confirmDeleteUser.id);
    try {
      await api.deleteAdminUser(confirmDeleteUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== confirmDeleteUser.id));
      if (selectedUser?.id === confirmDeleteUser.id) {
        setSelectedUser(null);
      }
      onToast('info', 'ব্যবহারকারী অ্যাকাউন্ট মুছে ফেলা হয়েছে', confirmDeleteUser.email);
      setConfirmDeleteUser(null);
      onDataChanged();
      fetchUsers();
    } catch (err) {
      onToast(
        'warning',
        'মুছে ফেলা সম্ভব হয়নি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setMutatingId(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      const csv = await api.downloadUsersCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admitly-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast('success', 'CSV ডাউনলোড সম্পন্ন', 'গোপনীয় পাসওয়ার্ড তথ্য বাদ দিয়ে এক্সপোর্ট করা হয়েছে।');
    } catch (err) {
      onToast(
        'warning',
        'CSV এক্সপোর্ট ব্যর্থ হয়েছে',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#172033]">
            ইউজার ম্যানেজমেন্ট
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            শিক্ষার্থীদের প্রোফাইল, পরীক্ষার অংশগ্রহণ, পড়াশোনার অগ্রগতি, অ্যাকাউন্ট স্ট্যাটাস এবং পাসওয়ার্ড রিসেট পরিচালনা করুন।
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#172033] flex items-center gap-2 self-start sm:self-auto transition-colors"
        >
          <Download className="w-4 h-4 text-[#4F46E5]" />
          <span>CSV এক্সপোর্ট করুন</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-[#E8ECF3] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2 relative">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="নাম, ইমেইল, মোবাইল বা ইউজার ID দিয়ে খুঁজুন..."
            className="w-full min-h-[40px] pl-9 pr-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
        >
          <option value="all">সকল স্ট্যাটাস</option>
          <option value="active">শুধু সক্রিয়</option>
          <option value="suspended">শুধু স্থগিত</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setPage(1);
          }}
          className="min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
        >
          <option value="all">যেকোনো নিবন্ধনের তারিখ</option>
          <option value="today">আজ নিবন্ধিত</option>
          <option value="7d">গত ৭ দিন</option>
          <option value="30d">গত ৩০ দিন</option>
        </select>

        <select
          value={uniFilter}
          onChange={(e) => {
            setUniFilter(e.target.value as 'all' | UniversityTrack);
            setPage(1);
          }}
          className="min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs text-[#172033]"
        >
          <option value="all">সকল বিশ্ববিদ্যালয়</option>
          <option value="BUET">BUET</option>
          <option value="DU Ka">DU Ka (ঢাবি ক)</option>
          <option value="DU Kha">DU Kha (ঢাবি খ)</option>
          <option value="Medical">Medical</option>
          <option value="CKRUET">CKRUET</option>
          <option value="GST">GST</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-[#E8ECF3] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E8ECF3] flex items-center justify-between text-xs text-[#64748B]">
          <span className="font-medium">
            মোট <strong className="text-[#172033] font-mono-num">{total}</strong> জনের মধ্যে{' '}
            <strong className="text-[#172033] font-mono-num">{users.length}</strong> জন দেখানো হচ্ছে
          </span>
          <span className="font-mono-num">
            পৃষ্ঠা {page} / {totalPages}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            ব্যবহারকারীর তালিকা লোড হচ্ছে...
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-[#172033]">
              কোনো ব্যবহারকারী পাওয়া যায়নি
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              অনুসন্ধানের শব্দ বা ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8ECF3] bg-[#F7F8FC] text-xs text-[#64748B]">
                  <th className="py-3 px-4 font-semibold">শিক্ষার্থী / ব্যবহারকারী</th>
                  <th className="py-3 px-4 font-semibold">ভূমিকা</th>
                  <th className="py-3 px-4 font-semibold">Target University</th>
                  <th className="py-3 px-4 font-semibold text-right">পরীক্ষা</th>
                  <th className="py-3 px-4 font-semibold text-right">সঠিকতা</th>
                  <th className="py-3 px-4 font-semibold">নিবন্ধন</th>
                  <th className="py-3 px-4 font-semibold">অবস্থা</th>
                  <th className="py-3 px-4 font-semibold text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF3] text-xs sm:text-sm">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-[#F7F8FC] transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-[#172033]">
                        {u.fullName}
                      </p>
                      <p className="text-xs text-[#64748B]">
                        {u.email}
                        {u.phone ? ` · ${u.phone}` : ''} ·{' '}
                        <span className="font-mono-num">{u.id}</span>
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-[#64748B]">
                      {u.role === 'admin' ? 'অ্যাডমিন' : 'শিক্ষার্থী'}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-[#4F46E5]">
                      {u.targetUniversity}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num text-[#172033]">
                      {u.examsCompleted}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-[#059669]">
                      {u.averageAccuracy}%
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#64748B] font-mono-num">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span
                        className={`font-semibold ${
                          u.status === 'active'
                            ? 'text-[#059669]'
                            : 'text-[#D97706]'
                        }`}
                      >
                        {u.status === 'active' ? 'সক্রিয়' : 'স্থগিত'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleInspectUser(u.id)}
                          className="p-2 rounded-lg text-[#64748B] hover:text-[#4F46E5] hover:bg-[#EEF2FF]"
                          title="প্রোফাইল দেখুন"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          disabled={mutatingId === u.id}
                          onClick={() => handleToggleStatus(u)}
                          className="p-2 rounded-lg text-[#64748B] hover:text-[#D97706] hover:bg-[#FEF3C7]"
                          title={
                            u.status === 'active'
                              ? 'অ্যাকাউন্ট স্থগিত করুন'
                              : 'অ্যাকাউন্ট সক্রিয় করুন'
                          }
                        >
                          {u.status === 'active' ? (
                            <ShieldBan className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-[#059669]" />
                          )}
                        </button>
                        <button
                          disabled={mutatingId === u.id}
                          onClick={() => setConfirmDeleteUser(u)}
                          className="p-2 rounded-lg text-[#64748B] hover:text-red-600 hover:bg-[#FEF2F2]"
                          title="অ্যাকাউন্ট মুছে ফেলুন"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-[#E8ECF3] flex items-center justify-end gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-[#E8ECF3] text-xs font-medium text-[#172033] disabled:opacity-40"
            >
              পূর্ববর্তী
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-[#E8ECF3] text-xs font-medium text-[#172033] disabled:opacity-40"
            >
              পরবর্তী
            </button>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {(selectedUser || loadingDetail) && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8ECF3] rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-y-auto shadow-2xl">
            {loadingDetail || !selectedUser ? (
              <div className="p-8 text-center text-sm text-[#64748B]">
                ব্যবহারকারীর বিস্তারিত তথ্য লোড হচ্ছে...
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E8ECF3]">
                  <div>
                    <p className="text-xs font-semibold text-[#4F46E5]">
                      {selectedUser.role === 'admin' ? 'অ্যাডমিন' : 'শিক্ষার্থী'}{' '}
                      প্রোফাইল · {selectedUser.id}
                    </p>
                    <h2 className="font-display text-xl font-bold text-[#172033] mt-1">
                      {selectedUser.fullName}
                    </h2>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {selectedUser.email}
                      {selectedUser.phone ? ` · ${selectedUser.phone}` : ''} ·{' '}
                      {selectedUser.college || '—'} ({selectedUser.division})
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="p-2 rounded-lg text-[#64748B] hover:text-[#172033] hover:bg-[#F7F8FC]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Key Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                    <span className="text-[#64748B]">Target University</span>
                    <p className="font-semibold text-[#172033] mt-1">
                      {selectedUser.targetUniversity}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                    <span className="text-[#64748B]">সামগ্রিক অগ্রগতি</span>
                    <p className="font-mono-num font-bold text-[#4F46E5] mt-1">
                      {selectedUser.overallProgress}%
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                    <span className="text-[#64748B]">নিবন্ধনের তারিখ</span>
                    <p className="font-mono-num font-semibold text-[#172033] mt-1">
                      {new Date(selectedUser.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3">
                    <span className="text-[#64748B]">সর্বশেষ লগইন</span>
                    <p className="font-mono-num font-semibold text-[#172033] mt-1">
                      {selectedUser.lastLoginAt
                        ? new Date(selectedUser.lastLoginAt).toLocaleDateString()
                        : 'কখনো নয়'}
                    </p>
                  </div>
                </div>

                {/* Subject Learning Progress */}
                <div>
                  <h3 className="text-xs font-semibold text-[#172033] mb-2">
                    বিষয়ভিত্তিক সঠিকতা
                  </h3>
                  {selectedUser.subjectProgress.length === 0 ? (
                    <p className="text-xs text-[#64748B] bg-[#F7F8FC] rounded-xl p-3 border border-[#E8ECF3]">
                      এই ব্যবহারকারীর জন্য এখনো কোনো বিষয়ভিত্তিক পরীক্ষার ফলাফল সংরক্ষিত নেই।
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {selectedUser.subjectProgress.map((sp) => (
                        <div
                          key={sp.subjectId}
                          className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-3 text-xs"
                        >
                          <p className="font-semibold text-[#172033]">
                            {sp.subjectName}
                          </p>
                          <p className="font-mono-num text-[#059669] font-bold mt-1">
                            {sp.accuracy}% ({sp.correct}/{sp.attempted})
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Exam Participation History */}
                <div>
                  <h3 className="text-xs font-semibold text-[#172033] mb-2">
                    পরীক্ষায় অংশগ্রহণের ইতিহাস ({selectedUser.attempts.length})
                  </h3>
                  {selectedUser.attempts.length === 0 ? (
                    <p className="text-xs text-[#64748B] bg-[#F7F8FC] rounded-xl p-3 border border-[#E8ECF3]">
                      এখনো কোনো পরীক্ষা সম্পন্ন করেননি।
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E8ECF3] border border-[#E8ECF3] rounded-xl overflow-hidden">
                      {selectedUser.attempts.map((att) => (
                        <div
                          key={att.id}
                          className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-white"
                        >
                          <div>
                            <p className="font-medium text-[#172033]">
                              {att.examTitle}
                            </p>
                            <p className="text-[#64748B]">
                              {att.universityTrack} ·{' '}
                              {new Date(att.submittedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="font-mono-num font-bold text-[#059669]">
                            {att.rawScore}/{att.maxScore} ({att.accuracy}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {resetPreview && (
                  <div className="rounded-xl bg-[#EEF2FF] border border-[#4F46E5]/30 p-3.5 text-xs space-y-1">
                    <p className="font-semibold text-[#4F46E5] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      এককালীন পাসওয়ার্ড রিসেট টোকেন তৈরি হয়েছে
                    </p>
                    <p className="text-[#172033]">
                      <strong>{resetPreview.email}</strong>-এর জন্য রিসেট টোকেন তৈরি হয়েছে (মেয়াদ:{' '}
                      {new Date(resetPreview.expiresAt).toLocaleTimeString()})।
                    </p>
                    <code className="block bg-white px-2.5 py-1.5 rounded-lg border border-[#E8ECF3] font-mono-num text-[11px] text-[#172033] break-all">
                      {resetPreview.resetLinkPreview}
                    </code>
                  </div>
                )}

                {/* Security Actions */}
                <div className="pt-3 border-t border-[#E8ECF3] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={mutatingId === selectedUser.id}
                      onClick={() => handleToggleStatus(selectedUser)}
                      className="min-h-[38px] px-3.5 rounded-xl border border-[#E8ECF3] bg-[#F7F8FC] hover:bg-[#EEF2FF] text-xs font-semibold text-[#172033] flex items-center gap-1.5"
                    >
                      <ShieldBan className="w-3.5 h-3.5 text-[#D97706]" />
                      <span>
                        {selectedUser.status === 'active'
                          ? 'অ্যাকাউন্ট স্থগিত করুন'
                          : 'অ্যাকাউন্ট সক্রিয় করুন'}
                      </span>
                    </button>
                    <button
                      disabled={mutatingId === selectedUser.id}
                      onClick={() => handlePasswordReset(selectedUser.id)}
                      className="min-h-[38px] px-3.5 rounded-xl border border-[#E8ECF3] bg-[#F7F8FC] hover:bg-[#EEF2FF] text-xs font-semibold text-[#172033] flex items-center gap-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-[#4F46E5]" />
                      <span>পাসওয়ার্ড রিসেট পাঠান</span>
                    </button>
                  </div>

                  <button
                    disabled={mutatingId === selectedUser.id}
                    onClick={() => setConfirmDeleteUser(selectedUser)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-[#FEF2F2] hover:bg-red-100 text-xs font-semibold text-red-700 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>অ্যাকাউন্ট মুছুন</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8ECF3] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-lg font-semibold text-[#172033]">
                  অ্যাকাউন্টটি স্থায়ীভাবে মুছে ফেলবেন?
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  এর ফলে{' '}
                  <strong className="text-[#172033]">
                    {confirmDeleteUser.fullName}
                  </strong>{' '}
                  ({confirmDeleteUser.email}) এবং তাঁর পরীক্ষার রেকর্ড ডেটাবেজ থেকে স্থায়ীভাবে মুছে যাবে।
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmDeleteUser(null)}
                className="min-h-[40px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#64748B]"
              >
                বাতিল করুন
              </button>
              <button
                disabled={mutatingId === confirmDeleteUser.id}
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
