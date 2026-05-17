export function generateLogoColor(projectName: string): string {
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash % 360);
  const saturation = 70 + (Math.abs(hash) % 20);
  const lightness = 50 + (Math.abs(hash >> 8) % 15);
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function generateGradient(projectName: string): string {
  const color1 = generateLogoColor(projectName);
  const color2 = generateLogoColor(projectName + "_alt");
  return `linear-gradient(135deg, ${color1}, ${color2})`;
}
