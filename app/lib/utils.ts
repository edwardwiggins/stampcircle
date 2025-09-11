import { formatDistanceToNow } from 'date-fns';

export function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  return formatDistanceToNow(date, { addSuffix: true });
}

export function pluralize(count: number, singular: string, plural?: string): string {
    if (count === 1) {
        return `${count} ${singular}`;
    }
    // Use the provided plural form, otherwise just add 's'
    const pluralForm = plural || `${singular}s`;
    return `${count} ${pluralForm}`;
}