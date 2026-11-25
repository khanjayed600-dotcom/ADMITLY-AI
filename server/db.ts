import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { CORE_SUBJECTS } from './seedData';
import type { SubjectId } from '../src/types';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const SQLITE_PATH = path.join(DATA_DIR, 'admitly.sqlite');

let dbInstance: DatabaseSync | null = null;

export function normalizePromptFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapLegacySubjectId(
  subjectId: string,
  subjectName?: string,
  prompt?: string
): { subjectId: SubjectId; subjectName: string } {
  const s = (subjectId || '').toLowerCase().trim();
  if (s === 'english_ict') {
    const combined = `${subjectName ?? ''} ${prompt ?? ''}`.toLowerCase();
    if (
      combined.includes('ict') ||
      combined.includes('binary') ||
      combined.includes('hexadecimal') ||
      combined.includes('logic') ||
      combined.includes('number system')
    ) {
      return { subjectId: 'ict', subjectName: 'ICT' };
    }
    return { subjectId: 'english', subjectName: 'English' };
  }
  switch (s) {
    case 'physics':
      return { subjectId: 'physics', subjectName: 'Physics' };
    case 'chemistry':
      return { subjectId: 'chemistry', subjectName: 'Chemistry' };
    case 'math':
    case 'mathematics':
    case 'higher math':
      return { subjectId: 'math', subjectName: 'Mathematics' };
    case 'biology':
      return { subjectId: 'biology', subjectName: 'Biology' };
    case 'english':
      return { subjectId: 'english', subjectName: 'English' };
    case 'ict':
      return { subjectId: 'ict', subjectName: 'ICT' };
    case 'gk':
    case 'general knowledge':
      return { subjectId: 'gk', subjectName: 'General Knowledge' };
    default:
      return { subjectId: 'physics', subjectName: subjectName || 'Physics' };
  }
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      reset_token_hash TEXT,
      reset_token_expires_at TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_otp_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      identifier TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      college TEXT NOT NULL DEFAULT '',
      division TEXT NOT NULL DEFAULT 'Dhaka',
      hsc_batch TEXT NOT NULL DEFAULT 'HSC 2026',
      target_university TEXT NOT NULL DEFAULT 'DU Ka',
      secondary_university TEXT NOT NULL DEFAULT 'BUET',
      avatar_url TEXT NOT NULL DEFAULT '',
      streak_days INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      overall_progress INTEGER NOT NULL DEFAULT 0,
      overall_score REAL NOT NULL DEFAULT 0,
      average_accuracy REAL NOT NULL DEFAULT 0,
      total_exams_completed INTEGER NOT NULL DEFAULT 0,
      national_rank INTEGER NOT NULL DEFAULT 0,
      total_ranked_students INTEGER NOT NULL DEFAULT 0,
      rank_delta INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (user_id, role)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      bangla_name TEXT NOT NULL,
      short_code TEXT NOT NULL,
      mastery INTEGER NOT NULL DEFAULT 0,
      accuracy INTEGER NOT NULL DEFAULT 0,
      solved_count INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0,
      weakest_topic TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      bangla_name TEXT NOT NULL,
      mastery INTEGER NOT NULL DEFAULT 0,
      questions_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (subject_id, name)
    );

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      bangla_name TEXT NOT NULL DEFAULT '',
      UNIQUE (chapter_id, name)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL REFERENCES subjects(id),
      chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
      topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
      chapter_name TEXT NOT NULL,
      topic_name TEXT NOT NULL DEFAULT '',
      university_tag TEXT NOT NULL,
      admission_category TEXT NOT NULL DEFAULT 'DU Ka',
      difficulty TEXT NOT NULL DEFAULT 'Standard',
      prompt TEXT NOT NULL,
      prompt_bn TEXT NOT NULL DEFAULT '',
      raw_text TEXT NOT NULL DEFAULT '',
      correct_index INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
      marks REAL NOT NULL DEFAULT 1,
      negative_marking REAL NOT NULL DEFAULT 0.25,
      status TEXT NOT NULL DEFAULT 'Published',
      answer_confidence TEXT NOT NULL DEFAULT 'explicit',
      validation_warnings_json TEXT NOT NULL DEFAULT '[]',
      ai_formatted INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS question_options (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_index INTEGER NOT NULL CHECK (option_index BETWEEN 0 AND 3),
      option_text TEXT NOT NULL,
      UNIQUE (question_id, option_index)
    );

    CREATE TABLE IF NOT EXISTS question_explanations (
      question_id TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
      explanation_en TEXT NOT NULL DEFAULT '',
      explanation_bn TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS question_sources (
      question_id TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
      source_name TEXT NOT NULL DEFAULT '',
      source_year TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS question_history (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      changed_by TEXT NOT NULL DEFAULT 'admin',
      change_summary TEXT NOT NULL DEFAULT '',
      previous_snapshot_json TEXT NOT NULL,
      new_snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      university_track TEXT NOT NULL,
      exam_type TEXT NOT NULL DEFAULT 'mock',
      duration_minutes INTEGER NOT NULL DEFAULT 15,
      total_marks REAL NOT NULL DEFAULT 0,
      negative_marking REAL NOT NULL DEFAULT 0.25,
      scheduled_at TEXT NOT NULL DEFAULT 'Live Now',
      status TEXT NOT NULL DEFAULT 'available',
      is_published INTEGER NOT NULL DEFAULT 1,
      sections_json TEXT NOT NULL DEFAULT '[]',
      participants_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exam_questions (
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (exam_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      exam_title TEXT NOT NULL,
      university_track TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      duration_seconds_spent INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      incorrect_count INTEGER NOT NULL,
      skipped_count INTEGER NOT NULL,
      raw_score REAL NOT NULL,
      max_score REAL NOT NULL,
      accuracy REAL NOT NULL,
      answers_json TEXT NOT NULL,
      marked_for_review_json TEXT NOT NULL DEFAULT '[]',
      topic_weaknesses_json TEXT NOT NULL DEFAULT '[]',
      ai_analysis TEXT,
      submission_id TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_results (
      attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id),
      subject_name TEXT NOT NULL,
      total_count INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      incorrect_count INTEGER NOT NULL,
      skipped_count INTEGER NOT NULL,
      score REAL NOT NULL,
      max_score REAL NOT NULL,
      accuracy REAL NOT NULL,
      PRIMARY KEY (attempt_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_activity_logs (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_staging_questions (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      chapter TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      university_tag TEXT NOT NULL,
      admission_category TEXT NOT NULL DEFAULT 'DU Ka',
      difficulty TEXT NOT NULL DEFAULT 'Standard',
      prompt TEXT NOT NULL,
      prompt_bn TEXT NOT NULL DEFAULT '',
      raw_original TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL,
      correct_index INTEGER,
      marks REAL NOT NULL DEFAULT 1,
      negative_marking REAL NOT NULL DEFAULT 0.25,
      answer_confidence TEXT NOT NULL DEFAULT 'uncertain',
      needs_manual_review INTEGER NOT NULL DEFAULT 1,
      is_incomplete INTEGER NOT NULL DEFAULT 0,
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      duplicate_of_question_id TEXT,
      duplicate_match_prompt TEXT,
      review_reason TEXT NOT NULL DEFAULT '',
      validation_warnings_json TEXT NOT NULL DEFAULT '[]',
      explanation_en TEXT NOT NULL DEFAULT '',
      explanation_bn TEXT NOT NULL DEFAULT '',
      source_name TEXT NOT NULL DEFAULT '',
      source_year TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Draft',
      published_question_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      feature TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      summary TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_otp_user ON auth_otp_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_questions_fingerprint ON questions(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_questions_university ON questions(university_tag);
    CREATE INDEX IF NOT EXISTS idx_qhistory_qid ON question_history(question_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON exam_attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_exam ON exam_attempts(exam_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_submitted ON exam_attempts(submitted_at);
    CREATE INDEX IF NOT EXISTS idx_staging_status ON import_staging_questions(status);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_activity_logs(created_at);
  `);
}

function getColumnSet(db: DatabaseSync, tableName: string): Set<string> {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(cols.map((c) => c.name));
}

function runSchemaMigrations(db: DatabaseSync): void {
  const userCols = getColumnSet(db, 'users');
  if (!userCols.has('phone')) {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL AND phone != ''"
  );

  // Questions table upgrades for lifecycle & AI Question Builder
  const qCols = getColumnSet(db, 'questions');
  if (!qCols.has('raw_text')) {
    db.exec("ALTER TABLE questions ADD COLUMN raw_text TEXT NOT NULL DEFAULT ''");
  }
  if (!qCols.has('marks')) {
    db.exec('ALTER TABLE questions ADD COLUMN marks REAL NOT NULL DEFAULT 1');
  }
  if (!qCols.has('negative_marking')) {
    db.exec('ALTER TABLE questions ADD COLUMN negative_marking REAL NOT NULL DEFAULT 0.25');
  }
  if (!qCols.has('status')) {
    db.exec("ALTER TABLE questions ADD COLUMN status TEXT NOT NULL DEFAULT 'Published'");
  }
  if (!qCols.has('answer_confidence')) {
    db.exec("ALTER TABLE questions ADD COLUMN answer_confidence TEXT NOT NULL DEFAULT 'explicit'");
  }
  if (!qCols.has('validation_warnings_json')) {
    db.exec("ALTER TABLE questions ADD COLUMN validation_warnings_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!qCols.has('ai_formatted')) {
    db.exec('ALTER TABLE questions ADD COLUMN ai_formatted INTEGER NOT NULL DEFAULT 0');
  }
  if (!qCols.has('updated_at')) {
    db.exec("ALTER TABLE questions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status)');

  // Staging table upgrades
  const stgCols = getColumnSet(db, 'import_staging_questions');
  if (!stgCols.has('raw_original')) {
    db.exec("ALTER TABLE import_staging_questions ADD COLUMN raw_original TEXT NOT NULL DEFAULT ''");
  }
  if (!stgCols.has('marks')) {
    db.exec('ALTER TABLE import_staging_questions ADD COLUMN marks REAL NOT NULL DEFAULT 1');
  }
  if (!stgCols.has('negative_marking')) {
    db.exec('ALTER TABLE import_staging_questions ADD COLUMN negative_marking REAL NOT NULL DEFAULT 0.25');
  }
  if (!stgCols.has('validation_warnings_json')) {
    db.exec("ALTER TABLE import_staging_questions ADD COLUMN validation_warnings_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!stgCols.has('published_question_id')) {
    db.exec('ALTER TABLE import_staging_questions ADD COLUMN published_question_id TEXT');
  }

  const attCols = getColumnSet(db, 'exam_attempts');
  if (!attCols.has('submission_id')) {
    db.exec("ALTER TABLE exam_attempts ADD COLUMN submission_id TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_submission ON exam_attempts(user_id, submission_id) WHERE submission_id IS NOT NULL AND submission_id != ''"
  );

  // Normalize any legacy lowercase staging statuses to new workflow statuses
  db.exec(`
    UPDATE import_staging_questions
    SET status = CASE
      WHEN status = 'pending' AND needs_manual_review = 1 THEN 'Needs Review'
      WHEN status = 'pending' THEN 'Draft'
      WHEN status = 'approved' THEN 'Approved'
      WHEN status = 'rejected' THEN 'Rejected'
      ELSE status
    END
    WHERE status IN ('pending', 'approved', 'rejected');
  `);

  // Non-destructively map legacy merged 'Dhaka University' track/category to 'DU Ka' / 'DU Kha'
  db.exec(`
    UPDATE user_profiles
    SET target_university = 'DU Ka'
    WHERE target_university = 'Dhaka University';

    UPDATE user_profiles
    SET secondary_university = 'DU Ka'
    WHERE secondary_university = 'Dhaka University';

    UPDATE questions
    SET university_tag = CASE WHEN subject_id IN ('english', 'gk') THEN 'DU Kha' ELSE 'DU Ka' END
    WHERE university_tag = 'Dhaka University';

    UPDATE questions
    SET admission_category = CASE WHEN subject_id IN ('english', 'gk') THEN 'DU Kha' ELSE 'DU Ka' END
    WHERE admission_category = 'Dhaka University';

    UPDATE exams
    SET university_track = 'DU Ka'
    WHERE university_track = 'Dhaka University';

    UPDATE exam_attempts
    SET university_track = 'DU Ka'
    WHERE university_track = 'Dhaka University';

    UPDATE import_staging_questions
    SET university_tag = CASE WHEN subject_id IN ('english', 'gk') THEN 'DU Kha' ELSE 'DU Ka' END
    WHERE university_tag = 'Dhaka University';

    UPDATE import_staging_questions
    SET admission_category = CASE WHEN subject_id IN ('english', 'gk') THEN 'DU Kha' ELSE 'DU Ka' END
    WHERE admission_category = 'Dhaka University';
  `);

  cleanupDemoDataOnce(db);
  cleanupDemoDataV2Once(db);
}

/**
 * Idempotent migration: removes ONLY known legacy demo/sample records while keeping
 * all real registered student accounts, admins, and legitimate DB records completely intact.
 */
function cleanupDemoDataOnce(db: DatabaseSync): void {
  const done = db
    .prepare("SELECT value_json FROM app_kv WHERE key = 'migration:demo_data_removed_v1'")
    .get() as { value_json: string } | undefined;
  if (done) return;

  const demoUserIds = [
    'stu-rafidul',
    'stu-nusrat',
    'stu-tanvir',
    'stu-farhana',
    'stu-mehedi',
    'stu-sadia',
    'stu-tahmid',
    'stu-anika',
    'stu-shafqat',
    'stu-lamia',
  ];

  const demoQuestionIds = [
    'q-phy-1',
    'q-phy-2',
    'q-phy-3',
    'q-phy-4',
    'q-chem-1',
    'q-chem-2',
    'q-chem-3',
    'q-math-1',
    'q-math-2',
    'q-math-3',
    'q-bio-1',
    'q-bio-2',
    'q-eng-1',
    'q-eng-2',
    'q-gk-1',
    'q-gk-2',
  ];

  const demoExamIds = [
    'exam-du-ka-14',
    'exam-buet-sprint',
    'exam-med-rapid',
    'exam-gst-weekly',
  ];

  const demoAttemptIds = [
    'att-hist-1',
    'att-hist-2',
    'att-hist-3',
    'att-nusrat-1',
    'att-tanvir-1',
    'att-farhana-1',
  ];

  const makePlaceholders = (arr: string[]) => arr.map(() => '?').join(', ');

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(`DELETE FROM exam_attempts WHERE id IN (${makePlaceholders(demoAttemptIds)})`).run(
      ...demoAttemptIds
    );
    db.prepare(`DELETE FROM exams WHERE id IN (${makePlaceholders(demoExamIds)})`).run(
      ...demoExamIds
    );
    db.prepare(`DELETE FROM questions WHERE id IN (${makePlaceholders(demoQuestionIds)})`).run(
      ...demoQuestionIds
    );
    db.prepare(`DELETE FROM users WHERE id IN (${makePlaceholders(demoUserIds)})`).run(
      ...demoUserIds
    );
    db.prepare("DELETE FROM notifications WHERE id = 'notif-1'").run();
    db.prepare(
      "DELETE FROM app_kv WHERE key IN ('activeStudentId', 'weeklyPerformance', 'continueLearning', 'dailyChallenge')"
    ).run();
    db.prepare(
      "DELETE FROM ai_usage_logs WHERE id IN ('ai-init-1', 'ai-init-2', 'ai-log-1', 'ai-log-2')"
    ).run();

    // Zero hardcoded baseline stats on subjects and sync chapter question counts with real DB rows
    db.exec(`
      UPDATE subjects
      SET mastery = 0, accuracy = 0, solved_count = 0, total_questions = 0, weakest_topic = '',
          name = CASE WHEN id = 'math' THEN 'Mathematics' ELSE name END;

      UPDATE chapters
      SET mastery = 0,
          questions_count = (
            SELECT COUNT(*) FROM questions q
            WHERE q.chapter_id = chapters.id AND q.status = 'Published'
          );
    `);

    db.prepare(
      'INSERT OR REPLACE INTO app_kv (key, value_json) VALUES (?, ?)'
    ).run(
      'migration:demo_data_removed_v1',
      JSON.stringify({ completedAt: new Date().toISOString() })
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function cleanupDemoDataV2Once(db: DatabaseSync): void {
  const done = db
    .prepare("SELECT value_json FROM app_kv WHERE key = 'migration:demo_data_removed_v2'")
    .get() as { value_json: string } | undefined;
  if (done) return;

  db.exec('BEGIN TRANSACTION');
  try {
    // Remove any legacy pre-cleanup per-user app_kv entries containing demo items or belonging to deleted users
    const kvRows = db
      .prepare(
        "SELECT key, value_json FROM app_kv WHERE key LIKE 'weeklyPerformance:%' OR key LIKE 'continueLearning:%' OR key LIKE 'dailyChallenge:%'"
      )
      .all() as Array<{ key: string; value_json: string }>;

    for (const row of kvRows) {
      const parts = row.key.split(':');
      const userId = parts[1] ?? '';
      const userExists = userId
        ? Boolean(db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId))
        : false;
      const containsLegacyDemo =
        row.value_json.includes('"cl-1"') ||
        row.value_json.includes('"q-math-1"') ||
        row.value_json.includes('Definite Integrals & Area Under Curves');
      if (!userExists || containsLegacyDemo) {
        db.prepare('DELETE FROM app_kv WHERE key = ?').run(row.key);
      }
    }

    db.prepare(
      `UPDATE admin_activity_logs
       SET details = 'Initialized clean relational SQLite database with curriculum taxonomy (0 demo records).'
       WHERE id = 'log-init-db' AND details LIKE '%16 questions%'`
    ).run();

    db.prepare(
      'INSERT OR REPLACE INTO app_kv (key, value_json) VALUES (?, ?)'
    ).run(
      'migration:demo_data_removed_v2',
      JSON.stringify({ completedAt: new Date().toISOString() })
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function ensureChapterAndTopic(
  db: DatabaseSync,
  subjectId: SubjectId,
  chapterName: string,
  topicName?: string
): { chapterId: string; topicId: string | null } {
  const cleanChapter = chapterName.trim() || 'General';
  let chRow = db
    .prepare('SELECT id FROM chapters WHERE subject_id = ? AND LOWER(name) = LOWER(?)')
    .get(subjectId, cleanChapter) as { id: string } | undefined;

  if (!chRow) {
    const newId = `ch-${subjectId.slice(0, 3)}-${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(
      'INSERT INTO chapters (id, subject_id, name, bangla_name, mastery, questions_count) VALUES (?, ?, ?, ?, 0, 0)'
    ).run(newId, subjectId, cleanChapter, cleanChapter);
    chRow = { id: newId };
  }

  let topicId: string | null = null;
  if (topicName && topicName.trim()) {
    const cleanTopic = topicName.trim();
    const tRow = db
      .prepare('SELECT id FROM topics WHERE chapter_id = ? AND LOWER(name) = LOWER(?)')
      .get(chRow.id, cleanTopic) as { id: string } | undefined;
    if (tRow) {
      topicId = tRow.id;
    } else {
      topicId = `top-${crypto.randomBytes(4).toString('hex')}`;
      db.prepare(
        'INSERT INTO topics (id, chapter_id, subject_id, name, bangla_name) VALUES (?, ?, ?, ?, ?)'
      ).run(topicId, chRow.id, subjectId, cleanTopic, cleanTopic);
    }
  }

  return { chapterId: chRow.id, topicId };
}

function seedOrMigrateDatabase(db: DatabaseSync): void {
  const existingSubjectsCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM subjects').get() as { cnt: number }
  ).cnt;
  if (existingSubjectsCount > 0) {
    return;
  }

  db.exec('BEGIN TRANSACTION');
  try {
    const insertSubj = db.prepare(
      `INSERT OR IGNORE INTO subjects (id, name, bangla_name, short_code, mastery, accuracy, solved_count, total_questions, weakest_topic, sort_order)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, '', ?)`
    );
    const insertChap = db.prepare(
      `INSERT OR IGNORE INTO chapters (id, subject_id, name, bangla_name, mastery, questions_count)
       VALUES (?, ?, ?, ?, 0, 0)`
    );

    CORE_SUBJECTS.forEach((s, idx) => {
      insertSubj.run(s.id, s.name, s.banglaName, s.shortCode, idx + 1);
      for (const ch of s.chapters) {
        insertChap.run(ch.id, s.id, ch.name, ch.banglaName);
      }
    });

    db.prepare(
      `INSERT INTO admin_activity_logs (id, admin_user_id, admin_email, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'log-init-db',
      null,
      'system',
      'DATABASE_INITIALIZED',
      'system',
      'admitly.sqlite',
      'Initialized clean relational SQLite database with curriculum taxonomy (0 demo records).',
      new Date().toISOString()
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  dbInstance = new DatabaseSync(SQLITE_PATH);
  createSchema(dbInstance);
  runSchemaMigrations(dbInstance);
  seedOrMigrateDatabase(dbInstance);
  return dbInstance;
}
