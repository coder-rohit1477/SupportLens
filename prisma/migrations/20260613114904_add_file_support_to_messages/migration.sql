-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Message" ("createdAt", "id", "senderId", "senderName", "senderRole", "sessionId", "text") SELECT "createdAt", "id", "senderId", "senderName", "senderRole", "sessionId", "text" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
