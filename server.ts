import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  type AdminRequest,
  type StudentRequest,
  clearStudentSessionCookie,
  extractStudentSessionFromRequest,
  hashPassword,
  logAdminAudit,
  rateLimit,
  requireAdmin,
  requireStudent,
  setStudentSessionCookie,
  signAdminToken,
  signStudentToken,
  verifyPassword,
} from './server/auth';
import { getDb, UPLOADS_DIR } from './server/db';
import {
  analyzeExamAttempt,
  askAiMentor,
  explainQuestionForReview,
  generatePracticeQuestions,
  generateStudyPlan,
  getAiStatus,
} from './server/gemini';
import {
  analyzeAndStageQuestions,
  applyAnswerKeyToStagedItems,
  approveStagedImportItems,
  assignStagedOrApprovedToExam,
  deleteStagedImportItem,
  listPendingImportQueue,
  publishApprovedStagedItems,
  rejectStagedImportItem,
  updateStagedImportItem,
} from './server/importer';
import {
  addChapter,
  addTopic,
  answerDailyChallenge,
  checkPracticeAnswer,
  createExam,
  createQuestion,
  createStudentPasswordOtp,
  deleteAdminUser,
  deleteExam,
  deleteQuestion,
  duplicateQuestion,
  exportPermittedUsersCsv,
  getAdminOverviewPayload,
  getAdminSubjectsWithTopics,
  getAdminUserDetail,
  getAttemptReview,
  getAttemptsForUser,
  getBootstrapData,
  getQuestionForStudentAttemptReview,
  getExamAttemptsByExam,
  getExams,
  getLeaderboard,
  getQuestionHistory,
  getStudentProfile,
  getSubjects,
  getWeeklyPerformance,
  gradeAndRecordAttempt,
  listAdminQuestions,
  listAdminUsers,
  loginStudent,
  markNotificationsRead,
  registerStudent,
  saveAttemptAiAnalysis,
  setQuestionStatus,
  triggerUserPasswordReset,
  updateAdminUserStatus,
  updateExam,
  updateQuestion,
  updateStudentAvatar,
  updateStudentProfile,
  updateStudentTrack,
  verifyStudentPasswordOtpAndReset,
} from './server/store';
import type {
  AdmissionCategory,
  QuestionStatus,
  SubjectId,
  UniversityTrack,
  UserStatus,
} from './src/types';

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop() || '';
    const allowedExt = new Set(['pdf', 'docx', 'txt']);
    if (!allowedExt.has(ext)) {
      cb(new Error('Only .pdf, .docx, and .txt files are supported.'));
      return;
    }
    cb(null, true);
  },
});

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop() || '';
    const allowedExt = new Set(['png', 'jpg', 'jpeg', 'webp']);
    const allowedMime = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowedExt.has(ext) || !allowedMime.has(file.mimetype)) {
      cb(new Error('Only PNG, JPG, JPEG, or WEBP images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

async function startServer() {
  // Initialize SQLite database & seed/migrate before accepting traffic
  getDb();

  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  // Safely serve uploaded question diagrams with path-traversal confinement
  app.get('/api/uploads/:filename', (req, res) => {
    const safeBase = path.basename(req.params.filename);
    if (!/^[a-zA-Z0-9._-]+$/.test(safeBase)) {
      res.status(400).json({ error: 'Invalid file name.' });
      return;
    }
    const targetPath = path.resolve(UPLOADS_DIR, safeBase);
    if (!targetPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(targetPath)) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(targetPath);
  });

  // --- Student Authentication & Session Routes ---

  const authRateLimiter = rateLimit({ windowMs: 60_000, max: 15 });
  const otpRateLimiter = rateLimit({ windowMs: 60_000, max: 6 });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, aiStatus: getAiStatus() });
  });

  app.get('/api/auth/me', (req, res) => {
    try {
      const { decoded } = extractStudentSessionFromRequest(req);
      if (!decoded) {
        res.status(401).json({ authenticated: false, error: 'লগইন সেশন সক্রিয় নয়।' });
        return;
      }
      const db = getDb();
      const row = db
        .prepare(
          `SELECT u.id, u.status
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
           WHERE u.id = ?`
        )
        .get(decoded.sub) as { id: string; status: string } | undefined;

      if (!row || row.status !== 'active') {
        clearStudentSessionCookie(res);
        res.status(401).json({ authenticated: false, error: 'সেশন পাওয়া যায়নি।' });
        return;
      }

      const student = getStudentProfile(row.id);
      const token = signStudentToken({ id: student.id, email: student.email, rememberMe: true });
      res.json({ authenticated: true, token, student });
    } catch {
      res.status(401).json({ authenticated: false, error: 'সেশন যাচাই করা যায়নি।' });
    }
  });

  app.post('/api/auth/register', authRateLimiter, (req, res) => {
    try {
      const body = req.body as {
        fullName?: string;
        email?: string;
        phone?: string;
        password?: string;
        hscBatch?: string;
        targetTrack?: UniversityTrack;
        rememberMe?: boolean;
      };
      const student = registerStudent({
        fullName: body.fullName ?? '',
        email: body.email ?? '',
        phone: body.phone ?? '',
        password: body.password ?? '',
        hscBatch: body.hscBatch ?? 'HSC 2026',
        targetTrack: body.targetTrack ?? 'DU Ka',
      });
      const rememberMe = body.rememberMe !== false;
      const token = signStudentToken({
        id: student.id,
        email: student.email,
        rememberMe,
      });
      setStudentSessionCookie(res, token, rememberMe);
      res.status(201).json({ authenticated: true, token, student });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'অ্যাকাউন্ট তৈরি করা যায়নি।',
      });
    }
  });

  app.post('/api/auth/login', authRateLimiter, (req, res) => {
    try {
      const body = req.body as {
        identifier?: string;
        password?: string;
        rememberMe?: boolean;
      };
      if (!body.identifier?.trim() || !body.password) {
        res.status(400).json({ error: 'ইমেইল বা মোবাইল নম্বর এবং পাসওয়ার্ড দিন।' });
        return;
      }
      const student = loginStudent({
        identifier: body.identifier,
        password: body.password,
      });
      const rememberMe = Boolean(body.rememberMe);
      const token = signStudentToken({
        id: student.id,
        email: student.email,
        rememberMe,
      });
      setStudentSessionCookie(res, token, rememberMe);
      res.json({ authenticated: true, token, student });
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'লগইন ব্যর্থ হয়েছে।',
      });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearStudentSessionCookie(res);
    res.json({ loggedOut: true });
  });

  app.post('/api/auth/forgot-password', otpRateLimiter, (req, res) => {
    try {
      const { identifier } = req.body as { identifier?: string };
      if (!identifier?.trim()) {
        res.status(400).json({ error: 'ইমেইল বা মোবাইল নম্বর দিন।' });
        return;
      }
      const result = createStudentPasswordOtp(identifier);
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'যাচাইকরণ কোড পাঠানো যায়নি।',
      });
    }
  });

  app.post('/api/auth/reset-password', otpRateLimiter, (req, res) => {
    try {
      const { identifier, otp, newPassword } = req.body as {
        identifier?: string;
        otp?: string;
        newPassword?: string;
      };
      if (!identifier?.trim() || !otp?.trim() || !newPassword) {
        res.status(400).json({ error: 'সবগুলো তথ্য সঠিকভাবে পূরণ করুন।' });
        return;
      }
      const result = verifyStudentPasswordOtpAndReset({
        identifier,
        otp,
        newPassword,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'পাসওয়ার্ড রিসেট করা যায়নি।',
      });
    }
  });

  // --- Protected Student App Routes ---

  app.get('/api/bootstrap', requireStudent, (req: StudentRequest, res) => {
    res.json(getBootstrapData(req.studentUser!.id));
  });

  app.post('/api/daily-challenge/answer', requireStudent, (req: StudentRequest, res) => {
    try {
      const { selectedIndex } = req.body as { selectedIndex?: number };
      if (typeof selectedIndex !== 'number' || selectedIndex < 0 || selectedIndex > 3) {
        res.status(400).json({ error: 'সঠিক অপশন (0-3) নির্বাচন করুন।' });
        return;
      }
      res.json(answerDailyChallenge(req.studentUser!.id, selectedIndex));
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'চ্যালেঞ্জ উত্তর জমা দেওয়া যায়নি।',
      });
    }
  });

  app.post('/api/attempts', requireStudent, (req: StudentRequest, res) => {
    try {
      const { examId, answers, markedForReview, durationSecondsSpent, submissionId } =
        req.body as {
          examId?: string;
          answers?: Record<string, number | null>;
          markedForReview?: string[];
          durationSecondsSpent?: number;
          submissionId?: string;
        };

      if (
        !examId ||
        typeof examId !== 'string' ||
        !answers ||
        typeof answers !== 'object' ||
        Array.isArray(answers) ||
        typeof durationSecondsSpent !== 'number' ||
        !Number.isFinite(durationSecondsSpent) ||
        durationSecondsSpent < 0
      ) {
        res.status(400).json({
          error: 'পরীক্ষার তথ্য সঠিকভাবে জমা দেওয়া হয়নি।',
        });
        return;
      }

      const studentId = req.studentUser!.id;
      const { attempt, gradedQuestions } = gradeAndRecordAttempt(studentId, {
        examId,
        answers,
        markedForReview: Array.isArray(markedForReview) ? markedForReview : [],
        durationSecondsSpent,
        submissionId: typeof submissionId === 'string' ? submissionId : undefined,
      });

      res.status(201).json({
        attempt,
        gradedQuestions,
        student: getStudentProfile(studentId),
        subjects: getSubjects(studentId),
        weeklyPerformance: getWeeklyPerformance(studentId),
        leaderboard: getLeaderboard(studentId),
        attempts: getAttemptsForUser(studentId),
      });
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      res.status(code === 'DUPLICATE_SUBMISSION' ? 409 : 400).json({
        error: err instanceof Error ? err.message : 'পরীক্ষা জমা দেওয়া ব্যর্থ হয়েছে।',
        code,
      });
    }
  });

  app.get('/api/attempts/:id/review', requireStudent, (req: StudentRequest, res) => {
    const review = getAttemptReview(req.studentUser!.id, req.params.id);
    if (!review) {
      res.status(404).json({ error: 'পরীক্ষার রিভিউ পাওয়া যায়নি।' });
      return;
    }
    res.json(review);
  });

  app.post('/api/practice/check', requireStudent, (req: StudentRequest, res) => {
    try {
      const { questionId, selectedIndex, revealOnly } = req.body as {
        questionId?: string;
        selectedIndex?: number | null;
        revealOnly?: boolean;
      };
      if (!questionId) {
        res.status(400).json({ error: 'সঠিক প্রশ্ন নির্বাচন করুন।' });
        return;
      }
      if (revealOnly === true) {
        res.json(checkPracticeAnswer(questionId, null));
        return;
      }
      if (typeof selectedIndex !== 'number' || selectedIndex < 0 || selectedIndex > 3) {
        res.status(400).json({ error: 'সঠিক প্রশ্ন ও অপশন নির্বাচন করুন।' });
        return;
      }
      res.json(checkPracticeAnswer(questionId, selectedIndex));
    } catch (err) {
      res.status(404).json({
        error: err instanceof Error ? err.message : 'প্রশ্ন যাচাই করা যায়নি।',
      });
    }
  });

  app.post('/api/student/notifications/read', requireStudent, (req: StudentRequest, res) => {
    res.json({ notifications: markNotificationsRead(req.studentUser!.id) });
  });

  app.post('/api/student/track', requireStudent, (req: StudentRequest, res) => {
    const { targetTrack } = req.body as { targetTrack?: UniversityTrack };
    if (!targetTrack) {
      res.status(400).json({ error: 'লক্ষ্য বিশ্ববিদ্যালয় নির্বাচন করুন।' });
      return;
    }
    res.json({ student: updateStudentTrack(req.studentUser!.id, targetTrack) });
  });

  app.put('/api/student/profile', requireStudent, (req: StudentRequest, res) => {
    try {
      const body = req.body as {
        name?: string;
        phone?: string;
        college?: string;
        division?: string;
        hscBatch?: string;
        targetTrack?: UniversityTrack;
        secondaryTrack?: UniversityTrack;
      };
      const updated = updateStudentProfile(req.studentUser!.id, {
        name: body.name ?? '',
        phone: body.phone ?? '',
        college: body.college ?? '',
        division: body.division ?? 'Dhaka',
        hscBatch: body.hscBatch ?? 'HSC 2026',
        targetTrack: body.targetTrack ?? 'DU Ka',
        secondaryTrack: body.secondaryTrack ?? 'BUET',
      });
      res.json({ student: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'প্রোফাইল তথ্য হালনাগাদ করা যায়নি।',
      });
    }
  });

  app.post(
    '/api/student/avatar',
    requireStudent,
    (req, res, next) => {
      uploadImage.single('avatar')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err.message || 'ছবি আপলোড করা যায়নি।' });
          return;
        }
        next();
      });
    },
    (req: StudentRequest, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'কোনো ছবি ফাইল পাওয়া যায়নি।' });
        return;
      }
      const ext = (req.file.originalname.toLowerCase().split('.').pop() || 'png').replace(
        /[^a-z0-9]/g,
        ''
      );
      const filename = `avatar-${req.studentUser!.id}-${Date.now().toString(36)}.${ext}`;
      const targetPath = path.resolve(UPLOADS_DIR, filename);
      fs.writeFileSync(targetPath, req.file.buffer);
      const avatarUrl = `/api/uploads/${filename}`;
      const student = updateStudentAvatar(req.studentUser!.id, avatarUrl);
      res.status(201).json({ avatarUrl, student });
    }
  );

  // --- Protected AI Mentor Endpoints ---

  app.post('/api/ai/mentor', requireStudent, async (req: StudentRequest, res) => {
    try {
      const { message, language } = req.body as {
        message?: string;
        language?: 'bilingual' | 'bangla' | 'english';
      };
      if (!message?.trim()) {
        res.status(400).json({ error: 'প্রশ্ন বা বার্তা খালি রাখা যাবে না।' });
        return;
      }
      const studentId = req.studentUser!.id;
      const result = await askAiMentor({
        message: message.trim(),
        language: language ?? 'bilingual',
        student: getStudentProfile(studentId),
        subjects: getSubjects(studentId),
      });
      res.json(result);
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      res.status(code === 'AI_NOT_CONFIGURED' ? 503 : 500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Gemini AI সেবায় সংযোগ করা যায়নি।',
        code: code ?? 'AI_ERROR',
      });
    }
  });

  app.post('/api/ai/study-plan', requireStudent, async (req: StudentRequest, res) => {
    try {
      const { focusGoal } = req.body as { focusGoal?: string };
      const studentId = req.studentUser!.id;
      const plan = await generateStudyPlan({
        student: getStudentProfile(studentId),
        subjects: getSubjects(studentId),
        focusGoal: focusGoal ?? '',
      });
      res.json(plan);
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      res.status(code === 'AI_NOT_CONFIGURED' ? 503 : 500).json({
        error:
          err instanceof Error
            ? err.message
            : 'AI Study Plan তৈরি করা যায়নি।',
        code: code ?? 'AI_ERROR',
      });
    }
  });

  app.post('/api/ai/practice-questions', requireStudent, async (req: StudentRequest, res) => {
    try {
      const { subject, topic, universityTrack, count } = req.body as {
        subject?: string;
        topic?: string;
        universityTrack?: string;
        count?: number;
      };
      if (!subject || !topic) {
        res.status(400).json({ error: 'বিষয় এবং অধ্যায়ের নাম দিন।' });
        return;
      }
      const questions = await generatePracticeQuestions({
        subject,
        topic,
        universityTrack: universityTrack ?? 'DU Ka',
        count: Number(count) || 3,
      });
      res.json({ questions });
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      res.status(code === 'AI_NOT_CONFIGURED' ? 503 : 500).json({
        error:
          err instanceof Error
            ? err.message
            : 'অনুশীলনী প্রশ্ন তৈরি করা যায়নি।',
        code: code ?? 'AI_ERROR',
      });
    }
  });

  app.post('/api/ai/analyze-attempt', requireStudent, async (req: StudentRequest, res) => {
    try {
      const { attemptId } = req.body as { attemptId?: string };
      const studentId = req.studentUser!.id;
      const attempts = getAttemptsForUser(studentId);
      const attempt = attempts.find((a) => a.id === attemptId);
      if (!attempt) {
        res.status(404).json({ error: 'পরীক্ষার ফলাফল পাওয়া যায়নি।' });
        return;
      }
      const analysis = await analyzeExamAttempt({
        attempt,
        student: getStudentProfile(studentId),
      });
      const updated = saveAttemptAiAnalysis(studentId, attempt.id, analysis);
      res.json({ analysis, attempt: updated ?? { ...attempt, aiAnalysis: analysis } });
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      res.status(code === 'AI_NOT_CONFIGURED' ? 503 : 500).json({
        error:
          err instanceof Error
            ? err.message
            : 'পরীক্ষার ফলাফল বিশ্লেষণ করা যায়নি।',
        code: code ?? 'AI_ERROR',
      });
    }
  });

  app.post(
    '/api/ai/explain-question',
    requireStudent,
    rateLimit({ windowMs: 60_000, max: 15 }),
    async (req: StudentRequest, res) => {
      try {
        const { attemptId, questionId } = req.body as {
          attemptId?: string;
          questionId?: string;
        };
        if (!attemptId?.trim() || !questionId?.trim()) {
          res.status(400).json({ error: 'পরীক্ষা ও প্রশ্ন নির্বাচন করুন।' });
          return;
        }
        const ctx = getQuestionForStudentAttemptReview(
          req.studentUser!.id,
          attemptId.trim(),
          questionId.trim()
        );
        if (!ctx) {
          res.status(404).json({ error: 'এই পরীক্ষার প্রশ্নটি পাওয়া যায়নি।' });
          return;
        }
        const result = await explainQuestionForReview({
          prompt: ctx.question.prompt,
          promptBn: ctx.question.promptBn,
          options: ctx.question.options,
          correctIndex: ctx.question.correctIndex,
          selectedIndex: ctx.selectedIndex,
          subjectName: ctx.question.subjectName,
          chapter: ctx.question.chapter,
          officialExplanationEn: ctx.question.explanationEn,
          officialExplanationBn: ctx.question.explanationBn,
        });
        res.json(result);
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        res.status(code === 'AI_NOT_CONFIGURED' ? 503 : 500).json({
          error:
            err instanceof Error
              ? err.message
              : 'AI দিয়ে প্রশ্নের ব্যাখ্যা তৈরি করা যায়নি।',
          code: code ?? 'AI_ERROR',
        });
      }
    }
  );

  // --- Admin Auth Endpoints ---

  app.get('/api/admin/status', (_req, res) => {
    const db = getDb();
    const countRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM user_roles WHERE role = 'admin' AND user_id != 'adm-env-operator'")
      .get() as { cnt: number };
    const configuredCode = process.env.ADMIN_ACCESS_CODE?.trim();
    res.json({
      hasAdminAccount: Number(countRow.cnt) > 0,
      accessCodeConfigured: Boolean(configuredCode),
    });
  });

  app.post('/api/admin/bootstrap', authRateLimiter, (req, res) => {
    if (process.env.ADMIN_ACCESS_CODE?.trim()) {
      res.status(403).json({
        error: 'সার্ভার অ্যাক্সেস কোড (ADMIN_ACCESS_CODE) সক্রিয় রয়েছে — অ্যাক্সেস কোড দিয়ে প্রবেশ করুন।',
      });
      return;
    }

    const db = getDb();
    const countRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM user_roles WHERE role = 'admin' AND user_id != 'adm-env-operator'")
      .get() as { cnt: number };

    if (Number(countRow.cnt) > 0) {
      res.status(409).json({
        error: 'An administrator account already exists. Please sign in with your credentials.',
      });
      return;
    }

    const { fullName, email, password } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
    };

    const cleanName = (fullName ?? '').trim();
    const cleanEmail = (email ?? '').trim().toLowerCase();
    if (!cleanName || !cleanEmail.includes('@')) {
      res.status(400).json({ error: 'Valid full name and email address are required.' });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Administrator password must be at least 8 characters.' });
      return;
    }

    const existingUser = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
      .get(cleanEmail) as { id: string } | undefined;
    if (existingUser) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const adminId = `adm-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare(
        `INSERT INTO users (id, email, password_hash, status, created_at, last_login_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      ).run(adminId, cleanEmail, passwordHash, now, now);

      db.prepare(
        `INSERT INTO user_profiles (
          user_id, full_name, college, division, hsc_batch, target_university, secondary_university, avatar_url
        ) VALUES (?, ?, 'ADMITLY Operations', 'Dhaka', 'Staff', 'DU Ka', 'BUET', '')`
      ).run(adminId, cleanName);

      db.prepare(
        "INSERT INTO user_roles (user_id, role, assigned_at) VALUES (?, 'admin', ?)"
      ).run(adminId, now);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Failed to create administrator account.' });
      return;
    }

    const token = signAdminToken({ id: adminId, email: cleanEmail, role: 'admin' });
    logAdminAudit({
      adminUser: { id: adminId, email: cleanEmail, fullName: cleanName, role: 'admin' },
      action: 'ADMIN_BOOTSTRAP',
      targetType: 'user',
      targetId: adminId,
      details: `Provisioned primary administrator account (${cleanEmail}).`,
    });

    res.status(201).json({
      authenticated: true,
      token,
      admin: {
        id: adminId,
        email: cleanEmail,
        fullName: cleanName,
        role: 'admin',
      },
    });
  });

  app.post('/api/admin/login', authRateLimiter, (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email ?? '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const db = getDb();
    const row = db
      .prepare(
        `SELECT u.id, u.email, u.password_hash, u.status, ur.role,
                COALESCE(up.full_name, 'Administrator') AS full_name
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE LOWER(u.email) = ? AND ur.role = 'admin'`
      )
      .get(cleanEmail) as
      | {
          id: string;
          email: string;
          password_hash: string;
          status: string;
          role: 'admin';
          full_name: string;
        }
      | undefined;

    if (row?.id === 'adm-env-operator') {
      res.status(401).json({
        error: 'এই অ্যাডমিন সেশনটি সার্ভার অ্যাক্সেস কোড (ADMIN_ACCESS_CODE) দিয়ে কাজ করে। অ্যাক্সেস কোড দিয়ে প্রবেশ করুন।',
      });
      return;
    }

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।' });
      return;
    }

    if (row.status !== 'active') {
      res.status(403).json({ error: 'This administrator account is currently suspended.' });
      return;
    }

    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      row.id
    );

    const token = signAdminToken({ id: row.id, email: row.email, role: 'admin' });
    const adminUser = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: 'admin' as const,
    };

    logAdminAudit({
      adminUser,
      action: 'ADMIN_LOGIN',
      targetType: 'session',
      targetId: row.id,
      details: `Administrator signed in (${row.email}).`,
    });

    res.json({
      authenticated: true,
      token,
      admin: adminUser,
    });
  });

  app.post('/api/admin/auth', authRateLimiter, (req, res) => {
    const configured = process.env.ADMIN_ACCESS_CODE?.trim();
    if (!configured) {
      res.status(400).json({
        authenticated: false,
        error: 'Access-code sign-in is not configured. Use Administrator Email & Password sign-in.',
      });
      return;
    }

    const { accessCode } = req.body as { accessCode?: string };
    const providedDigest = crypto
      .createHash('sha256')
      .update((accessCode ?? '').trim())
      .digest();
    const expectedDigest = crypto.createHash('sha256').update(configured).digest();

    if (!accessCode || !crypto.timingSafeEqual(providedDigest, expectedDigest)) {
      res.status(401).json({
        authenticated: false,
        error: 'Invalid administrator access code.',
      });
      return;
    }

    const db = getDb();
    let adminRow = db
      .prepare(
        `SELECT u.id, u.email, COALESCE(up.full_name, 'ADMITLY Admin') AS full_name
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE ur.role = 'admin' AND u.status = 'active'
         LIMIT 1`
      )
      .get() as { id: string; email: string; full_name: string } | undefined;

    if (!adminRow) {
      const adminId = 'adm-env-operator';
      const now = new Date().toISOString();
      const email = 'admin@admitly.edu.bd';
      const passHash = hashPassword(crypto.randomBytes(24).toString('hex'));
      db.exec('BEGIN TRANSACTION');
      try {
        db.prepare(
          `INSERT INTO users (id, email, password_hash, status, created_at, last_login_at)
           VALUES (?, ?, ?, 'active', ?, ?)`
        ).run(adminId, email, passHash, now, now);
        db.prepare(
          `INSERT INTO user_profiles (user_id, full_name, college, division, hsc_batch, target_university, secondary_university)
           VALUES (?, 'ADMITLY Operations Admin', 'ADMITLY HQ', 'Dhaka', 'Staff', 'DU Ka', 'BUET')`
        ).run(adminId);
        db.prepare(
          "INSERT INTO user_roles (user_id, role, assigned_at) VALUES (?, 'admin', ?)"
        ).run(adminId, now);
        db.exec('COMMIT');
        adminRow = { id: adminId, email, full_name: 'ADMITLY Operations Admin' };
      } catch {
        db.exec('ROLLBACK');
        res.status(500).json({ error: 'Unable to provision admin session.' });
        return;
      }
    }

    const token = signAdminToken({
      id: adminRow.id,
      email: adminRow.email,
      role: 'admin',
    });
    res.json({
      authenticated: true,
      token,
      admin: {
        id: adminRow.id,
        email: adminRow.email,
        fullName: adminRow.full_name,
        role: 'admin',
      },
    });
  });

  // --- Protected Admin Endpoints (RBAC + Bearer Token) ---

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    res.json(getAdminOverviewPayload());
  });

  // User Management
  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const result = listAdminUsers({
      search: String(req.query.search ?? ''),
      status: String(req.query.status ?? 'all'),
      dateRange: String(req.query.dateRange ?? 'all'),
      university: String(req.query.university ?? 'all'),
      page: Number(req.query.page ?? 1),
      limit: Number(req.query.limit ?? 15),
    });
    res.json(result);
  });

  app.get('/api/admin/users/export', requireAdmin, (req: AdminRequest, res) => {
    const csv = exportPermittedUsersCsv();
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'EXPORT_USERS_CSV',
      targetType: 'users',
      targetId: 'all',
      details: 'Exported permitted student/user directory CSV (excluding credentials).',
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admitly-users-export.csv"');
    res.send(csv);
  });

  app.get('/api/admin/users/:id', requireAdmin, (req, res) => {
    const detail = getAdminUserDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: detail });
  });

  app.patch('/api/admin/users/:id/status', requireAdmin, (req: AdminRequest, res) => {
    const { status } = req.body as { status?: UserStatus };
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'status must be active or suspended.' });
      return;
    }
    if (req.params.id === req.adminUser?.id && status === 'suspended') {
      res.status(400).json({ error: 'You cannot suspend your own administrator account.' });
      return;
    }
    const updated = updateAdminUserStatus(req.params.id, status);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: status === 'suspended' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
      targetType: 'user',
      targetId: req.params.id,
      details: `Changed user ${updated.email} status to ${status}.`,
    });
    res.json({ user: updated });
  });

  app.post(
    '/api/admin/users/:id/reset-password',
    requireAdmin,
    rateLimit({ windowMs: 60_000, max: 20 }),
    (req: AdminRequest, res) => {
      const result = triggerUserPasswordReset(req.params.id);
      if (!result) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      logAdminAudit({
        adminUser: req.adminUser,
        action: 'INITIATE_PASSWORD_RESET',
        targetType: 'user',
        targetId: req.params.id,
        details: `Issued one-time password reset token for ${result.email}.`,
      });
      res.json({
        initiated: true,
        email: result.email,
        expiresAt: result.expiresAt,
        resetLinkPreview: `/reset-password?token=${result.resetToken}`,
      });
    }
  );

  app.delete('/api/admin/users/:id', requireAdmin, (req: AdminRequest, res) => {
    const outcome = deleteAdminUser(req.params.id, req.adminUser?.id ?? '');
    if (!outcome.deleted) {
      res.status(outcome.reason ? 400 : 404).json({
        error: outcome.reason || 'User not found.',
      });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'DELETE_USER',
      targetType: 'user',
      targetId: req.params.id,
      details: `Permanently removed user account ${req.params.id}.`,
    });
    res.json({ deleted: true });
  });

  // Subjects, Chapters & Topics
  app.get('/api/admin/subjects', requireAdmin, (_req, res) => {
    res.json(getAdminSubjectsWithTopics());
  });

  app.post('/api/admin/chapters', requireAdmin, (req: AdminRequest, res) => {
    const { subjectId, name, banglaName } = req.body as {
      subjectId?: SubjectId;
      name?: string;
      banglaName?: string;
    };
    if (!subjectId || !name?.trim()) {
      res.status(400).json({ error: 'subjectId and chapter name are required.' });
      return;
    }
    const subjects = addChapter({ subjectId, name: name.trim(), banglaName });
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'ADD_CHAPTER',
      targetType: 'subject',
      targetId: subjectId,
      details: `Added chapter "${name.trim()}" under ${subjectId}.`,
    });
    res.status(201).json({ subjects });
  });

  app.post('/api/admin/topics', requireAdmin, (req: AdminRequest, res) => {
    const { subjectId, chapterId, name, banglaName } = req.body as {
      subjectId?: SubjectId;
      chapterId?: string;
      name?: string;
      banglaName?: string;
    };
    if (!subjectId || !chapterId || !name?.trim()) {
      res.status(400).json({ error: 'subjectId, chapterId, and topic name are required.' });
      return;
    }
    const topics = addTopic({ subjectId, chapterId, name: name.trim(), banglaName });
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'ADD_TOPIC',
      targetType: 'chapter',
      targetId: chapterId,
      details: `Added topic "${name.trim()}".`,
    });
    res.status(201).json({ topics });
  });

  // Image Upload for Question Diagrams
  app.post(
    '/api/admin/uploads/image',
    requireAdmin,
    (req, res, next) => {
      uploadImage.single('image')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err.message || 'Image upload failed.' });
          return;
        }
        next();
      });
    },
    (req: AdminRequest, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'No image file received.' });
        return;
      }
      const ext = (req.file.originalname.toLowerCase().split('.').pop() || 'png').replace(
        /[^a-z0-9]/g,
        ''
      );
      const filename = `qimg-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const targetPath = path.resolve(UPLOADS_DIR, filename);
      fs.writeFileSync(targetPath, req.file.buffer);
      res.status(201).json({ imageUrl: `/api/uploads/${filename}` });
    }
  );

  // Question Bank CRUD & Lifecycle
  app.get('/api/admin/questions', requireAdmin, (req, res) => {
    const result = listAdminQuestions({
      search: String(req.query.search ?? ''),
      subjectId: String(req.query.subjectId ?? 'all'),
      universityTag: String(req.query.universityTag ?? 'all'),
      admissionCategory: String(req.query.admissionCategory ?? 'all'),
      difficulty: String(req.query.difficulty ?? 'all'),
      chapter: String(req.query.chapter ?? 'all'),
      status: String(req.query.status ?? 'all'),
      page: Number(req.query.page ?? 1),
      limit: Number(req.query.limit ?? 20),
    });
    res.json(result);
  });

  app.post('/api/admin/questions', requireAdmin, (req: AdminRequest, res) => {
    const body = req.body as {
      subjectId?: SubjectId;
      subjectName?: string;
      chapter?: string;
      topic?: string;
      universityTag?: UniversityTrack;
      admissionCategory?: string;
      difficulty?: 'Foundation' | 'Standard' | 'Admission Hard';
      prompt?: string;
      promptBn?: string;
      options?: [string, string, string, string];
      correctIndex?: number;
      marks?: number;
      negativeMarking?: number;
      status?: QuestionStatus;
      explanationEn?: string;
      explanationBn?: string;
      imageUrl?: string;
      sourceName?: string;
      sourceYear?: string;
    };

    if (
      !body.subjectId ||
      !body.chapter ||
      !body.prompt?.trim() ||
      !Array.isArray(body.options) ||
      body.options.length !== 4 ||
      body.options.some((o) => !String(o).trim())
    ) {
      res.status(400).json({ error: 'Subject, chapter, prompt, and all 4 options are required.' });
      return;
    }

    const created = createQuestion({
      subjectId: body.subjectId,
      subjectName: body.subjectName,
      chapter: body.chapter,
      topic: body.topic,
      universityTag: body.universityTag ?? 'DU Ka',
      admissionCategory: body.admissionCategory,
      difficulty: body.difficulty ?? 'Standard',
      prompt: body.prompt,
      promptBn: body.promptBn,
      options: body.options,
      correctIndex: Number(body.correctIndex) || 0,
      marks: body.marks,
      negativeMarking: body.negativeMarking,
      status: body.status ?? 'Published',
      explanationEn: body.explanationEn || '',
      explanationBn: body.explanationBn || '',
      imageUrl: body.imageUrl,
      sourceName: body.sourceName,
      sourceYear: body.sourceYear,
    });

    logAdminAudit({
      adminUser: req.adminUser,
      action: 'CREATE_QUESTION',
      targetType: 'question',
      targetId: created.id,
      details: `Added question (${created.status}) in ${created.subjectName} (${created.chapter}).`,
    });
    res.status(201).json({ question: created });
  });

  app.put('/api/admin/questions/:id', requireAdmin, (req: AdminRequest, res) => {
    const updated = updateQuestion(
      req.params.id,
      req.body,
      req.adminUser?.email ?? 'admin'
    );
    if (!updated) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'UPDATE_QUESTION',
      targetType: 'question',
      targetId: updated.id,
      details: `Updated question in ${updated.subjectName} (${updated.chapter}).`,
    });
    res.json({ question: updated });
  });

  app.patch('/api/admin/questions/:id/status', requireAdmin, (req: AdminRequest, res) => {
    const { status } = req.body as { status?: QuestionStatus };
    const allowed: QuestionStatus[] = ['Draft', 'Approved', 'Published', 'Rejected'];
    if (!status || !allowed.includes(status)) {
      res.status(400).json({ error: 'Invalid question status.' });
      return;
    }
    const updated = setQuestionStatus(
      req.params.id,
      status,
      req.adminUser?.email ?? 'admin'
    );
    if (!updated) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: status === 'Published' ? 'PUBLISH_QUESTION' : 'UPDATE_QUESTION_STATUS',
      targetType: 'question',
      targetId: updated.id,
      details: `Changed question status to ${status}.`,
    });
    res.json({ question: updated });
  });

  app.get('/api/admin/questions/:id/history', requireAdmin, (req, res) => {
    res.json({ history: getQuestionHistory(req.params.id) });
  });

  app.post('/api/admin/questions/:id/duplicate', requireAdmin, (req: AdminRequest, res) => {
    const copy = duplicateQuestion(req.params.id);
    if (!copy) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'DUPLICATE_QUESTION',
      targetType: 'question',
      targetId: copy.id,
      details: `Duplicated question ${req.params.id} to ${copy.id}.`,
    });
    res.status(201).json({ question: copy });
  });

  app.delete('/api/admin/questions/:id', requireAdmin, (req: AdminRequest, res) => {
    const deleted = deleteQuestion(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'DELETE_QUESTION',
      targetType: 'question',
      targetId: req.params.id,
      details: `Deleted question ${req.params.id} from bank.`,
    });
    res.json({ deleted: true });
  });

  // AI Question Builder & Admin Approval Workflow
  app.post(
    '/api/admin/importer/analyze',
    requireAdmin,
    rateLimit({ windowMs: 60_000, max: 12 }),
    (req, res, next) => {
      uploadDocument.single('file')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err.message || 'Document upload failed.' });
          return;
        }
        next();
      });
    },
    async (req: AdminRequest, res) => {
      try {
        const body = req.body as {
          rawText?: string;
          answerKeyText?: string;
          defaultSubjectId?: SubjectId;
          defaultUniversityTag?: UniversityTrack;
          defaultAdmissionCategory?: AdmissionCategory;
          defaultMarks?: string | number;
          defaultNegativeMarking?: string | number;
          defaultSourceName?: string;
          defaultSourceYear?: string;
        };

        const result = await analyzeAndStageQuestions({
          rawText: body.rawText,
          answerKeyText: body.answerKeyText,
          file: req.file
            ? {
                buffer: req.file.buffer,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
              }
            : undefined,
          defaultSubjectId: body.defaultSubjectId,
          defaultUniversityTag: body.defaultUniversityTag,
          defaultAdmissionCategory: body.defaultAdmissionCategory,
          defaultMarks: body.defaultMarks !== undefined ? Number(body.defaultMarks) : undefined,
          defaultNegativeMarking:
            body.defaultNegativeMarking !== undefined
              ? Number(body.defaultNegativeMarking)
              : undefined,
          defaultSourceName: body.defaultSourceName,
          defaultSourceYear: body.defaultSourceYear,
        });

        logAdminAudit({
          adminUser: req.adminUser,
          action: 'AI_QUESTION_BUILDER_EXTRACT',
          targetType: 'import_batch',
          targetId: result.batchId,
          details: `Extracted ${result.items.length} question(s) from ${result.sourceLabel} into AI Question Builder queue.`,
        });

        res.status(201).json(result);
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        res.status(code === 'AI_NOT_CONFIGURED' || code === 'AI_UNAVAILABLE' ? 503 : 400).json({
          error: err instanceof Error ? err.message : 'Failed to parse questions.',
          code: code ?? 'IMPORTER_ERROR',
        });
      }
    }
  );

  app.get('/api/admin/importer/queue', requireAdmin, (req, res) => {
    const status = String(req.query.status ?? 'active');
    res.json({ items: listPendingImportQueue(status) });
  });

  app.put('/api/admin/importer/item/:id', requireAdmin, (req, res) => {
    const updated = updateStagedImportItem(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Staged question not found.' });
      return;
    }
    res.json({ item: updated });
  });

  app.post('/api/admin/importer/apply-answers', requireAdmin, (req: AdminRequest, res) => {
    try {
      const { stagedIds, answerKeyText } = req.body as {
        stagedIds?: unknown;
        answerKeyText?: unknown;
      };
      if (!Array.isArray(stagedIds) || stagedIds.length === 0) {
        res.status(400).json({ error: 'উত্তর ম্যাচ করার জন্য অন্তত ১টি প্রশ্ন নির্বাচন করুন।' });
        return;
      }
      const cleanIds = stagedIds.map((id) => String(id)).filter(Boolean);
      const cleanKey = typeof answerKeyText === 'string' ? answerKeyText.trim() : '';
      if (!cleanKey) {
        res.status(400).json({ error: 'উত্তরমালা (Answer Key) টেক্সট পেস্ট করুন।' });
        return;
      }

      const result = applyAnswerKeyToStagedItems(cleanIds, cleanKey);
      logAdminAudit({
        adminUser: req.adminUser,
        action: 'AI_IMPORT_APPLY_ANSWER_KEY',
        targetType: 'import_batch',
        targetId: cleanIds.slice(0, 4).join(','),
        details: `Matched pasted answer key to ${result.updatedCount} staged question(s).`,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'উত্তরমালা ম্যাচ করা যায়নি।',
      });
    }
  });

  app.post('/api/admin/importer/item/:id/reject', requireAdmin, (req: AdminRequest, res) => {
    const rejected = rejectStagedImportItem(req.params.id);
    if (!rejected) {
      res.status(404).json({ error: 'Staged question not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'AI_IMPORT_REJECT',
      targetType: 'staged_question',
      targetId: req.params.id,
      details: `Marked staged question ${req.params.id} as Rejected.`,
    });
    res.json({ rejected: true, remainingQueue: listPendingImportQueue() });
  });

  app.delete('/api/admin/importer/item/:id', requireAdmin, (req: AdminRequest, res) => {
    const deleted = deleteStagedImportItem(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Staged question not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'AI_IMPORT_DELETE',
      targetType: 'staged_question',
      targetId: req.params.id,
      details: `Deleted staged question ${req.params.id}.`,
    });
    res.json({ deleted: true, remainingQueue: listPendingImportQueue() });
  });

  app.post('/api/admin/importer/approve', requireAdmin, (req: AdminRequest, res) => {
    const { ids, publishImmediately, excludeNeedsReview } = req.body as {
      ids?: string[];
      publishImmediately?: boolean;
      excludeNeedsReview?: boolean;
    };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Provide an array of staged item IDs to approve.' });
      return;
    }
    const result = approveStagedImportItems(ids, {
      publishImmediately: Boolean(publishImmediately),
      excludeNeedsReview: Boolean(excludeNeedsReview),
    });
    if (result.approvedQuestions.length > 0) {
      logAdminAudit({
        adminUser: req.adminUser,
        action: publishImmediately ? 'AI_IMPORT_PUBLISH' : 'AI_IMPORT_APPROVE',
        targetType: 'question',
        targetId: result.approvedQuestions.map((q) => q.id).join(',').slice(0, 64),
        details: `${publishImmediately ? 'Approved & published' : 'Approved'} ${result.approvedQuestions.length} staged question(s).`,
      });
    }
    res.json({
      ...result,
      remainingQueue: listPendingImportQueue(),
    });
  });

  app.post('/api/admin/importer/publish', requireAdmin, (req: AdminRequest, res) => {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Provide an array of approved staged item IDs to publish.' });
      return;
    }
    const result = publishApprovedStagedItems(ids);
    if (result.publishedCount > 0) {
      logAdminAudit({
        adminUser: req.adminUser,
        action: 'AI_IMPORT_BULK_PUBLISH',
        targetType: 'question',
        targetId: result.questionIds.join(',').slice(0, 64),
        details: `Published ${result.publishedCount} approved question(s) to student bank.`,
      });
    }
    res.json({
      ...result,
      remainingQueue: listPendingImportQueue(),
    });
  });

  app.post('/api/admin/importer/assign-exam', requireAdmin, (req: AdminRequest, res) => {
    try {
      const body = req.body as {
        stagedIds?: string[];
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
      };
      if (!Array.isArray(body.stagedIds) || body.stagedIds.length === 0) {
        res.status(400).json({ error: 'পরীক্ষায় যুক্ত করার জন্য অন্তত ১টি প্রশ্ন নির্বাচন করুন।' });
        return;
      }
      const result = assignStagedOrApprovedToExam({
        stagedIds: body.stagedIds,
        examId: body.examId,
        newExam: body.newExam,
        publishQuestions: body.publishQuestions,
      });
      logAdminAudit({
        adminUser: req.adminUser,
        action: 'AI_IMPORT_ASSIGN_EXAM',
        targetType: 'exam',
        targetId: result.exam.id,
        details: `Assigned ${result.assignedQuestionIds.length} question(s) to exam "${result.exam.title}".`,
      });
      res.status(201).json({
        ...result,
        remainingQueue: listPendingImportQueue(),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'পরীক্ষায় প্রশ্ন যুক্ত করা যায়নি।',
      });
    }
  });

  // Exam & Mock Test Management
  app.get('/api/admin/exams', requireAdmin, (_req, res) => {
    res.json({ exams: getExams(false) });
  });

  app.post('/api/admin/exams', requireAdmin, (req: AdminRequest, res) => {
    const body = req.body as {
      title?: string;
      subtitle?: string;
      universityTrack?: UniversityTrack;
      examType?: 'mock' | 'university';
      durationMinutes?: number;
      totalMarks?: number;
      negativeMarking?: number;
      scheduledAt?: string;
      status?: 'available' | 'upcoming' | 'completed';
      isPublished?: boolean;
      questionIds?: string[];
      sections?: string[];
    };

    if (!body.title?.trim() || !Array.isArray(body.questionIds) || body.questionIds.length === 0) {
      res.status(400).json({ error: 'Exam title and at least one question are required.' });
      return;
    }

    const created = createExam({
      title: body.title,
      subtitle: body.subtitle,
      universityTrack: body.universityTrack ?? 'DU Ka',
      examType: body.examType ?? 'mock',
      durationMinutes: Number(body.durationMinutes) || 15,
      totalMarks: body.totalMarks,
      negativeMarking: Number(body.negativeMarking ?? 0.25),
      scheduledAt: body.scheduledAt || 'Live Now',
      status: body.status ?? 'available',
      isPublished: body.isPublished ?? true,
      questionIds: body.questionIds,
      sections: body.sections,
    });

    logAdminAudit({
      adminUser: req.adminUser,
      action: 'CREATE_EXAM',
      targetType: 'exam',
      targetId: created.id,
      details: `Created exam "${created.title}" (${created.questionIds.length} MCQs).`,
    });

    res.status(201).json({ exam: created });
  });

  app.put('/api/admin/exams/:id', requireAdmin, (req: AdminRequest, res) => {
    const updated = updateExam(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Exam not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'UPDATE_EXAM',
      targetType: 'exam',
      targetId: updated.id,
      details: `Updated exam "${updated.title}" (published: ${updated.isPublished ? 'yes' : 'no'}).`,
    });
    res.json({ exam: updated });
  });

  app.delete('/api/admin/exams/:id', requireAdmin, (req: AdminRequest, res) => {
    const deleted = deleteExam(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Exam not found.' });
      return;
    }
    logAdminAudit({
      adminUser: req.adminUser,
      action: 'DELETE_EXAM',
      targetType: 'exam',
      targetId: req.params.id,
      details: `Deleted exam ${req.params.id}.`,
    });
    res.json({ deleted: true });
  });

  app.get('/api/admin/exams/:id/attempts', requireAdmin, (req, res) => {
    res.json({ attempts: getExamAttemptsByExam(req.params.id) });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ADMITLY AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
