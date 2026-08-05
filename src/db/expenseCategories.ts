import { getDb } from "./client";

export interface ExpenseCategoryRecord {
  id: number;
  name: string;
}

export class CategoryInUseError extends Error {
  constructor(public count: number) {
    super(`Category is used by ${count} expense(s)`);
  }
}

export async function listExpenseCategories(): Promise<ExpenseCategoryRecord[]> {
  const db = await getDb();
  return db.select<ExpenseCategoryRecord[]>(
    "SELECT id, name FROM expense_categories ORDER BY name",
  );
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategoryRecord> {
  const db = await getDb();
  const trimmed = name.trim();
  const result = await db.execute("INSERT INTO expense_categories (name) VALUES ($1)", [trimmed]);
  return { id: result.lastInsertId!, name: trimmed };
}

export async function renameExpenseCategory(id: number, name: string): Promise<void> {
  const db = await getDb();
  const trimmed = name.trim();
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM expense_categories WHERE id = $1",
    [id],
  );
  if (rows.length === 0) throw new Error("Category not found");
  const oldName = rows[0].name;
  await db.execute("UPDATE expense_categories SET name = $1 WHERE id = $2", [trimmed, id]);
  if (oldName !== trimmed) {
    await db.execute("UPDATE expenses SET category = $1 WHERE category = $2", [trimmed, oldName]);
  }
}

/** Throws CategoryInUseError if any expense still references this category. */
export async function deleteExpenseCategory(id: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM expense_categories WHERE id = $1",
    [id],
  );
  if (rows.length === 0) return;
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM expenses WHERE category = $1",
    [rows[0].name],
  );
  if (count > 0) throw new CategoryInUseError(count);
  await db.execute("DELETE FROM expense_categories WHERE id = $1", [id]);
}
