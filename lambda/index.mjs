import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import * as lancedb from "@lancedb/lancedb";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

// CLIENTS
const s3 = new S3Client({ region: "us-east-1" });
const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });
const ddbClient = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(ddbClient);

// CONFIG
const DB_PATH = "/tmp/lancedb";
const BUCKET_NAME = process.env.KB_BUCKET_NAME;
const TABLE_NAME = process.env.HISTORY_TABLE;

// 1. DATABASE SYNC
async function downloadDatabase() {
  const tablePath = path.join(DB_PATH, "knowledge_base.lance");
  if (fs.existsSync(tablePath)) {
    console.log("Database already exists at:", tablePath);
    return;
  }
  
  // Clean up potential partial downloads
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH, { recursive: true, force: true });
  fs.mkdirSync(DB_PATH, { recursive: true });

  console.log("Downloading Knowledge Base...");
  const listCmd = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: "lancedb/" });
  const { Contents } = await s3.send(listCmd);
  if (!Contents) return;

  for (const file of Contents) {
    if (file.Key.endsWith("/")) continue;
    const localPath = path.join("/tmp", file.Key);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: file.Key });
    const response = await s3.send(getCmd);
    await pipeline(response.Body, fs.createWriteStream(localPath));
  }
}

// 2. HELPER: Get Random Vector (Simulated)
// Instead of true random, embed a random word to "poke" different parts of the vector space
async function getRandomVector() {
  const words = ["algorithm", "system design", "database", "network", "security", "react", "aws", "deploy", "scale"];
  const randomWord = words[Math.floor(Math.random() * words.length)];
  
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: "amazon.titan-embed-text-v2:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({ inputText: randomWord, dimensions: 1024, normalize: true })
  }));
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.embedding;
}

// HELPER: Clean LLM Response
function cleanResponse(text) {
  // 1. Extract JSON from Markdown
  let cleanText = text;
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    cleanText = jsonMatch[1];
  } else {
    const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch) {
      cleanText = codeMatch[1];
    }
  }

  // 2. Extract strictly between { and }
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // 3. Handle "Bad control character" error - Replace newlines with space.
    console.log("JSON Parse failed, attempting to sanitize control characters...");
    const sanitized = cleanText.replace(/[\n\r\t]/g, " ");
    try {
      return JSON.parse(sanitized);
    } catch (e2) {
      console.error("Failed to parse JSON after sanitization. Raw text:", text);
      throw e; // Throw original error
    }
  }
}

// 3. GENERATE QUESTION (MCQ)
async function generateMCQ(context, type) {
  const prompt = `
You are a tough Senior Technical Interviewer at a top-tier tech company.
Your goal is to test if the candidate deeply understands the concepts and can apply them like an Associate/Senior engineer.
Context:
${context}

Task: Generate 1 challenging multiple-choice question based strictly on the context above. The question should test nuance, trade-offs, or best practices, not just basic definitions.
Type: ${type} (e.g., LeetCode conceptual, Resume deep dive, or Technical knowledge).
Return ONLY JSON. Format:
{
  "question": "Question text",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "answer": "A) ...",
  "explanation": "Detailed explanation of why the correct answer is best and why others are suboptimal."
}`;

  console.log("generateMCQ - BEDROCK_MODEL_ID:", process.env.BEDROCK_MODEL_ID);
  if (!process.env.BEDROCK_MODEL_ID) throw new Error("Missing BEDROCK_MODEL_ID env var");

  // Llama 3 Formatting
  const llamaPrompt = `
<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      prompt: llamaPrompt,
      max_gen_len: 1024,
      temperature: 0.5,
      top_p: 0.9
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  // Llama 3 returns { generation: "..." }
  return cleanResponse(raw.generation);
}

// 4. GENERATE QUESTION (Open Ended - Legacy/Technical)
async function generateOpenEnded(context, type) {
  const prompt = `
You are a tough Senior Technical Interviewer at a top-tier tech company.
Your goal is to test if the candidate can articulate their experience and technical concepts with the depth and confidence of a Senior engineer.
Context:
${context}

Task: Generate 1 challenging open-ended behavioral or technical question based on the context. 
- If this is a Resume question, ask about a specific challenge or situation that requires a STAR (Situation, Task, Action, Result) response, probing for their specific contribution and impact.
- If this is a Technical question, require the candidate to explain "why" and "how", discussing architectural trade-offs, scaling implications, or specific problem-solving methodologies.

Type: ${type}.
Return ONLY JSON. Format:
{
  "question": "Question text",
  "guidelines": "Key technical points, architectural considerations, and STAR format elements expected for a Senior-level answer."
}`;

  console.log("generateOpenEnded - BEDROCK_MODEL_ID:", process.env.BEDROCK_MODEL_ID);

  const llamaPrompt = `
<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      prompt: llamaPrompt,
      max_gen_len: 1024,
      temperature: 0.5,
      top_p: 0.9
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  return cleanResponse(raw.generation);
}

// 4. GENERATE QUESTIONS (STAR Drill - 5 Questions)
async function generateSTARQuestions(context) {
  const prompt = `
You are a tough Senior Technical Interviewer.
Context:
${context}

Task: Generate 5 distinct, challenging behavioral or technical interview questions based on the candidate's resume/experience.
- The questions should target different competencies (e.g., System Design, Conflict Resolution, Leadership, Technical Deep Dive, Delivery/Execution).
- Each question must be answerable using the STAR method.

Return ONLY JSON. Format:
{
  "questions": [
    {
      "id": "q1",
      "category": "Leadership", 
      "question": "Tell me about a time you..."
    },
    ... (4 more)
  ]
}`;

  console.log("generateSTARQuestions - BEDROCK_MODEL_ID:", process.env.BEDROCK_MODEL_ID);
  
  const llamaPrompt = `
<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      prompt: llamaPrompt,
      max_gen_len: 2048,
      temperature: 0.7,
      top_p: 0.9
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  const result = cleanResponse(raw.generation);
  return result.questions || [];
}

// 5. GENERATE CODING CHALLENGE (Technical - 3 Questions)
async function generateTechnicalCodingQuestions(context) {
  const prompt = `
You are a Lead Software Engineer conducting a technical coding interview.
Context:
${context}

Task: Generate 3 distinct, practical coding challenges based on the technical concepts in the context (e.g., if context is about NestJS, ask for a Guard/Interceptor/Controller; if React, a Hook/Component).
- Each question must require writing actual code (TypeScript/JavaScript/Python).
- Provide a starting code snippet for each.

Return ONLY JSON. Format:
{
  "questions": [
    {
      "id": "t1",
      "title": "Implement AuthGuard",
      "description": "Create a NestJS guard that...",
      "language": "typescript",
      "starter_code": "import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';\\n\\n@Injectable()\\nexport class AuthGuard implements CanActivate {\\n  canActivate(context: ExecutionContext): boolean {\\n    // TODO: Implement logic\\n    return true;\\n  }\\n}"
    },
    ... (2 more)
  ]
}`;

  console.log("generateTechnicalCodingQuestions - BEDROCK_MODEL_ID:", process.env.BEDROCK_MODEL_ID);
  
  const llamaPrompt = `
<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      prompt: llamaPrompt,
      max_gen_len: 2048,
      temperature: 0.5,
      top_p: 0.9
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  const result = cleanResponse(raw.generation);
  return result.questions || [];
}

// 6. VALIDATE CODE
async function validateCode(payload) {
  const { question, userAnswer, language } = payload;
  
  const prompt = `
You are a Senior Engineer reviewing a Junior's pull request / interview code.
Task: "Review this code implementation against the requirements."

Question: "${question}"
Language: "${language}"
Candidate Code:
\`\`\`${language}
${userAnswer}
\`\`\`

Analysis Required:
1. **Correctness**: Does it solve the problem? Does it compile/run logically?
2. **Best Practices**: Is it idiomatic? (e.g., using proper hooks in React, decorators in NestJS).
3. **Security/Edge Cases**: Did they handle nulls, errors, or security gaps?

Return ONLY JSON. Format:
{
  "score": 8, // 0-10
  "feedback": "The logic is sound, but you missed...",
  "better_solution": "Here is a more idiomatic way to write it:\\n\`\`\`typescript\\n...code...\\n\`\`\`" (Only if score < 10)
}`;

  const llamaPrompt = `
<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      prompt: llamaPrompt,
      max_gen_len: 1024,
      temperature: 0.3, // Lower temp for code analysis
      top_p: 0.9
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  return cleanResponse(raw.generation);
}

// 7. VALIDATE STAR STEP
async function validateSTARStep(payload) {
  const { question, step, userAnswer } = payload;
  
  const stepDefinitions = {
    'S': 'Situation: Set the scene and give the necessary details of your example.',
    'T': 'Task: Describe what your responsibility was in that situation.',
    'A': 'Action: Explain exactly what steps you took to address it.',
    'R': 'Result: Share what outcomes your actions achieved.'
  };

  const prompt = `
You are a strict Technical Interview Coach.
The candidate is answering the question: "${question}"
They are currently providing the **${step} (${stepDefinitions[step]})** portion of the STAR method.

Candidate's Input for ${step}: "${userAnswer}"

Task:
1. Score this specific section (0-10) based on clarity, specificity, and impact.
   - Score < 8 if it's vague, generic, or lacks "I" statements (for Action).
2. If score < 8, provide a **Better Version** of this specific section. Rewrite their answer to be punchier, more professional, and more impressive, while keeping their core facts.
3. Provide brief, actionable feedback.

Return ONLY JSON. Format:
{
  "score": 8,
  "feedback": "Good context, but...",
  "better_version": "..." (Only if score < 8, else null)
}`;

  const llamaPrompt = `
<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      prompt: llamaPrompt,
      max_gen_len: 1024,
      temperature: 0.5,
      top_p: 0.9
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  return cleanResponse(raw.generation);
}

// 8. GENERATE FEEDBACK (Legacy/General)
async function generateFeedback(payload) {
  const { question, userAnswer, type, context } = payload;
  
  const prompt = `
You are a tough Senior Technical Interviewer at a top-tier tech company.
The candidate has answered a ${type} question.
Question: "${question}"
Candidate Answer: "${userAnswer}"
${type === 'MCQ' ? `Correct Answer: "${context.correctAnswer}"` : `Grading Guidelines: "${context.guidelines}"`}

Task: Evaluate the candidate's answer with the goal of mentoring them from an Associate level to a Senior Engineer level.
- If MCQ: explain the nuance behind the correct answer and why other options fall short.
- If Open-Ended: 
  1. Critique the use of the STAR method (Situation, Task, Action, Result). Did they clearly articulate their specific contribution (Action) and the measurable impact (Result)?
  2. Assess the technical depth. Did they discuss trade-offs, scalability, and "why" decisions were made?
  3. Provide specific, actionable feedback on how to rephrase or restructure the answer to sound more senior, authoritative, and impact-focused.

Return ONLY JSON. Format:
{
  "feedback": "Detailed feedback text...",
  "score": "X/10",
  "improvement_tips": ["Tip 1: Use STAR format more effectively...", "Tip 2: Quantify the result...", "Tip 3: Discuss trade-offs..."]
}`;

  // Llama 3 Formatting
  const llamaPrompt = `
<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      prompt: llamaPrompt,
      max_gen_len: 1024,
      temperature: 0.5,
      top_p: 0.9
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  // Llama 3 returns { generation: "..." }
  return cleanResponse(raw.generation);
}

export const handler = async (event) => {
  // DEBUG: Check environment variable
  console.log("Handler invoked.");
  console.log("Environment BEDROCK_MODEL_ID exists:", !!process.env.BEDROCK_MODEL_ID);
  
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } };
  }

  try {
    const route = event.routeKey || `${event.httpMethod} ${event.path}`; // Fallback

    // === ROUTE: POST /validate-star (New STAR Flow) ===
    if (route === "POST /validate-star") {
      const body = JSON.parse(event.body);
      // body: { date, questionId, step: 'S'|'T'|'A'|'R', userAnswer, questionText }
      
      const validation = await validateSTARStep(body);

      // Save progress if date is provided
      if (body.date && body.questionIndex !== undefined) {
         const updateExpr = `SET quiz.resume.questions[${body.questionIndex}].userProgress.${body.step} = :val`;
         
         await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { pk: "DAILY_QUIZ", sk: body.date },
          UpdateExpression: updateExpr,
          ExpressionAttributeValues: {
            ":val": {
              answer: body.userAnswer,
              score: validation.score,
              feedback: validation.feedback,
              better_version: validation.better_version
            }
          }
        }));
      }

      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify(validation)
      };
    }

    // === ROUTE: POST /validate-code (New Technical Coding Flow) ===
    if (route === "POST /validate-code") {
      const body = JSON.parse(event.body);
      // body: { date, questionIndex, userAnswer, question, language }
      
      const validation = await validateCode(body);

      // Save progress if date is provided
      if (body.date && body.questionIndex !== undefined) {
         const updateExpr = `SET quiz.technical.questions[${body.questionIndex}].userProgress = :val`;
         
         await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { pk: "DAILY_QUIZ", sk: body.date },
          UpdateExpression: updateExpr,
          ExpressionAttributeValues: {
            ":val": {
              answer: body.userAnswer,
              score: validation.score,
              feedback: validation.feedback,
              better_solution: validation.better_solution
            }
          }
        }));
      }

      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify(validation)
      };
    }

    // === ROUTE: POST /submit (Legacy/Technical Feedback) ===
    if (route === "POST /submit") {
      const body = JSON.parse(event.body);
      const { date, type, userAnswer } = body;
      const feedback = await generateFeedback(body);

      // SAVE TO HISTORY (If date provided)
      if (date) {
        // Map "Resume Experience" -> "resume", "Technical Knowledge" -> "technical"
        // Note: Resume flow is now handled by validate-star, but we keep this for Technical or legacy support
        const section = type === 'Resume Experience' ? 'resume' : 'technical';
        
        // For technical, we still use the single open_ended field for now, unless we want to STAR that too.
        // The requirement specifically said "5 of these questions for the resume".
        
        await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { pk: "DAILY_QUIZ", sk: date },
          UpdateExpression: `SET quiz.${section}.open_ended.user_answer = :ua, quiz.${section}.open_ended.feedback = :fb`,
          ExpressionAttributeValues: {
            ":ua": userAnswer,
            ":fb": feedback
          }
        }));
      }

      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify(feedback)
      };
    }

    // === ROUTE: GET /history (Public) ===
    if (route === "GET /history") {
      const { Items } = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "DAILY_QUIZ" },
        ScanIndexForward: false, // Newest first
        Limit: 7 // Get last 7 days
      }));

      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify(Items.map(i => i.quiz))
      };
    }

    // === ROUTE: POST /generate (Admin) ===
    // Fallback to generation logic if no specific route or explicit POST /generate
    
    // A. CHECK HISTORY (Idempotency)
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    let force = false;
    
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.force) force = true;
      } catch (e) {
        // ignore JSON parse error on body if it's not valid JSON
      }
    }

    if (force) {
      console.log("Force generation requested. Skipping cache check.");
    } else {
      const historyParams = {
        TableName: TABLE_NAME,
        Key: { pk: "DAILY_QUIZ", sk: today }
      };
      
      const { Item } = await ddb.send(new GetCommand(historyParams));
      if (Item) {
        console.log("Returning cached quiz for today.");
        return {
          statusCode: 200,
          headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
          body: JSON.stringify(Item.quiz)
        };
      }
    }

    // B. GENERATE NEW QUIZ
    console.log("⚡ Generating new quiz...");
    await downloadDatabase();
    const db = await lancedb.connect(DB_PATH);
    const table = await db.openTable("knowledge_base");
    
    // Fetch Candidates (Parallel & Independent Vectors)
    const [v1, v3] = await Promise.all([
      getRandomVector(),
      getRandomVector()
    ]);

    const [leetcodeResult, resumeResult, noteResult] = await Promise.all([
      table.search(v1).filter("category = 'leetcode'").limit(5).toArray(),
      table.search(v1).filter("category = 'resume'").limit(5).toArray(),
      table.search(v3).filter("category = 'note'").limit(5).toArray()
    ]);

    // Assign results
    const leetcodeRows = leetcodeResult;
    const resumeRows = resumeResult;
    const noteRows = noteResult;

    // Special Handling for Resume (Low Data Count)
    let finalResumeRows = resumeRows;
    if (resumeRows.length === 0) {
       console.log("Resume vector search returned 0. Fetching fallback...");
       finalResumeRows = await table.query().filter("category = 'resume'").limit(1).toArray();
    }

    // Pick Randoms
    const lc = leetcodeRows[Math.floor(Math.random() * leetcodeRows.length)];
    const res = finalResumeRows[Math.floor(Math.random() * finalResumeRows.length)];
    const note = noteRows[Math.floor(Math.random() * noteRows.length)];

    if (!lc || !res || !note) {
      throw new Error(`Insufficient data in Vector DB`);
    }

    // Generate AI Questions
    // CHANGED: Use generateSTARQuestions for resume
    // CHANGED: Use generateTechnicalCodingQuestions for technical
    const [q1, q2_mcq, q2_star, q3_mcq, q3_code] = await Promise.all([
      generateMCQ(lc.text, "LeetCode Strategy"),
      generateMCQ(res.text, "Resume Experience"),
      generateSTARQuestions(res.text), 
      generateMCQ(note.text, "Technical Knowledge"),
      generateTechnicalCodingQuestions(note.text)
    ]);

    const quiz = {
      date: today,
      leetcode: {
        problem: JSON.parse(lc.text),
        ai_question: q1
      },
      resume: {
        context: res.metadata,
        mcq: q2_mcq,
        questions: q2_star.map(q => ({
            ...q,
            userProgress: {
                S: null, T: null, A: null, R: null
            }
        }))
      },
      technical: {
        context: note.metadata,
        mcq: q3_mcq,
        questions: q3_code.map(q => ({
            ...q,
            userProgress: null // Will store { answer, score, feedback }
        }))
      }
    };

    // C. SAVE TO HISTORY
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: "DAILY_QUIZ",
        sk: today,
        quiz: quiz,
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days retention
      }
    }));

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify(quiz)
    };


  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message })
    };
  }
};
