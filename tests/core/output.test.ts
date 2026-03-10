import { describe, expect, spyOn, test } from "bun:test";
import { createOutput } from "../../src/core/output";

describe("createOutput", () => {
  test("json mode outputs JSON to stdout", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const out = createOutput({ json: true, format: "json" });
    out.data({ symbol: "BTC", price: 65000 });
    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed).toEqual({ symbol: "BTC", price: 65000 });
    spy.mockRestore();
  });

  test("table mode outputs formatted table to stdout", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const out = createOutput({ json: false, format: "table" });
    out.table([{ symbol: "BTC", price: 65000 }], {
      columns: ["symbol", "price"],
    });
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("BTC");
    expect(output).toContain("65000");
    spy.mockRestore();
  });

  test("csv format outputs CSV", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const out = createOutput({ json: false, format: "csv" });
    out.table(
      [
        { symbol: "BTC", price: 65000 },
        { symbol: "ETH", price: 3500 },
      ],
      { columns: ["symbol", "price"] },
    );
    const output = spy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("symbol,price");
    expect(output).toContain("BTC,65000");
    spy.mockRestore();
  });

  test("success prints success message", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const out = createOutput({ json: false, format: "table" });
    out.success("Done!");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("Done!");
    spy.mockRestore();
  });
});
