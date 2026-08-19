const http = require('http');

function chat(msg) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message: msg, userId: 'default_user' });
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    console.log('Testing "What is my name?"');
    const res1 = await chat("What is my name?");
    console.log('Response 1:', res1.substring(0, 500));
    
    console.log('\nTesting "Mera name kya hai?"');
    const res2 = await chat("Mera name kya hai?");
    console.log('Response 2:', res2.substring(0, 500));
    
    console.log('\nTesting "My friend is Aarush" (Semantic extraction)');
    const res3 = await chat("My friend is Aarush");
    console.log('Response 3:', res3.substring(0, 500));
    
    // Wait for async extraction to finish
    await new Promise(r => setTimeout(r, 8000));
    
    console.log('\nTesting "What is my friend\'s name?"');
    const res4 = await chat("What is my friend's name?");
    console.log('Response 4:', res4.substring(0, 500));
    
    console.log('\nTesting "What is my name?" again');
    const res5 = await chat("What is my name?");
    console.log('Response 5:', res5.substring(0, 500));
  } catch (e) {
    console.error(e);
  }
})();
