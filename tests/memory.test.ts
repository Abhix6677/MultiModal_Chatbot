import { 
  ensureUserDir, 
  getUserMemories, 
  saveUserMemories, 
  retrieveRelevantMemories, 
  updateOrAddMemory, 
  buildContext,
  getChronologicalHistory
} from '../backendMemory.js';
import assert from 'assert';
import fs from 'fs';

async function runTests() {
  console.log(`Starting comprehensive temporal memory and transition test suite...`);

  // ============================================================
  // TEST SUITE 1: SkyHost -> TitanCloud (User's Exact Scenario)
  // ============================================================
  const USER_SKY_TITAN = 'test_sky_titan_' + Date.now();
  saveUserMemories(USER_SKY_TITAN, []);

  // Step 1: User says initial project is SkyHost
  updateOrAddMemory(USER_SKY_TITAN, "I'm building SkyHost.", "project", "chat_1", [], 4, "project.current", "SkyHost");

  // Step 2: User says "My current project is now TitanCloud. This replaces SkyHost completely."
  updateOrAddMemory(USER_SKY_TITAN, "My current project is now TitanCloud. This replaces SkyHost completely.", "project", "chat_2", [], 4, "project.current", "TitanCloud");

  // Verify DB state
  const skyTitanMems = getUserMemories(USER_SKY_TITAN);
  const activeSkyTitan = skyTitanMems.filter(m => m.property === 'current_project_name' && m.status === 'active');
  const supersededSkyTitan = skyTitanMems.filter(m => m.property === 'current_project_name' && m.status === 'superseded');

  assert.strictEqual(activeSkyTitan.length, 1, `Test 1 Failed: Expected exactly 1 active project, got ${activeSkyTitan.length}`);
  assert.strictEqual(activeSkyTitan[0].value, 'TitanCloud', "Test 1 Failed: Active project must be TitanCloud");
  assert.strictEqual(supersededSkyTitan.length, 1, `Test 1 Failed: Expected 1 superseded project, got ${supersededSkyTitan.length}`);
  assert.strictEqual(supersededSkyTitan[0].value, 'SkyHost', "Test 1 Failed: Superseded project must be SkyHost");

  // Check 1: "What is my current project?" -> TitanCloud
  const curCtx1 = buildContext(USER_SKY_TITAN, "chat_3", "What is my current project?", "nemotron", []);
  assert(curCtx1.contextStr.includes("TitanCloud"), "Test 1 Failed: TitanCloud missing from current project query");
  assert(!curCtx1.contextStr.includes("Current Value: SkyHost"), "Test 1 Failed: SkyHost should not be the current value");

  // Check 2: "What was my previous project name?" -> SkyHost
  const prevCtx1 = buildContext(USER_SKY_TITAN, "chat_4", "What was my previous project name?", "mistral", []);
  assert(prevCtx1.contextStr.includes("SkyHost"), "Test 1 Failed: SkyHost missing from previous project query");
  assert(prevCtx1.contextStr.includes("Do NOT answer with \"TitanCloud\""), "Test 1 Failed: Safety prompt for previous project missing");

  // Check 3: "Give me my project name history from oldest to newest" -> [SkyHost, TitanCloud]
  const histCtx1 = buildContext(USER_SKY_TITAN, "chat_5", "Give me my project name history from oldest to newest", "qwen", []);
  assert(histCtx1.contextStr.includes("1. SkyHost (Original)"), "Test 1 Failed: SkyHost must be #1 in history");
  assert(histCtx1.contextStr.includes("2. TitanCloud (Current Active)"), "Test 1 Failed: TitanCloud must be #2 in history");
  // Ensure no duplicate TitanCloud in history string
  const titanCount = (histCtx1.contextStr.match(/TitanCloud/g) || []).length;
  assert(titanCount <= 2, `Test 1 Failed: TitanCloud duplicated in history output (found ${titanCount} times)`);

  // ============================================================
  // TEST SUITE 2 (Requirement 15A): 3-Chain (A -> B -> C)
  // current = C, previous = B, history = [A, B, C]
  // ============================================================
  const USER_ABC = 'test_abc_' + Date.now();
  saveUserMemories(USER_ABC, []);

  updateOrAddMemory(USER_ABC, "My project is Project A.", "project", "c1", [], 4, "project.current", "Project A");
  updateOrAddMemory(USER_ABC, "My project is now Project B.", "project", "c2", [], 4, "project.current", "Project B");
  updateOrAddMemory(USER_ABC, "My project is now Project C.", "project", "c3", [], 4, "project.current", "Project C");

  const curABC = buildContext(USER_ABC, "c4", "What is my current project?", "nemotron", []);
  assert(curABC.contextStr.includes("Project C"), "Test 2 Failed: Current must be Project C");

  const prevABC = buildContext(USER_ABC, "c5", "What was my previous project?", "mistral", []);
  assert(prevABC.contextStr.includes("Project B"), "Test 2 Failed: Previous must be Project B");
  assert(!prevABC.contextStr.includes("Previous Value: Project C"), "Test 2 Failed: Previous must not be Project C");

  const histABC = buildContext(USER_ABC, "c6", "Give me my project history from oldest to newest", "glm", []);
  assert(histABC.contextStr.includes("Project A -> Project B -> Project C"), "Test 2 Failed: Full history chain incorrect");

  // ============================================================
  // TEST SUITE 3 (Requirement 15B): 4-Chain (A -> B -> C -> D)
  // current = D, previous = C, history = [A, B, C, D]
  // ============================================================
  const USER_ABCD = 'test_abcd_' + Date.now();
  saveUserMemories(USER_ABCD, []);

  updateOrAddMemory(USER_ABCD, "I started NovaHost.", "project", "c1", [], 4, "project.current", "NovaHost");
  updateOrAddMemory(USER_ABCD, "NovaHost is now EdgeHost.", "project", "c2", [], 4, "project.current", "EdgeHost");
  updateOrAddMemory(USER_ABCD, "EdgeHost is now AlphaCore.", "project", "c3", [], 4, "project.current", "AlphaCore");
  updateOrAddMemory(USER_ABCD, "AlphaCore is now BetaCore.", "project", "c4", [], 4, "project.current", "BetaCore");

  const curABCD = buildContext(USER_ABCD, "c5", "What is my current project?", "nemotron", []);
  assert(curABCD.contextStr.includes("BetaCore"), "Test 3 Failed: Current must be BetaCore");

  const prevABCD = buildContext(USER_ABCD, "c6", "What was my previous project?", "qwen", []);
  assert(prevABCD.contextStr.includes("AlphaCore"), "Test 3 Failed: Previous must be AlphaCore");

  const histABCD = buildContext(USER_ABCD, "c7", "Give me my project history from oldest to newest", "glm", []);
  assert(histABCD.contextStr.includes("NovaHost -> EdgeHost -> AlphaCore -> BetaCore"), "Test 3 Failed: 4-chain history incorrect");

  // ============================================================
  // TEST SUITE 4 (Requirement 15C & 15D): Idempotency & Repeated Query Safety
  // ============================================================
  const USER_IDEMPOTENT = 'test_idem_' + Date.now();
  saveUserMemories(USER_IDEMPOTENT, []);

  // Initial
  updateOrAddMemory(USER_IDEMPOTENT, "My project is SkyHost.", "project", "c1", [], 4, "project.current", "SkyHost");
  // Rename
  updateOrAddMemory(USER_IDEMPOTENT, "My project is TitanCloud.", "project", "c2", [], 4, "project.current", "TitanCloud");
  
  // Repeated statement of the same current project in new chat
  updateOrAddMemory(USER_IDEMPOTENT, "I am continuing work on TitanCloud.", "project", "c3", [], 4, "project.current", "TitanCloud");
  updateOrAddMemory(USER_IDEMPOTENT, "My project is TitanCloud.", "project", "c4", [], 4, "project.current", "TitanCloud");

  const idemMems = getUserMemories(USER_IDEMPOTENT);
  const activeIdem = idemMems.filter(m => m.property === 'current_project_name' && m.status === 'active');
  const supersededIdem = idemMems.filter(m => m.property === 'current_project_name' && m.status === 'superseded');

  assert.strictEqual(activeIdem.length, 1, `Test 4 Failed: Expected 1 active record after repeated statements, got ${activeIdem.length}`);
  assert.strictEqual(activeIdem[0].value, 'TitanCloud', "Test 4 Failed: Active must be TitanCloud");
  assert.strictEqual(supersededIdem.length, 1, `Test 4 Failed: Expected exactly 1 superseded record (SkyHost), got ${supersededIdem.length}`);
  assert.strictEqual(supersededIdem[0].value, 'SkyHost', "Test 4 Failed: Superseded must be SkyHost");

  // Query Previous Project
  const prevIdem = buildContext(USER_IDEMPOTENT, "c5", "What was my previous project name?", "mistral", []);
  assert(prevIdem.contextStr.includes("SkyHost"), "Test 4 Failed: Previous project must be SkyHost despite repeated TitanCloud turns");
  assert(!prevIdem.contextStr.includes("Previous Value: TitanCloud"), "Test 4 Failed: Previous project must never be TitanCloud");

  // ============================================================
  // TEST SUITE 6 (Requirement 9A & 9B): Query Non-Mutation & No Contamination
  // Asking questions MUST NEVER mutate memory count or memory content
  // ============================================================
  const USER_QUERY_SAFETY = 'test_query_safety_' + Date.now();
  saveUserMemories(USER_QUERY_SAFETY, []);

  // Setup initial facts
  updateOrAddMemory(USER_QUERY_SAFETY, "My name is Abhishek.", "identity", "c1", [], 5, "identity.name", "Abhishek");
  updateOrAddMemory(USER_QUERY_SAFETY, "My current project is SkyHost.", "project", "c2", [], 4, "project.current", "SkyHost");
  updateOrAddMemory(USER_QUERY_SAFETY, "My current project is TitanCloud. This replaces SkyHost.", "project", "c3", [], 4, "project.current", "TitanCloud");

  const countBeforeQueries = getUserMemories(USER_QUERY_SAFETY).length;
  const activeBeforeQueries = getUserMemories(USER_QUERY_SAFETY).filter(m => m.status === 'active').map(m => `${m.property}:${m.value}`);

  // Test A: User asks "What is my current project?"
  const queryResultA = buildContext(USER_QUERY_SAFETY, "c4", "What is my current project?", "nemotron", []);
  assert(queryResultA.contextStr.includes("TitanCloud"), "Test A Failed: Context must contain current project TitanCloud");
  
  const countAfterQueryA = getUserMemories(USER_QUERY_SAFETY).length;
  assert.strictEqual(countAfterQueryA, countBeforeQueries, "Test A Failed: Memory count changed after asking 'What is my current project?'");

  // Test B: User asks "What was my previous project?"
  const queryResultB = buildContext(USER_QUERY_SAFETY, "c5", "What was my previous project?", "mistral", []);
  assert(queryResultB.contextStr.includes("SkyHost"), "Test B Failed: Context must contain previous project SkyHost");

  const countAfterQueryB = getUserMemories(USER_QUERY_SAFETY).length;
  assert.strictEqual(countAfterQueryB, countBeforeQueries, "Test B Failed: Memory count changed after asking 'What was my previous project?'");

  // Additional Queries: history, name, nickname, cgpa
  buildContext(USER_QUERY_SAFETY, "c6", "Give me my project history from oldest to newest", "qwen", []);
  buildContext(USER_QUERY_SAFETY, "c7", "Who am I?", "glm", []);
  buildContext(USER_QUERY_SAFETY, "c8", "What is my nickname?", "nemotron", []);
  buildContext(USER_QUERY_SAFETY, "c9", "What is my current CGPA?", "mistral", []);

  const countAfterAllQueries = getUserMemories(USER_QUERY_SAFETY).length;
  assert.strictEqual(countAfterAllQueries, countBeforeQueries, "Test 6 Failed: Queries mutated memory storage");

  const activeAfterQueries = getUserMemories(USER_QUERY_SAFETY).filter(m => m.status === 'active').map(m => `${m.property}:${m.value}`);
  assert.deepStrictEqual(activeAfterQueries, activeBeforeQueries, "Test 6 Failed: Active memory states changed after queries");

  // ============================================================
  // TEST SUITE 7 (Requirement 9D): SkyHost -> TitanCloud -> AlphaTest
  // current = AlphaTest, previous = TitanCloud, full history = [SkyHost, TitanCloud, AlphaTest]
  // ============================================================
  const USER_SKY_TITAN_ALPHA = 'test_sky_titan_alpha_' + Date.now();
  saveUserMemories(USER_SKY_TITAN_ALPHA, []);

  updateOrAddMemory(USER_SKY_TITAN_ALPHA, "My current project is SkyHost.", "project", "c1", [], 4, "project.current", "SkyHost");
  updateOrAddMemory(USER_SKY_TITAN_ALPHA, "My current project is TitanCloud. This replaces SkyHost.", "project", "c2", [], 4, "project.current", "TitanCloud");
  updateOrAddMemory(USER_SKY_TITAN_ALPHA, "My current project is AlphaTest. This replaces TitanCloud.", "project", "c3", [], 4, "project.current", "AlphaTest");

  const staMems = getUserMemories(USER_SKY_TITAN_ALPHA);
  const activeSTA = staMems.filter(m => m.property === 'current_project_name' && m.status === 'active');
  const supersededSTA = staMems.filter(m => m.property === 'current_project_name' && m.status === 'superseded');

  assert.strictEqual(activeSTA.length, 1, `Test 7 Failed: Expected 1 active project, got ${activeSTA.length}`);
  assert.strictEqual(activeSTA[0].value, 'AlphaTest', "Test 7 Failed: Active must be AlphaTest");
  assert.strictEqual(supersededSTA.length, 2, `Test 7 Failed: Expected 2 superseded projects, got ${supersededSTA.length}`);

  // Query Current:
  const curSTA = buildContext(USER_SKY_TITAN_ALPHA, "c4", "What is my current project?", "nemotron", []);
  assert(curSTA.contextStr.includes("AlphaTest"), "Test 7 Failed: Current must be AlphaTest");

  // Query Previous:
  const prevSTA = buildContext(USER_SKY_TITAN_ALPHA, "c5", "What was my previous project?", "mistral", []);
  assert(prevSTA.contextStr.includes("TitanCloud"), "Test 7 Failed: Previous must be TitanCloud");
  assert(!prevSTA.contextStr.includes("Previous Value: AlphaTest"), "Test 7 Failed: AlphaTest must not be previous value");

  // Query History:
  const histSTA = buildContext(USER_SKY_TITAN_ALPHA, "c6", "Give me my project history from oldest to newest", "qwen", []);
  assert(histSTA.contextStr.includes("SkyHost -> TitanCloud -> AlphaTest"), "Test 7 Failed: Full chronological history must be SkyHost -> TitanCloud -> AlphaTest");

  // ============================================================
  // TEST SUITE 8 (User's Exact Failure Case): 
  // SkyHost -> TitanCloud -> AlphaTest -> BetaTest -> AlphaTest2026
  // ============================================================
  const USER_5_CHAIN = 'test_5_chain_' + Date.now();
  saveUserMemories(USER_5_CHAIN, []);

  updateOrAddMemory(USER_5_CHAIN, "I started SkyHost.", "project", "c1", [], 4, "project.current", "SkyHost");
  updateOrAddMemory(USER_5_CHAIN, "My project is TitanCloud. This replaces SkyHost.", "project", "c2", [], 4, "project.current", "TitanCloud");
  updateOrAddMemory(USER_5_CHAIN, "My project is AlphaTest. This replaces TitanCloud.", "project", "c3", [], 4, "project.current", "AlphaTest");
  updateOrAddMemory(USER_5_CHAIN, "My project is BetaTest. This replaces AlphaTest.", "project", "c4", [], 4, "project.current", "BetaTest");
  updateOrAddMemory(USER_5_CHAIN, "My project is AlphaTest2026. This replaces BetaTest.", "project", "c5", [], 4, "project.current", "AlphaTest2026");

  // Query Current:
  const cur5 = buildContext(USER_5_CHAIN, "c6", "What is my current project?", "nemotron", []);
  assert(cur5.contextStr.includes("AlphaTest2026"), "Test 8 Failed: Current must be AlphaTest2026");
  assert.strictEqual(cur5.retrievedMemories.length, 1, "Test 8 Failed: Exactly 1 active memory should be retrieved");
  assert.strictEqual(cur5.retrievedMemories[0].value, "AlphaTest2026", "Test 8 Failed: Retrieved current value must be AlphaTest2026");

  // Query Previous:
  const prev5 = buildContext(USER_5_CHAIN, "c7", "What was my previous project?", "mistral", []);
  assert(prev5.contextStr.includes("BetaTest"), "Test 8 Failed: Previous must be BetaTest");
  assert(!prev5.contextStr.includes("Previous Value: AlphaTest2026"), "Test 8 Failed: AlphaTest2026 must not be previous value");
  assert.strictEqual(prev5.retrievedMemories.length, 1, "Test 8 Failed: Exactly 1 previous memory should be retrieved");
  assert.strictEqual(prev5.retrievedMemories[0].value, "BetaTest", "Test 8 Failed: Retrieved previous value must be BetaTest");

  // Query History:
  const hist5 = buildContext(USER_5_CHAIN, "c8", "Give me my project name history from oldest to newest.", "qwen", []);
  console.log("5-Chain History Context String:\n", hist5.contextStr);
  assert(hist5.contextStr.includes("SkyHost -> TitanCloud -> AlphaTest -> BetaTest -> AlphaTest2026"), 
    "Test 8 Failed: Chronological sequence MUST be SkyHost -> TitanCloud -> AlphaTest -> BetaTest -> AlphaTest2026");
  const chain5Values = (hist5.historyChain || []).map(m => m.value);
  assert.deepStrictEqual(chain5Values, ["SkyHost", "TitanCloud", "AlphaTest", "BetaTest", "AlphaTest2026"], 
    `Test 8 Failed: historyChain array incorrect: ${JSON.stringify(chain5Values)}`);

  // ============================================================
  // TEST SUITE 9: 5-Chain Core Projects
  // NovaHost -> EdgeHost -> AlphaCore -> BetaCore -> GammaCore
  // ============================================================
  const USER_CORE_CHAIN = 'test_core_chain_' + Date.now();
  saveUserMemories(USER_CORE_CHAIN, []);

  updateOrAddMemory(USER_CORE_CHAIN, "I started NovaHost.", "project", "c1", [], 4, "project.current", "NovaHost");
  updateOrAddMemory(USER_CORE_CHAIN, "NovaHost is now called EdgeHost.", "project", "c2", [], 4, "project.current", "EdgeHost");
  updateOrAddMemory(USER_CORE_CHAIN, "EdgeHost is renamed to AlphaCore.", "project", "c3", [], 4, "project.current", "AlphaCore");
  updateOrAddMemory(USER_CORE_CHAIN, "AlphaCore is renamed to BetaCore.", "project", "c4", [], 4, "project.current", "BetaCore");
  updateOrAddMemory(USER_CORE_CHAIN, "BetaCore is renamed to GammaCore.", "project", "c5", [], 4, "project.current", "GammaCore");

  const curCore = buildContext(USER_CORE_CHAIN, "c6", "What is my current project?", "glm", []);
  assert.strictEqual(curCore.retrievedMemories[0].value, "GammaCore", "Test 9 Failed: Current must be GammaCore");

  const prevCore = buildContext(USER_CORE_CHAIN, "c7", "What was my previous project?", "mistral", []);
  assert.strictEqual(prevCore.retrievedMemories[0].value, "BetaCore", "Test 9 Failed: Previous must be BetaCore");

  const histCore = buildContext(USER_CORE_CHAIN, "c8", "Give me my project history from oldest to newest", "qwen", []);
  const coreChainValues = (histCore.historyChain || []).map(m => m.value);
  assert.deepStrictEqual(coreChainValues, ["NovaHost", "EdgeHost", "AlphaCore", "BetaCore", "GammaCore"],
    `Test 9 Failed: Core history chain incorrect: ${JSON.stringify(coreChainValues)}`);

  // ============================================================
  // TEST SUITE 10: Repeated Declarations & Query Isolation
  // ============================================================
  updateOrAddMemory(USER_5_CHAIN, "My current project is AlphaTest2026.", "project", "c9", [], 4, "project.current", "AlphaTest2026");
  updateOrAddMemory(USER_5_CHAIN, "I am continuing work on AlphaTest2026.", "project", "c10", [], 4, "project.current", "AlphaTest2026");
  updateOrAddMemory(USER_5_CHAIN, "AlphaTest2026", "project", "c11", [], 4, "project.current", "AlphaTest2026");

  const memsAfterRepeat = getUserMemories(USER_5_CHAIN);
  const activeAfterRepeat = memsAfterRepeat.filter(m => m.property === 'current_project_name' && m.status === 'active');
  assert.strictEqual(activeAfterRepeat.length, 1, "Test 10 Failed: Exactly 1 active record allowed after repeated mentions");
  assert.strictEqual(activeAfterRepeat[0].value, "AlphaTest2026", "Test 10 Failed: Active must remain AlphaTest2026");

  const histRepeat = buildContext(USER_5_CHAIN, "c12", "Give me my project history from oldest to newest", "nemotron", []);
  const repeatChainValues = (histRepeat.historyChain || []).map(m => m.value);
  assert.deepStrictEqual(repeatChainValues, ["SkyHost", "TitanCloud", "AlphaTest", "BetaTest", "AlphaTest2026"],
    `Test 10 Failed: Repeated mentions created duplicates in history: ${JSON.stringify(repeatChainValues)}`);

  // ============================================================
  // TEST SUITE 11 (User's Exact 6-Chain Case & Regression Invariants 1-9):
  // SkyHost -> TitanCloud -> AlphaTest -> BetaTest -> AlphaTest2026 -> GammaTest
  // ============================================================
  const USER_GAMMA_CHAIN = 'test_gamma_chain_' + Date.now();
  saveUserMemories(USER_GAMMA_CHAIN, []);

  // Step 1: SkyHost
  updateOrAddMemory(USER_GAMMA_CHAIN, "I started SkyHost.", "project", "c1", [], 4, "project.current", "SkyHost");
  
  // Step 2: TitanCloud
  updateOrAddMemory(USER_GAMMA_CHAIN, "My project is TitanCloud. This replaces SkyHost.", "project", "c2", [], 4, "project.current", "TitanCloud");
  // TEST 1: previous(TitanCloud) = SkyHost
  const prev1 = buildContext(USER_GAMMA_CHAIN, "c2_q", "What was my previous project?", "mistral", []);
  assert.strictEqual(prev1.retrievedMemories[0].value, "SkyHost", "TEST 1 Failed: previous(TitanCloud) must be SkyHost");

  // Step 3: AlphaTest
  updateOrAddMemory(USER_GAMMA_CHAIN, "My project is AlphaTest. This replaces TitanCloud.", "project", "c3", [], 4, "project.current", "AlphaTest");
  // TEST 2: previous(AlphaTest) = TitanCloud
  const prev2 = buildContext(USER_GAMMA_CHAIN, "c3_q", "What was my previous project?", "mistral", []);
  assert.strictEqual(prev2.retrievedMemories[0].value, "TitanCloud", "TEST 2 Failed: previous(AlphaTest) must be TitanCloud");

  // Step 4: BetaTest
  updateOrAddMemory(USER_GAMMA_CHAIN, "My project is BetaTest. This replaces AlphaTest.", "project", "c4", [], 4, "project.current", "BetaTest");

  // Step 5: AlphaTest2026
  updateOrAddMemory(USER_GAMMA_CHAIN, "My project is AlphaTest2026. This replaces BetaTest.", "project", "c5", [], 4, "project.current", "AlphaTest2026");
  // TEST 3: previous(AlphaTest2026) = BetaTest
  const prev3 = buildContext(USER_GAMMA_CHAIN, "c5_q", "What was my previous project?", "mistral", []);
  assert.strictEqual(prev3.retrievedMemories[0].value, "BetaTest", "TEST 3 Failed: previous(AlphaTest2026) must be BetaTest");

  // Step 6: User declares GammaTest (without explicit replacement syntax)
  updateOrAddMemory(USER_GAMMA_CHAIN, "My current project is GammaTest. Remember this as my current project.", "project", "c6", [], 4, "project.current", "GammaTest");

  // TEST 4: previous(GammaTest) = AlphaTest2026
  const prev4 = buildContext(USER_GAMMA_CHAIN, "c6_q1", "What was my previous project?", "mistral", []);
  console.log("GammaTest Previous Context String:\n", prev4.contextStr);
  assert.strictEqual(prev4.retrievedMemories.length, 1, "TEST 4 Failed: Exactly 1 historical memory must be returned");
  assert.strictEqual(prev4.retrievedMemories[0].value, "AlphaTest2026", "TEST 4 Failed: previous(GammaTest) must be AlphaTest2026");
  assert(prev4.contextStr.includes("AlphaTest2026"), "TEST 4 Failed: Context string must contain AlphaTest2026");
  assert(prev4.contextStr.includes("Do NOT answer with \"GammaTest\""), "TEST 4 Failed: Safety directive against current project missing");

  // TEST 5: current(GammaTest) = GammaTest
  const curGamma = buildContext(USER_GAMMA_CHAIN, "c6_q2", "What is my current project?", "nemotron", []);
  assert.strictEqual(curGamma.retrievedMemories.length, 1, "TEST 5 Failed: Exactly 1 active memory must be returned");
  assert.strictEqual(curGamma.retrievedMemories[0].value, "GammaTest", "TEST 5 Failed: current(GammaTest) must be GammaTest");

  // TEST 6: Full history must be: SkyHost -> TitanCloud -> AlphaTest -> BetaTest -> AlphaTest2026 -> GammaTest
  const histGamma = buildContext(USER_GAMMA_CHAIN, "c6_q3", "Give me my project name history from oldest to newest.", "qwen", []);
  const gammaChainValues = (histGamma.historyChain || []).map(m => m.value);
  console.log("Gamma Chain Values:", gammaChainValues);
  assert.deepStrictEqual(
    gammaChainValues, 
    ["SkyHost", "TitanCloud", "AlphaTest", "BetaTest", "AlphaTest2026", "GammaTest"],
    `TEST 6 Failed: Full 6-chain history incorrect: ${JSON.stringify(gammaChainValues)}`
  );

  // TEST 7: Repeated queries must not mutate memory
  const countBefore = getUserMemories(USER_GAMMA_CHAIN).length;
  buildContext(USER_GAMMA_CHAIN, "c7_q1", "What is my current project?", "glm", []);
  buildContext(USER_GAMMA_CHAIN, "c7_q2", "What was my previous project?", "mistral", []);
  buildContext(USER_GAMMA_CHAIN, "c7_q3", "Give me my project name history from oldest to newest.", "qwen", []);
  const countAfter = getUserMemories(USER_GAMMA_CHAIN).length;
  assert.strictEqual(countAfter, countBefore, "TEST 7 Failed: Repeated queries mutated memory count");

  // TEST 8: Repeated declaration of GammaTest must leave exactly one active GammaTest record and preserve AlphaTest2026 as immediate predecessor
  updateOrAddMemory(USER_GAMMA_CHAIN, "My current project is GammaTest.", "project", "c8_1", [], 4, "project.current", "GammaTest");
  updateOrAddMemory(USER_GAMMA_CHAIN, "GammaTest", "project", "c8_2", [], 4, "project.current", "GammaTest");
  const gammaMems = getUserMemories(USER_GAMMA_CHAIN);
  const activeGammaMems = gammaMems.filter(m => m.property === 'current_project_name' && m.status === 'active');
  assert.strictEqual(activeGammaMems.length, 1, "TEST 8 Failed: Exactly 1 active GammaTest record expected");
  assert.strictEqual(activeGammaMems[0].value, "GammaTest", "TEST 8 Failed: Active record must be GammaTest");
  const prevAfterRepeat = buildContext(USER_GAMMA_CHAIN, "c8_q", "What was my previous project?", "mistral", []);
  assert.strictEqual(prevAfterRepeat.retrievedMemories[0].value, "AlphaTest2026", "TEST 8 Failed: Immediate predecessor must remain AlphaTest2026 after repeats");

  // TEST 9: Reload/reinitialize memory from disk and verify: current = GammaTest, previous = AlphaTest2026, history unchanged
  const diskGammaMems = getUserMemories(USER_GAMMA_CHAIN);
  const curReload = buildContext(USER_GAMMA_CHAIN, "c9_q1", "What is my current project?", "nemotron", []);
  const prevReload = buildContext(USER_GAMMA_CHAIN, "c9_q2", "What was my previous project?", "mistral", []);
  const histReload = buildContext(USER_GAMMA_CHAIN, "c9_q3", "Give me my project name history from oldest to newest.", "qwen", []);
  assert.strictEqual(curReload.retrievedMemories[0].value, "GammaTest", "TEST 9 Failed: Current after reload must be GammaTest");
  assert.strictEqual(prevReload.retrievedMemories[0].value, "AlphaTest2026", "TEST 9 Failed: Previous after reload must be AlphaTest2026");
  const reloadChainValues = (histReload.historyChain || []).map(m => m.value);
  assert.deepStrictEqual(
    reloadChainValues, 
    ["SkyHost", "TitanCloud", "AlphaTest", "BetaTest", "AlphaTest2026", "GammaTest"],
    `TEST 9 Failed: History chain after reload incorrect: ${JSON.stringify(reloadChainValues)}`
  );

  console.log("✅ ALL TEMPORAL TRANSITION, IDEMPOTENCY, CHRONOLOGICAL HISTORY, AND FACT PRESERVATION TESTS PASSED!");
}

runTests().catch(console.error);
