import type {
  AdminAuthConfigStatus,
  AdminAuthSession,
  AdminOverviewPayload,
  AdminUserDetail,
  AdminUserRecord,
  AdmissionCategory,
  AiGeneratedQuestion,
  AiStudyPlanResponse,
  BootstrapPayload,
  DailyChallenge,
  ExamAttempt,
  ExamConfig,
  ForgotPasswordResponse,
  GradedQuestionReview,
  LeaderboardEntry,
  QuestionHistoryEntry,
  QuestionItem,
  QuestionStatus,
  StagedImportQuestion,
  StudentAuthSession,
  StudentNotificationItem,
  StudentProfile,
  StudentProfileUpdatePayload,
  SubjectId,
  SubjectSummary,
  TopicInfo,
  UniversityTrack,
  UserStatus,
  WeeklyPerformancePoint,
} from '../types';

let inMemoryAdminToken: string | null = null;
let inMemoryStudentToken: string | null = null;

export function setAdminToken(token: string | null): void {
  inMemoryAdminToken = token;
}

export function getAdminToken(): string | null {
  return inMemoryAdminToken;
}

export function setStudentToken(token: string | null): void {
  inMemoryStudentToken = token;
}

export function getStudentToken(): string | null {
  return inMemoryStudentToken;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const isFormData =
    typeof FormData !== 'undefined' && options?.body instanceof FormData;
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (url.startsWith('/api/admin')) {
    if (inMemoryAdminToken) {
      headers.Authorization = `Bearer ${inMemoryAdminToken}`;
    }
  } else if (inMemoryStudentToken) {
    headers.Authorization = `Bearer ${inMemoryStudentToken}`;
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { error?: string }).error ||
      `অনুরোধ সম্পন্ন হয়নি (${res.status})`;
    const err = new Error(message) as Error & { code?: string; status?: number };
    err.code = (data as { code?: string }).code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const api = {
  // Student Auth endpoints
  authMe: () => request<StudentAuthSession>('/api/auth/me'),

  registerStudent: (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    hscBatch: string;
    targetTrack: UniversityTrack;
    rememberMe?: boolean;
  }) =>
    request<StudentAuthSession>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  loginStudent: (payload: {
    identifier: string;
    password: string;
    rememberMe: boolean;
  }) =>
    request<StudentAuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logoutStudent: () =>
    request<{ loggedOut: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  forgotPassword: (identifier: string) =>
    request<ForgotPasswordResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),

  resetPassword: (payload: {
    identifier: string;
    otp: string;
    newPassword: string;
  }) =>
    request<{ reset: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Student / App endpoints
  bootstrap: () => request<BootstrapPayload>('/api/bootstrap'),

  answerDailyChallenge: (selectedIndex: number) =>
    request<{ dailyChallenge: DailyChallenge; student: StudentProfile }>(
      '/api/daily-challenge/answer',
      {
        method: 'POST',
        body: JSON.stringify({ selectedIndex }),
      }
    ),

  updateTargetTrack: (targetTrack: UniversityTrack) =>
    request<{ student: StudentProfile }>('/api/student/track', {
      method: 'POST',
      body: JSON.stringify({ targetTrack }),
    }),

  updateStudentProfile: (payload: StudentProfileUpdatePayload) =>
    request<{ student: StudentProfile }>('/api/student/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  uploadStudentAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request<{ avatarUrl: string; student: StudentProfile }>(
      '/api/student/avatar',
      {
        method: 'POST',
        body: fd,
      }
    );
  },

  submitAttempt: (payload: {
    examId: string;
    answers: Record<string, number | null>;
    markedForReview: string[];
    durationSecondsSpent: number;
    submissionId?: string;
  }) =>
    request<{
      attempt: ExamAttempt;
      gradedQuestions: GradedQuestionReview[];
      student: StudentProfile;
      subjects: SubjectSummary[];
      weeklyPerformance: WeeklyPerformancePoint[];
      leaderboard: LeaderboardEntry[];
      attempts: ExamAttempt[];
    }>('/api/attempts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAttemptReview: (attemptId: string) =>
    request<{
      attempt: ExamAttempt;
      questions: QuestionItem[];
      gradedQuestions: GradedQuestionReview[];
    }>(`/api/attempts/${attemptId}/review`),

  checkPracticeAnswer: (
    questionId: string,
    selectedIndex?: number | null,
    revealOnly = false
  ) =>
    request<{
      questionId: string;
      selectedIndex: number | null;
      correctIndex: number;
      isCorrect: boolean;
      explanationEn: string;
      explanationBn: string;
    }>('/api/practice/check', {
      method: 'POST',
      body: JSON.stringify({ questionId, selectedIndex, revealOnly }),
    }),

  markNotificationsRead: () =>
    request<{ notifications: StudentNotificationItem[] }>('/api/student/notifications/read', {
      method: 'POST',
    }),

  askMentor: (message: string, language: 'bilingual' | 'bangla' | 'english') =>
    request<{ reply: string; model: string }>('/api/ai/mentor', {
      method: 'POST',
      body: JSON.stringify({ message, language }),
    }),

  generateStudyPlan: (focusGoal: string) =>
    request<AiStudyPlanResponse>('/api/ai/study-plan', {
      method: 'POST',
      body: JSON.stringify({ focusGoal }),
    }),

  generatePracticeQuestions: (payload: {
    subject: string;
    topic: string;
    universityTrack: string;
    count: number;
  }) =>
    request<{ questions: AiGeneratedQuestion[] }>(
      '/api/ai/practice-questions',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  analyzeAttempt: (attemptId: string) =>
    request<{ analysis: string; attempt: ExamAttempt }>(
      '/api/ai/analyze-attempt',
      {
        method: 'POST',
        body: JSON.stringify({ attemptId }),
      }
    ),

  explainReviewQuestion: (attemptId: string, questionId: string) =>
    request<{ explanation: string; model: string }>(
      '/api/ai/explain-question',
      {
        method: 'POST',
        body: JSON.stringify({ attemptId, questionId }),
      }
    ),

  // Admin Auth endpoints
  getAdminStatus: () => request<AdminAuthConfigStatus>('/api/admin/status'),

  bootstrapAdmin: (payload: { fullName: string; email: string; password: string }) =>
    request<AdminAuthSession>('/api/admin/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  loginAdmin: (payload: { email: string; password: string }) =>
    request<AdminAuthSession>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyAdminAccess: (accessCode: string) =>
    request<AdminAuthSession>('/api/admin/auth', {
      method: 'POST',
      body: JSON.stringify({ accessCode }),
    }),

  // Admin Overview & Analytics
  getAdminOverview: () => request<AdminOverviewPayload>('/api/admin/overview'),

  // Admin User Management
  listAdminUsers: (params: {
    search?: string;
    status?: string;
    dateRange?: string;
    university?: string;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    if (params.dateRange) qs.set('dateRange', params.dateRange);
    if (params.university) qs.set('university', params.university);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return request<{
      items: AdminUserRecord[];
      total: number;
      page: number;
      totalPages: number;
    }>(`/api/admin/users?${qs.toString()}`);
  },

  getAdminUserDetail: (id: string) =>
    request<{ user: AdminUserDetail }>(`/api/admin/users/${id}`),

  updateAdminUserStatus: (id: string, status: UserStatus) =>
    request<{ user: AdminUserRecord }>(`/api/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  resetUserPassword: (id: string) =>
    request<{
      initiated: boolean;
      email: string;
      expiresAt: string;
      resetLinkPreview: string;
    }>(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
    }),

  deleteAdminUser: (id: string) =>
    request<{ deleted: boolean }>(`/api/admin/users/${id}`, {
      method: 'DELETE',
    }),

  downloadUsersCsv: async () => {
    const res = await fetch('/api/admin/users/export', {
      headers: inMemoryAdminToken
        ? { Authorization: `Bearer ${inMemoryAdminToken}` }
        : {},
    });
    if (!res.ok) {
      throw new Error('Failed to export user directory.');
    }
    return res.text();
  },

  // Admin Subjects, Chapters, Topics & Uploads
  getAdminSubjects: () =>
    request<{ subjects: SubjectSummary[]; topics: TopicInfo[] }>(
      '/api/admin/subjects'
    ),

  addChapter: (payload: {
    subjectId: SubjectId;
    name: string;
    banglaName: string;
  }) =>
    request<{ subjects: SubjectSummary[] }>('/api/admin/chapters', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  addTopic: (payload: {
    subjectId: SubjectId;
    chapterId: string;
    name: string;
    banglaName?: string;
  }) =>
    request<{ topics: TopicInfo[] }>('/api/admin/topics', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadQuestionImage: (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return request<{ imageUrl: string }>('/api/admin/uploads/image', {
      method: 'POST',
      body: fd,
    });
  },

  // Admin Question Bank CRUD & Lifecycle
  listAdminQuestions: (params: {
    search?: string;
    subjectId?: string;
    universityTag?: string;
    admissionCategory?: string;
    difficulty?: string;
    chapter?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.subjectId) qs.set('subjectId', params.subjectId);
    if (params.universityTag) qs.set('universityTag', params.universityTag);
    if (params.admissionCategory) qs.set('admissionCategory', params.admissionCategory);
    if (params.difficulty) qs.set('difficulty', params.difficulty);
    if (params.chapter) qs.set('chapter', params.chapter);
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return request<{
      items: QuestionItem[];
      total: number;
      page: number;
      totalPages: number;
    }>(`/api/admin/questions?${qs.toString()}`);
  },

  createQuestion: (payload: Omit<QuestionItem, 'id' | 'createdAt'>) =>
    request<{ question: QuestionItem }>('/api/admin/questions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateQuestion: (
    id: string,
    payload: Partial<Omit<QuestionItem, 'id' | 'createdAt'>>
  ) =>
    request<{ question: QuestionItem }>(`/api/admin/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  setQuestionStatus: (id: string, status: QuestionStatus) =>
    request<{ question: QuestionItem }>(`/api/admin/questions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  getQuestionHistory: (id: string) =>
    request<{ history: QuestionHistoryEntry[] }>(`/api/admin/questions/${id}/history`),

  duplicateQuestion: (id: string) =>
    request<{ question: QuestionItem }>(`/api/admin/questions/${id}/duplicate`, {
      method: 'POST',
    }),

  deleteQuestion: (id: string) =>
    request<{ deleted: boolean }>(`/api/admin/questions/${id}`, {
      method: 'DELETE',
    }),

  // AI Question Builder & Review Queue
  analyzeImportInput: (payload: {
    rawText?: string;
    answerKeyText?: string;
    file?: File | null;
    defaultSubjectId?: SubjectId;
    defaultUniversityTag?: UniversityTrack;
    defaultAdmissionCategory?: AdmissionCategory;
    defaultMarks?: number;
    defaultNegativeMarking?: number;
    defaultSourceName?: string;
    defaultSourceYear?: string;
  }) => {
    const fd = new FormData();
    if (payload.rawText) fd.append('rawText', payload.rawText);
    if (payload.answerKeyText) fd.append('answerKeyText', payload.answerKeyText);
    if (payload.defaultSubjectId) fd.append('defaultSubjectId', payload.defaultSubjectId);
    if (payload.defaultUniversityTag) {
      fd.append('defaultUniversityTag', payload.defaultUniversityTag);
    }
    if (payload.defaultAdmissionCategory) {
      fd.append('defaultAdmissionCategory', payload.defaultAdmissionCategory);
    }
    if (payload.defaultMarks !== undefined) {
      fd.append('defaultMarks', String(payload.defaultMarks));
    }
    if (payload.defaultNegativeMarking !== undefined) {
      fd.append('defaultNegativeMarking', String(payload.defaultNegativeMarking));
    }
    if (payload.defaultSourceName) fd.append('defaultSourceName', payload.defaultSourceName);
    if (payload.defaultSourceYear) fd.append('defaultSourceYear', payload.defaultSourceYear);
    if (payload.file) fd.append('file', payload.file);
    return request<{
      batchId: string;
      items: StagedImportQuestion[];
      sourceLabel: string;
    }>('/api/admin/importer/analyze', {
      method: 'POST',
      body: fd,
    });
  },

  applyAnswerKeyToImportItems: (stagedIds: string[], answerKeyText: string) =>
    request<{
      updatedCount: number;
      unmatchedCount: number;
      updatedItems: StagedImportQuestion[];
      remainingQueue: StagedImportQuestion[];
    }>('/api/admin/importer/apply-answers', {
      method: 'POST',
      body: JSON.stringify({ stagedIds, answerKeyText }),
    }),

  getImportQueue: (status = 'active') =>
    request<{ items: StagedImportQuestion[] }>(
      `/api/admin/importer/queue?status=${encodeURIComponent(status)}`
    ),

  updateStagedImportItem: (
    id: string,
    payload: Partial<StagedImportQuestion> & { dismissDuplicate?: boolean }
  ) =>
    request<{ item: StagedImportQuestion }>(`/api/admin/importer/item/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  rejectStagedImportItem: (id: string) =>
    request<{ rejected: boolean; remainingQueue: StagedImportQuestion[] }>(
      `/api/admin/importer/item/${id}/reject`,
      { method: 'POST' }
    ),

  deleteStagedImportItem: (id: string) =>
    request<{ deleted: boolean; remainingQueue: StagedImportQuestion[] }>(
      `/api/admin/importer/item/${id}`,
      { method: 'DELETE' }
    ),

  approveImportItems: (
    ids: string[],
    options?: { publishImmediately?: boolean; excludeNeedsReview?: boolean }
  ) =>
    request<{
      approvedQuestions: QuestionItem[];
      skipped: Array<{ id: string; reason: string }>;
      remainingQueue: StagedImportQuestion[];
    }>('/api/admin/importer/approve', {
      method: 'POST',
      body: JSON.stringify({
        ids,
        publishImmediately: options?.publishImmediately,
        excludeNeedsReview: options?.excludeNeedsReview,
      }),
    }),

  publishImportItems: (ids: string[]) =>
    request<{
      publishedCount: number;
      questionIds: string[];
      remainingQueue: StagedImportQuestion[];
    }>('/api/admin/importer/publish', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  assignImportItemsToExam: (payload: {
    stagedIds: string[];
    examId?: string;
    newExam?: {
      title: string;
      subtitle?: string;
      universityTrack: UniversityTrack;
      durationMinutes: number;
      negativeMarking: number;
      isPublished?: boolean;
    };
    publishQuestions?: boolean;
  }) =>
    request<{
      exam: ExamConfig;
      assignedQuestionIds: string[];
      skipped: Array<{ id: string; reason: string }>;
      remainingQueue: StagedImportQuestion[];
    }>('/api/admin/importer/assign-exam', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin Exam Management
  listAdminExams: () => request<{ exams: ExamConfig[] }>('/api/admin/exams'),

  createExam: (payload: Omit<ExamConfig, 'id' | 'participantsCount'>) =>
    request<{ exam: ExamConfig }>('/api/admin/exams', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateExam: (
    id: string,
    payload: Partial<Omit<ExamConfig, 'id' | 'participantsCount'>>
  ) =>
    request<{ exam: ExamConfig }>(`/api/admin/exams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteExam: (id: string) =>
    request<{ deleted: boolean }>(`/api/admin/exams/${id}`, {
      method: 'DELETE',
    }),

  getExamAttempts: (id: string) =>
    request<{
      attempts: Array<{
        id: string;
        userId: string;
        userName: string;
        userEmail: string;
        rawScore: number;
        maxScore: number;
        accuracy: number;
        durationSecondsSpent: number;
        submittedAt: string;
      }>;
    }>(`/api/admin/exams/${id}/attempts`),
};
