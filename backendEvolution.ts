import fs from 'fs';
import path from 'path';

// ============================================================
// EVOLVE AI — Deep Personalization Engine
// Manages a structured UserBehaviorModel per user.
// Replaces the flat globalSystemRules blob with a versioned,
// confidence-scored, context-aware behavioral rule system.
// ============================================================

export type RuleStatus = 'candidate' | 'experimental' | 'active' | 'stale' | 'superseded' | 'rejected';
export type RuleSource = 'explicit' | 'implicit' | 'correction' | 'positive_signal';
export type RuleContext = 'general' | 'coding' | 'debugging' | 'exam' | 'leetcode' | 'creative' | '*';
export type RuleCategory = 'communication' | 'tone' | 'formatting' | 'language' | 'coding' | 'workflow' | 'identity' | 'other';

export type EvolutionAction =
  | 'ADD'
  | 'UPDATE'
  | 'SUPERSEDE'
  | 'REMOVE'
  | 'EXPERIMENT'
  | 'NO_CHANGE'
  | 'ROLLBACK'
  | 'CONTRADICTION_RESOLVED';

export interface BehaviorRule {
  id: string;
  category: RuleCategory;
  context: RuleContext;
  rule: string;
  confidence: number;         // 0.0 to 1.0
  evidenceCount: number;      // How many signals support this rule
  status: RuleStatus;
  source: RuleSource;
  createdAt: number;
  updatedAt: number;
  lastConfirmedAt: number;
  expiresAt?: number;         // For temporary rules (null = permanent)
  interactionsRemainingBeforeExpiry?: number; // Count-down for temporary rules
  conflictsWith?: string[];   // IDs of conflicting rules
  supersededBy?: string;
  previousRule?: string;      // Snapshot for rollback
}

export interface EvolutionEvent {
  version: number;
  timestamp: number;
  action: EvolutionAction;
  ruleId?: string;
  ruleSnapshot?: Partial<BehaviorRule>;
  summary: string;
  evidence: string;
}

export interface UserBehaviorModel {
  userId: string;
  version: number;
  rules: BehaviorRule[];
  evolutionHistory: EvolutionEvent[];
  lastEvolvedAt: number;
  totalInteractionsSinceEvolution: number;
  manualRules?: string;
  pausedUntil?: number;       // Timestamp — if set and future, skip auto-evolution
}

// ============================================================
// STORAGE
// ============================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'users');

function getBehaviorModelPath(userId: string): string {
  const userDir = path.join(DATA_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return path.join(userDir, 'behavior_model.json');
}

export function loadBehaviorModel(userId: string): UserBehaviorModel {
  const filePath = getBehaviorModelPath(userId);
  if (!fs.existsSync(filePath)) {
    return createEmptyModel(userId);
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return createEmptyModel(userId);
    const parsed = JSON.parse(raw) as UserBehaviorModel;
    // Normalize and clean on load
    return {
      ...createEmptyModel(userId),
      ...parsed,
      rules: (parsed.rules || []).map(normalizeRule),
    };
  } catch (err) {
    console.error(`[BehaviorModel] Failed to load model for ${userId}`, err);
    return createEmptyModel(userId);
  }
}

export function saveBehaviorModel(model: UserBehaviorModel): void {
  const filePath = getBehaviorModelPath(model.userId);
  try {
    const tempPath = filePath + '.tmp_' + Date.now() + '_' + Math.random().toString(36).slice(7);
    fs.writeFileSync(tempPath, JSON.stringify(model, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    // Fallback without atomic rename
    try {
      fs.writeFileSync(filePath, JSON.stringify(model, null, 2), 'utf-8');
    } catch (e2) {
      console.error('[BehaviorModel] Failed to save behavior model', e2);
    }
  }
}

function createEmptyModel(userId: string): UserBehaviorModel {
  return {
    userId,
    version: 0,
    rules: [],
    evolutionHistory: [],
    lastEvolvedAt: 0,
    totalInteractionsSinceEvolution: 0,
  };
}

function normalizeRule(r: any): BehaviorRule {
  return {
    id: r.id || ('rule_' + Date.now() + '_' + Math.random().toString(36).slice(7)),
    category: r.category || 'other',
    context: r.context || '*',
    rule: r.rule || '',
    confidence: typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5,
    evidenceCount: typeof r.evidenceCount === 'number' ? r.evidenceCount : 1,
    status: r.status || 'active',
    source: r.source || 'implicit',
    createdAt: r.createdAt || Date.now(),
    updatedAt: r.updatedAt || Date.now(),
    lastConfirmedAt: r.lastConfirmedAt || Date.now(),
    expiresAt: r.expiresAt,
    interactionsRemainingBeforeExpiry: r.interactionsRemainingBeforeExpiry,
    conflictsWith: r.conflictsWith,
    supersededBy: r.supersededBy,
    previousRule: r.previousRule,
  };
}

// ============================================================
// CONTEXT DETECTION
// Lightweight heuristic — detects what the user is doing
// based on the current message.
// ============================================================

export function detectContext(userMessage: string): RuleContext {
  const msg = userMessage.toLowerCase();

  if (/\b(leetcode|hackerrank|competitive|dsa|data structure|algorithm|binary search|dp|dynamic programming|time complexity|space complexity)\b/i.test(msg)) {
    return 'leetcode';
  }
  if (/\b(debug|error|exception|stack trace|not working|fix this|why is|undefined|null pointer|crash|traceback)\b/i.test(msg)) {
    return 'debugging';
  }
  if (/\b(exam|revision|viva|interview prep|mcq|quiz|short notes|cheat sheet|quick summary|revise)\b/i.test(msg)) {
    return 'exam';
  }
  if (/\b(write.*code|code.*for|implement|function|class|snippet|program|script|sql|query|api|endpoint|component|hook|regex|algorithm|python|javascript|typescript|java|c\+\+|golang|rust|react|vue|node)\b/i.test(msg)) {
    return 'coding';
  }
  if (/\b(story|poem|essay|creative|write.*about|imagine|fiction|blog)\b/i.test(msg)) {
    return 'creative';
  }

  return 'general';
}

// ============================================================
// CONTEXTUAL RULE INJECTION
// Called from memory.ts before each request.
// Only injects rules relevant to the current query context.
// ============================================================

export function buildContextualRules(model: UserBehaviorModel, userMessage: string): string {
  if (!model) return '';
  const hasAutomatedRules = model.rules && model.rules.length > 0;
  const hasManualRules = model.manualRules && model.manualRules.trim().length > 0;
  
  if (!hasAutomatedRules && !hasManualRules) return '';

  const now = Date.now();
  const context = detectContext(userMessage);

  // Filter: active rules that match this context (or '*')
  const relevant = model.rules
    .filter(r => {
      if (r.status !== 'active' && r.status !== 'experimental') return false;
      if (r.expiresAt && r.expiresAt < now) return false; // Time-expired
      return r.context === '*' || r.context === context;
    })
    .sort((a, b) => {
      // Sort: explicit corrections first, then by confidence desc
      const sourceScore = (r: BehaviorRule) => r.source === 'correction' ? 1 : r.source === 'explicit' ? 0.8 : 0.5;
      return (sourceScore(b) * b.confidence) - (sourceScore(a) * a.confidence);
    })
    .slice(0, 8); // Hard cap: max 8 rules to avoid token bloat

  let finalOutput = '';

  if (hasManualRules) {
    finalOutput += `\n=== MANUAL BEHAVIOR RULES (User Overrides) ===\n${model.manualRules!.trim()}\n`;
  }

  if (relevant.length > 0) {
    const lines = relevant.map(r => {
      const prefix = r.status === 'experimental' ? '[Experimental] ' : '';
      const ctxTag = r.context !== '*' && r.context !== 'general' ? ` [${r.context} context]` : '';
      return `- ${prefix}${r.rule}${ctxTag}`;
    });
    finalOutput += `\n=== DYNAMIC BEHAVIOR RULES (Evolve AI) ===\n${lines.join('\n')}\n`;
  }

  return finalOutput.trim();
}

// ============================================================
// TEMPORARY RULE TICK
// Call this once per user interaction to count down
// temporary rules. Returns true if any rules were expired.
// ============================================================

export function tickTemporaryRules(model: UserBehaviorModel): boolean {
  let changed = false;
  const now = Date.now();

  for (const rule of model.rules) {
    if (rule.status !== 'active' && rule.status !== 'experimental') continue;

    // Time-based expiry
    if (rule.expiresAt && rule.expiresAt < now) {
      rule.status = 'stale';
      rule.updatedAt = now;
      changed = true;
      console.log(`[BehaviorModel] Temporary rule expired (time): "${rule.rule.substring(0, 60)}"`);
      continue;
    }

    // Interaction-count-based expiry
    if (typeof rule.interactionsRemainingBeforeExpiry === 'number') {
      rule.interactionsRemainingBeforeExpiry -= 1;
      rule.updatedAt = now;
      if (rule.interactionsRemainingBeforeExpiry <= 0) {
        rule.status = 'stale';
        changed = true;
        console.log(`[BehaviorModel] Temporary rule expired (interactions): "${rule.rule.substring(0, 60)}"`);
      }
    }
  }

  return changed;
}

// ============================================================
// CONTRADICTION RESOLVER
// Detects when a new rule conflicts with an existing one.
// Resolves by: contextual override, scope narrowing, or supersession.
// ============================================================

export interface ConflictResolution {
  existingRuleId: string;
  action: 'NARROW_SCOPE' | 'SUPERSEDE' | 'COEXIST' | 'MERGE';
  explanation: string;
}

export function resolveContradict(
  existingRule: BehaviorRule,
  newRuleText: string,
  newContext: RuleContext
): ConflictResolution {
  // If contexts differ — they can coexist (contextual override)
  if (existingRule.context !== newContext && existingRule.context !== '*' && newContext !== '*') {
    return {
      existingRuleId: existingRule.id,
      action: 'COEXIST',
      explanation: `Different contexts (${existingRule.context} vs ${newContext}). Both rules coexist.`,
    };
  }

  // If existing is inferred (implicit) and new is explicit/correction → supersede
  if ((existingRule.source === 'implicit' || existingRule.source === 'positive_signal')
    && existingRule.confidence < 0.75) {
    return {
      existingRuleId: existingRule.id,
      action: 'SUPERSEDE',
      explanation: `New explicit/correction supersedes low-confidence inferred rule.`,
    };
  }

  // If both are general and conflict — narrow scope of old rule
  if (existingRule.context === '*' && newContext !== '*') {
    return {
      existingRuleId: existingRule.id,
      action: 'NARROW_SCOPE',
      explanation: `Old general rule narrowed: new rule applies in ${newContext} context specifically.`,
    };
  }

  // Default: supersede the old one (explicit beats inferred)
  return {
    existingRuleId: existingRule.id,
    action: 'SUPERSEDE',
    explanation: `Direct conflict — new rule supersedes old one.`,
  };
}

// ============================================================
// SEMANTIC CONFLICT DETECTION
// Lightweight check: do two rule texts semantically oppose?
// ============================================================

const OPPOSING_PAIRS = [
  [/concise|short|brief|terse/i, /detailed|verbose|comprehensive|elaborate/i],
  [/english/i, /hinglish|hindi/i],
  [/formal/i, /casual|informal/i],
  [/bullet|list/i, /paragraph|prose/i],
  [/code.?first|show code/i, /explain.?first|theory.?first/i],
];

export function semanticConflictExists(ruleA: string, ruleB: string): boolean {
  for (const [patA, patB] of OPPOSING_PAIRS) {
    if ((patA.test(ruleA) && patB.test(ruleB)) || (patB.test(ruleA) && patA.test(ruleB))) {
      return true;
    }
  }
  return false;
}

// ============================================================
// EVOLUTION DECISION ENGINE
// Takes structured signals from the evaluator LLM and
// applies them to the UserBehaviorModel.
// ============================================================

export interface EvolutionSignal {
  type: 'correction' | 'preference' | 'frustration' | 'positive' | 'temporary' | 'factual';
  context: RuleContext;
  action: EvolutionAction;
  rule: string;
  category: RuleCategory;
  confidence: number;
  source: RuleSource;
  evidence: string;
  isTemporary?: boolean;
  temporaryDurationInteractions?: number;
  supersedeCandidateRuleIds?: string[];
}

export interface EvaluatorResult {
  signals: EvolutionSignal[];
  noChangeReason?: string;
}

export function applyEvolutionDecision(
  userId: string,
  result: EvaluatorResult
): { model: UserBehaviorModel; eventsApplied: EvolutionEvent[] } {
  const model = loadBehaviorModel(userId);
  const now = Date.now();
  const eventsApplied: EvolutionEvent[] = [];

  if (!result.signals || result.signals.length === 0) {
    const noChangeEvent: EvolutionEvent = {
      version: model.version,
      timestamp: now,
      action: 'NO_CHANGE',
      summary: 'No meaningful signals detected.',
      evidence: result.noChangeReason || 'Evaluator returned no signals.',
    };
    model.evolutionHistory = [noChangeEvent, ...model.evolutionHistory].slice(0, 50);
    model.lastEvolvedAt = now;
    saveBehaviorModel(model);
    return { model, eventsApplied: [noChangeEvent] };
  }

  for (const signal of result.signals) {
    if (!signal.rule || !signal.rule.trim()) continue;

    const ruleText = signal.rule.trim();
    const action = signal.action;

    // Deduplicate: check if semantically identical rule already exists
    const identical = model.rules.find(r => 
      (r.status === 'active' || r.status === 'experimental') &&
      r.rule.toLowerCase().trim() === ruleText.toLowerCase().trim()
    );
    if (identical) {
      // Just bump evidence count and confidence
      identical.evidenceCount += 1;
      identical.confidence = Math.max(signal.confidence, Math.min(1.0, identical.confidence + 0.05));
      if (identical.status === 'experimental' && identical.confidence >= 0.65) {
        identical.status = 'active';
      }
      identical.lastConfirmedAt = now;
      identical.updatedAt = now;
      continue;
    }

    // Find conflicting rules
    const conflicting = model.rules.filter(r =>
      (r.status === 'active' || r.status === 'experimental') &&
      (r.context === signal.context || r.context === '*' || signal.context === '*') &&
      semanticConflictExists(r.rule, ruleText)
    );

    // Resolve conflicts
    for (const conflict of conflicting) {
      const resolution = resolveContradict(conflict, ruleText, signal.context);

      if (resolution.action === 'SUPERSEDE') {
        const snapshot = { ...conflict };
        conflict.status = 'superseded';
        conflict.supersededBy = 'pending_new';
        conflict.updatedAt = now;

        const conflictEvent: EvolutionEvent = {
          version: model.version + 1,
          timestamp: now,
          action: 'CONTRADICTION_RESOLVED',
          ruleId: conflict.id,
          ruleSnapshot: snapshot,
          summary: `Conflict resolved: "${conflict.rule.substring(0, 60)}" → superseded`,
          evidence: resolution.explanation,
        };
        eventsApplied.push(conflictEvent);
      } else if (resolution.action === 'NARROW_SCOPE') {
        const snapshot = { ...conflict };
        conflict.context = signal.context === '*' ? 'general' : (signal.context === 'general' ? 'general' : conflict.context);
        conflict.updatedAt = now;

        const narrowEvent: EvolutionEvent = {
          version: model.version + 1,
          timestamp: now,
          action: 'CONTRADICTION_RESOLVED',
          ruleId: conflict.id,
          ruleSnapshot: snapshot,
          summary: `Scope narrowed: "${conflict.rule.substring(0, 60)}"`,
          evidence: resolution.explanation,
        };
        eventsApplied.push(narrowEvent);
      }
      // COEXIST: no action needed
    }

    // Explicitly supersede rules passed from evaluator
    if (signal.supersedeCandidateRuleIds && signal.supersedeCandidateRuleIds.length > 0) {
      for (const targetId of signal.supersedeCandidateRuleIds) {
        const target = model.rules.find(r => r.id === targetId);
        if (target && target.status === 'active') {
          target.status = 'superseded';
          target.updatedAt = now;
        }
      }
    }

    // Create the new rule
    const newRuleId = 'rule_' + now + '_' + Math.random().toString(36).slice(7);

    // Patch supersededBy for any rules we just superseded
    for (const r of model.rules) {
      if (r.supersededBy === 'pending_new') {
        r.supersededBy = newRuleId;
        r.previousRule = r.rule;
      }
    }

    // Determine status
    let newStatus: RuleStatus;
    const isTemporary = signal.isTemporary === true || signal.type === 'temporary';

    if (action === 'EXPERIMENT' || (signal.confidence < 0.65 && signal.type === 'preference')) {
      newStatus = 'experimental';
    } else if (signal.confidence >= 0.65 || signal.source === 'correction' || signal.source === 'explicit') {
      newStatus = 'active';
    } else {
      newStatus = 'candidate';
    }

    const newRule: BehaviorRule = {
      id: newRuleId,
      category: signal.category,
      context: signal.context,
      rule: ruleText,
      confidence: signal.confidence,
      evidenceCount: 1,
      status: newStatus,
      source: signal.source,
      createdAt: now,
      updatedAt: now,
      lastConfirmedAt: now,
      expiresAt: isTemporary ? (now + 2 * 60 * 60 * 1000) : undefined, // 2 hours for time-based
      interactionsRemainingBeforeExpiry: isTemporary
        ? (signal.temporaryDurationInteractions ?? 5)
        : undefined,
    };

    model.rules.push(newRule);
    model.version += 1;

    const event: EvolutionEvent = {
      version: model.version,
      timestamp: now,
      action: newStatus === 'experimental' ? 'EXPERIMENT' : 'ADD',
      ruleId: newRuleId,
      ruleSnapshot: { rule: ruleText, category: signal.category, context: signal.context },
      summary: `${newStatus === 'experimental' ? 'Experimenting with' : 'Added'}: "${ruleText.substring(0, 80)}"`,
      evidence: signal.evidence,
    };

    model.evolutionHistory = [event, ...model.evolutionHistory].slice(0, 50);
    eventsApplied.push(event);
  }

  model.lastEvolvedAt = now;
  saveBehaviorModel(model);
  return { model, eventsApplied };
}

// ============================================================
// ROLLBACK
// Restores the model to its state before the last
// meaningful evolution event.
// ============================================================

export function rollbackLastEvolution(userId: string): { success: boolean; message: string; model: UserBehaviorModel } {
  const model = loadBehaviorModel(userId);
  const now = Date.now();

  // Find the most recent ADD/UPDATE/SUPERSEDE/EXPERIMENT/CONTRADICTION_RESOLVED event
  const lastMeaningfulEvent = model.evolutionHistory.find(e =>
    e.action !== 'NO_CHANGE' && e.action !== 'ROLLBACK'
  );

  if (!lastMeaningfulEvent) {
    return { success: false, message: 'No evolution events to roll back.', model };
  }

  if (lastMeaningfulEvent.action === 'ADD' || lastMeaningfulEvent.action === 'EXPERIMENT') {
    // Remove the added rule
    const targetId = lastMeaningfulEvent.ruleId;
    if (targetId) {
      const idx = model.rules.findIndex(r => r.id === targetId);
      if (idx !== -1) {
        model.rules.splice(idx, 1);
      }
    }
  } else if (lastMeaningfulEvent.action === 'CONTRADICTION_RESOLVED') {
    // Restore the superseded rule from snapshot
    const snapshot = lastMeaningfulEvent.ruleSnapshot;
    if (snapshot && lastMeaningfulEvent.ruleId) {
      const existing = model.rules.find(r => r.id === lastMeaningfulEvent.ruleId);
      if (existing) {
        existing.status = 'active';
        existing.supersededBy = undefined;
        existing.updatedAt = now;
      }
    }
  }

  model.version += 1;
  const rollbackEvent: EvolutionEvent = {
    version: model.version,
    timestamp: now,
    action: 'ROLLBACK',
    summary: `Rolled back: "${lastMeaningfulEvent.summary}"`,
    evidence: 'User-initiated rollback.',
  };
  model.evolutionHistory = [rollbackEvent, ...model.evolutionHistory].slice(0, 50);

  saveBehaviorModel(model);
  return { success: true, message: 'Rolled back last evolution change.', model };
}

// ============================================================
// PROMOTE / REJECT EXPERIMENTAL RULES
// For the UI "Experiments" tab.
// ============================================================

export function promoteExperimentalRule(userId: string, ruleId: string): boolean {
  const model = loadBehaviorModel(userId);
  const rule = model.rules.find(r => r.id === ruleId && r.status === 'experimental');
  if (!rule) return false;
  rule.status = 'active';
  rule.confidence = Math.min(1.0, rule.confidence + 0.1);
  rule.updatedAt = Date.now();
  delete rule.expiresAt;
  delete rule.interactionsRemainingBeforeExpiry;
  saveBehaviorModel(model);
  return true;
}

export function rejectExperimentalRule(userId: string, ruleId: string): boolean {
  const model = loadBehaviorModel(userId);
  const rule = model.rules.find(r => r.id === ruleId);
  if (!rule) return false;
  rule.status = 'rejected';
  rule.updatedAt = Date.now();
  saveBehaviorModel(model);
  return true;
}

export function deleteRule(userId: string, ruleId: string): boolean {
  const model = loadBehaviorModel(userId);
  const idx = model.rules.findIndex(r => r.id === ruleId);
  if (idx === -1) return false;
  model.rules.splice(idx, 1);
  saveBehaviorModel(model);
  return true;
}

// ============================================================
// MIGRATION HELPER
// Convert existing flat globalSystemRules string into BehaviorRules.
// Called once on first load when no behavior_model.json exists
// but globalSystemRules string is present.
// ============================================================

export function migrateFromGlobalSystemRules(
  userId: string,
  globalSystemRules: string
): UserBehaviorModel {
  const model = loadBehaviorModel(userId);
  if (model.rules.length > 0) return model; // Already migrated

  if (!globalSystemRules || !globalSystemRules.trim()) return model;

  const now = Date.now();
  const lines = globalSystemRules
    .split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 10);

  let version = model.version;
  for (const line of lines) {
    const ruleId = 'rule_' + now + '_' + Math.random().toString(36).slice(7);
    const rule: BehaviorRule = {
      id: ruleId,
      category: 'other',
      context: '*',
      rule: line,
      confidence: 0.8, // Trust old rules with reasonable confidence
      evidenceCount: 3, // Assume some evidence existed
      status: 'active',
      source: 'implicit',
      createdAt: now,
      updatedAt: now,
      lastConfirmedAt: now,
    };
    model.rules.push(rule);
    version += 1;
  }

  model.version = version;
  model.evolutionHistory = [{
    version,
    timestamp: now,
    action: 'ADD' as EvolutionAction,
    summary: `Migrated ${lines.length} rules from legacy globalSystemRules`,
    evidence: 'One-time migration from flat string to structured model.',
  }, ...model.evolutionHistory].slice(0, 50);

  saveBehaviorModel(model);
  console.log(`[BehaviorModel] Migrated ${lines.length} legacy rules for user ${userId}`);
  return model;
}

// ============================================================
// CORRECTION SIGNAL DETECTION
// Lightweight heuristic for App.tsx auto-trigger.
// Returns true if the user message looks like a correction
// that should trigger immediate evolution.
// ============================================================

export function isCorrectionSignal(userMessage: string): boolean {
  if (!userMessage || userMessage.length < 3) return false;
  const msg = userMessage.toLowerCase();
  return /\b(don't|do not|stop|never|you forgot|you always|wrong|incorrect|i said|remember|told you|i told|not like this|i asked for|please remember|i prefer|from now on|always use|always say|never say|never use)\b/i.test(msg);
}

// ============================================================
// GET READABLE SUMMARY FOR PROMPT INJECTION
// Called by buildContextualRules wrapper in memory.ts
// ============================================================

export function getActiveRulesForPrompt(userId: string, userMessage: string): string {
  const model = loadBehaviorModel(userId);
  return buildContextualRules(model, userMessage);
}

// ============================================================
// PAUSE / RESUME EVOLUTION
// ============================================================

export function pauseEvolution(userId: string, durationMs: number): void {
  const model = loadBehaviorModel(userId);
  model.pausedUntil = Date.now() + durationMs;
  saveBehaviorModel(model);
}

export function resumeEvolution(userId: string): void {
  const model = loadBehaviorModel(userId);
  delete model.pausedUntil;
  saveBehaviorModel(model);
}

export function isEvolutionPaused(userId: string): boolean {
  const model = loadBehaviorModel(userId);
  return !!(model.pausedUntil && model.pausedUntil > Date.now());
}
