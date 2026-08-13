const fs = require('fs');
const log = fs.readFileSync('C:/Users/Abhix/.gemini/antigravity/brain/b5d3187d-f322-4001-8acd-67ef19dc3add/.system_generated/logs/transcript_full.jsonl', 'utf8');
const lines = log.split('\n');
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('"type":"TOOL_RESPONSE"') && lines[i].includes('[diff_block_start]') && lines[i].includes('@@ -29,300 +29,52 @@')) {
    const data = JSON.parse(lines[i]);
    const output = data.content || data.output || JSON.stringify(data);
    fs.writeFileSync('chatinput_diff.txt', output);
    console.log('Found tool response.');
    break;
  }
}
