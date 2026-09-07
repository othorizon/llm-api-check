import { describe, expect, it } from "vitest";
import { validateSchema } from "@/lib/caps/schema-validate";
import { orderSchema, personSchema } from "@/lib/caps/tests/structured";
import { parseJsonLenient } from "@/lib/caps/helpers";

describe("schema validator", () => {
  it("accepts a valid person and rejects extras/missing", () => {
    const ok = { name: "A", age: 3, email: "a@b", is_active: true, tags: ["x"] };
    expect(validateSchema(ok, personSchema(true))).toEqual([]);
    expect(validateSchema({ ...ok, extra: 1 }, personSchema(true)).map((e) => e.path)).toEqual(["$.extra"]);
    expect(validateSchema({ ...ok, age: "3" }, personSchema(true))[0].message).toMatch(/expected type integer/);
    const { tags: _t, ...missing } = ok;
    void _t;
    expect(validateSchema(missing, personSchema(true))[0].path).toBe("$.tags");
  });
  it("validates the nested order schema with anyOf null", () => {
    const order = { order_id: "ORD-1", status: "paid", customer: { name: "B", address: { city: "X", country: "Y", postal_code: null } }, items: [{ sku: "A", quantity: 1, unit_price: 2.5 }], notes: null };
    expect(validateSchema(order, orderSchema)).toEqual([]);
    expect(validateSchema({ ...order, status: "lost" }, orderSchema)[0].path).toBe("$.status");
    expect(validateSchema({ ...order, items: [{ sku: "A", quantity: 1.5, unit_price: 2 }] }, orderSchema)[0].path).toBe("$.items[0].quantity");
  });
});

describe("parseJsonLenient", () => {
  it("handles exact, fenced and embedded JSON", () => {
    expect(parseJsonLenient('{"a":1}')).toEqual({ value: { a: 1 }, fenced: false, exact: true });
    expect(parseJsonLenient('```json\n{"a":1}\n```')?.fenced).toBe(true);
    expect(parseJsonLenient('Sure: {"a":1} done')?.exact).toBe(false);
    expect(parseJsonLenient("nope")).toBeNull();
  });
});
