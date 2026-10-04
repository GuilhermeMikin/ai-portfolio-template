import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/ai/intents";

describe("classifyIntent", () => {
  it.each([
    "Can you send an email to Jordan for me?",
    "Could you please contact Jordan?",
    "Please email Jordan",
    "Can you book a call with Jordan next week?",
    "Schedule a meeting with Jordan",
    "Can you check Jordan's GitHub?",
    "Open https://example.com/projects",
    "Can you look at his LinkedIn profile and summarize it?",
    "Can you browse the web for Jordan's latest posts?",
    "Could you apply to this job for me?",
    "Can you tell Jordan I'd like to talk?",
    "Email Jordan for me",
    "Você pode enviar um email para o Jordan?",
    "¿Puedes enviarle un correo a Jordan?",
    "Peux-tu envoyer un message à Jordan ?",
    "Kannst du Jordan eine E-Mail schicken?",
    "Pode agendar uma reunião com o Jordan?",
    "pode marcar uma reunião com o Jordan?",
    "Pode me marcar uma reunião com o Jordan?",
    "book a call",
    "browse his GitHub",
    "Can you visit his website?",
    "Can you call Jordan?",
    "Could you send Jordan my resume?",
    "Pode enviar-lhe uma mensagem?",
    "Pouvez-vous lui envoyer un message ?",
    "Kannst du Jordan anrufen?",
    // Sending a message to the visitor is still something the assistant cannot do.
    "Can you send me an email?",
    "Pode me mandar um email?",
    "¿Puedes enviarme un correo?",
    "¿Me puedes enviar un correo?",
    "Kannst du mir eine E-Mail schicken?",
    "Pode me ligar?",
  ])("treats %j as an action request", (message) => {
    expect(classifyIntent(message)).toBe("action_request");
  });

  it.each([
    "Can you tell me about Jordan's projects?",
    "How can I contact Jordan?",
    "Can you share Jordan's contact details?",
    "Can you send me the link to the projects page?",
    "Does Jordan have a GitHub?",
    "Check if Jordan has GitHub experience",
    "Can you summarize the projects page?",
    "Can you set up a Next.js project?",
    "What open source projects has Jordan built?",
    "Has Jordan worked on booking tools?",
    "What's Jordan's email address?",
    "Where can I download the resume?",
    "Please let me know Jordan's availability",
    // Asking for content ("send me the CV") is a question the assistant can answer.
    "Me mande o currículo",
    "Me envie o currículo",
    "envie-me os detalhes",
    "Pode me mandar o currículo?",
    "Você pode me enviar o currículo?",
    "Pode enviar-me os detalhes?",
    "¿Puedes enviarme el currículum?",
    "¿Me puedes mandar el CV?",
    "Envíame los detalles",
    "Pouvez-vous nous envoyer le CV ?",
    "Kannst du mir den Lebenslauf schicken?",
    "Can you send me his resume?",
    // "Call out" is not a phone call.
    "Can you call out the main risks?",
    "Could you call out the trade-offs for me?",
    // This website is the portfolio itself, not something to browse.
    "Is this website built with Next.js?",
    "What does your website do?",
    "Can you check this website's stack?",
    "Can you summarize your website?",
    // Compliments about the site itself: the content may say who built it.
    "Nice site!",
    "Great website",
    "Que site lindo!",
    "cool page",
  ])("keeps %j as a portfolio question", (message) => {
    expect(classifyIntent(message)).toBe("portfolio");
  });

  it.each([
    "Hi",
    "Hello there!",
    "hey, how are you?",
    "Thanks!",
    "thank you so much 🙏",
    "Olá, tudo bem?",
    "Hola",
    "Bonjour !",
    "Guten Tag",
    "Tell me a joke",
    "What's the weather in Lisbon?",
    "Who won the football game yesterday?",
    "Who are you?",
    "ok cool",
  ])("treats %j as small talk", (message) => {
    expect(classifyIntent(message)).toBe("small_talk");
  });

  it.each([
    "Hi! What has Jordan built with AI?",
    "Thanks! Is Jordan available for new work?",
    "Python?",
    "Kubernetes",
    "Who is Jordan?",
    "Has Jordan worked on weather apps?",
  ])("defaults %j to a portfolio question", (message) => {
    expect(classifyIntent(message)).toBe("portfolio");
  });
});
