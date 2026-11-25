import React, { useState } from 'react';
import { Award, Flame, Search, TrendingUp, Trophy } from 'lucide-react';
import type {
  LeaderboardEntry,
  StudentProfile,
  UniversityTrack,
} from '../types';
import { Avatar } from './ui/Primitives';

interface LeaderboardViewProps {
  leaderboard: LeaderboardEntry[];
  student: StudentProfile;
}

const UNI_FILTERS: Array<'National' | UniversityTrack> = [
  'National',
  'BUET',
  'DU Ka',
  'DU Kha',
  'Medical',
  'CKRUET',
  'GST',
];

export function LeaderboardView({
  leaderboard,
  student,
}: LeaderboardViewProps) {
  const [uniFilter, setUniFilter] = useState<'National' | UniversityTrack>(
    'National'
  );
  const [query, setQuery] = useState('');

  const filtered = leaderboard.filter((entry) => {
    const matchesUni =
      uniFilter === 'National' || entry.targetUniversity === uniFilter;
    const matchesSearch =
      !query.trim() ||
      entry.displayName.toLowerCase().includes(query.toLowerCase()) ||
      entry.city.toLowerCase().includes(query.toLowerCase());
    return matchesUni && matchesSearch;
  });

  const weeklyChampions = leaderboard.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold leading-[1.25] text-[#172033]">
            জাতীয় ও বিশ্ববিদ্যালয়ভিত্তিক লিডারবোর্ড
          </h2>
          <p className="text-[14px] leading-[1.65] text-[#64748B] mt-1">
            বাংলাদেশের ভর্তি পরীক্ষার্থীদের মেধা তালিকা। ব্যক্তিগত যোগাযোগের তথ্য কখনোই প্রকাশ করা হয় না।
          </p>
        </div>

        <div className="card-surface rounded-xl px-4 py-3 flex items-center gap-4 shrink-0">
          <div>
            <p className="text-xs font-medium text-[#64748B]">
              আপনার জাতীয় র‍্যাঙ্ক
            </p>
            <p className="font-mono-num text-xl font-bold text-[#172033] mt-0.5">
              {student.nationalRank > 0 ? `#${student.nationalRank}` : '—'}{' '}
              {student.totalRankedStudents > 0 && (
                <span className="text-xs font-medium text-[#64748B]">
                  / {student.totalRankedStudents.toLocaleString()}
                </span>
              )}
            </p>
          </div>
          {student.totalExamsCompleted > 0 && student.nationalRank > 0 && (
            <>
              <div className="h-8 w-px bg-[#E8ECF3]" />
              <div className="text-xs text-[#059669] flex items-center gap-1 font-semibold tabular-nums">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>
                  {student.rankDelta >= 0
                    ? `এই সপ্তাহে +${student.rankDelta}`
                    : `এই সপ্তাহে ${student.rankDelta}`}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Weekly Champions */}
      {weeklyChampions.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {weeklyChampions.map((champ, idx) => (
            <div
              key={champ.id}
              className="card-surface rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  src={champ.avatarUrl}
                  name={champ.displayName}
                  size={46}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Trophy
                      className={`w-3.5 h-3.5 ${
                        idx === 0
                          ? 'text-[#D97706]'
                          : idx === 1
                            ? 'text-[#4F46E5]'
                            : 'text-[#0891B2]'
                      }`}
                    />
                    <span className="font-semibold text-[#172033]">
                      সাপ্তাহিক #{champ.rank}
                    </span>
                  </div>
                  <p className="font-display text-sm sm:text-base font-semibold text-[#172033] truncate mt-0.5">
                    {champ.displayName}
                  </p>
                  <p className="text-xs text-[#64748B] truncate">
                    {champ.targetUniversity} · {champ.city}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono-num text-base font-semibold text-[#172033]">
                  {champ.weeklyScore}
                </p>
                <p className="font-mono-num text-xs text-[#059669]">
                  {champ.accuracy}% সঠিকতা
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {UNI_FILTERS.map((uni) => (
            <button
              key={uni}
              onClick={() => setUniFilter(uni)}
              className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                uniFilter === uni
                  ? 'bg-[#4F46E5] text-white'
                  : 'bg-white text-[#64748B] hover:text-[#172033] border border-[#E8ECF3]'
              }`}
            >
              {uni === 'National' ? 'জাতীয়' : uni}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="শিক্ষার্থী বা শহরের নাম খুঁজুন..."
            className="w-full min-h-[42px] pl-9 pr-3.5 rounded-xl bg-white border border-[#E8ECF3] text-[13px] text-[#172033] placeholder-[#64748B] focus:outline-none focus:border-[#4F46E5]"
          />
        </div>
      </div>

      {/* Rank Table */}
      <div className="card-surface rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8ECF3] text-xs text-[#64748B] bg-[#F7F8FC]">
                <th className="py-3 px-4 font-semibold">র‍্যাঙ্ক</th>
                <th className="py-3 px-4 font-semibold">শিক্ষার্থী</th>
                <th className="py-3 px-4 font-semibold">লক্ষ্য</th>
                <th className="py-3 px-4 font-semibold text-right">স্ট্রিক</th>
                <th className="py-3 px-4 font-semibold text-right">পরীক্ষা</th>
                <th className="py-3 px-4 font-semibold text-right">সঠিকতা</th>
                <th className="py-3 px-4 font-semibold text-right">স্কোর</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8ECF3] text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-xs text-[#64748B]"
                  >
                    {leaderboard.length === 0
                      ? 'No exams attempted yet · এখনো কোনো শিক্ষার্থী পরীক্ষা সম্পন্ন করেনি।'
                      : 'এই ফিল্টারে কোনো শিক্ষার্থী পাওয়া যায়নি।'}
                  </td>
                </tr>
              ) : (
                filtered.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={`transition-colors ${
                      entry.isCurrentUser
                        ? 'bg-[#EEF2FF]'
                        : 'hover:bg-[#F7F8FC]'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono-num text-xs font-semibold text-[#172033]">
                      #{uniFilter === 'National' ? entry.rank : index + 1}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={entry.avatarUrl}
                          name={entry.displayName}
                          size={34}
                        />
                        <div>
                          <p className="font-medium text-[#172033] flex items-center gap-1.5">
                            <span>{entry.displayName}</span>
                            {entry.isCurrentUser && (
                              <Award className="w-3.5 h-3.5 text-[#4F46E5]" />
                            )}
                          </p>
                          <p className="text-xs text-[#64748B]">{entry.city}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#4F46E5] font-medium">
                      {entry.targetUniversity}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num text-xs text-[#D97706]">
                      <span className="inline-flex items-center gap-1">
                        <Flame className="w-3 h-3" />
                        {entry.streakDays} দিন
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num text-xs text-[#64748B]">
                      {entry.examsCompleted}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num text-xs text-[#059669] font-medium">
                      {entry.accuracy}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num text-sm font-semibold text-[#172033]">
                      {entry.weeklyScore}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
