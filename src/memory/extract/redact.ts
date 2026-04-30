const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}/g;
const CARD_RE = /\b(?:\d[ \-]?){13,19}\b/g;
const SECRET_RE = /(?:sk-|ghp_|xoxb-|Bearer )[A-Za-z0-9\-_./+]{8,}/g;

export function redactSensitive(text: string): string {
	return text
		.replace(SECRET_RE, "[REDACTED:secret]")
		.replace(EMAIL_RE, "[REDACTED:email]")
		.replace(PHONE_RE, "[REDACTED:phone]")
		.replace(CARD_RE, "[REDACTED:card]");
}
