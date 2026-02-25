function nowStamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function normalizeBRNumber(value) {
  if (!value) return value;
  let number = String(value).replace(/[^\d]/g, '');
  if (number.startsWith('55') && number.length === 12) {
    const ddd = number.slice(2, 4);
    const rest = number.slice(4);
    number = `55${ddd}9${rest}`;
  }
  return number;
}

function cleanText(value) {
  return String(value || '').trim();
}

module.exports = {
  cleanText,
  normalizeBRNumber,
  nowStamp,
};
