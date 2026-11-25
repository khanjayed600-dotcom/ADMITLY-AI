import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import type { SubjectSummary, WeeklyPerformancePoint } from '../../types';

export interface ToastItem {
  id: string;
  tone: 'success' | 'warning' | 'info';
  title: string;
  detail?: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon =
          t.tone === 'success'
            ? CheckCircle2
            : t.tone === 'warning'
              ? AlertTriangle
              : Info;
        const iconColor =
          t.tone === 'success'
            ? 'text-[#059669]'
            : t.tone === 'warning'
              ? 'text-[#F59E0B]'
              : 'text-[#4F46E5]';

        return (
          <div
            key={t.id}
            className="flex items-start gap-3 rounded-xl bg-white border border-[#E8ECF3] px-4 py-3 shadow-[0_8px_24px_rgba(23,32,51,0.10)] transition-all duration-200"
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#172033] leading-snug">
                {t.title}
              </p>
              {t.detail && (
                <p className="text-[13px] text-[#64748B] mt-0.5 leading-relaxed">
                  {t.detail}
                </p>
              )}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-[#64748B] hover:text-[#172033] p-1 -m-1 rounded-lg transition-colors"
              aria-label="বিজ্ঞপ্তি বন্ধ করুন"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function Avatar({
  src,
  name,
  size = 40,
  className = '',
}: {
  src?: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (!src || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-full bg-[#EEF2FF] border border-[#E8ECF3] flex items-center justify-center text-xs font-semibold text-[#4F46E5] shrink-0 select-none ${className}`}
        aria-label={name}
      >
        {initials || 'ST'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`rounded-full object-cover border border-[#E8ECF3] shrink-0 bg-[#F1F5F9] ${className}`}
    />
  );
}

export function ProgressRing({
  percent,
  size = 104,
  strokeWidth = 8,
  accentColor = '#4F46E5',
  secondaryColor = '#06B6D4',
  label,
  sublabel,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  accentColor?: string;
  secondaryColor?: string;
  label?: string;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const gradId = `ring-light-${size}-${Math.round(clamped)}`;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accentColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E8ECF3"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono-num text-lg sm:text-xl font-bold text-[#172033] leading-none">
          {label ?? `${Math.round(clamped)}%`}
        </span>
        {sublabel && (
          <span className="text-[11px] font-medium text-[#64748B] mt-1 leading-none">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

export function WeeklyPerformanceChart({
  data,
  metric,
}: {
  data: WeeklyPerformancePoint[];
  metric: 'score' | 'accuracy';
}) {
  const [activeIndex, setActiveIndex] = useState<number>(Math.max(0, data.length - 1));

  if (data.length === 0) return null;

  const width = 560;
  const height = 185;
  const padX = 28;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const values = data.map((d) => (metric === 'score' ? d.score : d.accuracy));
  const allZero = values.every((v) => v === 0) && data.every((d) => d.minutesStudied === 0);
  const minVal = Math.max(0, Math.min(...values) - 10);
  const maxVal = Math.min(100, Math.max(...values) + 8);
  const range = Math.max(10, maxVal - minVal);

  const points = data.map((d, idx) => {
    const val = metric === 'score' ? d.score : d.accuracy;
    const x =
      data.length === 1
        ? padX + plotW / 2
        : padX + (idx / (data.length - 1)) * plotW;
    const y = padTop + plotH - ((val - minVal) / range) * plotH;
    return { x, y, val, item: d };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(
    padTop + plotH
  ).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  const activePoint = points[Math.min(activeIndex, points.length - 1)];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#64748B]">
          {allZero ? (
            <span>No exams attempted yet · এই সপ্তাহে এখনো কোনো পরীক্ষা দেওয়া হয়নি</span>
          ) : (
            <>
              <span className="font-medium">
                {activePoint.item.day} · {activePoint.item.dateLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-[#172033] font-semibold">
                {activePoint.val}% {metric === 'score' ? 'স্কোর' : 'সঠিকতা'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-[#4F46E5] font-medium">
                {activePoint.item.minutesStudied} মিনিট পড়াশোনা
              </span>
            </>
          )}
        </div>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 sm:h-48 overflow-visible"
          role="img"
          aria-label="সাপ্তাহিক পারফরম্যান্স গ্রাফ"
        >
          <defs>
            <linearGradient id="weeklyLightArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="weeklyLightStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4F46E5" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((ratio, idx) => {
            const y = padTop + plotH * ratio;
            const labelVal = Math.round(maxVal - range * ratio);
            return (
              <g key={idx}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="#E8ECF3"
                  strokeDasharray="3 4"
                />
                <text
                  x={padX - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[#64748B] text-[10px] font-medium tabular-nums"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="url(#weeklyLightArea)" />
          <path
            d={linePath}
            fill="none"
            stroke="url(#weeklyLightStroke)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {!allZero && (
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={padTop}
              y2={padTop + plotH}
              stroke="#CBD5E1"
              strokeDasharray="3 3"
            />
          )}

          {points.map((p, idx) => {
            const isActive = !allZero && idx === activeIndex;
            return (
              <g
                key={p.item.day}
                className={allZero ? '' : 'cursor-pointer'}
                onClick={() => !allZero && setActiveIndex(idx)}
                onMouseEnter={() => !allZero && setActiveIndex(idx)}
              >
                <rect
                  x={p.x - 22}
                  y={padTop}
                  width={44}
                  height={plotH + 24}
                  fill="transparent"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 5.5 : 3.5}
                  fill={isActive ? '#4F46E5' : '#FFFFFF'}
                  stroke={allZero ? '#CBD5E1' : isActive ? '#FFFFFF' : '#4F46E5'}
                  strokeWidth={2}
                />
                <text
                  x={p.x}
                  y={height - 6}
                  textAnchor="middle"
                  className={`text-[11px] ${
                    isActive
                      ? 'fill-[#172033] font-semibold'
                      : 'fill-[#64748B] font-medium'
                  }`}
                >
                  {p.item.day}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function SubjectComparisonChart({
  subjects,
}: {
  subjects: SubjectSummary[];
}) {
  if (subjects.length === 0) return null;

  return (
    <div className="space-y-3.5">
      {subjects.map((subj) => {
        const barColor =
          subj.accuracy >= 85
            ? '#059669'
            : subj.accuracy >= 75
              ? '#4F46E5'
              : '#F59E0B';
        const barWidth = subj.mastery > 0 ? Math.max(4, subj.mastery) : 0;
        return (
          <div key={subj.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-[#172033]">
                {subj.banglaName || (subj.name === 'Higher Math' ? 'Mathematics' : subj.name)}
              </span>
              <span className="font-mono-num text-xs text-[#64748B]">
                <strong className="text-[#172033] font-semibold">
                  {subj.mastery}%
                </strong>{' '}
                · {subj.accuracy}% সঠিকতা
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#F1F4FA] overflow-hidden flex">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SkeletonScreen() {
  return (
    <div className="space-y-5 animate-skeleton" aria-label="ড্যাশবোর্ড লোড হচ্ছে">
      <div className="h-36 rounded-2xl bg-white border border-[#E8ECF3]" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-white border border-[#E8ECF3]"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-60 rounded-2xl bg-white border border-[#E8ECF3]" />
        <div className="h-60 rounded-2xl bg-white border border-[#E8ECF3]" />
      </div>
    </div>
  );
}
