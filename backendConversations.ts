import fs from 'fs';
import path from 'path';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelUsed?: string;
  responseTimeMs?: number;
  isError?: boolean;
  image?: string;
  imageDescription?: string;
  attachedZipContent?: string;
  zipFileName?: string;
  quote?: string;
  attachments?: any[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  config?: any;
  longTermMemory?: string;
  firstChatDate?: string;
  lastSummarizedMessageIndex?: number;
}

const DATA_DIR = path.join(process.cwd(), 'data', 'users');

export function ensureUserConversationsPath(userId: string): string {
  const userDir = path.join(DATA_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return path.join(userDir, 'conversations.json');
}

export function getUserConversations(userId: string): Conversation[] {
  const filePath = ensureUserConversationsPath(userId);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return [];
    const convs: Conversation[] = JSON.parse(raw);
    if (!Array.isArray(convs)) return [];
    
    // Sort descending by updatedAt
    convs.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return convs;
  } catch (err) {
    console.error(`[CONVERSATIONS ERROR] Failed to read conversations for user ${userId}`, err);
    return [];
  }
}

export function saveUserConversations(userId: string, conversations: Conversation[]): void {
  const filePath = ensureUserConversationsPath(userId);
  // Sort descending by updatedAt
  conversations.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  try {
    const tempPath = filePath + '.tmp_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    fs.writeFileSync(tempPath, JSON.stringify(conversations, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`[CONVERSATIONS ERROR] Atomic write failed for user ${userId}`, err);
    fs.writeFileSync(filePath, JSON.stringify(conversations, null, 2), 'utf-8');
  }
}

export function saveOrUpdateConversation(userId: string, conversation: Conversation): Conversation {
  const convs = getUserConversations(userId);
  const now = Date.now();
  
  if (!conversation.id) {
    conversation.id = 'conv_' + now + '_' + Math.random().toString(36).substring(7);
  }
  if (!conversation.createdAt) {
    conversation.createdAt = now;
  }
  conversation.updatedAt = now;

  const existingIdx = convs.findIndex(c => c.id === conversation.id);
  if (existingIdx !== -1) {
    convs[existingIdx] = {
      ...convs[existingIdx],
      ...conversation,
      updatedAt: now
    };
  } else {
    convs.unshift(conversation);
  }

  saveUserConversations(userId, convs);
  return convs.find(c => c.id === conversation.id) || conversation;
}

export function deleteConversation(userId: string, convId: string): boolean {
  const convs = getUserConversations(userId);
  const filtered = convs.filter(c => c.id !== convId);
  if (filtered.length !== convs.length) {
    saveUserConversations(userId, filtered);
    return true;
  }
  return false;
}

export function clearUserConversations(userId: string): void {
  saveUserConversations(userId, []);
}
