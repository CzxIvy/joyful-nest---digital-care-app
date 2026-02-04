
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from 'openai';
import Groq from 'groq-sdk';

import FormData from 'form-data';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
  base_url:"https://api.chatanywhere.tech/v1"
});
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function ensureDirs() {
  try { 
      await fs.promises.access(UPLOADS_DIR); 
  } catch { 
      await fs.promises.mkdir(UPLOADS_DIR, { recursive: true }); 
  }
  
  try { 
      await fs.promises.access(PENDING_DIR); 
  } catch { 
      await fs.promises.mkdir(PENDING_DIR, { recursive: true }); 
  }
}

// Fixed: Enhanced multer storage to correctly route files and preserve extensions
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
    if (file.fieldname === 'audio' || file.fieldname === 'video') {
        cb(null, PENDING_DIR);
    } else {
        // 头像等其他资源存入公共目录
        cb(null, UPLOADS_DIR);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext || (file.fieldname === 'audio' ? '.webm' : '')}`);
  }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

async function readDB() {
  try {
    const data = await fs.promises.readFile(DB_FILE, 'utf-8'); // 加 .promises
    return JSON.parse(data);
  } catch (e) {
    return { users: [], reports: [], messages: [], schedules: [], healthLogs: [] };
  }
}

async function writeDB(data) {
  await fs.promises.writeFile(DB_FILE, JSON.stringify(data, null, 2)); // 加 .promises
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
  console.log('Midnight Sync Triggered (API Mode)');
  try {
    const files = await fs.promises.readdir(PENDING_DIR); 
    const audioFiles = files.filter(f => f.startsWith('video-') || f.startsWith('audio-'));
    
    if (audioFiles.length === 0) return res.json({ message: 'No new recordings to analyze' });

    // 2.1 按用户分组
    const userFileMap = new Map();
    audioFiles.forEach(file => {
      const parts = file.split('-');
      if (parts.length > 1) {
        const userId = parts[1];
        if (!userFileMap.has(userId)) userFileMap.set(userId, []);
        userFileMap.get(userId).push(file);
      }
    });

    const db = await readDB();
    const newReports = [];
    const EMOTION_API_URL = process.env.EMOTION_API_URL || 'http://localhost:8000/analyze'; // 你的接口地址

    // 2.2 遍历用户
    for (const [userId, fileList] of userFileMap.entries()) {
      const user = db.users.find(u => u.id === userId);
      const userName = user ? user.name : '用户';
      
      let totalScores = { happiness: 0, sadness: 0, anger: 0, fear: 0, neutral: 0 };
      let validCount = 0;

      console.log(`正在调用接口分析用户 ${userName} 的 ${fileList.length} 条语音...`);

      for (const file of fileList) {
        const inputPath = path.join(PENDING_DIR, file);
        const wavPath = path.join(PENDING_DIR, `${file}.wav`); // 临时 WAV

        try {
          // A. 预处理：FFmpeg 转码 (WebM -> WAV 16k Mono)
          // 即使是调用接口，发送标准的 WAV 也能极大提高接口的兼容性和准确率
          await execPromise(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -y "${wavPath}"`);

          // B. 构造 FormData
          const form = new FormData();
          form.append('file', fs.createReadStream(wavPath)); // ✅ 发送文件流

          // C. 调用外部接口
          const apiResponse = await fetch(EMOTION_API_URL, {
            method: 'POST',
            body: form,
            headers: form.getHeaders(), // ✅ 关键：Node.js 中必须手动设置 headers
          });

          if (!apiResponse.ok) {
             console.error(`接口调用失败: ${apiResponse.statusText}`);
             continue;
          }

          const result = await apiResponse.json(); 
          // 假设接口返回格式: { success: true, scores: { happiness: 80, ... } }
          
          // D. 累加分数
          if (result && (result.success || result.scores)) {
             validCount++;
             const scores = result.scores || result; // 兼容不同接口格式
             for (const key in totalScores) {
               if (scores[key]) totalScores[key] += scores[key];
             }
          }

          // E. 清理临时 WAV
          await fs.promises.unlink(wavPath);

        } catch (err) {
          console.error(`处理文件 ${file} 失败:`, err);
        }
      }

      // 2.3 计算平均分 & 生成报告 (纯规则逻辑，不依赖 LLM)
      if (validCount > 0) {
        for (const key in totalScores) totalScores[key] = Math.round(totalScores[key] / validCount);
      }
      
      // 找出最大情绪
      const maxEmotion = Object.keys(totalScores).reduce((a, b) => totalScores[a] > totalScores[b] ? a : b);

      // 简单的文案映射
      const summaryMap = {
          happiness: "充满活力，语调积极。",
          sadness: "语调低沉，情绪略显低落。",
          anger: "情绪激动，语速较快。",
          fear: "声音紧张，显露不安。",
          neutral: "情绪平稳，状态正常。"
      };
      
      const report = {
        id: `daily-${userId}-${Date.now()}`,
        userId, userName, userRole: user?.role || 'elderly',
        date: new Date().toISOString().split('T')[0],
        overallMood: maxEmotion,
        trend: "API 分析数据",
        summary: summaryMap[maxEmotion] || "数据正常",
        details: totalScores,
        suggestions: "请结合实际情况给予关怀。",
        interactionCount: fileList.length
      };

      db.reports.unshift(report);
      newReports.push(report);

      // 移动源文件
      for (const file of fileList) {
        await fs.promises.rename(path.join(PENDING_DIR, file), path.join(UPLOADS_DIR, file));
      }
    }

    await writeDB(db);
    res.json({ success: true, count: newReports.length });

  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
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

// --- Audio Queue ---
app.post('/api/queue-audio', upload.single('audio'), (req, res) => res.json({ success: true }));

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
