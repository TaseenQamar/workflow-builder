/** Chat / post stamp like `10/07 2:37 PM` (MM/DD h:mm AM/PM). */
export function formatChatStamp(
  date: Date = new Date(),
  timeZone = 'Asia/Karachi',
): string {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
        .formatToParts(date)
        .map((p) => [p.type, p.value]),
    );
    const month = parts['month'] ?? '01';
    const day = parts['day'] ?? '01';
    const hour = parts['hour'] ?? '12';
    const minute = parts['minute'] ?? '00';
    const dayPeriod = (parts['dayPeriod'] ?? 'AM').toUpperCase();
    return `${month}/${day} ${hour}:${minute} ${dayPeriod}`;
  } catch {
    const h = date.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${h12}:${mi} ${ampm}`;
  }
}
