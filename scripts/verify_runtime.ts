import { getUserMemories, getChronologicalHistory, buildContext } from '../backendMemory';

const mems = getUserMemories('default_user');
console.log('Total default_user records:', mems.length);
const proj = mems.filter(m => m.property === 'current_project_name');
console.log('\n--- PROJECT RECORDS IN PERSISTENCE ---');
proj.forEach((r, i) => console.log(i, JSON.stringify({
  value: r.value,
  status: r.status,
  prev: r.previous_value,
  superseded_by: r.superseded_by?.slice(-8),
  id: r.id.slice(-8)
})));

const hist = getChronologicalHistory(mems, 'current_project_name');
console.log('\n--- CHRONOLOGICAL HISTORY ---');
hist.forEach((r, i) => console.log(`${i}: ${r.value} (${r.status})`));

console.log('\n--- CURRENT QUERY ---');
const curCtx = buildContext('default_user', 'c1', 'What is my current project?', 'nemotron', []);
console.log('Active Memory:', curCtx.retrievedMemories.map(m => m.value));
console.log('Context string preview:', curCtx.contextStr.substring(0, 200).replace(/\n+/g, ' '));

console.log('\n--- PREVIOUS QUERY ---');
const prevCtx = buildContext('default_user', 'c2', 'What was my previous project?', 'mistral', []);
console.log('Previous Memory:', prevCtx.retrievedMemories.map(m => m.value));
console.log('Context string preview:', prevCtx.contextStr.substring(0, 200).replace(/\n+/g, ' '));

console.log('\n--- HISTORY QUERY ---');
const histCtx = buildContext('default_user', 'c3', 'Give me my project name history from oldest to newest', 'qwen', []);
console.log('History Chain:', histCtx.historyChain?.map(m => m.value));
