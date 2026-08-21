export const PROFILE_COLORS = [
  'bg-teal-500',
  'bg-red-500',
  'bg-purple-500',
  'bg-blue-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-emerald-500'
];

export const PROFILE_EMOJIS = ['🐧', '🦊', '🦁', '🐵', '🦉', '🐼', '🐨', '🐸', '🐯', '🐰', '🐔', '🦄', '🐝', '🦖', '🐢'];

export function getProfileStyle(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash);
  return {
    color: PROFILE_COLORS[index % PROFILE_COLORS.length],
    emoji: PROFILE_EMOJIS[index % PROFILE_EMOJIS.length]
  };
}
