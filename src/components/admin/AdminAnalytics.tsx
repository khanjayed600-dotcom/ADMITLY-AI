import React from 'react';
import type { AdminOverviewPayload } from '../../types';

interface AdminAnalyticsProps {
  overview: AdminOverviewPayload | null;
  mode: 'analytics' | 'logs';
}

export function AdminAnalytics({ overview, mode }: AdminAnalyticsProps) {
  if (!overview) {
    return (
      <div className="bg-white border border-[#E8ECF3] rounded-2xl p-8 text-center text-xs text-[#64748B]">
        প্ল্যাটফর্ম অ্যানালিটিক্স লোড হচ্ছে...
      </div>
    );
  }

  if (mode === 'logs') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#172033]">
            অডিট লগ ও AI টেলিমেট্রি
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            অ্যাডমিন কার্যক্রমের নিরাপত্তা লগ এবং রিয়েল-টাইম Gemini AI API রিকোয়েস্টের বিবরণ।
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Admin Activity Logs */}
          <div className="bg-white border border-[#E8ECF3] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-[#172033]">
                অ্যাডমিন কার্যক্রম লগ
              </h2>
              <span className="font-mono-num text-xs text-[#4F46E5]">
                {overview.activityLogs.length}টি ইভেন্ট
              </span>
            </div>

            {overview.activityLogs.length === 0 ? (
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-8 text-center text-xs text-[#64748B]">
                এখনো কোনো অ্যাডমিন অডিট লগ রেকর্ড হয়নি।
              </div>
            ) : (
              <div className="divide-y divide-[#E8ECF3] max-h-[540px] overflow-y-auto pr-1">
                {overview.activityLogs.map((log) => (
                  <div key={log.id} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-num font-bold text-[#4F46E5]">
                        {log.action}
                      </span>
                      <span className="font-mono-num text-[#64748B]">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[#172033]">{log.details}</p>
                    <p className="text-[#64748B]">
                      সম্পাদনকারী: {log.adminEmail} · লক্ষ্য: {log.targetType} ({log.targetId})
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live AI Request Logs */}
          <div className="bg-white border border-[#E8ECF3] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-[#172033]">
                লাইভ Gemini API রিকোয়েস্ট লগ
              </h2>
              <span className="font-mono-num text-xs text-[#059669]">
                {overview.stats.aiSuccessRate}% সফলতা
              </span>
            </div>

            {overview.aiLogs.length === 0 ? (
              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8ECF3] p-8 text-center text-xs text-[#64748B]">
                এখনো কোনো AI রিকোয়েস্ট লগ হয়নি। AI মেন্টর, ফলাফল বিশ্লেষক বা AI প্রশ্ন ইম্পোর্টার ব্যবহার করলে এখানে লাইভ তথ্য দেখা যাবে।
              </div>
            ) : (
              <div className="divide-y divide-[#E8ECF3] max-h-[540px] overflow-y-auto pr-1">
                {overview.aiLogs.map((log) => (
                  <div key={log.id} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#172033]">
                        {log.feature} · {log.model}
                      </span>
                      <span
                        className={`font-mono-num font-semibold ${
                          log.status === 'success'
                            ? 'text-[#059669]'
                            : 'text-[#D97706]'
                        }`}
                      >
                        {log.status} · {log.latencyMs}ms
                      </span>
                    </div>
                    <p className="text-[#64748B] truncate">{log.summary}</p>
                    <p className="font-mono-num text-[11px] text-[#64748B]">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { analytics } = overview;
  const maxUni = Math.max(
    1,
    ...analytics.universityStudentDistribution.map((u) => u.count)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#172033]">
          প্ল্যাটফর্ম ইন্টেলিজেন্স ও অ্যানালিটিক্স
        </h1>
        <p className="text-sm text-[#64748B] mt-1">
          বিশ্ববিদ্যালয়ভিত্তিক শিক্ষার্থী বিন্যাস, পরীক্ষা সম্পন্নের হার এবং কঠিনতম প্রশ্নের ডেটাবেজ বিশ্লেষণ।
        </p>
      </div>

      {/* University Student Distribution & Engagement Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#E8ECF3] rounded-2xl p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-[#172033] mb-4">
            বিশ্ববিদ্যালয়ভিত্তিক শিক্ষার্থী বিন্যাস
          </h2>
          <div className="space-y-3">
            {analytics.universityStudentDistribution.map((item) => {
              const pct = Math.round((item.count / maxUni) * 100);
              return (
                <div key={item.university} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#172033]">
                      {item.university}
                    </span>
                    <span className="font-mono-num text-[#4F46E5] font-semibold">
                      {item.count} জন শিক্ষার্থী
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#F1F4FA] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#4F46E5]"
                      style={{ width: `${item.count > 0 ? Math.max(8, pct) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-[#E8ECF3] rounded-2xl p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-[#172033] mb-4">
            পরীক্ষায় অংশগ্রহণ ও সঠিকতার প্রবণতা
          </h2>
          {analytics.engagementTrend.length === 0 ? (
            <p className="text-xs text-[#64748B]">
              এখনো কোনো পরীক্ষা প্রচেষ্টা রেকর্ড হয়নি।
            </p>
          ) : (
            <div className="divide-y divide-[#E8ECF3]">
              {analytics.engagementTrend.map((pt) => (
                <div
                  key={pt.label}
                  className="py-2.5 flex items-center justify-between text-xs"
                >
                  <span className="font-mono-num font-medium text-[#172033]">
                    {pt.label}
                  </span>
                  <div className="flex items-center gap-4 font-mono-num">
                    <span className="text-[#4F46E5] font-semibold">
                      {pt.attempts}টি প্রচেষ্টা
                    </span>
                    <span className="text-[#059669] font-semibold">
                      গড় {pt.avgAccuracy}% সঠিকতা
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Exam Completion Rates */}
      <div className="bg-white border border-[#E8ECF3] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8ECF3]">
          <h2 className="font-display text-base font-semibold text-[#172033]">
            পরীক্ষা সম্পন্ন ও সঠিকতার বিবরণ
          </h2>
        </div>
        {analytics.examCompletionRates.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            এখনো কোনো প্রকাশিত পরীক্ষা বা অংশগ্রহণের ডেটা নেই।
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8ECF3] bg-[#F7F8FC] text-xs text-[#64748B]">
                  <th className="py-3 px-4 font-semibold">পরীক্ষার নাম</th>
                  <th className="py-3 px-4 font-semibold">বিশ্ববিদ্যালয়</th>
                  <th className="py-3 px-4 font-semibold text-right">অংশগ্রহণ</th>
                  <th className="py-3 px-4 font-semibold text-right">সম্পন্নের হার</th>
                  <th className="py-3 px-4 font-semibold text-right">গড় সঠিকতা</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF3] text-xs sm:text-sm">
                {analytics.examCompletionRates.map((ex) => (
                  <tr key={ex.examId}>
                    <td className="py-3 px-4 font-medium text-[#172033]">
                      {ex.title}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#4F46E5] font-medium">
                      {ex.universityTrack}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num">
                      {ex.attemptsCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num">
                      {ex.completionRate}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-[#059669]">
                      {ex.averageAccuracy}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Most Attempted vs Most Difficult Questions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#E8ECF3] rounded-2xl p-5">
          <h2 className="font-display text-base font-semibold text-[#172033] mb-3">
            সর্বাধিক চর্চিত প্রশ্নসমূহ
          </h2>
          {analytics.mostAttemptedQuestions.length === 0 ? (
            <p className="text-xs text-[#64748B] py-4 text-center">
              এখনো কোনো প্রশ্নের উত্তর বিশ্লেষণ তৈরি হয়নি।
            </p>
          ) : (
            <div className="divide-y divide-[#E8ECF3]">
              {analytics.mostAttemptedQuestions.map((q) => (
                <div key={q.questionId} className="py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#4F46E5]">
                      {q.subjectName}
                    </span>
                    <span className="font-mono-num text-[#172033] font-semibold">
                      {q.attemptsCount} বার · {q.accuracyRate}% সঠিকতা
                    </span>
                  </div>
                  <p className="text-[#172033] line-clamp-2">{q.prompt}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E8ECF3] rounded-2xl p-5">
          <h2 className="font-display text-base font-semibold text-[#172033] mb-3">
            সবচেয়ে কঠিন প্রশ্নসমূহ (কম সঠিকতা)
          </h2>
          {analytics.mostDifficultQuestions.length === 0 ? (
            <p className="text-xs text-[#64748B] py-4 text-center">
              এখনো কোনো প্রশ্নের কঠিনতা পরিসংখ্যান তৈরি হয়নি।
            </p>
          ) : (
            <div className="divide-y divide-[#E8ECF3]">
              {analytics.mostDifficultQuestions.map((q) => (
                <div key={q.questionId} className="py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#4F46E5]">
                      {q.subjectName}
                    </span>
                    <span className="font-mono-num text-[#D97706] font-semibold">
                      {q.accuracyRate}% সঠিকতা ({q.attemptsCount} বার)
                    </span>
                  </div>
                  <p className="text-[#172033] line-clamp-2">{q.prompt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
