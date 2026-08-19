import { chromium } from 'playwright';

const queries = [
  "Hello",
  "What is Java?",
  "2 + 2",
  "Explain binary tree",
  "Write a Java loop",
  "teri sister",
  "aree you serious"
];

async function runTests() {
  console.log("Starting Playwright profiling tests...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[PERF]') || text.includes('[METRICS]')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  await page.goto('http://localhost:3000');
  
  await page.evaluate(() => {
    localStorage.setItem('ai_studio_chatbot_config_v2', JSON.stringify({
      provider: 'custom',
      baseUrl: 'https://swimmer-debtless-pushchair.ngrok-free.dev/api/v1',
      apiKey: 'test-key',
      model: 'mistral/mistral-large-latest',
      systemPrompt: 'You are a helpful assistant.'
    }));
  });
  await page.reload();
  await page.waitForSelector('textarea[placeholder="Ask anything..."]');

  for (const query of queries) {
    console.log(`\n--- Sending Query: "${query}" ---`);
    
    // Type in textarea
    await page.fill('textarea[placeholder="Ask anything..."]', query);
    
    // Press Enter or click send
    await page.keyboard.press('Enter');

    // Wait until the bot finishes generating.
    await page.waitForTimeout(15000);
  }

  await browser.close();
  console.log("\nFinished profiling tests.");
}

runTests().catch(console.error);
