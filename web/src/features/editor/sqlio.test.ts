import { describe, expect, it } from "vitest";
import { addRow, completionSchema, extraRows, formatCases, parseAnswer, parseCase, parseCases, parseCell, removeRow, setCell } from "./sqlio";

const CASE = '{"headers":{"Person":["personId","lastName","firstName"],"Address":["addressId","personId","city"]},"rows":{"Person":[[1,"Wang","Allen"],[2,"Alice","Bob"]],"Address":[[1,2,"New York City"]]}}';
const SCHEMA = { Person: { personId: "INT", lastName: "VARCHAR(255)", firstName: "VARCHAR(255)" } };

describe("sql test cases", () => {
  it("round-trips LeetCode's case JSON exactly", () => {
    const cases = parseCases(`${CASE}\n\n${CASE}`)!;
    expect(cases).toHaveLength(2);
    expect(formatCases(cases)).toBe(`${CASE}\n${CASE}`);
  });

  it("gives up on a box that isn't all tables, so it's edited as text", () => {
    expect(parseCases(`${CASE}\n[1,2]`)).toBeNull();
    expect(parseCase("not json")).toBeNull();
    expect(parseCase('{"headers":{"T":"x"},"rows":{}}')).toBeNull();
  });

  it("types a cell by its column", () => {
    expect(parseCell("7", "INT")).toBe(7);
    expect(parseCell("7", "VARCHAR(10)")).toBe("7");
    expect(parseCell("NULL", "VARCHAR(10)")).toBeNull();
    expect(parseCell("2.50", "DECIMAL(10,2)")).toBe(2.5);
    expect(parseCell("2019-01-01", "DATE")).toBe("2019-01-01");
    expect(parseCell("12")).toBe(12);
    expect(parseCell("abc", "INT")).toBe("abc");
  });

  it("adds a row with the next id, sets a cell and removes a row", () => {
    let t = parseCase(CASE)!;
    t = addRow(t, "Person", SCHEMA);
    expect(t.rows.Person[2]).toEqual([3, "", ""]);
    t = setCell(t, "Person", 2, 2, "Cleo");
    expect(t.rows.Person[2]).toEqual([3, "", "Cleo"]);
    t = removeRow(t, "Person", 0);
    expect(t.rows.Person.map((r) => r[0])).toEqual([2, 3]);
    expect(parseCase(CASE)!.rows.Person).toHaveLength(2);   // the original is untouched
  });

  it("reads an answer and marks rows the expected answer doesn't have", () => {
    const got = parseAnswer('{"headers":["id"],"values":[[1],[2],[2]]}')!;
    const want = parseAnswer('{"headers":["id"],"values":[[2],[1]]}');
    expect(extraRows(got, want)).toEqual([false, false, true]);
    expect(parseAnswer("[0,1]")).toBeNull();
    expect(parseAnswer('{"headers":["a"]}')!.values).toEqual([]);
  });

  it("builds the completion schema from the schema, then the cases", () => {
    expect(completionSchema(SCHEMA, [parseCase(CASE)!])).toEqual({
      Person: ["personId", "lastName", "firstName"], Address: ["addressId", "personId", "city"] });
  });
});
