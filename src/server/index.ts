import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { initializeMediasoup } from './mediasoup';
import { setupSocketIO } from './socket';
import { prisma } from './prisma';
import { roomManager } from './rooms';

const app = express();
const httpServer = createServer(app);

// Configure storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, and PDF are allowed.'));
    }
  },
});

// Serve uploads statically
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

// Enable CORS for Next.js frontend calls
app.use(
  cors({
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    credentials: true,
  })
);

app.use(express.json());

// Basic status / health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'supportlens-signaling',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/upload
 * Handles file uploads and returns the file metadata.
 */
app.post('/api/upload', (req: Request, res: Response) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Max size is 10MB.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    res.json({
      fileName: req.file.originalname,
      fileUrl: fileUrl,
      mimeType: req.file.mimetype,
    });
  });
});

/**
 * GET /api/sessions
 * Returns a list of all call sessions with participant and message counts.
 */
app.get('/api/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { startedAt: 'desc' },
    });

    const sessionList = await Promise.all(
      sessions.map(async (session) => {
        const participantCount = await prisma.participantSession.count({
          where: { sessionId: session.sessionId },
        });
        const messageCount = await prisma.message.count({
          where: { sessionId: session.sessionId },
        });

        return {
          sessionId: session.sessionId,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSeconds: session.durationSeconds,
          participantCount,
          messageCount,
        };
      })
    );

    res.json(sessionList);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /api/sessions/:id
 * Returns full details for a specific session, including participant history and chat logs.
 */
app.get('/api/sessions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const session = await prisma.session.findUnique({
      where: { sessionId: id },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const participants = await prisma.participantSession.findMany({
      where: { sessionId: id },
      orderBy: { joinedAt: 'asc' },
    });

    const messages = await prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      session,
      participants,
      messages,
    });
  } catch (error) {
    console.error('Error fetching session details:', error);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

/**
 * POST /api/sessions/:id/summary
 * Generates a mock AI summary based on the chat transcript of a session.
 */
app.post('/api/sessions/:id/summary', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const messages = await prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      res.json({
        issue: 'N/A',
        resolution: 'N/A',
        status: 'No messages found',
        summary: 'No chat activity was recorded for this session.',
      });
      return;
    }

    // Mock logic: generate a deterministic summary based on the presence of keywords
    const transcript = messages.map((m) => `${m.senderName}: ${m.type === 'file' ? `[File: ${m.fileName}]` : m.text}`).join('\n');
    const hasLogin = transcript.toLowerCase().includes('login');
    const hasError = transcript.toLowerCase().includes('error');

    let issue = 'General Inquiry';
    let resolution = 'Information provided';
    const status = 'Resolved';
    let summary = 'The customer and agent discussed general support topics.';

    if (hasLogin) {
      issue = 'Login Difficulty';
      resolution = 'Password reset instructions provided';
      summary = 'Customer reported issues logging into their account. Agent provided step-by-step guidance for a password reset.';
    } else if (hasError) {
      issue = 'Technical Error';
      resolution = 'Troubleshooting steps performed';
      summary = 'Customer encountered a technical error in the application. Agent assisted with clearing cache and refreshing.';
    }

    res.json({
      issue,
      resolution,
      status,
      summary,
    });
  } catch (error) {
    console.error('Error generating session summary:', error);
    res.status(500).json({ error: 'Failed to generate session summary' });
  }
});

/**
 * GET /api/admin/stats
 * Returns aggregate statistics and list of active sessions for the admin dashboard.
 */
app.get('/api/admin/stats', async (req: Request, res: Response) => {
  try {
    const activeSessions = roomManager.getActiveSessions();
    
    // Get stats from DB
    const totalSessions = await prisma.session.count();
    const totalMessages = await prisma.message.count();
    const totalParticipants = await prisma.participantSession.count();
    
    // Get recent sessions from DB
    const recentSessionsRaw = await prisma.session.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    const recentSessions = await Promise.all(
      recentSessionsRaw.map(async (s) => {
        const pCount = await prisma.participantSession.count({
          where: { sessionId: s.sessionId },
        });
        return {
          sessionId: s.sessionId,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          durationSeconds: s.durationSeconds,
          participantCount: pCount,
        };
      })
    );

    // Fetch active session start times from DB to calculate live duration
    const activeSessionIds = activeSessions.map(s => s.sessionId);
    const activeSessionsMetadata = await prisma.session.findMany({
      where: { sessionId: { in: activeSessionIds } }
    });

    const activeSessionsWithDuration = activeSessions.map(s => {
      const meta = activeSessionsMetadata.find(m => m.sessionId === s.sessionId);
      return {
        ...s,
        startedAt: meta?.startedAt || new Date().toISOString(),
      };
    });

    res.json({
      stats: {
        totalSessions,
        activeSessions: activeSessions.length,
        totalMessages,
        totalParticipants,
      },
      activeSessions: activeSessionsWithDuration,
      recentSessions,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
});

/**
 * GET /api/metrics
 * Returns basic observability metrics.
 */
app.get('/api/metrics', async (req: Request, res: Response) => {
  try {
    const activeSessions = roomManager.getActiveSessions();
    const connectedParticipants = activeSessions.reduce((acc, s) => acc + s.participantCount, 0);
    
    const totalSessions = await prisma.session.count();
    const totalMessages = await prisma.message.count();

    res.json({
      activeSessions: activeSessions.length,
      connectedParticipants,
      totalSessions,
      totalMessages,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Set up Socket.IO event controllers
setupSocketIO(io);

const PORT = process.env.SIGNALING_PORT || 3001;

async function startServer() {
  try {
    console.log('Initializing Mediasoup workers...');
    await initializeMediasoup();

    httpServer.listen(PORT, () => {
      console.log(`SupportLens signaling & SFU server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start signaling/SFU server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
