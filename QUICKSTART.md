# Quick Start Guide

Follow these steps to get the AI Note Taker up and running on your local machine.

## 1. Prerequisites

Ensure you have the following installed:
- **Node.js** (v18 or higher)
- **PostgreSQL** (running and accessible)
- **npm** (comes with Node.js)

## 2. Installation

Navigate to the project root and install dependencies for all parts of the application.

### Backend
```bash
cd src/backend
npm install
```

### Frontend
```bash
cd ../frontend
npm install
```

### Bot
```bash
cd ../bot
npm install
npx playwright install chromium
```

## 3. Configuration

### Backend Environment
Create a `.env` file in `src/backend`:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/ainotetaker?schema=public"
PORT=3000
OPENAI_API_KEY="your-openai-api-key"
```

### Bot Environment
Create a `.env` file in `src/bot` (optional, but good for defaults):
```env
BACKEND_URL="http://localhost:3000"
HEADLESS=false  # Set to true for production/background mode
```

## 4. Database Setup

Initialize the database schema using Prisma.

```bash
cd src/backend
npx prisma migrate dev --name init
```

## 5. Running the Application

You need to run the Backend and Frontend in separate terminals.

### Terminal 1: Backend
```bash
cd src/backend
npm run dev
```

### Terminal 2: Frontend
```bash
cd src/frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`.

## 6. Usage

1.  Open `http://localhost:5173` in your browser.
2.  Enter a Google Meet URL (e.g., `https://meet.google.com/abc-defg-hij`).
3.  Click **"Join Meeting"**.
4.  The bot will launch (a browser window will open if `HEADLESS=false`) and join the meeting.
    *   *Note: You may need to manually allow microphone access or admit the bot if you are not logged in.*
5.  Ensure **Captions** are turned on in the Google Meet window (the bot tries to do this automatically).
6.  Watch the transcripts appear live on your dashboard!
7.  Click **"Refresh Summary"** to generate an AI summary of the conversation.
