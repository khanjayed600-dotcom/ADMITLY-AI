import crypto from 'crypto';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { getDb, mapLegacySubjectId, normalizePromptFingerprint } from './db';
import { extractQuestionsWithAi, type RawExtractedQuestion } from './gemini';
import { createExam, createQuestion, getAllQuestions, updateExam } from './store';
import {
  ADMISSION_CATEGORIES,
  type AdmissionCategory,
  type ExamConfig,
  type QuestionItem,
  type QuestionStatus,
  type StagedImportQuestion,
  type SubjectId,
  type UniversityTrack,
} from '../src/types';

function tokenJaccardSimilarity(a: string, b: string): number {
  const extractTokens = (s: string) =>
    s.split(' ').filter((w) => w.length > 2 || /\d/.test(w));
  const listA = extractTokens(a);
  const listB = extractTokens(b);
  const numsA = listA.filter((w) => /\d/.test(w)).sort().join(',');
  const numsB = listB.filter((w) => /\d/.test(w)).sort().join(',');
  if (numsA !== numsB) return 0;
  const tokensA = new Set(listA);
  const tokensB = new Set(listB);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function normalizeAdmissionCategory(
  raw: string,
  fallback: AdmissionCategory = 'DU Ka'
): AdmissionCategory {
  const s = (raw || '').toLowerCase().trim();
  const exact = ADMISSION_CATEGORIES.find((c) => c.toLowerCase() === s);
  if (exact) return exact;
  if (s.includes('gst') || s.includes('cluster') || s.includes('গুচ্ছ')) return 'GST';
  const isDu =
    s.includes('dhaka') ||
    /\bdu\b/.test(s) ||
    /\bdu[\s\-_]*(ka|kha|a|b)\b/.test(s) ||
    s.includes('ঢাবি');
  if (
    s.includes('du kha') ||
    s.includes('du-kha') ||
    s.includes('du_kha') ||
    s.includes('ঢাবি খ') ||
    s.includes('খ ইউনিট') ||
    s.includes('খ-ইউনিট') ||
    (isDu && (s.includes('kha') || /\bkh\b/.test(s) || /\bb[\s\-]*unit\b/.test(s) || /\bdu[\s\-]*b\b/.test(s) || s.includes('খ')))
  ) {
    return 'DU Kha';
  }
  if (
    isDu ||
    s.includes('ক ইউনিট') ||
    s.includes('ক-ইউনিট')
  ) {
    return 'DU Ka';
  }
  if (s.includes('rajshahi') || /\bru\b/.test(s) || s.includes('রাবি')) return 'Rajshahi University';
  if (s.includes('jahangirnagar') || /\bju\b/.test(s) || s.includes('জাবি')) {
    return 'Jahangirnagar University';
  }
  if (s.includes('chittagong') || /\bcu\b/.test(s) || s.includes('চবি')) {
    return 'Chittagong University';
  }
  if (s.includes('med') || s.includes('মেডিকেল') || s.includes('dental')) return 'Medical';
  if (
    s.includes('eng') ||
    s.includes('buet') ||
    s.includes('ckruet') ||
    s.includes('প্রকৌশল')
  ) {
    return 'Engineering';
  }
  return s.includes('other') ? 'Other' : fallback;
}

function normalizeTrack(raw: string, category: AdmissionCategory, fallback: UniversityTrack): UniversityTrack {
  const s = (raw || '').toLowerCase().trim();
  const exactCat = ADMISSION_CATEGORIES.find((c) => c.toLowerCase() === s);
  if (exactCat) return exactCat;
  if (s.includes('buet')) return 'BUET';
  if (s.includes('ckruet') || s.includes('cuet') || s.includes('ruet') || s.includes('kuet')) {
    return 'CKRUET';
  }
  if (
    s.includes('du kha') ||
    s.includes('du-kha') ||
    s.includes('ঢাবি খ') ||
    s.includes('খ ইউনিট')
  ) {
    return 'DU Kha';
  }
  if (
    s.includes('du ka') ||
    s.includes('du-ka') ||
    s.includes('ঢাবি ক') ||
    s.includes('ক ইউনিট')
  ) {
    return 'DU Ka';
  }
  return category || fallback;
}

function normalizeDifficulty(
  raw: string
): 'Foundation' | 'Standard' | 'Admission Hard' {
  const s = (raw || '').toLowerCase();
  if (s.includes('foundation') || s.includes('easy')) return 'Foundation';
  if (s.includes('hard') || s.includes('buet') || s.includes('advanced')) return 'Admission Hard';
  return 'Standard';
}

export async function extractDocumentText(params: {
  file?: { buffer: Buffer; originalname: string; mimetype: string };
  rawText?: string;
}): Promise<{ extractedText: string; pdfBufferForAi?: Buffer; sourceLabel: string }> {
  const pasted = (params.rawText ?? '').trim();
  if (!params.file) {
    if (!pasted) {
      throw new Error('প্রশ্ন টেক্সট পেস্ট করুন অথবা .pdf, .docx, .txt ফাইল আপলোড করুন।');
    }
    return { extractedText: pasted, sourceLabel: 'Pasted text' };
  }

  const ext = params.file.originalname.toLowerCase().split('.').pop() || '';
  if (ext === 'txt') {
    const text = params.file.buffer.toString('utf8').trim();
    const combined = [text, pasted].filter(Boolean).join('\n\n');
    if (!combined) {
      throw new Error('আপলোড করা .txt ফাইলটি খালি।');
    }
    return { extractedText: combined, sourceLabel: params.file.originalname };
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: params.file.buffer });
    const text = (result.value || '').trim();
    const combined = [text, pasted].filter(Boolean).join('\n\n');
    if (!combined) {
      throw new Error('.docx ফাইল থেকে কোনো পড়ার মতো টেক্সট পাওয়া যায়নি।');
    }
    return { extractedText: combined, sourceLabel: params.file.originalname };
  }

  if (ext === 'pdf') {
    let text = '';
    const parser = new PDFParse({ data: new Uint8Array(params.file.buffer) });
    try {
      const parsed = await parser.getText();
      text = (parsed.text || '').trim();
    } catch {
      text = '';
    } finally {
      await parser.destroy().catch(() => {});
    }

    const needsNativePdfFallback = text.length < 40;
    const combined = [text, pasted].filter(Boolean).join('\n\n');

    return {
      extractedText: combined,
      pdfBufferForAi: needsNativePdfFallback ? params.file.buffer : undefined,
      sourceLabel: params.file.originalname,
    };
  }

  throw new Error('শুধুমাত্র .pdf, .docx, এবং .txt ফাইল সমর্থিত।');
}

function findDuplicateMatch(
  prompt: string,
  existingQuestions: QuestionItem[],
  batchSeen: Array<{ id: string; prompt: string; fp: string }>
): { isDuplicate: boolean; duplicateOfId: string | null; matchPrompt: string | null } {
  const fp = normalizePromptFingerprint(prompt);
  if (!fp) return { isDuplicate: false, duplicateOfId: null, matchPrompt: null };

  for (const eq of existingQuestions) {
    const eqFp = normalizePromptFingerprint(eq.prompt);
    if (eqFp === fp || tokenJaccardSimilarity(fp, eqFp) >= 0.84) {
      return {
        isDuplicate: true,
        duplicateOfId: eq.id,
        matchPrompt: eq.prompt,
      };
    }
  }

  for (const prev of batchSeen) {
    if (prev.fp === fp || tokenJaccardSimilarity(fp, prev.fp) >= 0.84) {
      return {
        isDuplicate: true,
        duplicateOfId: prev.id,
        matchPrompt: prev.prompt,
      };
    }
  }

  return { isDuplicate: false, duplicateOfId: null, matchPrompt: null };
}

function computeValidationState(params: {
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number | null;
  answerConfidence: 'explicit' | 'uncertain';
  isDuplicate: boolean;
  aiWarnings?: string[];
  reviewReason?: string;
}): {
  isIncomplete: boolean;
  needsManualReview: boolean;
  warnings: string[];
  reviewReason: string;
} {
  const hasAllFourOptions = params.options.every((o) => o.trim().length > 0);
  const hasPrompt = params.prompt.trim().length > 0;
  const isIncomplete = !hasPrompt || !hasAllFourOptions;

  const warnings: string[] = Array.isArray(params.aiWarnings)
    ? params.aiWarnings.map((w) => String(w).trim()).filter(Boolean)
    : [];

  if (params.reviewReason?.trim() && !warnings.includes(params.reviewReason.trim())) {
    warnings.push(params.reviewReason.trim());
  }
  if (
    params.answerConfidence === 'uncertain' ||
    params.correctIndex === null ||
    params.correctIndex < 0 ||
    params.correctIndex > 3
  ) {
    const msg = 'উৎস টেক্সটে নিশ্চিত উত্তর পাওয়া যায়নি; প্রকাশের আগে সঠিক উত্তর (A-D) নির্বাচন করুন।';
    if (!warnings.some((w) => w.toLowerCase().includes('answer') || w.includes('উত্তর'))) {
      warnings.push(msg);
    }
  }
  if (!hasAllFourOptions) {
    const msg = '৪টি MCQ অপশন সম্পূর্ণ নেই; অনুমোদনের আগে অপশনগুলো পূরণ করুন।';
    if (!warnings.some((w) => w.toLowerCase().includes('option') || w.includes('অপশন'))) {
      warnings.push(msg);
    }
  }
  if (params.isDuplicate) {
    const msg = 'প্রশ্ন ব্যাংকে একই ধরনের প্রশ্ন আগে থেকেই থাকতে পারে (সম্ভাব্য ডুপ্লিকেট)।';
    if (!warnings.some((w) => w.toLowerCase().includes('duplicate') || w.includes('ডুপ্লিকেট'))) {
      warnings.push(msg);
    }
  }

  const needsManualReview =
    params.answerConfidence === 'uncertain' ||
    params.correctIndex === null ||
    isIncomplete ||
    params.isDuplicate;

  return {
    isIncomplete,
    needsManualReview,
    warnings,
    reviewReason: warnings.join(' '),
  };
}

export interface ParsedAnswerEntry {
  correctIndex: number;
  explanation?: string;
}

export interface ParsedAnswerKeyResult {
  byNumber: Map<number, ParsedAnswerEntry>;
  sequential: ParsedAnswerEntry[];
}

function normalizeBanglaDigits(input: string): string {
  return input.replace(/[০-৯]/g, (ch) => String('০১২৩৪৫৬৭৮৯'.indexOf(ch)));
}

function letterToOptionIndex(letter: string): number | null {
  const clean = letter.trim().toLowerCase();
  if (clean === 'a' || clean === 'ক') return 0;
  if (clean === 'b' || clean === 'খ') return 1;
  if (clean === 'c' || clean === 'গ') return 2;
  if (clean === 'd' || clean === 'ঘ') return 3;
  return null;
}

export function extractQuestionNumberFromRaw(text: string): number | null {
  const trimmed = (text || '').trim().replace(/^[\*\_\s]+/, '');
  if (!trimmed) return null;
  const match = trimmed.match(
    /^(?:Q(?:uestion)?\s*\.?\s*|প্রশ্ন\s*[\(\[]?)?\(?([0-9০-৯]{1,4})\)?\s*(?:[\.\)\:\-\]]|$)/i
  );
  if (!match) return null;
  const num = Number(normalizeBanglaDigits(match[1]));
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function parseAnswerKeyText(rawText: string): ParsedAnswerKeyResult {
  const byNumber = new Map<number, ParsedAnswerEntry>();
  const sequential: ParsedAnswerEntry[] = [];
  const raw = (rawText || '').trim();
  if (!raw) return { byNumber, sequential };

  const lines = raw.split(/\r?\n/);

  // Pass 1: Detect numbered entries (inline multi-pair lines OR single line with optional explanation)
  const pairRegex =
    /(?:^|[\s,;|\t])(?:Q(?:uestion)?\s*\.?\s*|প্রশ্ন\s*[\(\[]?)?([0-9০-৯]{1,4})\s*(?:[\.\)\:\-\]]+\s*|\s+)(?:উত্তর\s*[:\-]?\s*|Ans(?:wer)?\s*[:\-]?\s*)?\(?\s*([A-Da-dকখগঘ])\s*\)?(?=$|[\s,;|\/.\-\:\—\–\)]|\n)/g;

  const singleLineStartRegex =
    /^\s*(?:Q(?:uestion)?\s*\.?\s*|প্রশ্ন\s*[\(\[]?)?([0-9০-৯]{1,4})\s*[\.\)\:\-\]]+\s*(?:উত্তর\s*[:\-]?\s*|Ans(?:wer)?\s*[:\-]?\s*)?\(?\s*([A-Da-dকখগঘ])\s*\)?(?:\s*(?:[\.\—\–\-\:\|]|ব্যাখ্যা\s*[:\-]?|কারণ\s*[:\-]?|সমাধান\s*[:\-]?|Exp(?:lanation)?\s*[:\-]?|Sol(?:ution)?\s*[:\-]?)?\s*(.*))?$/i;

  let activeExplNum: number | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Skip standalone header lines like "উত্তরমালা:" or "Answer Key:"
    if (
      /^(?:#{1,4}\s*)?(?:answer\s*keys?|ans(?:wer)?\s*sheet|উত্তরমালা|সঠিক\s*উত্তর(?:\s*তালিকা)?)\s*[:\-]?\s*$/i.test(
        trimmedLine
      )
    ) {
      continue;
    }

    // Check if this line contains multiple numbered pairs (e.g. "1. A, 2. C, 3. B" or "১. ক ২. গ")
    const allMatches = Array.from(trimmedLine.matchAll(pairRegex));
    if (allMatches.length >= 2) {
      activeExplNum = null;
      for (const m of allMatches) {
        const num = Number(normalizeBanglaDigits(m[1]));
        const optIdx = letterToOptionIndex(m[2]);
        if (Number.isInteger(num) && num > 0 && optIdx !== null) {
          byNumber.set(num, { correctIndex: optIdx });
        }
      }
      continue;
    }

    const singleMatch = trimmedLine.match(singleLineStartRegex);
    if (singleMatch) {
      const num = Number(normalizeBanglaDigits(singleMatch[1]));
      const optIdx = letterToOptionIndex(singleMatch[2]);
      if (Number.isInteger(num) && num > 0 && optIdx !== null) {
        const trailing = (singleMatch[3] || '')
          .replace(/^(?:ব্যাখ্যা|কারণ|সমাধান|Explanation|Sol(?:ution)?)\s*[:\-]?\s*/i, '')
          .trim();
        byNumber.set(num, {
          correctIndex: optIdx,
          explanation: trailing || undefined,
        });
        activeExplNum = num;
        continue;
      }
    }

    // Also handle "1 A" (space-separated single pair on a line)
    if (allMatches.length === 1 && trimmedLine.length <= 24) {
      const m = allMatches[0];
      const num = Number(normalizeBanglaDigits(m[1]));
      const optIdx = letterToOptionIndex(m[2]);
      if (Number.isInteger(num) && num > 0 && optIdx !== null) {
        byNumber.set(num, { correctIndex: optIdx });
        activeExplNum = num;
        continue;
      }
    }

    // Continuation explanation line for the previous numbered answer
    if (activeExplNum !== null && byNumber.has(activeExplNum)) {
      const existing = byNumber.get(activeExplNum)!;
      const cleanCont = trimmedLine
        .replace(/^(?:ব্যাখ্যা|কারণ|সমাধান|Explanation|Sol(?:ution)?)\s*[:\-]?\s*/i, '')
        .trim();
      if (cleanCont) {
        existing.explanation = existing.explanation
          ? `${existing.explanation}\n${cleanCont}`
          : cleanCont;
      }
    }
  }

  // Pass 2: If no numbered entries were detected, parse sequential letters ("A, C, B, D" or "ক\nখ\nগ\nঘ")
  if (byNumber.size === 0) {
    const cleanBody = raw.replace(
      /^(?:#{1,4}\s*)?(?:answer\s*keys?|ans(?:wer)?\s*sheet|উত্তরমালা|সঠিক\s*উত্তর(?:\s*তালিকা)?)\s*[:\-]?\s*/i,
      ''
    );
    const tokens = cleanBody
      .split(/[\s,;|\n\t]+/)
      .map((t) => t.replace(/^[\(\[\.]+|[\)\]\.\:\-]+$/g, '').trim())
      .filter(Boolean);

    if (tokens.length > 0 && tokens.every((t) => letterToOptionIndex(t) !== null)) {
      for (const tok of tokens) {
        const idx = letterToOptionIndex(tok);
        if (idx !== null) sequential.push({ correctIndex: idx });
      }
    } else {
      // Check line-by-line where each line starts with "(ক) ব্যাখ্যা..." or "C - reason"
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        const m = t.match(
          /^\(?\s*([A-Da-dকখগঘ])\s*\)?(?:\s*(?:[\.\—\–\-\:\|]|ব্যাখ্যা\s*[:\-]?|কারণ\s*[:\-]?|Exp(?:lanation)?\s*[:\-]?)\s*(.*))?$/i
        );
        if (m) {
          const idx = letterToOptionIndex(m[1]);
          if (idx !== null) {
            sequential.push({
              correctIndex: idx,
              explanation: (m[2] || '').trim() || undefined,
            });
          }
        }
      }
    }
  }

  return { byNumber, sequential };
}

export async function analyzeAndStageQuestions(params: {
  rawText?: string;
  answerKeyText?: string;
  file?: { buffer: Buffer; originalname: string; mimetype: string };
  defaultSubjectId?: SubjectId;
  defaultUniversityTag?: UniversityTrack;
  defaultAdmissionCategory?: AdmissionCategory;
  defaultMarks?: number;
  defaultNegativeMarking?: number;
  defaultSourceName?: string;
  defaultSourceYear?: string;
}): Promise<{ batchId: string; items: StagedImportQuestion[]; sourceLabel: string }> {
  const doc = await extractDocumentText({
    file: params.file,
    rawText: params.rawText,
  });

  const cleanAnswerKey = (params.answerKeyText ?? '').trim();
  const parsedDedicatedKey = parseAnswerKeyText(cleanAnswerKey);
  const aiInputText = cleanAnswerKey
    ? `${doc.extractedText}\n\nউত্তরমালা:\n${cleanAnswerKey}`
    : doc.extractedText;

  const fallbackCat = normalizeAdmissionCategory(
    params.defaultAdmissionCategory || params.defaultUniversityTag || 'DU Ka',
    'DU Ka'
  );

  const extracted: RawExtractedQuestion[] = await extractQuestionsWithAi({
    text: aiInputText,
    pdfBuffer: doc.pdfBufferForAi,
    defaultSubjectId: params.defaultSubjectId,
    defaultAdmissionCategory: fallbackCat,
    defaultUniversityTag: params.defaultUniversityTag || fallbackCat,
    sourceHint: [params.defaultSourceName, params.defaultSourceYear, doc.sourceLabel]
      .filter(Boolean)
      .join(' '),
  });

  const batchId = `batch-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const db = getDb();
  const existingQuestions = getAllQuestions();
  const batchSeen: Array<{ id: string; prompt: string; fp: string }> = [];
  const stagedItems: StagedImportQuestion[] = [];

  const insertStmt = db.prepare(
    `INSERT INTO import_staging_questions (
      id, batch_id, subject_id, subject_name, chapter, topic, university_tag, admission_category,
      difficulty, prompt, prompt_bn, raw_original, options_json, correct_index, marks, negative_marking,
      answer_confidence, needs_manual_review, is_incomplete, is_duplicate, duplicate_of_question_id,
      duplicate_match_prompt, review_reason, validation_warnings_json, explanation_en, explanation_bn,
      source_name, source_year, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const now = new Date().toISOString();
  const defaultMarks = Number(params.defaultMarks) > 0 ? Number(params.defaultMarks) : 1;
  const defaultNeg =
    Number(params.defaultNegativeMarking) >= 0 ? Number(params.defaultNegativeMarking) : 0.25;

  for (let rawIdx = 0; rawIdx < extracted.length; rawIdx++) {
    const raw = extracted[rawIdx];
    const id = `stg-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const mappedSubj = mapLegacySubjectId(
      raw.subjectId || params.defaultSubjectId || 'physics',
      undefined,
      raw.prompt
    );
    const category = normalizeAdmissionCategory(
      raw.admissionCategory || raw.universityTag || fallbackCat,
      fallbackCat
    );
    const uniTag = normalizeTrack(
      raw.universityTag || category,
      category,
      params.defaultUniversityTag || 'DU Ka'
    );
    const difficulty = normalizeDifficulty(raw.difficulty || 'Standard');

    const optsRaw = Array.isArray(raw.options) ? raw.options : [];
    const options: [string, string, string, string] = [
      String(optsRaw[0] ?? '').trim(),
      String(optsRaw[1] ?? '').trim(),
      String(optsRaw[2] ?? '').trim(),
      String(optsRaw[3] ?? '').trim(),
    ];

    const promptTrimmed = (raw.prompt || '').trim();
    const promptBnTrimmed = (raw.promptBn || '').trim();
    const finalPrompt = promptTrimmed || promptBnTrimmed;
    const rawOrigText = (raw.rawOriginal || '').trim();

    // Deterministic matching from dedicated Answer Key textarea
    const detectedNum =
      extractQuestionNumberFromRaw(rawOrigText) ??
      extractQuestionNumberFromRaw(finalPrompt);
    let dedicatedMatch: ParsedAnswerEntry | undefined;
    if (detectedNum !== null && parsedDedicatedKey.byNumber.has(detectedNum)) {
      dedicatedMatch = parsedDedicatedKey.byNumber.get(detectedNum);
    } else if (
      parsedDedicatedKey.byNumber.size === 0 &&
      parsedDedicatedKey.sequential.length > 0 &&
      rawIdx < parsedDedicatedKey.sequential.length
    ) {
      dedicatedMatch = parsedDedicatedKey.sequential[rawIdx];
    }

    const hasInlineAnswerEvidence =
      rawOrigText.length > 0 &&
      /\b(?:ans(?:wer)?|correct|sol(?:ution)?|key)\b\s*[:\-\.]?|উত্তর|সঠিক\s*উত্তর|সমাধান|[✓✔✅★]|^\s*\*|\(\s*\*\s*\)|\*\s*$/im.test(
        rawOrigText
      );
    const globalKeyMatch = doc.extractedText.match(
      /(?:\banswer\s*keys?\b|\bans(?:wer)?\s*sheet\b|উত্তরমালা|সঠিক\s*উত্তর\s*তালিকা)([\s\S]*)$/i
    );
    const hasGlobalAnswerTable = Boolean(
      globalKeyMatch &&
        /(?:\d+|[০-৯]+)\s*[\.\)\:\-]?\s*(?:\(?[A-Dক-ঘ]\)?)/i.test(
          globalKeyMatch[1]
        )
    );
    const sourceHasAnswerEvidence =
      Boolean(dedicatedMatch) ||
      Boolean(doc.pdfBufferForAi) ||
      hasInlineAnswerEvidence ||
      hasGlobalAnswerTable;

    const aiHasValidExplicitAnswer =
      raw.answerConfidence === 'explicit' &&
      sourceHasAnswerEvidence &&
      typeof raw.correctIndex === 'number' &&
      raw.correctIndex >= 0 &&
      raw.correctIndex <= 3;

    const correctIndex = dedicatedMatch
      ? dedicatedMatch.correctIndex
      : aiHasValidExplicitAnswer
        ? raw.correctIndex
        : null;
    const answerConfidence: 'explicit' | 'uncertain' =
      correctIndex !== null ? 'explicit' : 'uncertain';

    const dup = findDuplicateMatch(finalPrompt, existingQuestions, batchSeen);
    const validation = computeValidationState({
      prompt: finalPrompt,
      options,
      correctIndex,
      answerConfidence,
      isDuplicate: dup.isDuplicate,
      aiWarnings: raw.validationWarnings,
      reviewReason: raw.reviewReason,
    });

    const initialStatus: QuestionStatus = validation.needsManualReview ? 'Needs Review' : 'Draft';

    const mergedExplanationBn =
      answerConfidence === 'explicit'
        ? (dedicatedMatch?.explanation || raw.explanationBn || '').trim()
        : '';

    const item: StagedImportQuestion = {
      id,
      batchId,
      subjectId: mappedSubj.subjectId,
      subjectName: mappedSubj.subjectName,
      chapter: (raw.chapter || 'General').trim(),
      topic: (raw.topic || raw.chapter || 'General').trim(),
      universityTag: uniTag,
      admissionCategory: category,
      difficulty,
      prompt: finalPrompt,
      promptBn: promptBnTrimmed,
      rawOriginal: (raw.rawOriginal || finalPrompt).trim(),
      options,
      correctIndex,
      marks: defaultMarks,
      negativeMarking: defaultNeg,
      answerConfidence,
      needsManualReview: validation.needsManualReview,
      isIncomplete: validation.isIncomplete || Boolean(raw.isIncomplete),
      isDuplicate: dup.isDuplicate,
      duplicateOfQuestionId: dup.duplicateOfId,
      duplicateMatchPrompt: dup.matchPrompt,
      reviewReason: validation.reviewReason,
      validationWarnings: validation.warnings,
      explanationEn: answerConfidence === 'explicit' ? (raw.explanationEn || '').trim() : '',
      explanationBn: mergedExplanationBn,
      sourceName: (raw.sourceName || params.defaultSourceName || doc.sourceLabel).trim(),
      sourceYear: (raw.sourceYear || params.defaultSourceYear || '').trim(),
      status: initialStatus,
      publishedQuestionId: null,
      createdAt: now,
    };

    insertStmt.run(
      item.id,
      item.batchId,
      item.subjectId,
      item.subjectName,
      item.chapter,
      item.topic,
      item.universityTag,
      item.admissionCategory,
      item.difficulty,
      item.prompt,
      item.promptBn,
      item.rawOriginal,
      JSON.stringify(item.options),
      item.correctIndex,
      item.marks,
      item.negativeMarking,
      item.answerConfidence,
      item.needsManualReview ? 1 : 0,
      item.isIncomplete ? 1 : 0,
      item.isDuplicate ? 1 : 0,
      item.duplicateOfQuestionId,
      item.duplicateMatchPrompt,
      item.reviewReason,
      JSON.stringify(item.validationWarnings),
      item.explanationEn,
      item.explanationBn,
      item.sourceName,
      item.sourceYear,
      item.status,
      item.createdAt
    );

    batchSeen.push({
      id: item.id,
      prompt: item.prompt,
      fp: normalizePromptFingerprint(item.prompt),
    });
    stagedItems.push(item);
  }

  return { batchId, items: stagedItems, sourceLabel: doc.sourceLabel };
}

function mapStagingRow(r: Record<string, unknown>): StagedImportQuestion {
  let opts: [string, string, string, string] = ['', '', '', ''];
  try {
    const parsed = JSON.parse(String(r.options_json || '[]')) as string[];
    opts = [parsed[0] || '', parsed[1] || '', parsed[2] || '', parsed[3] || ''];
  } catch {
    opts = ['', '', '', ''];
  }

  let warnings: string[] = [];
  try {
    warnings = JSON.parse(String(r.validation_warnings_json || '[]')) as string[];
  } catch {
    warnings = [];
  }

  return {
    id: String(r.id),
    batchId: String(r.batch_id),
    subjectId: String(r.subject_id) as SubjectId,
    subjectName: String(r.subject_name),
    chapter: String(r.chapter),
    topic: String(r.topic || ''),
    universityTag: String(r.university_tag) as UniversityTrack,
    admissionCategory: String(r.admission_category || 'DU Ka'),
    difficulty: String(r.difficulty) as StagedImportQuestion['difficulty'],
    prompt: String(r.prompt),
    promptBn: String(r.prompt_bn || ''),
    rawOriginal: String(r.raw_original || r.prompt || ''),
    options: opts,
    correctIndex: r.correct_index === null || r.correct_index === undefined ? null : Number(r.correct_index),
    marks: Number(r.marks ?? 1),
    negativeMarking: Number(r.negative_marking ?? 0.25),
    answerConfidence: String(r.answer_confidence) as 'explicit' | 'uncertain',
    needsManualReview: Boolean(Number(r.needs_manual_review)),
    isIncomplete: Boolean(Number(r.is_incomplete)),
    isDuplicate: Boolean(Number(r.is_duplicate)),
    duplicateOfQuestionId: r.duplicate_of_question_id ? String(r.duplicate_of_question_id) : null,
    duplicateMatchPrompt: r.duplicate_match_prompt ? String(r.duplicate_match_prompt) : null,
    reviewReason: String(r.review_reason || ''),
    validationWarnings: warnings,
    explanationEn: String(r.explanation_en || ''),
    explanationBn: String(r.explanation_bn || ''),
    sourceName: String(r.source_name || ''),
    sourceYear: String(r.source_year || ''),
    status: String(r.status) as QuestionStatus,
    publishedQuestionId: r.published_question_id ? String(r.published_question_id) : null,
    createdAt: String(r.created_at),
  };
}

export function listPendingImportQueue(statusFilter = 'active'): StagedImportQuestion[] {
  const db = getDb();
  let rows: Array<Record<string, unknown>>;
  if (statusFilter === 'all') {
    rows = db
      .prepare('SELECT * FROM import_staging_questions ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;
  } else if (
    statusFilter === 'Draft' ||
    statusFilter === 'Needs Review' ||
    statusFilter === 'Approved' ||
    statusFilter === 'Published' ||
    statusFilter === 'Rejected'
  ) {
    rows = db
      .prepare('SELECT * FROM import_staging_questions WHERE status = ? ORDER BY created_at DESC')
      .all(statusFilter) as Array<Record<string, unknown>>;
  } else {
    rows = db
      .prepare(
        `SELECT * FROM import_staging_questions
         WHERE status IN ('Draft', 'Needs Review', 'Approved')
         ORDER BY created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;
  }
  return rows.map(mapStagingRow);
}

export function updateStagedImportItem(
  id: string,
  patch: Partial<{
    subjectId: SubjectId;
    chapter: string;
    topic: string;
    universityTag: UniversityTrack;
    admissionCategory: string;
    difficulty: 'Foundation' | 'Standard' | 'Admission Hard';
    prompt: string;
    promptBn: string;
    options: [string, string, string, string];
    correctIndex: number | null;
    marks: number;
    negativeMarking: number;
    explanationEn: string;
    explanationBn: string;
    sourceName: string;
    sourceYear: string;
    dismissDuplicate: boolean;
  }>
): StagedImportQuestion | null {
  const db = getDb();
  const existingRow = db
    .prepare('SELECT * FROM import_staging_questions WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!existingRow) return null;

  const current = mapStagingRow(existingRow);
  const mappedSubj = patch.subjectId
    ? mapLegacySubjectId(patch.subjectId)
    : { subjectId: current.subjectId, subjectName: current.subjectName };

  const nextCategory = patch.admissionCategory
    ? normalizeAdmissionCategory(patch.admissionCategory)
    : (current.admissionCategory as AdmissionCategory);
  const nextTrack = patch.universityTag
    ? patch.universityTag
    : normalizeTrack(current.universityTag, nextCategory, current.universityTag);

  const nextOptions = patch.options ?? current.options;
  const nextPrompt = (patch.prompt ?? current.prompt).trim();
  const nextCorrect =
    patch.correctIndex === undefined
      ? current.correctIndex
      : patch.correctIndex !== null && patch.correctIndex >= 0 && patch.correctIndex <= 3
        ? patch.correctIndex
        : null;

  const answerConfidence: 'explicit' | 'uncertain' =
    nextCorrect !== null ? 'explicit' : 'uncertain';
  const isDuplicate = patch.dismissDuplicate ? false : current.isDuplicate;

  const validation = computeValidationState({
    prompt: nextPrompt,
    options: nextOptions,
    correctIndex: nextCorrect,
    answerConfidence,
    isDuplicate,
  });

  // Automatically move from Needs Review -> Draft when admin fixes the answer/options
  let nextStatus: QuestionStatus = current.status;
  if (current.status === 'Draft' || current.status === 'Needs Review') {
    nextStatus = validation.needsManualReview ? 'Needs Review' : 'Draft';
  }

  db.prepare(
    `UPDATE import_staging_questions
     SET subject_id = ?, subject_name = ?, chapter = ?, topic = ?, university_tag = ?,
         admission_category = ?, difficulty = ?, prompt = ?, prompt_bn = ?, options_json = ?,
         correct_index = ?, marks = ?, negative_marking = ?, answer_confidence = ?,
         is_incomplete = ?, is_duplicate = ?, needs_manual_review = ?,
         review_reason = ?, validation_warnings_json = ?,
         explanation_en = ?, explanation_bn = ?, source_name = ?, source_year = ?, status = ?
     WHERE id = ?`
  ).run(
    mappedSubj.subjectId,
    mappedSubj.subjectName,
    (patch.chapter ?? current.chapter).trim(),
    (patch.topic ?? current.topic).trim(),
    nextTrack,
    nextCategory,
    patch.difficulty ?? current.difficulty,
    nextPrompt,
    (patch.promptBn ?? current.promptBn).trim(),
    JSON.stringify(nextOptions.map((o) => o.trim())),
    nextCorrect,
    Number(patch.marks ?? current.marks) > 0 ? Number(patch.marks ?? current.marks) : 1,
    Number(patch.negativeMarking ?? current.negativeMarking) >= 0
      ? Number(patch.negativeMarking ?? current.negativeMarking)
      : 0.25,
    answerConfidence,
    validation.isIncomplete ? 1 : 0,
    isDuplicate ? 1 : 0,
    validation.needsManualReview ? 1 : 0,
    validation.reviewReason,
    JSON.stringify(validation.warnings),
    (patch.explanationEn ?? current.explanationEn).trim(),
    (patch.explanationBn ?? current.explanationBn).trim(),
    (patch.sourceName ?? current.sourceName).trim(),
    (patch.sourceYear ?? current.sourceYear).trim(),
    nextStatus,
    id
  );

  const updated = db
    .prepare('SELECT * FROM import_staging_questions WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapStagingRow(updated);
}

export function applyAnswerKeyToStagedItems(
  stagedIds: string[],
  answerKeyText: string
): {
  updatedCount: number;
  unmatchedCount: number;
  updatedItems: StagedImportQuestion[];
  remainingQueue: StagedImportQuestion[];
} {
  const parsed = parseAnswerKeyText(answerKeyText);
  if (parsed.byNumber.size === 0 && parsed.sequential.length === 0) {
    throw new Error(
      'পেস্ট করা উত্তরমালায় কোনো বৈধ উত্তর (A-D বা ক-ঘ) পাওয়া যায়নি। উদাহরণ: "1. গ, 2. ক" বা "A, C, B, D"। '
    );
  }

  const db = getDb();
  const updatedItems: StagedImportQuestion[] = [];
  let unmatchedCount = 0;

  // Fetch all target staged items preserving the exact order passed by the caller
  const stagedRows: StagedImportQuestion[] = [];
  const selectStmt = db.prepare('SELECT * FROM import_staging_questions WHERE id = ?');
  for (const id of stagedIds) {
    const row = selectStmt.get(id) as Record<string, unknown> | undefined;
    if (row) stagedRows.push(mapStagingRow(row));
  }

  // Decide whether numbered matching works across these items, otherwise allow positional sequential fallback
  const hasAnyNumberMatch =
    parsed.byNumber.size > 0 &&
    stagedRows.some((item) => {
      const qNum =
        extractQuestionNumberFromRaw(item.rawOriginal) ??
        extractQuestionNumberFromRaw(item.prompt);
      return qNum !== null && parsed.byNumber.has(qNum);
    });

  const sortedNumberKeys =
    parsed.byNumber.size > 0 && !hasAnyNumberMatch
      ? Array.from(parsed.byNumber.keys()).sort((a, b) => a - b)
      : [];

  const updateStmt = db.prepare(
    `UPDATE import_staging_questions
     SET correct_index = ?, answer_confidence = 'explicit',
         is_incomplete = ?, needs_manual_review = ?,
         review_reason = ?, validation_warnings_json = ?,
         explanation_bn = ?, status = ?
     WHERE id = ?`
  );
  const updatePublishedStmt = db.prepare(
    `UPDATE questions SET correct_index = ?, answer_confidence = 'explicit', updated_at = ? WHERE id = ?`
  );
  const upsertPublishedExplStmt = db.prepare(
    `INSERT INTO question_explanations (question_id, explanation_en, explanation_bn)
     VALUES (?, '', ?)
     ON CONFLICT(question_id) DO UPDATE SET explanation_bn = excluded.explanation_bn`
  );

  for (let idx = 0; idx < stagedRows.length; idx++) {
    const item = stagedRows[idx];
    let entry: ParsedAnswerEntry | undefined;

    if (hasAnyNumberMatch) {
      const qNum =
        extractQuestionNumberFromRaw(item.rawOriginal) ??
        extractQuestionNumberFromRaw(item.prompt);
      if (qNum !== null && parsed.byNumber.has(qNum)) {
        entry = parsed.byNumber.get(qNum);
      }
    } else if (parsed.sequential.length > 0 && idx < parsed.sequential.length) {
      entry = parsed.sequential[idx];
    } else if (sortedNumberKeys.length > 0 && idx < sortedNumberKeys.length) {
      // If user pasted "1. A, 2. C" while questions were unnumbered (or numbered 13, 14), fall back by sorted key order
      entry = parsed.byNumber.get(sortedNumberKeys[idx]);
    }

    if (!entry) {
      unmatchedCount += 1;
      continue;
    }

    const validation = computeValidationState({
      prompt: item.prompt,
      options: item.options,
      correctIndex: entry.correctIndex,
      answerConfidence: 'explicit',
      isDuplicate: item.isDuplicate,
    });

    let nextStatus: QuestionStatus = item.status;
    if (item.status === 'Draft' || item.status === 'Needs Review') {
      nextStatus = validation.needsManualReview ? 'Needs Review' : 'Draft';
    }

    const nextExplBn = entry.explanation?.trim()
      ? entry.explanation.trim()
      : item.explanationBn;

    updateStmt.run(
      entry.correctIndex,
      validation.isIncomplete ? 1 : 0,
      validation.needsManualReview ? 1 : 0,
      validation.reviewReason,
      JSON.stringify(validation.warnings),
      nextExplBn,
      nextStatus,
      item.id
    );

    if (item.publishedQuestionId) {
      updatePublishedStmt.run(
        entry.correctIndex,
        new Date().toISOString(),
        item.publishedQuestionId
      );
      if (nextExplBn) {
        upsertPublishedExplStmt.run(item.publishedQuestionId, nextExplBn);
      }
    }

    const refreshed = selectStmt.get(item.id) as Record<string, unknown>;
    updatedItems.push(mapStagingRow(refreshed));
  }

  return {
    updatedCount: updatedItems.length,
    unmatchedCount,
    updatedItems,
    remainingQueue: listPendingImportQueue(),
  };
}

export function rejectStagedImportItem(id: string): boolean {
  const db = getDb();
  const res = db
    .prepare("UPDATE import_staging_questions SET status = 'Rejected' WHERE id = ?")
    .run(id);
  return Number(res.changes) > 0;
}

export function deleteStagedImportItem(id: string): boolean {
  const db = getDb();
  const res = db
    .prepare('DELETE FROM import_staging_questions WHERE id = ?')
    .run(id);
  return Number(res.changes) > 0;
}

export function approveStagedImportItems(
  ids: string[],
  options: { publishImmediately?: boolean; excludeNeedsReview?: boolean } = {}
): {
  approvedQuestions: QuestionItem[];
  skipped: Array<{ id: string; reason: string }>;
} {
  const db = getDb();
  const approvedQuestions: QuestionItem[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const targetStatus: QuestionStatus = options.publishImmediately ? 'Published' : 'Approved';

  for (const id of ids) {
    const row = db
      .prepare('SELECT * FROM import_staging_questions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) continue;

    const item = mapStagingRow(row);
    if (item.status === 'Rejected') {
      skipped.push({ id: item.id, reason: 'প্রশ্নটি বাতিল (Rejected) করা হয়েছে।' });
      continue;
    }

    // Strict integrity guard: Bulk valid approval MUST exclude Needs Review / uncertain items
    if (options.excludeNeedsReview && (item.status === 'Needs Review' || item.needsManualReview)) {
      skipped.push({
        id: item.id,
        reason: 'পর্যালোচনা প্রয়োজন (Needs Review) — স্বয়ংক্রিয় অনুমোদন থেকে বাদ দেওয়া হয়েছে।',
      });
      continue;
    }

    if (item.correctIndex === null || item.correctIndex < 0 || item.correctIndex > 3 || item.answerConfidence === 'uncertain') {
      skipped.push({
        id: item.id,
        reason: 'যাচাইকৃত সঠিক উত্তর (A-D) নির্বাচন করা হয়নি।',
      });
      continue;
    }
    if (item.isIncomplete || item.options.some((o) => !o.trim()) || !item.prompt.trim()) {
      skipped.push({
        id: item.id,
        reason: 'প্রশ্ন বা ৪টি অপশনের কোনোটি অসম্পূর্ণ।',
      });
      continue;
    }

    let questionRecord: QuestionItem | undefined;
    if (item.publishedQuestionId) {
      questionRecord = getAllQuestions().find((q) => q.id === item.publishedQuestionId);
      if (questionRecord && targetStatus === 'Published' && questionRecord.status !== 'Published') {
        db.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?').run(
          'Published',
          new Date().toISOString(),
          questionRecord.id
        );
        questionRecord = getAllQuestions().find((q) => q.id === questionRecord!.id);
      }
    }

    if (!questionRecord) {
      questionRecord = createQuestion({
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        chapter: item.chapter,
        topic: item.topic,
        universityTag: item.universityTag,
        admissionCategory: item.admissionCategory,
        difficulty: item.difficulty,
        prompt: item.prompt,
        promptBn: item.promptBn || undefined,
        rawText: item.rawOriginal,
        options: item.options,
        correctIndex: item.correctIndex,
        marks: item.marks,
        negativeMarking: item.negativeMarking,
        status: targetStatus,
        answerConfidence: item.answerConfidence,
        validationWarnings: item.validationWarnings,
        aiFormatted: true,
        explanationEn: item.explanationEn,
        explanationBn: item.explanationBn,
        sourceName: item.sourceName,
        sourceYear: item.sourceYear,
      });
    }

    db.prepare(
      'UPDATE import_staging_questions SET status = ?, published_question_id = ? WHERE id = ?'
    ).run(targetStatus, questionRecord.id, id);

    approvedQuestions.push(questionRecord);
  }

  return { approvedQuestions, skipped };
}

export function publishApprovedStagedItems(ids: string[]): {
  publishedCount: number;
  questionIds: string[];
} {
  const db = getDb();
  const questionIds: string[] = [];
  const now = new Date().toISOString();

  for (const id of ids) {
    const row = db
      .prepare('SELECT * FROM import_staging_questions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) continue;
    const item = mapStagingRow(row);
    if (item.status !== 'Approved' && item.status !== 'Published') continue;

    if (item.publishedQuestionId) {
      db.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?').run(
        'Published',
        now,
        item.publishedQuestionId
      );
      questionIds.push(item.publishedQuestionId);
    }
    db.prepare("UPDATE import_staging_questions SET status = 'Published' WHERE id = ?").run(id);
  }

  // Re-sync chapter published question counts
  db.exec(`
    UPDATE chapters
    SET questions_count = (
      SELECT COUNT(*) FROM questions q
      WHERE q.chapter_id = chapters.id AND q.status = 'Published'
    );
  `);

  return { publishedCount: questionIds.length, questionIds };
}

export function assignStagedOrApprovedToExam(params: {
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
}): {
  exam: ExamConfig;
  assignedQuestionIds: string[];
  skipped: Array<{ id: string; reason: string }>;
} {
  const approved = approveStagedImportItems(params.stagedIds, {
    publishImmediately: params.publishQuestions !== false,
    excludeNeedsReview: true,
  });

  const qIds = approved.approvedQuestions.map((q) => q.id);
  if (qIds.length === 0) {
    throw new Error(
      'পরীক্ষায় যুক্ত করার জন্য অন্তত ১টি যাচাইকৃত ও বৈধ প্রশ্ন নির্বাচন করুন (Needs Review প্রশ্ন বাদ দিন)।'
    );
  }

  if (params.examId) {
    const db = getDb();
    const existingRow = db.prepare('SELECT id FROM exams WHERE id = ?').get(params.examId);
    if (!existingRow) {
      throw new Error('নির্বাচিত পরীক্ষাটি পাওয়া যায়নি।');
    }
    const maxOrderRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM exam_questions WHERE exam_id = ?')
      .get(params.examId) as { m: number };
    const insEq = db.prepare(
      'INSERT OR IGNORE INTO exam_questions (exam_id, question_id, sort_order) VALUES (?, ?, ?)'
    );
    let order = Number(maxOrderRow.m) + 1;
    for (const qid of qIds) {
      insEq.run(params.examId, qid, order++);
    }
    const updatedExam = updateExam(params.examId, {});
    if (!updatedExam) {
      throw new Error('পরীক্ষা হালনাগাদ করা যায়নি।');
    }
    return {
      exam: updatedExam,
      assignedQuestionIds: qIds,
      skipped: approved.skipped,
    };
  }

  if (!params.newExam?.title?.trim()) {
    throw new Error('নতুন পরীক্ষার শিরোনাম দিন অথবা বিদ্যমান পরীক্ষা নির্বাচন করুন।');
  }

  const sections = Array.from(
    new Set(approved.approvedQuestions.map((q) => q.subjectName))
  );
  const createdExam = createExam({
    title: params.newExam.title.trim(),
    subtitle: params.newExam.subtitle?.trim() || `${params.newExam.universityTrack} AI Exam Batch`,
    universityTrack: params.newExam.universityTrack,
    examType: params.newExam.universityTrack === 'GST' ? 'mock' : 'university',
    durationMinutes: Number(params.newExam.durationMinutes) || Math.max(5, qIds.length),
    totalMarks: qIds.length,
    negativeMarking: Number(params.newExam.negativeMarking ?? 0.25),
    isPublished: params.newExam.isPublished !== false,
    status: 'available',
    questionIds: qIds,
    sections,
  });

  return {
    exam: createdExam,
    assignedQuestionIds: qIds,
    skipped: approved.skipped,
  };
}
