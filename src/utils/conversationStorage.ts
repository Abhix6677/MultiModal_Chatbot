import { Conversation } from '../types';
import { 
  loadConversationsFromDB, 
  saveConversationsToDB, 
  deleteConversationFromDB, 
  clearAllConversationsFromDB 
} from './memory';

export const USER_ID = 'default_user';

/**
 * Fetches persisted conversations from the backend server.
 * Falls back to IndexedDB if offline or API is unavailable.
 */
export async function loadAllConversations(): Promise<Conversation[]> {
  let serverConvs: Conversation[] = [];
  let idbConvs: Conversation[] = [];

  // 1. Fetch from server
  try {
    const res = await fetch(`/api/conversations?userId=${USER_ID}`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.conversations)) {
        serverConvs = data.conversations;
      }
    }
  } catch (err) {
    console.warn('[Conversation Storage] Failed to fetch from backend:', err);
  }

  // 2. Fetch from IndexedDB
  try {
    const loaded = await loadConversationsFromDB();
    if (Array.isArray(loaded)) {
      idbConvs = loaded;
    }
  } catch (err) {
    console.error('[Conversation Storage] Failed to load from IndexedDB:', err);
  }

  // 3. Merge them based on updatedAt
  const mergedMap = new Map<string, Conversation>();
  
  // Add server convs to map
  serverConvs.forEach(c => mergedMap.set(c.id, c));
  
  // Add/Overwrite with IDB convs if they are newer
  let needsServerSync = false;
  idbConvs.forEach(idbConv => {
    const serverConv = mergedMap.get(idbConv.id);
    if (!serverConv || (idbConv.updatedAt || 0) > (serverConv.updatedAt || 0)) {
      mergedMap.set(idbConv.id, idbConv);
      needsServerSync = true;
    }
  });

  const mergedConvs = Array.from(mergedMap.values())
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  if (mergedConvs.length > 0) {
    // Always sync the merged result to IDB
    saveConversationsToDB(mergedConvs).catch(() => {});
    
    // If IDB had newer data, sync it up to the server
    if (needsServerSync) {
      syncAllConversationsToServer(mergedConvs).catch(() => {});
    }
  }

  return mergedConvs;
}

/**
 * Persists a single conversation immediately to backend server and IndexedDB.
 */
export async function persistConversation(conversation: Conversation, allConversations?: Conversation[]): Promise<boolean> {
  let success = false;
  
  // 1. Immediately persist to backend
  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, conversation })
    });
    if (res.ok) {
      success = true;
    } else {
      console.warn('[Conversation Storage] Backend save returned non-200:', res.status);
    }
  } catch (err) {
    console.error('[Conversation Storage] Backend save failed:', err);
  }

  // 2. Persist to IndexedDB
  try {
    if (allConversations && allConversations.length > 0) {
      saveConversationsToDB(allConversations).catch(() => {});
    }
  } catch (err) {
    console.error('[Conversation Storage] IndexedDB save error:', err);
  }

  return success;
}

/**
 * Persists the entire array of conversations to backend server.
 */
export async function syncAllConversationsToServer(conversations: Conversation[]): Promise<boolean> {
  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, conversations })
    });
    if (res.ok) {
      return true;
    }
  } catch (err) {
    console.error('[Conversation Storage] Batch sync to backend failed:', err);
  }
  return false;
}

/**
 * Deletes a conversation from both backend and IndexedDB.
 */
export async function removeConversation(convId: string): Promise<void> {
  try {
    await fetch(`/api/conversations/${convId}?userId=${USER_ID}`, { method: 'DELETE' });
  } catch (err) {
    console.error('[Conversation Storage] Backend delete failed:', err);
  }
  try {
    await deleteConversationFromDB(convId);
  } catch (err) {
    console.error('[Conversation Storage] IndexedDB delete failed:', err);
  }
}

/**
 * Clears all conversations from both backend and IndexedDB.
 */
export async function removeAllConversations(): Promise<void> {
  try {
    await fetch(`/api/conversations?userId=${USER_ID}`, { method: 'DELETE' });
  } catch (err) {
    console.error('[Conversation Storage] Backend clear failed:', err);
  }
  try {
    await clearAllConversationsFromDB();
  } catch (err) {
    console.error('[Conversation Storage] IndexedDB clear failed:', err);
  }
}
