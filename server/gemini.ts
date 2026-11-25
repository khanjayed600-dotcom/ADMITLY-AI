import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiGeneratedQuestion,
  AiStatusInfo,
  AiStudyPlanResponse,
  ExamAttempt,
  StudentProfile,
  SubjectId,
  SubjectSummary,
} from '../src/types';
import { logAiUsage } from './store';

const MODEL_NAME = 'gemini-4-hydrogen';
const FALLBACK_MODEL_NAME = 'gemini-3.1-flash-lite';

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  return (
    status === 503 ||
    status === 429 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateContentResilient(
  ai: GoogleGenAI,
  request: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  const modelsToTry = [MODEL_NAME, FALLBACK_MODEL_NAME];
  let lastErr: unknown;

  for (const model of modelsToTry) {
    const attempts = model === MODEL_NAME ? 2 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const baseConfig =
          model === FALLBACK_MODEL_NAME && request.config && 'thinkingConfig' in request.config
            ? (() => {
                const { thinkingConfig: _omit, ...rest } = request.config as Record<string, unknown>;
                return rest;
              })()
            : (request.config ?? {});
        const config = {
          ...baseConfig,
          abortSignal: AbortSignal.timeout(45_000),
        };
        return await ai.models.generateContent({
          ...request,
          model,
          config,
        });
      } catch (err) {
        lastErr = err;
        const isTimeout =
          err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        if (!isTransientGeminiError(err) && !isTimeout) {
          throw err;
        }
        if (attempt < attempts - 1) {
          await sleep(800 * (attempt + 1));
        }
      }
    }
  }

  const wrapped = new Error(
    'AI সার্ভার সাময়িকভাবে ব্যস্ত রয়েছে (503)। অনুগ্রহ করে কয়েক মুহূর্ত পর আবার চেষ্টা করুন।'
  );
  (wrapped as Error & { code?: string; cause?: unknown }).code = 'AI_UNAVAILABLE';
  (wrapped as Error & { cause?: unknown }).cause = lastErr;
  throw wrapped;
}

export function getAiStatus(): AiStatusInfo {
  const key = process.env.GEMINI_API_KEY?.trim();
  const configured = Boolean(key && key !== 'MY_GEMINI_API_KEY');
  return {
    configured,
    model: MODEL_NAME,
    provider: 'Google Gemini API',
  };
}

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY সার্ভার সেটিংসে কনফিগার করা নেই। AI সেবা চালু করতে Settings > Secrets থেকে API Key যুক্ত করুন।'
    );
    (err as Error & { code?: string }).code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function askAiMentor(params: {
  message: string;
  language: 'bilingual' | 'bangla' | 'english';
  student: StudentProfile;
  subjects: SubjectSummary[];
}): Promise<{ reply: string; model: string }> {
  const started = Date.now();
  try {
    const ai = getClient();
    const weaknessSummary = params.subjects
      .map(
        (s) =>
          `${s.name}: mastery ${s.mastery}%, accuracy ${s.accuracy}%, weakest topic: ${s.weakestTopic || 'None yet'}`
      )
      .join('; ');

    const languageDirective =
      params.language === 'bangla'
        ? 'Respond primarily in clear, encouraging, natural academic Bangla (with standard English scientific terms in parentheses where helpful).'
        : params.language === 'english'
          ? 'Respond in crisp, structured English suited for Bangladesh university admission prep.'
          : 'Respond clearly in English and include a helpful concise Bangla explanation ("সহজ বাংলায়:") for key formulas or concepts.';

    const response = await generateContentResilient(ai, {
      contents: params.message,
      config: {
        systemInstruction: `You are ADMITLY AI Mentor, an elite personal admission coach for Bangladeshi HSC students preparing for ${params.student.targetTrack} and ${params.student.secondaryTrack}.
Student context: ${params.student.name} (${params.student.college || 'HSC Candidate'}), Overall Score: ${params.student.overallScore}%, Average Accuracy: ${params.student.averageAccuracy}%, Streak: ${params.student.streakDays} days.
Subject telemetry: ${weaknessSummary}.
${languageDirective}
Keep answers focused, step-by-step, mathematically accurate, and format formulas cleanly with $...$ or $$...$$ LaTeX.`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Empty response received from Gemini API.');
    }

    logAiUsage({
      feature: 'AI Mentor Chat',
      model: MODEL_NAME,
      status: 'success',
      latencyMs: Date.now() - started,
      summary: params.message.slice(0, 72),
    });

    return { reply: text, model: MODEL_NAME };
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    logAiUsage({
      feature: 'AI Mentor Chat',
      model: MODEL_NAME,
      status: code === 'AI_NOT_CONFIGURED' ? 'not_configured' : 'error',
      latencyMs: Date.now() - started,
      summary: (err as Error).message.slice(0, 90),
    });
    throw err;
  }
}

export async function generateStudyPlan(params: {
  student: StudentProfile;
  subjects: SubjectSummary[];
  focusGoal: string;
}): Promise<AiStudyPlanResponse> {
  const started = Date.now();
  try {
    const ai = getClient();
    const subjectSnapshot = params.subjects
      .map(
        (s) =>
          `${s.name} (Mastery ${s.mastery}%, Accuracy ${s.accuracy}%, Weakest: ${s.weakestTopic || 'Not assessed yet'})`
      )
      .join('\n');

    const response = await generateContentResilient(ai, {
      contents: `Create a high-impact 4-day targeted study plan for ${params.student.name} targeting ${params.student.targetTrack} & ${params.student.secondaryTrack}.
Focus goal: ${params.focusGoal || 'Build strong core concept accuracy across HSC admission chapters'}.
Current Subject Profile:
${subjectSnapshot}`,
      config: {
        systemInstruction:
          'You are an expert Bangladesh admission strategist. Return realistic, concrete daily study blocks with natural Bangladeshi Bangla tips.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            focusMessageBn: { type: Type.STRING },
            dailyBlocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.STRING },
                  subject: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  durationMinutes: { type: Type.INTEGER },
                  actionItem: { type: Type.STRING },
                  banglaTip: { type: Type.STRING },
                },
                required: [
                  'day',
                  'subject',
                  'topic',
                  'durationMinutes',
                  'actionItem',
                  'banglaTip',
                ],
              },
            },
          },
          required: ['summary', 'focusMessageBn', 'dailyBlocks'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as AiStudyPlanResponse;
    logAiUsage({
      feature: 'Study Plan',
      model: MODEL_NAME,
      status: 'success',
      latencyMs: Date.now() - started,
      summary: `Generated ${parsed.dailyBlocks?.length ?? 0}-day plan for ${params.student.targetTrack}`,
    });
    return parsed;
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    logAiUsage({
      feature: 'Study Plan',
      model: MODEL_NAME,
      status: code === 'AI_NOT_CONFIGURED' ? 'not_configured' : 'error',
      latencyMs: Date.now() - started,
      summary: (err as Error).message.slice(0, 90),
    });
    throw err;
  }
}

export async function generatePracticeQuestions(params: {
  subject: string;
  topic: string;
  universityTrack: string;
  count: number;
}): Promise<AiGeneratedQuestion[]> {
  const started = Date.now();
  try {
    const ai = getClient();
    const safeCount = Math.min(5, Math.max(1, params.count));

    const response = await generateContentResilient(ai, {
      contents: `Generate ${safeCount} authentic ${params.universityTrack}-standard admission MCQ questions on ${params.subject} — "${params.topic}".
Include both English and Bangla question stems (using clean $...$ LaTeX for math expressions), 4 clear options, exact correctIndex (0 to 3), concise English explanation, and easy-to-understand Bangla explanation.`,
      config: {
        systemInstruction:
          'You create rigorous Bangladesh university admission MCQs (BUET, DU Ka Unit, DU Kha Unit, Medical, GST standard). Ensure mathematical accuracy and exact correctIndex matching the options array.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              prompt: { type: Type.STRING },
              promptBn: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              correctIndex: { type: Type.INTEGER },
              explanationEn: { type: Type.STRING },
              explanationBn: { type: Type.STRING },
            },
            required: [
              'topic',
              'prompt',
              'promptBn',
              'options',
              'correctIndex',
              'explanationEn',
              'explanationBn',
            ],
          },
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const parsed = JSON.parse((response.text ?? '[]').trim()) as AiGeneratedQuestion[];
    const normalized = parsed.map((q) => ({
      ...q,
      options: (q.options.slice(0, 4).length === 4
        ? q.options.slice(0, 4)
        : [...q.options, 'Option D', 'Option C', 'Option B', 'Option A'].slice(0, 4)) as [
        string,
        string,
        string,
        string,
      ],
      correctIndex: Math.min(3, Math.max(0, Number(q.correctIndex) || 0)),
    }));

    logAiUsage({
      feature: 'Practice Generator',
      model: MODEL_NAME,
      status: 'success',
      latencyMs: Date.now() - started,
      summary: `${normalized.length} MCQs on ${params.subject}: ${params.topic}`,
    });

    return normalized;
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    logAiUsage({
      feature: 'Practice Generator',
      model: MODEL_NAME,
      status: code === 'AI_NOT_CONFIGURED' ? 'not_configured' : 'error',
      latencyMs: Date.now() - started,
      summary: (err as Error).message.slice(0, 90),
    });
    throw err;
  }
}

export async function analyzeExamAttempt(params: {
  attempt: ExamAttempt;
  student: StudentProfile;
}): Promise<string> {
  const started = Date.now();
  try {
    const ai = getClient();
    const subjLines = params.attempt.subjectBreakdown
      .map(
        (s) =>
          `${s.subjectName}: ${s.correct}/${s.total} correct, ${s.incorrect} wrong, accuracy ${s.accuracy}%`
      )
      .join('\n');
    const weakLines =
      params.attempt.topicWeaknesses.length > 0
        ? params.attempt.topicWeaknesses
            .map((w) => `${w.subjectName} - ${w.topic} (${w.accuracy}% accuracy)`)
            .join(', ')
        : 'None detected in this exam';

    const response = await generateContentResilient(ai, {
      contents: `Analyze this completed mock exam for ${params.student.name} (Target: ${params.student.targetTrack}):
Exam: ${params.attempt.examTitle} (${params.attempt.universityTrack})
Score: ${params.attempt.rawScore}/${params.attempt.maxScore} | Accuracy: ${params.attempt.accuracy}% | Time spent: ${Math.round(params.attempt.durationSecondsSpent / 60)} min
Subject Breakdown:
${subjLines}
Weak Topics: ${weakLines}

Provide 3 concise, high-impact improvement steps in English plus 1 motivating Bangla summary line ("পরামর্শ:").`,
      config: {
        systemInstruction:
          'You are ADMITLY AI diagnostic analyst. Be concrete, encouraging, and strategic about negative marking and time pacing.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const text = response.text?.trim() ?? '';
    logAiUsage({
      feature: 'Attempt Analysis',
      model: MODEL_NAME,
      status: 'success',
      latencyMs: Date.now() - started,
      summary: `Analyzed ${params.attempt.examTitle}`,
    });
    return text;
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    logAiUsage({
      feature: 'Attempt Analysis',
      model: MODEL_NAME,
      status: code === 'AI_NOT_CONFIGURED' ? 'not_configured' : 'error',
      latencyMs: Date.now() - started,
      summary: (err as Error).message.slice(0, 90),
    });
    throw err;
  }
}

export async function explainQuestionForReview(params: {
  prompt: string;
  promptBn?: string;
  options: [string, string, string, string];
  correctIndex: number;
  selectedIndex: number | null;
  subjectName: string;
  chapter: string;
  officialExplanationEn?: string;
  officialExplanationBn?: string;
}): Promise<{ explanation: string; model: string }> {
  const started = Date.now();
  try {
    const ai = getClient();
    const safeCorrectIdx = Math.min(3, Math.max(0, Number(params.correctIndex) || 0));
    const letters = ['A', 'B', 'C', 'D'];
    const correctLetter = letters[safeCorrectIdx];
    const studentLetter =
      params.selectedIndex !== null &&
      params.selectedIndex >= 0 &&
      params.selectedIndex <= 3
        ? letters[params.selectedIndex]
        : null;

    const optionsText = params.options
      .map((opt, idx) => `(${letters[idx]}) ${opt}`)
      .join('\n');

    const response = await generateContentResilient(ai, {
      contents: `Subject: ${params.subjectName} | Chapter: ${params.chapter}
Question: ${params.prompt}${params.promptBn && params.promptBn !== params.prompt ? `\nBangla: ${params.promptBn}` : ''}

Options:
${optionsText}

OFFICIAL VERIFIED ANSWER KEY: (${correctLetter}) ${params.options[safeCorrectIdx]}
Student's Selected Answer: ${studentLetter ? `(${studentLetter}) ${params.options[params.selectedIndex!]}` : 'Unanswered'}
${params.officialExplanationBn || params.officialExplanationEn ? `Official Reference Note: ${params.officialExplanationBn || params.officialExplanationEn}` : ''}

Provide a clear, step-by-step supplemental explanation in natural academic Bangla explaining WHY (${correctLetter}) is the official correct answer${studentLetter && studentLetter !== correctLetter ? ` and briefly why (${studentLetter}) is incorrect` : ''}. Use clean $...$ or $$...$$ KaTeX LaTeX for math/chemical expressions.`,
      config: {
        systemInstruction: `You are ADMITLY AI Academic Reviewer for Bangladeshi HSC & University Admission exams.
CRITICAL RULE: The backend database has already verified that option (${correctLetter}) is the official answer key. You MUST explain why (${correctLetter}) is correct and MUST NEVER alter, doubt, or contradict the official answer key. Keep your explanation concise (3-6 lines), crystal clear, and structured in natural Bangla with clean LaTeX math.`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Empty response received from Gemini API.');
    }

    logAiUsage({
      feature: 'Question Explanation',
      model: MODEL_NAME,
      status: 'success',
      latencyMs: Date.now() - started,
      summary: `${params.subjectName}: ${params.prompt.slice(0, 56)}`,
    });

    return { explanation: text, model: MODEL_NAME };
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    logAiUsage({
      feature: 'Question Explanation',
      model: MODEL_NAME,
      status: code === 'AI_NOT_CONFIGURED' ? 'not_configured' : 'error',
      latencyMs: Date.now() - started,
      summary: (err as Error).message.slice(0, 90),
    });
    throw err;
  }
}

export interface RawExtractedQuestion {
  subjectId: SubjectId;
  chapter: string;
  topic: string;
  universityTag: string;
  admissionCategory: string;
  difficulty: 'Foundation' | 'Standard' | 'Admission Hard';
  prompt: string;
  promptBn: string;
  rawOriginal: string;
  options: string[];
  correctIndex: number; // -1 if NOT explicitly given in source or uncertain
  answerConfidence: 'explicit' | 'uncertain';
  isIncomplete: boolean;
  reviewReason: string;
  validationWarnings: string[];
  explanationEn: string;
  explanationBn: string;
  sourceName: string;
  sourceYear: string;
}

/**
 * Splits a large multi-question text paste (e.g. 20–50 questions) into clean,
 * non-truncating chunks without slicing a single question in half.
 */
function splitTextIntoQuestionChunks(
  rawText: string,
  maxCharsPerChunk = 6500,
  maxQuestionsPerChunk = 10
): string[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // Extract trailing Answer Key / উত্তরমালা section if present so every chunk can reference it
  let bodyText = trimmed;
  let sharedAnswerKeyAppendix = '';
  const answerSectionMatch = trimmed.match(
    /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*{1,2})?(?:answer\s*keys?|ans(?:wer)?\s*sheet|উত্তরমালা|সঠিক\s*উত্তর\s*তালিকা)(?:\*{1,2})?\s*[:\-]?\s*\n([\s\S]+)$/i
  );
  if (
    answerSectionMatch &&
    typeof answerSectionMatch.index === 'number' &&
    answerSectionMatch.index > trimmed.length * 0.35
  ) {
    bodyText = trimmed.slice(0, answerSectionMatch.index).trim();
    sharedAnswerKeyAppendix = trimmed.slice(answerSectionMatch.index).trim();
  }

  // Identify likely question start lines without matching option markers (A)-(D) or (ক)-(ঘ)
  const lines = bodyText.split(/\r?\n/);
  const questionStartPattern =
    /^\s*(?:\*{0,2})(?:(?:Q(?:uestion)?\s*\.?\s*)?(?:\d+|[০-৯]+)[\.\)\:\-]\s*\S|\((?:\d+|[০-৯]+)\)\s*\S|প্রশ্ন\s*[\(\[]?(?:\d+|[০-৯]+)?[\)\]]?\s*[\.\:\-]?\s*\S)/i;

  const blocks: string[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (questionStartPattern.test(line) && currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n').trim());
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n').trim());
  }

  // Fallback to blank-line splitting if numbered blocks weren't detected
  const segments =
    blocks.length > 1
      ? blocks
      : bodyText
          .split(/\n{2,}/)
          .map((s) => s.trim())
          .filter(Boolean);

  const chunks: string[] = [];
  let activeBlocks: string[] = [];
  let activeChars = 0;

  for (const seg of segments) {
    const wouldExceedChars = activeChars + seg.length + 2 > maxCharsPerChunk;
    const wouldExceedCount = activeBlocks.length >= maxQuestionsPerChunk;

    if (activeBlocks.length > 0 && (wouldExceedChars || wouldExceedCount)) {
      chunks.push(activeBlocks.join('\n\n'));
      activeBlocks = [seg];
      activeChars = seg.length;
    } else {
      activeBlocks.push(seg);
      activeChars += seg.length + 2;
    }
  }
  if (activeBlocks.length > 0) {
    chunks.push(activeBlocks.join('\n\n'));
  }

  const finalChunks = chunks.length > 0 ? chunks : [bodyText || trimmed];
  if (sharedAnswerKeyAppendix) {
    return finalChunks.map(
      (chunk) =>
        `${chunk}\n\n[Shared Reference Answer Key from end of source — use ONLY for matching question numbers]\n${sharedAnswerKeyAppendix}`
    );
  }
  return finalChunks;
}

export async function extractQuestionsWithAi(params: {
  text?: string;
  pdfBuffer?: Buffer;
  defaultSubjectId?: SubjectId;
  defaultAdmissionCategory?: string;
  defaultUniversityTag?: string;
  sourceHint?: string;
}): Promise<RawExtractedQuestion[]> {
  const started = Date.now();
  try {
    const ai = getClient();

    const defaultCategory =
      params.defaultAdmissionCategory || params.defaultUniversityTag || 'DU Ka';

    const instruction = `You are ADMITLY AI Question Builder — an ultra-accurate academic parser and KaTeX formatter for Bangladeshi HSC & University Admission MCQs (Physics, Chemistry, Mathematics, Biology, English, ICT, General Knowledge).

Parse every individual question from the input into structured MCQ objects.

STRICT ACCURACY & FORMATTING RULES (MANDATORY):
1. PRESERVE ORIGINAL & FORMAT MATH WITH LATEX ($...$ / $$...$$):
   - Set "rawOriginal" to the verbatim unmodified block of text for that question from the input (do NOT rewrite or drop characters from rawOriginal, and keep its original question number like "১৩.", "14." intact).
   - Format mathematical formulas, equations, dimensions (e.g. [ML^{-2}]), fractions, roots, compositions, powers, subscripts, vectors, Greek symbols, integrals, limits, and chemical expressions cleanly using inline KaTeX LaTeX delimiters $...$ (convert any input "\\(...\\)" or "\\[...\\]" inside MCQ options or inline text into inline "$...$" so options stay single-line and crisp; reserve "$$...$$" only for standalone display equations inside prompts or explanations).
   - Example: "(g ∘ f)(x) = 3x + 2, f(x) = x^2" -> "$(g \\circ f)(x) = 3x + 2$, $f(x) = x^2$". Example option: "\\[ML^{-2}\\]" -> "$[ML^{-2}]$".
   - Fractions: "a/b" in algebraic expressions -> "$\\frac{a}{b}$", roots "√(x^2+1)" -> "$\\sqrt{x^2+1}$", scientific notation "3×10^8" -> "$3 \\times 10^8$".
   - Preserve ALL Bengali text, phrasing, numerical constants, and scientific values verbatim without altering their meaning. If the source question is in Bengali, keep "prompt" in Bengali (with $...$ math) and also set "promptBn" to that Bengali text — do NOT translate Bengali stems into English.
   - Clean messy numbering prefixes ("1.", "১৩.", "প্রশ্ন ১:", "(ক)", "খ)", "(A)") from stems and options.

2. STRICT ANSWER VERIFICATION (NEVER AUTO-VERIFY UNCERTAIN ANSWERS):
   - NEVER solve the question using your own knowledge to fill in a missing answer! Even for basic facts (like F = ma or 2+2=4), if the source text or provided Answer Key does NOT explicitly state the answer for that question, you MUST set "correctIndex" = -1 and "answerConfidence" = "uncertain".
   - ONLY when the source or provided Answer Key explicitly specifies the correct answer (e.g. "Ans: b", "উত্তর: (গ)", "Correct: C", checkmark ✓, highlighted/asterisked option, or matching number in the Answer Key / উত্তরমালা section), set "correctIndex" (0=A/ক, 1=B/খ, 2=C/গ, 3=D/ঘ) AND set "answerConfidence" = "explicit".
   - If the correct answer is NOT explicitly given in the input OR is ambiguous/conflicting, you MUST set "correctIndex" = -1, set "answerConfidence" = "uncertain", and add a clear warning to "validationWarnings" (e.g. "Answer key not explicitly provided in source; manual review required.").

3. NEVER INVENT MISSING OPTIONS:
   - Extract the 4 MCQ options in order (A/ক, B/খ, C/গ, D/ঘ).
   - If fewer than 4 options exist or the stem is incomplete, set "isIncomplete" = true, pad missing slots with "", and add a warning in "validationWarnings".

4. EXPLANATIONS:
   - If an explanation/solution is present in the source or Answer Key, extract and format its math with $...$ into "explanationEn" / "explanationBn".
   - If no explanation is in the source AND "answerConfidence" is "explicit" (with valid correctIndex 0..3), provide a concise, mathematically accurate solution in "explanationBn" (natural academic Bengali) and/or "explanationEn".
   - If "answerConfidence" is "uncertain", leave "explanationEn" and "explanationBn" as "" (do NOT invent an explanation for an unverified answer).

5. CLASSIFICATION & METADATA:
   - Detect "subjectId" strictly from: "physics" | "chemistry" | "math" | "biology" | "english" | "ict" | "gk" (fallback: "${params.defaultSubjectId ?? 'physics'}").
   - Detect "admissionCategory" strictly from: "GST" | "DU Ka" | "DU Kha" | "Rajshahi University" | "Jahangirnagar University" | "Chittagong University" | "Medical" | "Engineering" | "Other" (use "DU Ka" for Dhaka University Ka/A Unit Science: Physics, Chemistry, Math, Biology, ICT; use "DU Kha" for Dhaka University Kha/B Unit Arts/Humanities: Bangla, English, GK; fallback: "${defaultCategory}").
   - Detect "universityTag" matching the category/university (e.g. "BUET", "DU Ka", "DU Kha", "Medical", "CKRUET", "GST", "Rajshahi University", "Jahangirnagar University", "Chittagong University", "Engineering", "Other").
   - Detect "chapter", "topic", "difficulty" ("Foundation" | "Standard" | "Admission Hard"), "sourceName", and "sourceYear" from input or hint "${params.sourceHint ?? ''}".`;

    const responseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          subjectId: { type: Type.STRING },
          chapter: { type: Type.STRING },
          topic: { type: Type.STRING },
          universityTag: { type: Type.STRING },
          admissionCategory: { type: Type.STRING },
          difficulty: { type: Type.STRING },
          prompt: { type: Type.STRING },
          promptBn: { type: Type.STRING },
          rawOriginal: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          correctIndex: { type: Type.INTEGER },
          answerConfidence: { type: Type.STRING },
          isIncomplete: { type: Type.BOOLEAN },
          reviewReason: { type: Type.STRING },
          validationWarnings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          explanationEn: { type: Type.STRING },
          explanationBn: { type: Type.STRING },
          sourceName: { type: Type.STRING },
          sourceYear: { type: Type.STRING },
        },
        required: [
          'subjectId',
          'chapter',
          'topic',
          'universityTag',
          'admissionCategory',
          'difficulty',
          'prompt',
          'rawOriginal',
          'options',
          'correctIndex',
          'answerConfidence',
          'isIncomplete',
          'reviewReason',
          'validationWarnings',
          'explanationEn',
          'explanationBn',
          'sourceName',
          'sourceYear',
        ],
      },
    };

    const allExtracted: RawExtractedQuestion[] = [];

    if (params.pdfBuffer && !params.text?.trim()) {
      const response = await generateContentResilient(ai, {
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: params.pdfBuffer.toString('base64'),
                },
              },
              {
                text: 'Extract and structure EVERY MCQ from the attached PDF strictly following all accuracy and LaTeX formatting rules.',
              },
            ],
          },
        ],
        config: {
          systemInstruction: instruction,
          responseMimeType: 'application/json',
          responseSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        },
      });
      const parsed = JSON.parse((response.text ?? '[]').trim()) as RawExtractedQuestion[];
      if (Array.isArray(parsed)) allExtracted.push(...parsed);
    } else {
      const chunks = splitTextIntoQuestionChunks(params.text || '');
      const processChunk = async (chunkText: string, idx: number): Promise<RawExtractedQuestion[]> => {
        const parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        > = [];

        if (idx === 0 && params.pdfBuffer) {
          parts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: params.pdfBuffer.toString('base64'),
            },
          });
        }
        parts.push({
          text: `Batch ${idx + 1} of ${chunks.length}. Extract and structure EVERY MCQ in this chunk strictly following all accuracy, rawOriginal preservation, and KaTeX LaTeX rules (keep generated explanations concise, 1-2 sentences):\n\n${chunkText}`,
        });

        const response = await generateContentResilient(ai, {
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: instruction,
            responseMimeType: 'application/json',
            responseSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        const parsed = JSON.parse((response.text ?? '[]').trim()) as RawExtractedQuestion[];
        return Array.isArray(parsed) ? parsed : [];
      };

      // Run up to 3 chunks concurrently to handle 20–50+ question pastes rapidly
      const CONCURRENCY = 3;
      for (let start = 0; start < chunks.length; start += CONCURRENCY) {
        const slice = chunks.slice(start, start + CONCURRENCY);
        const batchResults = await Promise.all(
          slice.map((chunkText, offset) => processChunk(chunkText, start + offset))
        );
        for (const items of batchResults) {
          allExtracted.push(...items);
        }
      }
    }

    logAiUsage({
      feature: 'AI Question Importer',
      model: MODEL_NAME,
      status: 'success',
      latencyMs: Date.now() - started,
      summary: `AI Question Builder extracted ${allExtracted.length} question(s)`,
    });

    return allExtracted;
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    logAiUsage({
      feature: 'AI Question Importer',
      model: MODEL_NAME,
      status: code === 'AI_NOT_CONFIGURED' ? 'not_configured' : 'error',
      latencyMs: Date.now() - started,
      summary: (err as Error).message.slice(0, 90),
    });
    throw err;
  }
}
