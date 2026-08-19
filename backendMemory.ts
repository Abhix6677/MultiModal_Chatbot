import fs from 'fs';
import path from 'path';

export interface MemoryRecord {
  id: string;
  user_id: string;
  property: string;
  value: string;
  content: string;
  category: string;
  status: 'active' | 'superseded';
  importance: number;
  confidence: number;
  created_at: number;
  updated_at: number;
  source_conversation_id: string;
  entity_key?: string;
  superseded_by?: string;
  previous_value?: string;
  subject?: string;
  ownership?: 'user' | 'third_party' | 'organization' | 'project' | 'object' | 'unknown';
}

const DATA_DIR = path.join(process.cwd(), 'data', 'users');

export function ensureUserDir(userId: string): string {
  const userDir = path.join(DATA_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return path.join(userDir, 'memory.json');
}

export function getUserMemories(userId: string): MemoryRecord[] {
  const filePath = ensureUserDir(userId);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return [];
    const parsed: MemoryRecord[] = JSON.parse(raw);
    return parsed.map(normalizeRecordSchema);
  } catch (err) {
    console.error(`[MEMORY ERROR] Could not read memory for user ${userId}`, err);
    return [];
  }
}

export function saveUserMemories(userId: string, memories: MemoryRecord[]): void {
  const filePath = ensureUserDir(userId);
  // Guarantee single-active invariant and deduplication before saving
  const cleanMemories = enforceSingleActiveInvariant(memories.map(normalizeRecordSchema));
  try {
    const tempPath = filePath + '.tmp_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    fs.writeFileSync(tempPath, JSON.stringify(cleanMemories, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify(cleanMemories, null, 2), 'utf-8');
  }
}

const STOP_WORDS = new Set([
  'what', 'is', 'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
  'how', 'why', 'who', 'where', 'my', 'i', 'am', 'we', 'are', 'you', 'he', 'she', 'it',
  'they', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about', 'as', 'by', 'do', 'does', 'did'
]);

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  return words.filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Normalizes any raw entity key or content into a standard single-value property slot
 */
export function normalizePropertyKey(rawKey?: string, category?: string, content?: string, val?: string): string {
  const k = (rawKey || '').toLowerCase().trim();
  const c = (category || '').toLowerCase().trim();
  const text = ((content || '') + ' ' + (val || '')).toLowerCase();

  // 1. Projects (Check this first so "project.name" doesn't get caught by "name" check)
  if (k.includes('project') || c === 'project' || text.includes('project') || text.includes('building')) {
    return 'current_project_name';
  }

  // 2. Identity & Names
  if (k.includes('nickname') || text.includes('nickname') || text.includes('alias')) {
    return 'current_nickname';
  }
  // We now rely on the semantic extractor's classification to provide a clean entity_key.
  // We only map to 'current_name' if it's explicitly the user's name.
  if (k === 'name' || k === 'user.name' || k === 'user_name' || k === 'identity.name' || k === 'current_name') {
    return 'current_name';
  }
  // 3. Education & Grades
  if (k.includes('cgpa') || k.includes('gpa') || text.includes('cgpa') || text.includes('gpa') || c === 'education') {
    return 'current_cgpa';
  }

  // 4. Preferences & Tools
  if (k.includes('lang') || text.includes('programming language') || text.includes('prefer java') || text.includes('prefer python') || text.includes('prefer c++') || text.includes('prefer rust') || text.includes('prefer go')) {
    return 'preferred_language';
  }
  if (k.includes('editor') || /\bide\b/.test(k) || text.includes('editor') || text.includes('vs code') || text.includes('cursor') || text.includes('neovim')) {
    return 'current_editor';
  }
  if (k.includes('database') || /\bdb\b/.test(k) || text.includes('database') || text.includes('postgres') || text.includes('mongodb') || text.includes('mysql')) {
    return 'current_database';
  }
  if (k.includes('city') || k.includes('location') || text.includes('moved to') || text.includes('living in') || text.includes('location')) {
    return 'current_location';
  }

  // 5. Fallbacks
  if (rawKey && rawKey.trim()) {
    return rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }
  if (category && category.trim()) {
    return category.toLowerCase() + '_default';
  }
  return 'general_fact';
}

/**
 * Extracts a concise entity value from content
 */
export function extractValueFromContent(content: string, property: string): string {
  const trimmed = content.trim();

  // GUARD: If the content looks like a multi-item list or chain, reject it entirely
  // These are contaminated extractions from history queries, not single facts
  if (trimmed.includes(',') && trimmed.split(',').length > 2) return '';
  if (trimmed.includes('→') || trimmed.includes('->')) return '';
  if (/\bhistory\b|\btimeline\b|\boldest to newest\b/i.test(trimmed)) return '';

  if (property === 'current_cgpa') {
    const m = trimmed.match(/\b\d+(\.\d+)?\b/);
    if (m) return m[0];
  }
  if (property === 'preferred_language') {
    const m = trimmed.match(/\b(python|javascript|typescript|java|c\+\+|c#|go|rust|ruby|php|swift|kotlin)\b/i);
    if (m) return m[0];
  }
  if (property === 'current_nickname') {
    const m = trimmed.match(/(?:nickname is|call me|alias is|nickname:?)\s+([A-Za-z0-9_-]+)/i);
    if (m && m[1]) return m[1];
  }
  if (property === 'current_name') {
    const m = trimmed.match(/(?:name is|called|i am|i'm|name:?)\s+([A-Za-z0-9_-]+)/i);
    if (m && m[1] && !['building', 'working', 'studying', 'learning', 'a', 'an', 'the', 'my', 'now'].includes(m[1].toLowerCase())) {
      return m[1];
    }
  }
  if (property === 'current_project_name') {
    // E.g. "My current project is now TitanCloud. This replaces SkyHost completely." -> "TitanCloud"
    const m1 = trimmed.match(/(?:project is now|project is called|project called|project is|called|named|now called|renamed to|is now|building)\s+([A-Za-z0-9_-]+)/i);
    if (m1 && m1[1] && !['called', 'named', 'now', 'a', 'an', 'the', 'my', 'our', 'this', 'it'].includes(m1[1].toLowerCase())) {
      return m1[1];
    }
  }
  return trimmed;
}

/**
 * Detects explicit transition predecessor in user text e.g. "TitanCloud replaces SkyHost"
 */
export function detectPredecessorFromContent(content: string): string | undefined {
  const m1 = content.match(/(?:replaces|replaced|instead of|formerly|previously called|was called|from)\s+([A-Za-z0-9_-]+)/i);
  if (m1 && m1[1] && !['a', 'an', 'the', 'my', 'our', 'this', 'it'].includes(m1[1].toLowerCase())) {
    return m1[1];
  }
  const m2 = content.match(/([A-Za-z0-9_-]+)\s+(?:is now called|is renamed to|was renamed to|became|changed to)/i);
  if (m2 && m2[1] && !['a', 'an', 'the', 'my', 'our', 'this', 'it', 'project'].includes(m2[1].toLowerCase())) {
    return m2[1];
  }
  return undefined;
}

/**
 * Accurately determines if a user message is a question or inquiry (NOT a memory fact declaration).
 */
export function isUserFactQuery(message: string): boolean {
  if (!message || typeof message !== 'string') return false;
  const t = message.trim().toLowerCase();
  if (t.length === 0) return false;

  // 1. Direct question mark with question words or asking about user properties
  if (t.endsWith('?')) {
    if (/^(what|who|where|when|why|how|which|tell|give|show|list|do you|can you|did i|is my|was my|are my|am i)\b/i.test(t)) {
      return true;
    }
    if (/(\bproject|\bname|\bnickname|\bcgpa|\bgpa|\blanguage|\bhistory|\btimeline|\bstatus)/i.test(t)) {
      return true;
    }
  }

  // 2. Direct question starters
  if (/^(what is|what's|what was|what were|what are|what did|what project|who is|who am i|who was|where do i|where am i|where is|when did i|why is|how much|how is|which project|which name|which language)\b/i.test(t)) {
    return true;
  }

  // 3. Requests to display or list memory state
  if (/^(tell me|give me|show me|list|display|recall|remind me of|print)\s+(my|all|the)?\s*(project|name|nickname|cgpa|gpa|language|history|timeline|profile|details|memories|facts)\b/i.test(t)) {
    return true;
  }

  // 4. Checking what the bot remembers
  if (/^(do you (know|remember|recall)|can you (tell|remind|recall)|did i (tell|say|mention))\b/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * Ensures legacy records without property / value conform to the updated schema
 */
export function normalizeRecordSchema(rec: any): MemoryRecord {
  const property = rec.property || normalizePropertyKey(rec.entity_key, rec.category, rec.content, rec.value);
  let value = (rec.value || extractValueFromContent(rec.content || '', property)).trim();

  // If value was corrupted by a multi-item chain or comma-separated list, extract clean last token
  // This applies to ALL properties, not just current_project_name
  if (value.includes(',') || value.includes('->') || value.includes('→') || (value.includes('\n') && value.split('\n').length > 2)) {
    const parts = value.split(/,|->|→|\n/).map((s: string) => s.trim()).filter(Boolean);
    value = parts.length > 0 ? parts[parts.length - 1] : '';
  }

  return {
    id: rec.id || ('mem_' + Date.now() + '_' + Math.random().toString(36).substring(7)),
    user_id: rec.user_id || 'default_user',
    property,
    value,
    content: rec.content || '',
    category: rec.category || 'other',
    status: rec.status === 'superseded' ? 'superseded' : 'active',
    importance: typeof rec.importance === 'number' ? rec.importance : 3,
    confidence: typeof rec.confidence === 'number' ? rec.confidence : 1.0,
    created_at: rec.created_at || Date.now(),
    updated_at: rec.updated_at || Date.now(),
    source_conversation_id: rec.source_conversation_id || 'unknown',
    entity_key: rec.entity_key || property,
    superseded_by: rec.superseded_by,
    previous_value: rec.previous_value
  };
}

/**
 * DATABASE INVARIANT & DEDUPLICATION ENFORCER:
 * 1. Collapses duplicate records having the same property and same value (case-insensitive) into 1 canonical record.
 * 2. Guarantees strictly COUNT(active facts for property) <= 1.
 * 3. Enforces monotonic temporal supersession: Predecessors can NEVER supersede downstream terminal nodes.
 * 4. Atomically links every transition in the chronological chain bidirectionally (superseded_by & previous_value).
 */
export function enforceSingleActiveInvariant(memories: MemoryRecord[]): MemoryRecord[] {
  const propertyMap: Record<string, MemoryRecord[]> = {};

  for (const mem of memories) {
    if (!propertyMap[mem.property]) {
      propertyMap[mem.property] = [];
    }
    propertyMap[mem.property].push(mem);
  }

  const result: MemoryRecord[] = [];

  for (const property of Object.keys(propertyMap)) {
    const list = propertyMap[property];

    // Step 1: Deduplicate records with the exact same value (case-insensitive)
    const valueMap: Record<string, MemoryRecord> = {};
    for (const mem of list) {
      const normVal = (mem.value || mem.content).toLowerCase().trim();
      if (!normVal) continue;
      if (!valueMap[normVal]) {
        valueMap[normVal] = { ...mem };
      } else {
        const existing = valueMap[normVal];
        existing.created_at = Math.min(existing.created_at, mem.created_at);
        existing.updated_at = Math.max(existing.updated_at, mem.updated_at);
        if (mem.status === 'active') existing.status = 'active';
        if (mem.superseded_by && !existing.superseded_by) existing.superseded_by = mem.superseded_by;
        if (mem.previous_value && !existing.previous_value) existing.previous_value = mem.previous_value;
      }
    }

    const uniqueValueRecords = Object.values(valueMap);
    if (uniqueValueRecords.length === 0) continue;

    // Step 2: Sort chronologically via DAG / created_at
    const sorted = getChronologicalHistory(uniqueValueRecords, property);

    // Step 3: Link every transition in the chain bidirectionally
    for (let i = 0; i < sorted.length; i++) {
      const rec = sorted[i];
      if (i === sorted.length - 1) {
        // Terminal node is the single active record
        rec.status = 'active';
        rec.superseded_by = undefined;
        if (i > 0) {
          rec.previous_value = sorted[i - 1].value;
        }
      } else {
        // Historical predecessors are superseded
        rec.status = 'superseded';
        rec.superseded_by = sorted[i + 1].id;
        if (i > 0 && !rec.previous_value) {
          rec.previous_value = sorted[i - 1].value;
        }
      }
    }

    result.push(...sorted);
  }

  return result;
}

export type QueryIntent = 'CURRENT_STATE' | 'PREVIOUS_STATE' | 'ORIGINAL_STATE' | 'HISTORY_STATE' | 'GENERAL_MEMORY';

export function detectQueryIntent(query: string): { intent: QueryIntent; targetProperty?: string } {
  const q = query.toLowerCase();

  // Determine targeted property if query is specific
  let targetProperty: string | undefined = undefined;
  if (q.includes('project') || q.includes('building') || q.includes('app')) {
    targetProperty = 'current_project_name';
  } else if (q.includes('nickname') || q.includes('alias') || q.includes('handle')) {
    targetProperty = 'current_nickname';
  } else if ((q.includes('my name') || q.includes('mera name') || q.includes('who am i')) && !q.includes('friend') && !q.includes('brother') && !q.includes('sister')) {
    targetProperty = 'current_name';
  } else if (q.includes('cgpa') || q.includes('gpa') || q.includes('grade')) {
    targetProperty = 'current_cgpa';
  } else if (q.includes('language') || q.includes('prefer') || q.includes('programming')) {
    targetProperty = 'preferred_language';
  } else if (q.includes('editor') || q.includes('ide')) {
    targetProperty = 'current_editor';
  } else if (q.includes('database') || q.includes('db')) {
    targetProperty = 'current_database';
  }

  // Determine intent
  let intent: QueryIntent = 'GENERAL_MEMORY';
  
  const isExplicitMemoryQuery = /what is|what's|what was|tell me|do you remember|what are|who is|who am i|where is|where do i|when did i|give me|show me|list|timeline|history/i.test(q);

  if (isExplicitMemoryQuery || (q.endsWith('?') && targetProperty !== undefined)) {
    if (/history|timeline|all projects|all names|oldest to newest|newest to oldest|sequence|chain|renamed/i.test(q)) {
      intent = 'HISTORY_STATE';
    } else if (/original|first|initial|started with|began with/i.test(q)) {
      intent = 'ORIGINAL_STATE';
    } else if (/previous|prior|last|before|earlier|formerly|old\b|replaced/i.test(q)) {
      intent = 'PREVIOUS_STATE';
    } else {
      intent = 'CURRENT_STATE';
    }
  }
  return { intent, targetProperty };
}

/**
 * Reconstructs unique chronological project/property history from oldest to newest
 * using directed acyclic graph (DAG) topological sort.
 */
export function getChronologicalHistory(memories: MemoryRecord[], targetProperty: string): MemoryRecord[] {
  const propMemories = memories.filter(m => m.property === targetProperty);
  
  // Deduplicate by normalized value
  const uniqueMap: Record<string, MemoryRecord> = {};
  for (const m of propMemories) {
    const norm = (m.value || m.content).toLowerCase().trim();
    if (!norm) continue;
    if (!uniqueMap[norm]) {
      uniqueMap[norm] = { ...m };
    } else {
      const existing = uniqueMap[norm];
      existing.created_at = Math.min(existing.created_at, m.created_at);
      existing.updated_at = Math.max(existing.updated_at, m.updated_at);
      if (m.status === 'active') existing.status = 'active';
      if (m.superseded_by && !existing.superseded_by) existing.superseded_by = m.superseded_by;
      if (m.previous_value && !existing.previous_value) existing.previous_value = m.previous_value;
    }
  }

  const list = Object.values(uniqueMap);
  if (list.length <= 1) return list;

  // Build DAG
  const nodes = list.map(m => m.value.toLowerCase().trim());
  const nodeMap = new Map<string, MemoryRecord>();
  list.forEach(m => nodeMap.set(m.value.toLowerCase().trim(), m));

  const adj = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  nodes.forEach(n => {
    adj.set(n, new Set());
    inDegree.set(n, 0);
  });

  // Add directed edges (predecessor -> successor)
  for (const m of list) {
    const fromNorm = m.value.toLowerCase().trim();

    // 1. Check if m has a predecessor via previous_value: prev -> fromNorm
    if (m.previous_value) {
      const prevNorm = m.previous_value.toLowerCase().trim();
      if (nodeMap.has(prevNorm) && prevNorm !== fromNorm) {
        if (!adj.get(prevNorm)!.has(fromNorm)) {
          adj.get(prevNorm)!.add(fromNorm);
          inDegree.set(fromNorm, (inDegree.get(fromNorm) || 0) + 1);
        }
      }
    }

    // 2. Check if m points to successor via superseded_by
    if (m.superseded_by) {
      const succ = list.find(x => x.id === m.superseded_by || x.value.toLowerCase().trim() === m.superseded_by?.toLowerCase().trim());
      if (succ) {
        const succNorm = succ.value.toLowerCase().trim();
        if (succNorm !== fromNorm) {
          if (!adj.get(fromNorm)!.has(succNorm)) {
            adj.get(fromNorm)!.add(succNorm);
            inDegree.set(succNorm, (inDegree.get(succNorm) || 0) + 1);
          }
        }
      }
    }
  }

  // Topological sort with priority queue sorted by created_at
  const queue: string[] = [];
  nodes.forEach(n => {
    if ((inDegree.get(n) || 0) === 0) {
      queue.push(n);
    }
  });

  queue.sort((a, b) => (nodeMap.get(a)!.created_at || 0) - (nodeMap.get(b)!.created_at || 0));

  const resultNorms: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    // Pick the node with earliest created_at among in-degree 0 nodes
    queue.sort((a, b) => (nodeMap.get(a)!.created_at || 0) - (nodeMap.get(b)!.created_at || 0));
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    resultNorms.push(curr);

    const neighbors = adj.get(curr) || new Set();
    for (const next of neighbors) {
      const deg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, deg);
      if (deg <= 0 && !visited.has(next) && !queue.includes(next)) {
        queue.push(next);
      }
    }
  }

  // Append any remaining unvisited nodes ordered by created_at
  const unvisited = nodes.filter(n => !visited.has(n));
  unvisited.sort((a, b) => (nodeMap.get(a)!.created_at || 0) - (nodeMap.get(b)!.created_at || 0));
  resultNorms.push(...unvisited);

  // Guarantee that if an active record exists, it is placed at the end of the history
  const activeRecord = list.find(m => m.status === 'active');
  if (activeRecord) {
    const activeNorm = activeRecord.value.toLowerCase().trim();
    const idx = resultNorms.indexOf(activeNorm);
    if (idx !== -1 && idx !== resultNorms.length - 1) {
      resultNorms.splice(idx, 1);
      resultNorms.push(activeNorm);
    }
  }

  return resultNorms.map(n => nodeMap.get(n)!);
}

export function retrieveRelevantMemories(userId: string, query: string, topK: number = 10): {
  activeMemories: MemoryRecord[];
  historicalMemories: MemoryRecord[];
  historyChain?: MemoryRecord[];
  currentActive?: MemoryRecord;
} {
  const memories = getUserMemories(userId);
  if (memories.length === 0) {
    return { activeMemories: [], historicalMemories: [] };
  }

  const { intent, targetProperty } = detectQueryIntent(query);

  if (targetProperty) {
    const propMemories = memories.filter(m => m.property === targetProperty);
    const activeForProp = propMemories.filter(m => m.status === 'active');
    
    // Sort active by created_at descending (most recent wins)
    activeForProp.sort((a, b) => b.created_at - a.created_at || b.updated_at - a.updated_at);
    const currentActive = activeForProp.length > 0 ? activeForProp[0] : undefined;

    // Filter superseded records whose value differs from current active value
    const supersededForProp = propMemories.filter(m => 
      m.status === 'superseded' && 
      (!currentActive || m.value.toLowerCase().trim() !== currentActive.value.toLowerCase().trim())
    );

    // Deduplicate superseded by value
    const uniqueSupersededMap: Record<string, MemoryRecord> = {};
    for (const m of supersededForProp) {
      const norm = m.value.toLowerCase().trim();
      if (!uniqueSupersededMap[norm]) {
        uniqueSupersededMap[norm] = m;
      }
    }
    const uniqueSuperseded = Object.values(uniqueSupersededMap);
    const fullHistory = getChronologicalHistory(memories, targetProperty);

    if (intent === 'CURRENT_STATE') {
      return {
        activeMemories: currentActive ? [currentActive] : [],
        historicalMemories: [],
        historyChain: fullHistory,
        currentActive
      };
    }

    if (intent === 'PREVIOUS_STATE') {
      // Find immediate predecessor from topological history
      let immediatePredecessor: MemoryRecord | undefined = undefined;
      if (fullHistory.length >= 2) {
        immediatePredecessor = fullHistory[fullHistory.length - 2];
      } else if (uniqueSuperseded.length > 0) {
        uniqueSuperseded.sort((a, b) => b.updated_at - a.updated_at || b.created_at - a.created_at);
        immediatePredecessor = uniqueSuperseded[0];
      }

      return {
        activeMemories: [], // Exclude active from active list so model does not confuse current with previous
        historicalMemories: immediatePredecessor ? [immediatePredecessor] : [],
        historyChain: fullHistory,
        currentActive
      };
    }

    if (intent === 'ORIGINAL_STATE') {
      // Oldest created record among all history
      const originalRecord = fullHistory.length > 0 ? fullHistory[0] : undefined;

      return {
        activeMemories: [],
        historicalMemories: originalRecord ? [originalRecord] : [],
        historyChain: fullHistory,
        currentActive
      };
    }

    if (intent === 'HISTORY_STATE') {
      return {
        activeMemories: currentActive ? [currentActive] : [],
        historicalMemories: uniqueSuperseded,
        historyChain: fullHistory,
        currentActive
      };
    }
  }

  // Fallback / General multi-property queries
  const allActive = memories.filter(m => m.status === 'active');
  allActive.sort((a, b) => b.updated_at - a.updated_at);
  const activeRecords = allActive.slice(0, topK);

  const allSuperseded = memories.filter(m => m.status === 'superseded');
  allSuperseded.sort((a, b) => b.updated_at - a.updated_at);
  const historicalRecords = allSuperseded.slice(0, 5);

  return { activeMemories: activeRecords, historicalMemories: historicalRecords };
}

export function buildContext(userId: string, conversationId: string, userMessage: string, selectedModel: string, history: any[]) {
  const { activeMemories, historicalMemories, historyChain, currentActive } = retrieveRelevantMemories(userId, userMessage);
  const { intent, targetProperty } = detectQueryIntent(userMessage);

  console.log(`\n[MEMORY RETRIEVAL]`);
  console.log(`userId: ${userId}`);
  console.log(`query: ${userMessage.substring(0, 100)}`);
  console.log(`intent: ${intent}`);
  console.log(`targetProperty: ${targetProperty || 'none'}`);
  console.log(`activeMemories: ${activeMemories.map(m => `[${m.property}] ${m.value || m.content}`).join(' | ')}`);
  console.log(`historicalMemories: ${historicalMemories.map(m => `[${m.property}] ${m.value || m.content}`).join(' | ')}`);

  let contextStr = `\n\n=== AUTHORITATIVE USER PERSISTENT MEMORY ===\n`;
  
  if (intent === 'GENERAL_MEMORY') {
    if (activeMemories.length > 0) {
      contextStr += `[RELEVANT USER CONTEXT]:\n`;
      contextStr += activeMemories.map(m => `- Property [${m.property}]: ${m.content} (Value: ${m.value || m.content})`).join('\n');
      contextStr += `\n\n[CRITICAL INSTRUCTIONS FOR AI]:\n`;
      contextStr += `1. The above memories are persistent across ALL past conversations.\n`;
      contextStr += `2. If the user asks a question about themselves, their friends, their past, or any known fact, you MUST use the memory context above to answer it. Do NOT say "you haven't mentioned it in this conversation" if it is present in the memory context.\n`;
      contextStr += `3. Respond naturally and conversationally.\n`;
    } else {
      contextStr += `No persistent memories found.\n`;
    }
  } else if (intent === 'CURRENT_STATE') {
    if (activeMemories.length > 0) {
      contextStr += `[CURRENT ACTIVE FACT (Authoritative & Verified)]:\n`;
      contextStr += activeMemories.map(m => `- Property [${m.property}]: ${m.content} (Current Value: ${m.value || m.content})`).join('\n');
      contextStr += `\n\n[CRITICAL INSTRUCTIONS FOR AI]:\n`;
      contextStr += `1. The user is asking for their CURRENT state/project. Answer naturally and conversationally using the CURRENT ACTIVE FACT (${activeMemories[0].value || activeMemories[0].content}).\n`;
      contextStr += `2. Do NOT mention or list historical/previous values unless the user explicitly asks for them.\n`;
    } else {
      contextStr += `No active persistent memories found for this query.\n`;
    }
  } else if (intent === 'PREVIOUS_STATE') {
    if (historicalMemories.length > 0) {
      const prev = historicalMemories[0];
      contextStr += `[PREVIOUS / IMMEDIATE PREDECESSOR FACT]:\n`;
      contextStr += `- The PREVIOUS value of [${prev.property}] is: ${prev.value}\n`;
      if (currentActive) {
        contextStr += `\n[FOR CONTEXT ONLY — Current active value (this is NOT the previous value)]:\n`;
        contextStr += `- Current: ${currentActive.value}\n`;
      }
      contextStr += `\n[CRITICAL INSTRUCTIONS FOR AI]:\n`;
      contextStr += `1. The user is asking for their PREVIOUS (immediately preceding) value.\n`;
      contextStr += `2. You MUST answer ONLY with the single value: "${prev.value}".\n`;
      contextStr += `3. Do NOT list the full project history.\n`;
      contextStr += `4. Do NOT answer with "${currentActive?.value || ''}" — that is the CURRENT value, not the previous one.\n`;
      contextStr += `5. Do NOT mention any other historical values (only the immediate predecessor matters).\n`;
    } else {
      contextStr += `No previous superseded records found for this property.\n`;
    }
  } else if (intent === 'ORIGINAL_STATE') {
    if (historicalMemories.length > 0) {
      const orig = historicalMemories[0];
      contextStr += `[ORIGINAL HISTORICAL FACT (Authoritative First / Initial State)]:\n`;
      contextStr += `- Property [${orig.property} (ORIGINAL)]: ${orig.content} (Original Value: ${orig.value})\n`;
      contextStr += `\n\n[CRITICAL INSTRUCTIONS FOR AI]:\n`;
      contextStr += `1. The user is explicitly asking for their ORIGINAL / FIRST state or project.\n`;
      contextStr += `2. You MUST answer with the ORIGINAL value "${orig.value}".\n`;
    } else {
      contextStr += `No historical records found.\n`;
    }
  } else if (intent === 'HISTORY_STATE') {
    const chain = historyChain || [];
    if (chain.length > 0) {
      contextStr += `[FULL CHRONOLOGICAL HISTORY (Oldest to Newest)]:\n`;
      contextStr += chain.map((m, idx) => {
        const tag = m.status === 'active' ? 'Current Active' : (idx === 0 ? 'Original' : 'Previous');
        return `${idx + 1}. ${m.value} (${tag})`;
      }).join('\n');
      contextStr += `\n\n[CRITICAL INSTRUCTIONS FOR AI]:\n`;
      contextStr += `1. Present the project name history in this exact chronological order from oldest to newest:\n`;
      contextStr += `   ${chain.map(m => m.value).join(' -> ')}\n`;
      contextStr += `2. Do NOT output duplicate names.\n`;
    } else {
      contextStr += `No history found for this property.\n`;
    }
  }

  contextStr += `============================================\n`;
  
  return {
    retrievedMemories: [...activeMemories, ...historicalMemories],
    historyChain,
    currentActive,
    contextStr
  };
}

export function updateOrAddMemory(
  userId: string, 
  content: string, 
  category: string, 
  sourceConvId: string, 
  supersedeIds: string[] = [],
  importance: number = 3,
  entityKey?: string,
  explicitValue?: string,
  subject?: string,
  ownership?: 'user' | 'third_party' | 'organization' | 'project' | 'object' | 'unknown'
): MemoryRecord {
  const memories = getUserMemories(userId);
  const now = Date.now();
  const newRecordId = 'mem_' + now + '_' + Math.random().toString(36).substring(7);

  let property = normalizePropertyKey(entityKey, category, content, explicitValue);
  let value = (explicitValue || extractValueFromContent(content, property)).trim();

  // EXPLICIT IDENTITY OWNERSHIP VALIDATION
  if (property === 'current_name') {
    const isExplicitUserOwnership = ownership === 'user';
    const isExplicitThirdParty = ownership && ownership !== 'user' && ownership !== 'unknown';

    if (isExplicitThirdParty || !isExplicitUserOwnership) {
      // If the semantic engine didn't confidently tag this as owned by the user, reject it from the protected identity slot.
      console.warn(`[Memory System] Rejecting 'current_name' update: Semantic ownership is not 'user'. Ownership: ${ownership}, Content: "${content}"`);
      // Re-route to a safer semantic namespace rather than corrupting identity
      property = entityKey ? entityKey.toLowerCase().replace(/[^a-z0-9_]/g, '_') : 'third_party_fact';
      // Re-extract value with the new fallback property so it doesn't use the 'current_name' regex logic
      value = (explicitValue || extractValueFromContent(content, property)).trim();
    }
  }
  
  if (!value) {
    console.warn(`[Memory System] Rejecting memory update for property ${property}: Value could not be cleanly extracted (likely a contaminated history chain).`);
    throw new Error(`Invalid or contaminated memory value for property ${property}`);
  }

  const explicitPredecessor = detectPredecessorFromContent(content);

  // Check if an ACTIVE record with the exact SAME value already exists (Idempotency check)
  const existingActiveSameValue = memories.find(m => 
    m.property === property && 
    m.status === 'active' && 
    m.value.toLowerCase().trim() === value.toLowerCase().trim()
  );

  if (existingActiveSameValue) {
    // Idempotent update: refresh content & timestamp without superseding itself or creating duplicates
    existingActiveSameValue.updated_at = now;
    if (content.length > existingActiveSameValue.content.length) {
      existingActiveSameValue.content = content;
    }
    saveUserMemories(userId, memories);
    return existingActiveSameValue;
  }

  // Check if candidate value is already a known historical predecessor of the current active record
  const currentActiveRecord = memories.find(m => m.property === property && m.status === 'active');
  const isCandidateAlreadyPredecessor = memories.some(m => 
    m.property === property && 
    m.status === 'superseded' && 
    m.value.toLowerCase().trim() === value.toLowerCase().trim()
  );

  const isExplicitReversion = explicitPredecessor !== undefined ||
    content.toLowerCase().includes(`replaces ${currentActiveRecord?.value?.toLowerCase()}`) ||
    content.toLowerCase().includes(`switched back to ${value.toLowerCase()}`) ||
    content.toLowerCase().includes(`renamed back to ${value.toLowerCase()}`);

  if (currentActiveRecord && isCandidateAlreadyPredecessor && !isExplicitReversion) {
    // This fact is an older historical fact being re-summarized from an older conversation.
    // It must NEVER reactivate or supersede the current downstream active record!
    const existingHistorical = memories.find(m => m.property === property && m.value.toLowerCase().trim() === value.toLowerCase().trim());
    if (existingHistorical) {
      existingHistorical.updated_at = now;
      if (content.length > existingHistorical.content.length) existingHistorical.content = content;
      saveUserMemories(userId, memories);
      return existingHistorical;
    }
  }

  // 1. Explicit ID supersession
  for (const id of supersedeIds) {
    const idx = memories.findIndex(m => m.id === id);
    if (idx !== -1) {
      memories[idx].status = 'superseded';
      memories[idx].updated_at = now;
      memories[idx].superseded_by = newRecordId;
    }
  }

  // 2. Explicit Predecessor supersession (e.g. "TitanCloud replaces SkyHost")
  if (explicitPredecessor) {
    for (const mem of memories) {
      if (mem.property === property && mem.value.toLowerCase().trim() === explicitPredecessor.toLowerCase().trim()) {
        mem.status = 'superseded';
        mem.updated_at = now;
        mem.superseded_by = newRecordId;
      }
    }
  }

  // 3. Slot / Property Invariant Supersession
  // Any existing ACTIVE record with the SAME property is superseded by the new value
  let previousValue = explicitPredecessor;
  for (const mem of memories) {
    if (mem.status === 'active' && mem.property === property && mem.value.toLowerCase().trim() !== value.toLowerCase().trim()) {
      mem.status = 'superseded';
      mem.updated_at = now;
      mem.superseded_by = newRecordId;
      if (!previousValue) previousValue = mem.value;
      console.log(`\n[MEMORY UPDATE]`);
      console.log(`userId: ${userId}`);
      console.log(`property: ${property}`);
      console.log(`oldValue: ${mem.value}`);
      console.log(`newValue: ${value}`);
      console.log(`oldStatus: active -> superseded`);
      console.log(`newFactStatus: active`);
    }
  }

  // If previousValue is still not established, link to the latest existing record for this property
  if (!previousValue) {
    const propExisting = memories.filter(m => m.property === property && m.value.toLowerCase().trim() !== value.toLowerCase().trim());
    if (propExisting.length > 0) {
      propExisting.sort((a, b) => b.created_at - a.created_at || b.updated_at - a.updated_at);
      previousValue = propExisting[0].value;
      propExisting[0].superseded_by = newRecordId;
    }
  }

  const newRecord: MemoryRecord = {
    id: newRecordId,
    user_id: userId,
    property,
    value,
    content,
    category,
    status: 'active',
    importance,
    confidence: 1.0,
    created_at: now,
    updated_at: now,
    source_conversation_id: sourceConvId,
    entity_key: entityKey || property,
    previous_value: previousValue,
    subject,
    ownership
  };

  memories.push(newRecord);
  saveUserMemories(userId, memories);
  return newRecord;
}
