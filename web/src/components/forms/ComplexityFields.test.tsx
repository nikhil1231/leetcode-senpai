import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ComplexityFields } from "./ComplexityFields";

function Harness() {
  const [t, setT] = useState(""), [s, setS] = useState("");
  return <><ComplexityFields idPrefix="x" time={t} space={s} onTime={setT} onSpace={setS} /><output data-testid="out">{t}|{s}</output></>;
}

describe("ComplexityFields", () => {
  it("fills a field from a preset", () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByText("O(n)")[0]);
    expect(screen.getByTestId("out").textContent).toBe("O(n)|");
    fireEvent.click(screen.getAllByText("O(1)")[1]);
    expect(screen.getByTestId("out").textContent).toBe("O(n)|O(1)");
  });
  it("takes typed input and disables presets with the field", () => {
    const { rerender } = render(<ComplexityFields idPrefix="y" time="" space="" onTime={() => {}} onSpace={() => {}} disabled />);
    expect((screen.getByLabelText("Time") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getAllByText("O(n)")[0] as HTMLButtonElement).disabled).toBe(true);
    rerender(<ComplexityFields idPrefix="y" time="O(n + m)" space="" onTime={() => {}} onSpace={() => {}} />);
    expect((screen.getByLabelText("Time") as HTMLInputElement).value).toBe("O(n + m)");
  });
});
