import { updateOrAddMemory, getUserMemories, saveUserMemories } from './backendMemory.ts';

try {
  console.log('Repairing identity memory...');
  const memories = getUserMemories('default_user');
  let currentActive = memories.find(m => m.property === 'current_name' && m.status === 'active');
  
  if (currentActive && currentActive.value !== 'Abhix') {
    currentActive.status = 'superseded';
    currentActive.updated_at = Date.now();
    
    const newRecordId = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    currentActive.superseded_by = newRecordId;
    
    const newRecord = {
      id: newRecordId,
      user_id: 'default_user',
      property: 'current_name',
      value: 'Abhix',
      content: 'Abhix',
      category: 'identity',
      status: 'active',
      importance: 5,
      confidence: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
      source_conversation_id: 'system_repair',
      entity_key: 'identity.name',
      previous_value: currentActive.value,
      subject: 'user',
      ownership: 'user'
    };
    
    memories.push(newRecord as any);
    
    // Also, if there's an active identity_name with 'Abhix', we should supersede it to clean up
    let identityNameRecord = memories.find(m => m.property === 'identity_name' && m.status === 'active');
    if (identityNameRecord) {
       identityNameRecord.status = 'superseded';
       identityNameRecord.updated_at = Date.now();
    }
    
    saveUserMemories('default_user', memories);
    console.log('Successfully repaired! New record:', newRecord);
  } else {
    console.log('Repair not needed or active record is already Abhix:', currentActive);
  }
} catch (e) {
  console.error('Error during repair:', e);
}
