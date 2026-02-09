import { compileExpression, useDotAccessOperator } from "filtrex";

export function compileGuard(
  expr: string,
): (ctx: Record<string, unknown>, marking: Record<string, number>) => boolean {
  const fn = compileExpression(expr, { customProp: useDotAccessOperator });
  return (ctx, marking) => Boolean(fn({ ...ctx, marking }));
}
