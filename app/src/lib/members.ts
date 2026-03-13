export const MEMBER_ALIASES = [
  { member_id: 1, patterns: ['岩本照', 'いわもとひかる', 'イワモトヒカル', 'Hikaru Iwamoto', '岩本'] },
  { member_id: 2, patterns: ['深澤辰哉', 'ふかざわたつや', 'フカザワタツヤ', 'Tatsuya Fukazawa', '深澤', '深沢'] },
  { member_id: 3, patterns: ['ラウール', 'らうーる', 'Raul', 'ラウル'] },
  { member_id: 4, patterns: ['渡辺翔太', 'わたなべしょうた', 'ワタナベショウタ', 'Shota Watanabe', '渡辺'] },
  { member_id: 5, patterns: ['向井康二', 'むかいこうじ', 'ムカイコウジ', 'Koji Mukai', '向井'] },
  { member_id: 6, patterns: ['阿部亮平', 'あべりょうへい', 'アベリョウヘイ', 'Ryohei Abe', '阿部'] },
  { member_id: 7, patterns: ['目黒蓮', 'めぐろれん', 'メグロレン', 'Ren Meguro', '目黒'] },
  { member_id: 8, patterns: ['宮舘涼太', 'みやだてりょうた', 'ミヤダテリョウタ', 'Ryota Miyadate', '宮舘', '宮館'] },
  { member_id: 9, patterns: ['佐久間大介', 'さくまだいすけ', 'サクマダイスケ', 'Daisuke Sakuma', '佐久間'] },
];

export const GROUP_PATTERNS = ['Snow Man', 'snowman', 'スノーマン', 'すのーまん', 'SnowMan'];

export function findMemberIds(text: string): number[] {
  const ids = new Set<number>();

  // Check group patterns first - if group match, return all members
  for (const pattern of GROUP_PATTERNS) {
    if (text.includes(pattern)) {
      return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    }
  }

  for (const alias of MEMBER_ALIASES) {
    for (const pattern of alias.patterns) {
      if (text.includes(pattern)) {
        ids.add(alias.member_id);
        break;
      }
    }
  }

  return Array.from(ids);
}
