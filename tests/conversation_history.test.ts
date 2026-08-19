import {
  getUserConversations,
  saveUserConversations,
  saveOrUpdateConversation,
  deleteConversation,
  clearUserConversations,
  Conversation
} from '../backendConversations.js';
import assert from 'assert';

async function runConversationTests() {
  console.log("Starting Chat History Persistence Test Suite...");

  const TEST_USER = 'test_history_user_' + Date.now();
  clearUserConversations(TEST_USER);

  // 1. Initial state must be empty
  let convs = getUserConversations(TEST_USER);
  assert.strictEqual(convs.length, 0, "Test 1 Failed: Initial conversations should be empty");

  // 2. First chat creation
  const convId1 = 'conv_' + Date.now() + '_test1';
  const chat1: Conversation = {
    id: convId1,
    title: "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };
  saveOrUpdateConversation(TEST_USER, chat1);

  convs = getUserConversations(TEST_USER);
  assert.strictEqual(convs.length, 1, "Test 2 Failed: Expected 1 conversation after creation");
  assert.strictEqual(convs[0].id, convId1, "Test 2 Failed: ID mismatch");
  assert.strictEqual(convs[0].title, "New Chat", "Test 2 Failed: Title mismatch");

  // 3. First user message -> updates title and messages
  chat1.title = "Hello AI";
  chat1.messages = [
    { id: 'msg_1', role: 'user', content: 'hello', timestamp: Date.now() },
    { id: 'msg_2', role: 'assistant', content: 'Hello! How can I help you today?', timestamp: Date.now() }
  ];
  saveOrUpdateConversation(TEST_USER, chat1);

  convs = getUserConversations(TEST_USER);
  assert.strictEqual(convs.length, 1, "Test 3 Failed: Should not duplicate conversation on new message");
  assert.strictEqual(convs[0].title, "Hello AI", "Test 3 Failed: Title should be updated");
  assert.strictEqual(convs[0].messages.length, 2, "Test 3 Failed: Messages count should be 2");

  // 4. Second user message in the same chat
  chat1.messages.push(
    { id: 'msg_3', role: 'user', content: 'What is 2+2?', timestamp: Date.now() },
    { id: 'msg_4', role: 'assistant', content: '2+2 is 4.', timestamp: Date.now() }
  );
  saveOrUpdateConversation(TEST_USER, chat1);

  convs = getUserConversations(TEST_USER);
  assert.strictEqual(convs.length, 1, "Test 4 Failed: Message in same chat should not create new chat ID");
  assert.strictEqual(convs[0].messages.length, 4, "Test 4 Failed: Messages count should be 4");

  // 5. Create a second chat (Chat 2)
  const convId2 = 'conv_' + Date.now() + '_test2';
  const chat2: Conversation = {
    id: convId2,
    title: "Tell me a joke",
    createdAt: Date.now() + 100,
    updatedAt: Date.now() + 100,
    messages: [
      { id: 'msg_2_1', role: 'user', content: 'Tell me a joke', timestamp: Date.now() + 100 },
      { id: 'msg_2_2', role: 'assistant', content: 'Why did the chicken cross the road?', timestamp: Date.now() + 100 }
    ]
  };
  saveOrUpdateConversation(TEST_USER, chat2);

  convs = getUserConversations(TEST_USER);
  assert.strictEqual(convs.length, 2, "Test 5 Failed: Expected 2 separate conversations");
  // Chat 2 was updated more recently, so it should be first
  assert.strictEqual(convs[0].id, convId2, "Test 5 Failed: Most recently updated chat should be first");
  assert.strictEqual(convs[1].id, convId1, "Test 5 Failed: Older chat should be second");

  // 6. Refresh / Reload Simulation
  // Re-reading directly from disk must return both conversations with all messages intact
  const reloadedConvs = getUserConversations(TEST_USER);
  assert.strictEqual(reloadedConvs.length, 2, "Test 6 Failed: Both conversations must persist across reload");
  const reloadedChat1 = reloadedConvs.find(c => c.id === convId1);
  const reloadedChat2 = reloadedConvs.find(c => c.id === convId2);
  assert(reloadedChat1, "Test 6 Failed: Chat 1 not found after reload");
  assert(reloadedChat2, "Test 6 Failed: Chat 2 not found after reload");
  assert.strictEqual(reloadedChat1?.messages.length, 4, "Test 6 Failed: Chat 1 messages missing after reload");
  assert.strictEqual(reloadedChat2?.messages.length, 2, "Test 6 Failed: Chat 2 messages missing after reload");

  // 7. Delete Chat 1
  deleteConversation(TEST_USER, convId1);
  convs = getUserConversations(TEST_USER);
  assert.strictEqual(convs.length, 1, "Test 7 Failed: Expected 1 conversation after deleting Chat 1");
  assert.strictEqual(convs[0].id, convId2, "Test 7 Failed: Remaining chat must be Chat 2");

  // 8. Clear All
  clearUserConversations(TEST_USER);
  convs = getUserConversations(TEST_USER);
  assert.strictEqual(convs.length, 0, "Test 8 Failed: Expected 0 conversations after clear");

  console.log("✅ ALL CHAT HISTORY PERSISTENCE AND LIFECYCLE TESTS PASSED!");
}

runConversationTests().catch(console.error);
