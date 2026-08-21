import { Conversation } from '../types';
import { 
  loadConversationsFromDB, 
  saveConversationsToDB, 
  deleteConversationFromDB, 
  clearAllConversationsFromDB 
} from './memory';

let activeSessionToken = '';

export function setSessionToken(token: string) {
  activeSessionToken = token;
}

export function getSessionToken() {
  return activeSessionToken;
}

export function getAuthHeaders() {
  return {
    'Authorization': `Bearer ${activeSessionToken}`
  };
}

export async function loadAllConversations(): Promise<Conversation[]> {
  let serverConvs: Conversation[] = [];
  try {
    const res = await fetch(`/api/conversations`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.conversations)) {
        serverConvs = data.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    }
  } catch (err) {
    console.warn('[Conversation Storage] Failed to fetch from backend:', err);
  }

  // RECOVERY FOR DEFAULT USER ONLY
  const activeProfileId = localStorage.getItem("ai_studio_active_profile_id");
  if (activeProfileId === "default_user") {
    try {
      const idbConvs = await loadConversationsFromDB();
      if (Array.isArray(idbConvs) && idbConvs.length > 0) {
        const mergedMap = new Map<string, Conversation>();
        serverConvs.forEach(c => mergedMap.set(c.id, c));
        
        let needsServerSync = false;
        idbConvs.forEach(idbConv => {
          const existing = mergedMap.get(idbConv.id);
          if (!existing || (idbConv.updatedAt && existing.updatedAt && idbConv.updatedAt > existing.updatedAt)) {
            mergedMap.set(idbConv.id, idbConv);
            needsServerSync = true;
          }
        });

        if (needsServerSync) {
          const merged = Array.from(mergedMap.values());
          merged.sort((a, b) => b.updatedAt - a.updatedAt);
          
          // Push the recovered DB to the backend!
          syncAllConversationsToServer(merged).catch(console.error);
          return merged;
        }
      }
    } catch (err) {
      console.error('[Conversation Storage] Failed to load from IndexedDB for recovery:', err);
    }
  }

  return serverConvs;
}

export async function persistConversation(conversation: Conversation): Promise<void> {
  try {
    await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ conversation })
    });
  } catch (err) {
    console.error('[Conversation Storage] Persist conversation error:', err);
  }
}

export async function syncAllConversationsToServer(conversations: Conversation[]): Promise<void> {
  try {
    await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ conversations })
    });
  } catch (err) {
    console.warn('[Conversation Storage] Failed bulk sync to server:', err);
  }
}

export async function removeConversation(convId: string): Promise<void> {
  try {
    
    await fetch(`/api/conversations/${convId}`, { 
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  } catch (err) {
    console.error('[Conversation Storage] Delete error:', err);
  }
}

export async function removeAllConversations(): Promise<void> {
  try {
    
    await fetch(`/api/conversations`, { 
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  } catch (err) {
    console.error('[Conversation Storage] Clear all error:', err);
  }
}
