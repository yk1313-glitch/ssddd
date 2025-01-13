const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
   console.error('Error: TOKEN is missing. Please set it in the .env file.');
   process.exit(1);
}

// Load JSON prompt
let bot1Prompt;
try {
   bot1Prompt = JSON.parse(fs.readFileSync('./prompts/fuck.json', 'utf8'));
} catch (error) {
   console.error('Error reading JSON file:', error.message);
   process.exit(1);
}

// Allowed origins
const allowedOrigins = ['https://fuckai.world'];

app.use(
   cors({
      origin: (origin, callback) => {
         if (
            !origin || 
            origin.startsWith('http://localhost') || 
            origin.startsWith('http://127.0.0.1') || 
            allowedOrigins.includes(origin)
         ) {
            callback(null, true);
         } else {
            callback(new Error('Not allowed by CORS'));
         }
      }
   })
);

app.use(bodyParser.json());

// Set up rate limiting
const limiter = rateLimit({
   windowMs: 1 * 60 * 1000, // 1-minute window
   max: 60, // Limit each IP to 60 requests per window
   message: 'Too many requests from this IP, please try again later.',
   keyGenerator: (req) => req.ip // Ensure proper IP is used as the key
});
app.use('/chat', limiter);

// Disable trust proxy or set it securely
app.set('trust proxy', false); // Change to true only if behind a secure proxy

// Chat endpoint
app.post('/chat', async (req, res) => {
   try {
      const { messages } = req.body;

      // Validate incoming messages
      if (!Array.isArray(messages) || messages.length === 0) {
         return res.status(400).json({ error: 'Invalid messages format. Must be a non-empty array.' });
      }

      const { description, personality, instruction, example_messages } = bot1Prompt;

      // Clean HTML tags from messages
      const cleanedMessages = messages.map((msg) =>
         msg.message.replace(/<.*?>/g, '').replace(/^You:\s*/, '').trim()
      );

      // Convert messages to OpenAI API format
      const chatHistory = cleanedMessages.map((content, index) => ({
         role: index % 2 === 0 ? 'user' : 'assistant',
         content
      }));

      // Limit chat history to the last 10 messages
      const trimmedHistory = chatHistory.slice(-10);

      const promptMessages = [
         {
            role: 'system',
            content: `
Character Overview:
- Description: ${description}
- Personality Traits: ${personality.join(', ')}

Instructions:
- Response Style: ${instruction.response_style}
- Emojis: ${instruction.emojis.join(', ')}
- Language: ${instruction.language}
- Tone: ${instruction.tone}
- Slang: ${instruction.slang.join(', ')}
- Positive Responses: ${instruction.positive_responses.join(', ')}
- Negative Responses: ${instruction.negative_responses.join(', ')}

Example Messages:
${example_messages.map((msg) => `- ${msg}`).join('\n')}
            `
         },
         ...trimmedHistory
      ];

      // Send request to OpenAI API
      const response = await axios.post(
         'https://api.openai.com/v1/chat/completions',
         {
            model: 'gpt-3.5-turbo',
            messages: promptMessages
         },
         {
            headers: {
               Authorization: `Bearer ${TOKEN}`,
               'Content-Type': 'application/json'
            }
         }
      );

      const botReply = response.data.choices[0].message.content.trim();
      res.json({ reply: botReply });
   } catch (error) {
      console.error('Error processing request:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
   }
});

// Start server
app.listen(PORT, () => {
   console.log(`Server is running on http://localhost:${PORT}`);
});
