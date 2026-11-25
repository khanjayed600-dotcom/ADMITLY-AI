import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { api, setStudentToken } from '../../services/api';
import type { StudentAuthSession, UniversityTrack } from '../../types';

export type StudentAuthViewMode = 'login' | 'register' | 'forgot';

interface StudentAuthPagesProps {
  onAuthSuccess: (session: StudentAuthSession) => void;
  onOpenAdminPortal: () => void;
}

const TARGET_TRACKS: Array<{ value: UniversityTrack; label: string }> = [
  { value: 'BUET', label: 'BUET (ইঞ্জিনিয়ারিং)' },
  { value: 'DU Ka', label: 'DU Ka (ঢাবি ক ইউনিট)' },
  { value: 'DU Kha', label: 'DU Kha (ঢাবি খ ইউনিট)' },
  { value: 'Medical', label: 'Medical (মেডিকেল ভর্তি)' },
  { value: 'CKRUET', label: 'CKRUET (চট্টগ্রাম/খুলনা/রাজশাহী)' },
  { value: 'GST', label: 'GST (গুচ্ছ বিশ্ববিদ্যালয়)' },
];

const HSC_BATCHES = ['HSC 2025', 'HSC 2026', 'HSC 2027'];

export function StudentAuthPages({
  onAuthSuccess,
  onOpenAdminPortal,
}: StudentAuthPagesProps) {
  const [view, setView] = useState<StudentAuthViewMode>('login');

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [regBatch, setRegBatch] = useState('HSC 2026');
  const [regTrack, setRegTrack] = useState<UniversityTrack>('DU Ka');

  // Forgot Password state
  const [forgotStep, setForgotStep] = useState<'request' | 'verify' | 'done'>(
    'request'
  );
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [previewOtp, setPreviewOtp] = useState<string | undefined>(undefined);
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const switchView = (next: StudentAuthViewMode) => {
    setErrorMsg(null);
    setView(next);
    if (next === 'forgot') {
      setForgotStep('request');
      setForgotMessage(null);
      setPreviewOtp(undefined);
      setOtpCode('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMsg('অনুগ্রহ করে ইমেইল অথবা মোবাইল নম্বর এবং পাসওয়ার্ড দিন।');
      return;
    }

    setSubmitting(true);
    try {
      const session = await api.loginStudent({
        identifier: loginIdentifier.trim(),
        password: loginPassword,
        rememberMe,
      });
      setStudentToken(session.token ?? null);
      onAuthSuccess(session);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'লগইন সম্পন্ন করা যায়নি। তথ্য যাচাই করুন।'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (regName.trim().length < 2) {
      setErrorMsg('শিক্ষার্থীর পূর্ণ নাম কমপক্ষে ২ অক্ষরের হতে হবে।');
      return;
    }
    if (!regEmail.trim().includes('@')) {
      setErrorMsg('সঠিক ইমেইল ঠিকানা লিখুন।');
      return;
    }
    if (!regPhone.trim()) {
      setErrorMsg('সঠিক বাংলাদেশি মোবাইল নম্বর (যেমন 017XXXXXXXX) দিন।');
      return;
    }
    if (regPassword.length < 8) {
      setErrorMsg('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMsg('পাসওয়ার্ড এবং পাসওয়ার্ড নিশ্চিতকরণ মিলছে না।');
      return;
    }

    setSubmitting(true);
    try {
      const session = await api.registerStudent({
        fullName: regName.trim(),
        email: regEmail.trim(),
        phone: regPhone.trim(),
        password: regPassword,
        hscBatch: regBatch,
        targetTrack: regTrack,
        rememberMe: true,
      });
      setStudentToken(session.token ?? null);
      onAuthSuccess(session);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'অ্যাকাউন্ট তৈরি করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!forgotIdentifier.trim()) {
      setErrorMsg('আপনার নিবন্ধিত ইমেইল অথবা মোবাইল নম্বর দিন।');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.forgotPassword(forgotIdentifier.trim());
      setForgotMessage(
        `${res.maskedTarget} ঠিকানায় ৬ সংখ্যার যাচাইকরণ কোড পাঠানো হয়েছে।`
      );
      setPreviewOtp(res.previewCode);
      setForgotStep('verify');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'কোড পাঠানো যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (otpCode.trim().length !== 6) {
      setErrorMsg('৬ সংখ্যার যাচাইকরণ কোডটি লিখুন।');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('নতুন পাসওয়ার্ড দুটি মিলছে না।');
      return;
    }

    setSubmitting(true);
    try {
      await api.resetPassword({
        identifier: forgotIdentifier.trim(),
        otp: otpCode.trim(),
        newPassword,
      });
      setForgotStep('done');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'পাসওয়ার্ড রিসেট করা যায়নি। কোড যাচাই করুন।'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#172033] flex flex-col justify-between">
      {/* Clean Top Brand Bar */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center shadow-xs">
            <GraduationCap className="w-5 h-5" />
          </span>
          <div>
            <span className="font-display text-[17px] font-bold text-[#172033] block leading-none">
              ADMITLY AI
            </span>
            <span className="text-xs font-medium text-[#64748B] block mt-1">
              ভর্তি প্রস্তুতি প্ল্যাটফর্ম
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {view !== 'login' ? (
            <button
              type="button"
              onClick={() => switchView('login')}
              className="min-h-[40px] px-3.5 rounded-xl bg-white border border-[#E8ECF3] text-xs font-semibold text-[#172033] hover:bg-[#EEF2FF] hover:text-[#4F46E5] transition-colors"
            >
              লগইন করুন
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchView('register')}
              className="min-h-[40px] px-3.5 rounded-xl bg-white border border-[#E8ECF3] text-xs font-semibold text-[#4F46E5] hover:bg-[#EEF2FF] transition-colors"
            >
              নতুন অ্যাকাউন্ট
            </button>
          )}
        </div>
      </header>

      {/* Main Split Card Layout */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Context Panel (Desktop) */}
          <div className="hidden lg:block lg:col-span-6 space-y-6 pr-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#EEF2FF] text-[#4F46E5] text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>HSC ও বিশ্ববিদ্যালয় ভর্তি প্রস্তুতির স্মার্ট সহায়ক</span>
            </div>

            <h1 className="font-display text-[32px] font-bold text-[#172033] leading-[1.3]">
              আপনার মেধা ও সঠিক দিকনির্দেশনায় গড়ে উঠুক স্বপ্নের বিশ্ববিদ্যালয় ভর্তি।
            </h1>

            <p className="text-[15px] text-[#64748B] leading-[1.7] max-w-lg">
              BUET, DU Ka, DU Kha, Medical, CKRUET এবং GST ভর্তি পরীক্ষার জন্য সময়বদ্ধ Mock Test, তাৎক্ষণিক ফলাফল বিশ্লেষণ এবং সহজ বাংলায় AI মেন্টর সহায়তা।
            </p>

            <div className="grid grid-cols-2 gap-3.5 pt-2 max-w-lg">
              <div className="card-surface rounded-2xl p-4">
                <p className="text-sm font-semibold text-[#172033]">
                  Mock Test ও নেগেটিভ মার্কিং
                </p>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  বাস্তব পরীক্ষার পরিবেশে টাইমারসহ পূর্ণাঙ্গ মূল্যায়ন।
                </p>
              </div>
              <div className="card-surface rounded-2xl p-4">
                <p className="text-sm font-semibold text-[#172033]">
                  সহজ বাংলায় AI মেন্টর
                </p>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  দুর্বল অধ্যায় অনুযায়ী তাৎক্ষণিক সমাধান ও পড়ার পরিকল্পনা।
                </p>
              </div>
            </div>
          </div>

          {/* Right Auth Form Card */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto">
            <div className="bg-white border border-[#E8ECF3] rounded-2xl p-6 sm:p-8 shadow-[0_8px_28px_rgba(23,32,51,0.06)]">
              {/* LOGIN VIEW */}
              {view === 'login' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-[#172033] leading-[1.3]">
                      আপনার অ্যাকাউন্টে লগইন করুন
                    </h2>
                    <p className="text-[13.5px] text-[#64748B] mt-1 leading-relaxed">
                      আপনার ড্যাশবোর্ড, ফলাফল ও স্টাডি প্রগ্রেস দেখতে লগইন করুন।
                    </p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label
                        htmlFor="login-identifier"
                        className="block text-xs font-semibold text-[#172033] mb-1.5"
                      >
                        ইমেইল অথবা মোবাইল নম্বর
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="login-identifier"
                          type="text"
                          autoComplete="username"
                          value={loginIdentifier}
                          onChange={(e) => setLoginIdentifier(e.target.value)}
                          placeholder="student@example.com অথবা 017XXXXXXXX"
                          className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor="login-password"
                          className="block text-xs font-semibold text-[#172033]"
                        >
                          পাসওয়ার্ড
                        </label>
                        <button
                          type="button"
                          onClick={() => switchView('forgot')}
                          className="text-xs font-semibold text-[#4F46E5] hover:underline"
                        >
                          পাসওয়ার্ড ভুলে গেছেন?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="login-password"
                          type={showLoginPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="আপনার পাসওয়ার্ড লিখুন"
                          className="w-full min-h-[46px] pl-10 pr-12 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((s) => !s)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#172033]"
                          aria-label={
                            showLoginPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'
                          }
                        >
                          {showLoginPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 cursor-pointer select-none min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#4F46E5]"
                      />
                      <span className="text-xs font-medium text-[#64748B]">
                        আমাকে লগইন অবস্থায় রাখুন
                      </span>
                    </label>

                    {errorMsg && (
                      <div className="rounded-xl bg-[#FEF2F2] border border-red-200 px-3.5 py-2.5 flex items-start gap-2 text-xs text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[46px] rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs"
                    >
                      {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>{submitting ? 'যাচাই করা হচ্ছে...' : 'লগইন করুন'}</span>
                    </button>
                  </form>

                  <div className="pt-4 border-t border-[#E8ECF3] text-center text-xs text-[#64748B]">
                    <span>ADMITLY AI-তে নতুন? </span>
                    <button
                      type="button"
                      onClick={() => switchView('register')}
                      className="font-semibold text-[#4F46E5] hover:underline"
                    >
                      নতুন অ্যাকাউন্ট তৈরি করুন
                    </button>
                  </div>
                </div>
              )}

              {/* REGISTER VIEW */}
              {view === 'register' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-[#172033] leading-[1.3]">
                      নতুন অ্যাকাউন্ট তৈরি করুন
                    </h2>
                    <p className="text-[13.5px] text-[#64748B] mt-1 leading-relaxed">
                      আপনার HSC Batch ও Target University নির্বাচন করে প্রস্তুতি শুরু করুন।
                    </p>
                  </div>

                  <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                    <div>
                      <label
                        htmlFor="reg-name"
                        className="block text-xs font-semibold text-[#172033] mb-1"
                      >
                        শিক্ষার্থীর পূর্ণ নাম
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reg-name"
                          type="text"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="আপনার পূর্ণ নাম লিখুন"
                          className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reg-email"
                          className="block text-xs font-semibold text-[#172033] mb-1"
                        >
                          ইমেইল
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="reg-email"
                            type="email"
                            required
                            autoComplete="email"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="name@example.com"
                            className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="reg-phone"
                          className="block text-xs font-semibold text-[#172033] mb-1"
                        >
                          মোবাইল নম্বর
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="reg-phone"
                            type="tel"
                            required
                            autoComplete="tel"
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                            placeholder="017XXXXXXXX"
                            className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm font-mono-num text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reg-batch"
                          className="block text-xs font-semibold text-[#172033] mb-1"
                        >
                          HSC Batch
                        </label>
                        <select
                          id="reg-batch"
                          value={regBatch}
                          onChange={(e) => setRegBatch(e.target.value)}
                          className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                        >
                          {HSC_BATCHES.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="reg-track"
                          className="block text-xs font-semibold text-[#172033] mb-1"
                        >
                          Target University
                        </label>
                        <select
                          id="reg-track"
                          value={regTrack}
                          onChange={(e) =>
                            setRegTrack(e.target.value as UniversityTrack)
                          }
                          className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                        >
                          {TARGET_TRACKS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="reg-password"
                        className="block text-xs font-semibold text-[#172033] mb-1"
                      >
                        পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reg-password"
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড"
                          className="w-full min-h-[44px] pl-10 pr-12 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword((s) => !s)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#172033]"
                          aria-label={
                            showRegPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'
                          }
                        >
                          {showRegPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="reg-confirm-password"
                        className="block text-xs font-semibold text-[#172033] mb-1"
                      >
                        পাসওয়ার্ড নিশ্চিত করুন
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reg-confirm-password"
                          type={showRegConfirm ? 'text' : 'password'}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          placeholder="পুনরায় পাসওয়ার্ড লিখুন"
                          className="w-full min-h-[44px] pl-10 pr-12 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegConfirm((s) => !s)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#172033]"
                          aria-label={
                            showRegConfirm ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'
                          }
                        >
                          {showRegConfirm ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {errorMsg && (
                      <div className="rounded-xl bg-[#FEF2F2] border border-red-200 px-3.5 py-2.5 flex items-start gap-2 text-xs text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[46px] rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs"
                    >
                      {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>
                        {submitting
                          ? 'অ্যাকাউন্ট তৈরি হচ্ছে...'
                          : 'অ্যাকাউন্ট তৈরি করুন'}
                      </span>
                    </button>
                  </form>

                  <div className="pt-3 border-t border-[#E8ECF3] text-center text-xs text-[#64748B]">
                    <span>ইতোমধ্যেই অ্যাকাউন্ট আছে? </span>
                    <button
                      type="button"
                      onClick={() => switchView('login')}
                      className="font-semibold text-[#4F46E5] hover:underline"
                    >
                      লগইন করুন
                    </button>
                  </div>
                </div>
              )}

              {/* FORGOT PASSWORD VIEW */}
              {view === 'forgot' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => switchView('login')}
                      className="text-xs font-semibold text-[#64748B] hover:text-[#172033] flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>লগইনে ফিরুন</span>
                    </button>
                    <span className="w-9 h-9 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
                      <KeyRound className="w-4 h-4" />
                    </span>
                  </div>

                  {forgotStep === 'request' && (
                    <>
                      <div>
                        <h2 className="font-display text-2xl font-bold text-[#172033] leading-[1.3]">
                          পাসওয়ার্ড পুনরুদ্ধার
                        </h2>
                        <p className="text-[13.5px] text-[#64748B] mt-1 leading-relaxed">
                          আপনার নিবন্ধিত ইমেইল অথবা মোবাইল নম্বর লিখুন। আমরা ৬-সংখ্যার একটি যাচাইকরণ কোড পাঠাব।
                        </p>
                      </div>

                      <form onSubmit={handleForgotRequest} className="space-y-4">
                        <div>
                          <label
                            htmlFor="forgot-identifier"
                            className="block text-xs font-semibold text-[#172033] mb-1.5"
                          >
                            ইমেইল অথবা মোবাইল নম্বর
                          </label>
                          <input
                            id="forgot-identifier"
                            type="text"
                            required
                            value={forgotIdentifier}
                            onChange={(e) => setForgotIdentifier(e.target.value)}
                            placeholder="student@example.com অথবা 017XXXXXXXX"
                            className="w-full min-h-[46px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                          />
                        </div>

                        {errorMsg && (
                          <div className="rounded-xl bg-[#FEF2F2] border border-red-200 px-3.5 py-2.5 flex items-start gap-2 text-xs text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{errorMsg}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full min-h-[46px] rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span>
                            {submitting
                              ? 'কোড পাঠানো হচ্ছে...'
                              : 'যাচাইকরণ কোড পাঠান'}
                          </span>
                        </button>
                      </form>
                    </>
                  )}

                  {forgotStep === 'verify' && (
                    <>
                      <div>
                        <h2 className="font-display text-xl font-bold text-[#172033] leading-[1.3]">
                          নতুন পাসওয়ার্ড সেট করুন
                        </h2>
                        <p className="text-[13px] text-[#64748B] mt-1 leading-relaxed">
                          {forgotMessage ??
                            'প্রাপ্ত ৬-সংখ্যার কোড এবং নতুন পাসওয়ার্ড লিখুন।'}
                        </p>
                      </div>

                      {previewOtp && (
                        <div className="rounded-xl bg-[#EEF2FF] border border-[#4F46E5]/30 p-3 text-xs flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[#4F46E5]">
                              প্রিভিউ যাচাইকরণ কোড
                            </p>
                            <p className="font-mono-num text-base font-bold text-[#172033] mt-0.5">
                              {previewOtp}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOtpCode(previewOtp)}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#E8ECF3] text-xs font-semibold text-[#4F46E5]"
                          >
                            কোড বসান
                          </button>
                        </div>
                      )}

                      <form onSubmit={handleResetSubmit} className="space-y-3.5">
                        <div>
                          <label
                            htmlFor="otp-code"
                            className="block text-xs font-semibold text-[#172033] mb-1"
                          >
                            ৬-সংখ্যার কোড
                          </label>
                          <input
                            id="otp-code"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            required
                            value={otpCode}
                            onChange={(e) =>
                              setOtpCode(e.target.value.replace(/\D/g, ''))
                            }
                            placeholder="যেমন: 482910"
                            className="w-full min-h-[46px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-base font-mono-num font-bold text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="new-password"
                            className="block text-xs font-semibold text-[#172033] mb-1"
                          >
                            নতুন পাসওয়ার্ড
                          </label>
                          <div className="relative">
                            <input
                              id="new-password"
                              type={showNewPassword ? 'text' : 'password'}
                              required
                              minLength={8}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="কমপক্ষে ৮ অক্ষরের নতুন পাসওয়ার্ড"
                              className="w-full min-h-[44px] pl-4 pr-12 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword((s) => !s)}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#64748B]"
                              aria-label={
                                showNewPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'
                              }
                            >
                              {showNewPassword ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="confirm-new-password"
                            className="block text-xs font-semibold text-[#172033] mb-1"
                          >
                            নতুন পাসওয়ার্ড নিশ্চিত করুন
                          </label>
                          <input
                            id="confirm-new-password"
                            type="password"
                            required
                            minLength={8}
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            placeholder="পুনরায় নতুন পাসওয়ার্ড লিখুন"
                            className="w-full min-h-[44px] px-4 rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] text-sm text-[#172033] focus:outline-none focus:border-[#4F46E5] focus:bg-white"
                          />
                        </div>

                        {errorMsg && (
                          <div className="rounded-xl bg-[#FEF2F2] border border-red-200 px-3.5 py-2.5 flex items-start gap-2 text-xs text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{errorMsg}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full min-h-[46px] rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span>
                            {submitting
                              ? 'আপডেট হচ্ছে...'
                              : 'পাসওয়ার্ড রিসেট করুন'}
                          </span>
                        </button>
                      </form>
                    </>
                  )}

                  {forgotStep === 'done' && (
                    <div className="py-4 text-center space-y-4">
                      <span className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-6 h-6" />
                      </span>
                      <div>
                        <h2 className="font-display text-xl font-bold text-[#172033]">
                          পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে
                        </h2>
                        <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
                          এখন আপনার নতুন পাসওয়ার্ড ব্যবহার করে অ্যাকাউন্টে লগইন করতে পারবেন।
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => switchView('login')}
                        className="w-full min-h-[46px] rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-sm font-semibold transition-colors"
                      >
                        লগইন পেজে যান
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Subtle Footer with Admin Console Link */}
      <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B]">
        <span>ADMITLY AI · বাংলাদেশের শিক্ষার্থীদের স্মার্ট ভর্তি প্রস্তুতি</span>
        <button
          type="button"
          onClick={onOpenAdminPortal}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#4F46E5] transition-colors"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>অ্যাডমিন পোর্টাল</span>
        </button>
      </footer>
    </div>
  );
}
