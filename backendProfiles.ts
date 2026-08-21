import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  avatar?: string;
}

interface Session {
  token: string;
  profileId: string;
  createdAt: number;
  lastActiveAt: number;
}

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function initProfilesAndMigrate(): void {
  ensureDataDir();
  
  if (!fs.existsSync(PROFILES_FILE)) {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  const profiles = getProfiles();
  const defaultUserDir = path.join(DATA_DIR, 'users', 'default_user');
  
  if (profiles.length === 0 && fs.existsSync(defaultUserDir)) {
    const defaultProfile: Profile = {
      id: 'default_user',
      name: 'Default Profile',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    saveProfiles([defaultProfile]);
    console.log('[Profiles] Migrated existing default_user data to "Default Profile"');
  }
}

export function getProfiles(): Profile[] {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return [];
    const data = fs.readFileSync(PROFILES_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.error('[Profiles] Error reading profiles', err);
    return [];
  }
}

function saveProfiles(profiles: Profile[]): void {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
}

export function createProfile(name: string, avatar?: string): Profile {
  const profiles = getProfiles();
  const newProfile: Profile = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    avatar
  };
  profiles.push(newProfile);
  saveProfiles(profiles);
  
  const userDir = path.join(DATA_DIR, 'users', newProfile.id);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  
  return newProfile;
}

export function getProfile(id: string): Profile | undefined {
  return getProfiles().find(p => p.id === id);
}

export function updateProfile(id: string, name: string, avatar?: string): Profile | undefined {
  const profiles = getProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx !== -1) {
    profiles[idx].name = name;
    if (avatar !== undefined) profiles[idx].avatar = avatar;
    profiles[idx].updatedAt = Date.now();
    saveProfiles(profiles);
    return profiles[idx];
  }
  return undefined;
}

export function deleteProfile(id: string): boolean {
  const profiles = getProfiles();
  const initialLength = profiles.length;
  const filtered = profiles.filter(p => p.id !== id);
  if (filtered.length !== initialLength) {
    saveProfiles(filtered);
    const sessions = getSessions().filter(s => s.profileId !== id);
    saveSessions(sessions);
    return true;
  }
  return false;
}

function getSessions(): Session[] {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.error('[Sessions] Error reading sessions', err);
    return [];
  }
}

function saveSessions(sessions: Session[]): void {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

export function createSession(profileId: string): Session {
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`Cannot create session for unknown profile: ${profileId}`);

  const sessions = getSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const session: Session = {
    token,
    profileId,
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  };
  
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

export function getProfileIdForSession(token: string): string | null {
  if (!token) return null;
  const sessions = getSessions();
  const session = sessions.find(s => s.token === token);
  if (session) {
    session.lastActiveAt = Date.now();
    saveSessions(sessions);
    return session.profileId;
  }
  return null;
}

export function deleteSession(token: string): void {
  const sessions = getSessions();
  const filtered = sessions.filter(s => s.token !== token);
  saveSessions(filtered);
}
