const isToday = date => {
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
};

export const formatTime = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDialogTime = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isToday(d)) {
    return formatTime(iso);
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const formatFullDate = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};