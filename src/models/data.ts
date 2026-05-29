/* ============================================================
   MODELO DE DATOS — EDITA AQUÍ TODA TU INFORMACIÓN
   Bilingüe: cada texto visible tiene versión EN y ES.
   El idioma por defecto es inglés.
   ============================================================ */

export type Lang = "en" | "es";
export type I18nText = { en: string; es: string };

export interface SocialLink {
  name: string;
  url: string;
  color: string;
}

export interface ScheduleDay {
  name: I18nText;
  category: "challenge" | "main-a" | "main-b" | "retro";
  game: string;
  subtitle: I18nText;
  logo: string;
  timeStart: string;
  timeEnd: string;
}

export interface GameProject {
  title: string;
  status: "playing" | "completed" | "upcoming";
  cover: string;
  description: I18nText;
}

export interface CreatorProfile {
  displayName: string;
  lairName: I18nText;
  tagline: I18nText;
  bio: I18nText;
  logoStatic: string;
  logoFlame: string;
  banner: string;
  mascot: string;
  languages: string;
  timezone: string;
}

/* ---------- TEXTOS DE INTERFAZ ---------- */
export const UI: Record<string, I18nText> = {
  navSchedule:     { en: "Schedule",    es: "Horario" },
  navAbout:        { en: "About",       es: "Sobre mí" },
  navNowPlaying:   { en: "Now Playing", es: "Jugando ahora" },
  navGames:        { en: "Games",       es: "Juegos" },
  navSocials:      { en: "Socials",     es: "Redes" },
  schedTitle:      { en: "Weekly Schedule", es: "Horario Semanal" },
  aboutTitle:      { en: "About me",        es: "Sobre mí" },
  nowPlayingTitle: { en: "Now Playing",     es: "Jugando ahora" },
  gamesTitle:      { en: "Completed Games", es: "Juegos terminados" },
  socialTitle:     { en: "Follow me",       es: "Sígueme" },
  schedNote:       { en: "* Schedule may vary", es: "* El horario puede variar" },
  noCompletedGames:{ en: "Completed games will appear here.", es: "Los juegos terminados aparecerán aquí." },
  footer:          { en: "Jotun's Lair", es: "La Guarida de Jotun" },
};

/* ---------- PERFIL ---------- */
export const PROFILE: CreatorProfile = {
  displayName: "Leo Nifelheim",
  lairName: { en: "Jotun's Lair", es: "La Guarida de Jotun" },
  tagline: {
    en: "JRPG / RPG  \u25C6  ENG / ESP  \u25C6  Chat-driven playthroughs",
    es: "JRPG / RPG  \u25C6  ENG / ESP  \u25C6  Partidas decididas por el chat",
  },
  bio: {
    en: "RPG and JRPG streamer. Epic adventures decided by chat, impossible " +
        "challenge runs and forgotten retro gems. Welcome to the wolf's den.",
    es: "Streamer de RPGs y JRPGs. Aventuras \u00e9picas decididas por el chat, " +
        "challenge runs imposibles y joyas retro olvidadas. Bienvenido a la guarida del lobo.",
  },
  logoStatic: "/img/logo-static.png",
  logoFlame:  "/img/logo-flame.gif",
  banner:     "/img/banner.png",
  mascot:     "/img/jotun-happy.gif",
  languages: "English / Espa\u00f1ol",
  timezone: "UTC+2 / CET",
};

/* ---------- REDES SOCIALES ---------- */
export const SOCIALS: SocialLink[] = [
  { name: "Twitch",    url: "https://twitch.tv/leonifelheim",     color: "#9146ff" },
  { name: "YouTube",   url: "https://youtube.com/@leonifelheim",  color: "#ff0000" },
  { name: "Discord",   url: "https://discord.gg/tuservidor",      color: "#5865f2" },
  { name: "Twitter/X", url: "https://x.com/leonifelheim",         color: "#1da1f2" },
  { name: "Instagram", url: "https://instagram.com/leonifelheim", color: "#e1306c" },
  { name: "TikTok",    url: "https://tiktok.com/@leonifelheim",   color: "#00f2ea" },
];

/* ---------- HORARIO SEMANAL ---------- */
export const SCHEDULE: ScheduleDay[] = [
  { name: { en: "Monday",    es: "Lunes" },     category: "challenge", game: "Final Fantasy IX", subtitle: { en: "Lv.1 Challenge Run", es: "Reto Nivel 1" },   logo: "/img/logos/ff9.png",  timeStart: "19:00", timeEnd: "22:00" },
  { name: { en: "Tuesday",   es: "Martes" },    category: "main-a",    game: "Persona 5 Royal",  subtitle: { en: "Persona 5 Royal",   es: "Persona 5 Royal" }, logo: "/img/logos/p5r.png",  timeStart: "19:00", timeEnd: "22:00" },
  { name: { en: "Wednesday", es: "Mi\u00e9rcoles" }, category: "main-a", game: "Persona 5 Royal", subtitle: { en: "Persona 5 Royal", es: "Persona 5 Royal" }, logo: "/img/logos/p5r.png",  timeStart: "19:00", timeEnd: "22:00" },
  { name: { en: "Thursday",  es: "Jueves" },    category: "main-b",    game: "Baldur's Gate 3",  subtitle: { en: "Baldur's Gate 3",   es: "Baldur's Gate 3" }, logo: "/img/logos/bg3.png",  timeStart: "19:00", timeEnd: "22:00" },
  { name: { en: "Friday",    es: "Viernes" },   category: "main-b",    game: "Baldur's Gate 3",  subtitle: { en: "Baldur's Gate 3",   es: "Baldur's Gate 3" }, logo: "/img/logos/bg3.png",  timeStart: "19:00", timeEnd: "22:00" },
  { name: { en: "Saturday",  es: "S\u00e1bado" }, category: "retro",   game: "Zwei",             subtitle: { en: "Zwei! The Arges Adventure", es: "Zwei! The Arges Adventure" }, logo: "/img/logos/zwei.png", timeStart: "19:00", timeEnd: "22:00" },
  { name: { en: "Sunday",    es: "Domingo" },   category: "retro",     game: "Zwei",             subtitle: { en: "Zwei! The Arges Adventure", es: "Zwei! The Arges Adventure" }, logo: "/img/logos/zwei.png", timeStart: "19:00", timeEnd: "22:00" },
];

/* ---------- JUEGOS / PROYECTOS ----------
   status:
   - "playing"   => aparece en Now Playing
   - "completed" => aparece en Games
   - "upcoming"  => reservado para una futura sección si la quieres
   ---------- */
export const GAMES: GameProject[] = [
  /* ---------- NOW PLAYING ---------- */
  {
    title: "Final Fantasy IX",
    status: "playing",
    cover: "/img/logos/ff9.png",
    description: {
      en: "Level 1 challenge run with Moguri Mod and Beatrix in the team.",
      es: "Challenge run a nivel 1 con Moguri Mod y Beatrix en el equipo."
    }
  },
  {
    title: "Persona 5 Royal",
    status: "playing",
    cover: "/img/logos/p5r.png",
    description: {
      en: "Stealing hearts in the Metaverse.",
      es: "Robando corazones en el Metaverso."
    }
  },
  {
    title: "Baldur's Gate 3",
    status: "playing",
    cover: "/img/logos/bg3.png",
    description: {
      en: "Campaign decided by chat.",
      es: "Campaña decidida por el chat."
    }
  },
  {
    title: "Zwei",
    status: "playing",
    cover: "/img/logos/zwei.png",
    description: {
      en: "Retro action and exploration gem.",
      es: "Joya retro de acción y exploración."
    }
  },

  /* ---------- COMPLETED GAMES ---------- */
  {
    title: "Romancing SaGa: Minstrel Song Remastered",
    status: "completed",
    cover: "/img/logos/romancing-saga-minstrel-song.png",
    description: {
      en: "Completed JRPG playthrough.",
      es: "JRPG terminado en directo."
    }
  },
  {
    title: "Tales of Arise",
    status: "completed",
    cover: "/img/logos/tales-of-arise.png",
    description: {
      en: "Completed action RPG playthrough.",
      es: "Action RPG terminado en directo."
    }
  },
  {
    title: "Metaphor: ReFantazio",
    status: "completed",
    cover: "/img/logos/metaphor-refantazio.png",
    description: {
      en: "Completed fantasy RPG playthrough.",
      es: "RPG de fantasía terminado en directo."
    }
  },
  {
    title: "Persona 4 Golden",
    status: "completed",
    cover: "/img/logos/persona-4-golden.png",
    description: {
      en: "Completed Persona playthrough.",
      es: "Persona terminado en directo."
    }
  },
  {
    title: "Persona 3 Reload",
    status: "completed",
    cover: "/img/logos/persona-3-reload.png",
    description: {
      en: "Completed Persona playthrough.",
      es: "Persona terminado en directo."
    }
  },
  {
    title: "Final Fantasy X - No Sphere Grid / No Customization",
    status: "completed",
    cover: "/img/logos/ff10-nsgnc.png",
    description: {
      en: "Completed challenge run: No Sphere Grid and No Customization.",
      es: "Challenge run terminada: sin tablero de esferas y sin personalización."
    }
  },
  {
    title: "Final Fantasy VII - No Shops / Fixed Party",
    status: "completed",
    cover: "/img/logos/ff7-no-shop-fixed-party.png",
    description: {
      en: "Completed challenge run with Cloud, Tifa and Yuffie. No shops, fixed party.",
      es: "Challenge run terminada con Cloud, Tifa y Yuffie. Sin tiendas y party fija."
    }
  },
  {
    title: "Yakuza: Like a Dragon",
    status: "completed",
    cover: "/img/logos/yakuza-like-a-dragon.png",
    description: {
      en: "Completed RPG playthrough.",
      es: "RPG terminado en directo."
    }
  },
  {
    title: "Dragon Quest III HD-2D Remake",
    status: "completed",
    cover: "/img/logos/dragon-quest-3-hd-2d.png",
    description: {
      en: "Completed classic JRPG playthrough.",
      es: "JRPG clásico terminado en directo."
    }
  },
  {
    title: "Legend of Mana",
    status: "completed",
    cover: "/img/logos/legend-of-mana.png",
    description: {
      en: "Completed retro JRPG playthrough.",
      es: "JRPG retro terminado en directo."
    }
  },
  {
    title: "La Pucelle: Ragnarok",
    status: "completed",
    cover: "/img/logos/la-pucelle-ragnarok.png",
    description: {
      en: "Completed tactical RPG playthrough.",
      es: "RPG táctico terminado en directo."
    }
  },
  {
    title: "Phantom Brave",
    status: "completed",
    cover: "/img/logos/phantom-brave.png",
    description: {
      en: "Completed NIS tactical RPG playthrough.",
      es: "RPG táctico de NIS terminado en directo."
    }
  },
  {
    title: "Phantom Brave: The Hermuda Triangle",
    status: "completed",
    cover: "/img/logos/phantom-brave-hermuda-triangle.png",
    description: {
      en: "Completed NIS tactical RPG playthrough.",
      es: "RPG táctico de NIS terminado en directo."
    }
  },
  {
    title: "Phantom Brave: The Lost Hero",
    status: "completed",
    cover: "/img/logos/phantom-brave-the-lost-hero.png",
    description: {
      en: "Completed NIS tactical RPG playthrough.",
      es: "RPG táctico de NIS terminado en directo."
    }
  },
  {
    title: "Makai Kingdom",
    status: "completed",
    cover: "/img/logos/makai-kingdom.png",
    description: {
      en: "Completed NIS tactical RPG playthrough.",
      es: "RPG táctico de NIS terminado en directo."
    }
  },
  {
    title: "Rhapsody: A Musical Adventure",
    status: "completed",
    cover: "/img/logos/rhapsody-a-musical-adventure.png",
    description: {
      en: "Completed musical JRPG playthrough.",
      es: "JRPG musical terminado en directo."
    }
  },
  {
    title: "Chrono Trigger",
    status: "completed",
    cover: "/img/logos/chrono-trigger.png",
    description: {
      en: "Completed classic JRPG playthrough.",
      es: "JRPG clásico terminado en directo."
    }
  },
  {
    title: "Monster Hunter Stories",
    status: "completed",
    cover: "/img/logos/monster-hunter-stories.png",
    description: {
      en: "Completed monster-collecting RPG playthrough.",
      es: "RPG de monstruos terminado en directo."
    }
  },
  {
    title: "Monster Hunter Stories 2: Wings of Ruin",
    status: "completed",
    cover: "/img/logos/monster-hunter-stories-2.png",
    description: {
      en: "Completed monster-collecting RPG playthrough.",
      es: "RPG de monstruos terminado en directo."
    }
  },
  {
    title: "Monster Hunter Wilds",
    status: "completed",
    cover: "/img/logos/monster-hunter-wilds.png",
    description: {
      en: "Completed hunting action RPG playthrough.",
      es: "Action RPG de caza terminado en directo."
    }
  },
  {
    title: "Final Fantasy XVI",
    status: "completed",
    cover: "/img/logos/ff16.png",
    description: {
      en: "Completed Final Fantasy action RPG playthrough.",
      es: "Final Fantasy de acción terminado en directo."
    }
  },
  {
    title: "Final Fantasy IX",
    status: "completed",
    cover: "/img/logos/ff9.png",
    description: {
      en: "Completed classic Final Fantasy playthrough.",
      es: "Final Fantasy clásico terminado en directo."
    }
  },
  {
    title: "Final Fantasy X / X-2 HD Remaster",
    status: "completed",
    cover: "/img/logos/ff10-x2-hd.png",
    description: {
      en: "Completed Final Fantasy HD remaster playthrough.",
      es: "Remaster HD de Final Fantasy terminado en directo."
    }
  },
  {
    title: ".hack//G.U. Last Recode",
    status: "completed",
    cover: "/img/logos/hack-gu-last-recode.png",
    description: {
      en: "Completed the full .hack//G.U. saga.",
      es: "Saga completa de .hack//G.U. terminada en directo."
    }
  }
];



/* ============================================================
   PORTFOLIO PROFESIONAL (ruta /portfolio)
   Para entrevistas y CV. Edita aquí tu info de desarrollador.
   ============================================================ */

export interface DevProject {
  title: string;
  description: I18nText;
  tech: string[];           // stack del proyecto
  repo?: string;            // enlace al repositorio (opcional)
  demo?: string;            // enlace a la demo (opcional)
}

export interface DevProfile {
  fullName: string;
  role: I18nText;
  intro: I18nText;
  email: string;
  github: string;
  linkedin: string;
}

export const DEV_PROFILE: DevProfile = {
  fullName: "Eric Millán Rodríguez",
  role: { en: "Fullstack Developer", es: "Desarrollador Fullstack" },
  intro: {
    en: "Fullstack developer who likes building real products end to end — " +
        "from data modelling and backend APIs to polished, responsive frontends.",
    es: "Desarrollador fullstack al que le gusta construir productos reales de " +
        "principio a fin — del modelado de datos y las APIs de backend a frontends " +
        "cuidados y responsive.",
  },
  email: "tucorreo@ejemplo.com",
  github: "https://github.com/emillandeveloper",
  linkedin: "https://linkedin.com/in/tu-perfil",
};

/* Stack técnico — agrúpalo como quieras */
export const TECH_STACK: Record<string, string[]> = {
  "Backend":      ["Node.js", "Express", "Python", "FastAPI", "PHP"],
  "Frontend":     ["TypeScript", "JavaScript", "React", "Next.js", "EJS"],
  "Databases":    ["PostgreSQL", "MySQL", "Oracle", "Prisma ORM"],
  "Integrations": ["REST APIs", "SOAP", "SFTP", "Oracle ERP", "SAP ABAP"],
  "AI / LLM":     ["LLM orchestration", "Intent resolution", "Ollama", "JSON Schema"],
  "Tools":        ["Git", "GitHub", "Linux", "Google Cloud", "Render"],
};

export const DEV_PROJECTS: DevProject[] = [
  {
    title: "Hebe — Local AI Assistant",
    description: {
      en: "Modular AI companion combining natural language understanding with " +
          "real-world system execution, running fully local. Orchestrator-based " +
          "architecture separating intent, policy and execution, with hybrid " +
          "rule + LLM intent resolution and a ~97% accuracy evaluation pipeline.",
      es: "Compañera IA modular que combina comprensión de lenguaje natural con " +
          "ejecución real de acciones del sistema, corriendo totalmente en local. " +
          "Arquitectura basada en orquestador que separa intención, política y " +
          "ejecución, con resolución de intención híbrida (reglas + LLM) y un " +
          "pipeline de evaluación con ~97% de precisión.",
    },
    tech: ["Python", "FastAPI", "LLM", "Ollama", "Architecture"],
    repo: "https://github.com/emillandeveloper/hebe",
  },
  {
    title: "Orders & Integrations Hub",
    description: {
      en: "Full-stack internal platform managing orders, customers, users and " +
          "regions as a central hub for business workflows and system integrations. " +
          "REST APIs, JWT auth with role-based access control, modular backend with " +
          "Prisma ORM and a Next.js admin panel.",
      es: "Plataforma interna full-stack que gestiona pedidos, clientes, usuarios y " +
          "regiones como hub central de flujos de negocio e integraciones. APIs REST, " +
          "autenticación JWT con control de acceso por roles, backend modular con " +
          "Prisma ORM y panel de administración en Next.js.",
    },
    tech: ["Node.js", "TypeScript", "Express", "Prisma", "PostgreSQL", "Next.js"],
    repo: "https://github.com/emillandeveloper/orderintegrationhub",
  },
  {
    title: "Jotun's Lair — Creator Website",
    description: {
      en: "Bilingual creator hub with a lateral slider UI, auto-highlighted " +
          "current stream day and a data-driven content model. This very site.",
      es: "Hub de creador bilingüe con slider lateral, resaltado automático del " +
          "día de stream actual y contenido dirigido por datos. Esta misma web.",
    },
    tech: ["Node.js", "Express", "TypeScript", "EJS", "MVC"],
    repo: "https://github.com/emillandeveloper/creator-website",
    demo: "/",
  },
  {
    title: "Stream Weekly Schedule",
    description: {
      en: "Configurable overlay/panel generator for Twitch. Pixel-art themed, " +
          "data-driven, exports to image and highlights the current day.",
      es: "Generador configurable de panel/overlay para Twitch. Estética pixel-art, " +
          "dirigido por datos, exporta a imagen y resalta el día actual.",
    },
    tech: ["HTML", "CSS", "JavaScript"],
    repo: "https://github.com/emillandeveloper/stream-schedule",
  },
];

/* Textos de interfaz del portfolio */
export const DEV_UI: Record<string, I18nText> = {
  backToHub:    { en: "← Stream Hub", es: "← Stream Hub" },
  projectsTitle:{ en: "Projects",     es: "Proyectos" },
  stackTitle:   { en: "Tech Stack",   es: "Tecnologías" },
  contactTitle: { en: "Contact",      es: "Contacto" },
  viewRepo:     { en: "Code",         es: "Código" },
  viewDemo:     { en: "Live",         es: "Demo" },
};

/* ---------- COLORES Y ETIQUETAS POR CATEGORÍA ---------- */
export const CAT_COLORS: Record<string, string> = {
  "challenge": "#c8920a",
  "main-a":    "#cc3030",
  "main-b":    "#8844cc",
  "retro":     "#3a9aaa",
};
export const CAT_LABELS: Record<string, string> = {
  "challenge": "CHALLENGE",
  "main-a":    "MAIN A",
  "main-b":    "MAIN B",
  "retro":     "RETRO",
};

