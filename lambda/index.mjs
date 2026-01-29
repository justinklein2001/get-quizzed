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
  if (fs.existsSync(DB_PATH)) return; 
  fs.mkdirSync(DB_PATH, { recursive: true });

  console.log("📥 Downloading Knowledge Base...");
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

// 3. GENERATE QUESTION
async function generateQuestion(context, type) {
  const prompt = `
You are a senior technical interviewer.
Context:
${context}

Task: Generate 1 multiple-choice question based strictly on the context above.
Type: ${type} (e.g., LeetCode conceptual, Resume deep dive, or Technical knowledge).
Return ONLY JSON. Format:
{
  "question": "Question text",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "answer": "A) ...",
  "explanation": "Brief explanation"
}`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
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

    // B. GENERATE NEW QUIZ
    console.log("⚡ Generating new quiz...");
    await downloadDatabase();
    const db = await lancedb.connect(DB_PATH);
    const table = await db.openTable("knowledge_base");
    const queryVec = await getRandomVector();

    // Fetch Candidates
    const leetcodeRows = await table.search(queryVec).filter("category = 'leetcode'").limit(5).execute();
    const resumeRows = await table.search(queryVec).filter("category = 'resume'").limit(5).execute();
    const noteRows = await table.search(queryVec).filter("category = 'note'").limit(5).execute();

    // Pick Randoms
    const lc = leetcodeRows[Math.floor(Math.random() * leetcodeRows.length)];
    const res = resumeRows[Math.floor(Math.random() * resumeRows.length)];
    const note = noteRows[Math.floor(Math.random() * noteRows.length)];

    if (!lc || !res || !note) throw new Error("Insufficient data in Vector DB");

    // Generate AI Questions
    const [q1, q2, q3] = await Promise.all([
      generateQuestion(lc.text, "LeetCode Strategy"),
      generateQuestion(res.text, "Resume Experience"),
      generateQuestion(note.text, "Technical Knowledge")
    ]);

    const quiz = {
      date: today,
      leetcode: {
        ...JSON.parse(lc.text), // Original LeetCode JSON
        ai_question: q1
      },
      resume: {
        context: res.metadata,
        ai_question: q2
      },
      technical: {
        context: note.metadata,
        ai_question: q3
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
