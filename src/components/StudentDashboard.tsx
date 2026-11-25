import React, { useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileQuestion,
  Flame,
  Play,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  ContinueLearningModule,
  DailyChallenge,
  ExamConfig,
  LeaderboardEntry,
  StudentProfile,
  SubjectSummary,
  UniversityTrack,
  WeeklyPerformancePoint,
} from '../types';
import {
  Avatar,
  ProgressRing,
  SubjectComparisonChart,
  WeeklyPerformanceChart,
} from './ui/Primitives';
import { MathText } from './ui/MathText';

interface StudentDashboardProps {
  student: StudentProfile;
  subjects: SubjectSummary[];
  weeklyPerformance: WeeklyPerformancePoint[];
  continueLearning: ContinueLearningModule[];
  dailyChallenge: DailyChallenge;
  exams: ExamConfig[];
  leaderboard: LeaderboardEntry[];
  onStartExam: (exam: ExamConfig) => void;
  onAnswerDailyChallenge: (selectedIndex: number) => Promise<void>;
  onChangeTrack: (track: UniversityTrack) => Promise<void>;
  onNavigate: (
    tab: 'dashboard' | 'mentor' | 'exams' | 'results' | 'profile',
    context?: {
      topicPrompt?: string;
      mentorMode?: 'chat' | 'plan' | 'practice';
      examsSubTab?: 'mocks' | 'previous';
      profileSubTab?: 'overview' | 'leaderboard';
    }
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

function getTimeBasedGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `শুভ সকাল, ${name}!`;
  if (hour < 17) return `শুভ দুপুর, ${name}!`;
  return `শুভ সন্ধ্যা, ${name}!`;
}

export function StudentDashboard({
  student,
  subjects,
  weeklyPerformance,
  continueLearning,
  dailyChallenge,
  exams,
  leaderboard,
  onStartExam,
  onAnswerDailyChallenge,
  onChangeTrack,
  onNavigate,
}: StudentDashboardProps) {
  const [chartMetric, setChartMetric] = useState<'score' | 'accuracy'>('score');
  const [challengeLang, setChallengeLang] = useState<'bn' | 'en'>('bn');
  const [submittingChallenge, setSubmittingChallenge] = useState(false);

  const primaryExam =
    exams.find(
      (e) =>
        e.status === 'available' && e.universityTrack === student.targetTrack
    ) ?? exams.find((e) => e.status === 'available');

  const totalWeeklyMinutes = weeklyPerformance.reduce(
    (sum, p) => sum + p.minutesStudied,
    0
  );
  const studyHours = Math.floor(totalWeeklyMinutes / 60);
  const studyMins = totalWeeklyMinutes % 60;

  const topLeaderboard = leaderboard.slice(0, 4);

  const handleChallengePick = async (idx: number) => {
    if (dailyChallenge.completed || submittingChallenge) return;
    setSubmittingChallenge(true);
    try {
      await onAnswerDailyChallenge(idx);
    } finally {
      setSubmittingChallenge(false);
    }
  };

  const scrollToDailyChallenge = () => {
    const el = document.getElementById('daily-challenge-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const quickActions = [
    {
      label: 'মডেল টেস্ট শুরু করুন',
      sublabel: 'সময়বদ্ধ পূর্ণ পরীক্ষা',
      icon: Play,
      accent: 'bg-[#EEF2FF] text-[#4F46E5]',
      onClick: () =>
        primaryExam ? onStartExam(primaryExam) : onNavigate('exams'),
    },
    {
      label: 'অনুশীলন প্রশ্ন',
      sublabel: 'AI টপিক প্র্যাকটিস',
      icon: Sparkles,
      accent: 'bg-[#ECFEFF] text-[#0891B2]',
      onClick: () => onNavigate('mentor', { mentorMode: 'practice' }),
    },
    {
      label: 'আজকের চ্যালেঞ্জ',
      sublabel: dailyChallenge.completed ? 'সম্পন্ন হয়েছে' : '১টি দ্রুত MCQ',
      icon: Zap,
      accent: 'bg-[#FEF3C7] text-[#D97706]',
      onClick: scrollToDailyChallenge,
    },
    {
      label: 'বিগত বছরের প্রশ্ন',
      sublabel: 'প্রশ্ন ব্যাংক দেখুন',
      icon: FileQuestion,
      accent: 'bg-[#ECFDF5] text-[#059669]',
      onClick: () => onNavigate('exams', { examsSubTab: 'previous' }),
    },
    {
      label: 'AI মেন্টর',
      sublabel: 'বাংলা ও EN সহায়তা',
      icon: Brain,
      accent: 'bg-[#F3E8FF] text-[#6366F1]',
      onClick: () => onNavigate('mentor', { mentorMode: 'chat' }),
    },
  ];

  const weakestSubject = [...subjects]
    .filter((s) => s.solvedCount > 0 && s.weakestTopic)
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  const weakestHighlightTopic = weakestSubject?.weakestTopic ?? '';

  return (
    <div className="space-y-6">
      {/* Compact Welcome & Admission Progress Hero Card */}
      <section className="card-surface rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#4F46E5]">
                লক্ষ্য: {student.targetTrack}
              </span>
              <span className="text-xs font-medium text-[#64748B]">
                {student.college || 'HSC পরীক্ষার্থী'} · {student.hscBatch}
              </span>
            </div>

            <h1 className="font-display text-[22px] sm:text-[26px] font-bold leading-[1.3] text-[#172033] mt-2">
              {getTimeBasedGreeting(student.name)}
            </h1>
            <p className="text-[14px] leading-[1.7] text-[#64748B] mt-1.5 max-w-xl">
              {student.totalExamsCompleted > 0 ? (
                <>
                  দারুণ অগ্রগতি — আপনার গড় সঠিকতা{' '}
                  <span className="text-[#059669] font-semibold font-mono-num">
                    {student.averageAccuracy}%
                  </span>
                  {weakestHighlightTopic ? (
                    <>
                      । আজকে{' '}
                      <span className="text-[#172033] font-medium">
                        {weakestHighlightTopic}
                      </span>{' '}
                      নিয়ে ২০ মিনিট অনুশীলন করলে প্রস্তুতি আরও এগিয়ে যাবে।
                    </>
                  ) : (
                    <>। নিয়মিত অনুশীলন চালিয়ে যান।</>
                  )}
                </>
              ) : (
                <>
                  আজকের পড়াশোনা শুরু করুন! একটি দ্রুত Mock Test দিয়ে আপনার প্রস্তুতির বর্তমান অবস্থান ও দুর্বল অধ্যায়গুলো যাচাই করে নিন।
                </>
              )}
            </p>

            <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
              {TRACKS.map((track) => {
                const active = student.targetTrack === track;
                return (
                  <button
                    key={track}
                    onClick={() => onChangeTrack(track)}
                    className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#4F46E5] text-white'
                        : 'bg-[#F7F8FC] text-[#64748B] hover:text-[#172033] border border-[#E8ECF3]'
                    }`}
                  >
                    {track}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact Admission Progress Cluster */}
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-4 sm:gap-6 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-[#E8ECF3] lg:pl-6 shrink-0">
            <div className="flex items-center gap-4">
              <ProgressRing
                percent={student.overallProgress}
                size={84}
                strokeWidth={7}
                sublabel="সিলেবাস"
              />
              <div>
                <p className="text-xs font-medium text-[#64748B]">
                  প্রস্তুতির র‍্যাঙ্ক
                </p>
                <p className="font-mono-num text-xl font-bold text-[#172033] mt-0.5">
                  {student.nationalRank > 0 ? `#${student.nationalRank}` : '—'}
                  {student.totalRankedStudents > 0 && (
                    <span className="text-xs font-medium text-[#64748B] ml-1.5">
                      / {student.totalRankedStudents.toLocaleString()}
                    </span>
                  )}
                </p>
                <p className="text-xs font-medium text-[#64748B] mt-0.5 tabular-nums">
                  {student.totalExamsCompleted > 0 && student.nationalRank > 0 ? (
                    <span className="text-[#059669] font-semibold">
                      {student.rankDelta >= 0
                        ? `এই সপ্তাহে +${student.rankDelta} ধাপ উন্নতি`
                        : `এই সপ্তাহে ${student.rankDelta} ধাপ পরিবর্তন`}
                    </span>
                  ) : (
                    'এখনো র‍্যাঙ্কিং শুরু হয়নি'
                  )}
                </p>
              </div>
            </div>

            {primaryExam && (
              <button
                onClick={() => onStartExam(primaryExam)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.98] text-white text-[13px] sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0 shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>মডেল টেস্ট শুরু করুন</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 4 Compact Dashboard Metric Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card-surface rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#64748B]">
              দৈনিক অধ্যবসায়
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </span>
          </div>
          <p className="font-mono-num text-[26px] sm:text-[28px] font-bold leading-none text-[#172033] mt-3">
            {student.streakDays}{' '}
            <span className="text-sm font-medium text-[#64748B]">দিন</span>
          </p>
          <p className="text-xs text-[#64748B] mt-1.5 tabular-nums">
            সর্বোচ্চ স্ট্রিক: {student.longestStreak} দিন
          </p>
        </div>

        <div className="card-surface rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#64748B]">
              সম্পন্ন পরীক্ষা
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </span>
          </div>
          <p className="font-mono-num text-[26px] sm:text-[28px] font-bold leading-none text-[#172033] mt-3">
            {student.totalExamsCompleted}
          </p>
          <p className="text-xs text-[#64748B] mt-1.5">মডেল টেস্ট ও স্প্রিন্ট</p>
        </div>

        <div className="card-surface rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#64748B]">
              গড় সঠিকতা
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center">
              <Target className="w-4 h-4" />
            </span>
          </div>
          <p className="font-mono-num text-[26px] sm:text-[28px] font-bold leading-none text-[#172033] mt-3">
            {student.averageAccuracy}%
          </p>
          <p className="text-xs font-medium text-[#059669] mt-1.5 tabular-nums">
            পারফরম্যান্স স্কোর {student.overallScore}/100
          </p>
        </div>

        <div className="card-surface rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#64748B]">
              সপ্তাহের পড়ার সময়
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#ECFEFF] text-[#0891B2] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="font-mono-num text-[26px] sm:text-[28px] font-bold leading-none text-[#172033] mt-3">
            {studyHours}h {String(studyMins).padStart(2, '0')}m
          </p>
          <p className="text-xs text-[#64748B] mt-1.5">এই সপ্তাহে মনোযোগী সময়</p>
        </div>
      </section>

      {/* Quick Actions Strip */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[17px] sm:text-lg font-semibold text-[#172033]">
            দ্রুত অ্যাকশন
          </h2>
          <span className="text-xs text-[#64748B]">এক ক্লিকে পড়াশোনা শুরু</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {quickActions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.label}
                onClick={act.onClick}
                className="card-surface rounded-2xl p-3.5 text-left hover:border-[#4F46E5]/40 hover:-translate-y-0.5 active:scale-[0.99] transition-all flex items-center gap-3 min-h-[64px]"
              >
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${act.accent}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#172033] truncate">
                    {act.label}
                  </p>
                  <p className="text-xs text-[#64748B] truncate mt-0.5">
                    {act.sublabel}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Subject Performance Section */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[17px] sm:text-lg font-semibold text-[#172033]">
              বিষয়ভিত্তিক পারফরম্যান্স
            </h2>
            <p className="text-[13px] text-[#64748B] mt-0.5">
              HSC ভর্তি পরীক্ষার সব বিষয়ের পড়াশোনার অগ্রগতি, সঠিকতা ও দুর্বল অধ্যায়
            </p>
          </div>
          <button
            onClick={() => onNavigate('mentor', { mentorMode: 'chat' })}
            className="text-[13px] font-semibold text-[#4F46E5] hover:text-[#4338CA] flex items-center gap-1 min-h-[36px]"
          >
            <span>দুর্বল অধ্যায় ঝালিয়ে নিন</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {subjects.map((subj) => {
              const displayName =
                subj.name === 'Higher Math' ? 'Mathematics' : subj.name;
              const barColor =
                subj.mastery >= 80
                  ? 'bg-[#059669]'
                  : subj.mastery >= 70
                    ? 'bg-[#4F46E5]'
                    : 'bg-[#F59E0B]';
              const weakHighlight = subj.mastery < 75;

              return (
                <div
                  key={subj.id}
                  className="card-surface rounded-2xl p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-num font-semibold text-[#4F46E5]">
                        {subj.shortCode}
                      </span>
                      <span className="font-mono-num font-semibold text-[#64748B]">
                        {subj.accuracy}% সঠিকতা
                      </span>
                    </div>
                    <h3 className="font-display text-[16px] font-semibold text-[#172033] mt-1.5">
                      {subj.banglaName}
                    </h3>
                    <p className="text-xs font-medium text-[#64748B] mt-0.5">
                      {displayName}
                    </p>

                    <div className="mt-3.5">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium text-[#64748B]">
                          পড়াশোনার অগ্রগতি
                        </span>
                        <span className="font-mono-num text-[13px] font-semibold text-[#172033]">
                          {subj.mastery}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#F1F4FA] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${subj.mastery}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-[#E8ECF3] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span
                        className={`text-xs font-medium block ${
                          subj.solvedCount > 0 && weakHighlight
                            ? 'text-[#D97706]'
                            : 'text-[#64748B]'
                        }`}
                      >
                        {subj.solvedCount > 0
                          ? weakHighlight
                            ? 'গুরুত্ব দিন'
                            : 'দুর্বল অধ্যায়'
                          : `${subj.totalQuestions}টি প্রকাশিত প্রশ্ন`}
                      </span>
                      <p className="text-[13px] font-medium text-[#172033] truncate mt-0.5">
                        {subj.weakestTopic || 'মূল্যায়ন বাকি — পরীক্ষা দিন'}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        onNavigate('mentor', {
                          mentorMode: 'chat',
                          topicPrompt: subj.weakestTopic
                            ? `${displayName}-এর ${subj.weakestTopic} অধ্যায়টি সহজ বাংলায় উদাহরণ ও ১টি ভর্তি MCQ-সহ বুঝিয়ে দাও।`
                            : `${displayName}-এর গুরুত্বপূর্ণ ভর্তি পরীক্ষার ধারণা ও কৌশল সহজ বাংলায় বুঝিয়ে দাও।`,
                        })
                      }
                      className="min-h-[36px] px-3 rounded-lg bg-[#F7F8FC] hover:bg-[#EEF2FF] text-[#4F46E5] text-xs font-semibold shrink-0 transition-colors"
                    >
                      অনুশীলন করুন
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Clean Comparative Subject Chart */}
          <div className="lg:col-span-4 card-surface rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033]">
                বিষয়ভিত্তিক তুলনা
              </h3>
              <p className="text-[13px] text-[#64748B] mt-0.5 mb-4">
                দক্ষতা বনাম MCQ সঠিকতার হার
              </p>
              <SubjectComparisonChart subjects={subjects} />
            </div>
            <p className="text-xs text-[#64748B] pt-4 mt-4 border-t border-[#E8ECF3]">
              সবুজ ≥ ৮৫% · নীল ৭৫–৮৪% · হলুদ &lt; ৭৫%
            </p>
          </div>
        </div>
      </section>

      {/* Weekly Performance Graph & Interactive Daily Challenge */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 card-surface rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-[17px] sm:text-lg font-semibold text-[#172033]">
                সাপ্তাহিক অগ্রগতি
              </h2>
              <p className="text-[13px] text-[#64748B] mt-0.5">
                যেকোনো দিনে ট্যাপ করে স্কোর, সঠিকতা ও পড়ার সময় দেখুন
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3]">
              <button
                onClick={() => setChartMetric('score')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  chartMetric === 'score'
                    ? 'bg-white text-[#172033] shadow-sm'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                স্কোর
              </button>
              <button
                onClick={() => setChartMetric('accuracy')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  chartMetric === 'accuracy'
                    ? 'bg-white text-[#172033] shadow-sm'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                সঠিকতা
              </button>
            </div>
          </div>

          <WeeklyPerformanceChart
            data={weeklyPerformance}
            metric={chartMetric}
          />
        </div>

        {/* Daily Challenge Card */}
        <div
          id="daily-challenge-card"
          className="lg:col-span-5 card-surface rounded-2xl p-5 flex flex-col justify-between"
        >
          {!dailyChallenge.question ? (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4">
              <span className="w-11 h-11 rounded-2xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center mb-3">
                <Zap className="w-5 h-5" />
              </span>
              <h3 className="font-display text-[15px] font-semibold text-[#172033]">
                আজকের চ্যালেঞ্জ
              </h3>
              <p className="text-xs font-medium text-[#172033] mt-1">
                No questions available yet
              </p>
              <p className="text-xs text-[#64748B] mt-1 max-w-xs leading-relaxed">
                এখনো কোনো প্রকাশিত প্রশ্ন যুক্ত করা হয়নি। অ্যাডমিন প্রশ্ন প্রকাশ করলে এখানে দৈনিক চ্যালেঞ্জ দেখা যাবে।
              </p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-semibold text-[#4F46E5]">
                    আজকের চ্যালেঞ্জ · {dailyChallenge.question.universityTag}
                  </span>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#F7F8FC] border border-[#E8ECF3]">
                    <button
                      onClick={() => setChallengeLang('bn')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        challengeLang === 'bn'
                          ? 'bg-white text-[#172033] shadow-sm'
                          : 'text-[#64748B]'
                      }`}
                    >
                      বাংলা
                    </button>
                    <button
                      onClick={() => setChallengeLang('en')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        challengeLang === 'en'
                          ? 'bg-white text-[#172033] shadow-sm'
                          : 'text-[#64748B]'
                      }`}
                    >
                      EN
                    </button>
                  </div>
                </div>

                <h3 className="font-display text-[15px] font-semibold text-[#172033]">
                  {dailyChallenge.question.chapter}
                </h3>

                <div className="mt-2 text-[#172033] text-[14.5px] leading-[1.65]">
                  <MathText
                    text={
                      challengeLang === 'bn' && dailyChallenge.question.promptBn
                        ? dailyChallenge.question.promptBn
                        : dailyChallenge.question.prompt
                    }
                  />
                </div>

                <div className="mt-3.5 space-y-2">
                  {dailyChallenge.question.options.map((opt, idx) => {
                    const isSelected = dailyChallenge.selectedIndex === idx;
                    const isCorrectOpt =
                      dailyChallenge.completed &&
                      idx === dailyChallenge.correctIndex;
                    let cls =
                      'bg-[#F7F8FC] border-[#E8ECF3] text-[#172033] hover:border-[#4F46E5]/50';
                    if (dailyChallenge.completed) {
                      if (isCorrectOpt) {
                        cls =
                          'bg-[#ECFDF5] border-[#059669]/50 text-[#065F46] font-medium';
                      } else if (isSelected) {
                        cls = 'bg-[#FEF2F2] border-red-300 text-red-900';
                      } else {
                        cls = 'bg-[#F7F8FC]/60 border-[#E8ECF3] text-[#64748B]';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={dailyChallenge.completed || submittingChallenge}
                        onClick={() => handleChallengePick(idx)}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border text-left text-sm flex items-center justify-between gap-2 transition-colors ${cls}`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono-num text-xs font-semibold text-[#64748B] w-5 shrink-0">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span className="font-medium break-words">
                            <MathText text={opt} />
                          </span>
                        </span>
                        {dailyChallenge.completed && isCorrectOpt && (
                          <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                        )}
                        {dailyChallenge.completed && isSelected && !isCorrectOpt && (
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {dailyChallenge.completed ? (
                <div className="mt-4 pt-3 border-t border-[#E8ECF3]">
                  <p className="text-xs font-semibold text-[#059669]">
                    {dailyChallenge.isCorrect
                      ? 'সঠিক উত্তর — আজকের অধ্যবসায় স্ট্রিক +১ দিন বেড়েছে।'
                      : 'উত্তর পর্যালোচনা — নিচের ব্যাখ্যাটি পড়ে নিন।'}
                  </p>
                  <div className="text-[#64748B] mt-1 text-[13.5px] leading-[1.65]">
                    <MathText
                      text={
                        (challengeLang === 'bn'
                          ? dailyChallenge.explanationBn
                          : dailyChallenge.explanationEn) ||
                        dailyChallenge.explanationEn ||
                        dailyChallenge.explanationBn ||
                        ''
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#64748B] mt-3.5">
                  আজকের প্রশ্নটি সমাধান করে আপনার{' '}
                  <span className="text-[#172033] font-semibold tabular-nums">
                    {student.streakDays} দিনের
                  </span>{' '}
                  ধারাবাহিকতা বজায় রাখুন।
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Bottom 3-Column Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 card-surface rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="font-display text-[16px] font-semibold text-[#172033]">
              যেখান থেকে থেমেছিলেন
            </h2>
            <BookMarked className="w-4 h-4 text-[#4F46E5]" />
          </div>
          {continueLearning.length === 0 ? (
            <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-5 text-center space-y-2.5">
              <p className="text-xs font-medium text-[#172033]">
                এখনো কোনো অধ্যায় শুরু করা হয়নি
              </p>
              <p className="text-xs text-[#64748B]">
                Mock Test বা AI মেন্টরের সাথে পড়াশোনা শুরু করলে আপনার সাম্প্রতিক অধ্যায় এখানে দেখাবে।
              </p>
              <button
                onClick={() => onNavigate('mentor', { mentorMode: 'chat' })}
                className="min-h-[34px] px-3 rounded-lg bg-[#EEF2FF] text-[#4F46E5] text-xs font-semibold"
              >
                AI মেন্টরে যান
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#E8ECF3]">
              {continueLearning.map((mod) => (
                <button
                  key={mod.id}
                  onClick={() =>
                    onNavigate('mentor', {
                      mentorMode: 'chat',
                      topicPrompt: `"${mod.chapterTitle}" (${mod.subjectName}) অধ্যায়টি সহজ বাংলায় শর্টকাটসহ পড়া চালিয়ে যেতে চাই।`,
                    })
                  }
                  className="w-full py-3 first:pt-0 last:pb-0 text-left group flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[#64748B]">
                      <span className="text-[#4F46E5] font-semibold">
                        {mod.subjectName}
                      </span>{' '}
                      · <span className="tabular-nums">{mod.remainingMinutes} মিনিট বাকি</span>
                    </div>
                    <p className="text-[14px] font-semibold text-[#172033] group-hover:text-[#4F46E5] transition-colors mt-0.5 truncate">
                      {mod.chapterTitle}
                    </p>
                    <p className="text-[13px] text-[#64748B] truncate mt-0.5">
                      {mod.banglaSubtitle}
                    </p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-[#F1F4FA] overflow-hidden">
                      <div
                        className="h-full bg-[#4F46E5] rounded-full"
                        style={{ width: `${mod.progressPercent}%` }}
                      />
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#64748B] group-hover:text-[#4F46E5] mt-2 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 card-surface rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="font-display text-[16px] font-semibold text-[#172033]">
              আসন্ন Mock Test
            </h2>
            <button
              onClick={() => onNavigate('exams', { examsSubTab: 'mocks' })}
              className="text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA]"
            >
              সব দেখুন
            </button>
          </div>
          {exams.length === 0 ? (
            <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-5 text-center space-y-2">
              <p className="text-xs font-medium text-[#172033]">
                No exams available yet · এখনো কোনো প্রকাশিত Mock Test নেই
              </p>
              <p className="text-xs text-[#64748B]">
                অ্যাডমিন নতুন পরীক্ষা প্রকাশ করলে এখানে সরাসরি অংশগ্রহণ করতে পারবেন। এর আগে AI মেন্টরের সাথে অধ্যায়ভিত্তিক প্রস্তুতি নিতে পারেন।
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E8ECF3]">
              {exams.slice(0, 3).map((exam) => (
                <div
                  key={exam.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-[#64748B]">
                      <span className="text-[#172033] font-semibold">
                        {exam.universityTrack}
                      </span>{' '}
                      · <span className="tabular-nums">{exam.durationMinutes} মিনিট</span>
                    </div>
                    <p className="text-[14px] font-semibold text-[#172033] mt-0.5 truncate">
                      {exam.title}
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {exam.scheduledAt}
                    </p>
                  </div>
                  {exam.status === 'available' ? (
                    <button
                      onClick={() => onStartExam(exam)}
                      className="min-h-[38px] px-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shrink-0 transition-colors"
                    >
                      শুরু করুন
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-[#D97706] shrink-0">
                      শিডিউলড
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 card-surface rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-display text-[16px] font-semibold text-[#172033]">
                জাতীয় লিডারবোর্ড
              </h2>
              <button
                onClick={() =>
                  onNavigate('profile', { profileSubTab: 'leaderboard' })
                }
                className="text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA]"
              >
                পূর্ণ তালিকা
              </button>
            </div>
            {topLeaderboard.length === 0 ? (
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-5 text-center space-y-1.5">
                <p className="text-xs font-medium text-[#172033]">
                  এখনো কোনো লিডারবোর্ড র‍্যাঙ্কিং তৈরি হয়নি
                </p>
                <p className="text-xs text-[#64748B]">
                  শিক্ষার্থীরা Mock Test সম্পন্ন করলে র‍্যাঙ্কিং তালিকা এখানে আপডেট হবে।
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {topLeaderboard.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`font-mono-num text-xs w-5 font-semibold ${
                          entry.rank === 1
                            ? 'text-[#D97706]'
                            : entry.rank <= 3
                              ? 'text-[#4F46E5]'
                              : 'text-[#64748B]'
                        }`}
                      >
                        #{entry.rank}
                      </span>
                      <Avatar
                        src={entry.avatarUrl}
                        name={entry.displayName}
                        size={32}
                      />
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[#172033] truncate">
                          {entry.displayName}
                        </p>
                        <p className="text-xs text-[#64748B] truncate">
                          {entry.targetUniversity} · {entry.city}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono-num text-sm font-semibold text-[#172033]">
                        {entry.weeklyScore}
                      </p>
                      <p className="font-mono-num text-xs font-semibold text-[#059669]">
                        {entry.accuracy}% সঠিকতা
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#E8ECF3] flex items-center justify-between text-xs text-[#64748B]">
            <span className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-[#059669]" />
              <span>
                আপনার অবস্থান:{' '}
                {student.nationalRank > 0 ? `#${student.nationalRank}` : '—'}
              </span>
            </span>
            <span className="font-mono-num font-semibold text-[#172033]">
              {student.overallScore} পয়েন্ট
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
