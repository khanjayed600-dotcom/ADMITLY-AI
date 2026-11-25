import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  FilePlus2,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { api, setAdminToken } from '../services/api';
import type {
  AdminAuthConfigStatus,
  AdminAuthSession,
  AdminOverviewPayload,
  SubjectSummary,
} from '../types';
import { AdminOverview } from './admin/AdminOverview';
import { AdminUsers } from './admin/AdminUsers';
import { AdminQuestions } from './admin/AdminQuestions';
import { AdminQuestionImporter } from './admin/AdminQuestionImporter';
import { AdminExams } from './admin/AdminExams';
import { AdminAnalytics } from './admin/AdminAnalytics';

interface AdminDashboardProps {
  subjects: SubjectSummary[];
  adminSession: AdminAuthSession | null;
  onSessionChange: (session: AdminAuthSession | null) => void;
  onExitAdmin: () => void;
  onSubjectsUpdated: (subjects: SubjectSummary[]) => void;
  onSyncStudentData: () => void;
  onToast: (
    tone: 'success' | 'warning' | 'info',
    title: string,
    detail?: string
  ) => void;
}

type AdminSection =
  | 'overview'
  | 'users'
  | 'questions'
  | 'importer'
  | 'exams'
  | 'analytics'
  | 'logs';

export function AdminDashboard({
  subjects,
  adminSession,
  onSessionChange,
  onExitAdmin,
  onSubjectsUpdated,
  onSyncStudentData,
  onToast,
}: AdminDashboardProps) {
  const [authStatus, setAuthStatus] = useState<AdminAuthConfigStatus | null>(
    null
  );
  const [authMode, setAuthMode] = useState<'login' | 'bootstrap' | 'accessCode'>(
    'login'
  );
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  const [section, setSection] = useState<AdminSection>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  useEffect(() => {
    if (adminSession?.authenticated) return;
    api
      .getAdminStatus()
      .then((st) => {
        setAuthStatus(st);
        if (!st.hasAdminAccount && !st.accessCodeConfigured) {
          setAuthMode('bootstrap');
        } else if (!st.hasAdminAccount && st.accessCodeConfigured) {
          setAuthMode('accessCode');
        } else {
          setAuthMode('login');
        }
      })
      .catch(() => {
        setAuthStatus({ hasAdminAccount: false, accessCodeConfigured: true });
        setAuthMode('accessCode');
      });
  }, [adminSession]);

  const loadOverview = useCallback(async () => {
    if (!adminSession?.authenticated) return;
    setLoadingOverview(true);
    try {
      const data = await api.getAdminOverview();
      setOverview(data);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        setAdminToken(null);
        onSessionChange(null);
      }
      onToast(
        'warning',
        'অ্যাডমিন সেশন ত্রুটি',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoadingOverview(false);
    }
  }, [adminSession, onSessionChange, onToast]);

  useEffect(() => {
    if (adminSession?.authenticated) {
      loadOverview();
    }
  }, [adminSession, section, loadOverview]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSubmittingAuth(true);

    try {
      let session: AdminAuthSession;
      if (authMode === 'bootstrap') {
        session = await api.bootstrapAdmin({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        });
      } else if (authMode === 'accessCode') {
        session = await api.verifyAdminAccess(accessCode);
      } else {
        session = await api.loginAdmin({
          email: email.trim(),
          password,
        });
      }

      setAdminToken(session.token);
      onSessionChange(session);
      setPassword('');
      setAccessCode('');
      onToast('success', 'অ্যাডমিন কনসোল আনলক হয়েছে', session.admin.email);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'প্রমাণীকরণ ব্যর্থ হয়েছে।'
      );
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleSignOut = () => {
    setAdminToken(null);
    onSessionChange(null);
    setOverview(null);
    onToast('info', 'অ্যাডমিন কনসোল থেকে সাইন আউট হয়েছে');
  };

  const handleDataMutated = useCallback(() => {
    loadOverview();
    onSyncStudentData();
  }, [loadOverview, onSyncStudentData]);

  // Protected Admin Gate
  if (!adminSession?.authenticated) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center p-4">
        <div className="bg-white border border-[#E8ECF3] max-w-md w-full rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <span className="w-11 h-11 rounded-2xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </span>
            <button
              onClick={onExitAdmin}
              className="text-xs font-medium text-[#64748B] hover:text-[#172033] flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>শিক্ষার্থী অ্যাপে ফিরুন</span>
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-[#4F46E5]">
              ADMITLY AI অপারেশনস
            </p>
            <h1 className="font-display text-[22px] font-bold leading-[1.25] text-[#172033] mt-1">
              {authMode === 'bootstrap'
                ? 'প্রথম অ্যাডমিনিস্ট্রেটর সেটআপ'
                : authMode === 'accessCode'
                  ? 'অ্যাডমিন অ্যাক্সেস কোড দিন'
                  : 'অ্যাডমিনিস্ট্রেটর সাইন-ইন'}
            </h1>
            <p className="text-[13.5px] text-[#64748B] mt-1 leading-[1.65]">
              {authMode === 'bootstrap'
                ? 'কন্ট্রোল সেন্টার সুরক্ষিত রাখতে মূল অ্যাডমিন অ্যাকাউন্ট তৈরি করুন।'
                : authMode === 'accessCode'
                  ? 'প্রশ্ন ব্যাংক, AI প্রশ্ন বিল্ডার ও Mock Test পরিচালনার জন্য আপনার সার্ভার অ্যাডমিন অ্যাক্সেস কোড (ADMIN_ACCESS_CODE) দিয়ে প্রবেশ করুন।'
                  : 'ব্যবহারকারী, প্রশ্ন ব্যাংক, AI প্রশ্ন বিল্ডার এবং Mock Test পরিচালনার জন্য অ্যাডমিন অ্যাকাউন্টে সাইন ইন করুন।'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3.5" autoComplete="off">
            {authMode === 'bootstrap' && (
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  অ্যাডমিনিস্ট্রেটরের পূর্ণ নাম
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="অ্যাডমিনিস্ট্রেটরের পূর্ণ নাম লিখুন"
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                />
              </div>
            )}

            {authMode !== 'accessCode' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    অ্যাডমিন ইমেইল
                  </label>
                  <input
                    type="email"
                    name="admin_email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@admitly.edu.bd"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    পাসওয়ার্ড {authMode === 'bootstrap' ? '(কমপক্ষে ৮ অক্ষর)' : ''}
                  </label>
                  <input
                    type="password"
                    name="admin_password"
                    autoComplete={authMode === 'bootstrap' ? 'new-password' : 'current-password'}
                    required
                    minLength={authMode === 'bootstrap' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="পাসওয়ার্ড লিখুন..."
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                  />
                </div>
              </>
            )}

            {authMode === 'accessCode' && (
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  সার্ভার অ্যাক্সেস কোড (Admin Access Code)
                </label>
                <input
                  type="password"
                  name="admin_access_code"
                  autoComplete="one-time-code"
                  required
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="আপনার ADMIN_ACCESS_CODE লিখুন..."
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                />
              </div>
            )}

            {authError && (
              <p className="text-xs text-red-600 bg-[#FEF2F2] border border-red-200 rounded-xl px-3 py-2">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={submittingAuth}
              className="w-full min-h-[44px] rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {submittingAuth
                ? 'যাচাই করা হচ্ছে...'
                : authMode === 'bootstrap'
                  ? 'অ্যাডমিন অ্যাকাউন্ট তৈরি করে প্রবেশ করুন'
                  : 'অ্যাডমিন কনসোলে সাইন ইন করুন'}
            </button>
          </form>

          {authStatus?.accessCodeConfigured && authStatus?.hasAdminAccount && (
            <div className="pt-2 border-t border-[#E8ECF3] flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setAuthMode(authMode === 'accessCode' ? 'login' : 'accessCode');
                }}
                className="text-[#4F46E5] font-semibold hover:underline"
              >
                {authMode === 'accessCode'
                  ? 'ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন'
                  : 'সার্ভার অ্যাক্সেস কোড দিয়ে প্রবেশ করুন'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const navItems: Array<{
    id: AdminSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'ড্যাশবোর্ড', icon: LayoutDashboard },
    { id: 'users', label: 'ইউজার ম্যানেজমেন্ট', icon: Users },
    { id: 'questions', label: 'প্রশ্ন ব্যাংক', icon: BookOpen },
    { id: 'importer', label: 'AI Question Builder', icon: Sparkles },
    { id: 'exams', label: 'পরীক্ষা ও Mock Test', icon: FilePlus2 },
    { id: 'analytics', label: 'অ্যানালিটিক্স', icon: BarChart3 },
    { id: 'logs', label: 'অডিট ও AI লগ', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#172033] flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-[#E8ECF3] py-5 justify-between z-30 transition-all duration-200 ${
          sidebarCollapsed ? 'lg:w-20 px-2.5' : 'lg:w-64 px-4'
        }`}
      >
        <div>
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </span>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <span className="font-display text-[16px] font-bold text-[#172033] block leading-none truncate">
                    ADMITLY অ্যাডমিন
                  </span>
                  <span className="text-[11px] font-medium text-[#64748B] block mt-1">
                    নিয়ন্ত্রণ কেন্দ্র
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#172033] hover:bg-[#F7F8FC]"
              title={sidebarCollapsed ? 'সাইডবার বড় করুন' : 'সাইডবার ছোট করুন'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          <nav className="mt-7 space-y-1" aria-label="অ্যাডমিন নেভিগেশন">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  title={item.label}
                  className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-[13.5px] flex items-center gap-3 transition-colors whitespace-nowrap ${
                    sidebarCollapsed ? 'justify-center' : ''
                  } ${
                    active
                      ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold'
                      : 'text-[#64748B] font-medium hover:text-[#172033] hover:bg-[#F7F8FC]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-[#E8ECF3] space-y-2">
          {!sidebarCollapsed && (
            <div className="px-2.5 py-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3]">
              <p className="text-xs font-semibold text-[#172033] truncate">
                {adminSession.admin.fullName}
              </p>
              <p className="text-[11px] text-[#64748B] truncate">
                {adminSession.admin.email}
              </p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={`w-full min-h-[38px] px-3 rounded-xl text-xs font-semibold text-[#64748B] hover:text-red-600 hover:bg-[#FEF2F2] flex items-center gap-2 transition-colors ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            title="সাইন আউট"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>সাইন আউট</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-md border-b border-[#E8ECF3] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-[#172033]"
              aria-label="অ্যাডমিন মেনু খুলুন"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="font-display text-sm sm:text-base font-semibold text-[#172033]">
              {navItems.find((n) => n.id === section)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                onSyncStudentData();
                onExitAdmin();
              }}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#F7F8FC] hover:bg-[#EEF2FF] border border-[#E8ECF3] text-xs font-semibold text-[#172033] flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>শিক্ষার্থী অ্যাপে ফিরুন</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {section === 'overview' && (
            <AdminOverview
              overview={overview}
              loading={loadingOverview}
              onNavigateSection={setSection}
            />
          )}

          {section === 'users' && (
            <AdminUsers onToast={onToast} onDataChanged={handleDataMutated} />
          )}

          {section === 'questions' && (
            <AdminQuestions
              subjects={subjects}
              onSubjectsUpdated={onSubjectsUpdated}
              onQuestionsChanged={handleDataMutated}
              onToast={onToast}
            />
          )}

          {section === 'importer' && (
            <AdminQuestionImporter
              onQuestionsApproved={handleDataMutated}
              onToast={onToast}
            />
          )}

          {section === 'exams' && (
            <AdminExams
              onExamsChanged={handleDataMutated}
              onToast={onToast}
            />
          )}

          {(section === 'analytics' || section === 'logs') && (
            <AdminAnalytics overview={overview} mode={section} />
          )}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-xs flex">
          <div className="w-72 bg-white h-full p-5 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#E8ECF3]">
                <span className="font-display text-base font-bold text-[#172033]">
                  ADMITLY অ্যাডমিন
                </span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-[#64748B]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full min-h-[42px] px-3 rounded-xl text-xs font-semibold flex items-center gap-3 ${
                        active
                          ? 'bg-[#EEF2FF] text-[#4F46E5]'
                          : 'text-[#64748B] hover:bg-[#F7F8FC]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full min-h-[40px] px-3 rounded-xl text-xs font-semibold text-red-600 bg-[#FEF2F2] flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>সাইন আউট</span>
            </button>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}
    </div>
  );
}
