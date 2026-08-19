import { 
  ensureUserDir, 
  getUserMemories, 
  saveUserMemories, 
  updateOrAddMemory, 
  buildContext, 
  getChronologicalHistory,
  retrieveRelevantMemories 
} from '../backendMemory.js';
import {
  getUserConversations,
  saveOrUpdateConversation,
  clearUserConversations,
  Conversation
} from '../backendConversations.js';
import assert from 'assert';
import fs from 'fs';

async function runAlphaBetaIntegration() {
  console.log("==================================================================");
  console.log("STARTING FULL RUNTIME INTEGRATION TEST: AlphaTest -> BetaTest (A-M)");
  console.log("==================================================================");

  const TEST_USER = 'test_integration_' + Date.now();
  clearUserConversations(TEST_USER);
  saveUserMemories(TEST_USER, []);

  // ------------------------------------------------------------------
  // A. Fresh application start
  // ------------------------------------------------------------------
  console.log("\n[Step A] Fresh application start");
  let memories = getUserMemories(TEST_USER);
  assert.strictEqual(memories.length, 0, "Step A: Initial memories should be empty");

  // ------------------------------------------------------------------
  // B. Set project = AlphaTest (Chat 1)
  // ------------------------------------------------------------------
  console.log("\n[Step B] Set project = AlphaTest in Chat 1");
  const conv1Id = 'conv_' + Date.now() + '_chat1';
  const chat1: Conversation = {
    id: conv1Id,
    title: "Project Alpha",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [
      { id: 'm1', role: 'user', content: "My current project is AlphaTest.", timestamp: Date.now() },
      { id: 'm2', role: 'assistant', content: "Understood! Your current project is AlphaTest.", timestamp: Date.now() }
    ]
  };
  saveOrUpdateConversation(TEST_USER, chat1);
  updateOrAddMemory(TEST_USER, "My current project is AlphaTest.", "project", conv1Id, [], 4, "project.current", "AlphaTest");

  memories = getUserMemories(TEST_USER);
  const activeB = memories.filter(m => m.status === 'active' && m.property === 'current_project_name');
  assert.strictEqual(activeB.length, 1, "Step B: Expected 1 active project");
  assert.strictEqual(activeB[0].value, "AlphaTest", "Step B: Active project must be AlphaTest");

  // ------------------------------------------------------------------
  // C. Ask current project -> AlphaTest
  // ------------------------------------------------------------------
  console.log("\n[Step C] Ask current project -> AlphaTest");
  const ctxC = buildContext(TEST_USER, conv1Id, "What is my current project?", "nemotron", chat1.messages);
  console.log("Context C active value:", ctxC.retrievedMemories.map(m => m.value));
  assert(ctxC.contextStr.includes("AlphaTest"), "Step C: Context must return AlphaTest");
  assert.strictEqual(ctxC.retrievedMemories.length, 1, "Step C: Retrieved memories count should be 1");
  assert.strictEqual(ctxC.retrievedMemories[0].value, "AlphaTest", "Step C: Retrieved value must be AlphaTest");

  // ------------------------------------------------------------------
  // D. Set project = BetaTest replacing AlphaTest (Chat 1)
  // ------------------------------------------------------------------
  console.log("\n[Step D] Set project = BetaTest replacing AlphaTest completely");
  chat1.messages.push(
    { id: 'm3', role: 'user', content: "My current project is BetaTest. This replaces AlphaTest completely.", timestamp: Date.now() + 100 },
    { id: 'm4', role: 'assistant', content: "Your current project is now BetaTest. I've updated that in memory.", timestamp: Date.now() + 100 }
  );
  chat1.updatedAt = Date.now() + 100;
  saveOrUpdateConversation(TEST_USER, chat1);

  // Execute update
  const updatedBeta = updateOrAddMemory(
    TEST_USER, 
    "My current project is BetaTest. This replaces AlphaTest completely.", 
    "project", 
    conv1Id, 
    [], 
    4, 
    "project.current", 
    "BetaTest"
  );
  assert.strictEqual(updatedBeta.value, "BetaTest", "Step D: Added memory must be BetaTest");

  // Verify DB state immediately after rename
  memories = getUserMemories(TEST_USER);
  const activeD = memories.filter(m => m.status === 'active' && m.property === 'current_project_name');
  const supersededD = memories.filter(m => m.status === 'superseded' && m.property === 'current_project_name');

  console.log("Step D Active Records:", activeD.map(m => m.value));
  console.log("Step D Superseded Records:", supersededD.map(m => m.value));

  assert.strictEqual(activeD.length, 1, `Step D: Expected strictly 1 active record, got ${activeD.length}`);
  assert.strictEqual(activeD[0].value, "BetaTest", "Step D: Active project MUST be BetaTest");
  assert.strictEqual(supersededD.length, 1, `Step D: Expected 1 superseded record, got ${supersededD.length}`);
  assert.strictEqual(supersededD[0].value, "AlphaTest", "Step D: Superseded project MUST be AlphaTest");

  // ------------------------------------------------------------------
  // E. Ask current project in SAME chat -> BetaTest
  // ------------------------------------------------------------------
  console.log("\n[Step E] Ask current project in SAME chat -> BetaTest");
  const ctxE = buildContext(TEST_USER, conv1Id, "What is my current project?", "mistral", chat1.messages);
  assert(ctxE.contextStr.includes("BetaTest"), "Step E: Context must contain BetaTest");
  assert(!ctxE.contextStr.includes("Current Project: AlphaTest"), "Step E: Context must NOT list AlphaTest as current");
  assert.strictEqual(ctxE.retrievedMemories.length, 1, "Step E: Only 1 active memory retrieved");
  assert.strictEqual(ctxE.retrievedMemories[0].value, "BetaTest", "Step E: Retrieved memory must be BetaTest");

  // ------------------------------------------------------------------
  // F. Create NEW chat (Chat 2)
  // ------------------------------------------------------------------
  console.log("\n[Step F] Create NEW chat");
  const conv2Id = 'conv_' + Date.now() + '_chat2';
  const chat2: Conversation = {
    id: conv2Id,
    title: "New Conversation",
    createdAt: Date.now() + 200,
    updatedAt: Date.now() + 200,
    messages: []
  };
  saveOrUpdateConversation(TEST_USER, chat2);

  // Simulate background re-summarization of old Chat 1 (the critical test condition!)
  console.log("  -> Simulating background re-processing of old Chat 1 messages (AlphaTest)");
  updateOrAddMemory(TEST_USER, "User's current project is AlphaTest", "project", conv1Id, [], 3, "project.current", "AlphaTest");

  // Verify that BetaTest REMAINED active and AlphaTest was NOT reactivated
  const memoriesAfterBg = getUserMemories(TEST_USER);
  const activeAfterBg = memoriesAfterBg.filter(m => m.status === 'active' && m.property === 'current_project_name');
  assert.strictEqual(activeAfterBg.length, 1, `Step F: Active count corrupted by background touch: ${activeAfterBg.length}`);
  assert.strictEqual(activeAfterBg[0].value, "BetaTest", `Step F: AlphaTest incorrectly reactivated! Active is ${activeAfterBg[0].value}`);

  // ------------------------------------------------------------------
  // G. Ask current project in NEW chat -> BetaTest
  // ------------------------------------------------------------------
  console.log("\n[Step G] Ask current project in NEW chat -> BetaTest");
  const ctxG = buildContext(TEST_USER, conv2Id, "What is my current project?", "qwen", []);
  assert(ctxG.contextStr.includes("BetaTest"), "Step G: NEW chat must retrieve BetaTest");
  assert(!ctxG.contextStr.includes("Current Project: AlphaTest"), "Step G: NEW chat must NOT list AlphaTest as current");
  assert.strictEqual(ctxG.retrievedMemories.length, 1, "Step G: Retrieved memories count should be 1");
  assert.strictEqual(ctxG.retrievedMemories[0].value, "BetaTest", "Step G: Retrieved memory must be BetaTest");

  // ------------------------------------------------------------------
  // H. Refresh browser (Simulate reading state anew from disk)
  // ------------------------------------------------------------------
  console.log("\n[Step H] Refresh browser (Reload from disk)");
  const diskMemoriesH = getUserMemories(TEST_USER);
  const diskConvsH = getUserConversations(TEST_USER);
  assert.strictEqual(diskConvsH.length, 2, "Step H: Both conversations must exist on disk");

  // ------------------------------------------------------------------
  // I. Ask current project -> BetaTest
  // ------------------------------------------------------------------
  console.log("\n[Step I] Ask current project after reload -> BetaTest");
  const ctxI = buildContext(TEST_USER, conv2Id, "What is my current project?", "glm", []);
  assert(ctxI.contextStr.includes("BetaTest"), "Step I: Context must return BetaTest");
  assert.strictEqual(ctxI.retrievedMemories[0].value, "BetaTest", "Step I: Retrieved memory must be BetaTest");

  // ------------------------------------------------------------------
  // J. Restart server (Simulate full cold start from memory.json file)
  // ------------------------------------------------------------------
  console.log("\n[Step J] Restart server simulation");
  const coldMemoriesJ = getUserMemories(TEST_USER);
  const coldActiveJ = coldMemoriesJ.filter(m => m.status === 'active' && m.property === 'current_project_name');
  assert.strictEqual(coldActiveJ.length, 1, "Step J: Cold start active count must be 1");
  assert.strictEqual(coldActiveJ[0].value, "BetaTest", "Step J: Cold start active project must be BetaTest");

  // ------------------------------------------------------------------
  // K. Ask current project -> BetaTest
  // ------------------------------------------------------------------
  console.log("\n[Step K] Ask current project after server restart -> BetaTest");
  const ctxK = buildContext(TEST_USER, conv2Id, "What is my current project?", "nemotron", []);
  assert(ctxK.contextStr.includes("BetaTest"), "Step K: Context must return BetaTest");
  assert.strictEqual(ctxK.retrievedMemories[0].value, "BetaTest", "Step K: Retrieved memory must be BetaTest");

  // ------------------------------------------------------------------
  // L. Ask previous project -> AlphaTest
  // ------------------------------------------------------------------
  console.log("\n[Step L] Ask previous project -> AlphaTest");
  const ctxL = buildContext(TEST_USER, conv2Id, "What was my previous project?", "mistral", []);
  console.log("Context L Previous String:\n", ctxL.contextStr);
  assert(ctxL.contextStr.includes("AlphaTest"), "Step L: Previous project must be AlphaTest");
  assert(ctxL.contextStr.includes("Do NOT answer with \"BetaTest\""), "Step L: Guard directive against BetaTest must be present");
  assert.strictEqual(ctxL.retrievedMemories.length, 1, "Step L: Exactly 1 historical memory retrieved");
  assert.strictEqual(ctxL.retrievedMemories[0].value, "AlphaTest", "Step L: Historical memory must be AlphaTest");

  // ------------------------------------------------------------------
  // M. Ask project history oldest-to-newest -> AlphaTest -> BetaTest
  // ------------------------------------------------------------------
  console.log("\n[Step M] Ask project history oldest-to-newest -> AlphaTest -> BetaTest");
  const ctxM = buildContext(TEST_USER, conv2Id, "Give me my project history from oldest to newest", "qwen", []);
  console.log("Context M History String:\n", ctxM.contextStr);
  assert(ctxM.contextStr.includes("AlphaTest -> BetaTest"), "Step M: History sequence must be AlphaTest -> BetaTest");
  const histChain = ctxM.historyChain || [];
  assert.strictEqual(histChain.length, 2, "Step M: History chain length must be 2");
  assert.strictEqual(histChain[0].value, "AlphaTest", "Step M: #1 in history must be AlphaTest (Original)");
  assert.strictEqual(histChain[1].value, "BetaTest", "Step M: #2 in history must be BetaTest (Current Active)");

  console.log("\n==================================================================");
  console.log("✅ ALL A-M INTEGRATION STEPS PASSED WITH 100% CORRECTNESS!");
  console.log("==================================================================");
}

runAlphaBetaIntegration().catch(err => {
  console.error("❌ Integration Test Failed:", err);
  process.exit(1);
});
