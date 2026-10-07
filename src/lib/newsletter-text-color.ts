/** Dark, neutral text from imports should follow the reading theme. */
export function isDarkNeutralTextColor(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const color = value.trim().toLowerCase();
  if (['black', 'gray', 'grey', 'dimgray', 'dimgrey'].includes(color)) return true;

  let channels: number[];
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$/.test(color)) {
    const hex = color.length === 4
      ? color.slice(1).split('').map((digit) => digit + digit).join('')
      : color.slice(1);
    channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  } else {
    const rgb = color.match(/^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
    if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) !== 1)) return false;
    channels = rgb.slice(1, 4).map(Number);
  }

  return channels[0] <= 128 && channels.every((channel) => channel === channels[0]);
}
