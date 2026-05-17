const adjectives = [
  'Mighty', 'Swift', 'Brave', 'Wise', 'Elite', 'Noble', 'Fierce', 'Bold',
  'Ancient', 'Mystic', 'Shadow', 'Golden', 'Silver', 'Iron', 'Storm',
  'Fire', 'Ice', 'Thunder', 'Lightning', 'Crystal', 'Diamond', 'Steel',
  'Crimson', 'Azure', 'Emerald', 'Violet', 'Scarlet', 'Amber', 'Jade',
  'Obsidian', 'Platinum', 'Copper', 'Bronze', 'Titanium', 'Radiant',
  'Eternal', 'Immortal', 'Divine', 'Sacred', 'Blessed', 'Cursed',
  'Phantom', 'Spectral', 'Ethereal', 'Celestial', 'Infernal', 'Arcane'
];

const nouns = [
  'Warriors', 'Knights', 'Guardians', 'Legends', 'Champions', 'Heroes',
  'Defenders', 'Crusaders', 'Sentinels', 'Protectors', 'Vanguard',
  'Alliance', 'Brotherhood', 'Order', 'Guild', 'Legion', 'Squad',
  'Dragons', 'Eagles', 'Lions', 'Wolves', 'Tigers', 'Phoenix',
  'Ravens', 'Hawks', 'Falcons', 'Owls', 'Serpents', 'Vipers', 'Cobras',
  'Panthers', 'Leopards', 'Jaguars', 'Bears', 'Stags', 'Stallions',
  'Titans', 'Giants', 'Colossi', 'Behemoths', 'Leviathans', 'Krakens'
];

export const generateRandomTeamName = (): string => {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective} ${noun}`;
};