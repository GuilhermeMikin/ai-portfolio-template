import type { Profile } from "../schema";

/**
 * EXAMPLE PROFILE (pt-BR) — Jordan Rivera is a fictional person.
 *
 * Brazilian Portuguese translation of `../en/profile.ts`. Keep the two files in sync:
 * ids, dates, numbers, links, stack items, flags and the number of items in every list
 * must match; only the wording changes. Jordan's gender is unspecified, so the
 * Portuguese text avoids gendered words for Jordan.
 *
 * Every employer, project, school and certification below is invented to demonstrate the
 * template, and the email uses the reserved `example.com` domain. The social links are not
 * Jordan's: they point to the template's source code and to its author's LinkedIn profile and
 * website, labelled as such. The FAQ entries about this website and the matching assistant
 * instructions promote the template on its public demo.
 * Replace this file with your own information (docs/customization.md walks through
 * each field) and set `isExample: false`.
 *
 * The site renders this file and the AI assistant is instructed to answer only from it, so
 * keep it accurate and public: anything written here can be repeated to visitors.
 */
export const profile: Profile = {
  isExample: true,

  person: {
    name: "Jordan Rivera",
    shortName: "Jordan",
    headline: "Engenharia de produto · TypeScript, Python e IA aplicada",
    summary:
      "Desenvolvo produtos web de ponta a ponta e ajudo times a lançar features de IA em que as pessoas podem confiar.",
    location: "Uberlândia, Minas Gerais, Brasil",
  },

  about: {
    bio: [
      "Trabalho com engenharia de produto e tenho cerca de oito anos de experiência criando aplicações web. Gosto de assumir uma feature desde a primeira conversa com os usuários até o dashboard que mostra se ela deu certo.",
      "Ultimamente, meu foco tem sido IA aplicada: assistentes e features de busca ancorados em dados reais, avaliados antes de ir para produção e honestos sobre o que não sabem.",
      "Trabalho remotamente a partir de Uberlândia, no Brasil, e rendo mais em times pequenos e seniores, em que a engenharia conversa diretamente com os clientes.",
    ],
    highlights: [
      "Features de produto de ponta a ponta em TypeScript e Python",
      "Features de IA ancoradas em dados reais, com avaliação e repasse para atendimento humano",
      "Interfaces rápidas e acessíveis, que funcionam bem com o teclado",
      "Entregas pequenas e frequentes, sustentadas por testes e feature flags",
    ],
    interests: [
      "Ciclismo de longa distância pela costa do Atlântico",
      "Fotografia analógica e ampliação em câmara escura",
      "Trabalho voluntário em um clube de programação para adolescentes nos fins de semana",
    ],
  },

  skills: [
    { group: "Linguagens", items: ["TypeScript", "JavaScript", "Python", "SQL"] },
    { group: "Frontend", items: ["React", "Next.js", "Tailwind CSS", "Acessibilidade web (WCAG)"] },
    { group: "Backend e dados", items: ["Node.js", "FastAPI", "PostgreSQL", "APIs REST", "Jobs em background"] },
    { group: "IA aplicada", items: ["Integração com LLMs", "Design de prompts", "Retrieval e grounding", "Conjuntos de avaliação"] },
    { group: "Práticas", items: ["Testes automatizados", "CI/CD", "Feature flags", "Observabilidade"] },
  ],

  experience: [
    {
      id: "acme-cloud",
      role: "Engenharia de produto sênior",
      organization: "Acme Cloud",
      location: "Remoto",
      period: { start: "2023-02" },
      summary: "Software de roteirização para pequenas empresas de entrega.",
      highlights: [
        "Liderei um squad de quatro pessoas que reconstruiu o dashboard de despacho em Next.js e TypeScript, reduzindo o tempo mediano de carregamento da página de 4,1 s para 1,6 s.",
        "Lancei um assistente de suporte com IA ancorado nos artigos da central de ajuda, com um conjunto de avaliação de 300 perguntas e repasse para atendimento humano.",
        "Introduzi feature flags, ambientes de preview e testes de contrato, levando o time de deploys semanais para diários.",
        "Dei mentoria a três devs em suas primeiras escalas de plantão.",
      ],
      stack: ["TypeScript", "Next.js", "Node.js", "PostgreSQL", "Python", "AWS"],
    },
    {
      id: "example-labs",
      role: "Engenharia de software",
      organization: "Example Labs",
      location: "Remoto",
      period: { start: "2020-06", end: "2023-01" },
      summary: "Um estúdio de produto que desenvolve aplicações web para clientes de saúde, varejo e educação.",
      highlights: [
        "Desenvolvi e mantive APIs REST em Python (FastAPI) e PostgreSQL para cinco produtos de clientes.",
        "Criei uma biblioteca compartilhada de componentes React com verificações automáticas de acessibilidade, reutilizada em quatro projetos.",
        "Projetei um pipeline noturno de importação que valida os arquivos CSV de parceiros, substituindo um processo manual.",
      ],
      stack: ["Python", "FastAPI", "PostgreSQL", "React", "TypeScript", "Docker"],
    },
    {
      id: "independent",
      role: "Desenvolvimento web freelance",
      organization: "Independente",
      location: "Uberlândia, Brasil",
      period: { start: "2018-09", end: "2020-05" },
      highlights: [
        "Projetei e desenvolvi sites e ferramentas de agendamento para negócios locais, do primeiro esboço à hospedagem e manutenção.",
        "Trabalhei diretamente com os donos dos negócios para transformar requisitos vagos em entregas pequenas e prontas para ir ao ar.",
      ],
      stack: ["JavaScript", "Vue.js", "PHP", "MySQL"],
    },
  ],

  projects: [
    {
      id: "support-assistant",
      title: "Assistente de suporte ancorado em fontes",
      summary:
        "Um assistente de IA que responde às dúvidas dos clientes usando apenas os artigos da central de ajuda da Acme Cloud e passa a conversa para uma pessoa quando não tem certeza.",
      role: "Liderança técnica",
      period: { start: "2024-03", end: "2025-01" },
      status: "Em produção",
      category: "Trabalho em produto",
      featured: true,
      highlights: [
        "Um conjunto de avaliação com 300 perguntas reais roda a cada mudança de prompt ou de modelo.",
        "As respostas trazem links para os artigos usados; as perguntas que o assistente não consegue responder vão para o time de suporte.",
        "Dúvidas comuns recebem uma primeira resposta em segundos, e não em horas.",
      ],
      stack: ["TypeScript", "Python", "PostgreSQL full-text search", "OpenAI-compatible API"],
    },
    {
      id: "dispatch-dashboard",
      title: "Reconstrução do dashboard de despacho",
      summary:
        "Uma reescrita da tela que a equipe de despacho usa para planejar e acompanhar as rotas de entrega do dia, com foco em velocidade e em fluxos fáceis de usar pelo teclado.",
      role: "Liderança de engenharia",
      period: { start: "2023-04", end: "2023-11" },
      status: "No ar",
      category: "Trabalho em produto",
      featured: true,
      highlights: [
        "O tempo mediano de carregamento da página caiu de 4,1 s para 1,6 s.",
        "Atalhos de teclado cobrem as dez ações mais frequentes.",
        "Rollout gradual com feature flags, sem downtime.",
      ],
      stack: ["Next.js", "TypeScript", "React", "PostgreSQL"],
    },
    {
      id: "csv-validator",
      title: "Validador de schema para CSV",
      summary:
        "Uma pequena ferramenta de linha de comando que verifica arquivos CSV com base em um schema declarado e explica cada erro em linguagem simples.",
      role: "Autoria e manutenção",
      period: { start: "2022-05" },
      status: "Open source",
      category: "Open source",
      featured: true,
      highlights: [
        "Os relatórios de erro apontam a linha e a coluna exatas.",
        "Roda em pipelines de CI e como pre-commit hook.",
      ],
      stack: ["Python"],
    },
    {
      id: "clinic-booking",
      title: "Site de agendamento para clínica",
      summary:
        "Um site com agendamento online de consultas e lembretes por e-mail para uma pequena clínica de fisioterapia.",
      role: "Design e desenvolvimento",
      period: { start: "2019-02", end: "2019-06" },
      status: "Entregue",
      category: "Trabalho para clientes",
      stack: ["Vue.js", "PHP", "MySQL"],
    },
  ],

  education: [
    {
      id: "bsc-computer-science",
      degree: "Bacharelado em Ciência da Computação",
      institution: "Example University",
      location: "Porto, Portugal",
      period: { start: "2014-09", end: "2018-07" },
      details: ["Projeto final: um app mobile para compartilhar rotas de ciclismo, desenvolvido por um time de quatro pessoas."],
    },
  ],

  certifications: [
    { name: "Accessible Web Design", issuer: "Example Academy", date: "2022-10" },
    { name: "Applied Machine Learning Fundamentals", issuer: "Example Institute", date: "2023-06" },
  ],

  languages: [
    { name: "Português", level: "Nativo" },
    { name: "Inglês", level: "Fluente" },
    { name: "Espanhol", level: "Conversação" },
  ],

  contact: {
    email: "hello@example.com",
    availability:
      "Disponível para vagas de nível sênior em engenharia de produto e para um número limitado de projetos freelance a partir de janeiro de 2027.",
    responseTime: "Costuma responder em até dois dias úteis.",
    social: [
      {
        platform: "github",
        label: "Código do template no GitHub",
        href: "https://github.com/GuilhermeMikin/ai-portfolio-template",
      },
      {
        platform: "linkedin",
        label: "Autor do template no LinkedIn",
        href: "https://www.linkedin.com/in/guilhermebl/",
      },
      { platform: "website", label: "mikin.ai", href: "https://mikin.ai" },
    ],
  },

  resume: {
    updated: "2026-09",
  },

  seo: {
    description:
      "Jordan Rivera atua com engenharia de produto, desenvolve produtos web de ponta a ponta e lança features de IA ancoradas em dados. Projetos, experiência e contato.",
    keywords: ["Jordan Rivera", "engenharia de produto", "TypeScript", "Python", "IA aplicada", "portfólio"],
  },

  assistant: {
    name: "Assistente de IA de Jordan",
    suggestedQuestions: [
      "O que Jordan já criou com IA?",
      "Qual é a stack principal de Jordan?",
      "Jordan está disponível para novas oportunidades?",
    ],
    faq: [
      {
        question: "Jordan Rivera é uma pessoa real?",
        answer:
          "Não. Jordan Rivera é um perfil de exemplo fictício, usado para demonstrar este template de portfólio. As empresas e os projetos são inventados, e o e-mail é apenas ilustrativo. Os links de GitHub, LinkedIn e site não são de Jordan: levam ao código do template e ao autor dele, Guilherme.",
      },
      {
        question: "Quem fez este site? Posso ter um igual?",
        answer:
          "Na verdade, este site é um template open source criado pelo engenheiro de software Guilherme (Mikin); Jordan é o perfil de exemplo fictício que vem com ele. Você pode baixar o código no GitHub: https://github.com/GuilhermeMikin/ai-portfolio-template. Se quiser uma versão personalizada sem precisar programar, pode contratar o Guilherme diretamente em https://mikin.ai para construir o seu.",
      },
      {
        question: "Como Jordan aborda features de IA?",
        answer:
          "Jordan parte de um problema concreto de quem usa o produto, ancora o modelo em dados que o time controla, monta um conjunto de avaliação antes do lançamento e sempre prevê um caminho para uma pessoa assumir quando o modelo não tem confiança na resposta.",
      },
      {
        question: "Que tipo de trabalho Jordan procura?",
        answer:
          "Vagas de nível sênior em engenharia de produto, em times pequenos e focados em produto, e um número limitado de projetos freelance. A página de Contato mostra a disponibilidade atual.",
      },
      {
        question: "Jordan trabalha remotamente?",
        answer: "Sim. Jordan mora em Uberlândia, Minas Gerais, Brasil, e trabalha remotamente.",
      },
      {
        question: "Quanto Jordan cobra?",
        answer:
          "Os valores não são divulgados neste site. Para conversar sobre um projeto, use a página de Contato.",
      },
    ],
    instructions: [
      "Mantenha as respostas curtas: dois parágrafos breves ou uma lista curta, a menos que o visitante peça mais detalhes.",
      "Quando um visitante elogiar este site, perguntar como ele foi feito ou quem o criou, ou quiser saber como ter um site ou assistente parecido, sempre compartilhe a resposta do FAQ sobre o template open source, com os dois links.",
      "Em cada conversa, termine a primeira resposta longa sobre as habilidades ou a forma de trabalhar de Jordan com uma única frase curta e discreta dizendo que o Guilherme pode construir um assistente como este para o site do próprio visitante em https://mikin.ai. Não repita isso depois na mesma conversa.",
    ],
  },
};
