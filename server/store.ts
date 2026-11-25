import crypto from 'crypto';
import {
  ensureChapterAndTopic,
  getDb,
  mapLegacySubjectId,
  normalizePromptFingerprint,
} from './db';
import {
  createResetToken,
  hashPassword,
  hashResetToken,
  verifyHashTimingSafe,
  verifyPassword,
} from './auth';
import type {
  AdminActivityLog,
  AdminAnalyticsPayload,
  AdminDashboardStats,
  AdminOverviewPayload,
  AdminUserDetail,
  AdminUserRecord,
  AiUsageLog,
  BootstrapPayload,
  ContinueLearningModule,
  DailyChallenge,
  ExamAttempt,
  ExamConfig,
  GradedQuestionReview,
  LeaderboardEntry,
  QuestionHistoryEntry,
  QuestionItem,
  QuestionStatus,
  StudentNotificationItem,
  StudentProfile,
  StudentQuestionItem,
  SubjectBreakdown,
  SubjectId,
  SubjectSummary,
  TopicInfo,
  TopicWeakness,
  UniversityTrack,
  UserStatus,
  WeeklyPerformancePoint,
} from '../src/types';
import { getAiStatus } from './gemini';

function getKv<T>(key: string, fallback: T): T {
  const db = getDb();
  const row = db
    .prepare('SELECT value_json FROM app_kv WHERE key = ?')
    .get(key) as { value_json: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

function setKv(key: string, value: unknown): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO app_kv (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json'
  ).run(key, JSON.stringify(value));
}

export function normalizeBdPhone(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+8801')) return '0' + digits.slice(4);
  if (digits.startsWith('8801')) return '0' + digits.slice(3);
  return digits;
}

export function isValidBdPhone(phone: string): boolean {
  return /^01[3-9]\d{8}$/.test(phone);
}

export function stripQuestionAnswerKey(q: QuestionItem): StudentQuestionItem {
  return {
    id: q.id,
    subjectId: q.subjectId,
    subjectName: q.subjectName,
    chapter: q.chapter,
    topic: q.topic,
    universityTag: q.universityTag,
    admissionCategory: q.admissionCategory,
    difficulty: q.difficulty,
    prompt: q.prompt,
    promptBn: q.promptBn,
    options: q.options,
    marks: q.marks,
    negativeMarking: q.negativeMarking,
    status: q.status,
    imageUrl: q.imageUrl,
    sourceName: q.sourceName,
    sourceYear: q.sourceYear,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

export function getStudentProfile(userId: string): StudentProfile {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, COALESCE(u.phone, '') AS phone, u.created_at,
              up.full_name, up.college, up.division, up.hsc_batch,
              up.target_university, up.secondary_university, up.avatar_url,
              up.streak_days, up.longest_streak, up.overall_progress, up.overall_score,
              up.average_accuracy, up.total_exams_completed, up.national_rank,
              up.total_ranked_students, up.rank_delta
       FROM users u
       JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error('শিক্ষার্থী প্রোফাইল পাওয়া যায়নি।');
  }

  const totalExamsCompleted = Number(row.total_exams_completed || 0);
  const overallScore = Number(row.overall_score || 0);

  // Live rank calculation among active students who actually attempted >= 1 exam
  const rankedRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM users u
       JOIN user_profiles up ON up.user_id = u.id
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE u.status = 'active' AND up.total_exams_completed > 0`
    )
    .get() as { cnt: number };

  const totalRankedStudents = Number(rankedRow.cnt || 0);
  let nationalRank = 0;

  if (totalExamsCompleted > 0 && totalRankedStudents > 0) {
    const aheadRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM users u
         JOIN user_profiles up ON up.user_id = u.id
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
         WHERE u.status = 'active' AND up.total_exams_completed > 0 AND up.overall_score > ?`
      )
      .get(overallScore) as { cnt: number };
    nationalRank = Number(aheadRow.cnt || 0) + 1;
  }

  return {
    id: String(row.id),
    name: String(row.full_name),
    email: String(row.email),
    phone: String(row.phone || ''),
    college: String(row.college),
    division: String(row.division),
    hscBatch: String(row.hsc_batch),
    targetTrack: String(row.target_university) as UniversityTrack,
    secondaryTrack: String(row.secondary_university) as UniversityTrack,
    avatarUrl: String(row.avatar_url),
    streakDays: Number(row.streak_days || 0),
    longestStreak: Number(row.longest_streak || 0),
    overallProgress: Number(row.overall_progress || 0),
    overallScore,
    averageAccuracy: Number(row.average_accuracy || 0),
    totalExamsCompleted,
    nationalRank,
    totalRankedStudents,
    rankDelta: Number(row.rank_delta || 0),
    createdAt: String(row.created_at),
  };
}

export function getSubjects(userId?: string): SubjectSummary[] {
  const db = getDb();
  const subjRows = db
    .prepare('SELECT * FROM subjects ORDER BY sort_order ASC, name ASC')
    .all() as Array<Record<string, unknown>>;

  const chapRows = db
    .prepare('SELECT * FROM chapters ORDER BY name ASC')
    .all() as Array<Record<string, unknown>>;

  // Real counts from PUBLISHED questions ONLY
  const qCounts = db
    .prepare(
      "SELECT subject_id, COUNT(*) AS cnt FROM questions WHERE status = 'Published' GROUP BY subject_id"
    )
    .all() as Array<{ subject_id: string; cnt: number }>;
  const countMap = new Map(qCounts.map((r) => [r.subject_id, Number(r.cnt)]));

  const chapQCounts = db
    .prepare(
      "SELECT chapter_id, COUNT(*) AS cnt FROM questions WHERE status = 'Published' AND chapter_id IS NOT NULL GROUP BY chapter_id"
    )
    .all() as Array<{ chapter_id: string; cnt: number }>;
  const chapCountMap = new Map(chapQCounts.map((r) => [r.chapter_id, Number(r.cnt)]));

  const userStatsMap = new Map<
    string,
    { attempted: number; correct: number }
  >();
  const weakestTopicBySubject = new Map<string, string>();

  if (userId) {
    const urRows = db
      .prepare(
        `SELECT subject_id, SUM(correct_count + incorrect_count) AS attempted, SUM(correct_count) AS correct
         FROM user_results
         WHERE user_id = ?
         GROUP BY subject_id`
      )
      .all(userId) as Array<{
      subject_id: string;
      attempted: number;
      correct: number;
    }>;
    for (const r of urRows) {
      userStatsMap.set(r.subject_id, {
        attempted: Number(r.attempted || 0),
        correct: Number(r.correct || 0),
      });
    }

    // Derive weakest topic per subject from user's real attempt history
    const attemptWeakRows = db
      .prepare(
        'SELECT topic_weaknesses_json FROM exam_attempts WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 20'
      )
      .all(userId) as Array<{ topic_weaknesses_json: string }>;

    const topicMissAgg = new Map<string, { subjectName: string; topic: string; missed: number }>();
    for (const r of attemptWeakRows) {
      try {
        const list = JSON.parse(r.topic_weaknesses_json || '[]') as TopicWeakness[];
        for (const w of list) {
          const key = `${w.subjectName}::${w.topic}`;
          const prev = topicMissAgg.get(key) ?? {
            subjectName: w.subjectName,
            topic: w.topic,
            missed: 0,
          };
          prev.missed += Number(w.missedCount || 0);
          topicMissAgg.set(key, prev);
        }
      } catch {
        // ignore malformed json
      }
    }
    for (const item of Array.from(topicMissAgg.values()).sort((a, b) => b.missed - a.missed)) {
      if (!weakestTopicBySubject.has(item.subjectName)) {
        weakestTopicBySubject.set(item.subjectName, item.topic);
      }
    }
  }

  return subjRows.map((s) => {
    const sid = String(s.id) as SubjectId;
    const subjName = String(s.name);
    const uStat = userStatsMap.get(sid);
    const solvedCount = uStat?.attempted ?? 0;
    const accuracy =
      uStat && uStat.attempted > 0
        ? Math.round((uStat.correct / uStat.attempted) * 100)
        : 0;
    const mastery =
      uStat && uStat.attempted > 0
        ? Math.min(100, Math.round(accuracy * 0.85 + Math.min(15, uStat.attempted * 0.5)))
        : 0;

    const chapters = chapRows
      .filter((c) => String(c.subject_id) === sid)
      .map((c) => ({
        id: String(c.id),
        name: String(c.name),
        banglaName: String(c.bangla_name),
        mastery: solvedCount > 0 ? mastery : 0,
        questionsCount: chapCountMap.get(String(c.id)) ?? 0,
      }));

    return {
      id: sid,
      name: subjName,
      banglaName: String(s.bangla_name),
      shortCode: String(s.short_code),
      mastery,
      accuracy,
      solvedCount,
      totalQuestions: countMap.get(sid) ?? 0,
      weakestTopic: weakestTopicBySubject.get(subjName) ?? '',
      chapters,
    };
  });
}

export function getAllQuestions(): QuestionItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT q.*, s.name AS subject_name,
              COALESCE(qe.explanation_en, '') AS explanation_en,
              COALESCE(qe.explanation_bn, '') AS explanation_bn,
              COALESCE(qs.source_name, '') AS source_name,
              COALESCE(qs.source_year, '') AS source_year
       FROM questions q
       JOIN subjects s ON s.id = q.subject_id
       LEFT JOIN question_explanations qe ON qe.question_id = q.id
       LEFT JOIN question_sources qs ON qs.question_id = q.id
       ORDER BY q.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const optRows = db
    .prepare('SELECT question_id, option_index, option_text FROM question_options ORDER BY option_index ASC')
    .all() as Array<{ question_id: string; option_index: number; option_text: string }>;

  const optMap = new Map<string, string[]>();
  for (const o of optRows) {
    const arr = optMap.get(o.question_id) ?? ['', '', '', ''];
    arr[Number(o.option_index)] = String(o.option_text);
    optMap.set(o.question_id, arr);
  }

  const fpCounts = new Map<string, number>();
  for (const r of rows) {
    const fp = String(r.fingerprint || '');
    if (fp) fpCounts.set(fp, (fpCounts.get(fp) ?? 0) + 1);
  }

  return rows.map((r) => {
    const qid = String(r.id);
    const opts = optMap.get(qid) ?? ['', '', '', ''];
    let warnings: string[] = [];
    try {
      warnings = JSON.parse(String(r.validation_warnings_json || '[]')) as string[];
    } catch {
      warnings = [];
    }
    const fp = String(r.fingerprint || '');
    return {
      id: qid,
      subjectId: String(r.subject_id) as SubjectId,
      subjectName: String(r.subject_name),
      chapter: String(r.chapter_name),
      topic: String(r.topic_name || r.chapter_name),
      universityTag: String(r.university_tag) as UniversityTrack,
      admissionCategory: String(r.admission_category || 'DU Ka'),
      difficulty: String(r.difficulty) as QuestionItem['difficulty'],
      prompt: String(r.prompt),
      promptBn: r.prompt_bn ? String(r.prompt_bn) : undefined,
      rawText: r.raw_text ? String(r.raw_text) : undefined,
      options: [opts[0] || '', opts[1] || '', opts[2] || '', opts[3] || ''],
      correctIndex: Number(r.correct_index),
      explanationEn: String(r.explanation_en),
      explanationBn: String(r.explanation_bn),
      marks: Number(r.marks ?? 1),
      negativeMarking: Number(r.negative_marking ?? 0.25),
      status: (String(r.status || 'Published') as QuestionStatus),
      answerConfidence: (String(r.answer_confidence || 'explicit') as 'explicit' | 'uncertain'),
      validationWarnings: warnings,
      duplicateCount: fp ? Math.max(0, (fpCounts.get(fp) ?? 1) - 1) : 0,
      imageUrl: r.image_url ? String(r.image_url) : undefined,
      sourceName: r.source_name ? String(r.source_name) : undefined,
      sourceYear: r.source_year ? String(r.source_year) : undefined,
      createdAt: String(r.created_at),
      updatedAt: r.updated_at ? String(r.updated_at) : undefined,
    };
  });
}

export function getPublishedStudentQuestions(): StudentQuestionItem[] {
  return getAllQuestions()
    .filter((q) => q.status === 'Published')
    .map(stripQuestionAnswerKey);
}

export function getExams(onlyPublished = false): ExamConfig[] {
  const db = getDb();
  const where = onlyPublished ? 'WHERE is_published = 1' : '';
  const rows = db
    .prepare(`SELECT * FROM exams ${where} ORDER BY created_at DESC`)
    .all() as Array<Record<string, unknown>>;

  const eqSql = onlyPublished
    ? `SELECT eq.exam_id, eq.question_id
       FROM exam_questions eq
       JOIN questions q ON q.id = eq.question_id
       WHERE q.status = 'Published'
       ORDER BY eq.sort_order ASC`
    : 'SELECT exam_id, question_id FROM exam_questions ORDER BY sort_order ASC';

  const eqRows = db.prepare(eqSql).all() as Array<{ exam_id: string; question_id: string }>;

  const qMap = new Map<string, string[]>();
  for (const eq of eqRows) {
    const list = qMap.get(eq.exam_id) ?? [];
    list.push(eq.question_id);
    qMap.set(eq.exam_id, list);
  }

  const mapped = rows.map((r) => {
    let sections: string[] = [];
    try {
      sections = JSON.parse(String(r.sections_json || '[]')) as string[];
    } catch {
      sections = [];
    }
    const qIds = qMap.get(String(r.id)) ?? [];
    return {
      id: String(r.id),
      title: String(r.title),
      subtitle: String(r.subtitle),
      universityTrack: String(r.university_track) as UniversityTrack,
      examType: String(r.exam_type || 'mock') as 'mock' | 'university',
      durationMinutes: Number(r.duration_minutes),
      totalMarks: Number(r.total_marks || qIds.length),
      negativeMarking: Number(r.negative_marking),
      scheduledAt: String(r.scheduled_at),
      isPublished: Boolean(Number(r.is_published)),
      status: String(r.status) as ExamConfig['status'],
      questionIds: qIds,
      sections,
      participantsCount: Number(r.participants_count),
    };
  });

  return onlyPublished ? mapped.filter((ex) => ex.questionIds.length > 0) : mapped;
}

export function getAttemptsForUser(userId: string): ExamAttempt[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ea.*, up.full_name AS user_name
       FROM exam_attempts ea
       LEFT JOIN user_profiles up ON up.user_id = ea.user_id
       WHERE ea.user_id = ?
       ORDER BY ea.submitted_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  const urRows = db
    .prepare('SELECT * FROM user_results WHERE user_id = ?')
    .all(userId) as Array<Record<string, unknown>>;

  const urByAttempt = new Map<string, SubjectBreakdown[]>();
  for (const ur of urRows) {
    const aid = String(ur.attempt_id);
    const list = urByAttempt.get(aid) ?? [];
    list.push({
      subjectId: String(ur.subject_id) as SubjectId,
      subjectName: String(ur.subject_name),
      total: Number(ur.total_count),
      correct: Number(ur.correct_count),
      incorrect: Number(ur.incorrect_count),
      skipped: Number(ur.skipped_count),
      score: Number(ur.score),
      maxScore: Number(ur.max_score),
      accuracy: Number(ur.accuracy),
    });
    urByAttempt.set(aid, list);
  }

  return rows.map((r) => {
    const aid = String(r.id);
    return {
      id: aid,
      userId: String(r.user_id),
      userName: r.user_name ? String(r.user_name) : undefined,
      examId: String(r.exam_id),
      examTitle: String(r.exam_title),
      universityTrack: String(r.university_track) as UniversityTrack,
      submittedAt: String(r.submitted_at),
      durationSecondsSpent: Number(r.duration_seconds_spent),
      totalQuestions: Number(r.total_questions),
      correctCount: Number(r.correct_count),
      incorrectCount: Number(r.incorrect_count),
      skippedCount: Number(r.skipped_count),
      rawScore: Number(r.raw_score),
      maxScore: Number(r.max_score),
      accuracy: Number(r.accuracy),
      answers: JSON.parse(String(r.answers_json || '{}')) as Record<string, number | null>,
      markedForReview: JSON.parse(String(r.marked_for_review_json || '[]')) as string[],
      subjectBreakdown: urByAttempt.get(aid) ?? [],
      topicWeaknesses: JSON.parse(String(r.topic_weaknesses_json || '[]')) as TopicWeakness[],
      aiAnalysis: r.ai_analysis ? String(r.ai_analysis) : undefined,
    };
  });
}

export function getAttemptReview(
  userId: string,
  attemptId: string
): {
  attempt: ExamAttempt;
  questions: QuestionItem[];
  gradedQuestions: GradedQuestionReview[];
} | null {
  const attempt = getAttemptsForUser(userId).find((a) => a.id === attemptId);
  if (!attempt) return null;

  const exam = getExams(false).find((e) => e.id === attempt.examId);
  const allQs = getAllQuestions();
  const qMap = new Map(allQs.map((q) => [q.id, q]));

  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const qid of exam?.questionIds ?? []) {
    if (!seen.has(qid)) {
      seen.add(qid);
      orderedIds.push(qid);
    }
  }
  for (const qid of Object.keys(attempt.answers)) {
    if (!seen.has(qid)) {
      seen.add(qid);
      orderedIds.push(qid);
    }
  }

  const questions = orderedIds
    .map((qid) => qMap.get(qid))
    .filter((q): q is QuestionItem => Boolean(q));

  const gradedQuestions: GradedQuestionReview[] = questions.map((q) => {
    const rawSel = attempt.answers[q.id];
    const sel =
      typeof rawSel === 'number' && Number.isInteger(rawSel) && rawSel >= 0 && rawSel <= 3
        ? rawSel
        : null;
    return {
      questionId: q.id,
      selectedIndex: sel,
      correctIndex: q.correctIndex,
      isCorrect: sel !== null && sel === q.correctIndex,
      explanationEn: q.explanationEn,
      explanationBn: q.explanationBn,
    };
  });

  return { attempt, questions, gradedQuestions };
}

export function getQuestionForStudentAttemptReview(
  userId: string,
  attemptId: string,
  questionId: string
): {
  attempt: ExamAttempt;
  question: QuestionItem;
  selectedIndex: number | null;
} | null {
  const attempt = getAttemptsForUser(userId).find((a) => a.id === attemptId);
  if (!attempt) return null;

  const exam = getExams(false).find((e) => e.id === attempt.examId);
  const belongsToAttempt =
    Boolean(exam?.questionIds.includes(questionId)) ||
    Object.prototype.hasOwnProperty.call(attempt.answers, questionId);
  if (!belongsToAttempt) return null;

  const question = getAllQuestions().find((q) => q.id === questionId);
  if (!question) return null;

  const rawSel = attempt.answers[questionId];
  const selectedIndex =
    typeof rawSel === 'number' && Number.isInteger(rawSel) && rawSel >= 0 && rawSel <= 3
      ? rawSel
      : null;

  return { attempt, question, selectedIndex };
}

export function checkPracticeAnswer(
  questionId: string,
  selectedIndex: number | null
): {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanationEn: string;
  explanationBn: string;
} {
  const q = getAllQuestions().find((item) => item.id === questionId && item.status === 'Published');
  if (!q) {
    throw new Error('প্রশ্নটি পাওয়া যায়নি বা এখনো প্রকাশিত হয়নি।');
  }
  return {
    questionId: q.id,
    selectedIndex,
    correctIndex: q.correctIndex,
    isCorrect: selectedIndex !== null && selectedIndex === q.correctIndex,
    explanationEn: q.explanationEn,
    explanationBn: q.explanationBn,
  };
}

export function getLeaderboard(activeUserId?: string): LeaderboardEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.id, up.full_name, up.division, up.target_university, up.avatar_url,
              up.overall_score, up.average_accuracy, up.total_exams_completed, up.streak_days
       FROM users u
       JOIN user_profiles up ON up.user_id = u.id
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE u.status = 'active' AND up.total_exams_completed > 0
       ORDER BY up.overall_score DESC, up.average_accuracy DESC, up.total_exams_completed DESC
       LIMIT 20`
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r, idx) => {
    const name = String(r.full_name);
    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
    return {
      id: String(r.id),
      rank: idx + 1,
      displayName: name,
      city: String(r.division),
      targetUniversity: String(r.target_university) as UniversityTrack,
      avatarUrl: r.avatar_url ? String(r.avatar_url) : undefined,
      initials: initials || 'ST',
      weeklyScore: Number(r.overall_score),
      accuracy: Number(r.average_accuracy),
      examsCompleted: Number(r.total_exams_completed),
      streakDays: Number(r.streak_days),
      isCurrentUser: Boolean(activeUserId && String(r.id) === activeUserId),
    };
  });
}

function buildDefaultWeeklyPerformance(): WeeklyPerformancePoint[] {
  const labels = ['শনি', 'রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র'];
  const points: WeeklyPerformancePoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    points.push({
      day: labels[d.getDay() === 6 ? 0 : d.getDay() + 1] ?? 'আজ',
      dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
      score: 0,
      accuracy: 0,
      minutesStudied: 0,
    });
  }
  return points;
}

export function getWeeklyPerformance(userId: string): WeeklyPerformancePoint[] {
  const perUser = getKv<WeeklyPerformancePoint[] | null>(`weeklyPerformance:${userId}`, null);
  if (perUser && perUser.length > 0) return perUser;
  return buildDefaultWeeklyPerformance();
}

export function getContinueLearning(userId: string): ContinueLearningModule[] {
  return getKv<ContinueLearningModule[]>(`continueLearning:${userId}`, []);
}

export function getDailyChallenge(userId: string): DailyChallenge {
  const today = new Date().toISOString().slice(0, 10);
  const key = `dailyChallenge:${userId}:${today}`;
  const saved = getKv<{
    id: string;
    date: string;
    questionId: string | null;
    completed: boolean;
    selectedIndex: number | null;
    isCorrect: boolean | null;
  } | null>(key, null);

  const publishedQuestions = getAllQuestions().filter((q) => q.status === 'Published');
  if (publishedQuestions.length === 0) {
    return {
      id: `dc-${today}`,
      date: today,
      title: 'আজকের অ্যাডমিশন চ্যালেঞ্জ',
      question: null,
      completed: false,
      selectedIndex: null,
      isCorrect: null,
    };
  }

  let targetQuestion = saved?.questionId
    ? publishedQuestions.find((q) => q.id === saved.questionId)
    : undefined;

  if (!targetQuestion) {
    // Pick deterministic daily question from real published pool
    const dayIndex = Math.floor(Date.now() / 86_400_000) % publishedQuestions.length;
    targetQuestion = publishedQuestions[dayIndex];
  }

  const completed = Boolean(saved?.completed && saved.questionId === targetQuestion.id);

  return {
    id: saved?.id ?? `dc-${today}`,
    date: today,
    title: 'আজকের অ্যাডমিশন চ্যালেঞ্জ',
    question: stripQuestionAnswerKey(targetQuestion),
    completed,
    selectedIndex: completed ? (saved?.selectedIndex ?? null) : null,
    isCorrect: completed ? (saved?.isCorrect ?? null) : null,
    ...(completed
      ? {
          correctIndex: targetQuestion.correctIndex,
          explanationEn: targetQuestion.explanationEn,
          explanationBn: targetQuestion.explanationBn,
        }
      : {}),
  };
}

export function getNotificationsForUser(userId: string): StudentNotificationItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, message, type, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .all(userId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    message: String(r.message),
    type: String(r.type || 'info'),
    isRead: Boolean(Number(r.is_read)),
    createdAt: String(r.created_at),
  }));
}

export function markNotificationsRead(userId: string): StudentNotificationItem[] {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  return getNotificationsForUser(userId);
}

export function getBootstrapData(userId: string): BootstrapPayload {
  return {
    student: getStudentProfile(userId),
    subjects: getSubjects(userId),
    weeklyPerformance: getWeeklyPerformance(userId),
    continueLearning: getContinueLearning(userId),
    dailyChallenge: getDailyChallenge(userId),
    exams: getExams(true),
    questions: getPublishedStudentQuestions(),
    attempts: getAttemptsForUser(userId),
    leaderboard: getLeaderboard(userId),
    notifications: getNotificationsForUser(userId),
    aiStatus: getAiStatus(),
  };
}

export function answerDailyChallenge(
  userId: string,
  selectedIndex: number
): {
  dailyChallenge: DailyChallenge;
  student: StudentProfile;
} {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const key = `dailyChallenge:${userId}:${today}`;
  const current = getDailyChallenge(userId);

  if (!current.question) {
    throw new Error('এখনো কোনো প্রকাশিত প্রশ্ন নেই, তাই আজকের চ্যালেঞ্জ চালু করা যায়নি।');
  }

  const fullQuestion = getAllQuestions().find(
    (q) => q.id === current.question!.id && q.status === 'Published'
  );
  if (!fullQuestion) {
    throw new Error('চ্যালেঞ্জ প্রশ্নটি প্রশ্ন ব্যাংকে পাওয়া যায়নি।');
  }

  const isCorrect = selectedIndex === fullQuestion.correctIndex;

  if (!current.completed) {
    setKv(key, {
      id: current.id,
      date: today,
      questionId: fullQuestion.id,
      completed: true,
      selectedIndex,
      isCorrect,
    });

    if (isCorrect) {
      db.prepare(
        `UPDATE user_profiles
         SET streak_days = streak_days + 1,
             longest_streak = MAX(longest_streak, streak_days + 1)
         WHERE user_id = ?`
      ).run(userId);
    }
  }

  return {
    dailyChallenge: getDailyChallenge(userId),
    student: getStudentProfile(userId),
  };
}

export function updateStudentTrack(
  userId: string,
  targetTrack: UniversityTrack
): StudentProfile {
  const db = getDb();
  db.prepare('UPDATE user_profiles SET target_university = ? WHERE user_id = ?').run(
    targetTrack,
    userId
  );
  return getStudentProfile(userId);
}

export function updateStudentProfile(
  userId: string,
  patch: {
    name: string;
    phone: string;
    college: string;
    division: string;
    hscBatch: string;
    targetTrack: UniversityTrack;
    secondaryTrack: UniversityTrack;
  }
): StudentProfile {
  const db = getDb();
  const cleanName = patch.name.trim();
  if (cleanName.length < 2) {
    throw new Error('শিক্ষার্থীর নাম কমপক্ষে ২ অক্ষরের হতে হবে।');
  }
  const cleanPhone = normalizeBdPhone(patch.phone.trim());
  if (!isValidBdPhone(cleanPhone)) {
    throw new Error('সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।');
  }

  const phoneConflict = db
    .prepare('SELECT id FROM users WHERE phone = ? AND id != ?')
    .get(cleanPhone, userId) as { id: string } | undefined;
  if (phoneConflict) {
    throw new Error('এই মোবাইল নম্বরটি ইতিমধ্যে অন্য একটি অ্যাকাউন্টে ব্যবহৃত হচ্ছে।');
  }

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(cleanPhone, userId);
    db.prepare(
      `UPDATE user_profiles
       SET full_name = ?, college = ?, division = ?, hsc_batch = ?,
           target_university = ?, secondary_university = ?
       WHERE user_id = ?`
    ).run(
      cleanName,
      patch.college.trim(),
      patch.division.trim() || 'Dhaka',
      patch.hscBatch.trim() || 'HSC 2026',
      patch.targetTrack,
      patch.secondaryTrack,
      userId
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getStudentProfile(userId);
}

export function updateStudentAvatar(userId: string, avatarUrl: string): StudentProfile {
  const db = getDb();
  db.prepare('UPDATE user_profiles SET avatar_url = ? WHERE user_id = ?').run(
    avatarUrl,
    userId
  );
  return getStudentProfile(userId);
}

// --- Student Authentication Store Operations ---

export function registerStudent(input: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  hscBatch: string;
  targetTrack: UniversityTrack;
}): StudentProfile {
  const db = getDb();
  const cleanName = input.fullName.trim();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanPhone = normalizeBdPhone(input.phone.trim());

  if (cleanName.length < 2) {
    throw new Error('শিক্ষার্থীর পূর্ণ নাম দিন (কমপক্ষে ২ অক্ষর)।');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('সঠিক ইমেইল ঠিকানা দিন।');
  }
  if (!isValidBdPhone(cleanPhone)) {
    throw new Error('সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।');
  }
  if (!input.password || input.password.length < 8) {
    throw new Error('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
  }

  const emailExists = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
    .get(cleanEmail) as { id: string } | undefined;
  if (emailExists) {
    throw new Error('এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি করা আছে।');
  }

  const phoneExists = db
    .prepare('SELECT id FROM users WHERE phone = ?')
    .get(cleanPhone) as { id: string } | undefined;
  if (phoneExists) {
    throw new Error('এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি করা আছে।');
  }

  const userId = `stu-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const now = new Date().toISOString();
  const passHash = hashPassword(input.password);
  const secondaryTrack: UniversityTrack =
    input.targetTrack === 'BUET' ? 'DU Ka' : 'BUET';

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      `INSERT INTO users (id, email, phone, password_hash, status, created_at, last_login_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).run(userId, cleanEmail, cleanPhone, passHash, now, now);

    db.prepare(
      `INSERT INTO user_profiles (
        user_id, full_name, college, division, hsc_batch, target_university, secondary_university,
        avatar_url, streak_days, longest_streak, overall_progress, overall_score, average_accuracy,
        total_exams_completed, national_rank, total_ranked_students, rank_delta
      ) VALUES (?, ?, '', 'Dhaka', ?, ?, ?, '', 0, 0, 0, 0, 0, 0, 0, 0, 0)`
    ).run(userId, cleanName, input.hscBatch || 'HSC 2026', input.targetTrack, secondaryTrack);

    db.prepare(
      "INSERT INTO user_roles (user_id, role, assigned_at) VALUES (?, 'student', ?)"
    ).run(userId, now);

    db.prepare(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 'welcome', 0, ?)`
    ).run(
      `notif-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      userId,
      'ADMITLY AI-তে স্বাগতম!',
      `আপনার ${input.targetTrack} ভর্তি প্রস্তুতির ড্যাশবোর্ড প্রস্তুত।`,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getStudentProfile(userId);
}

export function loginStudent(input: {
  identifier: string;
  password: string;
}): StudentProfile {
  const db = getDb();
  const rawId = input.identifier.trim();
  const normalizedPhone = normalizeBdPhone(rawId);
  const cleanEmail = rawId.toLowerCase();

  const row = db
    .prepare(
      `SELECT u.id, u.email, u.phone, u.password_hash, u.status
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE LOWER(u.email) = ? OR (u.phone != '' AND u.phone = ?)`
    )
    .get(cleanEmail, normalizedPhone) as
    | {
        id: string;
        email: string;
        phone: string;
        password_hash: string;
        status: string;
      }
    | undefined;

  if (!row || !verifyPassword(input.password, row.password_hash)) {
    throw new Error('ইমেইল/মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।');
  }

  if (row.status !== 'active') {
    throw new Error('আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।');
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    row.id
  );

  return getStudentProfile(row.id);
}

function maskIdentifier(email: string, phone: string, matchedByPhone: boolean): string {
  if (matchedByPhone && phone.length >= 6) {
    return `${phone.slice(0, 3)}*****${phone.slice(-3)}`;
  }
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function createStudentPasswordOtp(identifier: string): {
  sent: boolean;
  maskedTarget: string;
  expiresAt: string;
  previewCode?: string;
} {
  const db = getDb();
  const raw = identifier.trim();
  const normalizedPhone = normalizeBdPhone(raw);
  const cleanEmail = raw.toLowerCase();

  const user = db
    .prepare(
      `SELECT u.id, u.email, COALESCE(u.phone, '') AS phone, u.status
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE LOWER(u.email) = ? OR (u.phone != '' AND u.phone = ?)`
    )
    .get(cleanEmail, normalizedPhone) as
    | { id: string; email: string; phone: string; status: string }
    | undefined;

  if (!user) {
    throw new Error('এই ইমেইল বা মোবাইল নম্বরের সাথে কোনো শিক্ষার্থী অ্যাকাউন্ট পাওয়া যায়নি।');
  }
  if (user.status !== 'active') {
    throw new Error('এই অ্যাকাউন্টটি স্থগিত করা আছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।');
  }

  const otp = String(crypto.randomInt(100000, 999999));
  const codeHash = hashResetToken(otp);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      'UPDATE auth_otp_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL'
    ).run(now, user.id);

    db.prepare(
      `INSERT INTO auth_otp_codes (id, user_id, identifier, code_hash, attempts, expires_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    ).run(
      `otp-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      user.id,
      raw,
      codeHash,
      expiresAt,
      now
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const matchedByPhone = Boolean(user.phone && user.phone === normalizedPhone);
  return {
    sent: true,
    maskedTarget: maskIdentifier(user.email, user.phone, matchedByPhone),
    expiresAt,
    previewCode: process.env.NODE_ENV !== 'production' ? otp : undefined,
  };
}

export function verifyStudentPasswordOtpAndReset(input: {
  identifier: string;
  otp: string;
  newPassword: string;
}): { reset: boolean } {
  const db = getDb();
  const raw = input.identifier.trim();
  const normalizedPhone = normalizeBdPhone(raw);
  const cleanEmail = raw.toLowerCase();

  if (!input.newPassword || input.newPassword.length < 8) {
    throw new Error('নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
  }

  const user = db
    .prepare(
      `SELECT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE LOWER(u.email) = ? OR (u.phone != '' AND u.phone = ?)`
    )
    .get(cleanEmail, normalizedPhone) as { id: string } | undefined;

  if (!user) {
    throw new Error('অ্যাকাউন্ট পাওয়া যায়নি।');
  }

  const otpRow = db
    .prepare(
      `SELECT id, code_hash, attempts, expires_at
       FROM auth_otp_codes
       WHERE user_id = ? AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(user.id) as
    | { id: string; code_hash: string; attempts: number; expires_at: string }
    | undefined;

  if (!otpRow) {
    throw new Error('কোনো সক্রিয় যাচাইকরণ কোড পাওয়া যায়নি। নতুন কোড পাঠান।');
  }
  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    throw new Error('যাচাইকরণ কোডের মেয়াদ শেষ হয়ে গেছে। নতুন কোড অনুরোধ করুন।');
  }
  if (Number(otpRow.attempts) >= 5) {
    throw new Error('অনেকবার ভুল কোড দেওয়া হয়েছে। অনুগ্রহ করে নতুন কোড পাঠান।');
  }

  const cleanOtp = input.otp.trim();
  if (!verifyHashTimingSafe(cleanOtp, otpRow.code_hash)) {
    db.prepare('UPDATE auth_otp_codes SET attempts = attempts + 1 WHERE id = ?').run(
      otpRow.id
    );
    throw new Error('যাচাইকরণ কোডটি সঠিক নয়।');
  }

  const now = new Date().toISOString();
  const newHash = hashPassword(input.newPassword);

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
    db.prepare('UPDATE auth_otp_codes SET used_at = ? WHERE id = ?').run(now, otpRow.id);
    db.prepare(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, 'পাসওয়ার্ড পরিবর্তন সম্পন্ন', 'আপনার অ্যাকাউন্টের পাসওয়ার্ড সফলভাবে রিসেট করা হয়েছে।', 'security', 0, ?)`
    ).run(
      `notif-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      user.id,
      now
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { reset: true };
}

export function logAiUsage(entry: Omit<AiUsageLog, 'id' | 'timestamp'>): void {
  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO ai_usage_logs (id, timestamp, feature, model, status, latency_ms, summary) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      `ai-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      new Date().toISOString(),
      entry.feature,
      entry.model,
      entry.status,
      entry.latencyMs,
      entry.summary
    );
  } catch (err) {
    console.warn('Failed to log AI usage:', err);
  }
}

export function saveAttemptAiAnalysis(
  userId: string,
  attemptId: string,
  analysis: string
): ExamAttempt | null {
  const db = getDb();
  const res = db
    .prepare('UPDATE exam_attempts SET ai_analysis = ? WHERE id = ? AND user_id = ?')
    .run(analysis, attemptId, userId);
  if (Number(res.changes) === 0) return null;
  const userAttempts = getAttemptsForUser(userId);
  return userAttempts.find((a) => a.id === attemptId) ?? null;
}

export function gradeAndRecordAttempt(
  studentId: string,
  params: {
    examId: string;
    answers: Record<string, number | null>;
    markedForReview: string[];
    durationSecondsSpent: number;
    submissionId?: string;
  }
): {
  attempt: ExamAttempt;
  gradedQuestions: GradedQuestionReview[];
} {
  const db = getDb();
  const cleanSubmissionId = (params.submissionId ?? '').trim().slice(0, 120);

  if (cleanSubmissionId) {
    const existing = db
      .prepare('SELECT id FROM exam_attempts WHERE user_id = ? AND submission_id = ?')
      .get(studentId, cleanSubmissionId) as { id: string } | undefined;
    if (existing) {
      const dupErr = new Error(
        'এই পরীক্ষাটি ইতিমধ্যে জমা দেওয়া হয়েছে। ফলাফল পেজে আপনার উত্তর সংরক্ষিত আছে।'
      ) as Error & { code?: string };
      dupErr.code = 'DUPLICATE_SUBMISSION';
      throw dupErr;
    }
  }

  const exam = getExams(true).find((e) => e.id === params.examId);
  if (!exam) {
    throw new Error('প্রকাশিত পরীক্ষাটি পাওয়া যায়নি।');
  }

  const allQuestions = getAllQuestions().filter((q) => q.status === 'Published');
  const qMap = new Map(allQuestions.map((q) => [q.id, q]));
  const examQuestions = exam.questionIds
    .map((id) => qMap.get(id))
    .filter((q): q is QuestionItem => Boolean(q));

  if (examQuestions.length === 0) {
    throw new Error('এই পরীক্ষায় এখনো কোনো প্রকাশিত প্রশ্ন যুক্ত নেই।');
  }

  const normalizedAnswers: Record<string, number | null> = {};
  for (const q of examQuestions) {
    const rawVal = params.answers[q.id];
    if (rawVal === undefined || rawVal === null) {
      normalizedAnswers[q.id] = null;
    } else if (typeof rawVal === 'number' && Number.isInteger(rawVal) && rawVal >= 0 && rawVal <= 3) {
      normalizedAnswers[q.id] = rawVal;
    } else {
      throw new Error('অবৈধ উত্তর অপশন পাওয়া গেছে।');
    }
  }

  const examQuestionIdSet = new Set(examQuestions.map((q) => q.id));
  const cleanMarked = Array.from(
    new Set(params.markedForReview.filter((id) => examQuestionIdSet.has(id)))
  );

  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;
  let rawScoreTotal = 0;
  let maxScoreTotal = 0;

  const subjectMap = new Map<
    SubjectId,
    {
      subjectName: string;
      total: number;
      correct: number;
      incorrect: number;
      skipped: number;
      score: number;
      maxScore: number;
    }
  >();
  const topicMap = new Map<string, { subjectName: string; totalCount: number; missedCount: number }>();
  const gradedQuestions: GradedQuestionReview[] = [];

  for (const q of examQuestions) {
    const qMarks = Number(q.marks ?? 1) > 0 ? Number(q.marks ?? 1) : 1;
    maxScoreTotal += qMarks;

    const selected = normalizedAnswers[q.id] ?? null;
    const subj = subjectMap.get(q.subjectId) ?? {
      subjectName: q.subjectName,
      total: 0,
      correct: 0,
      incorrect: 0,
      skipped: 0,
      score: 0,
      maxScore: 0,
    };
    subj.total += 1;
    subj.maxScore += qMarks;

    const topicKey = `${q.subjectName}::${q.chapter}`;
    const topicStats = topicMap.get(topicKey) ?? {
      subjectName: q.subjectName,
      totalCount: 0,
      missedCount: 0,
    };
    topicStats.totalCount += 1;

    let isCorrect = false;
    if (selected === null || selected === undefined) {
      skippedCount += 1;
      subj.skipped += 1;
      topicStats.missedCount += 1;
    } else if (selected === q.correctIndex) {
      isCorrect = true;
      correctCount += 1;
      subj.correct += 1;
      subj.score += qMarks;
      rawScoreTotal += qMarks;
    } else {
      incorrectCount += 1;
      subj.incorrect += 1;
      subj.score -= exam.negativeMarking;
      rawScoreTotal -= exam.negativeMarking;
      topicStats.missedCount += 1;
    }

    subjectMap.set(q.subjectId, subj);
    topicMap.set(topicKey, topicStats);
    gradedQuestions.push({
      questionId: q.id,
      selectedIndex: selected,
      correctIndex: q.correctIndex,
      isCorrect,
      explanationEn: q.explanationEn,
      explanationBn: q.explanationBn,
    });
  }

  const rawScore = Number(rawScoreTotal.toFixed(2));
  const maxScore = Number(maxScoreTotal.toFixed(2));
  const attempted = correctCount + incorrectCount;
  const accuracy =
    attempted > 0 ? Number(((correctCount / attempted) * 100).toFixed(2)) : 0;

  const subjectBreakdown: SubjectBreakdown[] = Array.from(subjectMap.entries()).map(
    ([subjectId, stats]) => {
      const subjAttempted = stats.correct + stats.incorrect;
      return {
        subjectId,
        subjectName: stats.subjectName,
        total: stats.total,
        correct: stats.correct,
        incorrect: stats.incorrect,
        skipped: stats.skipped,
        score: Number(stats.score.toFixed(2)),
        maxScore: Number(stats.maxScore.toFixed(2)),
        accuracy:
          subjAttempted > 0
            ? Number(((stats.correct / subjAttempted) * 100).toFixed(2))
            : 0,
      };
    }
  );

  const topicWeaknesses: TopicWeakness[] = Array.from(topicMap.entries())
    .map(([key, stats]) => {
      const topic = key.split('::')[1];
      const topicAcc = Math.round(((stats.totalCount - stats.missedCount) / stats.totalCount) * 100);
      return {
        topic,
        subjectName: stats.subjectName,
        accuracy: topicAcc,
        missedCount: stats.missedCount,
        totalCount: stats.totalCount,
      };
    })
    .filter((t) => t.missedCount > 0)
    .sort((a, b) => a.accuracy - b.accuracy);

  const student = getStudentProfile(studentId);
  const attemptId = `att-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const submittedAt = new Date().toISOString();
  const durationSpent = Math.max(1, Math.round(params.durationSecondsSpent));

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      `INSERT INTO exam_attempts (
        id, user_id, exam_id, exam_title, university_track, submitted_at, duration_seconds_spent,
        total_questions, correct_count, incorrect_count, skipped_count, raw_score, max_score,
        accuracy, answers_json, marked_for_review_json, topic_weaknesses_json, ai_analysis, submission_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attemptId,
      studentId,
      exam.id,
      exam.title,
      exam.universityTrack,
      submittedAt,
      durationSpent,
      examQuestions.length,
      correctCount,
      incorrectCount,
      skippedCount,
      rawScore,
      maxScore,
      accuracy,
      JSON.stringify(normalizedAnswers),
      JSON.stringify(cleanMarked),
      JSON.stringify(topicWeaknesses),
      null,
      cleanSubmissionId
    );

    const insertUr = db.prepare(
      `INSERT INTO user_results (
        attempt_id, user_id, subject_id, subject_name, total_count, correct_count,
        incorrect_count, skipped_count, score, max_score, accuracy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const sb of subjectBreakdown) {
      insertUr.run(
        attemptId,
        studentId,
        sb.subjectId,
        sb.subjectName,
        sb.total,
        sb.correct,
        sb.incorrect,
        sb.skipped,
        sb.score,
        sb.maxScore,
        sb.accuracy
      );
    }

    const totalExams = student.totalExamsCompleted + 1;
    const prevWeightedAcc = student.averageAccuracy * student.totalExamsCompleted;
    const nextAvgAccuracy = Number(((prevWeightedAcc + accuracy) / totalExams).toFixed(1));
    const scorePct = maxScore > 0 ? Math.max(0, Math.min(100, (rawScore / maxScore) * 100)) : 0;
    const nextOverallScore =
      student.totalExamsCompleted === 0
        ? Number(scorePct.toFixed(1))
        : Number(((student.overallScore * student.totalExamsCompleted + scorePct) / totalExams).toFixed(1));
    const nextOverallProgress = Math.min(
      100,
      Math.round(nextAvgAccuracy * 0.6 + Math.min(40, totalExams * 8))
    );
    const nextStreak = Math.max(1, student.streakDays);

    db.prepare(
      `UPDATE user_profiles
       SET total_exams_completed = ?, average_accuracy = ?, overall_score = ?,
           overall_progress = ?, streak_days = ?, longest_streak = MAX(longest_streak, ?)
       WHERE user_id = ?`
    ).run(
      totalExams,
      nextAvgAccuracy,
      nextOverallScore,
      nextOverallProgress,
      nextStreak,
      nextStreak,
      studentId
    );

    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(submittedAt, studentId);
    db.prepare('UPDATE exams SET participants_count = participants_count + 1 WHERE id = ?').run(exam.id);

    const weekly = getWeeklyPerformance(studentId);
    const lastDay = weekly[weekly.length - 1];
    if (lastDay) {
      lastDay.score = Math.round(scorePct);
      lastDay.accuracy = accuracy;
      lastDay.minutesStudied += Math.max(1, Math.round(params.durationSecondsSpent / 60));
      setKv(`weeklyPerformance:${studentId}`, weekly);
    }

    // Update student's Continue Learning modules based on actual exam chapters practiced
    const existingModules = getContinueLearning(studentId);
    const newModuleMap = new Map(existingModules.map((m) => [m.subjectId, m]));
    for (const sb of subjectBreakdown) {
      const sampleQ = examQuestions.find((q) => q.subjectId === sb.subjectId);
      newModuleMap.set(sb.subjectId, {
        id: `cl-${sb.subjectId}`,
        subjectId: sb.subjectId,
        subjectName: sb.subjectName,
        chapterTitle: sampleQ?.chapter || sb.subjectName,
        banglaSubtitle: `${exam.title}`,
        progressPercent: sb.accuracy,
        remainingMinutes: Math.max(10, sb.incorrect * 5 + 10),
        lastStudiedLabel: 'সর্বশেষ পরীক্ষা',
      });
    }
    setKv(`continueLearning:${studentId}`, Array.from(newModuleMap.values()).slice(0, 4));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE constraint failed') && msg.includes('submission_id')) {
      const dupErr = new Error(
        'এই পরীক্ষাটি ইতিমধ্যে জমা দেওয়া হয়েছে। ফলাফল পেজে আপনার উত্তর সংরক্ষিত আছে।'
      ) as Error & { code?: string };
      dupErr.code = 'DUPLICATE_SUBMISSION';
      throw dupErr;
    }
    throw err;
  }

  return {
    attempt: {
      id: attemptId,
      userId: studentId,
      userName: student.name,
      examId: exam.id,
      examTitle: exam.title,
      universityTrack: exam.universityTrack,
      submittedAt,
      durationSecondsSpent: durationSpent,
      totalQuestions: examQuestions.length,
      correctCount,
      incorrectCount,
      skippedCount,
      rawScore,
      maxScore,
      accuracy,
      answers: normalizedAnswers,
      markedForReview: cleanMarked,
      subjectBreakdown,
      topicWeaknesses,
    },
    gradedQuestions,
  };
}

// --- Admin Question Bank Operations ---

function syncChapterCounts(db: ReturnType<typeof getDb>): void {
  db.exec(`
    UPDATE chapters
    SET questions_count = (
      SELECT COUNT(*) FROM questions q
      WHERE q.chapter_id = chapters.id AND q.status = 'Published'
    );
  `);
}

function recordQuestionHistory(
  db: ReturnType<typeof getDb>,
  params: {
    questionId: string;
    changedBy: string;
    changeSummary: string;
    previousSnapshot: Record<string, unknown>;
    newSnapshot: Record<string, unknown>;
  }
): void {
  db.prepare(
    `INSERT INTO question_history (
      id, question_id, changed_by, change_summary, previous_snapshot_json, new_snapshot_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `qh-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
    params.questionId,
    params.changedBy || 'admin',
    params.changeSummary,
    JSON.stringify(params.previousSnapshot),
    JSON.stringify(params.newSnapshot),
    new Date().toISOString()
  );
}

export function createQuestion(input: {
  subjectId: SubjectId;
  subjectName?: string;
  chapter: string;
  topic?: string;
  universityTag: UniversityTrack;
  admissionCategory?: string;
  difficulty: 'Foundation' | 'Standard' | 'Admission Hard';
  prompt: string;
  promptBn?: string;
  rawText?: string;
  options: [string, string, string, string];
  correctIndex: number;
  marks?: number;
  negativeMarking?: number;
  status?: QuestionStatus;
  answerConfidence?: 'explicit' | 'uncertain';
  validationWarnings?: string[];
  aiFormatted?: boolean;
  explanationEn?: string;
  explanationBn?: string;
  imageUrl?: string;
  sourceName?: string;
  sourceYear?: string;
}): QuestionItem {
  const db = getDb();
  const mapped = mapLegacySubjectId(input.subjectId, input.subjectName, input.prompt);
  const id = `q-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const topicVal = (input.topic ?? '').trim() || input.chapter.trim();
  const safeCorrect = Math.min(3, Math.max(0, Number(input.correctIndex) || 0));
  const status: QuestionStatus = input.status ?? 'Published';
  const marks = Number(input.marks ?? 1) > 0 ? Number(input.marks ?? 1) : 1;
  const neg = Number(input.negativeMarking ?? 0.25) >= 0 ? Number(input.negativeMarking ?? 0.25) : 0.25;

  db.exec('BEGIN TRANSACTION');
  try {
    const { chapterId, topicId } = ensureChapterAndTopic(
      db,
      mapped.subjectId,
      input.chapter,
      topicVal
    );
    db.prepare(
      `INSERT INTO questions (
        id, subject_id, chapter_id, topic_id, chapter_name, topic_name, university_tag,
        admission_category, difficulty, prompt, prompt_bn, raw_text, correct_index,
        marks, negative_marking, status, answer_confidence, validation_warnings_json,
        ai_formatted, image_url, fingerprint, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      mapped.subjectId,
      chapterId,
      topicId,
      input.chapter.trim() || 'General',
      topicVal,
      input.universityTag,
      (input.admissionCategory ?? input.universityTag ?? 'DU Ka').trim(),
      input.difficulty,
      input.prompt.trim(),
      (input.promptBn ?? '').trim(),
      (input.rawText ?? input.prompt).trim(),
      safeCorrect,
      marks,
      neg,
      status,
      input.answerConfidence ?? 'explicit',
      JSON.stringify(input.validationWarnings ?? []),
      input.aiFormatted ? 1 : 0,
      input.imageUrl || null,
      normalizePromptFingerprint(input.prompt),
      createdAt,
      createdAt
    );

    const insOpt = db.prepare(
      'INSERT INTO question_options (id, question_id, option_index, option_text) VALUES (?, ?, ?, ?)'
    );
    input.options.forEach((opt, idx) => {
      insOpt.run(`${id}-opt-${idx}`, id, idx, opt.trim());
    });

    db.prepare(
      'INSERT INTO question_explanations (question_id, explanation_en, explanation_bn) VALUES (?, ?, ?)'
    ).run(id, (input.explanationEn ?? '').trim(), (input.explanationBn ?? '').trim());

    db.prepare(
      'INSERT INTO question_sources (question_id, source_name, source_year) VALUES (?, ?, ?)'
    ).run(id, (input.sourceName ?? '').trim(), (input.sourceYear ?? '').trim());

    recordQuestionHistory(db, {
      questionId: id,
      changedBy: 'admin',
      changeSummary: `Created question (${status})`,
      previousSnapshot: {},
      newSnapshot: {
        prompt: input.prompt.trim(),
        correctIndex: safeCorrect,
        status,
        subjectId: mapped.subjectId,
        chapter: input.chapter.trim() || 'General',
      },
    });

    syncChapterCounts(db);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getAllQuestions().find((q) => q.id === id)!;
}

export function updateQuestion(
  id: string,
  input: Partial<{
    subjectId: SubjectId;
    chapter: string;
    topic: string;
    universityTag: UniversityTrack;
    admissionCategory: string;
    difficulty: 'Foundation' | 'Standard' | 'Admission Hard';
    prompt: string;
    promptBn: string;
    options: [string, string, string, string];
    correctIndex: number;
    marks: number;
    negativeMarking: number;
    status: QuestionStatus;
    explanationEn: string;
    explanationBn: string;
    imageUrl: string | null;
    sourceName: string;
    sourceYear: string;
  }>,
  changedBy = 'admin'
): QuestionItem | null {
  const db = getDb();
  const existing = getAllQuestions().find((q) => q.id === id);
  if (!existing) return null;

  const nextSubject = input.subjectId
    ? mapLegacySubjectId(input.subjectId).subjectId
    : existing.subjectId;
  const nextChapter = (input.chapter ?? existing.chapter).trim() || 'General';
  const nextTopic = (input.topic ?? existing.topic ?? nextChapter).trim();
  const nextPrompt = (input.prompt ?? existing.prompt).trim();
  const nextOptions = input.options ?? existing.options;
  const nextCorrect =
    typeof input.correctIndex === 'number'
      ? Math.min(3, Math.max(0, input.correctIndex))
      : existing.correctIndex;
  const nextStatus = input.status ?? existing.status ?? 'Published';
  const nextMarks =
    typeof input.marks === 'number' && input.marks > 0 ? input.marks : (existing.marks ?? 1);
  const nextNeg =
    typeof input.negativeMarking === 'number' && input.negativeMarking >= 0
      ? input.negativeMarking
      : (existing.negativeMarking ?? 0.25);
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION');
  try {
    const { chapterId, topicId } = ensureChapterAndTopic(db, nextSubject, nextChapter, nextTopic);
    db.prepare(
      `UPDATE questions
       SET subject_id = ?, chapter_id = ?, topic_id = ?, chapter_name = ?, topic_name = ?,
           university_tag = ?, admission_category = ?, difficulty = ?, prompt = ?, prompt_bn = ?,
           correct_index = ?, marks = ?, negative_marking = ?, status = ?,
           image_url = ?, fingerprint = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextSubject,
      chapterId,
      topicId,
      nextChapter,
      nextTopic,
      input.universityTag ?? existing.universityTag,
      input.admissionCategory ?? existing.admissionCategory ?? 'DU Ka',
      input.difficulty ?? existing.difficulty,
      nextPrompt,
      (input.promptBn ?? existing.promptBn ?? '').trim(),
      nextCorrect,
      nextMarks,
      nextNeg,
      nextStatus,
      input.imageUrl !== undefined ? input.imageUrl : (existing.imageUrl ?? null),
      normalizePromptFingerprint(nextPrompt),
      now,
      id
    );

    if (input.options) {
      db.prepare('DELETE FROM question_options WHERE question_id = ?').run(id);
      const insOpt = db.prepare(
        'INSERT INTO question_options (id, question_id, option_index, option_text) VALUES (?, ?, ?, ?)'
      );
      nextOptions.forEach((opt, idx) => {
        insOpt.run(`${id}-opt-${idx}`, id, idx, opt.trim());
      });
    }

    db.prepare(
      `INSERT INTO question_explanations (question_id, explanation_en, explanation_bn)
       VALUES (?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET explanation_en = excluded.explanation_en, explanation_bn = excluded.explanation_bn`
    ).run(
      id,
      (input.explanationEn ?? existing.explanationEn).trim(),
      (input.explanationBn ?? existing.explanationBn).trim()
    );

    db.prepare(
      `INSERT INTO question_sources (question_id, source_name, source_year)
       VALUES (?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET source_name = excluded.source_name, source_year = excluded.source_year`
    ).run(
      id,
      (input.sourceName ?? existing.sourceName ?? '').trim(),
      (input.sourceYear ?? existing.sourceYear ?? '').trim()
    );

    recordQuestionHistory(db, {
      questionId: id,
      changedBy,
      changeSummary: `Updated question fields${input.status && input.status !== existing.status ? ` (status -> ${input.status})` : ''}`,
      previousSnapshot: {
        prompt: existing.prompt,
        options: existing.options,
        correctIndex: existing.correctIndex,
        status: existing.status,
        chapter: existing.chapter,
        admissionCategory: existing.admissionCategory,
      },
      newSnapshot: {
        prompt: nextPrompt,
        options: nextOptions,
        correctIndex: nextCorrect,
        status: nextStatus,
        chapter: nextChapter,
        admissionCategory: input.admissionCategory ?? existing.admissionCategory,
      },
    });

    syncChapterCounts(db);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getAllQuestions().find((q) => q.id === id) ?? null;
}

export function setQuestionStatus(
  id: string,
  status: QuestionStatus,
  changedBy = 'admin'
): QuestionItem | null {
  return updateQuestion(id, { status }, changedBy);
}

export function getQuestionHistory(questionId: string): QuestionHistoryEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM question_history WHERE question_id = ? ORDER BY created_at DESC LIMIT 30'
    )
    .all(questionId) as Array<Record<string, unknown>>;

  return rows.map((r) => {
    let prev: Record<string, unknown> = {};
    let next: Record<string, unknown> = {};
    try {
      prev = JSON.parse(String(r.previous_snapshot_json || '{}'));
    } catch {
      prev = {};
    }
    try {
      next = JSON.parse(String(r.new_snapshot_json || '{}'));
    } catch {
      next = {};
    }
    return {
      id: String(r.id),
      questionId: String(r.question_id),
      changedBy: String(r.changed_by || 'admin'),
      changeSummary: String(r.change_summary || ''),
      previousSnapshot: prev,
      newSnapshot: next,
      createdAt: String(r.created_at),
    };
  });
}

export function duplicateQuestion(id: string): QuestionItem | null {
  const existing = getAllQuestions().find((q) => q.id === id);
  if (!existing) return null;
  return createQuestion({
    subjectId: existing.subjectId,
    subjectName: existing.subjectName,
    chapter: existing.chapter,
    topic: existing.topic,
    universityTag: existing.universityTag,
    admissionCategory: existing.admissionCategory,
    difficulty: existing.difficulty,
    prompt: `${existing.prompt} (Copy)`,
    promptBn: existing.promptBn,
    rawText: existing.rawText,
    options: existing.options,
    correctIndex: existing.correctIndex,
    marks: existing.marks,
    negativeMarking: existing.negativeMarking,
    status: 'Draft',
    explanationEn: existing.explanationEn,
    explanationBn: existing.explanationBn,
    imageUrl: existing.imageUrl,
    sourceName: existing.sourceName,
    sourceYear: existing.sourceYear,
  });
}

export function deleteQuestion(questionId: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM questions WHERE id = ?').run(questionId);
  if (Number(res.changes) > 0) {
    syncChapterCounts(db);
    return true;
  }
  return false;
}

export function listAdminQuestions(params: {
  search?: string;
  subjectId?: string;
  universityTag?: string;
  admissionCategory?: string;
  difficulty?: string;
  chapter?: string;
  status?: string;
  page?: number;
  limit?: number;
}): { items: QuestionItem[]; total: number; page: number; totalPages: number } {
  let items = getAllQuestions();
  const s = (params.search ?? '').trim().toLowerCase();
  if (s) {
    items = items.filter(
      (q) =>
        q.prompt.toLowerCase().includes(s) ||
        (q.promptBn ?? '').toLowerCase().includes(s) ||
        q.chapter.toLowerCase().includes(s) ||
        (q.topic ?? '').toLowerCase().includes(s) ||
        (q.sourceName ?? '').toLowerCase().includes(s) ||
        (q.admissionCategory ?? '').toLowerCase().includes(s)
    );
  }
  if (params.subjectId && params.subjectId !== 'all') {
    items = items.filter((q) => q.subjectId === params.subjectId);
  }
  if (params.universityTag && params.universityTag !== 'all') {
    items = items.filter(
      (q) =>
        q.universityTag === params.universityTag ||
        q.admissionCategory === params.universityTag
    );
  }
  if (params.admissionCategory && params.admissionCategory !== 'all') {
    items = items.filter(
      (q) =>
        q.admissionCategory === params.admissionCategory ||
        q.universityTag === params.admissionCategory
    );
  }
  if (params.difficulty && params.difficulty !== 'all') {
    items = items.filter((q) => q.difficulty === params.difficulty);
  }
  if (params.chapter && params.chapter !== 'all') {
    items = items.filter((q) => q.chapter === params.chapter);
  }
  if (params.status && params.status !== 'all') {
    items = items.filter((q) => (q.status ?? 'Published') === params.status);
  }

  const total = items.length;
  const limit = Math.min(100, Math.max(5, Number(params.limit) || 20));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(totalPages, Math.max(1, Number(params.page) || 1));
  const paged = items.slice((page - 1) * limit, page * limit);
  return { items: paged, total, page, totalPages };
}

export function getAdminSubjectsWithTopics(): {
  subjects: SubjectSummary[];
  topics: TopicInfo[];
} {
  const db = getDb();
  const topicRows = db
    .prepare('SELECT id, chapter_id, subject_id, name, bangla_name FROM topics ORDER BY name ASC')
    .all() as Array<Record<string, unknown>>;

  return {
    subjects: getSubjects(),
    topics: topicRows.map((t) => ({
      id: String(t.id),
      chapterId: String(t.chapter_id),
      subjectId: String(t.subject_id) as SubjectId,
      name: String(t.name),
      banglaName: String(t.bangla_name),
    })),
  };
}

export function addChapter(params: {
  subjectId: SubjectId;
  name: string;
  banglaName?: string;
}): SubjectSummary[] {
  const db = getDb();
  const mapped = mapLegacySubjectId(params.subjectId);
  const id = `ch-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  db.prepare(
    'INSERT OR IGNORE INTO chapters (id, subject_id, name, bangla_name, mastery, questions_count) VALUES (?, ?, ?, ?, 0, 0)'
  ).run(id, mapped.subjectId, params.name.trim(), (params.banglaName || params.name).trim());
  return getSubjects();
}

export function addTopic(params: {
  subjectId: SubjectId;
  chapterId: string;
  name: string;
  banglaName?: string;
}): TopicInfo[] {
  const db = getDb();
  const id = `top-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  db.prepare(
    'INSERT OR IGNORE INTO topics (id, chapter_id, subject_id, name, bangla_name) VALUES (?, ?, ?, ?, ?)'
  ).run(id, params.chapterId, params.subjectId, params.name.trim(), (params.banglaName || params.name).trim());
  return getAdminSubjectsWithTopics().topics;
}

// --- Admin Exam Management ---

export function createExam(input: {
  title: string;
  subtitle?: string;
  universityTrack: UniversityTrack;
  examType?: 'mock' | 'university';
  durationMinutes: number;
  totalMarks?: number;
  negativeMarking: number;
  scheduledAt?: string;
  status?: 'available' | 'upcoming' | 'completed';
  isPublished?: boolean;
  questionIds: string[];
  sections?: string[];
}): ExamConfig {
  const db = getDb();
  const id = `exam-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const qIds = Array.from(new Set(input.questionIds));
  const totalMarks = Number(input.totalMarks || qIds.length);
  const isPublished = input.isPublished !== false ? 1 : 0;

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      `INSERT INTO exams (
        id, title, subtitle, university_track, exam_type, duration_minutes, total_marks,
        negative_marking, scheduled_at, status, is_published, sections_json, participants_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.title.trim(),
      (input.subtitle ?? '').trim() || 'ADMITLY AI ভর্তির মডেল টেস্ট',
      input.universityTrack,
      input.examType ?? 'mock',
      Math.max(1, Number(input.durationMinutes) || 15),
      totalMarks,
      Number(input.negativeMarking ?? 0.25),
      (input.scheduledAt ?? 'Live Now').trim(),
      input.status ?? 'available',
      isPublished,
      JSON.stringify(input.sections?.length ? input.sections : ['Physics', 'Chemistry', 'Mathematics']),
      0,
      createdAt
    );

    const insEq = db.prepare(
      'INSERT OR IGNORE INTO exam_questions (exam_id, question_id, sort_order) VALUES (?, ?, ?)'
    );
    qIds.forEach((qid, idx) => insEq.run(id, qid, idx));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getExams(false).find((e) => e.id === id)!;
}

export function updateExam(
  id: string,
  input: Partial<{
    title: string;
    subtitle: string;
    universityTrack: UniversityTrack;
    examType: 'mock' | 'university';
    durationMinutes: number;
    totalMarks: number;
    negativeMarking: number;
    scheduledAt: string;
    status: 'available' | 'upcoming' | 'completed';
    isPublished: boolean;
    questionIds: string[];
    sections: string[];
  }>
): ExamConfig | null {
  const db = getDb();
  const existing = getExams(false).find((e) => e.id === id);
  if (!existing) return null;

  const qIds = input.questionIds ? Array.from(new Set(input.questionIds)) : existing.questionIds;

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      `UPDATE exams
       SET title = ?, subtitle = ?, university_track = ?, exam_type = ?, duration_minutes = ?,
           total_marks = ?, negative_marking = ?, scheduled_at = ?, status = ?, is_published = ?, sections_json = ?
       WHERE id = ?`
    ).run(
      (input.title ?? existing.title).trim(),
      (input.subtitle ?? existing.subtitle).trim(),
      input.universityTrack ?? existing.universityTrack,
      input.examType ?? existing.examType ?? 'mock',
      Number(input.durationMinutes ?? existing.durationMinutes),
      Number(input.totalMarks ?? qIds.length),
      Number(input.negativeMarking ?? existing.negativeMarking),
      (input.scheduledAt ?? existing.scheduledAt).trim(),
      input.status ?? existing.status,
      (input.isPublished ?? existing.isPublished ?? true) ? 1 : 0,
      JSON.stringify(input.sections ?? existing.sections),
      id
    );

    if (input.questionIds) {
      db.prepare('DELETE FROM exam_questions WHERE exam_id = ?').run(id);
      const insEq = db.prepare(
        'INSERT OR IGNORE INTO exam_questions (exam_id, question_id, sort_order) VALUES (?, ?, ?)'
      );
      qIds.forEach((qid, idx) => insEq.run(id, qid, idx));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getExams(false).find((e) => e.id === id) ?? null;
}

export function deleteExam(examId: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
  return Number(res.changes) > 0;
}

export function getExamAttemptsByExam(examId: string): Array<{
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  rawScore: number;
  maxScore: number;
  accuracy: number;
  durationSecondsSpent: number;
  submittedAt: string;
}> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ea.id, ea.user_id, COALESCE(up.full_name, 'Student') AS user_name,
              COALESCE(u.email, '') AS user_email,
              ea.raw_score, ea.max_score, ea.accuracy, ea.duration_seconds_spent, ea.submitted_at
       FROM exam_attempts ea
       LEFT JOIN users u ON u.id = ea.user_id
       LEFT JOIN user_profiles up ON up.user_id = ea.user_id
       WHERE ea.exam_id = ?
       ORDER BY ea.submitted_at DESC`
    )
    .all(examId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    userEmail: String(r.user_email),
    rawScore: Number(r.raw_score),
    maxScore: Number(r.max_score),
    accuracy: Number(r.accuracy),
    durationSecondsSpent: Number(r.duration_seconds_spent),
    submittedAt: String(r.submitted_at),
  }));
}

// --- Admin User Management ---

function mapAdminUserRow(r: Record<string, unknown>): AdminUserRecord {
  return {
    id: String(r.id),
    email: String(r.email),
    phone: r.phone ? String(r.phone) : '',
    role: String(r.role) as 'admin' | 'student',
    status: String(r.status) as UserStatus,
    fullName: String(r.full_name || 'Unknown User'),
    college: String(r.college || ''),
    division: String(r.division || 'Dhaka'),
    hscBatch: String(r.hsc_batch || 'HSC 2026'),
    targetUniversity: String(r.target_university || 'DU Ka') as UniversityTrack,
    secondaryUniversity: String(r.secondary_university || 'BUET') as UniversityTrack,
    avatarUrl: String(r.avatar_url || ''),
    streakDays: Number(r.streak_days || 0),
    overallProgress: Number(r.overall_progress || 0),
    overallScore: Number(r.overall_score || 0),
    averageAccuracy: Number(r.average_accuracy || 0),
    examsCompleted: Number(r.total_exams_completed || 0),
    createdAt: String(r.created_at),
    lastLoginAt: r.last_login_at ? String(r.last_login_at) : null,
  };
}

export function listAdminUsers(params: {
  search?: string;
  status?: string;
  dateRange?: string;
  university?: string;
  page?: number;
  limit?: number;
}): { items: AdminUserRecord[]; total: number; page: number; totalPages: number } {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.id, u.email, COALESCE(u.phone, '') AS phone, u.status, u.created_at, u.last_login_at,
              COALESCE((SELECT role FROM user_roles WHERE user_id = u.id ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END LIMIT 1), 'student') AS role,
              up.full_name, up.college, up.division, up.hsc_batch,
              up.target_university, up.secondary_university, up.avatar_url,
              up.streak_days, up.overall_progress, up.overall_score,
              up.average_accuracy, up.total_exams_completed
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       ORDER BY u.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  let items = rows.map(mapAdminUserRow);

  const search = (params.search ?? '').trim().toLowerCase();
  if (search) {
    items = items.filter(
      (u) =>
        u.fullName.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.id.toLowerCase().includes(search) ||
        u.college.toLowerCase().includes(search)
    );
  }
  if (params.status && params.status !== 'all') {
    items = items.filter((u) => u.status === params.status);
  }
  if (params.university && params.university !== 'all') {
    items = items.filter((u) => u.targetUniversity === params.university);
  }
  if (params.dateRange && params.dateRange !== 'all') {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    items = items.filter((u) => {
      if (params.dateRange === 'today') {
        return u.createdAt.slice(0, 10) === todayStr;
      }
      const days = params.dateRange === '7d' ? 7 : 30;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return new Date(u.createdAt).getTime() >= cutoff;
    });
  }

  const total = items.length;
  const limit = Math.min(100, Math.max(5, Number(params.limit) || 15));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(totalPages, Math.max(1, Number(params.page) || 1));
  return {
    items: items.slice((page - 1) * limit, page * limit),
    total,
    page,
    totalPages,
  };
}

export function getAdminUserDetail(userId: string): AdminUserDetail | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, COALESCE(u.phone, '') AS phone, u.status, u.created_at, u.last_login_at,
              COALESCE((SELECT role FROM user_roles WHERE user_id = u.id ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END LIMIT 1), 'student') AS role,
              up.full_name, up.college, up.division, up.hsc_batch,
              up.target_university, up.secondary_university, up.avatar_url,
              up.streak_days, up.overall_progress, up.overall_score,
              up.average_accuracy, up.total_exams_completed
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const base = mapAdminUserRow(row);
  const attempts = getAttemptsForUser(userId);

  const subjRows = db
    .prepare(
      `SELECT subject_id, subject_name,
              SUM(total_count) AS attempted,
              SUM(correct_count) AS correct
       FROM user_results
       WHERE user_id = ?
       GROUP BY subject_id, subject_name`
    )
    .all(userId) as Array<{
    subject_id: string;
    subject_name: string;
    attempted: number;
    correct: number;
  }>;

  const notifRows = db
    .prepare(
      'SELECT id, title, message, type, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
    )
    .all(userId) as Array<Record<string, unknown>>;

  return {
    ...base,
    attempts,
    subjectProgress: subjRows.map((s) => ({
      subjectId: s.subject_id as SubjectId,
      subjectName: s.subject_name,
      attempted: Number(s.attempted),
      correct: Number(s.correct),
      accuracy:
        Number(s.attempted) > 0
          ? Math.round((Number(s.correct) / Number(s.attempted)) * 100)
          : 0,
    })),
    notifications: notifRows.map((n) => ({
      id: String(n.id),
      title: String(n.title),
      message: String(n.message),
      type: String(n.type),
      createdAt: String(n.created_at),
    })),
  };
}

export function updateAdminUserStatus(userId: string, status: UserStatus): AdminUserRecord | null {
  const db = getDb();
  const res = db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
  if (Number(res.changes) === 0) return null;
  const list = listAdminUsers({ limit: 500 });
  return list.items.find((u) => u.id === userId) ?? null;
}

export function triggerUserPasswordReset(userId: string): {
  email: string;
  expiresAt: string;
  resetToken: string;
} | null {
  const db = getDb();
  const user = db
    .prepare('SELECT id, email FROM users WHERE id = ?')
    .get(userId) as { id: string; email: string } | undefined;
  if (!user) return null;

  const { rawToken, tokenHash, expiresAt } = createResetToken();
  db.prepare(
    'UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?'
  ).run(tokenHash, expiresAt, userId);

  db.prepare(
    `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(
    `notif-${Date.now().toString(36)}`,
    userId,
    'Password Reset Initiated',
    'An administrator initiated a secure one-time password reset for your account.',
    'security',
    new Date().toISOString()
  );

  return {
    email: user.email,
    expiresAt,
    resetToken: rawToken,
  };
}

export function deleteAdminUser(userId: string, currentAdminId: string): { deleted: boolean; reason?: string } {
  if (userId === currentAdminId) {
    return { deleted: false, reason: 'You cannot delete the currently signed-in administrator.' };
  }
  const db = getDb();
  const res = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return { deleted: Number(res.changes) > 0 };
}

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportPermittedUsersCsv(): string {
  const { items } = listAdminUsers({ limit: 1000 });
  const headers = [
    'User ID',
    'Full Name',
    'Email',
    'Role',
    'Status',
    'College',
    'Division',
    'HSC Batch',
    'Target University',
    'Exams Completed',
    'Average Accuracy (%)',
    'Streak Days',
    'Registered At',
    'Last Login',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const u of items) {
    lines.push(
      [
        u.id,
        u.fullName,
        u.email,
        u.role,
        u.status,
        u.college,
        u.division,
        u.hscBatch,
        u.targetUniversity,
        u.examsCompleted,
        u.averageAccuracy,
        u.streakDays,
        u.createdAt,
        u.lastLoginAt ?? 'Never',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

// --- Admin Overview & Real Analytics ---

export function getAdminOverviewPayload(): AdminOverviewPayload {
  const db = getDb();

  const userStats = db
    .prepare(
      `SELECT COUNT(*) AS total_users,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_users,
              SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended_users,
              SUM(CASE WHEN substr(created_at, 1, 10) = ? THEN 1 ELSE 0 END) AS new_today
       FROM users`
    )
    .get(new Date().toISOString().slice(0, 10)) as Record<string, unknown>;

  const qStats = db
    .prepare(
      `SELECT COUNT(*) AS total_q,
              SUM(CASE WHEN status = 'Published' THEN 1 ELSE 0 END) AS published_q,
              SUM(CASE WHEN status != 'Published' THEN 1 ELSE 0 END) AS draft_q
       FROM questions`
    )
    .get() as { total_q: number; published_q: number; draft_q: number };

  const exStats = db
    .prepare(
      `SELECT COUNT(*) AS total_exams,
              SUM(CASE WHEN exam_type = 'mock' THEN 1 ELSE 0 END) AS mock_tests
       FROM exams`
    )
    .get() as { total_exams: number; mock_tests: number };

  const attCount = (db.prepare('SELECT COUNT(*) AS cnt FROM exam_attempts').get() as { cnt: number }).cnt;

  const uniCountRow = db
    .prepare(
      `SELECT COUNT(DISTINCT uni) AS cnt FROM (
         SELECT target_university AS uni FROM user_profiles WHERE target_university != ''
         UNION
         SELECT university_track AS uni FROM exams WHERE university_track != ''
         UNION
         SELECT admission_category AS uni FROM questions WHERE admission_category != ''
       )`
    )
    .get() as { cnt: number };

  const aiRows = db
    .prepare('SELECT * FROM ai_usage_logs ORDER BY timestamp DESC LIMIT 50')
    .all() as Array<Record<string, unknown>>;

  const aiLogs: AiUsageLog[] = aiRows.map((r) => ({
    id: String(r.id),
    timestamp: String(r.timestamp),
    feature: String(r.feature) as AiUsageLog['feature'],
    model: String(r.model),
    status: String(r.status) as AiUsageLog['status'],
    latencyMs: Number(r.latency_ms),
    summary: String(r.summary),
  }));

  const successCount = aiLogs.filter((l) => l.status === 'success').length;
  const stats: AdminDashboardStats = {
    totalRegisteredUsers: Number(userStats.total_users || 0),
    activeUsers: Number(userStats.active_users || 0),
    suspendedUsers: Number(userStats.suspended_users || 0),
    newUsersToday: Number(userStats.new_today || 0),
    totalQuestions: Number(qStats.total_q || 0),
    publishedQuestions: Number(qStats.published_q || 0),
    draftQuestions: Number(qStats.draft_q || 0),
    totalExams: Number(exStats.total_exams || 0),
    totalMockTests: Number(exStats.mock_tests || 0),
    totalUniversities: Number(uniCountRow.cnt || 0),
    totalAttempts: Number(attCount || 0),
    aiRequestsToday: aiLogs.length,
    aiSuccessRate: aiLogs.length > 0 ? Math.round((successCount / aiLogs.length) * 100) : 0,
  };

  const recentRegistrations = listAdminUsers({ limit: 6 }).items;

  const recentActivityRows = db
    .prepare(
      `SELECT ea.id, COALESCE(up.full_name, 'Student') AS user_name,
              COALESCE(u.email, '') AS user_email,
              ea.exam_title, ea.university_track, ea.raw_score, ea.max_score,
              ea.accuracy, ea.submitted_at
       FROM exam_attempts ea
       LEFT JOIN users u ON u.id = ea.user_id
       LEFT JOIN user_profiles up ON up.user_id = ea.user_id
       ORDER BY ea.submitted_at DESC
       LIMIT 8`
    )
    .all() as Array<Record<string, unknown>>;

  const recentExamActivities = recentActivityRows.map((r) => ({
    id: String(r.id),
    userName: String(r.user_name),
    userEmail: String(r.user_email),
    examTitle: String(r.exam_title),
    universityTrack: String(r.university_track),
    rawScore: Number(r.raw_score),
    maxScore: Number(r.max_score),
    accuracy: Number(r.accuracy),
    submittedAt: String(r.submitted_at),
  }));

  const dailyUserGrowth: Array<{ label: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const isoDay = d.toISOString().slice(0, 10);
    const cnt = (
      db
        .prepare('SELECT COUNT(*) AS cnt FROM users WHERE substr(created_at, 1, 10) <= ?')
        .get(isoDay) as { cnt: number }
    ).cnt;
    dailyUserGrowth.push({
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: Number(cnt),
    });
  }

  const monthlyRows = db
    .prepare(
      `SELECT substr(created_at, 1, 7) AS ym, COUNT(*) AS cnt
       FROM users
       GROUP BY ym
       ORDER BY ym ASC
       LIMIT 6`
    )
    .all() as Array<{ ym: string; cnt: number }>;
  const monthlyUserGrowth = monthlyRows.map((m) => ({
    label: m.ym,
    count: Number(m.cnt),
  }));

  const subjDistRows = db
    .prepare(
      `SELECT s.id, s.name, COUNT(q.id) AS cnt
       FROM subjects s
       LEFT JOIN questions q ON q.subject_id = s.id
       GROUP BY s.id, s.name
       ORDER BY s.sort_order ASC`
    )
    .all() as Array<{ id: string; name: string; cnt: number }>;

  const uniDistRows = db
    .prepare(
      `SELECT target_university AS university, COUNT(*) AS cnt
       FROM user_profiles
       GROUP BY target_university
       ORDER BY cnt DESC`
    )
    .all() as Array<{ university: string; cnt: number }>;

  const examStatRows = db
    .prepare(
      `SELECT e.id, e.title, e.university_track,
              COUNT(ea.id) AS attempts_count,
              COALESCE(AVG(ea.accuracy), 0) AS avg_acc,
              COALESCE(AVG(CAST(ea.correct_count + ea.incorrect_count AS REAL) / NULLIF(ea.total_questions, 0)) * 100, 0) AS completion_rate
       FROM exams e
       LEFT JOIN exam_attempts ea ON ea.exam_id = e.id
       GROUP BY e.id, e.title, e.university_track
       ORDER BY attempts_count DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const allAttempts = db
    .prepare('SELECT answers_json FROM exam_attempts')
    .all() as Array<{ answers_json: string }>;
  const allQs = getAllQuestions();
  const qLookup = new Map(allQs.map((q) => [q.id, q]));
  const qStatsMap = new Map<string, { attempts: number; correct: number }>();

  for (const att of allAttempts) {
    try {
      const ans = JSON.parse(att.answers_json) as Record<string, number | null>;
      for (const [qid, selected] of Object.entries(ans)) {
        if (selected === null || selected === undefined) continue;
        const q = qLookup.get(qid);
        if (!q) continue;
        const curr = qStatsMap.get(qid) ?? { attempts: 0, correct: 0 };
        curr.attempts += 1;
        if (selected === q.correctIndex) curr.correct += 1;
        qStatsMap.set(qid, curr);
      }
    } catch {
      // ignore malformed historical row
    }
  }

  const questionAnalytics = Array.from(qStatsMap.entries()).map(([qid, st]) => {
    const q = qLookup.get(qid)!;
    return {
      questionId: qid,
      prompt: q.prompt,
      subjectName: q.subjectName,
      attemptsCount: st.attempts,
      accuracyRate: st.attempts > 0 ? Math.round((st.correct / st.attempts) * 100) : 0,
    };
  });

  const mostAttemptedQuestions = [...questionAnalytics]
    .sort((a, b) => b.attemptsCount - a.attemptsCount || a.accuracyRate - b.accuracyRate)
    .slice(0, 5);

  const mostDifficultQuestions = [...questionAnalytics]
    .sort((a, b) => a.accuracyRate - b.accuracyRate || b.attemptsCount - a.attemptsCount)
    .slice(0, 5);

  const engRows = db
    .prepare(
      `SELECT substr(submitted_at, 1, 10) AS day, COUNT(*) AS cnt, AVG(accuracy) AS avg_acc
       FROM exam_attempts
       GROUP BY day
       ORDER BY day ASC
       LIMIT 10`
    )
    .all() as Array<{ day: string; cnt: number; avg_acc: number }>;

  const analytics: AdminAnalyticsPayload = {
    dailyUserGrowth,
    monthlyUserGrowth,
    subjectQuestionDistribution: subjDistRows.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      count: Number(s.cnt),
    })),
    universityStudentDistribution: uniDistRows.map((u) => ({
      university: u.university,
      count: Number(u.cnt),
    })),
    examCompletionRates: examStatRows.map((e) => ({
      examId: String(e.id),
      title: String(e.title),
      universityTrack: String(e.university_track),
      attemptsCount: Number(e.attempts_count || 0),
      averageAccuracy: Math.round(Number(e.avg_acc || 0)),
      completionRate: Math.round(Number(e.completion_rate || 0)),
    })),
    mostAttemptedQuestions,
    mostDifficultQuestions,
    engagementTrend: engRows.map((r) => ({
      label: r.day.slice(5),
      attempts: Number(r.cnt),
      avgAccuracy: Math.round(Number(r.avg_acc || 0)),
    })),
  };

  const auditRows = db
    .prepare('SELECT * FROM admin_activity_logs ORDER BY created_at DESC LIMIT 40')
    .all() as Array<Record<string, unknown>>;

  const activityLogs: AdminActivityLog[] = auditRows.map((l) => ({
    id: String(l.id),
    adminUserId: l.admin_user_id ? String(l.admin_user_id) : null,
    adminEmail: String(l.admin_email),
    action: String(l.action),
    targetType: String(l.target_type),
    targetId: String(l.target_id),
    details: String(l.details),
    createdAt: String(l.created_at),
  }));

  return {
    stats,
    recentRegistrations,
    recentExamActivities,
    analytics,
    aiLogs,
    activityLogs,
  };
}
