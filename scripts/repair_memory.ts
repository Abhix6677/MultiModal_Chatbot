import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'data', 'users', 'default_user', 'memory.json');
const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

console.log('=== BEFORE REPAIR ===');
console.log('Total records:', raw.length);

// Step 1: Remove contaminated records
const clean = raw.filter((r: any) => {
  const v = String(r.value || '');
  if (v.includes('\u2192') && v.split('\u2192').length > 2) {
    console.log('REMOVING arrow-chain:', v.substring(0, 60));
    return false;
  }
  if (v.includes(',') && v.split(',').length > 2) {
    console.log('REMOVING comma-list:', v.substring(0, 60));
    return false;
  }
  if (v.includes('->') && v.split('->').length > 2) {
    console.log('REMOVING dash-arrow:', v.substring(0, 60));
    return false;
  }
  return true;
});

// Step 2: Remove current_name record extracted from history chain
const clean2 = clean.filter((r: any) => {
  if (r.property === 'current_name' && r.content && (r.content.includes('\u2192') || r.content.includes('->'))) {
    console.log('REMOVING contaminated current_name:', r.value);
    return false;
  }
  return true;
});

// Step 3: Fix project chain relationships
const proj = clean2.filter((r: any) => r.property === 'current_project_name');
proj.sort((a: any, b: any) => a.created_at - b.created_at);

for (let i = 0; i < proj.length; i++) {
  const rec = proj[i];
  if (i === proj.length - 1) {
    rec.status = 'active';
    delete rec.superseded_by;
    rec.previous_value = i > 0 ? proj[i - 1].value : undefined;
  } else {
    rec.status = 'superseded';
    rec.superseded_by = proj[i + 1].id;
    rec.previous_value = i > 0 ? proj[i - 1].value : undefined;
  }
  if (!rec.previous_value) delete rec.previous_value;
}

// Write atomically
const tmpPath = filePath + '.tmp';
fs.writeFileSync(tmpPath, JSON.stringify(clean2, null, 2), 'utf-8');
fs.renameSync(tmpPath, filePath);

console.log('\n=== AFTER REPAIR ===');
console.log('Total records:', clean2.length);
console.log('\nRepaired project chain:');
proj.forEach((r: any, i: number) => {
  console.log(`${i}: ${r.value} | status: ${r.status} | prev: ${r.previous_value || 'NONE'} | superseded_by: ${r.superseded_by ? r.superseded_by.slice(-8) : 'NONE'}`);
});
