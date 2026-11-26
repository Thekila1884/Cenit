import type { TicketCategoryMap, TicketCategoryOption } from '../types';

const MAX_CATEGORIES = 30;
const MAX_TYPES_PER_CATEGORY = 30;
const MAX_ISSUES_PER_TYPE = 50;
const MAX_LABEL_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateLabel(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LABEL_LENGTH) {
    throw new Error(`${label} debe tener entre 1 y ${MAX_LABEL_LENGTH} caracteres.`);
  }
  return trimmed;
}

function assertUnique(values: string[], label: string) {
  const normalized = values.map((value) => value.trim().toLocaleLowerCase());
  if (new Set(normalized).size !== values.length) {
    throw new Error(`No repitas nombres en ${label}.`);
  }
}

export function parseTicketCategoryMap(value: unknown): TicketCategoryOption[] {
  if (!isRecord(value)) throw new Error('La configuración de categorías no tiene un formato válido.');
  const categories = Object.entries(value).map(([name, rawTypes]) => {
    if (!isRecord(rawTypes)) throw new Error(`La categoría "${name}" no tiene tipos válidos.`);
    const types = Object.entries(rawTypes).map(([typeName, rawIssues]) => {
      if (!Array.isArray(rawIssues) || !rawIssues.every((issue) => typeof issue === 'string')) {
        throw new Error(`Las fallas del tipo "${typeName}" no tienen un formato válido.`);
      }
      return { name: typeName, issues: rawIssues };
    });
    return { name, types };
  });
  validateTicketCategories(categories);
  return categories;
}

export function validateTicketCategories(categories: TicketCategoryOption[]) {
  if (!categories.length || categories.length > MAX_CATEGORIES) {
    throw new Error(`Agrega entre 1 y ${MAX_CATEGORIES} categorías.`);
  }
  const categoryNames = categories.map((category) => validateLabel(category.name, 'El nombre de categoría'));
  assertUnique(categoryNames, 'categorías');

  for (const category of categories) {
    if (!category.types.length || category.types.length > MAX_TYPES_PER_CATEGORY) {
      throw new Error(`La categoría "${category.name}" debe tener entre 1 y ${MAX_TYPES_PER_CATEGORY} tipos.`);
    }
    const typeNames = category.types.map((type) => validateLabel(type.name, 'El nombre de tipo'));
    assertUnique(typeNames, `tipos de "${category.name}"`);

    for (const type of category.types) {
      if (!type.issues.length || type.issues.length > MAX_ISSUES_PER_TYPE) {
        throw new Error(`El tipo "${type.name}" debe tener entre 1 y ${MAX_ISSUES_PER_TYPE} fallas.`);
      }
      const issues = type.issues.map((issue) => validateLabel(issue, 'Cada falla'));
      assertUnique(issues, `fallas de "${type.name}"`);
    }
  }
}

export function ticketCategoriesToMap(categories: TicketCategoryOption[]): TicketCategoryMap {
  return Object.fromEntries(categories.map((category) => [
    category.name,
    Object.fromEntries(category.types.map((type) => [type.name, type.issues])),
  ]));
}

export function ticketCategoriesFromForm(form: HTMLFormElement, current: TicketCategoryOption[]) {
  const data = new FormData(form);
  const categories = current.map((category, categoryIndex) => ({
    name: String(data.get(`category-${categoryIndex}-name`) ?? ''),
    types: category.types.map((_, typeIndex) => ({
      name: String(data.get(`category-${categoryIndex}-type-${typeIndex}-name`) ?? ''),
      issues: String(data.get(`category-${categoryIndex}-type-${typeIndex}-issues`) ?? '')
        .split(/\r?\n/)
        .map((issue) => issue.trim())
        .filter(Boolean),
    })),
  }));
  validateTicketCategories(categories);
  return categories.map((category) => ({
    name: category.name.trim(),
    types: category.types.map((type) => ({
      name: type.name.trim(),
      issues: type.issues.map((issue) => issue.trim()),
    })),
  }));
}
