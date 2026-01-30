import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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
    console.log("✅ Database already exists at:", tablePath);
    return;
  }
  
  // Clean up potential partial downloads
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH, { recursive: true, force: true });
  fs.mkdirSync(DB_PATH, { recursive: true });

  console.log("📥 Downloading Knowledge Base...");
  const listCmd = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: "lancedb/" });
  const { Contents } = await s3.send(listCmd);
  if (!Contents) return;

  for (const file of Contents) {
    if (file.Key.endsWith("/")) continue;
    // file.Key is like "lancedb/knowledge_base.lance/..."
    // We want it to be at "/tmp/lancedb/knowledge_base.lance/..."
    // Since DB_PATH is "/tmp/lancedb", path.join("/tmp", file.Key) works perfect.
    const localPath = path.join("/tmp", file.Key);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: file.Key });
    const response = await s3.send(getCmd);
    await pipeline(response.Body, fs.createWriteStream(localPath));
  }
}

// 2. HELPER: Get Random Vector (Simulated)
// Instead of true random, we embed a random word to "poke" different parts of the vector space
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

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  return JSON.parse(raw.content[0].text);
}

// 4. GENERATE QUESTION (Open Ended)
async function generateOpenEnded(context, type) {
  const prompt = `
You are a tough Senior Technical Interviewer at a top-tier tech company.
Your goal is to test if the candidate can articulate their experience and technical concepts with the depth and confidence of an Associate/Senior engineer.
Context:
${context}

Task: Generate 1 open-ended behavioral or technical question based on the context. The question should require the candidate to explain "why" and "how", discussing architectural trade-offs, scaling implications, or specific problem-solving methodologies.
Type: ${type}.
Return ONLY JSON. Format:
{
  "question": "Question text",
  "guidelines": "Key technical points, architectural considerations, and communication style expected for a Senior-level answer."
}`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  return JSON.parse(raw.content[0].text);
}

// 5. GENERATE FEEDBACK
async function generateFeedback(payload) {
  const { question, userAnswer, type, context } = payload;
  
  const prompt = `
You are a tough Senior Technical Interviewer.
The candidate has answered a ${type} question.
Question: "${question}"
Candidate Answer: "${userAnswer}"
${type === 'MCQ' ? `Correct Answer: "${context.correctAnswer}"` : `Grading Guidelines: "${context.guidelines}"`}

Task: Evaluate the candidate's answer.
- If MCQ: explain why their choice is right/wrong and the nuance behind the correct answer.
- If Open-Ended: critique the depth, clarity, and technical seniority of their response.
- Provide constructive, actionable feedback to help them sound like a Senior Engineer.

Return ONLY JSON. Format:
{
  "feedback": "Detailed feedback text...",
  "score": "X/10",
  "improvement_tips": ["Tip 1", "Tip 2", "Tip 3"]
}`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    })
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  return JSON.parse(raw.content[0].text);
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } };
  }

  try {
    const route = event.routeKey || `${event.httpMethod} ${event.path}`; // Fallback

    // === ROUTE: POST /submit (Feedback) ===
    if (route === "POST /submit") {
      const body = JSON.parse(event.body);
      const feedback = await generateFeedback(body);
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
      console.log("⚠️ Force generation requested. Skipping cache check.");
    } else {
      const historyParams = {
        TableName: TABLE_NAME,
        Key: { pk: "DAILY_QUIZ", sk: today }
      };
      
      const { Item } = await ddb.send(new GetCommand(historyParams));
      if (Item) {
        console.log("✅ Returning cached quiz for today.");
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
    
    // Debug: Check data count
    const rowCount = await table.countRows();
    console.log(`📊 Table 'knowledge_base' loaded with ${rowCount} rows.`);

    // Fetch Candidates (Parallel & Independent Vectors)
    const [v1, v3] = await Promise.all([
      getRandomVector(),
      getRandomVector()
    ]);
    console.log(`Debug: v1 length: ${v1?.length}, v3 length: ${v3?.length}`); // Log vector lengths

    const [leetcodeResult, resumeResult, noteResult] = await Promise.all([
      table.search(v1).filter("category = 'leetcode'").limit(5).toArray(),
      table.search(v1).filter("category = 'resume'").limit(5).toArray(),
      table.search(v3).filter("category = 'note'").limit(5).toArray()
    ]);

    // Assign results and log them
    const leetcodeRows = leetcodeResult;
    const resumeRows = resumeResult;
    const noteRows = noteResult;

    // Debugging logs for search results
    console.log(`Debug: leetcodeRows.length: ${leetcodeRows?.length}`);
    console.log(`Debug: resumeRows.length (initial): ${resumeRows?.length}`);
    console.log(`Debug: noteRows.length: ${noteRows?.length}`);

    // Special Handling for Resume (Low Data Count)
    // If vector search misses the single resume file, just grab any resume row
    let finalResumeRows = resumeRows;
    if (resumeRows.length === 0) {
       console.log("⚠️ Resume vector search returned 0. Fetching fallback...");
       finalResumeRows = await table.query().filter("category = 'resume'").limit(1).toArray();
       console.log(`Debug: finalResumeRows.length (after fallback): ${finalResumeRows.length}`);
    }

    // Pick Randoms
    const lc = leetcodeRows[Math.floor(Math.random() * leetcodeRows.length)];
    const res = finalResumeRows[Math.floor(Math.random() * finalResumeRows.length)];
    const note = noteRows[Math.floor(Math.random() * noteRows.length)];

    if (!lc || !res || !note) {
      const missing = [];
      if (!lc) missing.push("leetcode");
      if (!res) missing.push("resume");
      if (!note) missing.push("note");
      throw new Error(`Insufficient data in Vector DB for categories: ${missing.join(", ")}`);
    }

    // Generate AI Questions
    const [q1, q2_mcq, q2_open, q3_mcq, q3_open] = await Promise.all([
      generateMCQ(lc.text, "LeetCode Strategy"),
      generateMCQ(res.text, "Resume Experience"),
      generateOpenEnded(res.text, "Resume Experience"),
      generateMCQ(note.text, "Technical Knowledge"),
      generateOpenEnded(note.text, "Technical Knowledge")
    ]);

    const quiz = {
      date: today,
      leetcode: {
        problem: JSON.parse(lc.text), // Original LeetCode JSON nested
        ai_question: q1
      },
      resume: {
        context: res.metadata,
        mcq: q2_mcq,
        open_ended: q2_open
      },
      technical: {
        context: note.metadata,
        mcq: q3_mcq,
        open_ended: q3_open
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
