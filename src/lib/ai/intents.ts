/**
 * Rule-based intent detection (English, Portuguese, Spanish, French and German).
 *
 * The patterns favor precision: anything not clearly an action request or small talk is
 * treated as a portfolio question, and the system prompt still tells the model it cannot
 * act or browse, so a missed pattern only costs one model call.
 */
import type { ChatIntent } from "./types";

/** Lowercase, strip accents and collapse whitespace so patterns can stay ASCII. */
function normalize(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Action requests: the visitor asks the assistant to DO something.            */
/* -------------------------------------------------------------------------- */

/** "Can you…", "please…", "I want you to…" and the pt/es/fr equivalents. */
const REQUEST =
  String.raw`(?:\b(?:can|could|would|will)\s+you|\bplease|\bpls|\bi\s+(?:want|need|would\s+like|'d\s+like)\s+you\s+to|\bvoce\s+(?:pode|poderia|consegue)|\bpode(?:ria)?|\bpor\s+favor|\bpuede[sn]?|\bpodria[sn]?|\bpeux[- ]tu|\bpouvez[- ]vous|\bpourrais[- ]tu|\bpourriez[- ]vous|\bs'il\s+(?:te|vous)\s+plait)`;
const FILLER_WORDS = String.raw`please|just|quickly|also|kindly|maybe|lhe|le|les|lui|leur|por\s+favor`;
/** Words that may sit between the request and the verb ("can you please quickly…", "pode lhe enviar…"). */
const FILLER = String.raw`(?:\s+(?:${FILLER_WORDS}))*\s+`;
/** The same, plus a first-person object ("pode me marcar…", "pouvez-vous nous…"). */
const FILLER_SELF = String.raw`(?:\s+(?:${FILLER_WORDS}|me|nos|nous))*\s+`;

/** A pt/es infinitive whose recipient is not the visitor: "enviar-lhe", not "enviar-me" or "enviarme". */
const toOthers = (infinitive: string) => String.raw`${infinitive}(?!-?(?:me|nos)\b)\w*`;

/**
 * Passing something on to someone. Sending something to the visitor ("send me the CV",
 * "pode me mandar o currículo", "envíame los detalles") asks for content the assistant
 * can show, so it is not an action unless the object is a message (see SEND_TO_SELF).
 */
const SEND_VERB = String.raw`(?:send(?!\s+(?:me|us)\b)|forward|deliver|pass\s+(?:on|along)|${toOthers("enviar")}|${toOthers("mandar")}|${toOthers("encaminhar")}|${toOthers("reenviar")}|envoyer|transferer)`;
/** Contacting someone. "Call out the risks" is not a phone call; "tell me" is a question. */
const CONTACT_VERB = String.raw`(?:e-?mail|message|dm|text|call(?!\s+(?:out|it|this|that)\b)|phone|ring|contact|reach\s+out\s+to|get\s+in\s+touch\s+with|notify|tell(?!\s+(?:me|us)\b)|ask\s+(?!me\b|us\b|you\b)|let\s+(?!me\b|us\b)\w+\s+know|introduce\s+me|ligar|telefonar|llamar\w*|contatar\w*|contactar\w*|entrar\s+em\s+contato|appeler|telephoner|contacter)`;
/** Calling the visitor ("pode me ligar?") is still an action. */
const CALL_VERB = String.raw`(?:ligar|telefonar|llamar\w*|contatar\w*|contactar\w*|appeler|telephoner|contacter)`;
/** "Send me…" in its English, pt/es (proclitic and enclitic) and French forms. */
const SEND_TO_SELF = String.raw`(?:send\s+(?:me|us)|(?:me|nos|nous)\s+(?:enviar|mandar|envoyer)\w*|(?:enviar|mandar)-?(?:me|nos)\b)`;
/** An email or a message: what the assistant cannot send, even to the visitor. */
const MESSAGE_OBJECT = String.raw`(?:(?:an?|um|uma|un|una|une)\s+)?(?:e-?mail|mensagem|mensaje|message|correo|sms|whatsapp|text)\b`;
/** Scheduling: needs a meeting-like object so "set up a Next.js project" is not caught. */
const SCHEDULE =
  String.raw`(?:schedule|book|arrange|set\s+up|organi[sz]e|plan|reserve|agendar\w*|marcar\w*|programar\w*|reservar\w*|concertar\w*|planifier|programmer|reserver|organiser)\s+(?:\S+\s+){0,3}?(?:call|meeting|interview|appointment|chat|session|demo|time|slot|reuniao|chamada|entrevista|reunion|llamada|cita|appel|rendez-vous|entretien)\b`;
const WEB_VERB =
  String.raw`(?:open|browse|visit|fetch|scrape|crawl|download|access|navigate\s+to|go\s+to|check(?!\s+(?:if|whether|that)\b)|look\s+(?:at|up|into)|read|review|analy[sz]e|summari[sz]e|search|abrir|abra|acessar|acesse|visitar|visite|navegar|pesquisar|buscar|ouvrir|ouvre|visiter|chercher)`;
/**
 * Something only reachable by browsing. Plain site pages ("the projects page") are not,
 * and neither is this website ("is this website built with Next.js?", "your website").
 */
const WEB_TARGET =
  String.raw`(?:https?:\/\/|www\.|github|gitlab|linkedin|\burl\b|\blink\b|(?<!\b(?:this|your|ce|cet|este|esta)\s)(?:web\s?(?:site|page)|site\s+web|sitio\s+web|pagina\s+web)|internet|online|google|the\s+web)`;
const TRANSACTION_VERB =
  String.raw`(?:apply|submit|sign|pay|purchase|buy|register|subscribe|hire|candidatar\w*|postular\w*|postuler|pagar|payer|assinar|firmar|signer)`;
const GERMAN_REQUEST = String.raw`\b(?:kannst\s+du|konnen\s+sie|konntest\s+du|konnten\s+sie|bitte)\b`;

const ACTION_PATTERNS: RegExp[] = [
  new RegExp(`${REQUEST}${FILLER}${CONTACT_VERB}`),
  // "¿Me puedes mandar el CV?" puts the recipient before the request.
  new RegExp(`(?<!\\b(?:me|nos)\\s)${REQUEST}${FILLER}${SEND_VERB}`),
  new RegExp(`${REQUEST}${FILLER}(?:me|nos|nous)\\s+${CALL_VERB}`),
  new RegExp(`${REQUEST}${FILLER}${SEND_TO_SELF}\\s+${MESSAGE_OBJECT}`),
  new RegExp(`\\b(?:me|nos)\\s+${REQUEST}${FILLER}(?:enviar|mandar)\\w*\\s+${MESSAGE_OBJECT}`),
  new RegExp(`${REQUEST}${FILLER_SELF}${SCHEDULE}`),
  new RegExp(`^(?:please\\s+)?${SCHEDULE}`),
  new RegExp(`${REQUEST}${FILLER_SELF}${WEB_VERB}\\b[^.?!]{0,40}?${WEB_TARGET}`),
  new RegExp(`^(?:please\\s+)?${WEB_VERB}\\b[^.?!]{0,40}?${WEB_TARGET}`),
  new RegExp(`${REQUEST}${FILLER_SELF}${TRANSACTION_VERB}\\b`),
  // "Email Jordan for me", "send my CV to Jordan on my behalf".
  /\b(?:send|forward|e-?mail|message|call(?!\s+out\b)|reach\s+out\s+to|get\s+in\s+touch\s+with|schedule|book|arrange|apply|submit|pay|register)\b[^.?!]{0,40}\b(?:for\s+me|on\s+my\s+behalf|in\s+my\s+name)\b/,
  // German puts the verb at the end: "Kannst du Jordan anrufen?"
  new RegExp(
    `${GERMAN_REQUEST}[^.?!]{0,60}\\b(?:anrufen|kontaktieren|vereinbaren|buchen|offnen|besuchen|aufrufen|bewerben|bezahlen|unterschreiben)\\b`
  ),
  // "Kannst du Jordan eine E-Mail schicken?", but not "Kannst du mir den Lebenslauf schicken?".
  new RegExp(`${GERMAN_REQUEST}(?![^.?!]*\\b(?:mir|uns)\\b)[^.?!]{0,60}\\b(?:senden|schicken|weiterleiten)\\b`),
  new RegExp(`${GERMAN_REQUEST}[^.?!]{0,60}\\b(?:e-?mail|nachricht|sms)\\b[^.?!]{0,30}\\b(?:senden|schicken)\\b`),
  // Raw links with a reading verb anywhere: "what does https://… say? summarize it".
  /(?:https?:\/\/|www\.)\S+[^.?!]{0,40}\b(?:open|read|summari[sz]e|check|visit|browse|fetch)\b/,
];

export function isActionRequest(message: string) {
  const text = normalize(message);
  return ACTION_PATTERNS.some((pattern) => pattern.test(text));
}

/* -------------------------------------------------------------------------- */
/* Small talk                                                                  */
/* -------------------------------------------------------------------------- */

const GREETING =
  String.raw`(?:hi|hello|hey|heya|hiya|howdy|yo|greetings|good\s+(?:morning|afternoon|evening|day)|ola|oi|bom\s+dia|boa\s+(?:tarde|noite)|hola|buen[oa]s(?:\s+(?:dias|tardes|noches))?|bonjour|bonsoir|salut|coucou|hallo|guten\s+(?:morgen|tag|abend)|servus|moin)`;
const HOW_ARE_YOU =
  String.raw`(?:how\s+are\s+you(?:\s+doing)?(?:\s+today)?|how's\s+it\s+going|how\s+is\s+it\s+going|what's\s+up|whats\s+up|sup|tudo\s+bem|como\s+vai(?:\s+voce)?|como\s+(?:voce\s+)?esta|como\s+estas|que\s+tal|ca\s+va|comment\s+(?:ca\s+va|allez-vous|vas-tu)|wie\s+geht(?:'s|\s+es)?(?:\s+(?:dir|ihnen))?)`;
const THANKS =
  String.raw`(?:thanks(?:\s+a\s+lot)?|thank\s+you(?:\s+so\s+much|\s+very\s+much)?|thx|ty|cheers|much\s+appreciated|appreciate\s+it|obrigad[oa]|valeu|muito\s+obrigad[oa]|gracias|muchas\s+gracias|merci(?:\s+beaucoup)?|danke(?:\s+schon|\s+sehr)?|vielen\s+dank)`;
const GOODBYE =
  String.raw`(?:bye|goodbye|good\s+bye|see\s+you(?:\s+later)?|see\s+ya|tchau|ate\s+(?:logo|mais)|adios|hasta\s+luego|au\s+revoir|a\s+bientot|tschuss|auf\s+wiedersehen)`;
const ACKNOWLEDGEMENT =
  String.raw`(?:ok|okay|cool|great|nice|awesome|perfect|got\s+it|i\s+see|sounds\s+good|legal|beleza|vale|genial|d'accord|super|alles\s+klar|gut)`;
const SOCIAL_PHRASE = `(?:${GREETING}|${HOW_ARE_YOU}|${THANKS}|${GOODBYE}|${ACKNOWLEDGEMENT})`;

/** Spaces, punctuation and emoji between or after the phrases. */
const SEPARATORS = String.raw`[\s\p{P}\p{S}\p{M}\p{Cf}]*`;
/** A message made only of greetings, thanks or pleasantries (an optional name or two allowed). */
const SOCIAL_ONLY = new RegExp(
  String.raw`^(?:${SOCIAL_PHRASE}${SEPARATORS})+(?:\s*\p{L}+){0,2}${SEPARATORS}$`,
  "u"
);

const SMALL_TALK_PATTERNS: RegExp[] = [
  // Jokes and questions about the assistant itself.
  /\b(?:jokes?|piadas?|chistes?|blagues?|witze?)\b/,
  /\b(?:who|what)\s+are\s+you\b|\bare\s+you\s+(?:an?\s+)?(?:ai|bot|robot|human|real|person)\b|\bwhat\s+can\s+you\s+do\b|\bquem\s+(?:e|es)\s+voce\b|\bquien\s+eres\b|\bqui\s+es-tu\b|\bwer\s+bist\s+du\b/,
  // Live information the assistant cannot have.
  /\b(?:weather|forecast|news|headlines?|stock\s+(?:price|market)s?|stocks|bitcoin|crypto(?:currency)?|exchange\s+rate|who\s+won|sports?\s+(?:scores?|results?)|football|soccer|basketball|baseball)\b/,
  /\b(?:previsao\s+do\s+tempo|clima|noticias|futebol|bolsa\s+de\s+valores|cotacao|pronostico|futbol|meteo|actualites|bourse|wetter|nachrichten|fussball|borse|aktien)\b/,
];

/**
 * Words that point at the owner's work or at this website. When present, a message that
 * also looks like small talk ("Thanks! Is Jordan available?", "Nice site!") is treated as
 * a portfolio question, so the content (which may say who built the site) can answer it.
 */
const PORTFOLIO_HINTS =
  /\b(?:experien\w*|erfahrung\w*|proje[ct]\w*|proyect\w*|projekt\w*|skills?|habilidad\w*|competen\w*|kompetenz\w*|kenntnis\w*|work\w*|worked|trabalh\w*|trabaj\w*|travail\w*|arbeit\w*|jobs?|emprego|empleo|emploi|roles?|cargo|career|carreira|carrera|carriere|karriere|resume|curriculum|curriculo|cv|lebenslauf|educat\w*|educa\w*|formacao|formacion|formation|ausbildung|stud\w*|degree|diploma|universit\w*|certif\w*|zertifi\w*|contact\w*|contat\w*|kontakt\w*|e-?mail|hire|hiring|availab\w*|disponi\w*|verfugbar\w*|freelanc\w*|stack|tech\w*|tecnolog\w*|built|build\w*|clients?|company|companies|empresa|entreprise|unternehmen|portfolio|sites?|websites?|webseite|sitio|pagina|pages?|languages?|idiomas?|langues?|sprachen?|location|based|remote\w*|rates?|salary|pricing)\b/;

export function isSmallTalk(message: string) {
  const text = normalize(message);
  if (!text || PORTFOLIO_HINTS.test(text)) {
    return false;
  }

  return SOCIAL_ONLY.test(text) || SMALL_TALK_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyIntent(message: string): ChatIntent {
  if (isActionRequest(message)) {
    return "action_request";
  }

  return isSmallTalk(message) ? "small_talk" : "portfolio";
}
