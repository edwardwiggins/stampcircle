// lib/bbcode-parser.ts

export function parseBBCode(text: string): string {
  // Return an empty string if the input is null or undefined to prevent errors
  if (!text) {
    return '';
  }

  let html = text;

  // --- NEW --- Convert @[DisplayName](user_id) mentions into clickable links
  // This rule should run first to avoid conflicts with other tags like [b]
  html = html.replace(/@\[(.*?)\]\((.*?)\)/g, '<a href="/profile/$2" class="mention-link">@$1</a>');

  html = html.replace(/\[ml\](.*?)\[\/ml\]/gi, "$1");
  html = html.replace(/\[b\](.*?)\[\/b\]/gi, "<strong>$1</strong>");
  html = html.replace(/\[i\](.*?)\[\/i\]/gi, "<em>$1</em>");
  html = html.replace(/\[u\](.*?)\[\/u\]/gi, "<u>$1</u>");
  html = html.replace(/\[color=(.*?)\](.*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');
  html = html.replace(/\[h([1-6])\](.*?)\[\/h\1\]/gi, "<h$1>$2</h$1>");
  html = html.replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>');
  html = html.replace(/\[ul\](.*?)\[\/ul\]/gi, "<ul>$1</ul>");
  html = html.replace(/\[li.*?\](.*?)\[\/li\]/gi, "<li>$1</li>");
  html = html.replace(/\[img\](.*?)\[\/img\]/gi, '<img src="$1" style="max-width:100%; height:auto; border-radius:8px;" alt="Post image">');
  html = html.replace(/\[br\]/gi, "<br>");

  return html;
}