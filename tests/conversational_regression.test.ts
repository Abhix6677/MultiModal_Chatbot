import { buildContext, detectQueryIntent } from '../backendMemory';

function testConversationalIntegrity() {
  let passed = 0;
  let total = 0;

  function assertEqual(actual: any, expected: any, testName: string) {
    total++;
    if (actual === expected) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      console.error(`   Expected: ${expected}`);
      console.error(`   Actual:   ${actual}`);
    }
  }

  console.log('--- STARTING CONVERSATIONAL INTEGRITY TESTS ---\n');

  // Test 1: Normal greeting
  const greetingIntent = detectQueryIntent('hello there');
  assertEqual(greetingIntent.intent, 'GENERAL_MEMORY', 'Normal greeting should be GENERAL_MEMORY');
  
  // Test 2: Casual conversation (The original bug)
  const casualIntent = detectQueryIntent('good yaad rakhaa kro bhulo mtt');
  assertEqual(casualIntent.intent, 'GENERAL_MEMORY', 'Casual conversation should be GENERAL_MEMORY');

  // Test 3: Memory query
  const queryIntent = detectQueryIntent('what is my current project?');
  assertEqual(queryIntent.intent, 'CURRENT_STATE', 'Explicit memory query should be CURRENT_STATE');
  assertEqual(queryIntent.targetProperty, 'current_project_name', 'Target property should be correctly extracted');

  // Test 4: Memory query - previous
  const prevIntent = detectQueryIntent('what was my previous project?');
  assertEqual(prevIntent.intent, 'PREVIOUS_STATE', 'Explicit previous memory query should be PREVIOUS_STATE');

  // Test 5: Model context generation for GENERAL_MEMORY
  const context = buildContext('default_user', 'conv1', 'hello there', 'gpt-4', []);
  const includesAggressiveInstruction = context.contextStr.includes('You MUST answer ONLY with the CURRENT ACTIVE FACT');
  const includesNaturalInstruction = context.contextStr.includes('normal conversation');
  
  assertEqual(includesAggressiveInstruction, false, 'GENERAL_MEMORY context should NOT include aggressive override');
  assertEqual(includesNaturalInstruction, true, 'GENERAL_MEMORY context should include natural conversation instructions');

  console.log(`\n--- RESULTS: ${passed}/${total} TESTS PASSED ---`);
  if (passed !== total) {
    process.exit(1);
  }
}

testConversationalIntegrity();
