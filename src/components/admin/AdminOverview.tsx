import React, { useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  ClipboardCheck,
  FilePlus2,
  Layers,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type { AdminOverviewPayload } from '../../types';

interface AdminOverviewProps {
  overview: AdminOverviewPayload | null;
  loading: boolean;
  onNavigateSection: (
    section:
      | 'overview'
      | 'users'
      | 'questions'
      | 'importer'
      | 'exams'
      | 'analytics'
      | 'logs'
  ) => void;
}

export function AdminOverview({
  overview,
  loading,
  onNavigateSection,
}: AdminOverviewProps) {
  const [growthMode, setGrowthMode] = useState<'daily' | 'monthly'>('daily');

  if (loading && !overview) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 rounded-2xl bg-white border border-[#E8ECF3]"
            />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-white border border-[#E8ECF3]" />
      </div>
    );
  }

  if (!overview) return null;

  const { stats, recentRegistrations, recentExamActivities, analytics } =
    overview;
  const growthSeries =
    growthMode === 'daily'
      ? analytics.dailyUserGrowth
      : analytics.monthlyUserGrowth;
  const maxGrowth = Math.max(1, ...growthSeries.map((g) => g.count));

  const kpiCards = [
    {
      label: 'মোট নিবন্ধিত শিক্ষার্থী',
      value: stats.totalRegisteredUsers.toLocaleString(),
      sub: `${stats.suspendedUsers}টি স্থগিত অ্যাকাউন্ট`,
      icon: Users,
      accent: 'text-[#4F46E5] bg-[#EEF2FF]',
    },
    {
      label: 'সক্রিয় ব্যবহারকারী',
      value: stats.activeUsers.toLocaleString(),
      sub: 'যাচাইকৃত সক্রিয় অ্যাকাউন্ট',
      icon: UserCheck,
      accent: 'text-[#059669] bg-[#ECFDF5]',
    },
    {
      label: 'আজকের নতুন নিবন্ধন',
      value: stats.newUsersToday.toLocaleString(),
      sub: 'আজ যুক্ত হয়েছেন',
      icon: UserPlus,
      accent: 'text-[#0891B2] bg-[#ECFEFF]',
    },
    {
      label: 'মোট প্রশ্ন সংখ্যা',
      value: stats.totalQuestions.toLocaleString(),
      sub: `${stats.publishedQuestions}টি প্রকাশিত · ${stats.draftQuestions}টি খসড়া/রিভিউ`,
      icon: BookOpen,
      accent: 'text-[#4F46E5] bg-[#EEF2FF]',
    },
    {
      label: 'মোট পরীক্ষা',
      value: stats.totalExams.toLocaleString(),
      sub: `${stats.totalAttempts}টি সম্পন্ন প্রচেষ্টা`,
      icon: ClipboardCheck,
      accent: 'text-[#059669] bg-[#ECFDF5]',
    },
    {
      label: 'মোট Mock Test',
      value: stats.totalMockTests.toLocaleString(),
      sub: 'লাইভ ও আসন্ন পরীক্ষা',
      icon: Layers,
      accent: 'text-[#D97706] bg-[#FEF3C7]',
    },
    {
      label: 'ভর্তি ক্যাটাগরি',
      value: stats.totalUniversities.toLocaleString(),
      sub: 'GST · DU · RU · JU · CU · Medical · Engineering',
      icon: Building2,
      accent: 'text-[#4F46E5] bg-[#EEF2FF]',
    },
    {
      label: 'AI সার্ভিস রিকোয়েস্ট',
      value: stats.aiRequestsToday.toLocaleString(),
      sub: `${stats.aiSuccessRate}% সফলতার হার`,
      icon: Sparkles,
      accent: 'text-[#0891B2] bg-[#ECFEFF]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#172033]">
            প্ল্যাটফর্ম কন্ট্রোল ড্যাশবোর্ড
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            নিবন্ধিত শিক্ষার্থী, প্রশ্ন ব্যাংক, পরীক্ষা এবং AI সিস্টেমের লাইভ ডেটাবেজ পরিসংখ্যান।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateSection('importer')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI প্রশ্ন বিল্ডার</span>
          </button>
          <button
            onClick={() => onNavigateSection('exams')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white hover:bg-[#F7F8FC] border border-[#E8ECF3] text-[#172033] text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Mock Test তৈরি করুন</span>
          </button>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white border border-[#E8ECF3] rounded-2xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(23,32,51,0.03)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#64748B]">
                  {card.label}
                </span>
                <span
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${card.accent}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
              </div>
              <p className="font-mono-num text-[26px] font-bold leading-none text-[#172033] mt-3">
                {card.value}
              </p>
              <p className="text-xs text-[#64748B] mt-2 truncate">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Platform Growth Chart + Subject Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white border border-[#E8ECF3] rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-display text-base font-semibold text-[#172033]">
                প্ল্যাটফর্ম গ্রোথ অ্যানালিটিক্স
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                SQLite ব্যবহারকারী রেকর্ড থেকে নিবন্ধনের প্রবণতা
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3]">
              <button
                onClick={() => setGrowthMode('daily')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  growthMode === 'daily'
                    ? 'bg-white text-[#4F46E5] shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                ৭ দিনের ধারা
              </button>
              <button
                onClick={() => setGrowthMode('monthly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  growthMode === 'monthly'
                    ? 'bg-white text-[#4F46E5] shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                মাসিক
              </button>
            </div>
          </div>

          <div className="h-52 flex items-end gap-2 sm:gap-3 pt-4">
            {growthSeries.map((pt) => {
              const heightPct =
                pt.count > 0
                  ? Math.max(12, Math.round((pt.count / maxGrowth) * 100))
                  : 0;
              return (
                <div
                  key={pt.label}
                  className="flex-1 flex flex-col items-center gap-2 min-w-0"
                >
                  <span className="font-mono-num text-xs font-semibold text-[#172033]">
                    {pt.count}
                  </span>
                  <div className="w-full h-36 bg-[#F7F8FC] rounded-xl flex items-end p-1 border border-[#E8ECF3]">
                    {heightPct > 0 && (
                      <div
                        className="w-full rounded-lg bg-[#4F46E5] transition-all duration-300"
                        style={{ height: `${heightPct}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-[#64748B] truncate max-w-full">
                    {pt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-[#E8ECF3] rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-[#172033]">
              বিষয়ভিত্তিক প্রশ্ন ব্যাংক
            </h2>
            <button
              onClick={() => onNavigateSection('questions')}
              className="text-xs font-semibold text-[#4F46E5] hover:underline flex items-center gap-1"
            >
              <span>পরিচালনা করুন</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {analytics.subjectQuestionDistribution.map((item) => {
              const pct = stats.totalQuestions
                ? Math.round((item.count / stats.totalQuestions) * 100)
                : 0;
              return (
                <div key={item.subjectId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#172033]">
                      {item.subjectName}
                    </span>
                    <span className="font-mono-num text-[#64748B]">
                      {item.count} MCQ · {pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F1F4FA] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#4F46E5]"
                      style={{ width: `${item.count > 0 ? Math.max(4, pct) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent User Registrations & Recent Exam Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#E8ECF3] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8ECF3] flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#172033]">
              সাম্প্রতিক ব্যবহারকারী নিবন্ধন
            </h2>
            <button
              onClick={() => onNavigateSection('users')}
              className="text-xs font-semibold text-[#4F46E5] hover:underline flex items-center gap-1"
            >
              <span>সকল ব্যবহারকারী</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-[#E8ECF3]">
            {recentRegistrations.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">
                এখনো কোনো নিবন্ধিত শিক্ষার্থী নেই।
              </div>
            ) : (
              recentRegistrations.map((u) => (
                <div
                  key={u.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F7F8FC] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#172033] truncate">
                      {u.fullName}
                    </p>
                    <p className="text-xs text-[#64748B] truncate">
                      {u.email} · {u.targetUniversity}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-semibold ${
                        u.status === 'active'
                          ? 'text-[#059669]'
                          : 'text-[#D97706]'
                      }`}
                    >
                      {u.status === 'active' ? 'সক্রিয়' : 'স্থগিত'}
                    </span>
                    <p className="text-[11px] text-[#64748B] font-mono-num mt-0.5">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-[#E8ECF3] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8ECF3] flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#172033]">
              সাম্প্রতিক পরীক্ষার কার্যক্রম
            </h2>
            <button
              onClick={() => onNavigateSection('analytics')}
              className="text-xs font-semibold text-[#4F46E5] hover:underline flex items-center gap-1"
            >
              <span>বিস্তারিত বিশ্লেষণ</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-[#E8ECF3]">
            {recentExamActivities.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">
                এখনো কোনো পরীক্ষা জমা দেওয়ার রেকর্ড পাওয়া যায়নি।
              </div>
            ) : (
              recentExamActivities.map((act) => (
                <div
                  key={act.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F7F8FC] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#172033] truncate">
                      {act.examTitle}
                    </p>
                    <p className="text-xs text-[#64748B] truncate">
                      {act.userName} · {act.universityTrack}
                    </p>
                  </div>
                  <div className="text-right shrink-0 font-mono-num">
                    <p className="text-xs font-bold text-[#059669]">
                      {act.rawScore}/{act.maxScore} ({act.accuracy}%)
                    </p>
                    <p className="text-[11px] text-[#64748B] mt-0.5">
                      {new Date(act.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
