export function announce(text: string): void {
  const status = document.getElementById('status');
  if (status) status.textContent = text;
}
