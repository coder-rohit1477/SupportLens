import { PrismaClient } from './src/generated/prisma/client';

const prisma = new PrismaClient();

async function main() {
  const testSessionId = `file-test-${Date.now()}`;

  try {
    console.log('--- Testing File Message Creation ---');
    const fileMsg = await prisma.message.create({
      data: {
        sessionId: testSessionId,
        senderId: 'user-1',
        senderName: 'Test User',
        senderRole: 'CUSTOMER',
        type: 'file',
        fileName: 'test.png',
        fileUrl: 'http://localhost:3001/uploads/test.png',
        mimeType: 'image/png',
      },
    });
    console.log('[OK] File message created:', fileMsg.id);

    console.log('--- Testing Text Message Creation ---');
    const textMsg = await prisma.message.create({
      data: {
        sessionId: testSessionId,
        senderId: 'user-1',
        senderName: 'Test User',
        senderRole: 'CUSTOMER',
        type: 'text',
        text: 'Hello world',
      },
    });
    console.log('[OK] Text message created:', textMsg.id);

    console.log('--- Verifying Retrieval ---');
    const messages = await prisma.message.findMany({
      where: { sessionId: testSessionId },
      orderBy: { createdAt: 'asc' },
    });

    console.log('Retrieved messages:', JSON.stringify(messages, null, 2));

    if (messages.length === 2 && messages[0].type === 'file' && messages[1].type === 'text') {
      console.log('\nVERIFICATION SUCCESSFUL');
    } else {
      console.error('\nVERIFICATION FAILED');
    }

  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
