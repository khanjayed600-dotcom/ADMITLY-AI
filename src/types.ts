export type UniversityTrack =
  | 'BUET'
  | 'DU Ka'
  | 'DU Kha'
  | 'Medical'
  | 'CKRUET'
  | 'GST'
  | 'Rajshahi University'
  | 'Jahangirnagar University'
  | 'Chittagong University'
  | 'Engineering'
  | 'Other';

export type AdmissionCategory =
  | 'GST'
  | 'DU Ka'
  | 'DU Kha'
  | 'Rajshahi University'
  | 'Jahangirnagar University'
  | 'Chittagong University'
  | 'Medical'
  | 'Engineering'
  | 'Other';

export const ADMISSION_CATEGORIES: AdmissionCategory[] = [
  'GST',
  'DU Ka',
  'DU Kha',
  'Rajshahi University',
  'Jahangirnagar University',
  'Chittagong University',
  'Medical',
  'Engineering',
  'Other',
];

export type QuestionStatus =
  | 'Draft'
  | 'Processing'
  | 'Needs Review'
  | 'Approved'
  | 'Published'
  | 'Rejected';

export type SubjectId =
  | 'physics'
  | 'chemistry'
  | 'math'
  | 'biology'
  | 'english'
  | 'ict'
  | 'gk'
  | 'english_ict';

export type UserRole = 'admin' | 'student';
export type UserStatus = 'active' | 'suspended';

export interface ChapterInfo {
  id: string;
  name: string;
  banglaName: string;
  mastery: number;
  questionsCount: number;
}

export interface TopicInfo {
  id: string;
  chapterId: string;
  subjectId: SubjectId;
  name: string;
  banglaName: string;
}

export interface SubjectSummary {
  id: SubjectId;
  name: string;
  banglaName: string;
  shortCode: string;
  mastery: number;
  accuracy: number;
  solvedCount: number;
  totalQuestions: number;
  weakestTopic: string;
  chapters: ChapterInfo[];
}

export interface QuestionItem {
  id: string;
  subjectId: SubjectId;
  subjectName: string;
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
  explanationEn: string;
  explanationBn: string;
  marks?: number;
  negativeMarking?: number;
  status?: QuestionStatus;
  answerConfidence?: 'explicit' | 'uncertain';
  validationWarnings?: string[];
  duplicateCount?: number;
  imageUrl?: string;
  sourceName?: string;
  sourceYear?: string;
  createdAt: string;
  updatedAt?: string;
}

export type StudentQuestionItem = Omit<
  QuestionItem,
  'correctIndex' | 'explanationEn' | 'explanationBn' | 'rawText'
>;

export interface GradedQuestionReview {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanationEn: string;
  explanationBn: string;
}

export interface QuestionHistoryEntry {
  id: string;
  questionId: string;
  changedBy: string;
  changeSummary: string;
  previousSnapshot: Record<string, unknown>;
  newSnapshot: Record<string, unknown>;
  createdAt: string;
}

export interface StudentNotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface ExamConfig {
  id: string;
  title: string;
  subtitle: string;
  universityTrack: UniversityTrack;
  examType?: 'mock' | 'university';
  durationMinutes: number;
  totalMarks?: number;
  negativeMarking: number;
  scheduledAt: string;
  isPublished?: boolean;
  status: 'available' | 'upcoming' | 'completed';
  questionIds: string[];
  sections: string[];
  participantsCount: number;
}

export interface SubjectBreakdown {
  subjectId: SubjectId;
  subjectName: string;
  total: number;
  correct: number;
  incorrect: number;
  skipped: number;
  score: number;
  maxScore: number;
  accuracy: number;
}

export interface TopicWeakness {
  topic: string;
  subjectName: string;
  accuracy: number;
  missedCount: number;
  totalCount: number;
}

export interface ExamAttempt {
  id: string;
  userId?: string;
  userName?: string;
  examId: string;
  examTitle: string;
  universityTrack: UniversityTrack;
  submittedAt: string;
  durationSecondsSpent: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  rawScore: number;
  maxScore: number;
  accuracy: number;
  answers: Record<string, number | null>;
  markedForReview: string[];
  subjectBreakdown: SubjectBreakdown[];
  topicWeaknesses: TopicWeakness[];
  aiAnalysis?: string;
}

export interface WeeklyPerformancePoint {
  day: string;
  dateLabel: string;
  score: number;
  accuracy: number;
  minutesStudied: number;
}

export interface ContinueLearningModule {
  id: string;
  subjectId: SubjectId;
  subjectName: string;
  chapterTitle: string;
  banglaSubtitle: string;
  progressPercent: number;
  remainingMinutes: number;
  lastStudiedLabel: string;
}

export interface DailyChallenge {
  id: string;
  date: string;
  title: string;
  question: StudentQuestionItem | null;
  completed: boolean;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  correctIndex?: number;
  explanationEn?: string;
  explanationBn?: string;
}

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  college: string;
  division: string;
  hscBatch: string;
  targetTrack: UniversityTrack;
  secondaryTrack: UniversityTrack;
  avatarUrl: string;
  streakDays: number;
  longestStreak: number;
  overallProgress: number;
  overallScore: number;
  averageAccuracy: number;
  totalExamsCompleted: number;
  nationalRank: number;
  totalRankedStudents: number;
  rankDelta: number;
  createdAt: string;
}

export interface StudentAuthSession {
  authenticated: boolean;
  token?: string;
  student: StudentProfile;
}

export interface StudentProfileUpdatePayload {
  name: string;
  phone: string;
  college: string;
  division: string;
  hscBatch: string;
  targetTrack: UniversityTrack;
  secondaryTrack: UniversityTrack;
}

export interface ForgotPasswordResponse {
  sent: boolean;
  maskedTarget: string;
  expiresAt: string;
  previewCode?: string;
}

export interface LeaderboardEntry {
  id: string;
  rank: number;
  displayName: string;
  city: string;
  targetUniversity: UniversityTrack;
  avatarUrl?: string;
  initials: string;
  weeklyScore: number;
  accuracy: number;
  examsCompleted: number;
  streakDays: number;
  isCurrentUser?: boolean;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  fullName: string;
  college: string;
  division: string;
  hscBatch: string;
  targetUniversity: UniversityTrack;
  secondaryUniversity: UniversityTrack;
  avatarUrl: string;
  streakDays: number;
  overallProgress: number;
  overallScore: number;
  averageAccuracy: number;
  examsCompleted: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserDetail extends AdminUserRecord {
  attempts: ExamAttempt[];
  subjectProgress: Array<{
    subjectId: SubjectId;
    subjectName: string;
    accuracy: number;
    attempted: number;
    correct: number;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    createdAt: string;
  }>;
}

export interface AdminActivityLog {
  id: string;
  adminUserId: string | null;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface AiUsageLog {
  id: string;
  timestamp: string;
  feature:
    | 'AI Mentor Chat'
    | 'Study Plan'
    | 'Practice Generator'
    | 'Attempt Analysis'
    | 'AI Question Importer'
    | 'Question Explanation';
  model: string;
  status: 'success' | 'error' | 'not_configured';
  latencyMs: number;
  summary: string;
}

export interface AiStatusInfo {
  configured: boolean;
  model: string;
  provider: string;
}

export interface BootstrapPayload {
  student: StudentProfile;
  subjects: SubjectSummary[];
  weeklyPerformance: WeeklyPerformancePoint[];
  continueLearning: ContinueLearningModule[];
  dailyChallenge: DailyChallenge;
  exams: ExamConfig[];
  questions: StudentQuestionItem[];
  attempts: ExamAttempt[];
  leaderboard: LeaderboardEntry[];
  notifications: StudentNotificationItem[];
  aiStatus: AiStatusInfo;
}

export interface AdminDashboardStats {
  totalRegisteredUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  newUsersToday: number;
  totalQuestions: number;
  publishedQuestions: number;
  draftQuestions: number;
  totalExams: number;
  totalMockTests: number;
  totalUniversities: number;
  totalAttempts: number;
  aiRequestsToday: number;
  aiSuccessRate: number;
}

export interface AdminAnalyticsPayload {
  dailyUserGrowth: Array<{ label: string; count: number }>;
  monthlyUserGrowth: Array<{ label: string; count: number }>;
  subjectQuestionDistribution: Array<{
    subjectId: string;
    subjectName: string;
    count: number;
  }>;
  universityStudentDistribution: Array<{
    university: string;
    count: number;
  }>;
  examCompletionRates: Array<{
    examId: string;
    title: string;
    universityTrack: string;
    attemptsCount: number;
    averageAccuracy: number;
    completionRate: number;
  }>;
  mostAttemptedQuestions: Array<{
    questionId: string;
    prompt: string;
    subjectName: string;
    attemptsCount: number;
    accuracyRate: number;
  }>;
  mostDifficultQuestions: Array<{
    questionId: string;
    prompt: string;
    subjectName: string;
    attemptsCount: number;
    accuracyRate: number;
  }>;
  engagementTrend: Array<{
    label: string;
    attempts: number;
    avgAccuracy: number;
  }>;
}

export interface AdminOverviewPayload {
  stats: AdminDashboardStats;
  recentRegistrations: AdminUserRecord[];
  recentExamActivities: Array<{
    id: string;
    userName: string;
    userEmail: string;
    examTitle: string;
    universityTrack: string;
    rawScore: number;
    maxScore: number;
    accuracy: number;
    submittedAt: string;
  }>;
  analytics: AdminAnalyticsPayload;
  aiLogs: AiUsageLog[];
  activityLogs: AdminActivityLog[];
}

export interface StagedImportQuestion {
  id: string;
  batchId: string;
  subjectId: SubjectId;
  subjectName: string;
  chapter: string;
  topic: string;
  universityTag: UniversityTrack;
  admissionCategory: string;
  difficulty: 'Foundation' | 'Standard' | 'Admission Hard';
  prompt: string;
  promptBn: string;
  rawOriginal: string;
  options: [string, string, string, string];
  correctIndex: number | null;
  marks: number;
  negativeMarking: number;
  answerConfidence: 'explicit' | 'uncertain';
  needsManualReview: boolean;
  isIncomplete: boolean;
  isDuplicate: boolean;
  duplicateOfQuestionId: string | null;
  duplicateMatchPrompt: string | null;
  reviewReason: string;
  validationWarnings: string[];
  explanationEn: string;
  explanationBn: string;
  sourceName: string;
  sourceYear: string;
  status: QuestionStatus;
  publishedQuestionId?: string | null;
  createdAt: string;
}

export interface AdminAuthSession {
  authenticated: boolean;
  token: string;
  admin: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
  };
}

export interface AdminAuthConfigStatus {
  hasAdminAccount: boolean;
  accessCodeConfigured: boolean;
}

export interface AiStudyPlanResponse {
  summary: string;
  focusMessageBn: string;
  dailyBlocks: Array<{
    day: string;
    subject: string;
    topic: string;
    durationMinutes: number;
    actionItem: string;
    banglaTip: string;
  }>;
}

export interface AiGeneratedQuestion {
  prompt: string;
  promptBn: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanationEn: string;
  explanationBn: string;
  topic: string;
}
