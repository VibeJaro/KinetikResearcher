import type { Experiment } from "../../types/experiment";
import { ONTOLOGY_CATEGORIES } from "./categories";
import type { ExperimentComment } from "./types";

const sanitizeComment = (value: string): string => value.replace(/\s+/g, " ").trim();

export const buildCommentText = (
  experiment: Experiment,
  comments: ExperimentComment[]
): string => {
  const lines = comments
    .map((entry) => `${entry.key}: ${sanitizeComment(entry.value)}`)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return "Keine Kommentare gefunden. Nur Metadaten stehen zur Verfügung.";
  }

  return [
    `Experiment ${experiment.name ?? experiment.experimentId} · ${experiment.experimentId}`,
    ...lines
  ].join("\n");
};

export const buildDeviationPrompt = ({
  experiment,
  comments,
  categories = ONTOLOGY_CATEGORIES
}: {
  experiment: Experiment;
  comments: ExperimentComment[];
  categories?: readonly string[];
}) => {
  const categoryList = categories.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const commentText = buildCommentText(experiment, comments);

  const system = [
    "Du bist ein QA-Assistent für Kinetik-Experimente.",
    "Ordne Hinweise aus Kommentaren genau einer der vorgegebenen Ontologie-Kategorien zu.",
    "Gib maximal 3 Kategorien zurück, nur aus der Liste – keine Freiform-Kategorien.",
    "Antworte immer als JSON-Objekt mit den Feldern experimentId, summary und categories[].",
    "categories[].schema: category (string), severity (low|medium|high), rationale (string), sourceColumns (string[])."
  ].join(" ");

  const user = [
    `Experiment-ID: ${experiment.experimentId}`,
    experiment.name ? `Experiment-Name: ${experiment.name}` : null,
    "Kommentare und Hinweise:",
    commentText,
    "Erlaubte Ontologie-Kategorien (genau diese 10, nichts anderes):",
    categoryList,
    "Aufgabe:",
    "- Identifiziere maximal 3 Kategorien, die zu den Kommentaren passen.",
    "- Nutze severity = low/medium/high als Einschätzung der Relevanz.",
    "- Füge sourceColumns mit den Spaltennamen hinzu, aus denen du die Kategorie ableitest.",
    "- Wenn nichts passt, liefere ein leeres categories-Array.",
    "Antwortformat (JSON): { experimentId, summary, categories: [{ category, severity, rationale, sourceColumns }] }"
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user, commentText, categories };
};
