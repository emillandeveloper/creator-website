import { I18nText } from "./data";

export interface ChallengeDetails {
  slug: string;
  gameTitle: string;
  format: I18nText;
  rules: I18nText[];
  outcome: I18nText;
}

// Only rules documented for Leo's runs belong here. Dates, records and videos
// can be added later when available; they are not inferred from the game.
export const CHALLENGES: ChallengeDetails[] = [
  {
    slug: "ff7-randomizer",
    gameTitle: "Final Fantasy VII — Randomizer",
    format: { en: "Randomizer", es: "Randomizer" },
    rules: [
      { en: "Items, shops and the materia found during the adventure are randomized.", es: "Se aleatorizan los objetos, las tiendas y las materias que aparecen durante la aventura." },
      { en: "Enemy encounters and bosses are randomized too.", es: "Los encuentros con enemigos y los jefes también están aleatorizados." },
      { en: "Enemy statistics are adjusted for the encounters.", es: "Las estadísticas de los enemigos se adaptan a los encuentros." },
    ],
    outcome: { en: "In progress. Check the weekly schedule to follow the next stream on Twitch.", es: "En curso. Consulta el horario semanal para seguir el próximo directo en Twitch." },
  },
  {
    slug: "ff9-solo-garnet",
    gameTitle: "Final Fantasy IX — Solo Garnet",
    format: { en: "Solo character", es: "Un solo personaje" },
    rules: [
      { en: "Garnet is the only combatant in this challenge run.", es: "Garnet es la única combatiente de este desafío." },
      { en: "The run is built around Garnet's abilities rather than a full fighting party.", es: "La partida se afronta con las habilidades de Garnet en lugar de un equipo completo de combatientes." },
    ],
    outcome: { en: "Challenge completed with Garnet as the only combatant.", es: "Desafío completado con Garnet como única combatiente." },
  },
  {
    slug: "ff5-crystal-roulette-fiesta",
    gameTitle: "Final Fantasy V — Crystal Roulette Fiesta",
    format: { en: "Random jobs / restrictions", es: "Trabajos aleatorios / restricciones" },
    rules: [
      { en: "At each crystal, the roulette assigns a different random job to each character.", es: "En cada cristal, la ruleta asigna un trabajo aleatorio distinto a cada personaje." },
      { en: "Each character must use their assigned job throughout that stage.", es: "Cada personaje debe utilizar el trabajo asignado durante ese tramo." },
      { en: "After escaping Castle Exdeath, each character may combine only their four personal jobs and the abilities from those jobs.", es: "Tras huir del castillo de Exdeath, cada personaje solo puede combinar sus cuatro trabajos personales y las habilidades de esos trabajos." },
      { en: "No rerolls.", es: "No se pueden repetir las tiradas." },
      { en: "Freelancer and Mime are forbidden, except for the initial forced Freelancer stage.", es: "Freelancer y Mime están prohibidos, salvo el tramo inicial obligatorio como Freelancer." },
    ],
    outcome: { en: "Crystal Roulette Fiesta completed under these rules.", es: "Crystal Roulette Fiesta completada con estas reglas." },
  },
  {
    slug: "ff9-level-1",
    gameTitle: "Final Fantasy IX — Lv.1 Challenge Run",
    format: { en: "Level 1", es: "Nivel 1" },
    rules: [
      { en: "Complete the challenge at level 1.", es: "Completar el desafío a nivel 1." },
      { en: "This run used Moguri Mod and included Beatrix in the team.", es: "Esta partida utilizó Moguri Mod e incluyó a Beatrix en el equipo." },
    ],
    outcome: { en: "Level 1 challenge completed.", es: "Desafío de nivel 1 completado." },
  },
  {
    slug: "ff10-no-sphere-grid-no-customization",
    gameTitle: "Final Fantasy X - No Sphere Grid / No Customization",
    format: { en: "NSG / NC", es: "NSG / NC" },
    rules: [
      { en: "No Sphere Grid: do not use the Sphere Grid to develop characters.", es: "No Sphere Grid: no utilizar el tablero de esferas para desarrollar a los personajes." },
      { en: "No Customization: do not customize weapons or armour.", es: "No Customization: no personalizar armas ni armaduras." },
    ],
    outcome: { en: "Completed without the Sphere Grid or equipment customization.", es: "Completado sin tablero de esferas ni personalización del equipo." },
  },
  {
    slug: "ff7-no-shops-fixed-party",
    gameTitle: "Final Fantasy VII - No Shops / Fixed Party",
    format: { en: "No shops / fixed party", es: "Sin tiendas / equipo fijo" },
    rules: [
      { en: "No shops.", es: "No utilizar las tiendas." },
      { en: "The fixed party for the challenge is Cloud, Tifa and Yuffie.", es: "El equipo fijo del desafío está formado por Cloud, Tifa y Yuffie." },
    ],
    outcome: { en: "Challenge completed with Cloud, Tifa and Yuffie, without shops.", es: "Desafío completado con Cloud, Tifa y Yuffie, sin tiendas." },
  },
];

export const CHALLENGE_SLUGS: Record<string, string> = Object.fromEntries(
  CHALLENGES.map((challenge) => [challenge.gameTitle, challenge.slug])
);
