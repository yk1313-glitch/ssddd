const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000; // Порт из переменной окружения или 4000
const TOKEN = process.env.TOKEN;

// Проверка, загружен ли токен
if (!TOKEN) {
   console.error('Ошибка: Токен не найден. Убедитесь, что файл .env содержит переменную TOKEN.');
   process.exit(1);
}

// Загружаем данные из JSON файла
let bot1Prompt;
try {
   bot1Prompt = JSON.parse(fs.readFileSync('./prompts/fuck.json', 'utf8'));
} catch (error) {
   console.error('Ошибка при чтении JSON файла:', error.message);
   process.exit(1);
}

const allowedOrigins = ['https://fuckai.world'];

app.set('trust proxy', true); // Настройка для работы за прокси

// Middleware CORS
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

// Middleware для обработки тела запросов
app.use(bodyParser.json());

// Настройка ограничения частоты запросов
const limiter = rateLimit({
   windowMs: 1 * 60 * 1000, // Окно в 1 минуту
   max: 60, // Максимум 60 запросов с одного IP
   message: 'Too many requests from this IP, please try again later.'
});
app.use('/chat', limiter);

// Обработчик POST-запроса на /chat
app.post('/chat', async (req, res) => {
   try {
      const { messages } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
         return res.status(400).json({ error: 'Invalid messages format. Must be a non-empty array.' });
      }

      const { description, personality, instruction, example_messages } = bot1Prompt;

      // Очищаем HTML-теги из сообщений
      const cleanedMessages = messages.map((msg) =>
         msg.message.replace(/<.*?>/g, '').replace(/^You:\s*/, '').trim()
      );

      // Конвертируем сообщения в формат OpenAI API
      const chatHistory = cleanedMessages.map((content, index) => ({
         role: index % 2 === 0 ? 'user' : 'assistant',
         content
      }));

      // Ограничиваем историю до последних 10 сообщений
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

      // Отправка запроса в OpenAI API
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
      console.error('Ошибка при обработке запроса:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
   }
});

// Запуск сервера
app.listen(PORT, () => {
   console.log(`Server is running on http://localhost:${PORT}`);
});
