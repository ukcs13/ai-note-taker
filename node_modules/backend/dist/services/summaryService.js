"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSummary = void 0;
const openai_1 = __importDefault(require("openai"));
const prismaClient_1 = __importDefault(require("../prismaClient"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const generateSummary = async (meetingId) => {
    const transcripts = await prismaClient_1.default.transcript.findMany({
        where: { meeting_id: meetingId },
        orderBy: { timestamp: 'asc' },
    });
    if (transcripts.length === 0) {
        return {
            meeting_id: meetingId,
            content: 'No transcripts found. The bot may not have joined or no conversation was recorded.',
            created_at: new Date(),
        };
    }
    const conversation = transcripts
        .map((t) => `${t.speaker}: ${t.text}`)
        .join('\n');
    const prompt = `
    You are an expert meeting note-taker. Summarize the following meeting transcript.
    Include:
    - Full meeting summary
    - Key discussion points
    - Action items

    Transcript:
    ${conversation}
  `;
    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-3.5-turbo',
        });
        const content = completion.choices[0].message.content || 'No summary generated.';
        const summary = await prismaClient_1.default.summary.create({
            data: {
                meeting_id: meetingId,
                content,
            },
        });
        return summary;
    }
    catch (error) {
        console.error('OpenAI API Error:', error?.message || error);
        throw new Error('OpenAI API request failed: ' + (error?.message || 'Unknown error'));
    }
};
exports.generateSummary = generateSummary;
