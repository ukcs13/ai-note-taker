# AI Note Taker

A powerful, real-time meeting assistant that joins your Google Meet calls, transcribes the conversation, and generates AI-powered summaries.

## Features

- **Real-time Transcription**: Captures live captions from Google Meet with speaker detection.
- **AI Summaries**: Generates comprehensive meeting summaries using OpenAI (GPT-3.5/4).
- **Modern Dashboard**: Manage your meetings, view past transcripts, and create new sessions.
- **Live Meeting View**: Watch the transcription happen in real-time with a clean, chat-like interface.
- **Automated Bot**: A headless browser bot that automatically joins meetings and handles the recording.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript, Prisma (ORM)
- **Database**: PostgreSQL
- **Bot**: Playwright (Headless Browser Automation)
- **AI**: OpenAI API

## Project Structure

- `/src/frontend`: React application for the user interface.
- `/src/backend`: Express server handling API requests and database interactions.
- `/src/bot`: The automation script that joins meetings and scrapes captions.

## Prerequisites

- Node.js (v18+)
- PostgreSQL Database
- OpenAI API Key

## Getting Started

See [QUICKSTART.md](./QUICKSTART.md) for step-by-step setup instructions.
