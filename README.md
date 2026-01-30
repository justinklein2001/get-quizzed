# Get Quizzed
## Author: Justin Klein
## Last Updated: January 30th, 2026

A serverless, Retrieval-Augmented Generation (RAG) powered application designed to simulate a "tough Senior Technical Interviewer." It helps users practice for intermediate/senior-level software engineering roles by generating daily technical drills based on their own notes, resume, and LeetCode history.

## 🏗 Architecture

This project leverages a fully serverless architecture on AWS, ensuring scalability and cost-efficiency.

-   **Frontend:** [Next.js](https://nextjs.org/) (React) hosted on Vercel/AWS Amplify.
-   **Backend:** AWS Lambda (Node.js) serving as the API and orchestration layer.
-   **Database:**
    -   **LanceDB (S3):** A serverless vector database used for storing and retrieving embeddings of notes, resumes, and LeetCode problems.
    -   **DynamoDB:** Stores daily quiz history and user progress.
-   **AI/ML:**
    -   **Amazon Bedrock (Claude 3.5 Sonnet):** Generates questions, evaluates answers, and provides senior-level feedback.
    -   **Amazon Titan v2:** Generates text embeddings for vector search.
-   **Auth:** AWS Cognito for secure user authentication and admin access control.

## 🚀 Features

-   **Daily Drill:** Automatically generates a unique set of questions every day based on your personalized knowledge base.
-   **Personalized Context:** Ingests your markdown notes, resume, and LeetCode solutions to ask relevant questions.
-   **Multi-Format Questions:**
    -   **LeetCode Strategy:** Conceptual questions on algorithms found in your history (no coding, just strategy).
    -   **Resume Deep Dive:** Tough questions probing your specific experience and project trade-offs.
    -   **Technical Knowledge:** System design and concept verification based on your study notes.
-   **Senior-Level Feedback:** Submissions are graded by an AI persona that demands depth, clarity, and architectural understanding, offering actionable tips for improvement.
-   **Consistency Tracking:** A GitHub-style contribution graph to track your daily practice streak.

## 📂 Project Structure

```
/
├── frontend/       # Next.js application (UI/UX)
└── lambda/         # Backend logic (Question generation, feedback, RAG)
```
## 🛠 Setup & Deployment

### Prerequisites

-   Node.js (v22+)
-   AWS Account with Bedrock access enabled (Claude 3.5 Sonnet, Titan Embeddings v2)
-   AWS CLI configured

### Backend (Lambda)

1.  Navigate to the `lambda` directory.
2.  Install dependencies: `npm install`
3.  Deploy the function to AWS Lambda (ensure environment variables `KB_BUCKET_NAME` and `HISTORY_TABLE` are set).

### Frontend

1.  Navigate to the `frontend` directory.
2.  Install dependencies: `npm install`
3.  Create a `.env.local` file with your API URL and Cognito details:
    ```
    NEXT_PUBLIC_API_URL=https://your-api-gateway-url.com
    NEXT_PUBLIC_AWS_PROJECT_REGION=us-east-1
    NEXT_PUBLIC_AWS_COGNITO_IDENTITY_POOL_ID=...
    NEXT_PUBLIC_AWS_USER_POOLS_ID=...
    NEXT_PUBLIC_AWS_USER_POOLS_WEB_CLIENT_ID=...
    ```
4.  Run locally: `npm run dev`

## 🧠 The "Interviewer" Persona

The AI is prompted to act as a **Senior Technical Interviewer**. It doesn't just check for correct answers; it looks for:
-   **Trade-off analysis:** Why did you choose X over Y?
-   **Scalability:** How does this handle 1M users?
-   **Communication:** Are you concise and confident?
