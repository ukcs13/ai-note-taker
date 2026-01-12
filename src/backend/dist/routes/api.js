"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const prismaClient_1 = __importDefault(require("../prismaClient"));
const summaryService_1 = require("../services/summaryService");
const router = (0, express_1.Router)();
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const generatingMeetings = new Set();
// Create a meeting
router.post('/meetings', async (req, res) => {
    try {
        const { meet_url } = req.body;
        const meeting = await prismaClient_1.default.meeting.create({
            data: {
                meet_url,
            },
        });
        // Spawn bot process
        const botPath = path_1.default.resolve(__dirname, '../../../bot');
        console.log(`Spawning bot from: ${botPath} for meeting: ${meeting.id}`);
        const botProcess = (0, child_process_1.spawn)('npm', ['run', 'start'], {
            cwd: botPath,
            env: { ...process.env, MEET_URL: meet_url, MEETING_ID: meeting.id },
            shell: true,
            detached: false, // Attach to parent to see logs
            stdio: 'inherit' // Pipe logs to main console
        });
        botProcess.unref();
        res.json(meeting);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create meeting' });
    }
});
// Get all meetings
router.get('/meetings', async (req, res) => {
    try {
        const meetings = await prismaClient_1.default.meeting.findMany({
            orderBy: { started_at: 'desc' },
            include: {
                summaries: true,
                transcripts: {
                    select: { id: true } // Only select ID to count them, avoid fetching huge text
                }
            },
        });
        res.json(meetings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch meetings' });
    }
});
// Get meeting details
router.get('/meetings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const meeting = await prismaClient_1.default.meeting.findUnique({
            where: { id },
            include: {
                transcripts: { orderBy: { timestamp: 'asc' } },
                summaries: true,
            },
        });
        if (!meeting)
            return res.status(404).json({ error: 'Meeting not found' });
        res.json(meeting);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch meeting' });
    }
});
// Add transcript
router.post('/transcripts', async (req, res) => {
    try {
        const { id, meeting_id, speaker, text, timestamp } = req.body;
        // Validate required fields
        if (!meeting_id || !speaker || !text) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        let transcript;
        if (id) {
            // Upsert using provided ID (client-side generated UUID)
            transcript = await prismaClient_1.default.transcript.upsert({
                where: { id },
                update: {
                    text,
                    timestamp: new Date(timestamp),
                },
                create: {
                    id,
                    meeting_id,
                    speaker,
                    text,
                    timestamp: new Date(timestamp),
                },
            });
        }
        else {
            // Fallback for requests without ID (backward compatibility)
            // Check for duplicates (simple deduplication)
            const lastTranscript = await prismaClient_1.default.transcript.findFirst({
                where: { meeting_id },
                orderBy: { id: 'desc' }, // Use ID for insertion order
            });
            if (lastTranscript && lastTranscript.text === text && lastTranscript.speaker === speaker) {
                // Duplicate detected, return existing
                return res.json(lastTranscript);
            }
            transcript = await prismaClient_1.default.transcript.create({
                data: {
                    meeting_id,
                    speaker,
                    text,
                    timestamp: new Date(timestamp),
                },
            });
        }
        res.json(transcript);
        // Deduplication: Remove older partial transcripts that are substrings of the new one
        try {
            const currentText = transcript.text.trim();
            if (currentText.length > 0) {
                // Find recent transcripts by same speaker to check for overlap
                const candidates = await prismaClient_1.default.transcript.findMany({
                    where: {
                        meeting_id,
                        speaker,
                        id: { not: transcript.id }, // Exclude current
                        timestamp: { gte: new Date(Date.now() - 60000) } // Look back 1 minute
                    }
                });
                const toDeleteIds = [];
                for (const t of candidates) {
                    const tText = t.text.trim();
                    // If the old transcript is a substring of the new one (e.g. "Hello" -> "Hello world")
                    // OR if the new one is a substring of the old one? No, we keep the latest update usually.
                    // But 'transcript' is the LATEST one we just saved.
                    // So if 't' (old) is part of 'currentText' (new), delete 't'.
                    if (tText.length < currentText.length && currentText.includes(tText)) {
                        toDeleteIds.push(t.id);
                    }
                    // Also handle the case where we have exact duplicates with different IDs (shouldn't happen often but good to clean)
                    else if (tText === currentText) {
                        toDeleteIds.push(t.id);
                    }
                }
                if (toDeleteIds.length > 0) {
                    console.log(`[Deduplication] Deleting ${toDeleteIds.length} partial/duplicate transcripts for meeting ${meeting_id}`);
                    await prismaClient_1.default.transcript.deleteMany({
                        where: { id: { in: toDeleteIds } }
                    });
                }
            }
        }
        catch (e) {
            console.error('Deduplication error:', e);
        }
        // Auto-generate summary every 5 minutes based on incoming transcripts
        try {
            // Prevent overlapping generations for the same meeting
            if (generatingMeetings.has(meeting_id))
                return;
            const [lastSummary, meeting] = await Promise.all([
                prismaClient_1.default.summary.findFirst({
                    where: { meeting_id },
                    orderBy: { created_at: 'desc' },
                }),
                prismaClient_1.default.meeting.findUnique({
                    where: { id: meeting_id },
                    select: { started_at: true },
                }),
            ]);
            const lastGeneratedAt = lastSummary?.created_at ?? meeting?.started_at ?? new Date(0);
            const now = Date.now();
            const timeSinceLast = now - new Date(lastGeneratedAt).getTime();
            // console.log(`[Auto-Summary Check] Meeting: ${meeting_id}, TimeSinceLast: ${timeSinceLast/1000}s, Threshold: ${FIVE_MINUTES_MS/1000}s`);
            if (timeSinceLast >= FIVE_MINUTES_MS) {
                console.log(`[Auto-Summary] Triggering generation for meeting ${meeting_id} after ${timeSinceLast / 1000}s`);
                generatingMeetings.add(meeting_id);
                // Fire-and-forget; do not block transcript ingestion
                (0, summaryService_1.generateSummary)(meeting_id)
                    .then((summary) => {
                    const summaryId = 'id' in summary ? summary.id : 'N/A';
                    console.log(`[Auto-Summary] Generated summary for meeting ${meeting_id} (ID: ${summaryId})`);
                })
                    .catch((e) => {
                    console.error('Auto summary generation failed:', e);
                })
                    .finally(() => {
                    generatingMeetings.delete(meeting_id);
                });
            }
        }
        catch (e) {
            // Non-fatal: auto-generation errors should not disrupt transcript ingestion
            console.error('Auto summary scheduling error:', e);
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save transcript' });
    }
});
// Generate summary
router.post('/meetings/:id/summary', async (req, res) => {
    try {
        const { id } = req.params;
        const summary = await (0, summaryService_1.generateSummary)(id);
        res.json(summary);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});
exports.default = router;
