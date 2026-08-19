import { buildContext } from '../backendMemory';

console.log('--- TEST: GENERAL CONVERSATION (GENERAL_MEMORY) ---');
const ctxGeneral = buildContext('default_user', 'c1', 'good yaad rakhaa kro bhulo mtt', 'nemotron', []);
console.log('Intent detected:', ctxGeneral.contextStr.includes('normal conversation') ? 'GENERAL_MEMORY' : 'OTHER');
console.log('Context output:\n', ctxGeneral.contextStr);

console.log('\n--- TEST: EXPLICIT MEMORY QUERY (CURRENT_STATE) ---');
const ctxCurrent = buildContext('default_user', 'c2', 'What is my current project?', 'nemotron', []);
console.log('Intent detected:', ctxCurrent.contextStr.includes('CURRENT ACTIVE FACT') ? 'CURRENT_STATE' : 'OTHER');
console.log('Context output:\n', ctxCurrent.contextStr);

console.log('\n--- TEST: IMPLICIT QUESTION (GENERAL_MEMORY) ---');
const ctxQuestion = buildContext('default_user', 'c3', 'how are you today?', 'nemotron', []);
console.log('Intent detected:', ctxQuestion.contextStr.includes('normal conversation') ? 'GENERAL_MEMORY' : 'OTHER');
console.log('Context output:\n', ctxQuestion.contextStr);

