export { sendTemplate, emailHash } from "./send";
export type { MailStatus, SendResult } from "./send";
export { BUILTIN_TEMPLATES, findBuiltin } from "./templates";
export type { MailTemplate } from "./templates";
export { fillVars, markdownToHtml, markdownToText, wrapHtml } from "./render";
export type { MailVars } from "./render";
