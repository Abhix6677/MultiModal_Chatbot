/**
 * COMPREHENSIVE TEMPORAL MEMORY REGRESSION TEST SUITE
 * Tests 1-10 as specified in the requirements.
 */
import assert from 'assert';
import {
  getUserMemories,
  saveUserMemories,
  updateOrAddMemory,
  buildContext,
  getChronologicalHistory,
  retrieveRelevantMemories,
  enforceSingleActiveInvariant,
  MemoryRecord
} from '../backendMemory';

const TEST_USER = 'temporal_test_user_' + Date.now();

function assertSingleActive(userId: string, property: string, expectedValue: string, label: string) {
  const mems = getUserMemories(userId);
  const active = mems.filter(m => m.property === property && m.status === 'active');
  assert.strictEqual(active.length, 1, `${label}: Expected exactly 1 active, got ${active.length}`);
  assert.strictEqual(active[0].value, expectedValue, `${label}: Active value should be ${expectedValue}, got ${active[0].value}`);
}

function assertPrevious(userId: string, query: string, expectedPrev: string, label: string) {
  const ctx = buildContext(userId, 'test', query, 'nemotron', []);
  assert.strictEqual(ctx.retrievedMemories.length, 1, `${label}: Should return exactly 1 memory, got ${ctx.retrievedMemories.length}`);
  assert.strictEqual(ctx.retrievedMemories[0].value, expectedPrev, `${label}: Previous should be ${expectedPrev}, got ${ctx.retrievedMemories[0].value}`);
  // Must NOT contain full history
  assert(!ctx.contextStr.includes('[FULL CHRONOLOGICAL HISTORY') && !ctx.contextStr.includes('Oldest to Newest'), `${label}: PREVIOUS context must not contain full history block`);
}

function assertCurrent(userId: string, query: string, expectedCur: string, label: string) {
  const ctx = buildContext(userId, 'test', query, 'nemotron', []);
  assert.strictEqual(ctx.retrievedMemories.length, 1, `${label}: Should return exactly 1 memory, got ${ctx.retrievedMemories.length}`);
  assert.strictEqual(ctx.retrievedMemories[0].value, expectedCur, `${label}: Current should be ${expectedCur}, got ${ctx.retrievedMemories[0].value}`);
}

function assertHistory(userId: string, query: string, expectedChain: string[], label: string) {
  const ctx = buildContext(userId, 'test', query, 'qwen', []);
  const chain = (ctx.historyChain || []).map(m => m.value);
  assert.deepStrictEqual(chain, expectedChain, `${label}: History chain should be ${JSON.stringify(expectedChain)}, got ${JSON.stringify(chain)}`);
}

async function runTests() {
  console.log('============================================================');
  console.log('COMPREHENSIVE TEMPORAL MEMORY REGRESSION TEST SUITE');
  console.log('============================================================\n');

  // Initialize clean test user
  saveUserMemories(TEST_USER, []);

  // ================================================================
  // TEST 1: A → B
  // ================================================================
  console.log('--- TEST 1: A → B ---');
  updateOrAddMemory(TEST_USER, "My project is ProjectA.", "project", "c1", [], 4, "project.current", "ProjectA");
  updateOrAddMemory(TEST_USER, "My project is ProjectB. This replaces ProjectA.", "project", "c2", [], 4, "project.current", "ProjectB");

  assertCurrent(TEST_USER, "What is my current project?", "ProjectB", "Test1-current");
  assertPrevious(TEST_USER, "What was my previous project?", "ProjectA", "Test1-previous");
  assertHistory(TEST_USER, "Give me my project history from oldest to newest", ["ProjectA", "ProjectB"], "Test1-history");
  assertSingleActive(TEST_USER, 'current_project_name', 'ProjectB', 'Test1-singleActive');
  console.log('  ✅ TEST 1 PASSED\n');

  // ================================================================
  // TEST 2: A → B → C
  // ================================================================
  console.log('--- TEST 2: A → B → C ---');
  const USER2 = TEST_USER + '_t2';
  saveUserMemories(USER2, []);
  updateOrAddMemory(USER2, "My project is Alpha.", "project", "c1", [], 4, "project.current", "Alpha");
  updateOrAddMemory(USER2, "My project is Beta. This replaces Alpha.", "project", "c2", [], 4, "project.current", "Beta");
  updateOrAddMemory(USER2, "My project is Charlie. This replaces Beta.", "project", "c3", [], 4, "project.current", "Charlie");

  assertCurrent(USER2, "What is my current project?", "Charlie", "Test2-current");
  assertPrevious(USER2, "What was my previous project?", "Beta", "Test2-previous");
  assertHistory(USER2, "Give me my project history from oldest to newest", ["Alpha", "Beta", "Charlie"], "Test2-history");
  assertSingleActive(USER2, 'current_project_name', 'Charlie', 'Test2-singleActive');
  console.log('  ✅ TEST 2 PASSED\n');

  // ================================================================
  // TEST 3: A → B → C → D
  // ================================================================
  console.log('--- TEST 3: A → B → C → D ---');
  const USER3 = TEST_USER + '_t3';
  saveUserMemories(USER3, []);
  updateOrAddMemory(USER3, "My project is P1.", "project", "c1", [], 4, "project.current", "P1");
  updateOrAddMemory(USER3, "My project is P2. This replaces P1.", "project", "c2", [], 4, "project.current", "P2");
  updateOrAddMemory(USER3, "My project is P3. This replaces P2.", "project", "c3", [], 4, "project.current", "P3");
  updateOrAddMemory(USER3, "My project is P4. This replaces P3.", "project", "c4", [], 4, "project.current", "P4");

  assertCurrent(USER3, "What is my current project?", "P4", "Test3-current");
  assertPrevious(USER3, "What was my previous project?", "P3", "Test3-previous");
  assertHistory(USER3, "Give me my project history from oldest to newest", ["P1", "P2", "P3", "P4"], "Test3-history");
  assertSingleActive(USER3, 'current_project_name', 'P4', 'Test3-singleActive');
  console.log('  ✅ TEST 3 PASSED\n');

  // ================================================================
  // TEST 4: Exact bug reproduction — 6-chain
  // SkyHost → TitanCloud → AlphaTest → BetaTest → AlphaTest2026 → GammaTest
  // ================================================================
  console.log('--- TEST 4: Exact 6-chain bug reproduction ---');
  const USER4 = TEST_USER + '_t4';
  saveUserMemories(USER4, []);
  updateOrAddMemory(USER4, "I started SkyHost.", "project", "c1", [], 4, "project.current", "SkyHost");
  updateOrAddMemory(USER4, "My project is TitanCloud. This replaces SkyHost.", "project", "c2", [], 4, "project.current", "TitanCloud");
  updateOrAddMemory(USER4, "My project is AlphaTest. This replaces TitanCloud.", "project", "c3", [], 4, "project.current", "AlphaTest");
  updateOrAddMemory(USER4, "My project is BetaTest. This replaces AlphaTest.", "project", "c4", [], 4, "project.current", "BetaTest");
  updateOrAddMemory(USER4, "My project is AlphaTest2026. This replaces BetaTest.", "project", "c5", [], 4, "project.current", "AlphaTest2026");
  updateOrAddMemory(USER4, "My current project is GammaTest.", "project", "c6", [], 4, "project.current", "GammaTest");

  assertCurrent(USER4, "What is my current project?", "GammaTest", "Test4-current");
  assertPrevious(USER4, "What was my previous project?", "AlphaTest2026", "Test4-previous");
  assertHistory(USER4, "Give me my project name history from oldest to newest", 
    ["SkyHost", "TitanCloud", "AlphaTest", "BetaTest", "AlphaTest2026", "GammaTest"], "Test4-history");
  assertSingleActive(USER4, 'current_project_name', 'GammaTest', 'Test4-singleActive');
  console.log('  ✅ TEST 4 PASSED\n');

  // ================================================================
  // TEST 5: Idempotency
  // ================================================================
  console.log('--- TEST 5: Idempotency ---');
  const countBefore5 = getUserMemories(USER4).length;
  updateOrAddMemory(USER4, "My current project is GammaTest.", "project", "c7", [], 4, "project.current", "GammaTest");
  updateOrAddMemory(USER4, "GammaTest", "project", "c8", [], 4, "project.current", "GammaTest");
  updateOrAddMemory(USER4, "My project is GammaTest.", "project", "c9", [], 4, "project.current", "GammaTest");
  const countAfter5 = getUserMemories(USER4).length;
  assert.strictEqual(countAfter5, countBefore5, `Test5: Record count changed from ${countBefore5} to ${countAfter5}`);
  assertSingleActive(USER4, 'current_project_name', 'GammaTest', 'Test5-singleActive');
  assertPrevious(USER4, "What was my previous project?", "AlphaTest2026", "Test5-prevAfterRepeat");
  console.log('  ✅ TEST 5 PASSED\n');

  // ================================================================
  // TEST 6: Query purity — queries must never mutate memory
  // ================================================================
  console.log('--- TEST 6: Query purity ---');
  const memsBefore6 = JSON.stringify(getUserMemories(USER4));
  for (let i = 0; i < 5; i++) {
    buildContext(USER4, `q${i}`, "What is my current project?", "nemotron", []);
    buildContext(USER4, `q${i}`, "What was my previous project?", "mistral", []);
    buildContext(USER4, `q${i}`, "Give me my project name history from oldest to newest", "qwen", []);
  }
  const memsAfter6 = JSON.stringify(getUserMemories(USER4));
  assert.strictEqual(memsBefore6, memsAfter6, "Test6: Memory state was mutated by queries!");
  console.log('  ✅ TEST 6 PASSED\n');

  // ================================================================
  // TEST 7: Reload persistence
  // ================================================================
  console.log('--- TEST 7: Reload persistence ---');
  // Force re-read from disk
  const reloaded = getUserMemories(USER4);
  const ctx7cur = buildContext(USER4, "r1", "What is my current project?", "nemotron", []);
  const ctx7prev = buildContext(USER4, "r2", "What was my previous project?", "mistral", []);
  const ctx7hist = buildContext(USER4, "r3", "Give me my project name history from oldest to newest", "qwen", []);
  assert.strictEqual(ctx7cur.retrievedMemories[0].value, "GammaTest", "Test7: Current after reload");
  assert.strictEqual(ctx7prev.retrievedMemories[0].value, "AlphaTest2026", "Test7: Previous after reload");
  const chain7 = (ctx7hist.historyChain || []).map(m => m.value);
  assert.deepStrictEqual(chain7, ["SkyHost", "TitanCloud", "AlphaTest", "BetaTest", "AlphaTest2026", "GammaTest"], "Test7: History after reload");
  console.log('  ✅ TEST 7 PASSED\n');

  // ================================================================
  // TEST 8: Cross-chat
  // ================================================================
  console.log('--- TEST 8: Cross-chat ---');
  const ctxA = buildContext(USER4, "chatA", "What is my current project?", "nemotron", []);
  const ctxB = buildContext(USER4, "chatB", "What is my current project?", "nemotron", []);
  const ctxC = buildContext(USER4, "chatC", "What was my previous project?", "mistral", []);
  assert.strictEqual(ctxA.retrievedMemories[0].value, "GammaTest", "Test8: ChatA current");
  assert.strictEqual(ctxB.retrievedMemories[0].value, "GammaTest", "Test8: ChatB current");
  assert.strictEqual(ctxC.retrievedMemories[0].value, "AlphaTest2026", "Test8: ChatC previous");
  console.log('  ✅ TEST 8 PASSED\n');

  // ================================================================
  // TEST 9: Cross-model
  // ================================================================
  console.log('--- TEST 9: Cross-model ---');
  const models = ["mistral", "nemotron", "qwen", "glm", "intern"];
  for (const model of models) {
    const ctx = buildContext(USER4, "model_test", "What is my current project?", model, []);
    assert.strictEqual(ctx.retrievedMemories[0].value, "GammaTest", `Test9: Model ${model} current`);
    const ctxP = buildContext(USER4, "model_test", "What was my previous project?", model, []);
    assert.strictEqual(ctxP.retrievedMemories[0].value, "AlphaTest2026", `Test9: Model ${model} previous`);
  }
  console.log('  ✅ TEST 9 PASSED\n');

  // ================================================================
  // TEST 10: Update after reload — GammaTest → DeltaTest
  // ================================================================
  console.log('--- TEST 10: Update after reload ---');
  // Simulate reload by re-reading from disk
  getUserMemories(USER4);
  updateOrAddMemory(USER4, "My current project is DeltaTest. This replaces GammaTest.", "project", "c10", [], 4, "project.current", "DeltaTest");
  
  assertCurrent(USER4, "What is my current project?", "DeltaTest", "Test10-current");
  assertPrevious(USER4, "What was my previous project?", "GammaTest", "Test10-previous");
  const chain10 = buildContext(USER4, "t10", "Give me my project name history from oldest to newest", "qwen", []);
  const chain10vals = (chain10.historyChain || []).map(m => m.value);
  assert(chain10vals[chain10vals.length - 1] === "DeltaTest", "Test10: Last in history must be DeltaTest");
  assert(chain10vals[chain10vals.length - 2] === "GammaTest", "Test10: Second-to-last must be GammaTest");
  assertSingleActive(USER4, 'current_project_name', 'DeltaTest', 'Test10-singleActive');
  console.log('  ✅ TEST 10 PASSED\n');

  // ================================================================
  // VALIDATION RULES A-H
  // ================================================================
  console.log('--- VALIDATION RULES A-H ---');
  const allMems = getUserMemories(USER4);
  const projMems = allMems.filter(m => m.property === 'current_project_name');
  
  // Rule A: At most ONE active
  const activeCount = projMems.filter(m => m.status === 'active').length;
  assert.strictEqual(activeCount, 1, `Rule A: Expected 1 active, got ${activeCount}`);
  
  // Rule B: Active has no superseded_by
  const activeRec = projMems.find(m => m.status === 'active')!;
  assert(!activeRec.superseded_by, `Rule B: Active record has superseded_by=${activeRec.superseded_by}`);
  
  // Rule C: Every superseded record points toward newer record
  for (const m of projMems.filter(r => r.status === 'superseded' && r.superseded_by)) {
    const successor = projMems.find(s => s.id === m.superseded_by);
    assert(successor, `Rule C: superseded_by ${m.superseded_by} not found for ${m.value}`);
    assert(successor!.created_at >= m.created_at, `Rule C: ${m.value} superseded_by ${successor!.value} but successor is older`);
  }
  
  // Rule D: No cycles
  const visited = new Set<string>();
  let current: MemoryRecord | undefined = activeRec;
  while (current && current.previous_value) {
    const prevNorm = current.previous_value.toLowerCase().trim();
    assert(!visited.has(prevNorm), `Rule D: Cycle detected at ${current.value} -> ${current.previous_value}`);
    visited.add(prevNorm);
    current = projMems.find(m => m.value.toLowerCase().trim() === prevNorm);
  }
  
  // Rule E: No duplicate values
  const vals = projMems.map(m => m.value.toLowerCase().trim());
  const uniqueVals = new Set(vals);
  assert.strictEqual(vals.length, uniqueVals.size, `Rule E: Duplicate values found`);
  
  // Rule F: Each predecessor has at most one successor
  const prevMap: Record<string, string[]> = {};
  for (const m of projMems) {
    if (m.previous_value) {
      const k = m.previous_value.toLowerCase().trim();
      if (!prevMap[k]) prevMap[k] = [];
      prevMap[k].push(m.value);
      assert(prevMap[k].length <= 1, `Rule F: ${m.previous_value} has multiple successors: ${prevMap[k].join(', ')}`);
    }
  }
  
  // Rule G: History terminates
  const history = getChronologicalHistory(allMems, 'current_project_name');
  assert(history.length > 0, `Rule G: Empty history`);
  assert(history.length <= 100, `Rule G: History too long (${history.length}), possible infinite loop`);
  
  // Rule H: Current + predecessor consistent
  assert.strictEqual(activeRec.previous_value, history[history.length - 2]?.value, 
    `Rule H: Active.previous_value (${activeRec.previous_value}) != history[-2] (${history[history.length - 2]?.value})`);
  
  console.log('  ✅ ALL VALIDATION RULES A-H PASSED\n');

  console.log('============================================================');
  console.log('✅ ALL 10 TESTS + VALIDATION RULES PASSED SUCCESSFULLY');
  console.log('============================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILURE:', err.message);
  process.exit(1);
});
