import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart2,
  Bell,
  Brain,
  ChevronDown,
  FileText,
  GraduationCap,
  Home,
  Loader2,
  LogOut,
  Play,
  Trophy,
  User,
} from 'lucide-react';
import type {
  AdminAuthSession,
  BootstrapPayload,
  ExamAttempt,
  ExamConfig,
  StudentAuthSession,
  StudentProfile,
  SubjectSummary,
  UniversityTrack,
} from './types';
import { api, setStudentToken } from './services/api';
import {
  Avatar,
  SkeletonScreen,
  ToastContainer,
  type ToastItem,
} from './components/ui/Primitives';
import { StudentAuthPages } from './components/auth/StudentAuthPages';
import { StudentDashboard } from './components/StudentDashboard';
import { AiMentorView } from './components/AiMentorView';
import { ExamsHub } from './components/ExamsHub';
import { ExamInterface } from './components/ExamInterface';
import { ResultAnalytics } from './components/ResultAnalytics';
import { ProfileView } from './components/ProfileView';
import { AdminDashboard } from './components/AdminDashboard';

type StudentTab = 'dashboard' | 'mentor' | 'exams' | 'results' | 'profile';

export default function App() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<StudentTab>('dashboard');
  const [activeExam, setActiveExam] = useState<ExamConfig | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    null
  );
  const [mentorInitialPrompt, setMentorInitialPrompt] = useState<
    string | undefined
  >(undefined);
  const [mentorInitialMode, setMentorInitialMode] = useState<
    'chat' | 'plan' | 'practice'
  >('chat');
  const [examsInitialSubTab, setExamsInitialSubTab] = useState<
    'mocks' | 'previous'
  >('mocks');
  const [profileInitialSubTab, setProfileInitialSubTab] = useState<
    'overview' | 'leaderboard'
  >('overview');

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [adminPortalOpen, setAdminPortalOpen] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminAuthSession | null>(
    null
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (tone: ToastItem['tone'], title: string, detail?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      setToasts((prev) => [...prev, { id, tone, title, detail }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadBootstrap = useCallback(async () => {
    const payload = await api.bootstrap();
    if (!payload?.student) {
      throw new Error('শিক্ষার্থীর প্রোফাইল তথ্য পাওয়া যায়নি।');
    }
    setData(payload);
    setLoadError(null);
    return payload;
  }, []);

  const syncStudentData = useCallback(() => {
    if (!isAuthenticated) return;
    api
      .bootstrap()
      .then((res) => {
        if (!res?.student) return;
        setData(res);
        setLoadError(null);
      })
      .catch(() => {
        // silent background sync
      });
  }, [isAuthenticated]);

  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      setLoading(true);
      try {
        const session = await api.authMe();
        if (!mounted) return;
        if (session?.authenticated && session.student) {
          setStudentToken(session.token ?? null);
          setIsAuthenticated(true);
          const payload = await api.bootstrap();
          if (!payload?.student) {
            throw new Error('শিক্ষার্থীর প্রোফাইল তথ্য পাওয়া যায়নি।');
          }
          if (mounted) {
            setData(payload);
            setLoadError(null);
          }
        } else {
          setStudentToken(null);
          setIsAuthenticated(false);
          setData(null);
        }
      } catch (err) {
        if (!mounted) return;
        const status = (err as Error & { status?: number }).status;
        if (status === 401 || status === 403) {
          setStudentToken(null);
          setIsAuthenticated(false);
          setData(null);
          setLoadError(null);
        } else {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'প্ল্যাটফর্মের তথ্য লোড করা যায়নি।'
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAuthSuccess = async (session: StudentAuthSession) => {
    setStudentToken(session.token ?? null);
    setIsAuthenticated(true);
    setLoading(true);
    setLoadError(null);
    try {
      await loadBootstrap();
      setActiveTab('dashboard');
      pushToast(
        'success',
        `স্বাগতম, ${session.student.name}!`,
        `${session.student.targetTrack} প্রস্তুতির ড্যাশবোর্ড প্রস্তুত।`
      );
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'ড্যাশবোর্ড লোড করা যায়নি।'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await api.logoutStudent().catch(() => {});
    } finally {
      setStudentToken(null);
      setIsAuthenticated(false);
      setData(null);
      setActiveExam(null);
      setSelectedAttemptId(null);
      setActiveTab('dashboard');
      setNotificationsOpen(false);
      setProfileMenuOpen(false);
      setLogoutModalOpen(false);
      setLoggingOut(false);
      pushToast('info', 'সফলভাবে লগআউট হয়েছে');
    }
  };

  const handleNavigate = useCallback(
    (
      tab: StudentTab,
      context?: {
        topicPrompt?: string;
        mentorMode?: 'chat' | 'plan' | 'practice';
        examsSubTab?: 'mocks' | 'previous';
        profileSubTab?: 'overview' | 'leaderboard';
      }
    ) => {
      if (context?.topicPrompt) {
        setMentorInitialPrompt(context.topicPrompt);
      }
      if (context?.mentorMode) {
        setMentorInitialMode(context.mentorMode);
      }
      if (context?.examsSubTab) {
        setExamsInitialSubTab(context.examsSubTab);
      }
      if (context?.profileSubTab) {
        setProfileInitialSubTab(context.profileSubTab);
      }
      setNotificationsOpen(false);
      setProfileMenuOpen(false);
      setActiveTab(tab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  const handleAnswerDailyChallenge = async (selectedIndex: number) => {
    try {
      const res = await api.answerDailyChallenge(selectedIndex);
      setData((prev) =>
        prev
          ? {
              ...prev,
              dailyChallenge: res.dailyChallenge,
              student: res.student ?? prev.student,
            }
          : prev
      );
      pushToast(
        res.dailyChallenge.isCorrect ? 'success' : 'info',
        res.dailyChallenge.isCorrect
          ? 'আজকের চ্যালেঞ্জ সঠিক হয়েছে'
          : 'আজকের চ্যালেঞ্জ পর্যালোচিত',
        res.dailyChallenge.isCorrect
          ? 'আপনার দৈনিক অধ্যবসায় স্ট্রিক +১ দিন বেড়েছে।'
          : 'শর্টকাট আয়ত্ত করতে বাংলা ব্যাখ্যাটি পড়ে নিন।'
      );
    } catch (err) {
      pushToast(
        'warning',
        'উত্তর সংরক্ষণ করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleChangeTrack = async (track: UniversityTrack) => {
    try {
      const res = await api.updateTargetTrack(track);
      if (res?.student) {
        setData((prev) => (prev ? { ...prev, student: res.student } : prev));
      }
      pushToast('info', `Target University ${track} নির্ধারণ করা হয়েছে`);
    } catch (err) {
      pushToast(
        'warning',
        'লক্ষ্য পরিবর্তন করা যায়নি',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleStudentUpdated = (updatedStudent: StudentProfile) => {
    if (!updatedStudent) return;
    setData((prev) => (prev ? { ...prev, student: updatedStudent } : prev));
  };

  const handleSubmitExam = async (payload: {
    examId: string;
    answers: Record<string, number | null>;
    markedForReview: string[];
    durationSecondsSpent: number;
    submissionId?: string;
  }) => {
    const res = await api.submitAttempt(payload);
    setData((prev) =>
      prev
        ? {
            ...prev,
            student: res.student ?? prev.student,
            subjects: res.subjects ?? prev.subjects,
            weeklyPerformance: res.weeklyPerformance ?? prev.weeklyPerformance,
            leaderboard: res.leaderboard ?? prev.leaderboard,
            attempts: res.attempts ?? prev.attempts,
          }
        : prev
    );
    setActiveExam(null);
    setSelectedAttemptId(res.attempt.id);
    setActiveTab('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    pushToast(
      'success',
      'পরীক্ষা মূল্যায়ন ও সংরক্ষণ সম্পন্ন',
      `স্কোর: ${res.attempt.rawScore}/${res.attempt.maxScore} (${res.attempt.accuracy}% সঠিকতা)`
    );
  };

  // Separate Protected Admin Portal (accessible from login footer or student profile)
  if (adminPortalOpen) {
    return (
      <>
        <AdminDashboard
          subjects={data?.subjects ?? []}
          adminSession={adminSession}
          onSessionChange={setAdminSession}
          onExitAdmin={() => setAdminPortalOpen(false)}
          onSubjectsUpdated={(subjects: SubjectSummary[]) =>
            setData((prev) => (prev ? { ...prev, subjects } : prev))
          }
          onSyncStudentData={syncStudentData}
          onToast={pushToast}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Initial Loading Skeleton before auth check finishes
  if (loading && !isAuthenticated && !loadError) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center p-6">
        <div className="w-full max-w-5xl">
          <SkeletonScreen />
        </div>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // Route Protection: Unauthenticated users see Student Login / Registration / Forgot Password
  if (!isAuthenticated && !loadError) {
    return (
      <>
        <StudentAuthPages
          onAuthSuccess={handleAuthSuccess}
          onOpenAdminPortal={() => setAdminPortalOpen(true)}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Distraction-free Exam Hall
  if (activeExam && data) {
    return (
      <>
        <ExamInterface
          exam={activeExam}
          questions={data.questions}
          onCancel={() => setActiveExam(null)}
          onSubmitExam={handleSubmitExam}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Exact 5 student destinations in Bengali (NO Admin in student bottom nav)
  const studentNavItems: Array<{
    id: StudentTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: 'হোম', mobileLabel: 'হোম', icon: Home },
    { id: 'mentor', label: 'AI মেন্টর', mobileLabel: 'AI মেন্টর', icon: Brain },
    { id: 'exams', label: 'মক টেস্ট', mobileLabel: 'মক টেস্ট', icon: FileText },
    { id: 'results', label: 'আমার ফলাফল', mobileLabel: 'ফলাফল', icon: BarChart2 },
    { id: 'profile', label: 'প্রোফাইল', mobileLabel: 'প্রোফাইল', icon: User },
  ];

  const primaryQuickExam =
    data?.exams?.find(
      (e) =>
        e.status === 'available' &&
        Boolean(data?.student?.targetTrack) &&
        e.universityTrack === data.student.targetTrack
    ) ?? data?.exams?.find((e) => e.status === 'available');

  const upcomingExam = data?.exams?.find((e) => e.status === 'upcoming');

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#172033] flex">
      {/* Clean Light Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-[#E8ECF3] px-4 py-6 justify-between z-30">
        <div>
          <button
            onClick={() => handleNavigate('dashboard')}
            className="px-2 text-left flex items-center gap-2.5 w-full"
          >
            <span className="w-9 h-9 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </span>
            <div>
              <span className="font-display text-[17px] font-bold text-[#172033] block leading-none">
                ADMITLY AI
              </span>
              <span className="text-xs font-medium text-[#64748B] block mt-1">
                স্মার্ট ভর্তি প্রস্তুতি
              </span>
            </div>
          </button>

          <nav className="mt-8 space-y-1" aria-label="শিক্ষার্থী নেভিগেশন">
            {studentNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-[14px] flex items-center gap-3 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold'
                      : 'text-[#64748B] font-medium hover:text-[#172033] hover:bg-[#F7F8FC]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {data?.student && (
          <div className="pt-4 border-t border-[#E8ECF3] space-y-2">
            <button
              onClick={() =>
                handleNavigate('profile', { profileSubTab: 'overview' })
              }
              className="w-full p-2.5 rounded-xl bg-[#F7F8FC] hover:bg-[#EEF2FF] border border-[#E8ECF3] flex items-center gap-2.5 text-left transition-colors"
            >
              <Avatar
                src={data.student.avatarUrl}
                name={data.student.name}
                size={36}
              />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#172033] truncate leading-tight">
                  {data.student.name}
                </p>
                <p className="text-xs font-normal text-[#64748B] truncate mt-0.5">
                  {data.student.targetTrack} পরীক্ষার্থী
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setLogoutModalOpen(true)}
              className="w-full min-h-[40px] px-3 rounded-xl text-xs font-semibold text-red-600 hover:bg-[#FEF2F2] flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>লগআউট</span>
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Navigation */}
        <header className="sticky top-0 z-20 h-14 sm:h-16 bg-white/95 backdrop-blur-md border-b border-[#E8ECF3] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => handleNavigate('dashboard')}
              className="lg:hidden flex items-center gap-2 shrink-0"
            >
              <span className="w-7 h-7 rounded-lg bg-[#4F46E5] text-white flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </span>
              <span className="font-display text-[15px] font-bold text-[#172033] whitespace-nowrap">
                ADMITLY AI
              </span>
            </button>

            <span className="hidden lg:inline text-[14px] font-medium text-[#64748B]">
              {studentNavItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 relative">
            {primaryQuickExam && (
              <button
                onClick={() => setActiveExam(primaryQuickExam)}
                className="min-h-[38px] px-3 sm:px-4 py-1.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs sm:text-[13px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">দ্রুত Mock Test</span>
                <span className="sm:hidden">দ্রুত পরীক্ষা</span>
              </button>
            )}

            <button
              onClick={() => {
                setProfileMenuOpen(false);
                const nextOpen = !notificationsOpen;
                setNotificationsOpen(nextOpen);
                if (
                  nextOpen &&
                  data?.notifications.some((n) => !n.isRead)
                ) {
                  api
                    .markNotificationsRead()
                    .then((res) => {
                      setData((prev) =>
                        prev ? { ...prev, notifications: res.notifications } : prev
                      );
                    })
                    .catch(() => {});
                }
              }}
              className="min-h-[38px] min-w-[38px] rounded-xl bg-[#F7F8FC] hover:bg-[#EEF2FF] border border-[#E8ECF3] text-[#64748B] hover:text-[#4F46E5] flex items-center justify-center relative transition-colors"
              aria-label="বিজ্ঞপ্তি"
            >
              <Bell className="w-4 h-4" />
              {data?.student &&
                (data.notifications?.some((n) => !n.isRead) ||
                  (!data.dailyChallenge?.completed &&
                    Boolean(data.dailyChallenge?.question))) && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#4F46E5]" />
                )}
            </button>

            {data?.student && (
              <button
                onClick={() => {
                  setNotificationsOpen(false);
                  setProfileMenuOpen((o) => !o);
                }}
                className="min-h-[38px] pl-1 pr-2 py-1 rounded-full bg-[#F7F8FC] hover:bg-[#EEF2FF] border border-[#E8ECF3] flex items-center gap-1.5 transition-colors"
                aria-label="শিক্ষার্থী মেনু খুলুন"
              >
                <Avatar
                  src={data.student.avatarUrl}
                  name={data.student.name}
                  size={30}
                />
                <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
              </button>
            )}

            {/* Notifications Popover */}
            {notificationsOpen && data?.student && (
              <div className="absolute right-0 top-12 w-72 sm:w-80 card-surface rounded-2xl p-4 shadow-xl z-40 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-display text-[13px] font-semibold text-[#172033]">
                    স্টাডি অ্যালার্ট
                  </p>
                  <button
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs font-medium text-[#64748B] hover:text-[#172033]"
                  >
                    বন্ধ করুন
                  </button>
                </div>
                <div className="divide-y divide-[#E8ECF3] text-[13px] max-h-80 overflow-y-auto">
                  {data.dailyChallenge?.question && (
                    <button
                      onClick={() => {
                        setNotificationsOpen(false);
                        handleNavigate('dashboard');
                      }}
                      className="w-full py-2.5 text-left"
                    >
                      <p className="font-semibold text-[#172033]">
                        {data.dailyChallenge.completed
                          ? 'আজকের চ্যালেঞ্জ সম্পন্ন হয়েছে'
                          : 'আজকের চ্যালেঞ্জ আপনার জন্য অপেক্ষা করছে'}
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5 tabular-nums">
                        {data.dailyChallenge.question.chapter} ·{' '}
                        {data.student.streakDays} দিনের স্ট্রিক সক্রিয়
                      </p>
                    </button>
                  )}
                  {upcomingExam && (
                    <button
                      onClick={() => {
                        setNotificationsOpen(false);
                        handleNavigate('exams', { examsSubTab: 'mocks' });
                      }}
                      className="w-full py-2.5 text-left"
                    >
                      <p className="font-semibold text-[#172033]">
                        {upcomingExam.title}
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        সময়সূচি: {upcomingExam.scheduledAt}
                      </p>
                    </button>
                  )}
                  {(data.notifications ?? []).map((notif) => (
                    <div key={notif.id} className="py-2.5 text-left">
                      <p className="font-semibold text-[#172033]">{notif.title}</p>
                      <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
                        {notif.message}
                      </p>
                    </div>
                  ))}
                  {!data.dailyChallenge?.question &&
                    !upcomingExam &&
                    (data.notifications?.length ?? 0) === 0 && (
                      <p className="py-5 text-center text-xs text-[#64748B]">
                        নতুন কোনো বিজ্ঞপ্তি নেই
                      </p>
                    )}
                </div>
              </div>
            )}

            {/* Profile Dropdown Menu */}
            {profileMenuOpen && data?.student && (
              <div className="absolute right-0 top-12 w-64 card-surface rounded-2xl p-2 shadow-xl z-40 space-y-1">
                <div className="px-3 py-2.5 border-b border-[#E8ECF3]">
                  <p className="text-sm font-semibold text-[#172033] truncate">
                    {data.student.name}
                  </p>
                  <p className="text-xs text-[#64748B] truncate mt-0.5">
                    {data.student.targetTrack} পরীক্ষার্থী
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleNavigate('profile', { profileSubTab: 'overview' })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-[#172033] hover:bg-[#F7F8FC] flex items-center gap-2.5"
                >
                  <User className="w-4 h-4 text-[#4F46E5]" />
                  <span>প্রোফাইল ও সেটিংস</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleNavigate('profile', { profileSubTab: 'leaderboard' })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-[#172033] hover:bg-[#F7F8FC] flex items-center gap-2.5"
                >
                  <Trophy className="w-4 h-4 text-[#D97706]" />
                  <span>জাতীয় লিডারবোর্ড</span>
                </button>

                <div className="pt-1 border-t border-[#E8ECF3]">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setLogoutModalOpen(true);
                    }}
                    className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-red-600 hover:bg-[#FEF2F2] flex items-center gap-2.5"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>লগআউট</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 lg:pb-12">
          {loading ? (
            <SkeletonScreen />
          ) : loadError || !data?.student ? (
            <div className="card-surface rounded-2xl p-8 text-center max-w-lg mx-auto my-12">
              <p className="text-base font-semibold text-[#172033]">
                প্ল্যাটফর্ম লোড করা যাচ্ছে না
              </p>
              <p className="text-xs text-[#64748B] mt-1">
                {loadError ?? 'সার্ভার থেকে কোনো তথ্য পাওয়া যায়নি।'}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 min-h-[44px] px-5 rounded-xl bg-[#4F46E5] text-white text-xs font-medium"
              >
                পুনরায় চেষ্টা করুন
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <StudentDashboard
                  student={data.student}
                  subjects={data.subjects}
                  weeklyPerformance={data.weeklyPerformance}
                  continueLearning={data.continueLearning}
                  dailyChallenge={data.dailyChallenge}
                  exams={data.exams}
                  leaderboard={data.leaderboard}
                  onStartExam={(exam) => setActiveExam(exam)}
                  onAnswerDailyChallenge={handleAnswerDailyChallenge}
                  onChangeTrack={handleChangeTrack}
                  onNavigate={handleNavigate}
                />
              )}

              {activeTab === 'mentor' && (
                <AiMentorView
                  student={data.student}
                  subjects={data.subjects}
                  aiStatus={data.aiStatus}
                  initialPrompt={mentorInitialPrompt}
                  initialMode={mentorInitialMode}
                  onClearInitialPrompt={() => setMentorInitialPrompt(undefined)}
                />
              )}

              {activeTab === 'exams' && (
                <ExamsHub
                  exams={data.exams}
                  questions={data.questions}
                  initialSubTab={examsInitialSubTab}
                  onStartExam={(exam) => setActiveExam(exam)}
                />
              )}

              {activeTab === 'results' && (
                <ResultAnalytics
                  attempts={data.attempts}
                  selectedAttemptId={selectedAttemptId}
                  onAttemptUpdated={(updated: ExamAttempt) => {
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            attempts: prev.attempts.map((a) =>
                              a.id === updated.id ? updated : a
                            ),
                          }
                        : prev
                    );
                  }}
                  onAskMentorTopic={(prompt) =>
                    handleNavigate('mentor', {
                      mentorMode: 'chat',
                      topicPrompt: prompt,
                    })
                  }
                />
              )}

              {activeTab === 'profile' && (
                <ProfileView
                  student={data.student}
                  leaderboard={data.leaderboard}
                  attempts={data.attempts}
                  aiStatus={data.aiStatus}
                  initialSubTab={profileInitialSubTab}
                  onChangeTrack={handleChangeTrack}
                  onStudentUpdated={handleStudentUpdated}
                  onRequestLogout={() => setLogoutModalOpen(true)}
                  onOpenAdminPortal={() => setAdminPortalOpen(true)}
                  onToast={pushToast}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar: ONLY হোম | AI মেন্টর | মক টেস্ট | ফলাফল | প্রোফাইল */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-t border-[#E8ECF3] grid grid-cols-5 items-center shadow-[0_-4px_16px_rgba(23,32,51,0.04)]"
        aria-label="মোবাইল নেভিগেশন"
      >
        {studentNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-[#4F46E5]' : 'text-[#64748B]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span
                className={`text-[11px] leading-none ${
                  active ? 'font-semibold' : 'font-medium'
                }`}
              >
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Logout Confirmation Modal */}
      {logoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-surface max-w-sm w-full rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#FEF2F2] text-red-600 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-[#172033]">
                  আপনি কি নিশ্চিতভাবে লগআউট করতে চান?
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  লগআউট করলে বর্তমান সেশনটি বন্ধ হবে এবং পুনরায় প্রবেশ করতে লগইন করতে হবে।
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setLogoutModalOpen(false)}
                className="min-h-[44px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-xs font-semibold text-[#64748B] hover:text-[#172033]"
              >
                বাতিল করুন
              </button>
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleConfirmLogout}
                className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                {loggingOut && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{loggingOut ? 'লগআউট হচ্ছে...' : 'হ্যাঁ, লগআউট করুন'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
