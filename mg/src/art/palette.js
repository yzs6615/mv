// Film palette: warm paper, indigo ink, risograph-like inks for flowers.
export const C = {
  paper: '#F4EDE1', paper2: '#EADFCD', paper3: '#E2D4BE', ink: '#2A2E45', inkSoft: '#555A78',
  soil: '#8A5A3C', soilDark: '#5E3B27', soilLight: '#B07A52', soilPale: '#D9B48F',
  leaf: '#3E9B6E', leafDark: '#2E7D5B', leafLight: '#7CC49A', leafPale: '#B9E0A5', stem: '#3F8F5F',
  coral: '#FF6B5B', peach: '#FF9F80', pink: '#F48FB1', blossom: '#FFD3E0', rose: '#E0567A', magenta: '#C2407E',
  marigold: '#FFB627', lemon: '#FFD84D', orange: '#FF8A3D', butter: '#FFF0B8',
  lavender: '#A78BDA', lilac: '#D9CCF5', violet: '#7B5CC4', peri: '#7FA2E8', sky: '#6EC1E4', ice: '#CDEBF7', teal: '#3BB3A6', mint: '#A8E0D6',
  white: '#FFF8EE', cream: '#FBE8C8', gold: '#E8B04A', light: '#FFF3C4',
  pip: '#C98A5B', pipDark: '#A3693F', pipLight: '#E2AF7E', blush: '#FF8F7A',
  // skies
  skyDay: '#BFE3F0', skyDayLow: '#F4EDE1', skyDusk: '#F6B9A0', skyNight: '#2A2E45', skyStorm: '#7B819C', skyStormLow: '#B5B9C8',
};

// [petal, inner, center, centerAccent]
export const SCHEMES = [
  ['#FF6B5B', '#FFB39F', '#FFB627', '#C2407E'],
  ['#F48FB1', '#FFD3E0', '#FFB627', '#E0567A'],
  ['#FFB627', '#FFD84D', '#8A5A3C', '#5E3B27'],
  ['#A78BDA', '#D9CCF5', '#FFD84D', '#7B5CC4'],
  ['#6EC1E4', '#CDEBF7', '#FFE58A', '#3B7FC4'],
  ['#FFF8EE', '#FBE8C8', '#FFB627', '#E8B04A'],
  ['#E0567A', '#F48FB1', '#2A2E45', '#FFD84D'],
  ['#FF8A3D', '#FFC46B', '#5E3B27', '#FFD84D'],
  ['#7B5CC4', '#A78BDA', '#FFF3C4', '#F48FB1'],
  ['#3BB3A6', '#A8E0D6', '#FFF8EE', '#2E7D5B'],
  ['#C2407E', '#F48FB1', '#FFD84D', '#FFF8EE'],
  ['#FFD84D', '#FFF3C4', '#FF8A3D', '#E0567A'],
  ['#FF9F80', '#FFE0D1', '#E0567A', '#FFD84D'],
  ['#7FA2E8', '#D3DFFA', '#FFD84D', '#2A2E45'],
];
export const SCHEME_WEIGHTS = [3, 3, 2, 2.5, 2, 2.5, 1.6, 2, 1.6, 0.8, 1.4, 1.5, 2, 1.6];

// the hero's flower (豆豆): coral eight-petal bloom with a golden star in its heart
export const PIP_SCHEME = ['#FF6B5B', '#FFB39F', '#FFB627', '#FFF3C4'];
