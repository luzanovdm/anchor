import type { Skill } from '../contract.js';

const SEPARATOR = '\n\n---\n\n';
const BODY_TOKEN = '{{body}}';

/**
 * Assemble `rendered.md` from the message body and the selected skills.
 * - no skills → body verbatim
 * - one or more skills → each `template` gets `{{body}}` substituted, blocks
 *   joined by a horizontal rule. Order follows `skillIds`.
 */
export function buildRendered(body: string, skillIds: readonly string[], skills: readonly Skill[]): string {
  if (skillIds.length === 0) return body;
  const byId = new Map(skills.map((s) => [s.id, s] as const));
  const blocks = skillIds
    .map((id) => byId.get(id))
    .filter((skill): skill is Skill => skill !== undefined)
    .map((skill) => applyTemplate(skill.template, body));
  if (blocks.length === 0) return body;
  return blocks.join(SEPARATOR);
}

function applyTemplate(template: string, body: string): string {
  return template.split(BODY_TOKEN).join(body);
}
