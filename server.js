
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DB_FILE = './db.json';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PENDING_DIR = path.join(UPLOADS_DIR, 'pending_analysis');

// D-ID credentials from environment variables
const DID_API_KEY = process.env.DID_API_KEY || '';
const DID_CLIENT_KEY = process.env.DID_CLIENT_KEY || '';
const DID_AGENT_ID = process.env.DID_AGENT_ID || '';

async function ensureDirs() {
  try { await fs.access(UPLOADS_DIR); } catch { await fs.mkdir(UPLOADS_DIR); }
  try { await fs.access(PENDING_DIR); } catch { await fs.mkdir(PENDING_DIR); }
}

// Fixed: Enhanced multer storage to correctly route files and preserve extensions
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') cb(null, PENDING_DIR);
    else cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext || (file.fieldname === 'video' ? '.webm' : '')}`);
  }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

async function readDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return { users: [], reports: [], messages: [], schedules: [], healthLogs: [] };
  }
}

async function writeDB(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/did/config', (req, res) => {
  // 返回前端 SDK 初始化所需的凭证
  res.json({
    clientKey: DID_CLIENT_KEY,
    agentId: DID_AGENT_ID
  });
});

// --- Midnight Sync: Aggregated Multi-modal Sentiment Analysis ---
app.post('/api/admin/midnight-sync', async (req, res) => {
  try {
    const files = await fs.readdir(PENDING_DIR);
    const videoFiles = files.filter(f => f.startsWith('video-'));
    if (videoFiles.length === 0) return res.json({ message: 'No new recordings to analyze' });

    const userVideoMap = new Map();
    videoFiles.forEach(file => {
      // Filename format: video-userId-timestamp.webm
      const parts = file.split('-');
      if (parts.length > 1) {
        const userId = parts[1];
        if (!userVideoMap.has(userId)) userVideoMap.set(userId, []);
        userVideoMap.get(userId).push(file);
      }
    });

    // Fix: initialize GoogleGenAI inside handler per guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const db = await readDB();
    const newReports = [];

    for (const [userId, fileList] of userVideoMap.entries()) {
      const user = db.users.find(u => u.id === userId);
      const userName = user ? user.name : '用户';
      const userRole = user ? user.role : 'elderly';

      const videoParts = [];
      for (const file of fileList) {
        const filePath = path.join(PENDING_DIR, file);
        const videoData = await fs.readFile(filePath);
        videoParts.push({ inlineData: { data: videoData.toString('base64'), mimeType: "video/webm" } });
      }

      const prompt = `
        用户姓名：${userName}，角色身份：${userRole}。
        这些视频是该用户今天与AI数字人的对话片段。请作为家庭心理健康专家进行深度多模态分析：
        1. 综合观察全天的情绪波动。如果是老人，请特别留意孤独感、健康焦虑或认知状态；如果是小孩，请留意其好奇心、专注力和心情。
        2. 返回一个 JSON 报表，字段包括：
           - overallMood: 全天主导情绪 (String)
           - trend: 情绪演变趋势描述 (String)
           - summary: 全天心理状态深度总结 (String)
           - scores: { happiness, sadness, anger, fear } (0-100评分)
           - suggestions: 给家长的具体关怀建议 (String)。
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: [{ parts: [...videoParts, { text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallMood: { type: Type.STRING },
              trend: { type: Type.STRING },
              summary: { type: Type.STRING },
              scores: {
                type: Type.OBJECT,
                properties: {
                  happiness: { type: Type.NUMBER },
                  sadness: { type: Type.NUMBER },
                  anger: { type: Type.NUMBER },
                  fear: { type: Type.NUMBER },
                }
              },
              suggestions: { type: Type.STRING }
            }
          }
        }
      });

      // Fix: Correct usage of .text property
      const analysis = JSON.parse(response.text.trim());
      const report = {
        id: `daily-${userId}-${Date.now()}`,
        userId, userName, userRole,
        date: new Date().toISOString().split('T')[0],
        ...analysis,
        details: analysis.scores,
        interactionCount: fileList.length
      };

      db.reports.unshift(report);
      for (const file of fileList) {
        await fs.rename(path.join(PENDING_DIR, file), path.join(UPLOADS_DIR, file));
      }
      newReports.push(report);
    }

    await writeDB(db);
    res.json({ success: true, count: newReports.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- General User APIs ---
app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body;
  const db = await readDB();
  const user = db.users.find(u => u.phone === phone && u.password === password);
  if (!user) return res.status(401).json({ message: 'Invalid phone or password' });
  res.json(user);
});

app.post('/api/register', async (req, res) => {
  const { phone, name, password, role } = req.body;
  const db = await readDB();
  const newUser = { id: Date.now().toString(), phone, name, password, role, boundPhones: [] };
  db.users.push(newUser);
  await writeDB(db);
  res.json(newUser);
});

app.patch('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const db = await readDB();
  const idx = db.users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ message: 'User not found' });
  db.users[idx] = { ...db.users[idx], ...req.body };
  await writeDB(db);
  res.json(db.users[idx]);
});

app.post('/api/users/batch', async (req, res) => {
  const { phones } = req.body;
  const db = await readDB();
  const results = db.users
    .filter(u => phones.includes(u.phone))
    .map(u => ({ phone: u.phone, name: u.name, role: u.role }));
  res.json(results);
});

// --- Asset Uploads for Cloning ---
app.post('/api/users/:id/image', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const db = await readDB();
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.did_image_url = `/uploads/${req.file.filename}`;
  await writeDB(db);
  res.json(user);
});

app.post('/api/users/:id/voice', upload.single('voice'), async (req, res) => {
  const { id } = req.params;
  const db = await readDB();
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.did_voice_id = `voice-${id}-${Date.now()}`;
  user.voiceSampleUrl = `/uploads/${req.file.filename}`;
  await writeDB(db);
  res.json(user);
});

// --- Family Binding ---
app.post('/api/bind-family', async (req, res) => {
  const { userId, targetPhone } = req.body;
  const db = await readDB();
  const user = db.users.find(u => u.id === userId);
  const target = db.users.find(u => u.phone === targetPhone);
  if (!user || !target) return res.status(404).json({ message: 'User or target not found' });
  
  if (!user.boundPhones.includes(target.phone)) user.boundPhones.push(target.phone);
  if (!target.boundPhones.includes(user.phone)) target.boundPhones.push(user.phone);
  
  await writeDB(db);
  res.json(user);
});

app.post('/api/unbind-family', async (req, res) => {
  const { userId, targetPhone } = req.body;
  const db = await readDB();
  const user = db.users.find(u => u.id === userId);
  const target = db.users.find(u => u.phone === targetPhone);
  if (user) user.boundPhones = user.boundPhones.filter(p => p !== targetPhone);
  if (target) target.boundPhones = target.boundPhones.filter(p => p !== user.phone);
  await writeDB(db);
  res.json(user);
});

// --- Reports ---
app.get('/api/reports', async (req, res) => {
  const db = await readDB();
  res.json(db.reports);
});

// --- Video Queue ---
app.post('/api/queue-video', upload.single('video'), (req, res) => res.json({ success: true }));

// --- Health Logs ---
app.post('/api/health-logs', async (req, res) => {
  const db = await readDB();
  const log = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...req.body };
  db.healthLogs.push(log);
  await writeDB(db);
  res.json(log);
});

app.get('/api/health-logs/:phone', async (req, res) => {
  const db = await readDB();
  res.json(db.healthLogs.filter(l => l.userId === req.params.phone));
});

// --- Schedules ---
app.get('/api/schedules/:phone', async (req, res) => {
  const db = await readDB();
  res.json(db.schedules.filter(s => s.userId === req.params.phone));
});

app.post('/api/schedules', async (req, res) => {
  const db = await readDB();
  const schedule = { id: Date.now().toString(), status: 'pending', ...req.body };
  db.schedules.push(schedule);
  await writeDB(db);
  res.json(schedule);
});

app.patch('/api/schedules/:id', async (req, res) => {
  const db = await readDB();
  const idx = db.schedules.findIndex(s => s.id === req.params.id);
  if (idx !== -1) {
    db.schedules[idx] = { ...db.schedules[idx], ...req.body };
    await writeDB(db);
    res.json(db.schedules[idx]);
  } else res.status(404).json({ message: 'Not found' });
});

app.delete('/api/schedules/:id', async (req, res) => {
  const db = await readDB();
  db.schedules = db.schedules.filter(s => s.id !== req.params.id);
  await writeDB(db);
  res.json({ success: true });
});

// --- Messages ---
app.post('/api/messages', async (req, res) => {
  const db = await readDB();
  const msg = { id: Date.now().toString(), status: 'pending', timestamp: new Date().toISOString(), ...req.body };
  db.messages.push(msg);
  await writeDB(db);
  res.json(msg);
});

app.get('/api/messages/:phone', async (req, res) => {
  const db = await readDB();
  res.json(db.messages.filter(m => m.targetPhone === req.params.phone && m.status === 'pending'));
});

app.put('/api/messages/:id/status', async (req, res) => {
  const db = await readDB();
  const idx = db.messages.findIndex(m => m.id === req.params.id);
  if (idx !== -1) {
    db.messages[idx].status = req.body.status;
    await writeDB(db);
    res.json(db.messages[idx]);
  } else res.status(404).json({ message: 'Not found' });
});

app.listen(PORT, async () => {
  await ensureDirs();
  console.log(`Server running on port ${PORT}`);
});
